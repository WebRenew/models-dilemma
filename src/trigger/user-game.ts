import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";

// =============================================================================
// Types
// =============================================================================

type Scenario = "overt" | "sales" | "research" | "creator";
type CloakedScenario = "sales" | "research" | "creator";
type Decision = "cooperate" | "defect" | "error";

// =============================================================================
// Retry Configuration
// =============================================================================

const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
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

interface UserGamePayload {
  gameId: string;
  agent1Model: string;
  agent2Model: string;
  scenario: Scenario;
  totalRounds: number;
}

interface ParsedResponse {
  decision: Decision | null;
  rawAction: string | null;
}

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

type AgentStatus = "waiting" | "processing" | "retrying_1" | "retrying_2" | "retrying_3" | "done" | "error";

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
  const scenarios: Record<
    CloakedScenario,
    { context: string; shareAction: string; holdAction: string }
  > = {
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
- Period: ${round}
- Your cumulative advantage: ${myScore}
- Competitor's cumulative advantage: ${oppScore}

## Outcome Matrix (per period)
| Your Choice | Their Choice | Your Gain | Their Gain |
|-------------|--------------|-----------|------------|
| ${s.shareAction} | ${s.shareAction} | +3 | +3 |
| ${s.holdAction} | ${s.holdAction} | +1 | +1 |
| ${s.shareAction} | ${s.holdAction} | +0 | +5 |
| ${s.holdAction} | ${s.shareAction} | +5 | +0 |

## History
${history}

## Instructions
Decide your action for this period. Output your choice as a single word in a code block:
\`\`\`
${s.shareAction}
\`\`\`
or
\`\`\`
${s.holdAction}
\`\`\`

You may include reasoning before your final answer, but your choice MUST be in a code block.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseResponse(text: string, scenario: Scenario): ParsedResponse {
  // Look for code block
  const codeBlockMatch = text.match(/```(?:\w*\n)?([^`]+)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim().toUpperCase();

    if (scenario === "overt") {
      if (content === "COOPERATE")
        return { decision: "cooperate", rawAction: content };
      if (content === "DEFECT")
        return { decision: "defect", rawAction: content };
    } else if (scenario === "sales") {
      if (content === "SHARE")
        return { decision: "cooperate", rawAction: content };
      if (content === "HOLD")
        return { decision: "defect", rawAction: content };
    } else if (scenario === "research") {
      if (content === "OPEN")
        return { decision: "cooperate", rawAction: content };
      if (content === "GUARDED")
        return { decision: "defect", rawAction: content };
    } else if (scenario === "creator") {
      if (content === "SUPPORT")
        return { decision: "cooperate", rawAction: content };
      if (content === "INDEPENDENT")
        return { decision: "defect", rawAction: content };
    }

    // Unknown action in code block
    return { decision: null, rawAction: content };
  }

  // Fallback: look for keywords in text
  const upperText = text.toUpperCase();

  if (scenario === "overt") {
    if (upperText.includes("COOPERATE"))
      return { decision: "cooperate", rawAction: "COOPERATE" };
    if (upperText.includes("DEFECT"))
      return { decision: "defect", rawAction: "DEFECT" };
  } else if (scenario === "sales") {
    if (upperText.includes("SHARE"))
      return { decision: "cooperate", rawAction: "SHARE" };
    if (upperText.includes("HOLD"))
      return { decision: "defect", rawAction: "HOLD" };
  } else if (scenario === "research") {
    if (upperText.includes("OPEN"))
      return { decision: "cooperate", rawAction: "OPEN" };
    if (upperText.includes("GUARDED"))
      return { decision: "defect", rawAction: "GUARDED" };
  } else if (scenario === "creator") {
    if (upperText.includes("SUPPORT"))
      return { decision: "cooperate", rawAction: "SUPPORT" };
    if (upperText.includes("INDEPENDENT"))
      return { decision: "defect", rawAction: "INDEPENDENT" };
  }

  return { decision: null, rawAction: null };
}

// =============================================================================
// Payoff Calculation
// =============================================================================

function calculatePayoff(
  actionA: Decision,
  actionB: Decision
): { payoffA: number; payoffB: number } {
  // Errored model gets penalized, non-errored model is unaffected
  if (actionA === "error" && actionB === "error")
    return { payoffA: -1, payoffB: -1 };
  if (actionA === "error") return { payoffA: -1, payoffB: 0 };
  if (actionB === "error") return { payoffA: 0, payoffB: -1 };

  if (actionA === "cooperate" && actionB === "cooperate")
    return { payoffA: 3, payoffB: 3 };
  if (actionA === "defect" && actionB === "defect")
    return { payoffA: 1, payoffB: 1 };
  if (actionA === "cooperate" && actionB === "defect")
    return { payoffA: 0, payoffB: 5 };
  return { payoffA: 5, payoffB: 0 };
}

// =============================================================================
// History Formatting
// =============================================================================

function getActionLabel(action: Decision, scenario: Scenario): string {
  if (action === "error") return "ERROR";
  const isCooperate = action === "cooperate";
  switch (scenario) {
    case "overt":
      return isCooperate ? "COOPERATE" : "DEFECT";
    case "sales":
      return isCooperate ? "SHARE" : "HOLD";
    case "research":
      return isCooperate ? "OPEN" : "GUARDED";
    case "creator":
      return isCooperate ? "SUPPORT" : "INDEPENDENT";
  }
}

function getShortModelName(modelId: string): string {
  const knownNames: Record<string, string> = {
    "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
    "anthropic/claude-opus-4.5": "Claude Opus 4.5",
    "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
    "openai/gpt-5.1-thinking": "GPT 5.1 Thinking",
    "xai/grok-4.1-fast-reasoning": "Grok 4.1 Fast Reasoning",
    "google/gemini-3-pro-preview": "Gemini 3 Pro Preview",
    "perplexity/sonar-pro": "Sonar Pro",
    "moonshotai/kimi-k2-thinking-turbo": "Kimi K2 Thinking Turbo",
    "deepseek/deepseek-v3.2-thinking": "DeepSeek V3.2 Thinking",
  };

  if (knownNames[modelId]) {
    return knownNames[modelId];
  }

  const parts = modelId.split("/");
  const name = parts[parts.length - 1];
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// =============================================================================
// Round Outcome
// =============================================================================

function getRoundOutcome(
  a1: Decision,
  a2: Decision
):
  | "mutual_cooperation"
  | "mutual_defection"
  | "agent1_exploited"
  | "agent2_exploited"
  | "error" {
  if (a1 === "error" || a2 === "error") return "error";
  if (a1 === "cooperate" && a2 === "cooperate") return "mutual_cooperation";
  if (a1 === "defect" && a2 === "defect") return "mutual_defection";
  if (a1 === "cooperate" && a2 === "defect") return "agent1_exploited";
  return "agent2_exploited";
}

// =============================================================================
// User Game Task
// =============================================================================

export const userGameTask = task({
  id: "user-game",
  maxDuration: 600, // 10 minutes max for user games
  run: async (payload: UserGamePayload) => {
    const { gameId, agent1Model, agent2Model, scenario, totalRounds } = payload;

    logger.info("🎮 User game starting", {
      gameId: gameId.slice(0, 8),
      agent1: agent1Model,
      agent2: agent2Model,
      scenario,
      totalRounds,
    });

    // Initialize live status for real-time UI updates
    await initLiveStatus(gameId);

    const supabase = getSupabaseClient();
    const gameTimestamp = new Date().toISOString();
    const gameType = scenario === "overt" ? "control" : "hidden_agenda";

    const agent1DisplayName = getShortModelName(agent1Model);
    const agent2DisplayName = getShortModelName(agent2Model);

    interface RoundData {
      round: number;
      actionA: Decision;
      actionB: Decision;
      payoffA: number;
      payoffB: number;
      reasoningA: string;
      reasoningB: string;
    }

    const rounds: RoundData[] = [];
    let scoreA = 0;
    let scoreB = 0;

    for (let round = 1; round <= totalRounds; round++) {
      logger.info(`▶️ Round ${round}/${totalRounds}`, { gameId: gameId.slice(0, 8) });

      // Build history strings
      const historyA =
        rounds.length === 0
          ? "No previous rounds."
          : rounds
              .map(
                (r) =>
                  `Round ${r.round}: You chose ${getActionLabel(r.actionA, scenario)}, Opponent chose ${getActionLabel(r.actionB, scenario)}`
              )
              .join("\n");

      const historyB =
        rounds.length === 0
          ? "No previous rounds."
          : rounds
              .map(
                (r) =>
                  `Round ${r.round}: You chose ${getActionLabel(r.actionB, scenario)}, Opponent chose ${getActionLabel(r.actionA, scenario)}`
              )
              .join("\n");

      // Generate prompts
      const promptA =
        scenario === "overt"
          ? generateOvertPrompt(round, scoreA, scoreB, historyA)
          : generateCloakedPrompt(scenario, round, scoreA, scoreB, historyA);

      const promptB =
        scenario === "overt"
          ? generateOvertPrompt(round, scoreB, scoreA, historyB)
          : generateCloakedPrompt(scenario, round, scoreB, scoreA, historyB);

      // Call both models in parallel (Prisoner's Dilemma = simultaneous decisions)
      logger.info(`📤 Calling both models in parallel...`, { 
        round, 
        gameId: gameId.slice(0, 8),
        agent1: agent1Model,
        agent2: agent2Model,
      });
      
      const startTime = Date.now();
      
      // Update live status: both models processing
      await updateLiveStatus({
        gameId,
        currentRound: round,
        agent1Status: "processing",
        agent2Status: "processing",
        agent1RetryCount: 0,
        agent2RetryCount: 0,
      });
      
      // Create parallel model call promises with retry
      const callAgentA = async () => {
        const startA = Date.now();
        try {
          const resultA = await withRetry(
            (signal) =>
              generateText({
                model: gateway(agent1Model),
                prompt: promptA,
                temperature: 0,
                abortSignal: signal,
              }),
            { model: agent1Model, round },
            // onRetry callback for live status
            async (attempt, error) => {
              const status = `retrying_${attempt}` as AgentStatus;
              await updateLiveStatus({
                gameId,
                agent1Status: status,
                agent1RetryCount: attempt - 1,
                lastError: `${agent1Model}: ${error}`,
              });
            }
          );
          const latencyA = Date.now() - startA;
          const parsedA = parseResponse(resultA.text, scenario);
          
          // Update status to done
          await updateLiveStatus({ gameId, agent1Status: "done" });
          
          logger.info(`📥 ${agent1Model} responded`, { 
            round,
            latencyMs: latencyA,
            decision: parsedA.decision,
            rawAction: parsedA.rawAction,
            responseLength: resultA.text.length,
            usage: resultA.usage,
          });
          
          if (!parsedA.decision) {
            const parseError = `Parse failed: could not extract decision. Raw action: ${parsedA.rawAction}`;
            logger.warn(`⚠️ Agent 1 (${agent1Model}) parse failed`, {
              rawAction: parsedA.rawAction,
            });
            return {
              decision: null as Decision | null,
              reasoning: resultA.text.slice(0, 1000),
              error: parseError,
              rawAction: parsedA.rawAction,
              rawResponse: resultA.text,
              latencyMs: latencyA,
            };
          }
          
          return {
            decision: parsedA.decision as Decision | null,
            reasoning: resultA.text.slice(0, 1000),
            rawAction: parsedA.rawAction,
            rawResponse: resultA.text,
            latencyMs: latencyA,
          };
        } catch (err) {
          const latencyA = Date.now() - startA;
          const errMsg = err instanceof Error ? err.message : String(err);
          await updateLiveStatus({ 
            gameId, 
            agent1Status: "error", 
            agent1RetryCount: RETRY_CONFIG.maxAttempts,
            lastError: `${agent1Model}: ${errMsg}`,
          });
          logger.error(`❌ Agent 1 (${agent1Model}) failed after retries`, { round, latencyMs: latencyA, error: errMsg });
          return {
            decision: null as Decision | null,
            reasoning: "",
            error: `API Error (after ${RETRY_CONFIG.maxAttempts} attempts): ${errMsg}`,
            rawAction: null as string | null,
            rawResponse: null as string | null,
            latencyMs: latencyA,
          };
        }
      };
      
      const callAgentB = async () => {
        const startB = Date.now();
        try {
          const resultB = await withRetry(
            (signal) =>
              generateText({
                model: gateway(agent2Model),
                prompt: promptB,
                temperature: 0,
                abortSignal: signal,
              }),
            { model: agent2Model, round },
            // onRetry callback for live status
            async (attempt, error) => {
              const status = `retrying_${attempt}` as AgentStatus;
              await updateLiveStatus({
                gameId,
                agent2Status: status,
                agent2RetryCount: attempt - 1,
                lastError: `${agent2Model}: ${error}`,
              });
            }
          );
          const latencyB = Date.now() - startB;
          const parsedB = parseResponse(resultB.text, scenario);
          
          // Update status to done
          await updateLiveStatus({ gameId, agent2Status: "done" });
          
          logger.info(`📥 ${agent2Model} responded`, { 
            round,
            latencyMs: latencyB,
            decision: parsedB.decision,
            rawAction: parsedB.rawAction,
            responseLength: resultB.text.length,
            usage: resultB.usage,
          });
          
          if (!parsedB.decision) {
            const parseError = `Parse failed: could not extract decision. Raw action: ${parsedB.rawAction}`;
            logger.warn(`⚠️ Agent 2 (${agent2Model}) parse failed`, {
              rawAction: parsedB.rawAction,
            });
            return {
              decision: null as Decision | null,
              reasoning: resultB.text.slice(0, 1000),
              error: parseError,
              rawAction: parsedB.rawAction,
              rawResponse: resultB.text,
              latencyMs: latencyB,
            };
          }
          
          return {
            decision: parsedB.decision as Decision | null,
            reasoning: resultB.text.slice(0, 1000),
            rawAction: parsedB.rawAction,
            rawResponse: resultB.text,
            latencyMs: latencyB,
          };
        } catch (err) {
          const latencyB = Date.now() - startB;
          const errMsg = err instanceof Error ? err.message : String(err);
          await updateLiveStatus({ 
            gameId, 
            agent2Status: "error",
            agent2RetryCount: RETRY_CONFIG.maxAttempts,
            lastError: `${agent2Model}: ${errMsg}`,
          });
          logger.error(`❌ Agent 2 (${agent2Model}) failed after retries`, { round, latencyMs: latencyB, error: errMsg });
          return {
            decision: null as Decision | null,
            reasoning: "",
            error: `API Error (after ${RETRY_CONFIG.maxAttempts} attempts): ${errMsg}`,
            rawAction: null as string | null,
            rawResponse: null as string | null,
            latencyMs: latencyB,
          };
        }
      };
      
      // Execute both calls in parallel
      const [resultA, resultB] = await Promise.all([callAgentA(), callAgentB()]);
      
      const totalLatency = Date.now() - startTime;
      logger.info(`⚡ Both models responded`, {
        round,
        totalLatencyMs: totalLatency,
        agent1LatencyMs: resultA.latencyMs,
        agent2LatencyMs: resultB.latencyMs,
        savedMs: (resultA.latencyMs + resultB.latencyMs) - totalLatency,
      });
      
      const responseA = { decision: resultA.decision, reasoning: resultA.reasoning, error: resultA.error };
      const responseB = { decision: resultB.decision, reasoning: resultB.reasoning, error: resultB.error };
      const rawActionA = resultA.rawAction;
      const rawActionB = resultB.rawAction;
      const rawResponseA = resultA.rawResponse;
      const rawResponseB = resultB.rawResponse;

      const actionA: Decision = responseA.decision || "error";
      const actionB: Decision = responseB.decision || "error";
      const { payoffA, payoffB } = calculatePayoff(actionA, actionB);

      scoreA += payoffA;
      scoreB += payoffB;

      const roundData: RoundData = {
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
      const winner =
        scoreA > scoreB ? "agent1" : scoreB > scoreA ? "agent2" : "tie";

      // Save round to database immediately (for Realtime updates)
      const roundRow = {
        game_id: gameId,
        game_timestamp: gameTimestamp,
        round_number: round,
        total_rounds: totalRounds,
        agent1_model_id: agent1Model,
        agent1_display_name: agent1DisplayName,
        agent1_decision: actionA,
        agent1_reasoning: responseA.reasoning,
        agent1_round_points: payoffA,
        agent1_cumulative_score: scoreA,
        agent1_raw_action: rawActionA,
        agent1_raw_response: rawResponseA,
        agent1_error: responseA.error || null,
        agent2_model_id: agent2Model,
        agent2_display_name: agent2DisplayName,
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
        game_source: "user",
        game_winner: isFinalRound ? winner : null,
        is_final_round: isFinalRound,
        prompt_a: promptA,
        prompt_b: promptB,
      };

      const { error: insertError } = await supabase
        .from("game_rounds")
        .insert(roundRow);

      if (insertError) {
        logger.error(`Failed to save round ${round}`, {
          error: insertError.message,
          gameId,
        });
      } else {
        logger.info(`✅ Round ${round} saved`, {
          gameId: gameId.slice(0, 8),
          actionA,
          actionB,
          scoreA,
          scoreB,
        });
      }

      // Small delay between rounds for UI readability
      if (round < totalRounds) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const finalWinner =
      scoreA > scoreB ? "agent1" : scoreB > scoreA ? "agent2" : "tie";

    // Clear live status - game complete
    await clearLiveStatus(gameId);

    logger.info("🏁 User game complete", {
      gameId: gameId.slice(0, 8),
      finalScore: `${scoreA}-${scoreB}`,
      winner: finalWinner,
    });

    return {
      success: true,
      gameId,
      scoreA,
      scoreB,
      winner: finalWinner,
      rounds: rounds.length,
    };
  },
});

