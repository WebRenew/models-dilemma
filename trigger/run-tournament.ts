import { task, logger } from "@trigger.dev/sdk/v3";

const SCENARIOS = ["overt", "sales", "research", "creator"] as const;
type Scenario = (typeof SCENARIOS)[number];

interface TournamentPayload {
  matchesPerScenario?: number;
  totalRounds?: number;
}

interface MatchResult {
  matchId: string;
  modelA: string;
  modelB: string;
  scenario: Scenario;
  scoreA: number;
  scoreB: number;
  winner: string;
  success: boolean;
  error?: string;
}

export const runTournamentTask = task({
  id: "run-tournament",
  maxDuration: 3600, // 1 hour
  retry: {
    maxAttempts: 1, // Don't retry the whole tournament
  },
  run: async (payload: TournamentPayload) => {
    const matchesPerScenario = payload.matchesPerScenario || 25;
    const totalRounds = payload.totalRounds || 10;
    
    logger.info("Starting tournament", { matchesPerScenario, totalRounds });

    // Get API base URL from environment
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

    const results: MatchResult[] = [];
    const scenarioCounts: Record<Scenario, number> = {
      overt: 0,
      sales: 0,
      research: 0,
      creator: 0,
    };

    // Run matches until we have enough for each scenario
    let totalMatches = 0;
    const targetTotal = matchesPerScenario * SCENARIOS.length;

    while (totalMatches < targetTotal) {
      // Pick scenario with lowest count
      const scenario = SCENARIOS.reduce((min, s) => 
        scenarioCounts[s] < scenarioCounts[min] ? s : min
      , SCENARIOS[0]);

      if (scenarioCounts[scenario] >= matchesPerScenario) {
        break; // All scenarios complete
      }

      logger.info(`Running match ${totalMatches + 1}/${targetTotal}`, { scenario });

      try {
        const response = await fetch(`${baseUrl}/api/run-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            framing: scenario === "overt" ? "overt" : "cloaked",
            scenario: scenario === "overt" ? undefined : scenario,
            totalRounds,
            saveToDb: true,
            streamRounds: false, // Don't need streaming in background task
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse SSE response to get final result
        const text = await response.text();
        const lines = text.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "complete") {
                results.push({
                  matchId: event.gameId,
                  modelA: event.modelAName,
                  modelB: event.modelBName,
                  scenario,
                  scoreA: event.scoreA,
                  scoreB: event.scoreB,
                  winner: event.winner,
                  success: true,
                });
                scenarioCounts[scenario]++;
                totalMatches++;
                
                logger.info(`Match complete`, {
                  matchId: event.gameId,
                  modelA: event.modelAName,
                  modelB: event.modelBName,
                  score: `${event.scoreA}-${event.scoreB}`,
                  scenario,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      } catch (error) {
        logger.error(`Match failed`, { error: String(error), scenario });
        results.push({
          matchId: "",
          modelA: "unknown",
          modelB: "unknown",
          scenario,
          scoreA: 0,
          scoreB: 0,
          winner: "error",
          success: false,
          error: String(error),
        });
        totalMatches++;
      }

      // Small delay between matches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info("Tournament complete", {
      totalMatches: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      scenarioCounts,
    });

    return {
      totalMatches: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      scenarioCounts,
      results,
    };
  },
});

// Single match task for more granular control
export const runSingleMatchTask = task({
  id: "run-single-match",
  maxDuration: 300, // 5 minutes per match
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: {
    modelA?: string;
    modelB?: string;
    scenario?: Scenario;
    totalRounds?: number;
  }) => {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const scenario = payload.scenario || SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

    logger.info("Running single match", { scenario, modelA: payload.modelA, modelB: payload.modelB });

    const response = await fetch(`${baseUrl}/api/run-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelA: payload.modelA,
        modelB: payload.modelB,
        framing: scenario === "overt" ? "overt" : "cloaked",
        scenario: scenario === "overt" ? undefined : scenario,
        totalRounds: payload.totalRounds || 10,
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
            logger.info("Match complete", {
              matchId: event.gameId,
              score: `${event.scoreA}-${event.scoreB}`,
            });
            return event;
          }
        } catch {
          // Ignore
        }
      }
    }

    throw new Error("No complete event received");
  },
});

