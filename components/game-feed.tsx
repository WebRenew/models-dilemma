"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import type { GameRecord, Decision } from "@/lib/game-logic"
import { fetchRecentGames, fetchNewGames } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
function LiveMatchRow({ match }: { match: LiveMatch }) {
  const pendingRounds = match.totalRounds - match.rounds.length
  const isStarting = match.rounds.length === 0
  const currentRound = match.currentRound || match.rounds.length

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="flex flex-col gap-2 py-4 border-l-2 border-emerald-500 pl-2 sm:pl-4 -ml-2 sm:-ml-4 bg-emerald-500/5"
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-1">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-emerald-500"
        />
        <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
          {isStarting ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              Starting match...
            </motion.span>
          ) : (
            `Live • Round ${currentRound}/${match.totalRounds}`
          )}
        </span>
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
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
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
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{match.scoreB}</span>
      </div>
    </motion.div>
  )
}

function GameRow({ game, isNew }: { game: GameRecord; isNew: boolean }) {
  const gameWinner = game.winner

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-2 py-4"
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
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {game.rounds.map((round, i) => {
            const winner = getRoundWinner(round.agent1Decision, round.agent2Decision)
            return <DecisionDot key={i} decision={round.agent1Decision} isWinner={winner === "agent1"} />
          })}
        </div>
        <span className="font-mono text-xs sm:text-sm text-white/80 w-8 sm:w-10 text-right ml-auto">{game.agent1TotalScore}</span>
        <span className="w-10 hidden sm:block">
          <FramingIndicator framing={game.framing} scenario={game.scenario} />
        </span>
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

  // Fetch live matches from game_rounds (games in progress = not yet has is_final_round=true)
  const fetchLiveMatches = useCallback(async () => {
    const supabase = createClient()

    // Get recent game_ids that started in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    const { data: recentRounds, error } = await supabase
      .from("game_rounds")
      .select("*")
      .gte("game_timestamp", tenMinutesAgo)
      .order("game_timestamp", { ascending: false })

    console.log('[fetchLiveMatches] Query result:', { 
      roundCount: recentRounds?.length || 0, 
      error: error?.message,
      tenMinutesAgo 
    })

    if (error || !recentRounds) {
      console.error('[fetchLiveMatches] Error:', error)
      return
    }

    // Group by game_id
    const gameMap = new Map<string, typeof recentRounds>()
    for (const round of recentRounds) {
      const existing = gameMap.get(round.game_id) || []
      existing.push(round)
      gameMap.set(round.game_id, existing)
    }

    console.log('[fetchLiveMatches] Games found:', gameMap.size)

    // Find games that are in progress (have rounds but no final round yet)
    const liveGames: LiveMatch[] = []
    
    for (const [gameId, rounds] of gameMap) {
      const sortedRounds = rounds.sort((a, b) => a.round_number - b.round_number)
      const hasFinalRound = sortedRounds.some(r => r.is_final_round)
      
      console.log(`[fetchLiveMatches] Game ${gameId.slice(0,8)}: ${rounds.length} rounds, final: ${hasFinalRound}`)
      
      // If no final round yet, it's live
      if (!hasFinalRound && sortedRounds.length > 0) {
        const firstRound = sortedRounds[0]
        const lastRound = sortedRounds[sortedRounds.length - 1]
        
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
          rounds: sortedRounds.map((r) => ({
            round: r.round_number,
            actionA: r.agent1_decision,
            actionB: r.agent2_decision,
            payoffA: r.agent1_round_points,
            payoffB: r.agent2_round_points,
          })),
        })
      }
    }

    console.log('[fetchLiveMatches] Live games:', liveGames.length)
    setLiveMatches(liveGames)
  }, [])

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
      const queryTime = lastFetchTimeRef.current - 10000 // 10s buffer for slow games
      const newGames = await fetchNewGames(queryTime)

      console.log('[pollNewGames] Found', newGames.length, 'games since', new Date(queryTime).toISOString())

      const trulyNewGames = newGames.filter((g) => !seenGameIdsRef.current.has(g.id))

      if (trulyNewGames.length > 0) {
        console.log('[pollNewGames] Adding', trulyNewGames.length, 'new games to feed')
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
  }, [fetchLiveMatches])

  // Subscribe to realtime updates for game_rounds (single table for everything)
  useEffect(() => {
    const supabase = createClient()
    
    // Subscribe to all game_rounds changes
    const gameRoundsChannel = supabase
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
          console.log('[Realtime] New round:', newRound.game_id, 'final:', newRound.is_final_round)
          
          // Refresh live matches on any new round
          fetchLiveMatches()
          
          // If it's a final round, also refresh completed games
          if (newRound.is_final_round) {
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
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status)
      })

    return () => {
      supabase.removeChannel(gameRoundsChannel)
    }
  }, [onNewGame, fetchLiveMatches])

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
