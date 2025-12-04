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
  agent1_decision: "cooperate" | "defect" | "error"
  agent1_reasoning: string | null
  agent1_round_points: number
  agent1_cumulative_score: number
  agent2_model_id: string
  agent2_display_name: string
  agent2_decision: "cooperate" | "defect" | "error"
  agent2_reasoning: string | null
  agent2_round_points: number
  agent2_cumulative_score: number
  round_outcome: "mutual_cooperation" | "mutual_defection" | "agent1_exploited" | "agent2_exploited" | "error"
  game_type: "control" | "hidden_agenda"
  game_source?: "user" | "automated"
  game_winner: "agent1" | "agent2" | "tie" | null
  is_final_round: boolean
  scenario?: string
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

  // Single query instead of 3 separate queries
  const { data: finalRounds } = await supabase
    .from("game_rounds")
    .select("game_id, game_type")
    .eq("is_final_round", true)

  if (!finalRounds) {
    return { totalGames: 0, controlRounds: 0, hiddenAgendaRounds: 0 }
  }

  // Count in memory - much faster than 3 network round-trips
  let controlRounds = 0
  let hiddenAgendaRounds = 0
  for (const round of finalRounds) {
    if (round.game_type === "control") controlRounds++
    else if (round.game_type === "hidden_agenda") hiddenAgendaRounds++
  }

  return {
    totalGames: finalRounds.length,
    controlRounds,
    hiddenAgendaRounds,
  }
}

export async function fetchModelRankings(limit = 10, activeModelIds?: string[]) {
  const supabase = createClient()

  // Get only needed columns for ranking calculation (not select("*"))
  const { data: finalRounds } = await supabase
    .from("game_rounds")
    .select("agent1_model_id, agent1_display_name, agent1_cumulative_score, agent2_model_id, agent2_display_name, agent2_cumulative_score, game_winner")
    .eq("is_final_round", true)

  if (!finalRounds || finalRounds.length === 0) return []

  // Calculate model rankings
  const modelStats: Record<
    string,
    {
      modelId: string
      displayName: string
      totalPoints: number
      gamesPlayed: number
      wins: number
      losses: number
    }
  > = {}

  for (const round of finalRounds) {
    // Determine winner
    const agent1Won = round.game_winner === "agent1"
    const agent2Won = round.game_winner === "agent2"

    // Agent 1 stats
    if (!modelStats[round.agent1_model_id]) {
      modelStats[round.agent1_model_id] = {
        modelId: round.agent1_model_id,
        displayName: round.agent1_display_name,
        totalPoints: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
      }
    }
    modelStats[round.agent1_model_id].totalPoints += round.agent1_cumulative_score
    modelStats[round.agent1_model_id].gamesPlayed += 1
    if (agent1Won) modelStats[round.agent1_model_id].wins += 1
    if (agent2Won) modelStats[round.agent1_model_id].losses += 1

    // Agent 2 stats
    if (!modelStats[round.agent2_model_id]) {
      modelStats[round.agent2_model_id] = {
        modelId: round.agent2_model_id,
        displayName: round.agent2_display_name,
        totalPoints: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
      }
    }
    modelStats[round.agent2_model_id].totalPoints += round.agent2_cumulative_score
    modelStats[round.agent2_model_id].gamesPlayed += 1
    if (agent2Won) modelStats[round.agent2_model_id].wins += 1
    if (agent1Won) modelStats[round.agent2_model_id].losses += 1
  }

  // Filter to only active models if specified
  let rankings = Object.values(modelStats)
  if (activeModelIds && activeModelIds.length > 0) {
    const activeSet = new Set(activeModelIds)
    rankings = rankings.filter((m) => activeSet.has(m.modelId))
  }

  return rankings
    .sort((a, b) => {
      // Primary: sort by total points (the true measure in Prisoner's Dilemma)
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
      // Tiebreaker: more wins
      if (b.wins !== a.wins) return b.wins - a.wins
      // Final tiebreaker: fewer losses
      return a.losses - b.losses
    })
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
    "game_source",
    "scenario",
    "round_number",
    "total_rounds",
    "agent1_model_id",
    "agent1_display_name",
    "agent1_decision",
    "agent1_raw_action",
    "agent1_reasoning",
    "agent1_round_points",
    "agent1_cumulative_score",
    "agent2_model_id",
    "agent2_display_name",
    "agent2_decision",
    "agent2_raw_action",
    "agent2_reasoning",
    "agent2_round_points",
    "agent2_cumulative_score",
    "round_outcome",
    "game_winner",
    "is_final_round",
  ]

  const csvRows = [headers.join(",")]

  for (const row of data) {
    const values = [
      row.game_id,
      row.game_timestamp,
      row.game_type,
      row.game_source || "automated",
      row.scenario || "",
      row.round_number,
      row.total_rounds,
      row.agent1_model_id,
      `"${row.agent1_display_name || ""}"`,
      row.agent1_decision,
      row.agent1_raw_action || "",
      `"${(row.agent1_reasoning || "").replace(/"/g, '""')}"`,
      row.agent1_round_points,
      row.agent1_cumulative_score,
      row.agent2_model_id,
      `"${row.agent2_display_name || ""}"`,
      row.agent2_decision,
      row.agent2_raw_action || "",
      `"${(row.agent2_reasoning || "").replace(/"/g, '""')}"`,
      row.agent2_round_points,
      row.agent2_cumulative_score,
      row.round_outcome,
      row.game_winner || "",
      row.is_final_round,
    ]
    csvRows.push(values.join(","))
  }

  return csvRows.join("\n")
}

export async function fetchRecentGames(limit = 50): Promise<GameRecord[]> {
  const supabase = createClient()

  // Step 1: Get final rounds to identify recent games
  const { data: finalRounds, error: finalError } = await supabase
    .from("game_rounds")
    .select("game_id, agent1_model_id, agent2_model_id, agent1_display_name, agent2_display_name, agent1_cumulative_score, agent2_cumulative_score, game_winner, game_timestamp, game_type, scenario")
    .eq("is_final_round", true)
    .order("game_timestamp", { ascending: false })
    .limit(limit)

  if (finalError || !finalRounds || finalRounds.length === 0) {
    console.error("[v0] Failed to fetch recent games:", finalError)
    return []
  }

  // Step 2: Get ALL rounds for these games in ONE query (not N queries!)
  const gameIds = finalRounds.map((r) => r.game_id)
  const { data: allRoundsData, error: roundsError } = await supabase
    .from("game_rounds")
    .select("game_id, round_number, agent1_decision, agent2_decision, agent1_round_points, agent2_round_points, agent1_reasoning, agent2_reasoning")
    .in("game_id", gameIds)
    .order("round_number", { ascending: true })

  if (roundsError || !allRoundsData) {
    console.error("[v0] Failed to fetch game rounds:", roundsError)
    return []
  }

  // Step 3: Group rounds by game_id in memory
  const roundsByGame = new Map<string, typeof allRoundsData>()
  for (const round of allRoundsData) {
    const existing = roundsByGame.get(round.game_id) || []
    existing.push(round)
    roundsByGame.set(round.game_id, existing)
  }

  // Step 4: Build game records
  const games: GameRecord[] = finalRounds.map((finalRound) => {
    const gameRounds = roundsByGame.get(finalRound.game_id) || []
    
    const rounds: RoundResult[] = gameRounds.map((r) => ({
      round: r.round_number,
      agent1Decision: r.agent1_decision,
      agent2Decision: r.agent2_decision,
      agent1Points: r.agent1_round_points,
      agent2Points: r.agent2_round_points,
      agent1Reasoning: r.agent1_reasoning || undefined,
      agent2Reasoning: r.agent2_reasoning || undefined,
    }))

    return {
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
      scenario: finalRound.scenario || null,
    }
  })

  return games
}

export async function fetchOlderGames(beforeTimestamp: number, limit = 50): Promise<GameRecord[]> {
  const supabase = createClient()
  const isoTimestamp = new Date(beforeTimestamp).toISOString()

  // Step 1: Get final rounds for older games
  const { data: finalRounds, error: finalError } = await supabase
    .from("game_rounds")
    .select("game_id, agent1_model_id, agent2_model_id, agent1_display_name, agent2_display_name, agent1_cumulative_score, agent2_cumulative_score, game_winner, game_timestamp, game_type, scenario")
    .eq("is_final_round", true)
    .lt("game_timestamp", isoTimestamp)
    .order("game_timestamp", { ascending: false })
    .limit(limit)

  if (finalError || !finalRounds || finalRounds.length === 0) {
    return []
  }

  // Step 2: Get ALL rounds for these games in ONE query
  const gameIds = finalRounds.map((r) => r.game_id)
  const { data: allRoundsData, error: roundsError } = await supabase
    .from("game_rounds")
    .select("game_id, round_number, agent1_decision, agent2_decision, agent1_round_points, agent2_round_points, agent1_reasoning, agent2_reasoning")
    .in("game_id", gameIds)
    .order("round_number", { ascending: true })

  if (roundsError || !allRoundsData) {
    return []
  }

  // Step 3: Group rounds by game_id in memory
  const roundsByGame = new Map<string, typeof allRoundsData>()
  for (const round of allRoundsData) {
    const existing = roundsByGame.get(round.game_id) || []
    existing.push(round)
    roundsByGame.set(round.game_id, existing)
  }

  // Step 4: Build game records
  return finalRounds.map((finalRound) => {
    const gameRounds = roundsByGame.get(finalRound.game_id) || []
    
    const rounds: RoundResult[] = gameRounds.map((r) => ({
      round: r.round_number,
      agent1Decision: r.agent1_decision,
      agent2Decision: r.agent2_decision,
      agent1Points: r.agent1_round_points,
      agent2Points: r.agent2_round_points,
      agent1Reasoning: r.agent1_reasoning || undefined,
      agent2Reasoning: r.agent2_reasoning || undefined,
    }))

    return {
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
      scenario: finalRound.scenario || null,
    }
  })
}

export async function fetchNewGames(afterTimestamp: number): Promise<GameRecord[]> {
  const supabase = createClient()
  const isoTimestamp = new Date(afterTimestamp).toISOString()

  // Step 1: Get final rounds for new games
  const { data: finalRounds, error: finalError } = await supabase
    .from("game_rounds")
    .select("game_id, agent1_model_id, agent2_model_id, agent1_display_name, agent2_display_name, agent1_cumulative_score, agent2_cumulative_score, game_winner, game_timestamp, game_type, scenario")
    .eq("is_final_round", true)
    .gt("created_at", isoTimestamp)
    .order("created_at", { ascending: false })

  if (finalError || !finalRounds || finalRounds.length === 0) {
    return []
  }

  // Step 2: Get ALL rounds for these games in ONE query
  const gameIds = finalRounds.map((r) => r.game_id)
  const { data: allRoundsData, error: roundsError } = await supabase
    .from("game_rounds")
    .select("game_id, round_number, agent1_decision, agent2_decision, agent1_round_points, agent2_round_points, agent1_reasoning, agent2_reasoning")
    .in("game_id", gameIds)
    .order("round_number", { ascending: true })

  if (roundsError || !allRoundsData) {
    return []
  }

  // Step 3: Group rounds by game_id in memory
  const roundsByGame = new Map<string, typeof allRoundsData>()
  for (const round of allRoundsData) {
    const existing = roundsByGame.get(round.game_id) || []
    existing.push(round)
    roundsByGame.set(round.game_id, existing)
  }

  // Step 4: Build game records
  return finalRounds.map((finalRound) => {
    const gameRounds = roundsByGame.get(finalRound.game_id) || []
    
    const rounds: RoundResult[] = gameRounds.map((r) => ({
      round: r.round_number,
      agent1Decision: r.agent1_decision,
      agent2Decision: r.agent2_decision,
      agent1Points: r.agent1_round_points,
      agent2Points: r.agent2_round_points,
      agent1Reasoning: r.agent1_reasoning || undefined,
      agent2Reasoning: r.agent2_reasoning || undefined,
    }))

    return {
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
      scenario: finalRound.scenario || null,
    }
  })
}

export async function fetchStrategyStats() {
  const supabase = createClient()

  // Fetch ALL rounds in a single query (optimized from N+1 queries)
  const { data: allRoundsData, error } = await supabase
    .from("game_rounds")
    .select("game_id, round_number, agent1_decision, agent2_decision")
    .order("game_id")
    .order("round_number", { ascending: true })

  if (error || !allRoundsData || allRoundsData.length === 0) {
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

  // Group rounds by game_id in memory
  const gameRounds = new Map<string, typeof allRoundsData>()
  for (const round of allRoundsData) {
    const existing = gameRounds.get(round.game_id) || []
    existing.push(round)
    gameRounds.set(round.game_id, existing)
  }

  let forgiving = 0
  let forgivingTotal = 0
  let retaliating = 0
  let retaliatingTotal = 0
  let nice = 0
  let niceTotal = 0
  let nonEnvious = 0
  let nonEnviousTotal = 0

  // Process each game's rounds
  for (const rounds of gameRounds.values()) {
    if (rounds.length === 0) continue

    // Nice: first move is cooperate (2 agents per game)
    niceTotal += 2
    if (rounds[0].agent1_decision === "cooperate") nice++
    if (rounds[0].agent2_decision === "cooperate") nice++

    // Check forgiving and retaliating patterns
    for (let i = 1; i < rounds.length; i++) {
      const prevRound = rounds[i - 1]
      const currRound = rounds[i]

      // Agent 1: opponent (agent2) defected last round
      if (prevRound.agent2_decision === "defect") {
        forgivingTotal++
        retaliatingTotal++
        if (currRound.agent1_decision === "cooperate") {
          forgiving++
        } else if (currRound.agent1_decision === "defect") {
          retaliating++
        }
      }

      // Agent 2: opponent (agent1) defected last round
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

    // Non-envious: agent doesn't defect more than opponent
    nonEnviousTotal += 2
    const agent1Defects = rounds.filter((r) => r.agent1_decision === "defect").length
    const agent2Defects = rounds.filter((r) => r.agent2_decision === "defect").length
    if (agent1Defects <= agent2Defects) nonEnvious++
    if (agent2Defects <= agent1Defects) nonEnvious++
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

export interface ModelDetailedStats {
  modelId: string
  displayName: string
  totalGames: number
  totalPoints: number
  totalErrors: number
  wins: number
  losses: number
  ties: number
  behavior: {
    forgiving: number
    forgivingTotal: number
    retaliating: number
    retaliatingTotal: number
    nice: number
    niceTotal: number
    nonEnvious: number
    nonEnviousTotal: number
  }
}

export async function fetchModelDetailedStats(modelId: string): Promise<ModelDetailedStats | null> {
  const supabase = createClient()

  // Fetch all rounds where this model participated
  const { data: allRounds, error } = await supabase
    .from("game_rounds")
    .select("*")
    .or(`agent1_model_id.eq.${modelId},agent2_model_id.eq.${modelId}`)
    .order("game_id")
    .order("round_number", { ascending: true })

  if (error || !allRounds || allRounds.length === 0) {
    return null
  }

  // Group rounds by game_id
  const gameRounds = new Map<string, typeof allRounds>()
  for (const round of allRounds) {
    const existing = gameRounds.get(round.game_id) || []
    existing.push(round)
    gameRounds.set(round.game_id, existing)
  }

  let displayName = modelId
  let totalPoints = 0
  let totalErrors = 0
  let wins = 0
  let losses = 0
  let ties = 0
  let forgiving = 0
  let forgivingTotal = 0
  let retaliating = 0
  let retaliatingTotal = 0
  let nice = 0
  let niceTotal = 0
  let nonEnvious = 0
  let nonEnviousTotal = 0

  const processedGames = new Set<string>()

  for (const [gameId, rounds] of gameRounds) {
    if (rounds.length === 0) continue
    
    const firstRound = rounds[0]
    const isAgent1 = firstRound.agent1_model_id === modelId
    
    // Get display name
    if (isAgent1 && firstRound.agent1_display_name) {
      displayName = firstRound.agent1_display_name
    } else if (!isAgent1 && firstRound.agent2_display_name) {
      displayName = firstRound.agent2_display_name
    }

    // Find the final round for this game
    const finalRound = rounds.find(r => r.is_final_round)
    
    if (finalRound && !processedGames.has(gameId)) {
      processedGames.add(gameId)
      
      // Calculate points and wins/losses
      if (isAgent1) {
        totalPoints += finalRound.agent1_cumulative_score
        if (finalRound.game_winner === "agent1") wins++
        else if (finalRound.game_winner === "agent2") losses++
        else ties++
      } else {
        totalPoints += finalRound.agent2_cumulative_score
        if (finalRound.game_winner === "agent2") wins++
        else if (finalRound.game_winner === "agent1") losses++
        else ties++
      }
    }

    // Count errors
    for (const round of rounds) {
      if (isAgent1 && round.agent1_decision === "error") totalErrors++
      if (!isAgent1 && round.agent2_decision === "error") totalErrors++
    }

    // Nice: first move is cooperate
    niceTotal++
    const firstDecision = isAgent1 ? rounds[0].agent1_decision : rounds[0].agent2_decision
    if (firstDecision === "cooperate") nice++

    // Forgiving and retaliating patterns
    for (let i = 1; i < rounds.length; i++) {
      const prevRound = rounds[i - 1]
      const currRound = rounds[i]
      
      const opponentPrevDecision = isAgent1 ? prevRound.agent2_decision : prevRound.agent1_decision
      const myCurrentDecision = isAgent1 ? currRound.agent1_decision : currRound.agent2_decision

      // If opponent defected last round
      if (opponentPrevDecision === "defect") {
        forgivingTotal++
        retaliatingTotal++
        if (myCurrentDecision === "cooperate") {
          forgiving++
        } else if (myCurrentDecision === "defect") {
          retaliating++
        }
      }
    }

    // Non-envious: model doesn't defect more than opponent
    nonEnviousTotal++
    const myDefects = rounds.filter(r => 
      isAgent1 ? r.agent1_decision === "defect" : r.agent2_decision === "defect"
    ).length
    const opponentDefects = rounds.filter(r => 
      isAgent1 ? r.agent2_decision === "defect" : r.agent1_decision === "defect"
    ).length
    if (myDefects <= opponentDefects) nonEnvious++
  }

  return {
    modelId,
    displayName,
    totalGames: processedGames.size,
    totalPoints,
    totalErrors,
    wins,
    losses,
    ties,
    behavior: {
      forgiving,
      forgivingTotal,
      retaliating,
      retaliatingTotal,
      nice,
      niceTotal,
      nonEnvious,
      nonEnviousTotal,
    },
  }
}
