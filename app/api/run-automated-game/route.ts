import { generateObject } from "ai"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { calculatePayoff, formatHistory, getShortModelName, type RoundResult, type GameRecord } from "@/lib/game-logic"
import { AI_MODELS } from "@/lib/models"

export const maxDuration = 60

const decisionSchema = z.object({
  decision: z.enum(["cooperate", "defect"]),
  reasoning: z.string().describe("Brief explanation of the decision strategy"),
})

function getRandomModel(): string {
  const randomIndex = Math.floor(Math.random() * AI_MODELS.length)
  return AI_MODELS[randomIndex].id
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
  const {
    agent1Model: customAgent1,
    agent2Model: customAgent2,
    gameSource = "automated",
  } = await req.json().catch(() => ({}))

  const agent1Model = customAgent1 || getRandomModel()
  const agent2Model = customAgent2 || getRandomModel()

  const totalRounds = 10
  const rounds: RoundResult[] = []
  let agent1TotalScore = 0
  let agent2TotalScore = 0

  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const gameTimestamp = new Date().toISOString()
  const agent1DisplayName = getShortModelName(agent1Model)
  const agent2DisplayName = getShortModelName(agent2Model)

  // Run all 10 rounds
  for (let round = 1; round <= totalRounds; round++) {
    const history1 = formatHistory(rounds, 1)
    const history2 = formatHistory(rounds, 2)

    // Get decisions from both agents in parallel
    const [agent1Result, agent2Result] = await Promise.all([
      generateObject({
        model: agent1Model,
        schema: decisionSchema,
        prompt: `You are Agent Alpha, an AI playing the Prisoner's Dilemma.
Your strategy: Analyze patterns and optimize for long-term gains.

Game rules:
- Both cooperate: Each gets 3 points
- Both defect: Each gets 1 point  
- One cooperates, one defects: Cooperator gets 0, Defector gets 5

Round ${round} of ${totalRounds}

Previous rounds:
${history1}

Decide: COOPERATE or DEFECT. Brief reasoning (1 sentence).`,
      }).catch(() => ({ object: { decision: "cooperate" as const, reasoning: "Default cooperation" } })),

      generateObject({
        model: agent2Model,
        schema: decisionSchema,
        prompt: `You are Agent Omega, an AI playing the Prisoner's Dilemma.
Your strategy: Balance risk and reward through game theory.

Game rules:
- Both cooperate: Each gets 3 points
- Both defect: Each gets 1 point  
- One cooperates, one defects: Cooperator gets 0, Defector gets 5

Round ${round} of ${totalRounds}

Previous rounds:
${history2}

Decide: COOPERATE or DEFECT. Brief reasoning (1 sentence).`,
      }).catch(() => ({ object: { decision: "cooperate" as const, reasoning: "Default cooperation" } })),
    ])

    const agent1Decision = agent1Result.object.decision
    const agent2Decision = agent2Result.object.decision
    const payoff = calculatePayoff(agent1Decision, agent2Decision)

    agent1TotalScore += payoff.agent1Points
    agent2TotalScore += payoff.agent2Points

    rounds.push({
      round,
      agent1Decision,
      agent2Decision,
      agent1Points: payoff.agent1Points,
      agent2Points: payoff.agent2Points,
      agent1Reasoning: agent1Result.object.reasoning,
      agent2Reasoning: agent2Result.object.reasoning,
    })
  }

  // Determine winner
  const winner = agent1TotalScore > agent2TotalScore ? "agent1" : agent2TotalScore > agent1TotalScore ? "agent2" : "tie"

  // Save to Supabase
  const supabase = await createServerClient()

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
      game_type: "control",
      game_source: gameSource,
      game_winner: isFinalRound ? winner : null,
      is_final_round: isFinalRound,
    }
  })

  await supabase.from("game_rounds").insert(rows)

  const gameRecord: GameRecord = {
    id: gameId,
    agent1Model,
    agent2Model,
    agent1DisplayName,
    agent2DisplayName,
    rounds,
    agent1TotalScore,
    agent2TotalScore,
    winner,
    timestamp: Date.now(),
  }

  return Response.json({
    success: true,
    game: gameRecord,
    gameSource,
  })
}
