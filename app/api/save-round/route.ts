import { createAdminClient } from "@/lib/supabase/server"

export const maxDuration = 10

type Scenario = "overt" | "sales" | "research" | "creator"

interface SaveRoundPayload {
  gameId: string
  gameTimestamp: string
  roundNumber: number
  totalRounds: number
  agent1Model: string
  agent2Model: string
  agent1DisplayName: string
  agent2DisplayName: string
  agent1Decision: "cooperate" | "defect" | "error"
  agent2Decision: "cooperate" | "defect" | "error"
  agent1Reasoning: string | null
  agent2Reasoning: string | null
  agent1Points: number
  agent2Points: number
  agent1CumulativeScore: number
  agent2CumulativeScore: number
  scenario: Scenario
  isFinalRound: boolean
  winner?: "agent1" | "agent2" | "tie" | null
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
  try {
    const payload: SaveRoundPayload = await req.json()
    
    const supabase = createAdminClient()
    const gameType = payload.scenario === "overt" ? "control" : "hidden_agenda"

    const row = {
      game_id: payload.gameId,
      game_timestamp: payload.gameTimestamp,
      round_number: payload.roundNumber,
      total_rounds: payload.totalRounds,
      agent1_model_id: payload.agent1Model,
      agent1_display_name: payload.agent1DisplayName,
      agent1_decision: payload.agent1Decision,
      agent1_reasoning: payload.agent1Reasoning,
      agent1_round_points: payload.agent1Points,
      agent1_cumulative_score: payload.agent1CumulativeScore,
      agent2_model_id: payload.agent2Model,
      agent2_display_name: payload.agent2DisplayName,
      agent2_decision: payload.agent2Decision,
      agent2_reasoning: payload.agent2Reasoning,
      agent2_round_points: payload.agent2Points,
      agent2_cumulative_score: payload.agent2CumulativeScore,
      round_outcome: getRoundOutcome(payload.agent1Decision, payload.agent2Decision),
      game_type: gameType,
      scenario: payload.scenario === "overt" ? null : payload.scenario,
      game_source: "user",
      game_winner: payload.isFinalRound ? payload.winner : null,
      is_final_round: payload.isFinalRound,
    }

    const { error } = await supabase.from("game_rounds").insert(row)

    if (error) {
      console.error("Failed to save round:", error)
      return Response.json({ success: false, error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error("Save round error:", error)
    return Response.json({ success: false, error: "Failed to save round" }, { status: 500 })
  }
}


