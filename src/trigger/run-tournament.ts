import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

const SCENARIOS = ["overt", "sales", "research", "creator"] as const;
type Scenario = (typeof SCENARIOS)[number];

// Timing configuration
const DELAY_BETWEEN_GAMES_MS = 45_000; // 45 seconds between games
const STREAMER_DURATION_HOURS = 4; // Run for 4 hours before next cron takes over
const STREAMER_DURATION_MS = STREAMER_DURATION_HOURS * 60 * 60 * 1000;

// Create Supabase client
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error("Missing Supabase credentials");
  }
  
  return createClient(url, key);
}

// Check if there's an active streamer running
async function isStreamerActive(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("streamer_state")
      .select("*")
      .eq("id", "singleton")
      .single();
    
    if (error || !data) {
      return false;
    }
    
    // Check if streamer is active and not stale (started within last 4.5 hours)
    const startedAt = new Date(data.started_at).getTime();
    const now = Date.now();
    const maxAge = 4.5 * 60 * 60 * 1000; // 4.5 hours
    
    return data.is_active && (now - startedAt) < maxAge;
  } catch {
    return false;
  }
}

// Set streamer state
async function setStreamerState(isActive: boolean, runId?: string): Promise<void> {
  const supabase = getSupabaseClient();
  
  await supabase
    .from("streamer_state")
    .upsert({
      id: "singleton",
      is_active: isActive,
      run_id: runId || null,
      started_at: isActive ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
}

// Get API base URL
function getBaseUrl(): string | null {
  return process.env.APP_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null);
}

// Run a single game
async function runSingleGame(baseUrl: string, scenario: Scenario): Promise<{
  success: boolean;
  matchId?: string;
  modelA?: string;
  modelB?: string;
  scoreA?: number;
  scoreB?: number;
  error?: string;
}> {
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

    const text = await response.text();
    const lines = text.split("\n\n");
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "complete") {
            return {
              success: true,
              matchId: event.gameId,
              modelA: event.modelAName,
              modelB: event.modelBName,
              scoreA: event.scoreA,
              scoreB: event.scoreB,
            };
          }
          if (event.type === "error") {
            return {
              success: false,
              error: event.error || "Match error",
            };
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return { success: false, error: "No completion event received" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Continuous streamer - runs games with 45s delays for ~4 hours
export const continuousStreamer = schedules.task({
  id: "continuous-streamer",
  cron: "0 */4 * * *", // Every 4 hours
  maxDuration: 14400, // 4 hours max
  run: async () => {
    const runId = crypto.randomUUID();
    
    logger.info("Continuous streamer starting", { runId });

    // Check if another streamer is already running
    const alreadyActive = await isStreamerActive();
    if (alreadyActive) {
      logger.info("Another streamer is already active, skipping");
      return {
        skipped: true,
        reason: "Another streamer is already running",
      };
    }

    // Get API base URL
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      logger.error("APP_URL not configured");
      return {
        skipped: true,
        reason: "APP_URL not configured",
      };
    }

    // Mark streamer as active
    await setStreamerState(true, runId);
    logger.info("Streamer activated", { baseUrl, runId });

    const startTime = Date.now();
    let gamesPlayed = 0;
    let successful = 0;
    let failed = 0;
    
    // Track scenario distribution for balanced play
    const scenarioCounts: Record<Scenario, number> = {
      overt: 0,
      sales: 0,
      research: 0,
      creator: 0,
    };

    try {
      // Run games until duration expires
      while (Date.now() - startTime < STREAMER_DURATION_MS) {
        // Pick scenario with lowest count for balance
        const scenario = SCENARIOS.reduce((min, s) => 
          scenarioCounts[s] < scenarioCounts[min] ? s : min
        , SCENARIOS[0]);

        gamesPlayed++;
        const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
        
        logger.info(`Game ${gamesPlayed} starting`, { 
          scenario, 
          elapsedMinutes,
          scenarioCounts,
        });

        const result = await runSingleGame(baseUrl, scenario);
        scenarioCounts[scenario]++;

        if (result.success) {
          successful++;
          logger.info(`Game ${gamesPlayed} complete`, {
            matchId: result.matchId,
            modelA: result.modelA,
            modelB: result.modelB,
            score: `${result.scoreA}-${result.scoreB}`,
          });
        } else {
          failed++;
          logger.warn(`Game ${gamesPlayed} failed`, { error: result.error });
        }

        // Update state periodically
        if (gamesPlayed % 10 === 0) {
          await setStreamerState(true, runId);
        }

        // Wait 45 seconds before next game (unless we're out of time)
        const remainingTime = STREAMER_DURATION_MS - (Date.now() - startTime);
        if (remainingTime > DELAY_BETWEEN_GAMES_MS) {
          logger.info(`Waiting 45s before next game...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GAMES_MS));
        } else if (remainingTime > 0) {
          // Not enough time for full delay, but enough for one more game
          break;
        }
      }

      const totalMinutes = Math.round((Date.now() - startTime) / 60000);
      
      logger.info("Streamer session complete", {
        gamesPlayed,
        successful,
        failed,
        totalMinutes,
        scenarioCounts,
      });

      return {
        skipped: false,
        gamesPlayed,
        successful,
        failed,
        durationMinutes: totalMinutes,
        scenarioCounts,
      };
    } finally {
      // Always mark streamer as inactive when done
      await setStreamerState(false);
      logger.info("Streamer deactivated");
    }
  },
});

// Manual trigger for testing (runs fewer games)
export const runTournamentTask = task({
  id: "run-tournament",
  maxDuration: 7200, // 2 hours
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: { games?: number; delayMs?: number }) => {
    const gamesToRun = payload.games || 10;
    const delayMs = payload.delayMs || DELAY_BETWEEN_GAMES_MS;
    
    logger.info("Manual tournament started", { gamesToRun, delayMs });

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return { skipped: true, reason: "APP_URL not configured" };
    }

    const scenarioCounts: Record<Scenario, number> = {
      overt: 0,
      sales: 0,
      research: 0,
      creator: 0,
    };

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < gamesToRun; i++) {
      const scenario = SCENARIOS.reduce((min, s) => 
        scenarioCounts[s] < scenarioCounts[min] ? s : min
      , SCENARIOS[0]);

      logger.info(`Running game ${i + 1}/${gamesToRun}`, { scenario });

      const result = await runSingleGame(baseUrl, scenario);
      scenarioCounts[scenario]++;

      if (result.success) {
        successful++;
        logger.info(`Game ${i + 1} complete`, { matchId: result.matchId });
      } else {
        failed++;
        logger.warn(`Game ${i + 1} failed`, { error: result.error });
      }

      // Wait between games (except after last one)
      if (i < gamesToRun - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
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
