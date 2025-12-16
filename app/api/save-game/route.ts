import { createAdminClient } from "@/lib/supabase/server"
import { type RoundResult } from "@/lib/game-logic"
import {
  getClientIP,
  checkRateLimit,
  isValidModelId,
  rateLimitResponse,
} from "@/lib/api-security"

export const maxDuration = 30

type Scenario = "overt" | "sales" | "research" | "creator"

interface SaveGamePayload {
  gameId: string
  agent1Model: string
  agent2Model: string
  agent1DisplayName: string
  agent2DisplayName: string
  rounds: RoundResult[]
  agent1TotalScore: number
  agent2TotalScore: number
  winner: "agent1" | "agent2" | "tie"
  scenario: Scenario
  gameSource?: string
}

function getRoundOutcome(
  agent1Decision: "cooperate" | "defect" | "error",
  agent2Decision: "cooperate" | "defect" | "error",
): "mutual_cooperation" | "mutual_defection" | "agent1_exploited" | "agent2_exploited" | "error" {
  if (agent1Decision === "error" || agent2Decision === "error") return "error"
  if (agent1Decision === "cooperate" && agent2Decision === "cooperate") return "mutual_cooperation"
  if (agent1Decision === "defect" && agent2Decision === "defect") return "mutual_defection"
  if (agent1Decision === "cooperate" && agent2Decision === "defect") return "agent1_exploited"
  return "agent2_exploited"
}

export async function POST(req: Request) {
  // Security: Rate limiting
  const clientIP = getClientIP(req)
  const rateLimit = checkRateLimit(clientIP)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn)
  }

  try {
    const payload: SaveGamePayload = await req.json()
    
    const {
      gameId,
      agent1Model,
      agent2Model,
      agent1DisplayName,
      agent2DisplayName,
      rounds,
      winner,
      scenario,
      gameSource = "user",
    } = payload

    if (!gameId || !rounds || rounds.length === 0) {
      return Response.json({ success: false, error: "Invalid payload" }, { status: 400 })
    }

    // Security: Validate model IDs are from allowlist
    if (!isValidModelId(agent1Model) || !isValidModelId(agent2Model)) {
      return Response.json({ success: false, error: "Invalid model ID" }, { status: 400 })
    }

    // Security: Limit rounds to prevent abuse
    if (rounds.length > 100) {
      return Response.json({ success: false, error: "Too many rounds" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const gameTimestamp = new Date().toISOString()
    const totalRounds = rounds.length

    // Determine game_type based on scenario
    const gameType = scenario === "overt" ? "control" : "hidden_agenda"

    let cumulativeScore1 = 0
    let cumulativeScore2 = 0

    const rows = rounds.map((round, index) => {
      cumulativeScore1 += round.agent1Points
      cumulativeScore2 += round.agent2Points
      const isFinalRound = index === rounds.length - 1

      return {
        game_id: gameId,
        game_timestamp: gameTimestamp,
        round_number: round.round,
        total_rounds: totalRounds,
        agent1_model_id: agent1Model,
        agent1_display_name: agent1DisplayName,
        agent1_decision: round.agent1Decision,
        agent1_reasoning: round.agent1Reasoning || null,
        agent1_round_points: round.agent1Points,
        agent1_cumulative_score: cumulativeScore1,
        agent2_model_id: agent2Model,
        agent2_display_name: agent2DisplayName,
        agent2_decision: round.agent2Decision,
        agent2_reasoning: round.agent2Reasoning || null,
        agent2_round_points: round.agent2Points,
        agent2_cumulative_score: cumulativeScore2,
        round_outcome: getRoundOutcome(round.agent1Decision, round.agent2Decision),
        game_type: gameType,
        scenario: scenario === "overt" ? null : scenario,
        game_source: gameSource,
        game_winner: isFinalRound ? winner : null,
        is_final_round: isFinalRound,
      }
    })

    const { error } = await supabase.from("game_rounds").insert(rows)

    if (error) {
      console.error("Failed to save game:", error)
      return Response.json({ success: false, error: error.message }, { status: 500 })
    }

    return Response.json({
      success: true,
      gameId,
      roundsSaved: rows.length,
    })
  } catch (error) {
    console.error("Save game error:", error)
    return Response.json({ success: false, error: "Failed to save game" }, { status: 500 })
  }
}

