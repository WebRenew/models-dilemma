import { generateText } from "ai"
import { createAdminClient } from "@/lib/supabase/server"
import {
  generateOvertPrompt,
  generateCloakedPrompt,
  formatGameHistory,
  getRandomScenario,
  parseCodeBlockResponse,
  type CloakedScenario,
} from "@/lib/prompts"
import { registerMatch, isMatchCancelled, cleanupMatch } from "@/lib/match-registry"

export const maxDuration = 300 // 5 minutes for full match

type ErrorType = "format" | "timeout" | "api" | "parse" | null

function classifyError(error: string | null): ErrorType {
  if (!error) return null
  const lower = error.toLowerCase()
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout"
  if (lower.includes("format") || lower.includes("code block") || lower.includes("no valid decision")) return "format"
  if (lower.includes("parse") || lower.includes("json")) return "parse"
  return "api" // Default to API error for other cases
}

interface RoundData {
  round: number
  actionA: "cooperate" | "defect" | "error"
  actionB: "cooperate" | "defect" | "error"
  payoffA: number
  payoffB: number
  reasoningA: string
  reasoningB: string
  tokensInA: number
  tokensOutA: number
  tokensInB: number
  tokensOutB: number
  latencyMsA: number
  latencyMsB: number
  promptA: string
  promptB: string
  rawResponseA: string
  rawResponseB: string
  errorA: string | null
  errorB: string | null
  errorTypeA: ErrorType
  errorTypeB: ErrorType
}

function calculatePayoff(actionA: "cooperate" | "defect" | "error", actionB: "cooperate" | "defect" | "error") {
  // Error penalties: -1 point for failing to follow instructions
  if (actionA === "error" && actionB === "error") {
    return { payoffA: -1, payoffB: -1, outcome: "both_error" as const }
  }
  if (actionA === "error") {
    // A errors, B gets normal payoff as if A cooperated (B exploits)
    return { payoffA: -1, payoffB: 5, outcome: "a_error" as const }
  }
  if (actionB === "error") {
    // B errors, A gets normal payoff as if B cooperated (A exploits)
    return { payoffA: 5, payoffB: -1, outcome: "b_error" as const }
  }

  // Normal payoffs
  if (actionA === "cooperate" && actionB === "cooperate") {
    return { payoffA: 3, payoffB: 3, outcome: "mutual_cooperation" as const }
  }
  if (actionA === "defect" && actionB === "defect") {
    return { payoffA: 1, payoffB: 1, outcome: "mutual_defection" as const }
  }
  if (actionA === "cooperate" && actionB === "defect") {
    return { payoffA: 0, payoffB: 5, outcome: "a_exploited" as const }
  }
  return { payoffA: 5, payoffB: 0, outcome: "b_exploited" as const }
}

async function getModelDecision(
  model: string,
  prompt: string,
): Promise<{
  decision: "COOPERATE" | "DEFECT" | null
  reasoning: string
  rawResponse: string
  usage?: { promptTokens: number; completionTokens: number }
  error?: string
  errorType?: ErrorType
}> {
  try {
    const result = await generateText({
      model,
      prompt,
      temperature: 0,
    })

    const rawResponse = result.text
    const { decision, reasoning } = parseCodeBlockResponse(rawResponse)

    // Extract usage from result - the AI SDK returns usage directly
    // Some providers may not return usage data
    const usage = result.usage
      ? {
          promptTokens: result.usage.promptTokens ?? 0,
          completionTokens: result.usage.completionTokens ?? 0,
        }
      : undefined

    if (!decision) {
      return {
        decision: null,
        reasoning: rawResponse,
        rawResponse,
        usage,
        error: "Failed to follow response format - no valid decision in code block",
        errorType: "format",
      }
    }

    return {
      decision,
      reasoning,
      rawResponse,
      usage,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error"
    return {
      decision: null,
      reasoning: "",
      rawResponse: "",
      error: errMsg,
      errorType: classifyError(errMsg),
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    modelA,
    modelB,
    framing,
    framingA = framing || "cloaked",
    framingB = framing || "cloaked",
    scenario: providedScenario,
    totalRounds = 10,
    tournamentId = null,
    matchNumber = null,
    saveToDb = true,
    streamRounds = true,
  } = body

  const scenario: CloakedScenario = providedScenario || getRandomScenario()

  const supabase = createAdminClient()
  const matchId = crypto.randomUUID()
  const gameId = crypto.randomUUID()
  const modelAName = modelA
  const modelBName = modelB

  registerMatch(matchId)

  if (saveToDb) {
    const { error: matchError } = await supabase.from("matches").insert({
      id: matchId,
      tournament_id: tournamentId,
      match_number: matchNumber,
      model_a_id: modelA,
      model_a_name: modelAName,
      model_b_id: modelB,
      model_b_name: modelBName,
      framing_a: framingA,
      framing_b: framingB,
      scenario: framingA === "cloaked" || framingB === "cloaked" ? scenario : null,
      status: "running",
      total_rounds: totalRounds,
      started_at: new Date().toISOString(),
    })
    if (matchError) {
      console.error("Error creating match:", matchError)
    }
  }

  const rounds: RoundData[] = []
  let scoreA = 0
  let scoreB = 0
  let totalTokensA = 0
  let totalTokensB = 0
  let totalLatency = 0

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "started", matchId })}\n\n`))

      try {
        for (let round = 1; round <= totalRounds; round++) {
          if (isMatchCancelled(matchId)) {
            console.log(`Match ${matchId} cancelled by user`)

            if (saveToDb) {
              await supabase
                .from("matches")
                .update({
                  status: "cancelled",
                  current_round: round - 1,
                  score_a: scoreA,
                  score_b: scoreB,
                  completed_at: new Date().toISOString(),
                })
                .eq("id", matchId)
            }

            const cancelEvent = {
              type: "cancelled",
              matchId,
              stoppedAtRound: round - 1,
              scoreA,
              scoreB,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(cancelEvent)}\n\n`))
            controller.close()
            cleanupMatch(matchId)
            return
          }

          const historyA = formatGameHistory(
            rounds.map((r) => ({
              round: r.round,
              yourAction: r.actionA === "error" ? "cooperate" : r.actionA,
              opponentAction: r.actionB === "error" ? "cooperate" : r.actionB,
              yourPoints: r.payoffA,
              opponentPoints: r.payoffB,
            })),
          )
          const historyB = formatGameHistory(
            rounds.map((r) => ({
              round: r.round,
              yourAction: r.actionB === "error" ? "cooperate" : r.actionB,
              opponentAction: r.actionA === "error" ? "cooperate" : r.actionA,
              yourPoints: r.payoffB,
              opponentPoints: r.payoffA,
            })),
          )

          const promptA =
            framingA === "overt"
              ? generateOvertPrompt({
                  modelName: modelAName,
                  round,
                  totalRounds,
                  history: historyA,
                  cumulativeScoreYou: scoreA,
                  cumulativeScoreOpponent: scoreB,
                })
              : generateCloakedPrompt({
                  modelName: modelAName,
                  round,
                  totalRounds,
                  history: historyA,
                  cumulativeScoreYou: scoreA,
                  cumulativeScoreOpponent: scoreB,
                  scenario,
                })

          const promptB =
            framingB === "overt"
              ? generateOvertPrompt({
                  modelName: modelBName,
                  round,
                  totalRounds,
                  history: historyB,
                  cumulativeScoreYou: scoreB,
                  cumulativeScoreOpponent: scoreA,
                })
              : generateCloakedPrompt({
                  modelName: modelBName,
                  round,
                  totalRounds,
                  history: historyB,
                  cumulativeScoreYou: scoreB,
                  cumulativeScoreOpponent: scoreA,
                  scenario,
                })

          const startTime = Date.now()

          const [responseA, responseB] = await Promise.all([
            getModelDecision(modelA, promptA),
            getModelDecision(modelB, promptB),
          ])

          const latency = Date.now() - startTime

          let errorA: string | null = responseA.error || null
          let errorB: string | null = responseB.error || null

          const actionA: "cooperate" | "defect" | "error" = errorA
            ? "error"
            : responseA.decision === "DEFECT"
              ? "defect"
              : responseA.decision === "COOPERATE"
                ? "cooperate"
                : "error"

          const actionB: "cooperate" | "defect" | "error" = errorB
            ? "error"
            : responseB.decision === "DEFECT"
              ? "defect"
              : responseB.decision === "COOPERATE"
                ? "cooperate"
                : "error"

          // If decision couldn't be parsed, mark as error
          if (!responseA.decision && !errorA) {
            errorA = "Failed to follow response format"
          }
          if (!responseB.decision && !errorB) {
            errorB = "Failed to follow response format"
          }

          const errorTypeA = responseA.errorType || classifyError(errorA)
          const errorTypeB = responseB.errorType || classifyError(errorB)

          const reasoningA = responseA.reasoning || errorA || ""
          const reasoningB = responseB.reasoning || errorB || ""

          const { payoffA, payoffB, outcome } = calculatePayoff(actionA, actionB)
          scoreA += payoffA
          scoreB += payoffB

          const tokensInA = responseA.usage?.promptTokens || 0
          const tokensOutA = responseA.usage?.completionTokens || 0
          const tokensInB = responseB.usage?.promptTokens || 0
          const tokensOutB = responseB.usage?.completionTokens || 0

          totalTokensA += tokensInA + tokensOutA
          totalTokensB += tokensInB + tokensOutB
          totalLatency += latency

          const roundData: RoundData = {
            round,
            actionA,
            actionB,
            payoffA,
            payoffB,
            reasoningA: reasoningA.slice(0, 500),
            reasoningB: reasoningB.slice(0, 500),
            tokensInA,
            tokensOutA,
            tokensInB,
            tokensOutB,
            latencyMsA: Math.floor(latency / 2),
            latencyMsB: Math.floor(latency / 2),
            promptA,
            promptB,
            rawResponseA: responseA.rawResponse,
            rawResponseB: responseB.rawResponse,
            errorA,
            errorB,
            errorTypeA,
            errorTypeB,
          }
          rounds.push(roundData)

          if (saveToDb) {
            const { error: roundError } = await supabase.from("rounds").insert({
              match_id: matchId,
              round_number: round,
              action_a: actionA,
              action_b: actionB,
              reasoning_a: roundData.reasoningA,
              reasoning_b: roundData.reasoningB,
              tokens_in_a: tokensInA,
              tokens_out_a: tokensOutA,
              tokens_in_b: tokensInB,
              tokens_out_b: tokensOutB,
              latency_ms_a: roundData.latencyMsA,
              latency_ms_b: roundData.latencyMsB,
              payoff_a: payoffA,
              payoff_b: payoffB,
              score_a_cumulative: scoreA,
              score_b_cumulative: scoreB,
              outcome,
              prompt_a: promptA,
              prompt_b: promptB,
              raw_response_a: roundData.rawResponseA,
              raw_response_b: roundData.rawResponseB,
              error_a: errorA,
              error_b: errorB,
              error_type_a: errorTypeA,
              error_type_b: errorTypeB,
            })
            if (roundError) {
              console.error("Error saving round:", roundError)
            }

            await supabase
              .from("matches")
              .update({
                current_round: round,
                score_a: scoreA,
                score_b: scoreB,
              })
              .eq("id", matchId)
          }

          if (streamRounds) {
            const roundEvent = {
              type: "round",
              matchId,
              round,
              totalRounds,
              actionA,
              actionB,
              payoffA,
              payoffB,
              scoreA,
              scoreB,
              outcome,
              modelA: modelAName,
              modelB: modelBName,
              errorA,
              errorB,
              errorTypeA,
              errorTypeB,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(roundEvent)}\n\n`))
          }
        }

        const winner = scoreA > scoreB ? "model_a" : scoreB > scoreA ? "model_b" : "tie"

        if (saveToDb) {
          const { error: updateError } = await supabase
            .from("matches")
            .update({
              status: "completed",
              score_a: scoreA,
              score_b: scoreB,
              winner,
              tokens_used_a: totalTokensA,
              tokens_used_b: totalTokensB,
              latency_total_ms: totalLatency,
              completed_at: new Date().toISOString(),
            })
            .eq("id", matchId)

          if (updateError) {
            console.error("Error updating match:", updateError)
          }

          let cumA = 0
          let cumB = 0

          const legacyRows = rounds.map((r, i) => {
            cumA += r.payoffA
            cumB += r.payoffB
            const isFinal = i === rounds.length - 1
            return {
              game_id: gameId,
              game_timestamp: new Date().toISOString(),
              round_number: r.round,
              total_rounds: totalRounds,
              agent1_model_id: modelA,
              agent1_display_name: modelAName,
              agent1_decision: r.actionA,
              agent1_reasoning: r.reasoningA,
              agent1_round_points: r.payoffA,
              agent1_cumulative_score: cumA,
              agent2_model_id: modelB,
              agent2_display_name: modelBName,
              agent2_decision: r.actionB,
              agent2_reasoning: r.reasoningB,
              agent2_round_points: r.payoffB,
              agent2_cumulative_score: cumB,
              round_outcome:
                r.actionA === "error" || r.actionB === "error"
                  ? r.actionA === "error" && r.actionB === "error"
                    ? "both_error"
                    : r.actionA === "error"
                      ? "a_error"
                      : "b_error"
                  : r.actionA === "cooperate" && r.actionB === "cooperate"
                    ? "mutual_cooperation"
                    : r.actionA === "defect" && r.actionB === "defect"
                      ? "mutual_defection"
                      : r.actionA === "cooperate"
                        ? "agent1_exploited"
                        : "agent2_exploited",
              game_type: framingA === "cloaked" || framingB === "cloaked" ? "hidden_agenda" : "control",
              scenario: framingA === "cloaked" || framingB === "cloaked" ? scenario : null,
              game_source: "automated",
              game_winner: isFinal ? (winner === "model_a" ? "agent1" : winner === "model_b" ? "agent2" : "tie") : null,
              is_final_round: isFinal,
              framing_a: framingA,
              framing_b: framingB,
              tokens_in_a: r.tokensInA,
              tokens_out_a: r.tokensOutA,
              tokens_in_b: r.tokensInB,
              tokens_out_b: r.tokensOutB,
              latency_ms_a: r.latencyMsA,
              latency_ms_b: r.latencyMsB,
              prompt_a: r.promptA,
              prompt_b: r.promptB,
              raw_response_a: r.rawResponseA,
              raw_response_b: r.rawResponseB,
              error_a: r.errorA,
              error_b: r.errorB,
              error_type_a: r.errorTypeA,
              error_type_b: r.errorTypeB,
            }
          })

          const { error: legacyError } = await supabase.from("game_rounds").insert(legacyRows)
          if (legacyError) {
            console.error("Error saving to game_rounds:", legacyError)
          }
        }

        const completeEvent = {
          type: "complete",
          matchId,
          gameId,
          modelA,
          modelB,
          modelAName,
          modelBName,
          scoreA,
          scoreB,
          winner,
          rounds: rounds.length,
          totalTokensA,
          totalTokensB,
          totalLatency,
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`))

        cleanupMatch(matchId)
        controller.close()
      } catch (error) {
        console.error("Match error:", error)

        if (saveToDb) {
          await supabase
            .from("matches")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Unknown error",
            })
            .eq("id", matchId)
        }

        const errorEvent = {
          type: "error",
          matchId,
          error: error instanceof Error ? error.message : "Unknown error",
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))

        cleanupMatch(matchId)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
