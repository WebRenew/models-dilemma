"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { X, Brain, Info } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { getShortModelName } from "@/lib/game-logic"
import { buildPrompt, type LLMPromptContext, type CloakedScenario } from "@/lib/prompts"
import { createClient } from "@/lib/supabase/client"

interface LiveGameModalProps {
  isOpen: boolean
  onClose: () => void
  gameId: string | null
  initialData: {
    modelA: string
    modelB: string
    modelAName: string
    modelBName: string
    scenario: string | null
    framing: "overt" | "cloaked"
    totalRounds: number
    rounds: Array<{
      round: number
      actionA: string
      actionB: string
      payoffA: number
      payoffB: number
      reasoningA?: string
      reasoningB?: string
    }>
    scoreA: number
    scoreB: number
  } | null
}

interface StreamingThought {
  text: string
  isComplete: boolean
}

interface GameRoundRow {
  round_number: number
  agent1_decision: string
  agent2_decision: string
  agent1_round_points: number
  agent2_round_points: number
  agent1_cumulative_score: number
  agent2_cumulative_score: number
  agent1_reasoning: string | null
  agent2_reasoning: string | null
  is_final_round: boolean
  game_winner: string | null
}

interface LiveStatusRow {
  game_id: string
  current_round: number | null
  agent1_status: string | null
  agent2_status: string | null
  agent1_retry_count: number | null
  agent2_retry_count: number | null
  last_error: string | null
  updated_at: string | null
}

function formatAgentStatus(status: string | null, retryCount: number | null): string {
  if (!status) return "Waiting..."
  switch (status) {
    case "waiting": return "Waiting..."
    case "processing": return "Processing..."
    case "retrying_1": return `Retrying...`
    case "retrying_2": return `Retrying (final)...`
    case "done": return "Done"
    case "error": return `Failed after ${retryCount ?? 2} attempts`
    default: return status.startsWith("retrying_") ? `Retrying...` : status
  }
}

const SCENARIOS: Record<string, { name: string; badge: string }> = {
  overt: { name: "Overt (Control)", badge: "[O]" },
  sales: { name: "Sales Territory", badge: "[C:S]" },
  research: { name: "Research Lab", badge: "[C:R]" },
  creator: { name: "Content Creator", badge: "[C:C]" },
}

export function LiveGameModal({ isOpen, onClose, gameId, initialData }: LiveGameModalProps) {
  const [rounds, setRounds] = useState<Array<{
    round: number
    actionA: string
    actionB: string
    payoffA: number
    payoffB: number
    reasoningA?: string
    reasoningB?: string
  }>>(initialData?.rounds ?? [])
  const [scoreA, setScoreA] = useState(initialData?.scoreA ?? 0)
  const [scoreB, setScoreB] = useState(initialData?.scoreB ?? 0)
  const [currentRound, setCurrentRound] = useState(initialData?.rounds.length ?? 0)
  const [isComplete, setIsComplete] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [agent1Thought, setAgent1Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  const [agent2Thought, setAgent2Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  const [agent1Status, setAgent1Status] = useState<string | null>(null)
  const [agent2Status, setAgent2Status] = useState<string | null>(null)
  const [agent1RetryCount, setAgent1RetryCount] = useState<number | null>(null)
  const [agent2RetryCount, setAgent2RetryCount] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null)
  const typewriterRef1 = useRef<NodeJS.Timeout | null>(null)
  const typewriterRef2 = useRef<NodeJS.Timeout | null>(null)
  const prevGameIdRef = useRef<string | null>(null)
  const wasOpenRef = useRef(false)

  const totalRounds = initialData?.totalRounds ?? 10

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Generate system prompt for current round
  const systemPrompt = useMemo(() => {
    if (!initialData) return ""
    
    const myHistory: Array<"COOPERATE" | "DEFECT"> = []
    const opponentHistory: Array<"COOPERATE" | "DEFECT"> = []
    let myScore = 0
    let opponentScore = 0
    
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i]
      if (r.actionA !== "error") myHistory.push(r.actionA === "cooperate" ? "COOPERATE" : "DEFECT")
      if (r.actionB !== "error") opponentHistory.push(r.actionB === "cooperate" ? "COOPERATE" : "DEFECT")
      myScore += r.payoffA
      opponentScore += r.payoffB
    }
    
    const isOvert = initialData.framing === "overt"
    const scenario = initialData.scenario as CloakedScenario | undefined
    
    const ctx: LLMPromptContext = {
      variant: isOvert ? "overt" : "cloaked",
      roundNumber: rounds.length + 1,
      totalRounds: totalRounds,
      myScore,
      opponentScore,
      myHistory,
      opponentHistory,
    }
    
    return buildPrompt(ctx, scenario ? { scenario } : {})
  }, [initialData, rounds, totalRounds])

  // Typewriter effect
  const typewriter = useCallback((
    text: string,
    setter: React.Dispatch<React.SetStateAction<StreamingThought>>,
    refObj: React.MutableRefObject<NodeJS.Timeout | null>
  ) => {
    if (refObj.current) {
      clearInterval(refObj.current)
      refObj.current = null
    }

    if (!text) {
      setter({ text: "No reasoning provided.", isComplete: true })
      return
    }

    const words = text.split(" ")
    let current = ""
    let i = 0

    refObj.current = setInterval(() => {
      if (i >= words.length) {
        if (refObj.current) clearInterval(refObj.current)
        refObj.current = null
        setter({ text: current, isComplete: true })
        return
      }
      current += (i > 0 ? " " : "") + words[i]
      setter({ text: current, isComplete: false })
      i++
    }, 30)
  }, [])

  // Initialize with existing rounds' reasoning
  useEffect(() => {
    if (rounds.length > 0) {
      const lastRound = rounds[rounds.length - 1]
      if (lastRound.reasoningA) {
        typewriter(lastRound.reasoningA, setAgent1Thought, typewriterRef1)
      }
      if (lastRound.reasoningB) {
        typewriter(lastRound.reasoningB, setAgent2Thought, typewriterRef2)
      }
    }
  }, []) // Only on mount

  // Subscribe to real-time updates for game_rounds
  useEffect(() => {
    if (!isOpen || !gameId) return

    console.log("[LiveGame] Setting up Realtime subscription for game:", gameId)

    const channel = supabaseRef.current
      .channel(`live-game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_rounds",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as GameRoundRow
          console.log("[LiveGame] Received round via Realtime:", row.round_number)

          setCurrentRound(row.round_number)
          setScoreA(row.agent1_cumulative_score)
          setScoreB(row.agent2_cumulative_score)

          // Add the new round
          const newRound = {
            round: row.round_number,
            actionA: row.agent1_decision,
            actionB: row.agent2_decision,
            payoffA: row.agent1_round_points,
            payoffB: row.agent2_round_points,
            reasoningA: row.agent1_reasoning || undefined,
            reasoningB: row.agent2_reasoning || undefined,
          }

          setRounds((prev) => {
            if (prev.some((r) => r.round === row.round_number)) return prev
            return [...prev, newRound]
          })

          // Animate reasoning - don't clear previous text until new text arrives
          // This keeps previous answer visible while processing
          if (row.agent1_reasoning) {
            typewriter(row.agent1_reasoning, setAgent1Thought, typewriterRef1)
          }
          if (row.agent2_reasoning) {
            typewriter(row.agent2_reasoning, setAgent2Thought, typewriterRef2)
          }

          // Check if game is complete
          if (row.is_final_round) {
            setIsComplete(true)
            setWinner(row.game_winner)
          }
        }
      )
      .subscribe((status) => {
        console.log("[LiveGame] Subscription status:", status)
      })

    channelRef.current = channel

    return () => {
      console.log("[LiveGame] Cleaning up Realtime subscription")
      supabaseRef.current.removeChannel(channel)
      channelRef.current = null
    }
  }, [isOpen, gameId, typewriter])

  // Subscribe to live status updates (retry status)
  useEffect(() => {
    if (!isOpen || !gameId) return

    console.log("[LiveGame] Setting up live status subscription for game:", gameId)

    // Fetch initial status
    const fetchInitialStatus = async () => {
      const { data } = await supabaseRef.current
        .from("game_live_status")
        .select("*")
        .eq("game_id", gameId)
        .single()
      
      if (data) {
        const status = data as LiveStatusRow
        setAgent1Status(status.agent1_status)
        setAgent2Status(status.agent2_status)
        setAgent1RetryCount(status.agent1_retry_count)
        setAgent2RetryCount(status.agent2_retry_count)
        setLastError(status.last_error)
      }
    }
    fetchInitialStatus()

    const statusChannel = supabaseRef.current
      .channel(`live-status-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "game_live_status",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            // Game completed, clear status
            setAgent1Status(null)
            setAgent2Status(null)
            setAgent1RetryCount(null)
            setAgent2RetryCount(null)
            setLastError(null)
            return
          }

          const status = payload.new as LiveStatusRow
          console.log("[LiveGame] Status update:", status.agent1_status, status.agent2_status)
          
          setAgent1Status(status.agent1_status)
          setAgent2Status(status.agent2_status)
          setAgent1RetryCount(status.agent1_retry_count)
          setAgent2RetryCount(status.agent2_retry_count)
          setLastError(status.last_error)
        }
      )
      .subscribe((status) => {
        console.log("[LiveGame] Status subscription:", status)
      })

    return () => {
      supabaseRef.current.removeChannel(statusChannel)
    }
  }, [isOpen, gameId])

  // Reset state when modal opens with new game
  // Only clear thoughts when modal freshly opens or switches to different game
  useEffect(() => {
    if (isOpen && initialData) {
      const isNewOpen = !wasOpenRef.current
      const isDifferentGame = prevGameIdRef.current !== gameId
      const shouldResetThoughts = isNewOpen || isDifferentGame
      
      // Always update scores and rounds from latest data
      setRounds(initialData.rounds)
      setScoreA(initialData.scoreA)
      setScoreB(initialData.scoreB)
      setCurrentRound(initialData.rounds.length)
      
      // Only reset thoughts and show initial reasoning when modal opens fresh or game changes
      if (shouldResetThoughts) {
        setIsComplete(false)
        setWinner(null)
        setAgent1Thought({ text: "", isComplete: false })
        setAgent2Thought({ text: "", isComplete: false })
        setAgent1Status(null)
        setAgent2Status(null)
        setAgent1RetryCount(null)
        setAgent2RetryCount(null)
        setLastError(null)

        // Show latest round's reasoning
        if (initialData.rounds.length > 0) {
          const lastRound = initialData.rounds[initialData.rounds.length - 1]
          if (lastRound.reasoningA) {
            typewriter(lastRound.reasoningA, setAgent1Thought, typewriterRef1)
          }
          if (lastRound.reasoningB) {
            typewriter(lastRound.reasoningB, setAgent2Thought, typewriterRef2)
          }
        }
      }
      
      prevGameIdRef.current = gameId
    }
    
    wasOpenRef.current = isOpen
  }, [isOpen, initialData, gameId, typewriter])

  const handleClose = () => {
    if (typewriterRef1.current) clearInterval(typewriterRef1.current)
    if (typewriterRef2.current) clearInterval(typewriterRef2.current)
    onClose()
  }

  if (!initialData) return null

  const scenarioKey = initialData.scenario || (initialData.framing === "overt" ? "overt" : "overt")
  const scenarioInfo = SCENARIOS[scenarioKey] || SCENARIOS.overt
  const latestRound = rounds[rounds.length - 1]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999999999999] overflow-hidden"
        >
          {/* Solid black backdrop */}
          <div className="absolute inset-0 bg-black" aria-hidden="true" />
          
          {/* Content container */}
          <div className="relative h-full w-full bg-black overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 left-0 right-0 z-10 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-black border-b border-white/10">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <h2 className="font-mono text-xs sm:text-lg text-white truncate">
                  <span className="flex items-center gap-2">
                    {isComplete ? (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    ) : (
                      <motion.span
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                      />
                    )}
                    <span className="hidden sm:inline">{isComplete ? "Game Complete" : "Live — "}</span>
                    <span>Round {currentRound}/{totalRounds}</span>
                  </span>
                </h2>
                <span className="font-mono text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white/10 text-white/60 shrink-0">
                  {scenarioInfo.badge}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-white/50 hover:text-white hover:bg-white/5 shrink-0"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex flex-col min-h-[calc(100vh-60px)] p-3 sm:p-6">
              {/* Score Display */}
              <div className="flex items-center justify-center gap-4 sm:gap-8 py-3 sm:py-6">
                <div className="text-center">
                  <p className="font-mono text-[10px] sm:text-xs text-white/50 uppercase tracking-wider mb-1 truncate max-w-[80px] sm:max-w-none">
                    {getShortModelName(initialData.modelA)}
                  </p>
                  <p
                    className={`font-mono text-3xl sm:text-5xl font-bold ${
                      isComplete && scoreA > scoreB ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {scoreA}
                  </p>
                </div>
                <div className="font-mono text-lg sm:text-2xl text-white/20">vs</div>
                <div className="text-center">
                  <p className="font-mono text-[10px] sm:text-xs text-white/50 uppercase tracking-wider mb-1 truncate max-w-[80px] sm:max-w-none">
                    {getShortModelName(initialData.modelB)}
                  </p>
                  <p
                    className={`font-mono text-3xl sm:text-5xl font-bold ${
                      isComplete && scoreB > scoreA ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {scoreB}
                  </p>
                </div>
              </div>

              {/* Responsive Layout: Stack on mobile, 2-col on tablet, 3-col on desktop */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 min-h-0">
                {/* Left Column: System Prompt - Hidden on mobile, shown on lg */}
                <div className="hidden lg:flex flex-col border border-white/10 bg-white/[0.02] min-h-0 max-h-[40vh] lg:max-h-none">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span className="font-mono text-[10px] sm:text-xs text-white/60 uppercase tracking-wider">
                      System Prompt
                    </span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-3 sm:p-4">
                      <pre className="font-mono text-[10px] sm:text-xs text-white/60 whitespace-pre-wrap leading-relaxed">
                        {systemPrompt || "Waiting for game to start..."}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Agent 1 Response */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-[200px] sm:min-h-[250px] max-h-[35vh] md:max-h-none">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Brain className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                    <span className="font-mono text-[10px] sm:text-xs text-white/60 uppercase tracking-wider truncate">
                      {getShortModelName(initialData.modelA)}
                    </span>
                    {!agent1Thought.isComplete && !isComplete && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                    )}
                  </div>
                  
                  {/* Status indicator - only show for retries/errors (not normal processing) */}
                  {agent1Status && (agent1Status.startsWith("retrying") || agent1Status === "error") && !isComplete && (
                    <div className={`px-3 sm:px-4 py-1.5 border-b border-white/10 ${
                      agent1Status === "error" ? "bg-red-500/10" : "bg-amber-500/10"
                    }`}>
                      <span className={`font-mono text-[10px] ${
                        agent1Status === "error" ? "text-red-400" : "text-amber-400"
                      }`}>
                        {formatAgentStatus(agent1Status, agent1RetryCount)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-3 sm:p-4">
                      <p className="font-mono text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                        {agent1Thought.text || latestRound?.reasoningA || (currentRound === 0 ? "Waiting for first move..." : "")}
                        {!agent1Thought.isComplete && !isComplete && (
                          <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {latestRound && (
                    <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] sm:text-xs text-white/40">Decision:</span>
                      <span
                        className={`font-mono text-xs sm:text-sm font-bold ${
                          latestRound.actionA === "cooperate" ? "text-emerald-400" : 
                          latestRound.actionA === "error" ? "text-amber-400" : "text-red-400"
                        }`}
                      >
                        {latestRound.actionA.toUpperCase()}
                      </span>
                      <span className="ml-auto font-mono text-[10px] sm:text-xs text-white/40">
                        +{latestRound.payoffA} pts
                      </span>
                    </div>
                  )}
                </div>

                {/* Agent 2 Response */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-[200px] sm:min-h-[250px] max-h-[35vh] md:max-h-none">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Brain className="w-3 h-3 sm:w-4 sm:h-4 text-purple-400" />
                    <span className="font-mono text-[10px] sm:text-xs text-white/60 uppercase tracking-wider truncate">
                      {getShortModelName(initialData.modelB)}
                    </span>
                    {!agent2Thought.isComplete && !isComplete && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0" />
                    )}
                  </div>
                  
                  {/* Status indicator - only show for retries/errors (not normal processing) */}
                  {agent2Status && (agent2Status.startsWith("retrying") || agent2Status === "error") && !isComplete && (
                    <div className={`px-3 sm:px-4 py-1.5 border-b border-white/10 ${
                      agent2Status === "error" ? "bg-red-500/10" : "bg-amber-500/10"
                    }`}>
                      <span className={`font-mono text-[10px] ${
                        agent2Status === "error" ? "text-red-400" : "text-amber-400"
                      }`}>
                        {formatAgentStatus(agent2Status, agent2RetryCount)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-3 sm:p-4">
                      <p className="font-mono text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                        {agent2Thought.text || latestRound?.reasoningB || (currentRound === 0 ? "Waiting for first move..." : "")}
                        {!agent2Thought.isComplete && !isComplete && (
                          <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {latestRound && (
                    <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] sm:text-xs text-white/40">Decision:</span>
                      <span
                        className={`font-mono text-xs sm:text-sm font-bold ${
                          latestRound.actionB === "cooperate" ? "text-emerald-400" : 
                          latestRound.actionB === "error" ? "text-amber-400" : "text-red-400"
                        }`}
                      >
                        {latestRound.actionB.toUpperCase()}
                      </span>
                      <span className="ml-auto font-mono text-[10px] sm:text-xs text-white/40">
                        +{latestRound.payoffB} pts
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Round History Strip - Scrollable on mobile */}
              <div className="mt-3 sm:mt-4 w-full overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-1.5 sm:gap-2 justify-center min-w-max px-2">
                {Array.from({ length: totalRounds }).map((_, i) => {
                  const round = rounds[i]
                  const isCurrent = i === rounds.length - 1 && !isComplete
                  const isNext = i === rounds.length && !isComplete

                  if (!round) {
                    return (
                      <div
                        key={i}
                        className={`w-6 h-6 sm:w-8 sm:h-8 border flex items-center justify-center shrink-0 ${
                          isNext ? "border-white/50 animate-pulse" : "border-white/10"
                        }`}
                      >
                        <span className="font-mono text-[8px] sm:text-[10px] text-white/30">{i + 1}</span>
                      </div>
                    )
                  }

                  const a1Won = round.payoffA > round.payoffB
                  const a2Won = round.payoffB > round.payoffA

                  return (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`w-6 h-6 sm:w-8 sm:h-8 border flex items-center justify-center gap-0.5 shrink-0 ${
                        isCurrent ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/20"
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                          round.actionA === "cooperate" ? "bg-emerald-400" : 
                          round.actionA === "error" ? "bg-amber-400" : "bg-red-400"
                        } ${a1Won ? "ring-1 ring-white" : ""}`}
                      />
                      <div
                        className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                          round.actionB === "cooperate" ? "bg-emerald-400" : 
                          round.actionB === "error" ? "bg-amber-400" : "bg-red-400"
                        } ${a2Won ? "ring-1 ring-white" : ""}`}
                      />
                    </motion.div>
                  )
                })}
                </div>
              </div>

              {/* Final Result Banner */}
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 sm:mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-4 px-4 sm:px-6 py-2 sm:py-3 bg-white/5 border border-white/10"
                >
                  <span className="font-mono text-xs sm:text-sm text-white/60">Final Result:</span>
                  {winner === "tie" ? (
                    <span className="font-mono text-xs sm:text-sm text-amber-400">Draw</span>
                  ) : (
                    <span className="font-mono text-xs sm:text-sm text-emerald-400">
                      {getShortModelName(winner === "agent1" ? initialData.modelA : initialData.modelB)} wins!
                    </span>
                  )}
                  <span className="font-mono text-[10px] sm:text-xs text-white/40">
                    ({scoreA} - {scoreB})
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

