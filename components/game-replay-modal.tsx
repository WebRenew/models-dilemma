"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { X, Brain, Play, Pause, SkipForward, RotateCcw, ChevronLeft, ChevronRight, Info } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { type RoundResult, type GameRecord, getShortModelName } from "@/lib/game-logic"
import { buildPrompt, type LLMPromptContext, type CloakedScenario } from "@/lib/prompts"

interface GameReplayModalProps {
  isOpen: boolean
  onClose: () => void
  game: GameRecord | null
}

interface StreamingThought {
  text: string
  isComplete: boolean
}

const SCENARIOS: Record<string, { name: string; badge: string }> = {
  overt: { name: "Overt (Control)", badge: "[O]" },
  sales: { name: "Sales Territory", badge: "[C:S]" },
  research: { name: "Research Lab", badge: "[C:R]" },
  creator: { name: "Content Creator", badge: "[C:C]" },
}

export function GameReplayModal({ isOpen, onClose, game }: GameReplayModalProps) {
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [agent1Thought, setAgent1Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  const [agent2Thought, setAgent2Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const typewriterRef1 = useRef<NodeJS.Timeout | null>(null)
  const typewriterRef2 = useRef<NodeJS.Timeout | null>(null)

  const totalRounds = game?.rounds.length ?? 0
  const currentRound = game?.rounds[currentRoundIndex]

  // Generate system prompt for current round
  const systemPrompt = useMemo(() => {
    if (!game) return ""
    
    // Build history up to current round (from agent 1's perspective)
    const myHistory: Array<"COOPERATE" | "DEFECT"> = []
    const opponentHistory: Array<"COOPERATE" | "DEFECT"> = []
    let myScore = 0
    let opponentScore = 0
    
    for (let i = 0; i < currentRoundIndex; i++) {
      const r = game.rounds[i]
      if (r.agent1Decision !== "error") myHistory.push(r.agent1Decision === "cooperate" ? "COOPERATE" : "DEFECT")
      if (r.agent2Decision !== "error") opponentHistory.push(r.agent2Decision === "cooperate" ? "COOPERATE" : "DEFECT")
      myScore += r.agent1Points
      opponentScore += r.agent2Points
    }
    
    const isOvert = game.framing === "overt"
    const scenario = game.scenario as CloakedScenario | undefined
    
    const ctx: LLMPromptContext = {
      variant: isOvert ? "overt" : "cloaked",
      roundNumber: currentRoundIndex + 1,
      totalRounds: totalRounds,
      myScore,
      opponentScore,
      myHistory,
      opponentHistory,
    }
    
    return buildPrompt(ctx, scenario ? { scenario } : {})
  }, [game, currentRoundIndex, totalRounds])

  // Calculate cumulative scores up to current round
  const cumulativeScores = useCallback(() => {
    if (!game) return { agent1: 0, agent2: 0 }
    let a1 = 0
    let a2 = 0
    for (let i = 0; i <= currentRoundIndex; i++) {
      if (game.rounds[i]) {
        a1 += game.rounds[i].agent1Points
        a2 += game.rounds[i].agent2Points
      }
    }
    return { agent1: a1, agent2: a2 }
  }, [game, currentRoundIndex])

  const scores = cumulativeScores()

  // Typewriter effect for reasoning
  const animateThought = useCallback(
    (text: string | undefined, setter: React.Dispatch<React.SetStateAction<StreamingThought>>, refObj: React.MutableRefObject<NodeJS.Timeout | null>) => {
      // Clear any existing animation
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
      
      // Speed up typewriter based on playback speed
      const baseDelay = 25
      const delay = Math.max(5, baseDelay / playbackSpeed)

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
      }, delay)
    },
    [playbackSpeed]
  )

  // Update thoughts when round changes
  useEffect(() => {
    if (!currentRound) return
    
    setAgent1Thought({ text: "", isComplete: false })
    setAgent2Thought({ text: "", isComplete: false })

    animateThought(currentRound.agent1Reasoning, setAgent1Thought, typewriterRef1)
    animateThought(currentRound.agent2Reasoning, setAgent2Thought, typewriterRef2)

    return () => {
      if (typewriterRef1.current) clearInterval(typewriterRef1.current)
      if (typewriterRef2.current) clearInterval(typewriterRef2.current)
    }
  }, [currentRound, animateThought])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
      return
    }

    // Wait for typewriter to complete, then advance
    const checkAndAdvance = () => {
      if (agent1Thought.isComplete && agent2Thought.isComplete) {
        if (currentRoundIndex < totalRounds - 1) {
          setCurrentRoundIndex((prev) => prev + 1)
        } else {
          setIsPlaying(false)
        }
      }
    }

    playIntervalRef.current = setInterval(checkAndAdvance, 500)

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
    }
  }, [isPlaying, currentRoundIndex, totalRounds, agent1Thought.isComplete, agent2Thought.isComplete])

  // Reset when modal opens/closes or game changes
  useEffect(() => {
    if (isOpen && game) {
      setCurrentRoundIndex(0)
      setIsPlaying(false)
      setAgent1Thought({ text: "", isComplete: false })
      setAgent2Thought({ text: "", isComplete: false })
    }
    
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      if (typewriterRef1.current) clearInterval(typewriterRef1.current)
      if (typewriterRef2.current) clearInterval(typewriterRef2.current)
    }
  }, [isOpen, game])

  const handleClose = () => {
    setIsPlaying(false)
    if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    if (typewriterRef1.current) clearInterval(typewriterRef1.current)
    if (typewriterRef2.current) clearInterval(typewriterRef2.current)
    onClose()
  }

  const goToRound = (index: number) => {
    setIsPlaying(false)
    setCurrentRoundIndex(Math.max(0, Math.min(index, totalRounds - 1)))
  }

  const resetReplay = () => {
    setIsPlaying(false)
    setCurrentRoundIndex(0)
  }

  if (!game) return null

  const scenarioKey = game.scenario || (game.framing === "overt" ? "overt" : "overt")
  const scenarioInfo = SCENARIOS[scenarioKey] || SCENARIOS.overt

  const isComplete = currentRoundIndex === totalRounds - 1

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
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="hidden sm:inline">Game Replay — </span>
                  <span>Round {currentRoundIndex + 1}/{totalRounds}</span>
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
                  {getShortModelName(game.agent1Model)}
                </p>
                <p
                  className={`font-mono text-3xl sm:text-5xl font-bold ${
                    isComplete && scores.agent1 > scores.agent2 ? "text-emerald-400" : "text-white"
                  }`}
                >
                  {scores.agent1}
                </p>
              </div>
              <div className="font-mono text-lg sm:text-2xl text-white/20">vs</div>
              <div className="text-center">
                <p className="font-mono text-[10px] sm:text-xs text-white/50 uppercase tracking-wider mb-1 truncate max-w-[80px] sm:max-w-none">
                  {getShortModelName(game.agent2Model)}
                </p>
                <p
                  className={`font-mono text-3xl sm:text-5xl font-bold ${
                    isComplete && scores.agent2 > scores.agent1 ? "text-emerald-400" : "text-white"
                  }`}
                >
                  {scores.agent2}
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
                      {systemPrompt || "Loading prompt..."}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Agent 1 Response */}
              <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-[200px] sm:min-h-[250px] max-h-[35vh] md:max-h-none">
                <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                  <Brain className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                  <span className="font-mono text-[10px] sm:text-xs text-white/60 uppercase tracking-wider truncate">
                    {getShortModelName(game.agent1Model)}
                  </span>
                  {!agent1Thought.isComplete && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="p-3 sm:p-4">
                    <p className="font-mono text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                      {agent1Thought.text || "Loading reasoning..."}
                      {!agent1Thought.isComplete && (
                        <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                </div>
                
                {currentRound && (
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] sm:text-xs text-white/40">Decision:</span>
                    <span
                      className={`font-mono text-xs sm:text-sm font-bold ${
                        currentRound.agent1Decision === "cooperate" ? "text-emerald-400" : 
                        currentRound.agent1Decision === "error" ? "text-amber-400" : "text-red-400"
                      }`}
                    >
                      {currentRound.agent1Decision.toUpperCase()}
                    </span>
                    <span className="ml-auto font-mono text-[10px] sm:text-xs text-white/40">
                      +{currentRound.agent1Points} pts
                    </span>
                  </div>
                )}
              </div>

              {/* Agent 2 Response */}
              <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-[200px] sm:min-h-[250px] max-h-[35vh] md:max-h-none">
                <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                  <Brain className="w-3 h-3 sm:w-4 sm:h-4 text-purple-400" />
                  <span className="font-mono text-[10px] sm:text-xs text-white/60 uppercase tracking-wider truncate">
                    {getShortModelName(game.agent2Model)}
                  </span>
                  {!agent2Thought.isComplete && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0" />
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="p-3 sm:p-4">
                    <p className="font-mono text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                      {agent2Thought.text || "Loading reasoning..."}
                      {!agent2Thought.isComplete && (
                        <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                </div>
                
                {currentRound && (
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] sm:text-xs text-white/40">Decision:</span>
                    <span
                      className={`font-mono text-xs sm:text-sm font-bold ${
                        currentRound.agent2Decision === "cooperate" ? "text-emerald-400" : 
                        currentRound.agent2Decision === "error" ? "text-amber-400" : "text-red-400"
                      }`}
                    >
                      {currentRound.agent2Decision.toUpperCase()}
                    </span>
                    <span className="ml-auto font-mono text-[10px] sm:text-xs text-white/40">
                      +{currentRound.agent2Points} pts
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="mt-3 sm:mt-4 flex flex-col items-center gap-3 sm:gap-4">
              {/* Round History Strip - Scrollable on mobile */}
              <div className="w-full overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-1.5 sm:gap-2 justify-center min-w-max px-2">
                {game.rounds.map((round, i) => {
                  const isCurrent = i === currentRoundIndex
                  const isPast = i < currentRoundIndex
                  const a1Won = round.agent1Points > round.agent2Points
                  const a2Won = round.agent2Points > round.agent1Points

                  return (
                    <button
                      key={i}
                      onClick={() => goToRound(i)}
                      className={`w-6 h-6 sm:w-8 sm:h-8 border flex items-center justify-center gap-0.5 transition-all shrink-0 ${
                        isCurrent
                          ? "border-white/50 bg-white/10"
                          : isPast
                            ? "border-white/20 hover:border-white/40"
                            : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {isPast || isCurrent ? (
                        <>
                          <div
                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                              round.agent1Decision === "cooperate" ? "bg-emerald-400" : 
                              round.agent1Decision === "error" ? "bg-amber-400" : "bg-red-400"
                            } ${a1Won ? "ring-1 ring-white" : ""}`}
                          />
                          <div
                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                              round.agent2Decision === "cooperate" ? "bg-emerald-400" : 
                              round.agent2Decision === "error" ? "bg-amber-400" : "bg-red-400"
                            } ${a2Won ? "ring-1 ring-white" : ""}`}
                          />
                        </>
                      ) : (
                        <span className="font-mono text-[8px] sm:text-[10px] text-white/30">{i + 1}</span>
                      )}
                    </button>
                  )
                })}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center gap-1 sm:gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetReplay}
                  className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 hover:text-white hover:bg-white/5"
                  title="Reset to beginning"
                >
                  <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => goToRound(currentRoundIndex - 1)}
                  disabled={currentRoundIndex === 0}
                  className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-30"
                  title="Previous round"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={isComplete && !isPlaying}
                  className="w-10 h-10 sm:w-12 sm:h-12 border-white/30 bg-transparent text-white hover:bg-white/10 disabled:opacity-30"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => goToRound(currentRoundIndex + 1)}
                  disabled={currentRoundIndex >= totalRounds - 1}
                  className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-30"
                  title="Next round"
                >
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => goToRound(totalRounds - 1)}
                  disabled={currentRoundIndex >= totalRounds - 1}
                  className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-30"
                  title="Skip to end"
                >
                  <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>

                {/* Speed Control */}
                <div className="ml-2 sm:ml-4 flex items-center gap-1 sm:gap-2">
                  <span className="font-mono text-[10px] sm:text-xs text-white/40 hidden sm:inline">Speed:</span>
                  {[0.5, 1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`font-mono text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 transition-all ${
                        playbackSpeed === speed
                          ? "bg-white/20 text-white"
                          : "text-white/40 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Final Result Banner */}
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 px-4 sm:px-6 py-2 sm:py-3 bg-white/5 border border-white/10"
                >
                  <span className="font-mono text-xs sm:text-sm text-white/60">Final Result:</span>
                  {game.winner === "tie" ? (
                    <span className="font-mono text-xs sm:text-sm text-amber-400">Draw</span>
                  ) : (
                    <span className="font-mono text-xs sm:text-sm text-emerald-400">
                      {getShortModelName(game.winner === "agent1" ? game.agent1Model : game.agent2Model)} wins!
                    </span>
                  )}
                  <span className="font-mono text-[10px] sm:text-xs text-white/40">
                    ({game.agent1TotalScore} - {game.agent2TotalScore})
                  </span>
                </motion.div>
              )}
            </div>
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

