"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import type { GameRecord, Decision } from "@/lib/game-logic"
import { fetchRecentGames, fetchNewGames } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/client"

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
  rounds: Array<{
    round: number
    actionA: string
    actionB: string
    payoffA: number
    payoffB: number
  }>
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

function FillingDot({ isNext }: { isNext: boolean }) {
  return (
    <motion.div
      animate={isNext ? { 
        borderColor: ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.8)", "rgba(255,255,255,0.3)"],
      } : {}}
      transition={{ duration: 1.2, repeat: Infinity }}
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

// Live match row - shows in-progress matches
function LiveMatchRow({ match }: { match: LiveMatch }) {
  const scenarioLabel = match.scenario ? `[${match.scenario.slice(0, 1).toUpperCase()}]` : "[O]"
  const pendingRounds = match.totalRounds - match.rounds.length

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 py-4 border-l-2 border-emerald-500 pl-2 sm:pl-4 -ml-2 sm:-ml-4 bg-emerald-500/5"
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-1">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-emerald-500"
        />
        <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
          Live • Round {match.currentRound}/{match.totalRounds}
        </span>
        <span className="font-mono text-[10px] text-white/40 ml-auto">{scenarioLabel}</span>
      </div>

      {/* Model A row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span className="font-mono text-[10px] sm:text-xs truncate block text-white">
            {formatModelName(match.modelAName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {match.rounds.map((round, i) => {
            const winner = getRoundWinner(round.actionA, round.actionB)
            return (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              >
                <DecisionDot decision={round.actionA} isWinner={winner === "agent1"} />
              </motion.div>
            )
          })}
          {Array.from({ length: pendingRounds }).map((_, i) => (
            <FillingDot key={`pending-${i}`} isNext={i === 0} />
          ))}
        </div>
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{match.scoreA}</span>
      </div>

      {/* Model B row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span className="font-mono text-[10px] sm:text-xs truncate block text-white/60">
            {formatModelName(match.modelBName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {match.rounds.map((round, i) => {
            const winner = getRoundWinner(round.actionA, round.actionB)
            return (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              >
                <DecisionDot decision={round.actionB} isWinner={winner === "agent2"} />
              </motion.div>
            )
          })}
          {Array.from({ length: pendingRounds }).map((_, i) => (
            <FillingDot key={`pending-${i}`} isNext={i === 0} />
          ))}
        </div>
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{match.scoreB}</span>
      </div>
    </motion.div>
  )
}

function GameRow({ game, isNew }: { game: GameRecord; isNew: boolean }) {
  const gameWinner = game.winner
  const framingIndicator = game.framing === "cloaked" ? "[C]" : "[O]"

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-2 py-4"
    >
      {/* Header with framing indicator */}
      <div className="flex items-center justify-between mb-1 sm:hidden">
        <span className="font-mono text-[10px] text-white/40">{framingIndicator}</span>
      </div>
      {/* Agent 1 row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 sm:w-12 shrink-0 text-right">
          {gameWinner === "agent1" && <span className="text-[#4ade80] text-[10px] sm:text-xs font-mono">WIN</span>}
          {gameWinner === "error" && <span className="text-[oklch(77.21%_.1991_64.28)] text-[10px] sm:text-xs font-mono">ERR</span>}
        </div>
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span
            className={`font-mono text-[10px] sm:text-xs truncate block ${gameWinner === "agent1" ? "text-white" : "text-white/60"}`}
          >
            {formatModelName(game.agent1DisplayName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {game.rounds.map((round, i) => {
            const winner = getRoundWinner(round.agent1Decision, round.agent2Decision)
            return <DecisionDot key={i} decision={round.agent1Decision} isWinner={winner === "agent1"} />
          })}
        </div>
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{game.agent1TotalScore}</span>
        <span className="font-mono text-[10px] text-white/40 w-8 hidden sm:block">{framingIndicator}</span>
      </div>
      {/* Agent 2 row */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 sm:w-12 shrink-0 text-right">
          {gameWinner === "agent2" && <span className="text-[#4ade80] text-[10px] sm:text-xs font-mono">WIN</span>}
          {gameWinner === "error" && <span className="text-[oklch(77.21%_.1991_64.28)] text-[10px] sm:text-xs font-mono">ERR</span>}
        </div>
        <div className="w-24 sm:w-32 md:w-48 shrink-0">
          <span
            className={`font-mono text-[10px] sm:text-xs truncate block ${gameWinner === "agent2" ? "text-white" : "text-white/60"}`}
          >
            {formatModelName(game.agent2DisplayName)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {game.rounds.map((round, i) => {
            const winner = getRoundWinner(round.agent1Decision, round.agent2Decision)
            return <DecisionDot key={i} decision={round.agent2Decision} isWinner={winner === "agent2"} />
          })}
        </div>
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{game.agent2TotalScore}</span>
        <span className="w-8 hidden sm:block" />
      </div>
    </motion.div>
  )
}

export function GameFeed({ userGames = [], onNewGame, onLiveMatchCountChange }: GameFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dbGames, setDbGames] = useState<GameRecord[]>([])
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const lastFetchTimeRef = useRef<number>(Date.now())
  const seenGameIdsRef = useRef<Set<string>>(new Set())

  // Combine user games and db games, sorted by timestamp
  const allGames = [...userGames, ...dbGames]
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((game, index, self) => index === self.findIndex((g) => g.id === game.id))

  // Fetch live matches from the matches table
  const fetchLiveMatches = async () => {
    const supabase = createClient()

    // Get running matches
    const { data: runningMatches, error } = await supabase
      .from("matches")
      .select("*")
      .eq("status", "running")
      .order("started_at", { ascending: false })

    if (error || !runningMatches) {
      return
    }

    // For each running match, fetch its rounds
    const matchesWithRounds: LiveMatch[] = []

    for (const match of runningMatches) {
      const { data: rounds } = await supabase
        .from("rounds")
        .select("*")
        .eq("match_id", match.id)
        .order("round_number", { ascending: true })

      matchesWithRounds.push({
        id: match.id,
        modelA: match.model_a_id,
        modelB: match.model_b_id,
        modelAName: match.model_a_name,
        modelBName: match.model_b_name,
        scenario: match.scenario,
        framing: match.framing_a === "overt" ? "overt" : "cloaked",
        currentRound: match.current_round || 0,
        totalRounds: match.total_rounds || 10,
        scoreA: match.score_a || 0,
        scoreB: match.score_b || 0,
        status: match.status,
        rounds: (rounds || []).map((r) => ({
          round: r.round_number,
          actionA: r.action_a,
          actionB: r.action_b,
          payoffA: r.payoff_a,
          payoffB: r.payoff_b,
        })),
      })
    }

    setLiveMatches(matchesWithRounds)
  }

  // Initial load of games from Supabase
  useEffect(() => {
    const loadInitialGames = async () => {
      setIsLoading(true)
      const games = await fetchRecentGames(50)
      games.forEach((g) => seenGameIdsRef.current.add(g.id))
      setDbGames(games)
      await fetchLiveMatches()
      setIsLoading(false)
      lastFetchTimeRef.current = Date.now()
    }
    loadInitialGames()
  }, [])

  // Poll for new completed games every 3 seconds
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const newGames = await fetchNewGames(lastFetchTimeRef.current - 5000) // 5s buffer

      const trulyNewGames = newGames.filter((g) => !seenGameIdsRef.current.has(g.id))

      if (trulyNewGames.length > 0) {
        trulyNewGames.forEach((g) => seenGameIdsRef.current.add(g.id))
        setDbGames((prev) => {
          const combined = [...trulyNewGames, ...prev]
          return combined.slice(0, 100) // Keep last 100 games
        })

        // Notify parent of new games
        trulyNewGames.forEach((g) => onNewGame?.(g))

        // Scroll to top to show new games
        if (containerRef.current) {
          containerRef.current.scrollTop = 0
        }
      }

      lastFetchTimeRef.current = Date.now()
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [onNewGame])

  // Notify parent of live match count changes
  useEffect(() => {
    onLiveMatchCountChange?.(liveMatches.length)
  }, [liveMatches.length, onLiveMatchCountChange])

  // Poll for live match updates every 1 second as fallback
  useEffect(() => {
    const liveInterval = setInterval(fetchLiveMatches, 1000)
    return () => clearInterval(liveInterval)
  }, [])

  // Subscribe to realtime updates for matches and rounds
  useEffect(() => {
    const supabase = createClient()
    
    // Subscribe to match changes (new matches starting, status changes)
    const matchesChannel = supabase
      .channel('matches-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        (payload) => {
          console.log('[Realtime] Match change:', payload.eventType)
          // Refresh live matches on any match change
          fetchLiveMatches()
        }
      )
      .subscribe()

    // Subscribe to round changes (new rounds being played)
    const roundsChannel = supabase
      .channel('rounds-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
        },
        (payload) => {
          console.log('[Realtime] New round:', payload.new)
          // Refresh live matches when a new round is inserted
          fetchLiveMatches()
        }
      )
      .subscribe()

    // Subscribe to game_rounds for completed games
    const gameRoundsChannel = supabase
      .channel('game-rounds-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_rounds',
          filter: 'is_final_round=eq.true',
        },
        async () => {
          console.log('[Realtime] Game completed')
          // Fetch new completed games
          const newGames = await fetchNewGames(lastFetchTimeRef.current - 5000)
          const trulyNewGames = newGames.filter((g) => !seenGameIdsRef.current.has(g.id))
          
          if (trulyNewGames.length > 0) {
            trulyNewGames.forEach((g) => seenGameIdsRef.current.add(g.id))
            setDbGames((prev) => {
              const combined = [...trulyNewGames, ...prev]
              return combined.slice(0, 100)
            })
            trulyNewGames.forEach((g) => onNewGame?.(g))
            lastFetchTimeRef.current = Date.now()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(matchesChannel)
      supabase.removeChannel(roundsChannel)
      supabase.removeChannel(gameRoundsChannel)
    }
  }, [onNewGame])

  return (
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
                  <LiveMatchRow key={match.id} match={match} />
                ))}
              </div>
            )}

            {/* Completed games */}
            {allGames.length === 0 && liveMatches.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-white/50 font-mono text-sm">Waiting for games...</p>
              </div>
            ) : (
              allGames.map((game, index) => (
                <GameRow key={game.id} game={game} isNew={index === 0} />
              ))
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
