// Calculate Axelrod's four strategy dimensions for a model

import { createClient } from "./supabase/client"

export interface StrategyMetrics {
  modelId: string
  modelName: string
  niceScore: number
  retaliatingScore: number
  forgivingScore: number
  nonEnviousScore: number
  cooperationRate: number
  avgPointsPerRound: number
  totalPoints: number
  matchesPlayed: number
  wins: number
  losses: number
  ties: number
  archetype: string
}

interface RoundForMetrics {
  round_number: number
  action_a: "cooperate" | "defect"
  action_b: "cooperate" | "defect"
  payoff_a: number
  payoff_b: number
  score_a_cumulative: number
  score_b_cumulative: number
}

interface MatchForMetrics {
  model_a_id: string
  model_b_id: string
  score_a: number
  score_b: number
  winner: "model_a" | "model_b" | "tie"
  rounds: RoundForMetrics[]
}

/**
 * Calculate Nice score: proportion of first moves that are COOPERATE
 */
function calculateNiceScore(matches: MatchForMetrics[], modelId: string): number {
  let firstMoveCoops = 0
  let totalFirstMoves = 0

  for (const match of matches) {
    const isModelA = match.model_a_id === modelId
    const rounds = match.rounds.sort((a, b) => a.round_number - b.round_number)

    if (rounds.length > 0) {
      const firstRound = rounds[0]
      const action = isModelA ? firstRound.action_a : firstRound.action_b
      if (action === "cooperate") firstMoveCoops++
      totalFirstMoves++
    }
  }

  return totalFirstMoves > 0 ? firstMoveCoops / totalFirstMoves : 0
}

/**
 * Calculate Retaliating score: proportion of times model defects after opponent defects
 */
function calculateRetaliatingScore(matches: MatchForMetrics[], modelId: string): number {
  let retaliations = 0
  let opportunities = 0

  for (const match of matches) {
    const isModelA = match.model_a_id === modelId
    const rounds = match.rounds.sort((a, b) => a.round_number - b.round_number)

    for (let i = 1; i < rounds.length; i++) {
      const prevRound = rounds[i - 1]
      const currRound = rounds[i]

      const opponentPrevAction = isModelA ? prevRound.action_b : prevRound.action_a
      const myCurrentAction = isModelA ? currRound.action_a : currRound.action_b

      // If opponent defected last round, did we defect this round?
      if (opponentPrevAction === "defect") {
        opportunities++
        if (myCurrentAction === "defect") retaliations++
      }
    }
  }

  return opportunities > 0 ? retaliations / opportunities : 0
}

/**
 * Calculate Forgiving score: proportion of times model cooperates after mutual defection
 */
function calculateForgivingScore(matches: MatchForMetrics[], modelId: string): number {
  let forgives = 0
  let opportunities = 0

  for (const match of matches) {
    const isModelA = match.model_a_id === modelId
    const rounds = match.rounds.sort((a, b) => a.round_number - b.round_number)

    for (let i = 1; i < rounds.length; i++) {
      const prevRound = rounds[i - 1]
      const currRound = rounds[i]

      // Check if previous round was mutual defection
      if (prevRound.action_a === "defect" && prevRound.action_b === "defect") {
        opportunities++
        const myCurrentAction = isModelA ? currRound.action_a : currRound.action_b
        if (myCurrentAction === "cooperate") forgives++
      }
    }
  }

  return opportunities > 0 ? forgives / opportunities : 0
}

/**
 * Calculate Non-Envious score: consistency of cooperation rate regardless of score differential
 * High score means the model doesn't change strategy based on being ahead/behind
 */
function calculateNonEnviousScore(matches: MatchForMetrics[], modelId: string): number {
  // Bucket score differentials and measure cooperation rate variance
  const buckets: Record<string, { coops: number; total: number }> = {
    far_behind: { coops: 0, total: 0 }, // -20 or less
    behind: { coops: 0, total: 0 }, // -5 to -19
    even: { coops: 0, total: 0 }, // -4 to +4
    ahead: { coops: 0, total: 0 }, // +5 to +19
    far_ahead: { coops: 0, total: 0 }, // +20 or more
  }

  for (const match of matches) {
    const isModelA = match.model_a_id === modelId
    const rounds = match.rounds.sort((a, b) => a.round_number - b.round_number)

    for (const round of rounds) {
      const myScore = isModelA ? round.score_a_cumulative : round.score_b_cumulative
      const oppScore = isModelA ? round.score_b_cumulative : round.score_a_cumulative
      const diff = myScore - oppScore

      let bucket: string
      if (diff <= -20) bucket = "far_behind"
      else if (diff <= -5) bucket = "behind"
      else if (diff <= 4) bucket = "even"
      else if (diff <= 19) bucket = "ahead"
      else bucket = "far_ahead"

      const myAction = isModelA ? round.action_a : round.action_b
      buckets[bucket].total++
      if (myAction === "cooperate") buckets[bucket].coops++
    }
  }

  // Calculate cooperation rate per bucket
  const rates = Object.values(buckets)
    .filter((b) => b.total > 0)
    .map((b) => b.coops / b.total)

  if (rates.length < 2) return 1 // Not enough data, assume non-envious

  // Calculate variance of rates
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length
  const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length

  // Convert variance to score (low variance = high non-envious score)
  // Max variance for rates in [0,1] is 0.25
  return Math.max(0, 1 - variance * 4)
}

/**
 * Classify model into strategy archetype based on metrics
 */
function classifyArchetype(metrics: {
  niceScore: number
  retaliatingScore: number
  forgivingScore: number
  nonEnviousScore: number
  cooperationRate: number
}): string {
  const { niceScore, retaliatingScore, forgivingScore, nonEnviousScore, cooperationRate } = metrics

  // Always Defect: very low cooperation and nice scores
  if (cooperationRate < 0.15 && niceScore < 0.2) {
    return "Always Defect"
  }

  // Always Cooperate: very high cooperation, low retaliation
  if (cooperationRate > 0.85 && retaliatingScore < 0.2) {
    return "Always Cooperate"
  }

  // Grim Trigger: nice but unforgiving
  if (niceScore > 0.7 && retaliatingScore > 0.7 && forgivingScore < 0.2) {
    return "Grim Trigger"
  }

  // Tit-for-Tat: nice, retaliating, forgiving
  if (niceScore > 0.6 && retaliatingScore > 0.6 && forgivingScore > 0.4) {
    return "Tit-for-Tat"
  }

  // Suspicious TFT: not nice initially but otherwise TFT-like
  if (niceScore < 0.4 && retaliatingScore > 0.6 && forgivingScore > 0.4) {
    return "Suspicious TFT"
  }

  // Random: low consistency (low non-envious or middling everything)
  if (nonEnviousScore < 0.4) {
    return "Random/Erratic"
  }

  // Cooperative: high cooperation but doesn't fit TFT
  if (cooperationRate > 0.6) {
    return "Cooperative"
  }

  // Competitive: lower cooperation
  if (cooperationRate < 0.4) {
    return "Competitive"
  }

  return "Mixed Strategy"
}

/**
 * Calculate all strategy metrics for a model
 */
export async function calculateModelMetrics(modelId: string, tournamentId?: string): Promise<StrategyMetrics | null> {
  const supabase = createClient()

  // Fetch all matches for this model
  let query = supabase
    .from("matches")
    .select("*, rounds(*)")
    .or(`model_a_id.eq.${modelId},model_b_id.eq.${modelId}`)
    .eq("status", "completed")

  if (tournamentId) {
    query = query.eq("tournament_id", tournamentId)
  }

  const { data: matches, error } = await query

  if (error || !matches || matches.length === 0) {
    return null
  }

  const matchesWithRounds = matches as MatchForMetrics[]

  // Calculate cooperation rate and total points
  let totalCoops = 0
  let totalActions = 0
  let totalPoints = 0
  let wins = 0
  let losses = 0
  let ties = 0

  for (const match of matchesWithRounds) {
    const isModelA = match.model_a_id === modelId
    const myScore = isModelA ? match.score_a : match.score_b

    totalPoints += myScore

    if (match.winner === "tie") ties++
    else if ((match.winner === "model_a" && isModelA) || (match.winner === "model_b" && !isModelA)) wins++
    else losses++

    for (const round of match.rounds) {
      totalActions++
      const myAction = isModelA ? round.action_a : round.action_b
      if (myAction === "cooperate") totalCoops++
    }
  }

  const cooperationRate = totalActions > 0 ? totalCoops / totalActions : 0
  const avgPointsPerRound = totalActions > 0 ? totalPoints / totalActions : 0

  const niceScore = calculateNiceScore(matchesWithRounds, modelId)
  const retaliatingScore = calculateRetaliatingScore(matchesWithRounds, modelId)
  const forgivingScore = calculateForgivingScore(matchesWithRounds, modelId)
  const nonEnviousScore = calculateNonEnviousScore(matchesWithRounds, modelId)

  const archetype = classifyArchetype({
    niceScore,
    retaliatingScore,
    forgivingScore,
    nonEnviousScore,
    cooperationRate,
  })

  // Get model name
  const modelName = matches[0].model_a_id === modelId ? matches[0].model_a_name : matches[0].model_b_name

  return {
    modelId,
    modelName,
    niceScore,
    retaliatingScore,
    forgivingScore,
    nonEnviousScore,
    cooperationRate,
    avgPointsPerRound,
    totalPoints,
    matchesPlayed: matchesWithRounds.length,
    wins,
    losses,
    ties,
    archetype,
  }
}
