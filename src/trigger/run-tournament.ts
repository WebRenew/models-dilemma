import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

const SCENARIOS = ["overt", "sales", "research", "creator"] as const;
type Scenario = (typeof SCENARIOS)[number];

const GAMES_PER_BATCH = 100;

// Create Supabase client for checking running matches
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error("Missing Supabase credentials");
  }
  
  return createClient(url, key);
}

// Check if there are any running matches
async function hasRunningMatches(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "running")
      .limit(1);
    
    if (error) {
      logger.warn("Error checking running matches", { error: error.message });
      return false; // Assume no running matches if we can't check
    }
    
    return (data?.length || 0) > 0;
  } catch (error) {
    logger.warn("Error checking running matches", { error: String(error) });
    return false;
  }
}

// Scheduled task that runs every 4 hours
export const scheduledTournament = schedules.task({
  id: "scheduled-tournament",
  cron: "0 */4 * * *", // Every 4 hours
  maxDuration: 7200, // 2 hours max
  run: async () => {
    logger.info("Scheduled tournament check started");

    // Check if previous games are still running
    const running = await hasRunningMatches();
    if (running) {
      logger.info("Previous games still running, skipping this batch");
      return {
        skipped: true,
        reason: "Previous games still running",
      };
    }

    logger.info(`Starting batch of ${GAMES_PER_BATCH} games`);

    // Get API base URL - APP_URL must be set in Trigger.dev environment variables
    const baseUrl = process.env.APP_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null);
    
    if (!baseUrl) {
      logger.error("APP_URL environment variable not set in Trigger.dev");
      return {
        skipped: true,
        reason: "APP_URL not configured - add your Vercel URL to Trigger.dev env vars",
      };
    }

    const results: {
      success: boolean;
      scenario: Scenario;
      matchId?: string;
      error?: string;
    }[] = [];

    // Track scenario distribution
    const scenarioCounts: Record<Scenario, number> = {
      overt: 0,
      sales: 0,
      research: 0,
      creator: 0,
    };

    // Run 100 games with balanced scenarios (25 each)
    const gamesPerScenario = Math.floor(GAMES_PER_BATCH / SCENARIOS.length);

    for (let i = 0; i < GAMES_PER_BATCH; i++) {
      // Pick scenario with lowest count for balance
      const scenario = SCENARIOS.reduce((min, s) => 
        scenarioCounts[s] < scenarioCounts[min] ? s : min
      , SCENARIOS[0]);

      // Stop if all scenarios have enough games
      if (scenarioCounts[scenario] >= gamesPerScenario) {
        break;
      }

      logger.info(`Running game ${i + 1}/${GAMES_PER_BATCH}`, { scenario });

      try {
        const response = await fetch(`${baseUrl}/api/run-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            framing: scenario === "overt" ? "overt" : "cloaked",
            scenario: scenario === "overt" ? undefined : scenario,
            totalRounds: 10,
            saveToDb: true,
            streamRounds: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse SSE response to get result
        const text = await response.text();
        const lines = text.split("\n\n");
        
        let matchComplete = false;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "complete") {
                results.push({
                  success: true,
                  scenario,
                  matchId: event.gameId,
                });
                scenarioCounts[scenario]++;
                matchComplete = true;
                
                logger.info(`Game ${i + 1} complete`, {
                  matchId: event.gameId,
                  modelA: event.modelAName,
                  modelB: event.modelBName,
                  score: `${event.scoreA}-${event.scoreB}`,
                });
                break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        if (!matchComplete) {
          throw new Error("No completion event received");
        }
      } catch (error) {
        logger.error(`Game ${i + 1} failed`, { error: String(error), scenario });
        results.push({
          success: false,
          scenario,
          error: String(error),
        });
        // Still count it to avoid infinite loops
        scenarioCounts[scenario]++;
      }

      // Small delay between games to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info("Batch complete", {
      total: results.length,
      successful,
      failed,
      scenarioCounts,
    });

    return {
      skipped: false,
      total: results.length,
      successful,
      failed,
      scenarioCounts,
    };
  },
});

// Manual trigger task (can be called on-demand)
export const runTournamentTask = task({
  id: "run-tournament",
  maxDuration: 7200, // 2 hours
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: { games?: number; skipRunningCheck?: boolean }) => {
    const gamesToRun = payload.games || GAMES_PER_BATCH;
    
    logger.info("Manual tournament started", { gamesToRun });

    // Check if previous games are still running (unless skipped)
    if (!payload.skipRunningCheck) {
      const running = await hasRunningMatches();
      if (running) {
        logger.info("Previous games still running, aborting");
        return {
          skipped: true,
          reason: "Previous games still running",
        };
      }
    }

    // Get API base URL - APP_URL must be set in Trigger.dev environment variables
    const baseUrl = process.env.APP_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null);
    
    if (!baseUrl) {
      logger.error("APP_URL environment variable not set in Trigger.dev");
      return {
        skipped: true,
        reason: "APP_URL not configured - add your Vercel URL to Trigger.dev env vars",
      };
    }

    const scenarioCounts: Record<Scenario, number> = {
      overt: 0,
      sales: 0,
      research: 0,
      creator: 0,
    };

    let successful = 0;
    let failed = 0;
    const gamesPerScenario = Math.floor(gamesToRun / SCENARIOS.length);

    for (let i = 0; i < gamesToRun; i++) {
      const scenario = SCENARIOS.reduce((min, s) => 
        scenarioCounts[s] < scenarioCounts[min] ? s : min
      , SCENARIOS[0]);

      if (scenarioCounts[scenario] >= gamesPerScenario) {
        break;
      }

      logger.info(`Running game ${i + 1}/${gamesToRun}`, { scenario });

      try {
        const response = await fetch(`${baseUrl}/api/run-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            framing: scenario === "overt" ? "overt" : "cloaked",
            scenario: scenario === "overt" ? undefined : scenario,
            totalRounds: 10,
            saveToDb: true,
            streamRounds: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        const lines = text.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "complete") {
                scenarioCounts[scenario]++;
                successful++;
                logger.info(`Game complete`, { matchId: event.gameId });
                break;
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch (error) {
        logger.error(`Game failed`, { error: String(error) });
        scenarioCounts[scenario]++;
        failed++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info("Tournament complete", { successful, failed, scenarioCounts });

    return {
      skipped: false,
      successful,
      failed,
      scenarioCounts,
    };
  },
});
