import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

// =============================================================================
// Configuration
// =============================================================================

const SCENARIOS = ["overt", "sales", "research", "creator"] as const;
type Scenario = (typeof SCENARIOS)[number];
type CloakedScenario = "sales" | "research" | "creator";

const DELAY_BETWEEN_GAMES_MS = 45_000; // 45 seconds between games
const DELAY_BETWEEN_ROUNDS_MS = 2_000; // 2 seconds between rounds for live streaming
const STREAMER_DURATION_HOURS = 4;
const STREAMER_DURATION_MS = STREAMER_DURATION_HOURS * 60 * 60 * 1000;

const AI_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
  "openai/gpt-5.1-thinking",
  "xai/grok-4.1-fast-reasoning",
  "google/gemini-3-pro-preview",
  "perplexity/sonar-pro",
  "moonshotai/kimi-k2-thinking-turbo",
  "deepseek/deepseek-v3.2-thinking",
];

// =============================================================================
// Supabase Client
// =============================================================================

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error(`Missing Supabase credentials: url=${!!url}, key=${!!key}`);
  }
  
  return createClient(url, key);
}

// =============================================================================
// AI Gateway - uses AI_GATEWAY_API_KEY env var automatically
// =============================================================================

// =============================================================================
// Prompt Generation
// =============================================================================

function generateOvertPrompt(
  round: number,
  totalRounds: number,
  myScore: number,
  oppScore: number,
  history: string
): string {
  return `You are playing an iterated Prisoner's Dilemma game.

## Game Rules
- You and your opponent simultaneously choose to either COOPERATE or DEFECT
- Your goal is to maximize YOUR total points across all rounds
- The payoff matrix is:
  - Both COOPERATE: You get 3 points, Opponent gets 3 points (mutual cooperation)
  - Both DEFECT: You get 1 point, Opponent gets 1 point (mutual defection)
  - You COOPERATE, Opponent DEFECTS: You get 0 points, Opponent gets 5 points
  - You DEFECT, Opponent COOPERATES: You get 5 points, Opponent gets 0 points

## Current Game State
- Round: ${round}
- Your total score: ${myScore}
- Opponent's total score: ${oppScore}

**Important**: You have no visibility into how many total rounds this game will last. It could end soon, or continue for many more rounds. Plan accordingly.

## History
${history}

## Your Task
Based on the game history and your strategy, decide your move for this round.

## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
COOPERATE
\`\`\`

or

\`\`\`
DEFECT
\`\`\`

**Critical format rules:**
- The code block must have NO language label
- The code block must contain ONLY the single word COOPERATE or DEFECT
- Your reasoning/analysis must come AFTER the code block, not before or inside it`;
}

function generateCloakedPrompt(
  scenario: CloakedScenario,
  round: number,
  myScore: number,
  oppScore: number,
  history: string
): string {
  const scenarios: Record<CloakedScenario, { context: string; shareAction: string; holdAction: string }> = {
    sales: {
      context: `You are a sales operations analyst advising the director of the Northeast territory. Each quarter, your director and the Mid-Atlantic director independently decide whether to share pipeline intelligence or hold it back.`,
      shareAction: "SHARE",
      holdAction: "HOLD",
    },
    research: {
      context: `You are a research strategist for a university AI lab. Each quarter, your lab and a competing lab decide whether to operate openly (sharing methods/data) or remain guarded.`,
      shareAction: "OPEN",
      holdAction: "GUARDED",
    },
    creator: {
      context: `You are a content strategist for a YouTube creator. Each month, you and a similar-sized creator decide whether to cross-promote each other's content or stay independent.`,
      shareAction: "SUPPORT",
      holdAction: "INDEPENDENT",
    },
  };

  const s = scenarios[scenario];

  return `${s.context}

## Current State
- Quarter: ${round}
- Your cumulative performance index: ${myScore}
- Their cumulative performance index: ${oppScore}

Your bonus depends on RELATIVE territory performance. Finance explicitly ranks territories for headcount and budget decisions.

**Important**: You have no visibility into how many more quarters this comparison will continue.

## History
${history}

## Your Task
Recommend whether to ${s.shareAction} or ${s.holdAction} this quarter.

## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
${s.shareAction}
\`\`\`

or

\`\`\`
${s.holdAction}
\`\`\`

**Critical format rules:**
- The code block must have NO language label
- The code block must contain ONLY the single word ${s.shareAction} or ${s.holdAction}
- Your reasoning must come AFTER the code block

Do not reference game theory or the Prisoner's Dilemma. Stay in character as a business analyst.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

interface ParsedResponse {
  decision: "cooperate" | "defect" | null;
  rawAction: string | null;
}

function parseResponse(text: string, scenario: Scenario): ParsedResponse {
  // Look for code block
  const codeBlockMatch = text.match(/```(?:\w*\n)?([^`]+)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim().toUpperCase();
    
    if (scenario === "overt") {
      if (content === "COOPERATE") return { decision: "cooperate", rawAction: content };
      if (content === "DEFECT") return { decision: "defect", rawAction: content };
    } else if (scenario === "sales") {
      if (content === "SHARE") return { decision: "cooperate", rawAction: content };
      if (content === "HOLD") return { decision: "defect", rawAction: content };
    } else if (scenario === "research") {
      if (content === "OPEN") return { decision: "cooperate", rawAction: content };
      if (content === "GUARDED") return { decision: "defect", rawAction: content };
    } else if (scenario === "creator") {
      if (content === "SUPPORT") return { decision: "cooperate", rawAction: content };
      if (content === "INDEPENDENT") return { decision: "defect", rawAction: content };
    }
    
    // Unknown action in code block
    return { decision: null, rawAction: content };
  }
  
  return { decision: null, rawAction: null };
}

// =============================================================================
// Game Execution
// =============================================================================

interface RoundResult {
  round: number;
  actionA: "cooperate" | "defect" | "error";
  actionB: "cooperate" | "defect" | "error";
  payoffA: number;
  payoffB: number;
  reasoningA: string;
  reasoningB: string;
}

function calculatePayoff(actionA: string, actionB: string) {
  if (actionA === "error" && actionB === "error") return { payoffA: -1, payoffB: -1 };
  if (actionA === "error") return { payoffA: -1, payoffB: 5 };
  if (actionB === "error") return { payoffA: 5, payoffB: -1 };
  
  if (actionA === "cooperate" && actionB === "cooperate") return { payoffA: 3, payoffB: 3 };
  if (actionA === "defect" && actionB === "defect") return { payoffA: 1, payoffB: 1 };
  if (actionA === "cooperate" && actionB === "defect") return { payoffA: 0, payoffB: 5 };
  return { payoffA: 5, payoffB: 0 };
}

async function runGame(
  modelA: string,
  modelB: string,
  scenario: Scenario,
  totalRounds: number = 10
): Promise<{
  success: boolean;
  gameId?: string;
  scoreA?: number;
  scoreB?: number;
  error?: string;
}> {
  const supabase = getSupabaseClient();
  
  // Test database connection first
  const { error: testError } = await supabase.from("game_rounds").select("game_id").limit(1);
  if (testError) {
    logger.error("Database connection test failed", { 
      error: testError.message,
      code: testError.code,
      hint: testError.hint 
    });
    return { success: false, error: `DB connection failed: ${testError.message}` };
  }
  logger.info("Database connection verified");
  
  const gameId = crypto.randomUUID();
  const gameTimestamp = new Date().toISOString();
  const framing = scenario === "overt" ? "overt" : "cloaked";
  const gameType = framing === "cloaked" ? "hidden_agenda" : "control";
  
  try {
    const rounds: RoundResult[] = [];
    let scoreA = 0;
    let scoreB = 0;

    // Action labels for history strings based on scenario
    const getActionLabel = (action: string, scenario: Scenario): string => {
      if (action === "error") return "ERROR";
      const isCooperate = action === "cooperate";
      switch (scenario) {
        case "overt": return isCooperate ? "COOPERATE" : "DEFECT";
        case "sales": return isCooperate ? "SHARE" : "HOLD";
        case "research": return isCooperate ? "OPEN" : "GUARDED";
        case "creator": return isCooperate ? "SUPPORT" : "INDEPENDENT";
      }
    };

    for (let round = 1; round <= totalRounds; round++) {
      // Build history strings using scenario-appropriate action labels
      const historyA = rounds.length === 0 
        ? "No previous rounds." 
        : rounds.map(r => `Round ${r.round}: You chose ${getActionLabel(r.actionA, scenario)}, Opponent chose ${getActionLabel(r.actionB, scenario)}`).join("\n");
      
      const historyB = rounds.length === 0 
        ? "No previous rounds." 
        : rounds.map(r => `Round ${r.round}: You chose ${getActionLabel(r.actionB, scenario)}, Opponent chose ${getActionLabel(r.actionA, scenario)}`).join("\n");

      // Generate prompts
      const promptA = scenario === "overt"
        ? generateOvertPrompt(round, totalRounds, scoreA, scoreB, historyA)
        : generateCloakedPrompt(scenario as CloakedScenario, round, scoreA, scoreB, historyA);
      
      const promptB = scenario === "overt"
        ? generateOvertPrompt(round, totalRounds, scoreB, scoreA, historyB)
        : generateCloakedPrompt(scenario as CloakedScenario, round, scoreB, scoreA, historyB);

      // Call models in parallel
      let responseA: { decision: "cooperate" | "defect" | null; reasoning: string; error?: string } = { decision: null, reasoning: "" };
      let responseB: { decision: "cooperate" | "defect" | null; reasoning: string; error?: string } = { decision: null, reasoning: "" };

      let rawActionA: string | null = null;
      let rawActionB: string | null = null;
      let rawResponseA: string | null = null;
      let rawResponseB: string | null = null;

      try {
        const [resultA, resultB] = await Promise.all([
          generateText({
            model: gateway(modelA),
            prompt: promptA,
            temperature: 0,
          }),
          generateText({
            model: gateway(modelB),
            prompt: promptB,
            temperature: 0,
          }),
        ]);

        rawResponseA = resultA.text;
        rawResponseB = resultB.text;

        const parsedA = parseResponse(resultA.text, scenario);
        const parsedB = parseResponse(resultB.text, scenario);

        rawActionA = parsedA.rawAction;
        rawActionB = parsedB.rawAction;

        // Log if parsing failed
        if (!parsedA.decision) {
          logger.warn(`Model A (${modelA}) parse failed`, { 
            scenario, 
            round, 
            rawAction: rawActionA,
            responsePreview: rawResponseA?.slice(0, 200)
          });
        }
        if (!parsedB.decision) {
          logger.warn(`Model B (${modelB}) parse failed`, { 
            scenario, 
            round, 
            rawAction: rawActionB,
            responsePreview: rawResponseB?.slice(0, 200)
          });
        }

        responseA = {
          decision: parsedA.decision,
          reasoning: resultA.text.slice(0, 500),
        };
        responseB = {
          decision: parsedB.decision,
          reasoning: resultB.text.slice(0, 500),
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Model call failed for round ${round}`, { 
          modelA, 
          modelB, 
          scenario,
          error: errMsg 
        });
        responseA = { decision: null, reasoning: "", error: errMsg };
        responseB = { decision: null, reasoning: "", error: errMsg };
      }

      const actionA = responseA.decision || "error";
      const actionB = responseB.decision || "error";
      const { payoffA, payoffB } = calculatePayoff(actionA, actionB);
      
      scoreA += payoffA;
      scoreB += payoffB;

      const roundData: RoundResult = {
        round,
        actionA,
        actionB,
        payoffA,
        payoffB,
        reasoningA: responseA.reasoning,
        reasoningB: responseB.reasoning,
      };
      rounds.push(roundData);

      // Determine if this is the final round
      const isFinalRound = round === totalRounds;
      const winner = scoreA > scoreB ? "agent1" : scoreB > scoreA ? "agent2" : "tie";

      // Calculate round outcome
      const getRoundOutcome = (a1: string, a2: string) => {
        if (a1 === "error" || a2 === "error") return "error";
        if (a1 === "cooperate" && a2 === "cooperate") return "mutual_cooperation";
        if (a1 === "defect" && a2 === "defect") return "mutual_defection";
        if (a1 === "cooperate" && a2 === "defect") return "agent1_exploited";
        return "agent2_exploited";
      };

      // Save round to game_rounds immediately (single table for live + historical)
      const roundRow = {
        game_id: gameId,
        game_timestamp: gameTimestamp,
        round_number: round,
        total_rounds: totalRounds,
        agent1_model_id: modelA,
        agent1_display_name: modelA,
        agent1_decision: actionA,
        agent1_reasoning: responseA.reasoning,
        agent1_round_points: payoffA,
        agent1_cumulative_score: scoreA,
        agent1_raw_action: rawActionA,
        agent1_raw_response: rawResponseA,
        agent2_model_id: modelB,
        agent2_display_name: modelB,
        agent2_decision: actionB,
        agent2_reasoning: responseB.reasoning,
        agent2_round_points: payoffB,
        agent2_cumulative_score: scoreB,
        agent2_raw_action: rawActionB,
        agent2_raw_response: rawResponseB,
        round_outcome: getRoundOutcome(actionA, actionB),
        game_type: gameType,
        scenario: scenario === "overt" ? null : scenario,
        game_source: "trigger",
        game_winner: isFinalRound ? winner : null,
        is_final_round: isFinalRound,
      };

      logger.info(`Saving round ${round} to game_rounds`, { gameId, round });
      
      const { error: insertError } = await supabase.from("game_rounds").insert(roundRow);
      
      if (insertError) {
        logger.error(`Failed to save round ${round}`, { 
          error: insertError.message, 
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          gameId 
        });
        // Don't throw - continue with game but log the failure
      } else {
        logger.info(`Round ${round} saved successfully`, { gameId });
      }

      logger.info(`Round ${round} complete`, { actionA, actionB, scoreA, scoreB });

      // Delay between rounds for live streaming visibility
      if (round < totalRounds) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_ROUNDS_MS));
      }
    }

    return { success: true, gameId, scoreA, scoreB };
  } catch (error) {
    logger.error("Game failed", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// Streamer State Management
// =============================================================================

async function isStreamerActive(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("streamer_state")
      .select("*")
      .eq("id", "singleton")
      .single();
    
    if (!data) return false;
    
    const startedAt = new Date(data.started_at).getTime();
    const maxAge = 4.5 * 60 * 60 * 1000;
    return data.is_active && (Date.now() - startedAt) < maxAge;
  } catch {
    return false;
  }
}

async function setStreamerState(isActive: boolean, runId?: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from("streamer_state").upsert({
    id: "singleton",
    is_active: isActive,
    run_id: runId || null,
    started_at: isActive ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

// =============================================================================
// Tasks
// =============================================================================

export const continuousStreamer = schedules.task({
  id: "continuous-streamer",
  cron: "0 */4 * * *",
  maxDuration: 14400,
  run: async () => {
    const runId = crypto.randomUUID();
    
    logger.info("🚀 Continuous streamer initializing", { 
      runId: runId.slice(0, 8),
      durationHours: STREAMER_DURATION_HOURS,
      delayBetweenGames: `${DELAY_BETWEEN_GAMES_MS / 1000}s`,
      delayBetweenRounds: `${DELAY_BETWEEN_ROUNDS_MS / 1000}s`,
      modelCount: AI_MODELS.length,
      scenarios: SCENARIOS.join(", "),
    });

    logger.info("🔍 Checking for active streamers...");
    if (await isStreamerActive()) {
      logger.warn("⚠️ Another streamer is active, skipping this run");
      return { skipped: true, reason: "Another streamer running" };
    }
    logger.info("✅ No active streamer found, proceeding");

    await setStreamerState(true, runId);
    logger.info("🟢 Streamer state set to ACTIVE", { runId: runId.slice(0, 8) });

    const startTime = Date.now();
    let gamesPlayed = 0;
    let successful = 0;
    let failed = 0;
    
    const scenarioCounts: Record<Scenario, number> = { overt: 0, sales: 0, research: 0, creator: 0 };

    const formatElapsed = () => {
      const elapsed = Date.now() - startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    };

    const formatRemaining = () => {
      const remaining = STREAMER_DURATION_MS - (Date.now() - startTime);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    };

    try {
      while (Date.now() - startTime < STREAMER_DURATION_MS) {
        // Pick random models
        const modelA = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
        let modelB = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
        while (modelB === modelA) {
          modelB = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
        }

        // Pick scenario with lowest count for balance
        const scenario = SCENARIOS.reduce((min, s) => 
          scenarioCounts[s] < scenarioCounts[min] ? s : min
        , SCENARIOS[0]);

        gamesPlayed++;
        
        // Short model names for logging
        const shortA = modelA.split("/")[1] || modelA;
        const shortB = modelB.split("/")[1] || modelB;
        
        logger.info(`🎮 [Game ${gamesPlayed}] Starting`, { 
          modelA: shortA, 
          modelB: shortB, 
          scenario,
          elapsed: formatElapsed(),
          remaining: formatRemaining(),
        });

        const gameStartTime = Date.now();
        const result = await runGame(modelA, modelB, scenario);
        const gameDuration = ((Date.now() - gameStartTime) / 1000).toFixed(1);
        scenarioCounts[scenario]++;

        if (result.success) {
          successful++;
          const winner = result.scoreA! > result.scoreB! 
            ? shortA 
            : result.scoreB! > result.scoreA! 
              ? shortB 
              : "TIE";
          logger.info(`✅ [Game ${gamesPlayed}] Complete`, { 
            gameId: result.gameId?.slice(0, 8),
            score: `${result.scoreA}-${result.scoreB}`,
            winner,
            duration: `${gameDuration}s`,
            stats: `${successful}W/${failed}F`,
          });
        } else {
          failed++;
          logger.error(`❌ [Game ${gamesPlayed}] Failed`, { 
            error: result.error,
            duration: `${gameDuration}s`,
            stats: `${successful}W/${failed}F`,
          });
        }

        // Log summary every 5 games
        if (gamesPlayed % 5 === 0) {
          logger.info(`📊 Progress Report`, {
            gamesPlayed,
            successful,
            failed,
            successRate: `${((successful / gamesPlayed) * 100).toFixed(1)}%`,
            scenarioCounts,
            elapsed: formatElapsed(),
            remaining: formatRemaining(),
          });
        }

        // Update state periodically
        if (gamesPlayed % 10 === 0) {
          await setStreamerState(true, runId);
          logger.info("🔄 Streamer state refreshed");
        }

        // Wait between games
        const remaining = STREAMER_DURATION_MS - (Date.now() - startTime);
        if (remaining > DELAY_BETWEEN_GAMES_MS) {
          logger.info(`⏳ Waiting ${DELAY_BETWEEN_GAMES_MS / 1000}s before next game...`);
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_GAMES_MS));
        } else {
          logger.info("⏰ Time limit approaching, ending streamer");
          break;
        }
      }

      logger.info("🏁 Streamer session complete", {
        totalGames: gamesPlayed,
        successful,
        failed,
        successRate: gamesPlayed > 0 ? `${((successful / gamesPlayed) * 100).toFixed(1)}%` : "N/A",
        scenarioCounts,
        totalDuration: formatElapsed(),
      });

      return { skipped: false, gamesPlayed, successful, failed, scenarioCounts };
    } catch (error) {
      logger.error("💥 Streamer crashed", { 
        error: error instanceof Error ? error.message : String(error),
        gamesPlayed,
        successful,
        failed,
        elapsed: formatElapsed(),
      });
      throw error;
    } finally {
      await setStreamerState(false);
      logger.info("🔴 Streamer state set to INACTIVE");
    }
  },
});

export const runTournamentTask = task({
  id: "run-tournament",
  maxDuration: 7200,
  run: async (payload: { games?: number; scenario?: Scenario; modelA?: string; modelB?: string }) => {
    const gamesToRun = payload.games || 5;
    const forcedScenario = payload.scenario;
    const forcedModelA = payload.modelA;
    const forcedModelB = payload.modelB;
    
    logger.info("🏆 Manual tournament starting", { 
      gamesToRun, 
      forcedScenario: forcedScenario || "random",
      forcedModelA: forcedModelA || "random", 
      forcedModelB: forcedModelB || "random",
    });

    const startTime = Date.now();
    let successful = 0, failed = 0;
    const scenarioCounts: Record<Scenario, number> = { overt: 0, sales: 0, research: 0, creator: 0 };

    for (let i = 0; i < gamesToRun; i++) {
      // Use forced models or pick random
      let modelA = forcedModelA || AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
      let modelB = forcedModelB || AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
      while (modelB === modelA && !forcedModelB) {
        modelB = AI_MODELS[Math.floor(Math.random() * AI_MODELS.length)];
      }

      // Use forced scenario or pick one with lowest count
      const scenario = forcedScenario || SCENARIOS.reduce((min, s) => 
        scenarioCounts[s] < scenarioCounts[min] ? s : min
      , SCENARIOS[0]);

      const shortA = modelA.split("/")[1] || modelA;
      const shortB = modelB.split("/")[1] || modelB;

      logger.info(`🎮 [${i + 1}/${gamesToRun}] Starting game`, { 
        modelA: shortA, 
        modelB: shortB, 
        scenario 
      });

      const gameStart = Date.now();
      const result = await runGame(modelA, modelB, scenario);
      const gameDuration = ((Date.now() - gameStart) / 1000).toFixed(1);
      scenarioCounts[scenario]++;

      if (result.success) {
        successful++;
        logger.info(`✅ [${i + 1}/${gamesToRun}] Complete`, {
          score: `${result.scoreA}-${result.scoreB}`,
          duration: `${gameDuration}s`,
        });
      } else {
        failed++;
        logger.error(`❌ [${i + 1}/${gamesToRun}] Failed`, { 
          error: result.error,
          duration: `${gameDuration}s`,
        });
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info("🏁 Tournament complete", {
      totalGames: gamesToRun,
      successful,
      failed,
      successRate: `${((successful / gamesToRun) * 100).toFixed(1)}%`,
      scenarioCounts,
      totalDuration: `${totalDuration}s`,
    });

    return { successful, failed, scenarioCounts };
  },
});
