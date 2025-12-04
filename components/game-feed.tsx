"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import type { GameRecord, Decision } from "@/lib/game-logic"
import { fetchRecentGames, fetchNewGames, fetchOlderGames } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { GameReplayModal } from "@/components/game-replay-modal"
import { LiveGameModal } from "@/components/live-game-modal"

interface GameFeedProps {
  userGames?: GameRecord[]
  onNewGame?: (game: GameRecord) => void
  onLiveMatchCountChange?: (count: number) => void
}

interface LiveMatch {
  id: string
  modelA: string
  modelB: string
  modelAName: string
  modelBName: string
  scenario: string | null
  framing: "overt" | "cloaked"
  currentRound: number
  totalRounds: number
  scoreA: number
  scoreB: number
  status: "running" | "completed" | "failed"
  gameSource: "trigger" | "user" | string
  rounds: Array<{
    round: number
    actionA: string
    actionB: string
    payoffA: number
    payoffB: number
    reasoningA?: string | null
    reasoningB?: string | null
  }>
  // Live status for retry tracking
  agent1Status?: string | null
  agent2Status?: string | null
  agent1RetryCount?: number | null
  agent2RetryCount?: number | null
  lastError?: string | null
}

function formatAgentStatusShort(status: string | null): string | null {
  if (!status) return null
  switch (status) {
    case "waiting": return null
    case "processing": return null
    case "retrying_1": return "⚠️ Retrying"
    case "retrying_2": return "⚠️ Final retry"
    case "done": return null
    case "error": return "❌ Failed"
    default: return status.startsWith("retrying_") ? "⚠️ Retrying" : null
  }
}

function formatModelName(slug: string): string {
  const nameWithoutProvider = slug.replace(/^[^/]+\//, "")
  return nameWithoutProvider.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function DecisionDot({ decision, isWinner }: { decision: Decision | string; isWinner: boolean }) {
  const bgColor =
    decision === "error"
      ? "bg-[oklch(77.21%_.1991_64.28)]"
      : decision === "cooperate"
        ? "bg-[#4ade80]"
        : "bg-[#f87171]"

  return (
    <div
      className={`w-3 h-3 rounded-full ${bgColor} ${isWinner ? "ring-2 ring-white ring-offset-1 ring-offset-black" : ""}`}
    />
  )
}

function PendingDot() {
  return (
    <div className="w-3 h-3 rounded-full border border-white/30 bg-transparent" />
  )
}

function FillingDot({ isNext, index = 0, stagger = false }: { isNext: boolean; index?: number; stagger?: boolean }) {
  return (
    <motion.div
      initial={stagger ? { scale: 0, opacity: 0 } : false}
      animate={isNext ? { 
        scale: 1,
        opacity: 1,
        borderColor: ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.8)", "rgba(255,255,255,0.3)"],
      } : { scale: 1, opacity: 1 }}
      transition={stagger ? {
        delay: index * 0.05,
        duration: 0.3,
        borderColor: isNext ? { duration: 1.2, repeat: Infinity } : undefined,
      } : {
        borderColor: isNext ? { duration: 1.2, repeat: Infinity } : undefined,
      }}
      className="w-3 h-3 rounded-full border border-white/30 bg-transparent"
    />
  )
}

function getRoundWinner(agent1Decision: Decision | string, agent2Decision: Decision | string): "agent1" | "agent2" | "tie" | "error" {
  if (agent1Decision === "error" || agent2Decision === "error") return "error"
  if (agent1Decision === agent2Decision) return "tie"
  if (agent1Decision === "defect") return "agent1"
  return "agent2"
}

function getScenarioLabel(scenario: string | null | undefined): string {
  if (!scenario) return ""
  if (scenario === "sales") return "S"
  if (scenario === "research") return "R"
  if (scenario === "creator") return "C"
  return ""
}

function FramingIndicator({ framing, scenario }: { framing: "overt" | "cloaked" | undefined; scenario?: string | null }) {
  const isOvert = framing !== "cloaked"
  const scenarioLabel = getScenarioLabel(scenario)
  
  const tooltipText = isOvert 
    ? "Overt: Models know they're playing Prisoner's Dilemma with explicit COOPERATE/DEFECT choices"
    : `Cloaked: Models are given a business scenario without knowing it's Prisoner's Dilemma${scenario ? ` (${scenario === "sales" ? "Sales: SHARE/HOLD" : scenario === "research" ? "Research: OPEN/GUARDED" : "Creator: SUPPORT/INDEPENDENT"})` : ""}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-[10px] text-white/40 cursor-help">
            {isOvert ? "[O]" : `[C${scenarioLabel ? `:${scenarioLabel}` : ""}]`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[250px] text-xs">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Live match row - shows in-progress matches
function LiveMatchRow({ match, onClick }: { match: LiveMatch; onClick: () => void }) {
  const pendingRounds = match.totalRounds - match.rounds.length
  const isStarting = match.rounds.length === 0
  const currentRound = match.currentRound || match.rounds.length
  
  const agent1RetryStatus = formatAgentStatusShort(match.agent1Status ?? null)
  const agent2RetryStatus = formatAgentStatusShort(match.agent2Status ?? null)
  const hasRetryStatus = agent1RetryStatus || agent2RetryStatus

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onClick={onClick}
      className="flex flex-col gap-2 py-4 border-l-2 border-emerald-500 pl-2 sm:pl-4 -ml-2 sm:-ml-4 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 transition-colors"
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-1">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className={`w-2 h-2 rounded-full ${hasRetryStatus ? "bg-amber-500" : "bg-emerald-500"}`}
        />
        <span className={`font-mono text-[10px] uppercase tracking-wider ${hasRetryStatus ? "text-amber-400" : "text-emerald-400"}`}>
          {isStarting ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              Starting match...
            </motion.span>
          ) : hasRetryStatus ? (
            `Live • Round ${currentRound}/${match.totalRounds} • ${agent1RetryStatus || agent2RetryStatus}`
          ) : (
            `Live • Round ${currentRound}/${match.totalRounds}`
          )}
        </span>
        {match.gameSource === "user" && (
          <span className="text-violet-400 font-mono text-[10px] uppercase tracking-wider ml-2 px-1.5 py-0.5 bg-violet-500/20 rounded">
            User Game
          </span>
        )}
        <span className="ml-auto">
          <FramingIndicator framing={match.framing} scenario={match.scenario} />
        </span>
      </div>

      {/* Model A row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span className="font-mono text-[10px] sm:text-xs truncate block text-white">
            {formatModelName(match.modelAName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap flex-1 min-w-0">
          {match.rounds.map((round) => {
            const winner = getRoundWinner(round.actionA, round.actionB)
            return (
              <motion.div
                key={`round-a-${match.id}-${round.round}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              >
                <DecisionDot decision={round.actionA} isWinner={winner === "agent1"} />
              </motion.div>
            )
          })}
          {Array.from({ length: pendingRounds }).map((_, i) => (
            <FillingDot 
              key={`pending-${i}`} 
              isNext={i === 0} 
              index={match.rounds.length + i}
              stagger={isStarting}
            />
          ))}
        </div>
        {/* Score wrapper - fixed width for alignment */}
        <div className="shrink-0 w-8">
          <span className="font-mono text-xs sm:text-sm text-white/80 block text-right tabular-nums">{match.scoreA}</span>
        </div>
      </div>

      {/* Model B row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span className="font-mono text-[10px] sm:text-xs truncate block text-white/60">
            {formatModelName(match.modelBName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap flex-1 min-w-0">
          {match.rounds.map((round) => {
            const winner = getRoundWinner(round.actionA, round.actionB)
            return (
              <motion.div
                key={`round-b-${match.id}-${round.round}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              >
                <DecisionDot decision={round.actionB} isWinner={winner === "agent2"} />
              </motion.div>
            )
          })}
          {Array.from({ length: pendingRounds }).map((_, i) => (
            <FillingDot 
              key={`pending-${i}`} 
              isNext={i === 0}
              index={match.rounds.length + i}
              stagger={isStarting}
            />
          ))}
        </div>
        {/* Score wrapper - fixed width for alignment */}
        <div className="shrink-0 w-8">
          <span className="font-mono text-xs sm:text-sm text-white/80 block text-right tabular-nums">{match.scoreB}</span>
        </div>
      </div>
    </motion.div>
  )
}

// Debounce helper to prevent rapid successive calls
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }) as T
}

function GameRow({ game, isNew, onClick }: { game: GameRecord; isNew: boolean; onClick: () => void }) {
  const gameWinner = game.winner

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="flex flex-col gap-2 py-4 cursor-pointer hover:bg-white/[0.02] -mx-2 sm:-mx-4 px-2 sm:px-4 transition-colors"
    >
      {/* Header with framing indicator - mobile only */}
      <div className="flex items-center justify-between mb-1 sm:hidden">
        <FramingIndicator framing={game.framing} scenario={game.scenario} />
      </div>
      {/* Agent 1 row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 sm:w-12 shrink-0 text-right">
          {gameWinner === "agent1" && <span className="text-[#4ade80] text-[10px] sm:text-xs font-mono">WIN</span>}
        </div>
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span
            className={`font-mono text-[10px] sm:text-xs truncate block ${gameWinner === "agent1" ? "text-white" : "text-white/60"}`}
          >
            {formatModelName(game.agent1DisplayName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap flex-1 min-w-0">
          {game.rounds.map((round, i) => {
            const winner = getRoundWinner(round.agent1Decision, round.agent2Decision)
            return <DecisionDot key={i} decision={round.agent1Decision} isWinner={winner === "agent1"} />
          })}
        </div>
        {/* Score wrapper - fixed width for alignment */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs sm:text-sm text-white/80 w-8 text-right tabular-nums">{game.agent1TotalScore}</span>
          <span className="w-12 hidden sm:flex justify-end">
            <FramingIndicator framing={game.framing} scenario={game.scenario} />
          </span>
        </div>
      </div>
      {/* Agent 2 row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 sm:w-12 shrink-0 text-right">
          {gameWinner === "agent2" && <span className="text-[#4ade80] text-[10px] sm:text-xs font-mono">WIN</span>}
        </div>
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span
            className={`font-mono text-[10px] sm:text-xs truncate block ${gameWinner === "agent2" ? "text-white" : "text-white/60"}`}
          >
            {formatModelName(game.agent2DisplayName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap flex-1 min-w-0">
          {game.rounds.map((round, i) => {
            const winner = getRoundWinner(round.agent1Decision, round.agent2Decision)
            return <DecisionDot key={i} decision={round.agent2Decision} isWinner={winner === "agent2"} />
          })}
        </div>
        {/* Score wrapper - fixed width for alignment */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs sm:text-sm text-white/80 w-8 text-right tabular-nums">{game.agent2TotalScore}</span>
          <span className="w-12 hidden sm:block" />
        </div>
      </div>
    </motion.div>
  )
}

export function GameFeed({ userGames = [], onNewGame, onLiveMatchCountChange }: GameFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dbGames, setDbGames] = useState<GameRecord[]>([])
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null)
  const [isReplayModalOpen, setIsReplayModalOpen] = useState(false)
  const [selectedLiveMatch, setSelectedLiveMatch] = useState<LiveMatch | null>(null)
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false)
  const lastFetchTimeRef = useRef<number>(Date.now())
  const seenGameIdsRef = useRef<Set<string>>(new Set())
  const oldestTimestampRef = useRef<number | null>(null)
  const supabaseRef = useRef(createClient())

  const handleGameClick = useCallback((game: GameRecord) => {
    setSelectedGame(game)
    setIsReplayModalOpen(true)
  }, [])

  const handleLiveMatchClick = useCallback((match: LiveMatch) => {
    setSelectedLiveMatch(match)
    setIsLiveModalOpen(true)
  }, [])

  // Combine user games and db games, sorted by timestamp
  const allGames = [...userGames, ...dbGames]
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((game, index, self) => index === self.findIndex((g) => g.id === game.id))

  // Fetch live matches from game_rounds (games in progress = not yet has is_final_round=true)
  const fetchLiveMatches = useCallback(async () => {
    // Get rounds created in the last 30 minutes (games can run slow with retries)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    
    // Select only the columns we need instead of *
    const { data: recentRounds, error } = await supabaseRef.current
      .from("game_rounds")
      .select(`
        game_id,
        round_number,
        total_rounds,
        agent1_model_id,
        agent1_display_name,
        agent1_decision,
        agent1_reasoning,
        agent1_round_points,
        agent1_cumulative_score,
        agent2_model_id,
        agent2_display_name,
        agent2_decision,
        agent2_reasoning,
        agent2_round_points,
        agent2_cumulative_score,
        is_final_round,
        scenario,
        game_type,
        game_source
      `)
      .gte("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false })

    if (error || !recentRounds) {
      console.error('[fetchLiveMatches] Error:', error)
      return
    }

    // Also fetch live status for all recent games - only needed columns
    const { data: liveStatuses } = await supabaseRef.current
      .from("game_live_status")
      .select("game_id, agent1_status, agent2_status, agent1_retry_count, agent2_retry_count, last_error")
    
    const statusMap = new Map<string, {
      agent1_status: string | null
      agent2_status: string | null
      agent1_retry_count: number | null
      agent2_retry_count: number | null
      last_error: string | null
    }>()
    
    if (liveStatuses) {
      for (const status of liveStatuses) {
        statusMap.set(status.game_id, {
          agent1_status: status.agent1_status,
          agent2_status: status.agent2_status,
          agent1_retry_count: status.agent1_retry_count,
          agent2_retry_count: status.agent2_retry_count,
          last_error: status.last_error,
        })
      }
    }

    // Group by game_id
    const gameMap = new Map<string, typeof recentRounds>()
    for (const round of recentRounds) {
      const existing = gameMap.get(round.game_id) || []
      existing.push(round)
      gameMap.set(round.game_id, existing)
    }

    // Find games that are in progress (have rounds but no final round yet)
    const liveGames: LiveMatch[] = []
    
    for (const [gameId, rounds] of gameMap) {
      const sortedRounds = rounds.sort((a, b) => a.round_number - b.round_number)
      const hasFinalRound = sortedRounds.some(r => r.is_final_round)
      
      // If no final round yet, it's live
      if (!hasFinalRound && sortedRounds.length > 0) {
        const firstRound = sortedRounds[0]
        const lastRound = sortedRounds[sortedRounds.length - 1]
        const liveStatus = statusMap.get(gameId)
        
        liveGames.push({
          id: gameId,
          modelA: firstRound.agent1_model_id,
          modelB: firstRound.agent2_model_id,
          modelAName: firstRound.agent1_display_name,
          modelBName: firstRound.agent2_display_name,
          scenario: firstRound.scenario,
          framing: firstRound.game_type === "control" ? "overt" : "cloaked",
          currentRound: lastRound.round_number,
          totalRounds: firstRound.total_rounds,
          scoreA: lastRound.agent1_cumulative_score,
          scoreB: lastRound.agent2_cumulative_score,
          status: "running",
          gameSource: firstRound.game_source || "trigger",
          rounds: sortedRounds.map((r) => ({
            round: r.round_number,
            actionA: r.agent1_decision,
            actionB: r.agent2_decision,
            payoffA: r.agent1_round_points,
            payoffB: r.agent2_round_points,
            reasoningA: r.agent1_reasoning,
            reasoningB: r.agent2_reasoning,
          })),
          // Include live status for retry display
          agent1Status: liveStatus?.agent1_status,
          agent2Status: liveStatus?.agent2_status,
          agent1RetryCount: liveStatus?.agent1_retry_count,
          agent2RetryCount: liveStatus?.agent2_retry_count,
          lastError: liveStatus?.last_error,
        })
      }
    }

    setLiveMatches(liveGames)
  }, [])

  // Load more games (pagination)
  const loadMoreGames = useCallback(async () => {
    if (isLoadingMore || !hasMore || !oldestTimestampRef.current) return
    
    setIsLoadingMore(true)
    const olderGames = await fetchOlderGames(oldestTimestampRef.current, 50)
    
    if (olderGames.length === 0) {
      setHasMore(false)
    } else {
      olderGames.forEach((g) => seenGameIdsRef.current.add(g.id))
      setDbGames((prev) => [...prev, ...olderGames])
      
      // Update oldest timestamp
      const oldest = olderGames[olderGames.length - 1]
      if (oldest) {
        oldestTimestampRef.current = oldest.timestamp
      }
      
      // If we got fewer than requested, no more to load
      if (olderGames.length < 50) {
        setHasMore(false)
      }
    }
    
    setIsLoadingMore(false)
  }, [isLoadingMore, hasMore])

  // Initial load of games from Supabase
  useEffect(() => {
    const loadInitialGames = async () => {
      setIsLoading(true)
      const games = await fetchRecentGames(50)
      games.forEach((g) => seenGameIdsRef.current.add(g.id))
      setDbGames(games)
      
      // Track oldest timestamp for pagination
      if (games.length > 0) {
        const oldest = games[games.length - 1]
        oldestTimestampRef.current = oldest.timestamp
        setHasMore(games.length >= 50) // May have more if we got a full batch
      } else {
        setHasMore(false)
      }
      
      await fetchLiveMatches()
      setIsLoading(false)
      lastFetchTimeRef.current = Date.now()
    }
    loadInitialGames()
  }, [])

  // Poll for new completed games every 10 seconds as backup (realtime handles most updates)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const queryTime = lastFetchTimeRef.current - 15000 // 15s buffer for slow games
      const newGames = await fetchNewGames(queryTime)

      const trulyNewGames = newGames.filter((g) => !seenGameIdsRef.current.has(g.id))

      if (trulyNewGames.length > 0) {
        trulyNewGames.forEach((g) => seenGameIdsRef.current.add(g.id))
        setDbGames((prev) => [...trulyNewGames, ...prev])

        // Notify parent of new games
        trulyNewGames.forEach((g) => onNewGame?.(g))

        // Scroll to top to show new games
        if (containerRef.current) {
          containerRef.current.scrollTop = 0
        }
      }

      lastFetchTimeRef.current = Date.now()
    }, 10000)

    return () => clearInterval(pollInterval)
  }, [onNewGame])

  // Notify parent of live match count changes
  useEffect(() => {
    onLiveMatchCountChange?.(liveMatches.length)
  }, [liveMatches.length, onLiveMatchCountChange])

  // Debounced version of fetchLiveMatches to prevent rapid-fire calls from realtime
  const debouncedFetchLiveMatches = useCallback(
    debounce(() => fetchLiveMatches(), 300),
    [fetchLiveMatches]
  )

  // Subscribe to realtime updates for game_rounds and game_live_status
  // No polling needed - realtime handles updates
  useEffect(() => {
    // Subscribe to all game_rounds changes
    const gameRoundsChannel = supabaseRef.current
      .channel('game-rounds-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_rounds',
        },
        async (payload) => {
          const newRound = payload.new as { is_final_round: boolean; game_id: string }
          
          // Refresh live matches on any new round (debounced)
          debouncedFetchLiveMatches()
          
          // If it's a final round, also refresh completed games
          if (newRound.is_final_round) {
            const newGames = await fetchNewGames(lastFetchTimeRef.current - 5000)
            const trulyNewGames = newGames.filter((g) => !seenGameIdsRef.current.has(g.id))
            
            if (trulyNewGames.length > 0) {
              trulyNewGames.forEach((g) => seenGameIdsRef.current.add(g.id))
              setDbGames((prev) => [...trulyNewGames, ...prev])
              trulyNewGames.forEach((g) => onNewGame?.(g))
              lastFetchTimeRef.current = Date.now()
            }
          }
        }
      )
      .subscribe()

    // Subscribe to live status changes (for retry status updates)
    const liveStatusChannel = supabaseRef.current
      .channel('live-status-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'game_live_status',
        },
        () => {
          // Refresh live matches to pick up retry status changes (debounced)
          debouncedFetchLiveMatches()
        }
      )
      .subscribe()

    return () => {
      supabaseRef.current.removeChannel(gameRoundsChannel)
      supabaseRef.current.removeChannel(liveStatusChannel)
    }
  }, [onNewGame, debouncedFetchLiveMatches])

  return (
    <>
      <div ref={containerRef} className="h-full overflow-y-auto scrollbar-hide px-2 sm:px-4 lg:px-6">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/50 font-mono text-sm">Loading games...</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/10">
              {/* Live matches at the top */}
              {liveMatches.length > 0 && (
                <div className="pb-4">
                  <div className="flex items-center gap-2 mb-2 py-2">
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-emerald-500"
                    />
                    <span className="text-emerald-400 font-mono text-xs uppercase tracking-wider">
                      {liveMatches.length} Live {liveMatches.length === 1 ? "Match" : "Matches"}
                    </span>
                  </div>
                {liveMatches.map((match) => (
                  <LiveMatchRow 
                    key={match.id} 
                    match={match} 
                    onClick={() => handleLiveMatchClick(match)}
                  />
                ))}
                </div>
              )}

              {/* Completed games */}
              {allGames.length === 0 && liveMatches.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-white/50 font-mono text-sm">Waiting for games...</p>
                </div>
              ) : (
                <>
                  {allGames.map((game, index) => (
                    <GameRow 
                      key={game.id} 
                      game={game} 
                      isNew={index === 0} 
                      onClick={() => handleGameClick(game)}
                    />
                  ))}
                  
                  {/* Load More Button */}
                  {hasMore && allGames.length > 0 && (
                    <div className="py-6 flex justify-center">
                      <button
                        onClick={loadMoreGames}
                        disabled={isLoadingMore}
                        className="px-6 py-2 border border-white/20 text-white/60 hover:text-white hover:border-white/40 font-mono text-xs uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingMore ? (
                          <span className="flex items-center gap-2">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-3 h-3 border border-white/40 border-t-white rounded-full"
                            />
                            Loading...
                          </span>
                        ) : (
                          "Load More Games"
                        )}
                      </button>
                    </div>
                  )}
                  
                  {/* End of history message */}
                  {!hasMore && allGames.length > 0 && (
                    <div className="py-6 flex justify-center">
                      <p className="text-white/30 font-mono text-xs">End of match history</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Game Replay Modal */}
      <GameReplayModal
        isOpen={isReplayModalOpen}
        onClose={() => setIsReplayModalOpen(false)}
        game={selectedGame}
      />
      
      {/* Live Game Modal */}
      <LiveGameModal
        isOpen={isLiveModalOpen}
        onClose={() => setIsLiveModalOpen(false)}
        gameId={selectedLiveMatch?.id ?? null}
        initialData={selectedLiveMatch ? {
          modelA: selectedLiveMatch.modelA,
          modelB: selectedLiveMatch.modelB,
          modelAName: selectedLiveMatch.modelAName,
          modelBName: selectedLiveMatch.modelBName,
          scenario: selectedLiveMatch.scenario,
          framing: selectedLiveMatch.framing,
          totalRounds: selectedLiveMatch.totalRounds,
          rounds: selectedLiveMatch.rounds,
          scoreA: selectedLiveMatch.scoreA,
          scoreB: selectedLiveMatch.scoreB,
        } : null}
      />
    </>
  )
}
