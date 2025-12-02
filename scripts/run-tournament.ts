/**
 * Round-Robin Tournament Test Script
 *
 * Runs matches between all model pairs until we have 100 games of each scenario type:
 * - overt (control)
 * - sales (cloaked)
 * - research (cloaked)
 * - creator (cloaked)
 *
 * Usage:
 *   npx tsx scripts/run-tournament.ts
 *
 * Environment variables required:
 *   - AI_GATEWAY_API_KEY
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

// Load environment variables from .env.local
config({ path: ".env.local" })

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const TARGET_PER_SCENARIO = 100
const ROUNDS_PER_MATCH = 10
const CONCURRENT_MATCHES = 1 // Run one at a time to avoid rate limits
const BASE_URL = process.env.BASE_URL || "http://localhost:3000"

type ScenarioType = "overt" | "sales" | "research" | "creator"
const ALL_SCENARIOS: ScenarioType[] = ["overt", "sales", "research", "creator"]

// Models to test (from lib/models.ts)
const MODELS = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
  "openai/gpt-5.1-thinking",
  "xai/grok-4.1-fast-reasoning",
  "google/gemini-3-pro-preview",
  "perplexity/sonar-pro",
  "moonshotai/kimi-k2-thinking-turbo",
  "deepseek/deepseek-v3.2-thinking",
]

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ScenarioCounts {
  overt: number
  sales: number
  research: number
  creator: number
}

interface MatchResult {
  matchId: string
  modelA: string
  modelB: string
  scenario: ScenarioType
  scoreA: number
  scoreB: number
  winner: string
  success: boolean
  error?: string
}

interface TournamentStats {
  totalMatches: number
  successfulMatches: number
  failedMatches: number
  retriedMatches: number
  scenarioCounts: ScenarioCounts
  modelWins: Record<string, number>
  modelLosses: Record<string, number>
  modelTies: Record<string, number>
  startTime: number
  lastUpdateTime: number
}

// -----------------------------------------------------------------------------
// Supabase Client
// -----------------------------------------------------------------------------

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  // Handle common typo (extra Y)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEYY

  if (!url || !key) {
    console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes("SUPABASE")))
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
  }

  return createClient(url, key)
}

// -----------------------------------------------------------------------------
// Get Current Scenario Counts from Database
// -----------------------------------------------------------------------------

async function getScenarioCounts(supabase: ReturnType<typeof createSupabaseClient>): Promise<ScenarioCounts> {
  // Count overt matches (game_type = 'control' or framing = 'overt')
  const { count: overtCount } = await supabase
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed")
    .or("framing_a.eq.overt,framing_b.eq.overt")

  // Count cloaked scenarios
  const { data: scenarioData } = await supabase
    .from("matches")
    .select("scenario")
    .eq("status", "completed")
    .not("scenario", "is", null)

  const counts: ScenarioCounts = {
    overt: overtCount || 0,
    sales: 0,
    research: 0,
    creator: 0,
  }

  if (scenarioData) {
    for (const row of scenarioData) {
      if (row.scenario === "sales") counts.sales++
      else if (row.scenario === "research") counts.research++
      else if (row.scenario === "creator") counts.creator++
    }
  }

  return counts
}

// -----------------------------------------------------------------------------
// Generate Round-Robin Pairings
// -----------------------------------------------------------------------------

function generateRoundRobinPairs(models: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      pairs.push([models[i], models[j]])
    }
  }

  return pairs
}

// -----------------------------------------------------------------------------
// Shuffle Array (Fisher-Yates)
// -----------------------------------------------------------------------------

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// -----------------------------------------------------------------------------
// Pick Next Scenario (Prioritize lowest count)
// -----------------------------------------------------------------------------

function pickNextScenario(counts: ScenarioCounts): ScenarioType | null {
  const remaining = ALL_SCENARIOS.filter((s) => counts[s] < TARGET_PER_SCENARIO)

  if (remaining.length === 0) return null

  // Sort by count ascending, pick the one with fewest matches
  remaining.sort((a, b) => counts[a] - counts[b])

  // Add some randomness among scenarios with similar counts
  const minCount = counts[remaining[0]]
  const nearMin = remaining.filter((s) => counts[s] <= minCount + 5)

  return nearMin[Math.floor(Math.random() * nearMin.length)]
}

// -----------------------------------------------------------------------------
// Retry Configuration
// -----------------------------------------------------------------------------

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,      // Start with 2 seconds
  maxDelayMs: 60000,      // Cap at 60 seconds
  jitterFactor: 0.3,      // Add up to 30% random jitter
}

// -----------------------------------------------------------------------------
// Exponential Backoff with Jitter
// -----------------------------------------------------------------------------

function calculateBackoffDelay(attempt: number): number {
  // Exponential backoff: 2s, 4s, 8s, 16s... capped at maxDelayMs
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs)
  
  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * RETRY_CONFIG.jitterFactor * Math.random()
  
  return Math.floor(cappedDelay + jitter)
}

function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    "rate limit",
    "429",
    "503",
    "502",
    "500",
    "timeout",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "socket hang up",
    "network",
    "temporarily unavailable",
  ]
  
  const lowerError = error.toLowerCase()
  return retryablePatterns.some(pattern => lowerError.includes(pattern.toLowerCase()))
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// -----------------------------------------------------------------------------
// Round Event for Streaming
// -----------------------------------------------------------------------------

interface RoundEvent {
  round: number
  totalRounds: number
  actionA: string
  actionB: string
  payoffA: number
  payoffB: number
  scoreA: number
  scoreB: number
  outcome: string
}

// -----------------------------------------------------------------------------
// Run Single Match (with Streaming)
// -----------------------------------------------------------------------------

async function runMatchOnce(
  modelA: string,
  modelB: string,
  scenario: ScenarioType,
  onRound?: (event: RoundEvent) => void,
): Promise<MatchResult> {
  const isOvert = scenario === "overt"

  const body = {
    modelA,
    modelB,
    framingA: isOvert ? "overt" : "cloaked",
    framingB: isOvert ? "overt" : "cloaked",
    scenario: isOvert ? undefined : scenario,
    totalRounds: ROUNDS_PER_MATCH,
    saveToDb: true,
    streamRounds: true, // Stream round-by-round results
  }

  const response = await fetch(`${BASE_URL}/api/run-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  // Stream SSE events
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("No response body")
  }

  const decoder = new TextDecoder()
  let buffer = ""

  let result: MatchResult = {
    matchId: "",
    modelA,
    modelB,
    scenario,
    scoreA: 0,
    scoreB: 0,
    winner: "unknown",
    success: false,
  }

  while (true) {
    const { done, value } = await reader.read()
    
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    
    // Process complete SSE messages
    const lines = buffer.split("\n")
    buffer = lines.pop() || "" // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue

      try {
        const data = JSON.parse(line.replace("data: ", ""))

        if (data.type === "round" && onRound) {
          onRound({
            round: data.round,
            totalRounds: data.totalRounds,
            actionA: data.actionA,
            actionB: data.actionB,
            payoffA: data.payoffA,
            payoffB: data.payoffB,
            scoreA: data.scoreA,
            scoreB: data.scoreB,
            outcome: data.outcome,
          })
        } else if (data.type === "complete") {
          result = {
            matchId: data.matchId,
            modelA,
            modelB,
            scenario,
            scoreA: data.scoreA,
            scoreB: data.scoreB,
            winner: data.winner,
            success: true,
          }
        } else if (data.type === "error") {
          throw new Error(data.error || "Match error")
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("Match error")) {
          throw parseError
        }
        // Skip malformed JSON
      }
    }
  }

  if (!result.success) {
    throw new Error("Match completed without success status")
  }

  return result
}

async function runMatch(
  modelA: string,
  modelB: string,
  scenario: ScenarioType,
  onRound?: (event: RoundEvent) => void,
  onRetry?: (attempt: number, error: string, delayMs: number) => void,
): Promise<MatchResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await runMatchOnce(modelA, modelB, scenario, onRound)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Check if we should retry
      const shouldRetry = attempt < RETRY_CONFIG.maxRetries && isRetryableError(lastError.message)
      
      if (!shouldRetry) {
        break
      }

      const delayMs = calculateBackoffDelay(attempt)
      
      if (onRetry) {
        onRetry(attempt + 1, lastError.message, delayMs)
      }

      await sleep(delayMs)
    }
  }

  // All retries exhausted or non-retryable error
  return {
    matchId: "",
    modelA,
    modelB,
    scenario,
    scoreA: 0,
    scoreB: 0,
    winner: "error",
    success: false,
    error: lastError?.message || "Unknown error",
  }
}

// -----------------------------------------------------------------------------
// Print Progress
// -----------------------------------------------------------------------------

interface CurrentRoundInfo {
  round: number
  totalRounds: number
  actionA?: string
  actionB?: string
  scoreA?: number
  scoreB?: number
}

function printProgress(
  stats: TournamentStats, 
  currentMatch?: { modelA: string; modelB: string; scenario: ScenarioType },
  currentRound?: CurrentRoundInfo
) {
  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  console.clear()
  console.log("╔══════════════════════════════════════════════════════════════╗")
  console.log("║           THE MODEL'S DILEMMA - TOURNAMENT RUNNER            ║")
  console.log("╠══════════════════════════════════════════════════════════════╣")
  console.log(`║  Elapsed: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}                                               ║`)
  console.log(`║  Matches: ${stats.successfulMatches} ✓  ${stats.failedMatches} ✗  ${stats.retriedMatches} ↻ (retried)            ║`)
  console.log("╠══════════════════════════════════════════════════════════════╣")
  console.log("║  SCENARIO PROGRESS                        Target: 100 each   ║")
  console.log("╠──────────────────────────────────────────────────────────────╣")

  for (const scenario of ALL_SCENARIOS) {
    const count = stats.scenarioCounts[scenario]
    const pct = Math.min(100, Math.round((count / TARGET_PER_SCENARIO) * 100))
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5))
    const status = count >= TARGET_PER_SCENARIO ? "✅" : "⏳"
    console.log(`║  ${status} ${scenario.padEnd(10)} [${bar}] ${String(count).padStart(3)}/${TARGET_PER_SCENARIO}  ║`)
  }

  console.log("╠══════════════════════════════════════════════════════════════╣")

  if (currentMatch) {
    const modelAShort = currentMatch.modelA.split("/")[1]?.slice(0, 20) || currentMatch.modelA
    const modelBShort = currentMatch.modelB.split("/")[1]?.slice(0, 20) || currentMatch.modelB
    console.log(`║  🎮 ${modelAShort} vs ${modelBShort}`.padEnd(65) + "║")
    console.log(`║     Scenario: ${currentMatch.scenario}`.padEnd(65) + "║")
    
    if (currentRound) {
      const roundBar = "●".repeat(currentRound.round) + "○".repeat(currentRound.totalRounds - currentRound.round)
      console.log(`║     Round: ${currentRound.round}/${currentRound.totalRounds} [${roundBar}]`.padEnd(65) + "║")
      
      if (currentRound.actionA && currentRound.actionB) {
        const actionA = currentRound.actionA.slice(0, 1).toUpperCase()
        const actionB = currentRound.actionB.slice(0, 1).toUpperCase()
        const scoreStr = `${currentRound.scoreA || 0} - ${currentRound.scoreB || 0}`
        console.log(`║     Last: ${actionA} vs ${actionB}  |  Score: ${scoreStr}`.padEnd(65) + "║")
      }
    } else {
      console.log(`║     Round: Starting...`.padEnd(65) + "║")
    }
  } else {
    console.log("║  Waiting for next match...".padEnd(65) + "║")
  }

  console.log("╚══════════════════════════════════════════════════════════════╝")
}

// -----------------------------------------------------------------------------
// Main Tournament Loop
// -----------------------------------------------------------------------------

async function runTournament() {
  console.log("Initializing tournament...")

  const supabase = createSupabaseClient()

  // Get initial counts
  let scenarioCounts = await getScenarioCounts(supabase)
  console.log("Current scenario counts:", scenarioCounts)

  // Generate all possible model pairings
  const allPairs = generateRoundRobinPairs(MODELS)
  console.log(`Generated ${allPairs.length} unique model pairings`)

  // Initialize stats
  const stats: TournamentStats = {
    totalMatches: 0,
    successfulMatches: 0,
    failedMatches: 0,
    retriedMatches: 0,
    scenarioCounts,
    modelWins: {},
    modelLosses: {},
    modelTies: {},
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
  }

  // Initialize model stats
  for (const model of MODELS) {
    stats.modelWins[model] = 0
    stats.modelLosses[model] = 0
    stats.modelTies[model] = 0
  }

  // Main loop
  let pairIndex = 0
  let shuffledPairs = shuffle(allPairs)

  while (true) {
    // Check if we're done
    const allComplete = ALL_SCENARIOS.every((s) => stats.scenarioCounts[s] >= TARGET_PER_SCENARIO)
    if (allComplete) {
      console.log("\n🎉 Tournament complete! All scenarios have 100 matches.")
      break
    }

    // Pick next scenario
    const nextScenario = pickNextScenario(stats.scenarioCounts)
    if (!nextScenario) {
      console.log("\n🎉 All scenarios complete!")
      break
    }

    // Pick next pair (cycle through shuffled pairs)
    if (pairIndex >= shuffledPairs.length) {
      shuffledPairs = shuffle(allPairs)
      pairIndex = 0
    }

    const [modelA, modelB] = shuffledPairs[pairIndex]
    pairIndex++

    // Track current round for display
    let currentRoundInfo: CurrentRoundInfo | undefined

    // Update display
    printProgress(stats, { modelA, modelB, scenario: nextScenario }, currentRoundInfo)

    // Track if this match required retries
    let matchRetried = false

    // Run the match with round streaming and retry callback
    const result = await runMatch(
      modelA, 
      modelB, 
      nextScenario,
      // onRound callback - update display with each round
      (roundEvent) => {
        currentRoundInfo = {
          round: roundEvent.round,
          totalRounds: roundEvent.totalRounds,
          actionA: roundEvent.actionA,
          actionB: roundEvent.actionB,
          scoreA: roundEvent.scoreA,
          scoreB: roundEvent.scoreB,
        }
        printProgress(stats, { modelA, modelB, scenario: nextScenario }, currentRoundInfo)
      },
      // onRetry callback
      (attempt, error, delayMs) => {
        matchRetried = true
        const delaySec = (delayMs / 1000).toFixed(1)
        console.log(`\n⚠️  Retry ${attempt}/${RETRY_CONFIG.maxRetries}: ${error.slice(0, 60)}...`)
        console.log(`   Waiting ${delaySec}s before retry...`)
      }
    )

    stats.totalMatches++
    if (matchRetried) {
      stats.retriedMatches++
    }

    if (result.success) {
      stats.successfulMatches++
      stats.scenarioCounts[nextScenario]++

      // Update model stats
      if (result.winner === "model_a") {
        stats.modelWins[modelA] = (stats.modelWins[modelA] || 0) + 1
        stats.modelLosses[modelB] = (stats.modelLosses[modelB] || 0) + 1
      } else if (result.winner === "model_b") {
        stats.modelWins[modelB] = (stats.modelWins[modelB] || 0) + 1
        stats.modelLosses[modelA] = (stats.modelLosses[modelA] || 0) + 1
      } else {
        stats.modelTies[modelA] = (stats.modelTies[modelA] || 0) + 1
        stats.modelTies[modelB] = (stats.modelTies[modelB] || 0) + 1
      }
    } else {
      stats.failedMatches++
      console.error(`\n❌ Match failed after ${RETRY_CONFIG.maxRetries} retries: ${result.error}`)

      // Add a small delay on final failure to avoid hammering the API
      await sleep(5000)
    }

    stats.lastUpdateTime = Date.now()

    // Small delay between matches to be nice to rate limits
    await sleep(1000)
  }

  // Final summary
  console.log("\n")
  console.log("╔══════════════════════════════════════════════════════════════╗")
  console.log("║                    FINAL TOURNAMENT RESULTS                  ║")
  console.log("╠══════════════════════════════════════════════════════════════╣")
  console.log(`║  Total: ${stats.successfulMatches} ✓ successful, ${stats.failedMatches} ✗ failed, ${stats.retriedMatches} ↻ retried`.padEnd(65) + "║")
  console.log("╠══════════════════════════════════════════════════════════════╣")
  console.log("║  SCENARIO COUNTS                                             ║")

  for (const scenario of ALL_SCENARIOS) {
    console.log(`║    ${scenario}: ${stats.scenarioCounts[scenario]}`.padEnd(65) + "║")
  }

  console.log("╠══════════════════════════════════════════════════════════════╣")
  console.log("║  MODEL LEADERBOARD (by wins)                                 ║")

  const sortedModels = MODELS.sort((a, b) => (stats.modelWins[b] || 0) - (stats.modelWins[a] || 0))
  for (const model of sortedModels) {
    const shortName = model.split("/")[1]?.slice(0, 25) || model
    const w = stats.modelWins[model] || 0
    const l = stats.modelLosses[model] || 0
    const t = stats.modelTies[model] || 0
    console.log(`║    ${shortName.padEnd(25)} W:${String(w).padStart(3)} L:${String(l).padStart(3)} T:${String(t).padStart(3)}  ║`)
  }

  console.log("╚══════════════════════════════════════════════════════════════╝")
}

// -----------------------------------------------------------------------------
// Entry Point
// -----------------------------------------------------------------------------

runTournament().catch((error) => {
  console.error("Tournament error:", error)
  process.exit(1)
})

