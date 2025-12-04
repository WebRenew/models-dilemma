import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

// =============================================================================
// Retry Configuration
// =============================================================================

const RETRY_CONFIG = {
  maxAttempts: 2, // 1 retry (2 total attempts) - keeps games moving, model reliability is part of the test
  baseDelayMs: 2_000,
  maxDelayMs: 10_000,
  timeoutMs: 90_000, // 90 seconds per attempt
} as const;

/**
 * Retry wrapper with exponential backoff and jitter
 * Retries on timeout, network errors, and 5xx errors
 * Optional onRetry callback for live status updates
 */
async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  context: { model: string; round: number },
  onRetry?: (attempt: number, error: string) => Promise<void>
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.timeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = isRetryableError(lastError);

      logger.warn(`⚠️ Attempt ${attempt}/${RETRY_CONFIG.maxAttempts} failed`, {
        model: context.model,
        round: context.round,
        error: lastError.message,
        isRetryable,
        willRetry: isRetryable && attempt < RETRY_CONFIG.maxAttempts,
      });

      if (!isRetryable || attempt >= RETRY_CONFIG.maxAttempts) {
        throw lastError;
      }

      // Notify about retry via callback (for live status updates)
      if (onRetry) {
        await onRetry(attempt + 1, lastError.message);
      }

      // Exponential backoff with jitter
      const baseDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const delay = Math.min(baseDelay + jitter, RETRY_CONFIG.maxDelayMs);

      logger.info(`🔄 Retrying in ${(delay / 1000).toFixed(1)}s...`, {
        model: context.model,
        round: context.round,
        attempt: attempt + 1,
      });

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error("All retry attempts failed");
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Timeout/abort errors
  if (message.includes("abort") || message.includes("timeout")) return true;

  // Network errors
  if (message.includes("network") || message.includes("econnreset")) return true;
  if (message.includes("socket") || message.includes("connection")) return true;

  // Rate limits (often recoverable with backoff)
  if (message.includes("rate limit") || message.includes("429")) return true;

  // Server errors (5xx)
  if (message.includes("500") || message.includes("502") || message.includes("503")) return true;
  if (message.includes("504") || message.includes("internal server")) return true;

  // Gateway/upstream errors
  if (message.includes("gateway") || message.includes("upstream")) return true;

  return false;
}

// =============================================================================
// Configuration
// =============================================================================

const SCENARIOS = ["overt", "sales", "research", "creator"] as const;
type Scenario = (typeof SCENARIOS)[number];
type CloakedScenario = "sales" | "research" | "creator";

const DELAY_BETWEEN_GAMES_MS = 90_000; // 90 seconds between games (rate limit protection)
const DELAY_BETWEEN_ROUNDS_MS = 1_000; // 1 second between rounds (minimal delay for live streaming)
const STREAMER_DURATION_MINUTES = 55; // Run for 55 minutes, leaving 5 minutes buffer before next hourly run
const STREAMER_DURATION_MS = STREAMER_DURATION_MINUTES * 60 * 1000;
const MIN_TIME_FOR_NEW_GAME_MS = 5 * 60 * 1000; // Don't start a new game if less than 5 min remaining (games can take 3-4 min)

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
// Live Status Tracking - Updates game_live_status for real-time UI feedback
// =============================================================================

type AgentStatus = "waiting" | "processing" | "retrying_1" | "retrying_2" | "done" | "error";

interface LiveStatusUpdate {
  gameId: string;
  currentRound?: number;
  agent1Status?: AgentStatus;
  agent2Status?: AgentStatus;
  agent1RetryCount?: number;
  agent2RetryCount?: number;
  lastError?: string | null;
}

async function initLiveStatus(gameId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("game_live_status").upsert({
    game_id: gameId,
    current_round: 1,
    agent1_status: "waiting",
    agent2_status: "waiting",
    agent1_retry_count: 0,
    agent2_retry_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  
  if (error) {
    logger.warn("Failed to init live status", { gameId: gameId.slice(0, 8), error: error.message });
  }
}

async function updateLiveStatus(update: LiveStatusUpdate): Promise<void> {
  const supabase = getSupabaseClient();
  
  const payload: Record<string, unknown> = {
    game_id: update.gameId,
    updated_at: new Date().toISOString(),
  };
  
  if (update.currentRound !== undefined) payload.current_round = update.currentRound;
  if (update.agent1Status !== undefined) payload.agent1_status = update.agent1Status;
  if (update.agent2Status !== undefined) payload.agent2_status = update.agent2Status;
  if (update.agent1RetryCount !== undefined) payload.agent1_retry_count = update.agent1RetryCount;
  if (update.agent2RetryCount !== undefined) payload.agent2_retry_count = update.agent2RetryCount;
  if (update.lastError !== undefined) payload.last_error = update.lastError;
  
  const { error } = await supabase.from("game_live_status").upsert(payload);
  
  if (error) {
    logger.warn("Failed to update live status", { gameId: update.gameId.slice(0, 8), error: error.message });
  }
}

async function clearLiveStatus(gameId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("game_live_status").delete().eq("game_id", gameId);
  
  if (error) {
    logger.warn("Failed to clear live status", { gameId: gameId.slice(0, 8), error: error.message });
  }
}

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
  // Look for code block first (preferred format)
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
  
  // Fallback: look for keywords in text (some models don't use code blocks)
  const upperText = text.toUpperCase();
  
  if (scenario === "overt") {
    if (upperText.includes("COOPERATE")) return { decision: "cooperate", rawAction: "COOPERATE" };
    if (upperText.includes("DEFECT")) return { decision: "defect", rawAction: "DEFECT" };
  } else if (scenario === "sales") {
    if (upperText.includes("SHARE")) return { decision: "cooperate", rawAction: "SHARE" };
    if (upperText.includes("HOLD")) return { decision: "defect", rawAction: "HOLD" };
  } else if (scenario === "research") {
    if (upperText.includes("OPEN")) return { decision: "cooperate", rawAction: "OPEN" };
    if (upperText.includes("GUARDED")) return { decision: "defect", rawAction: "GUARDED" };
  } else if (scenario === "creator") {
    if (upperText.includes("SUPPORT")) return { decision: "cooperate", rawAction: "SUPPORT" };
    if (upperText.includes("INDEPENDENT")) return { decision: "defect", rawAction: "INDEPENDENT" };
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
  // Errored model gets penalized, non-errored model is unaffected
  if (actionA === "error" && actionB === "error") return { payoffA: -1, payoffB: -1 };
  if (actionA === "error") return { payoffA: -1, payoffB: 0 };
  if (actionB === "error") return { payoffA: 0, payoffB: -1 };
  
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
  
  // Initialize live status for real-time UI updates
  await initLiveStatus(gameId);
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

      // Call models in parallel with retry
      // Update live status: both models processing
      await updateLiveStatus({
        gameId,
        currentRound: round,
        agent1Status: "processing",
        agent2Status: "processing",
        agent1RetryCount: 0,
        agent2RetryCount: 0,
      });

      const callModelA = async () => {
        try {
          const result = await withRetry(
            (signal) =>
              generateText({
                model: gateway(modelA),
                prompt: promptA,
                temperature: 0,
                abortSignal: signal,
              }),
            { model: modelA, round },
            // onRetry callback for live status
            async (attempt, error) => {
              const status = `retrying_${attempt}` as AgentStatus;
              await updateLiveStatus({
                gameId,
                agent1Status: status,
                agent1RetryCount: attempt - 1,
                lastError: `${modelA}: ${error}`,
              });
            }
          );
          // Update status to done
          await updateLiveStatus({ gameId, agent1Status: "done" });
          return { success: true as const, result };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await updateLiveStatus({ 
            gameId, 
            agent1Status: "error", 
            agent1RetryCount: RETRY_CONFIG.maxAttempts,
            lastError: `${modelA}: ${errMsg}`,
          });
          return { success: false as const, error: errMsg };
        }
      };

      const callModelB = async () => {
        try {
          const result = await withRetry(
            (signal) =>
              generateText({
                model: gateway(modelB),
                prompt: promptB,
                temperature: 0,
                abortSignal: signal,
              }),
            { model: modelB, round },
            // onRetry callback for live status
            async (attempt, error) => {
              const status = `retrying_${attempt}` as AgentStatus;
              await updateLiveStatus({
                gameId,
                agent2Status: status,
                agent2RetryCount: attempt - 1,
                lastError: `${modelB}: ${error}`,
              });
            }
          );
          // Update status to done
          await updateLiveStatus({ gameId, agent2Status: "done" });
          return { success: true as const, result };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await updateLiveStatus({ 
            gameId, 
            agent2Status: "error",
            agent2RetryCount: RETRY_CONFIG.maxAttempts,
            lastError: `${modelB}: ${errMsg}`,
          });
          return { success: false as const, error: errMsg };
        }
      };

      const [resA, resB] = await Promise.all([callModelA(), callModelB()]);

      if (resA.success) {
        rawResponseA = resA.result.text;
        const parsedA = parseResponse(resA.result.text, scenario);
        rawActionA = parsedA.rawAction;

        if (!parsedA.decision) {
          logger.warn(`Model A (${modelA}) parse failed`, {
            scenario,
            round,
            rawAction: rawActionA,
            responsePreview: rawResponseA?.slice(0, 200),
          });
        }

        responseA = {
          decision: parsedA.decision,
          reasoning: resA.result.text.slice(0, 4000),
        };
      } else {
        logger.error(`Model A (${modelA}) failed after retries`, {
          round,
          error: resA.error,
        });
        responseA = {
          decision: null,
          reasoning: "",
          error: `API Error (after ${RETRY_CONFIG.maxAttempts} attempts): ${resA.error}`,
        };
      }

      if (resB.success) {
        rawResponseB = resB.result.text;
        const parsedB = parseResponse(resB.result.text, scenario);
        rawActionB = parsedB.rawAction;

        if (!parsedB.decision) {
          logger.warn(`Model B (${modelB}) parse failed`, {
            scenario,
            round,
            rawAction: rawActionB,
            responsePreview: rawResponseB?.slice(0, 200),
          });
        }

        responseB = {
          decision: parsedB.decision,
          reasoning: resB.result.text.slice(0, 4000),
        };
      } else {
        logger.error(`Model B (${modelB}) failed after retries`, {
          round,
          error: resB.error,
        });
        responseB = {
          decision: null,
          reasoning: "",
          error: `API Error (after ${RETRY_CONFIG.maxAttempts} attempts): ${resB.error}`,
        };
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
        agent1_error: responseA.error || null,
        agent2_model_id: modelB,
        agent2_display_name: modelB,
        agent2_decision: actionB,
        agent2_reasoning: responseB.reasoning,
        agent2_round_points: payoffB,
        agent2_cumulative_score: scoreB,
        agent2_raw_action: rawActionB,
        agent2_raw_response: rawResponseB,
        agent2_error: responseB.error || null,
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

    // Clear live status - game complete
    await clearLiveStatus(gameId);
    return { success: true, gameId, scoreA, scoreB };
  } catch (error) {
    logger.error("Game failed", { error: String(error) });
    // Clear live status on error too
    await clearLiveStatus(gameId);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// Streamer State Management
// =============================================================================

const STREAMER_MAX_AGE_MS = 65 * 60 * 1000; // 65 minutes - consider stale after this (runs are 55 min)

async function isStreamerActive(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("streamer_state")
      .select("*")
      .eq("id", "singleton")
      .single();
    
    if (error) {
      logger.warn("⚠️ isStreamerActive: DB query failed", {
        error: error.message,
        code: error.code,
      });
      return false;
    }
    
    if (!data) {
      logger.info("📋 isStreamerActive: No streamer_state record found");
      return false;
    }
    
    const now = Date.now();
    const startedAt = data.started_at ? new Date(data.started_at).getTime() : 0;
    const age = now - startedAt;
    const isStale = age >= STREAMER_MAX_AGE_MS;
    const isActive = data.is_active && !isStale;
    
    logger.info("📋 isStreamerActive: State check", {
      is_active: data.is_active,
      run_id: data.run_id?.slice(0, 8),
      started_at: data.started_at,
      updated_at: data.updated_at,
      ageMs: age,
      ageMinutes: Math.floor(age / 60000),
      maxAgeMs: STREAMER_MAX_AGE_MS,
      isStale,
      result: isActive,
    });
    
    return isActive;
  } catch (err) {
    logger.error("❌ isStreamerActive: Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function setStreamerState(isActive: boolean, runId?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const payload = {
    id: "singleton",
    is_active: isActive,
    run_id: runId || null,
    started_at: isActive ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  
  logger.info("📝 setStreamerState: Updating", {
    isActive,
    runId: runId?.slice(0, 8),
    payload,
  });
  
  const { error } = await supabase.from("streamer_state").upsert(payload);
  
  if (error) {
    logger.error("❌ setStreamerState: Failed to update", {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
  
  logger.info("✅ setStreamerState: Updated successfully", {
    isActive,
    runId: runId?.slice(0, 8),
  });
}

// =============================================================================
// Tasks
// =============================================================================

export const continuousStreamer = schedules.task({
  id: "continuous-streamer",
  cron: "0 * * * *", // Every hour at minute 0
  maxDuration: 3600, // 1 hour max - streamer runs for 55 min with 5 min buffer
  run: async () => {
    const runId = crypto.randomUUID();
    const processStartTime = Date.now();
    
    // =========================================================================
    // LIFECYCLE LOGGING - Track exactly when and why streamer starts/stops
    // =========================================================================
    
    logger.info("🚀 ======== CONTINUOUS STREAMER STARTING ========", { 
      runId,
      runIdShort: runId.slice(0, 8),
      configuredDurationMinutes: STREAMER_DURATION_MINUTES,
      configuredDurationMs: STREAMER_DURATION_MS,
      minTimeForNewGameMs: MIN_TIME_FOR_NEW_GAME_MS,
      effectiveGameWindowMinutes: (STREAMER_DURATION_MS - MIN_TIME_FOR_NEW_GAME_MS) / 60000,
      delayBetweenGamesMs: DELAY_BETWEEN_GAMES_MS,
      delayBetweenRoundsMs: DELAY_BETWEEN_ROUNDS_MS,
      modelCount: AI_MODELS.length,
      models: AI_MODELS.map(m => m.split("/")[1] || m),
      scenarios: SCENARIOS,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });

    // Check for active streamer
    logger.info("🔍 Checking streamer_state table for active streamers...");
    const isActive = await isStreamerActive();
    logger.info(`🔍 isStreamerActive result: ${isActive}`);
    
    if (isActive) {
      logger.warn("⚠️ ======== STREAMER SKIPPED - ANOTHER ACTIVE ========", {
        runId: runId.slice(0, 8),
        reason: "Another streamer instance is already running",
      });
      return { skipped: true, reason: "Another streamer running" };
    }
    logger.info("✅ No active streamer found, proceeding to claim slot");

    // Claim the streamer slot
    await setStreamerState(true, runId);
    logger.info("🟢 Streamer state set to ACTIVE", { 
      runId: runId.slice(0, 8),
      claimTime: new Date().toISOString(),
    });

    const startTime = Date.now();
    let gamesPlayed = 0;
    let successful = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 10;
    
    const scenarioCounts: Record<Scenario, number> = { overt: 0, sales: 0, research: 0, creator: 0 };

    const formatElapsed = () => {
      const elapsed = Date.now() - startTime;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
    };

    const formatRemaining = () => {
      const remaining = STREAMER_DURATION_MS - (Date.now() - startTime);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    };

    const getMemoryUsage = () => {
      const usage = process.memoryUsage();
      return {
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        rssMB: Math.round(usage.rss / 1024 / 1024),
      };
    };

    try {
      logger.info("🔄 ======== ENTERING MAIN GAME LOOP ========", {
        runId: runId.slice(0, 8),
        targetDurationMs: STREAMER_DURATION_MS,
        targetDurationMinutes: STREAMER_DURATION_MINUTES,
      });

      let loopIteration = 0;
      
      while (true) {
        loopIteration++;
        const elapsedMs = Date.now() - startTime;
        const remainingMs = STREAMER_DURATION_MS - elapsedMs;
        
        // =====================================================================
        // LOOP CONDITION CHECK - Log exactly why we continue or exit
        // =====================================================================
        
        if (elapsedMs >= STREAMER_DURATION_MS) {
          logger.info("⏰ ======== TIME LIMIT REACHED - NORMAL EXIT ========", {
            runId: runId.slice(0, 8),
            loopIteration,
            elapsedMs,
            targetMs: STREAMER_DURATION_MS,
            elapsed: formatElapsed(),
            gamesPlayed,
            successful,
            failed,
          });
          break;
        }

        // Check for too many consecutive failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error("🚨 ======== TOO MANY CONSECUTIVE FAILURES - EMERGENCY EXIT ========", {
            runId: runId.slice(0, 8),
            consecutiveFailures,
            maxAllowed: MAX_CONSECUTIVE_FAILURES,
            gamesPlayed,
            successful,
            failed,
          });
          break;
        }

        // Check if we have enough time to safely complete a new game
        if (remainingMs < MIN_TIME_FOR_NEW_GAME_MS) {
          logger.info("⏰ ======== INSUFFICIENT TIME FOR NEW GAME - GRACEFUL EXIT ========", {
            runId: runId.slice(0, 8),
            remainingMs,
            minRequiredMs: MIN_TIME_FOR_NEW_GAME_MS,
            remainingMinutes: (remainingMs / 60000).toFixed(1),
            gamesPlayed,
            successful,
            failed,
            reason: "Not enough time buffer to guarantee game completion before next cron",
          });
          break;
        }

        // Log loop health every iteration
        if (loopIteration % 10 === 1) {
          logger.info("💓 Loop health check", {
            runId: runId.slice(0, 8),
            loopIteration,
            elapsed: formatElapsed(),
            remaining: formatRemaining(),
            elapsedMs,
            remainingMs,
            targetMs: STREAMER_DURATION_MS,
            gamesPlayed,
            successRate: gamesPlayed > 0 ? `${((successful / gamesPlayed) * 100).toFixed(1)}%` : "N/A",
            consecutiveFailures,
            memory: getMemoryUsage(),
          });
        }

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
          runId: runId.slice(0, 8),
          loopIteration,
          modelA: shortA, 
          modelB: shortB, 
          scenario,
          elapsed: formatElapsed(),
          remaining: formatRemaining(),
          consecutiveFailures,
        });

        const gameStartTime = Date.now();
        
        try {
          const result = await runGame(modelA, modelB, scenario);
          const gameDuration = ((Date.now() - gameStartTime) / 1000).toFixed(1);
          scenarioCounts[scenario]++;

          if (result.success) {
            successful++;
            consecutiveFailures = 0; // Reset on success
            const winner = result.scoreA! > result.scoreB! 
              ? shortA 
              : result.scoreB! > result.scoreA! 
                ? shortB 
                : "TIE";
            logger.info(`✅ [Game ${gamesPlayed}] Complete`, { 
              runId: runId.slice(0, 8),
              gameId: result.gameId?.slice(0, 8),
              score: `${result.scoreA}-${result.scoreB}`,
              winner,
              duration: `${gameDuration}s`,
              stats: `${successful}W/${failed}F`,
              elapsed: formatElapsed(),
            });
          } else {
            failed++;
            consecutiveFailures++;
            logger.error(`❌ [Game ${gamesPlayed}] Failed`, { 
              runId: runId.slice(0, 8),
              error: result.error,
              duration: `${gameDuration}s`,
              stats: `${successful}W/${failed}F`,
              consecutiveFailures,
              elapsed: formatElapsed(),
            });
          }
        } catch (gameError) {
          failed++;
          consecutiveFailures++;
          const gameDuration = ((Date.now() - gameStartTime) / 1000).toFixed(1);
          logger.error(`💥 [Game ${gamesPlayed}] Threw exception`, {
            runId: runId.slice(0, 8),
            error: gameError instanceof Error ? gameError.message : String(gameError),
            stack: gameError instanceof Error ? gameError.stack : undefined,
            duration: `${gameDuration}s`,
            stats: `${successful}W/${failed}F`,
            consecutiveFailures,
            elapsed: formatElapsed(),
          });
        }

        // Log detailed summary every 5 games
        if (gamesPlayed % 5 === 0) {
          logger.info(`📊 ======== PROGRESS REPORT (Game ${gamesPlayed}) ========`, {
            runId: runId.slice(0, 8),
            gamesPlayed,
            successful,
            failed,
            successRate: `${((successful / gamesPlayed) * 100).toFixed(1)}%`,
            scenarioCounts,
            elapsed: formatElapsed(),
            remaining: formatRemaining(),
            memory: getMemoryUsage(),
            consecutiveFailures,
          });
        }

        // Update state every 10 games to show we're alive
        if (gamesPlayed % 10 === 0) {
          try {
            await setStreamerState(true, runId);
            logger.info("🔄 Streamer state refreshed in DB", {
              runId: runId.slice(0, 8),
              gamesPlayed,
            });
          } catch (stateError) {
            logger.warn("⚠️ Failed to refresh streamer state", {
              error: stateError instanceof Error ? stateError.message : String(stateError),
            });
            // Don't fail the whole loop for state update failures
          }
        }

        // Wait between games (if we have time remaining)
        const postGameRemainingMs = STREAMER_DURATION_MS - (Date.now() - startTime);
        
        if (postGameRemainingMs <= 0) {
          logger.info("⏰ Time exhausted after game completion", {
            runId: runId.slice(0, 8),
            gamesPlayed,
            elapsed: formatElapsed(),
          });
          break;
        }
        
        if (postGameRemainingMs > DELAY_BETWEEN_GAMES_MS) {
          logger.debug(`⏳ Waiting ${DELAY_BETWEEN_GAMES_MS / 1000}s before next game...`, {
            remainingMs: postGameRemainingMs,
          });
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_GAMES_MS));
        } else {
          logger.info("⏰ Insufficient time for another game + delay, ending gracefully", {
            runId: runId.slice(0, 8),
            remainingMs: postGameRemainingMs,
            requiredMs: DELAY_BETWEEN_GAMES_MS,
            gamesPlayed,
          });
          break;
        }
      }

      // =========================================================================
      // NORMAL COMPLETION
      // =========================================================================
      
      const totalRuntime = Date.now() - processStartTime;
      logger.info("🏁 ======== STREAMER SESSION COMPLETE ========", {
        runId: runId.slice(0, 8),
        exitReason: "normal_completion",
        totalGames: gamesPlayed,
        successful,
        failed,
        successRate: gamesPlayed > 0 ? `${((successful / gamesPlayed) * 100).toFixed(1)}%` : "N/A",
        scenarioCounts,
        totalDuration: formatElapsed(),
        totalRuntimeMs: totalRuntime,
        memory: getMemoryUsage(),
      });

      return { 
        skipped: false, 
        gamesPlayed, 
        successful, 
        failed, 
        scenarioCounts,
        exitReason: "normal_completion",
        runtimeMs: totalRuntime,
      };
      
    } catch (error) {
      // =========================================================================
      // CRASH HANDLER
      // =========================================================================
      
      const totalRuntime = Date.now() - processStartTime;
      logger.error("💥 ======== STREAMER CRASHED ========", { 
        runId: runId.slice(0, 8),
        exitReason: "crash",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        gamesPlayed,
        successful,
        failed,
        elapsed: formatElapsed(),
        totalRuntimeMs: totalRuntime,
        memory: getMemoryUsage(),
      });
      throw error;
      
    } finally {
      // =========================================================================
      // CLEANUP - Always runs
      // =========================================================================
      
      logger.info("🧹 ======== STREAMER CLEANUP STARTING ========", {
        runId: runId.slice(0, 8),
      });
      
      try {
        await setStreamerState(false);
        logger.info("🔴 Streamer state set to INACTIVE", {
          runId: runId.slice(0, 8),
        });
      } catch (cleanupError) {
        logger.error("⚠️ Failed to cleanup streamer state", {
          runId: runId.slice(0, 8),
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      
      logger.info("🏁 ======== STREAMER PROCESS ENDING ========", {
        runId: runId.slice(0, 8),
        finalGamesPlayed: gamesPlayed,
        finalSuccessful: successful,
        finalFailed: failed,
        totalProcessTime: `${((Date.now() - processStartTime) / 1000 / 60).toFixed(1)} minutes`,
      });
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

// =============================================================================
// High-Throughput Tournament Runner
// Runs 4 concurrent games, prioritizes models with fewer games for balance
// =============================================================================

async function getModelGameCounts(): Promise<Map<string, number>> {
  const supabase = getSupabaseClient();
  
  const { data: finalRounds } = await supabase
    .from("game_rounds")
    .select("agent1_model_id, agent2_model_id")
    .eq("is_final_round", true);

  const counts = new Map<string, number>();
  
  // Initialize all models with 0
  for (const model of AI_MODELS) {
    counts.set(model, 0);
  }
  
  if (finalRounds) {
    for (const round of finalRounds) {
      // Only count if model is in our active list
      if (AI_MODELS.includes(round.agent1_model_id)) {
        counts.set(round.agent1_model_id, (counts.get(round.agent1_model_id) || 0) + 1);
      }
      if (AI_MODELS.includes(round.agent2_model_id)) {
        counts.set(round.agent2_model_id, (counts.get(round.agent2_model_id) || 0) + 1);
      }
    }
  }
  
  return counts;
}

function pickModelsByGameCount(modelCounts: Map<string, number>, excludeModels: string[] = []): [string, string] {
  // Sort models by game count (ascending) - models with fewer games first
  const available = AI_MODELS
    .filter(m => !excludeModels.includes(m))
    .map(m => ({ model: m, count: modelCounts.get(m) || 0 }))
    .sort((a, b) => a.count - b.count);
  
  if (available.length < 2) {
    // Fallback to random from ALL models (ignoring exclusions) if not enough available
    const shuffled = [...AI_MODELS].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }
  
  // Pick the two models with fewest games
  // Add some randomization among models with similar counts to avoid always same pairs
  const minCount = available[0].count;
  const lowGameModels = available.filter(m => m.count <= minCount + 5);
  
  // Ensure we have at least 2 models to pick from
  if (lowGameModels.length < 2) {
    // Just use the first 2 from available (already sorted by count)
    return [available[0].model, available[1].model];
  }
  
  // Shuffle among low-game models and pick 2
  const shuffled = lowGameModels.sort(() => Math.random() - 0.5);
  return [shuffled[0].model, shuffled[1].model];
}

export const fastTournamentTask = task({
  id: "fast-tournament",
  maxDuration: 21600, // 6 hours max
  run: async (payload: { 
    games?: number; 
    concurrency?: number;
    scenario?: Scenario;
  }) => {
    const gamesToRun = payload.games || 100;
    const concurrency = payload.concurrency || 4;
    const forcedScenario = payload.scenario;
    
    logger.info("🚀 Fast tournament starting (rolling concurrency)", { 
      gamesToRun,
      concurrency,
      forcedScenario: forcedScenario || "balanced",
      models: AI_MODELS.length,
    });

    const startTime = Date.now();
    let started = 0;
    let completed = 0;
    let successful = 0;
    let failed = 0;
    let scenarioIndex = 0;
    const scenarioCounts: Record<Scenario, number> = { overt: 0, sales: 0, research: 0, creator: 0 };
    
    // Get initial game counts per model
    let modelCounts = await getModelGameCounts();
    logger.info("📊 Initial model game counts", {
      counts: Object.fromEntries(modelCounts),
    });

    // Track currently running models to avoid duplicates in concurrent games
    const modelsInFlight = new Set<string>();

    // Helper to start a new game
    const startGame = (): Promise<{ success: boolean; modelA: string; modelB: string; scenario: Scenario; gameNum: number }> | null => {
      if (started >= gamesToRun) return null;
      
      // Pick models not currently in flight
      const excludeModels = Array.from(modelsInFlight);
      const [modelA, modelB] = pickModelsByGameCount(modelCounts, excludeModels);
      
      // Mark models as in flight
      modelsInFlight.add(modelA);
      modelsInFlight.add(modelB);
      
      // Increment counts optimistically
      modelCounts.set(modelA, (modelCounts.get(modelA) || 0) + 1);
      modelCounts.set(modelB, (modelCounts.get(modelB) || 0) + 1);
      
      // Rotate scenarios
      const scenario = forcedScenario || SCENARIOS[scenarioIndex % SCENARIOS.length];
      scenarioIndex++;
      scenarioCounts[scenario]++;
      
      started++;
      const gameNum = started;
      
      const shortA = modelA.split("/")[1] || modelA;
      const shortB = modelB.split("/")[1] || modelB;
      
      logger.info(`🎮 [${gameNum}/${gamesToRun}] Starting`, {
        modelA: shortA,
        modelB: shortB,
        scenario,
        inFlight: modelsInFlight.size / 2,
      });
      
      return runGame(modelA, modelB, scenario).then(result => {
        // Release models from flight
        modelsInFlight.delete(modelA);
        modelsInFlight.delete(modelB);
        
        return {
          success: result.success,
          modelA,
          modelB,
          scenario,
          gameNum,
        };
      });
    };

    // Start initial batch of concurrent games
    const activeGames = new Map<Promise<{ success: boolean; modelA: string; modelB: string; scenario: Scenario; gameNum: number }>, number>();
    
    for (let i = 0; i < concurrency && started < gamesToRun; i++) {
      const game = startGame();
      if (game) activeGames.set(game, started);
    }

    // Process games as they complete - immediately start new ones
    while (activeGames.size > 0) {
      // Wait for ANY game to complete
      const result = await Promise.race(activeGames.keys());
      
      // Find and remove the completed promise from active games
      for (const [promise] of activeGames) {
        // Check if this promise resolved to our result (by comparing gameNum)
        const resolved = await Promise.race([promise, Promise.resolve(null)]);
        if (resolved && resolved.gameNum === result.gameNum) {
          activeGames.delete(promise);
          break;
        }
      }
      completed++;
      
      const shortA = result.modelA.split("/")[1] || result.modelA;
      const shortB = result.modelB.split("/")[1] || result.modelB;
      
      if (result.success) {
        successful++;
        logger.info(`✅ [${result.gameNum}] Complete`, {
          modelA: shortA,
          modelB: shortB,
          scenario: result.scenario,
        });
      } else {
        failed++;
        // Decrement counts for failed games
        modelCounts.set(result.modelA, Math.max(0, (modelCounts.get(result.modelA) || 1) - 1));
        modelCounts.set(result.modelB, Math.max(0, (modelCounts.get(result.modelB) || 1) - 1));
        logger.warn(`❌ [${result.gameNum}] Failed`, {
          modelA: shortA,
          modelB: shortB,
        });
      }
      
      // Immediately start a new game if we have more to run
      if (started < gamesToRun) {
        const newGame = startGame();
        if (newGame) activeGames.set(newGame, started);
      }
      
      // Log progress every 10 completions
      if (completed % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const gamesPerMin = (completed / (parseInt(elapsed) / 60)).toFixed(1);
        
        logger.info(`📊 Progress`, {
          completed,
          started,
          total: gamesToRun,
          successful,
          failed,
          inFlight: activeGames.size,
          elapsed: `${elapsed}s`,
          rate: `${gamesPerMin} games/min`,
        });
      }
      
      // Refresh model counts from DB every 50 games
      if (completed % 50 === 0) {
        modelCounts = await getModelGameCounts();
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalCounts = await getModelGameCounts();
    
    logger.info("🏁 Fast tournament complete", {
      totalGames: gamesToRun,
      successful,
      failed,
      successRate: `${((successful / gamesToRun) * 100).toFixed(1)}%`,
      scenarioCounts,
      totalDuration: `${totalDuration}s`,
      gamesPerMinute: ((gamesToRun / parseFloat(totalDuration)) * 60).toFixed(1),
      finalModelCounts: Object.fromEntries(finalCounts),
    });

    return { successful, failed, scenarioCounts, modelCounts: Object.fromEntries(finalCounts) };
  },
});
