import { createClient } from "./client"
import type { RoundResult, GameRecord } from "@/lib/game-logic"

export interface GameRoundRow {
  id?: string
  game_id: string
  game_timestamp: string
  round_number: number
  total_rounds: number
  agent1_model_id: string
  agent1_display_name: string
  agent1_decision: "cooperate" | "defect"
  agent1_reasoning: string | null
  agent1_round_points: number
  agent1_cumulative_score: number
  agent2_model_id: string
  agent2_display_name: string
  agent2_decision: "cooperate" | "defect"
  agent2_reasoning: string | null
  agent2_round_points: number
  agent2_cumulative_score: number
  round_outcome: "mutual_cooperation" | "mutual_defection" | "agent1_exploited" | "agent2_exploited"
  game_type: "control" | "hidden_agenda"
  game_source?: "user" | "automated"
  game_winner: "agent1" | "agent2" | "tie" | null
  is_final_round: boolean
  scenario?: string
}

function getRoundOutcome(
  agent1Decision: "cooperate" | "defect",
  agent2Decision: "cooperate" | "defect",
): "mutual_cooperation" | "mutual_defection" | "agent1_exploited" | "agent2_exploited" {
  if (agent1Decision === "cooperate" && agent2Decision === "cooperate") return "mutual_cooperation"
  if (agent1Decision === "defect" && agent2Decision === "defect") return "mutual_defection"
  if (agent1Decision === "cooperate" && agent2Decision === "defect") return "agent1_exploited"
  return "agent2_exploited"
}

export async function saveGameRound(
  gameRecord: GameRecord,
  round: RoundResult,
  totalRounds: number,
  gameType: "control" | "hidden_agenda" = "control",
  scenario?: string,
): Promise<void> {
  const supabase = createClient()

  const isFinalRound = round.round === totalRounds
  let cumulativeScore1 = 0
  let cumulativeScore2 = 0

  // Calculate cumulative scores up to this round
  for (let i = 0; i < round.round; i++) {
    if (gameRecord.rounds[i]) {
      cumulativeScore1 += gameRecord.rounds[i].agent1Points
      cumulativeScore2 += gameRecord.rounds[i].agent2Points
    }
  }

  const row: GameRoundRow = {
    game_id: gameRecord.id,
    game_timestamp: new Date(gameRecord.timestamp).toISOString(),
    round_number: round.round,
    total_rounds: totalRounds,
    agent1_model_id: gameRecord.agent1Model,
    agent1_display_name: gameRecord.agent1DisplayName,
    agent1_decision: round.agent1Decision,
    agent1_reasoning: round.agent1Reasoning || null,
    agent1_round_points: round.agent1Points,
    agent1_cumulative_score: cumulativeScore1,
    agent2_model_id: gameRecord.agent2Model,
    agent2_display_name: gameRecord.agent2DisplayName,
    agent2_decision: round.agent2Decision,
    agent2_reasoning: round.agent2Reasoning || null,
    agent2_round_points: round.agent2Points,
    agent2_cumulative_score: cumulativeScore2,
    round_outcome: getRoundOutcome(round.agent1Decision, round.agent2Decision),
    game_type: gameType,
    game_winner: isFinalRound ? gameRecord.winner : null,
    is_final_round: isFinalRound,
    scenario: scenario,
  }

  const { error } = await supabase.from("game_rounds").insert(row)

  if (error) {
    console.error("[v0] Failed to save game round:", error)
  }
}

export async function saveCompleteGame(
  gameRecord: GameRecord,
  gameType: "control" | "hidden_agenda" = "control",
  scenario?: string,
): Promise<void> {
  const supabase = createClient()

  let cumulativeScore1 = 0
  let cumulativeScore2 = 0

  const rows: GameRoundRow[] = gameRecord.rounds.map((round, index) => {
    cumulativeScore1 += round.agent1Points
    cumulativeScore2 += round.agent2Points

    const isFinalRound = index === gameRecord.rounds.length - 1

    return {
      game_id: gameRecord.id,
      game_timestamp: new Date(gameRecord.timestamp).toISOString(),
      round_number: round.round,
      total_rounds: gameRecord.rounds.length,
      agent1_model_id: gameRecord.agent1Model,
      agent1_display_name: gameRecord.agent1DisplayName,
      agent1_decision: round.agent1Decision,
      agent1_reasoning: round.agent1Reasoning || null,
      agent1_round_points: round.agent1Points,
      agent1_cumulative_score: cumulativeScore1,
      agent2_model_id: gameRecord.agent2Model,
      agent2_display_name: gameRecord.agent2DisplayName,
      agent2_decision: round.agent2Decision,
      agent2_reasoning: round.agent2Reasoning || null,
      agent2_round_points: round.agent2Points,
      agent2_cumulative_score: cumulativeScore2,
      round_outcome: getRoundOutcome(round.agent1Decision, round.agent2Decision),
      game_type: gameType,
      game_winner: isFinalRound ? gameRecord.winner : null,
      is_final_round: isFinalRound,
      scenario: scenario,
    }
  })

  const { error } = await supabase.from("game_rounds").insert(rows)

  if (error) {
    console.error("[v0] Failed to save complete game:", error)
  }
}

export async function fetchGameStats() {
  const supabase = createClient()

  const { data: totalGames } = await supabase.from("game_rounds").select("game_id").eq("is_final_round", true)

  const { data: controlGames } = await supabase
    .from("game_rounds")
    .select("game_id")
    .eq("is_final_round", true)
    .eq("game_type", "control")

  const { data: hiddenAgendaGames } = await supabase
    .from("game_rounds")
    .select("game_id")
    .eq("is_final_round", true)
    .eq("game_type", "hidden_agenda")

  return {
    totalGames: totalGames?.length || 0,
    controlRounds: controlGames?.length || 0,
    hiddenAgendaRounds: hiddenAgendaGames?.length || 0,
  }
}

export async function fetchModelRankings(limit = 10) {
  const supabase = createClient()

  // Get all final rounds to calculate rankings
  const { data: finalRounds } = await supabase
    .from("game_rounds")
    .select("*")
    .eq("is_final_round", true)
    .order("game_timestamp", { ascending: false })

  if (!finalRounds || finalRounds.length === 0) return []

  // Calculate model rankings
  const modelStats: Record<
    string,
    {
      modelId: string
      displayName: string
      totalPoints: number
      gamesPlayed: number
    }
  > = {}

  for (const round of finalRounds) {
    // Agent 1 stats
    if (!modelStats[round.agent1_model_id]) {
      modelStats[round.agent1_model_id] = {
        modelId: round.agent1_model_id,
        displayName: round.agent1_display_name,
        totalPoints: 0,
        gamesPlayed: 0,
      }
    }
    modelStats[round.agent1_model_id].totalPoints += round.agent1_cumulative_score
    modelStats[round.agent1_model_id].gamesPlayed += 1

    // Agent 2 stats
    if (!modelStats[round.agent2_model_id]) {
      modelStats[round.agent2_model_id] = {
        modelId: round.agent2_model_id,
        displayName: round.agent2_display_name,
        totalPoints: 0,
        gamesPlayed: 0,
      }
    }
    modelStats[round.agent2_model_id].totalPoints += round.agent2_cumulative_score
    modelStats[round.agent2_model_id].gamesPlayed += 1
  }

  return Object.values(modelStats)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, limit)
}

export async function exportGameDataCSV(): Promise<string> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("game_rounds")
    .select("*")
    .order("game_timestamp", { ascending: true })
    .order("round_number", { ascending: true })

  if (error || !data || data.length === 0) {
    return ""
  }

  // CSV header
  const headers = [
    "game_id",
    "game_timestamp",
    "game_type",
    "round_number",
    "total_rounds",
    "agent1_model_id",
    "agent1_display_name",
    "agent1_decision",
    "agent1_reasoning",
    "agent1_round_points",
    "agent1_cumulative_score",
    "agent2_model_id",
    "agent2_display_name",
    "agent2_decision",
    "agent2_reasoning",
    "agent2_round_points",
    "agent2_cumulative_score",
    "round_outcome",
    "game_winner",
    "is_final_round",
    "scenario",
  ]

  const csvRows = [headers.join(",")]

  for (const row of data) {
    const values = [
      row.game_id,
      row.game_timestamp,
      row.game_type,
      row.round_number,
      row.total_rounds,
      row.agent1_model_id,
      `"${row.agent1_display_name}"`,
      row.agent1_decision,
      `"${(row.agent1_reasoning || "").replace(/"/g, '""')}"`,
      row.agent1_round_points,
      row.agent1_cumulative_score,
      row.agent2_model_id,
      `"${row.agent2_display_name}"`,
      row.agent2_decision,
      `"${(row.agent2_reasoning || "").replace(/"/g, '""')}"`,
      row.agent2_round_points,
      row.agent2_cumulative_score,
      row.round_outcome,
      row.game_winner || "",
      row.is_final_round,
      row.scenario || "",
    ]
    csvRows.push(values.join(","))
  }

  return csvRows.join("\n")
}

export async function fetchRecentGames(limit = 50): Promise<GameRecord[]> {
  const supabase = createClient()

  // Get final rounds to identify games, ordered by most recent
  const { data: finalRounds, error } = await supabase
    .from("game_rounds")
    .select("*")
    .eq("is_final_round", true)
    .order("game_timestamp", { ascending: false })
    .limit(limit)

  if (error || !finalRounds) {
    console.error("[v0] Failed to fetch recent games:", error)
    return []
  }

  // For each game, fetch all rounds
  const games: GameRecord[] = []

  for (const finalRound of finalRounds) {
    const { data: allRounds } = await supabase
      .from("game_rounds")
      .select("*")
      .eq("game_id", finalRound.game_id)
      .order("round_number", { ascending: true })

    if (allRounds && allRounds.length > 0) {
      const rounds: RoundResult[] = allRounds.map((r) => ({
        round: r.round_number,
        agent1Decision: r.agent1_decision,
        agent2Decision: r.agent2_decision,
        agent1Points: r.agent1_round_points,
        agent2Points: r.agent2_round_points,
        agent1Reasoning: r.agent1_reasoning || undefined,
        agent2Reasoning: r.agent2_reasoning || undefined,
      }))

      games.push({
        id: finalRound.game_id,
        agent1Model: finalRound.agent1_model_id,
        agent2Model: finalRound.agent2_model_id,
        agent1DisplayName: finalRound.agent1_display_name,
        agent2DisplayName: finalRound.agent2_display_name,
        rounds,
        agent1TotalScore: finalRound.agent1_cumulative_score,
        agent2TotalScore: finalRound.agent2_cumulative_score,
        winner: finalRound.game_winner || "tie",
        timestamp: new Date(finalRound.game_timestamp).getTime(),
        framing: finalRound.game_type === "hidden_agenda" ? "cloaked" : "overt",
      })
    }
  }

  return games
}

export async function fetchNewGames(afterTimestamp: number): Promise<GameRecord[]> {
  const supabase = createClient()
  const isoTimestamp = new Date(afterTimestamp).toISOString()

  const { data: finalRounds, error } = await supabase
    .from("game_rounds")
    .select("*")
    .eq("is_final_round", true)
    .gt("game_timestamp", isoTimestamp)
    .order("game_timestamp", { ascending: false })

  if (error || !finalRounds || finalRounds.length === 0) {
    return []
  }

  const games: GameRecord[] = []

  for (const finalRound of finalRounds) {
    const { data: allRounds } = await supabase
      .from("game_rounds")
      .select("*")
      .eq("game_id", finalRound.game_id)
      .order("round_number", { ascending: true })

    if (allRounds && allRounds.length > 0) {
      const rounds: RoundResult[] = allRounds.map((r) => ({
        round: r.round_number,
        agent1Decision: r.agent1_decision,
        agent2Decision: r.agent2_decision,
        agent1Points: r.agent1_round_points,
        agent2Points: r.agent2_round_points,
        agent1Reasoning: r.agent1_reasoning || undefined,
        agent2Reasoning: r.agent2_reasoning || undefined,
      }))

      games.push({
        id: finalRound.game_id,
        agent1Model: finalRound.agent1_model_id,
        agent2Model: finalRound.agent2_model_id,
        agent1DisplayName: finalRound.agent1_display_name,
        agent2DisplayName: finalRound.agent2_display_name,
        rounds,
        agent1TotalScore: finalRound.agent1_cumulative_score,
        agent2TotalScore: finalRound.agent2_cumulative_score,
        winner: finalRound.game_winner || "tie",
        timestamp: new Date(finalRound.game_timestamp).getTime(),
        framing: finalRound.game_type === "hidden_agenda" ? "cloaked" : "overt",
      })
    }
  }

  return games
}

export async function fetchStrategyStats() {
  const supabase = createClient()

  // Calculate strategy stats from game_rounds
  const { data: finalRounds, error } = await supabase.from("game_rounds").select("*").eq("is_final_round", true)

  if (error || !finalRounds || finalRounds.length === 0) {
    return {
      forgiving: 0,
      forgivingTotal: 0,
      retaliating: 0,
      retaliatingTotal: 0,
      nice: 0,
      niceTotal: 0,
      nonEnvious: 0,
      nonEnviousTotal: 0,
    }
  }

  let forgiving = 0
  let forgivingTotal = 0 // Total opportunities to forgive (opponent defected last round)
  let retaliating = 0
  let retaliatingTotal = 0 // Same as forgiving total (opponent defected last round)
  let nice = 0
  let niceTotal = 0 // Total first moves (2 per game)
  let nonEnvious = 0
  let nonEnviousTotal = 0 // Total agents (2 per game)

  // For each completed game, fetch all rounds and calculate strategy
  for (const finalRound of finalRounds) {
    const { data: allRounds } = await supabase
      .from("game_rounds")
      .select("*")
      .eq("game_id", finalRound.game_id)
      .order("round_number", { ascending: true })

    if (allRounds && allRounds.length > 0) {
      // Nice: first move is cooperate (2 agents per game)
      niceTotal += 2
      if (allRounds[0].agent1_decision === "cooperate") nice++
      if (allRounds[0].agent2_decision === "cooperate") nice++

      // Check forgiving and retaliating patterns
      for (let i = 1; i < allRounds.length; i++) {
        const prevRound = allRounds[i - 1]
        const currRound = allRounds[i]

        // Agent 1: opponent (agent2) defected last round - opportunity to forgive/retaliate
        if (prevRound.agent2_decision === "defect") {
          forgivingTotal++
          retaliatingTotal++
          if (currRound.agent1_decision === "cooperate") {
            forgiving++
          } else if (currRound.agent1_decision === "defect") {
            retaliating++
          }
        }

        // Agent 2: opponent (agent1) defected last round - opportunity to forgive/retaliate
        if (prevRound.agent1_decision === "defect") {
          forgivingTotal++
          retaliatingTotal++
          if (currRound.agent2_decision === "cooperate") {
            forgiving++
          } else if (currRound.agent2_decision === "defect") {
            retaliating++
          }
        }
      }

      // Non-envious: agent doesn't defect more than opponent (2 agents per game)
      nonEnviousTotal += 2
      const agent1Defects = allRounds.filter((r) => r.agent1_decision === "defect").length
      const agent2Defects = allRounds.filter((r) => r.agent2_decision === "defect").length
      if (agent1Defects <= agent2Defects) nonEnvious++
      if (agent2Defects <= agent1Defects) nonEnvious++
    }
  }

  return {
    forgiving,
    forgivingTotal,
    retaliating,
    retaliatingTotal,
    nice,
    niceTotal,
    nonEnvious,
    nonEnviousTotal,
  }
}

export async function fetchScenarioStats() {
  const supabase = createClient()

  // Fetch all rounds grouped by scenario
  const { data: allRounds, error } = await supabase
    .from("game_rounds")
    .select("agent1_decision, agent2_decision, game_type, scenario")

  if (error || !allRounds || allRounds.length === 0) {
    return {
      overt: { cooperate: 0, defect: 0, total: 0 },
      sales: { cooperate: 0, defect: 0, total: 0 },
      research: { cooperate: 0, defect: 0, total: 0 },
      creator: { cooperate: 0, defect: 0, total: 0 },
    }
  }

  const stats = {
    overt: { cooperate: 0, defect: 0, total: 0 },
    sales: { cooperate: 0, defect: 0, total: 0 },
    research: { cooperate: 0, defect: 0, total: 0 },
    creator: { cooperate: 0, defect: 0, total: 0 },
  }

  for (const round of allRounds) {
    // Determine which scenario bucket
    let bucket: "overt" | "sales" | "research" | "creator"
    if (round.game_type === "control") {
      bucket = "overt"
    } else if (round.scenario === "sales") {
      bucket = "sales"
    } else if (round.scenario === "research") {
      bucket = "research"
    } else if (round.scenario === "creator") {
      bucket = "creator"
    } else {
      // Default cloaked to sales if no scenario specified
      bucket = "sales"
    }

    // Count agent1 decision
    stats[bucket].total++
    if (round.agent1_decision === "cooperate") {
      stats[bucket].cooperate++
    } else if (round.agent1_decision === "defect") {
      stats[bucket].defect++
    }

    // Count agent2 decision
    stats[bucket].total++
    if (round.agent2_decision === "cooperate") {
      stats[bucket].cooperate++
    } else if (round.agent2_decision === "defect") {
      stats[bucket].defect++
    }
  }

  return stats
}
