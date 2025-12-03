"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/models"
import { X, Loader2, Zap, Brain, Info } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { type RoundResult, type GameRecord, getShortModelName } from "@/lib/game-logic"
import { createClient } from "@/lib/supabase/client"
import { buildPrompt, type LLMPromptContext, type CloakedScenario } from "@/lib/prompts"

interface PlayGameModalProps {
  isOpen: boolean
  onClose: () => void
  onGameComplete: (game: GameRecord) => void
}

type Scenario = "overt" | "sales" | "research" | "creator"
type Decision = "cooperate" | "defect" | "error"

const SCENARIOS: { id: Scenario; name: string; badge: string; description: string; actions: [string, string] }[] = [
  {
    id: "overt",
    name: "Overt (Control)",
    badge: "[O]",
    description: "Classic Prisoner's Dilemma with explicit COOPERATE/DEFECT choices",
    actions: ["COOPERATE", "DEFECT"],
  },
  {
    id: "sales",
    name: "Sales Territory",
    badge: "[C:S]",
    description: "Business scenario: Share or hold pipeline intelligence",
    actions: ["SHARE", "HOLD"],
  },
  {
    id: "research",
    name: "Research Lab",
    badge: "[C:R]",
    description: "Academic scenario: Open collaboration or guarded research",
    actions: ["OPEN", "GUARDED"],
  },
  {
    id: "creator",
    name: "Content Creator",
    badge: "[C:C]",
    description: "Social scenario: Support cross-promotion or stay independent",
    actions: ["SUPPORT", "INDEPENDENT"],
  },
]

const TOTAL_ROUNDS = 10

interface GameRoundRow {
  id: string
  game_id: string
  round_number: number
  total_rounds: number
  agent1_model_id: string
  agent1_display_name: string
  agent1_decision: Decision
  agent1_reasoning: string | null
  agent1_round_points: number
  agent1_cumulative_score: number
  agent2_model_id: string
  agent2_display_name: string
  agent2_decision: Decision
  agent2_reasoning: string | null
  agent2_round_points: number
  agent2_cumulative_score: number
  is_final_round: boolean
  game_winner: "agent1" | "agent2" | "tie" | null
  prompt_a: string | null
  prompt_b: string | null
}

interface StreamingThought {
  text: string
  isComplete: boolean
}

export function PlayGameModal({ isOpen, onClose, onGameComplete }: PlayGameModalProps) {
  const [agent1Model, setAgent1Model] = useState(DEFAULT_MODEL)
  const [agent2Model, setAgent2Model] = useState("anthropic/claude-sonnet-4-20250514")
  const [scenario, setScenario] = useState<Scenario>("overt")
  const [gameState, setGameState] = useState<"setup" | "playing" | "complete">("setup")
  const [currentRound, setCurrentRound] = useState(0)
  const [rounds, setRounds] = useState<RoundResult[]>([])
  const [agent1Total, setAgent1Total] = useState(0)
  const [agent2Total, setAgent2Total] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [agent1Thought, setAgent1Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  const [agent2Thought, setAgent2Thought] = useState<StreamingThought>({ text: "", isComplete: false })
  // Single cached prompt - same structure for both agents, just with different perspective
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const supabaseRef = useRef(createClient())
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null)

  const groupedModels = AI_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = []
      acc[model.provider].push(model)
      return acc
    },
    {} as Record<string, typeof AI_MODELS>,
  )

  const resetGame = useCallback(() => {
    // Clean up Supabase channel
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
    
    setGameState("setup")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)
    setIsProcessing(false)
    setAgent1Thought({ text: "", isComplete: false })
    setAgent2Thought({ text: "", isComplete: false })
    setSystemPrompt(null)
    setGameId(null)
    setError(null)
  }, [])

  // Subscribe to game rounds via Supabase Realtime
  useEffect(() => {
    if (!gameId || gameState !== "playing") return

    console.log("[PlayGame] Setting up Realtime subscription for game:", gameId)
    
    const channel = supabaseRef.current
      .channel(`user-game-${gameId}`)
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
          console.log("[PlayGame] Received round via Realtime:", row.round_number)

          // Update current round
          setCurrentRound(row.round_number)
          setIsProcessing(false)

          // Update system prompt from first round (they're all the same structure)
          if (row.prompt_a && !systemPrompt) setSystemPrompt(row.prompt_a)

          // Update thoughts with typewriter effect
          const typewriter = (
            text: string,
            setter: React.Dispatch<React.SetStateAction<StreamingThought>>
          ) => {
            const words = text.split(" ")
            let current = ""
            let i = 0
            
            const interval = setInterval(() => {
              if (i >= words.length) {
                clearInterval(interval)
                setter({ text: current, isComplete: true })
                return
              }
              current += (i > 0 ? " " : "") + words[i]
              setter({ text: current, isComplete: false })
              i++
            }, 30)
          }

          setAgent1Thought({ text: "", isComplete: false })
          setAgent2Thought({ text: "", isComplete: false })
          
          if (row.agent1_reasoning) {
            typewriter(row.agent1_reasoning, setAgent1Thought)
          }
          if (row.agent2_reasoning) {
            typewriter(row.agent2_reasoning, setAgent2Thought)
          }

          // Add to rounds
          const roundResult: RoundResult = {
            round: row.round_number,
            agent1Decision: row.agent1_decision,
            agent2Decision: row.agent2_decision,
            agent1Points: row.agent1_round_points,
            agent2Points: row.agent2_round_points,
            agent1Reasoning: row.agent1_reasoning || undefined,
            agent2Reasoning: row.agent2_reasoning || undefined,
          }

          setRounds((prev) => {
            // Avoid duplicates
            if (prev.some((r) => r.round === row.round_number)) return prev
            return [...prev, roundResult]
          })

          // Update scores
          setAgent1Total(row.agent1_cumulative_score)
          setAgent2Total(row.agent2_cumulative_score)

          // Check if game is complete
          if (row.is_final_round) {
            console.log("[PlayGame] Game complete, winner:", row.game_winner)
            setGameState("complete")

            // Build game record for callback
            const gameRecord: GameRecord = {
              id: gameId,
              agent1Model,
              agent2Model,
              agent1DisplayName: row.agent1_display_name,
              agent2DisplayName: row.agent2_display_name,
              rounds: [], // Will be filled by the rounds we've collected
              agent1TotalScore: row.agent1_cumulative_score,
              agent2TotalScore: row.agent2_cumulative_score,
              winner: row.game_winner || "tie",
              timestamp: Date.now(),
              framing: scenario === "overt" ? "overt" : "cloaked",
              scenario: scenario === "overt" ? undefined : scenario,
            }

            // We need to get the full rounds list
            setRounds((currentRounds) => {
              gameRecord.rounds = currentRounds
              onGameComplete(gameRecord)
              return currentRounds
            })
          } else {
            // Show processing for next round after a delay
            setTimeout(() => {
              setIsProcessing(true)
            }, 2000)
          }
        }
      )
      .subscribe((status) => {
        console.log("[PlayGame] Subscription status:", status)
      })

    channelRef.current = channel

    return () => {
      console.log("[PlayGame] Cleaning up Realtime subscription")
      supabaseRef.current.removeChannel(channel)
      channelRef.current = null
    }
  }, [gameId, gameState, agent1Model, agent2Model, scenario, onGameComplete])

  const startGame = useCallback(async () => {
    setGameState("playing")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)
    setIsProcessing(true)
    setError(null)
    setAgent1Thought({ text: "", isComplete: false })
    setAgent2Thought({ text: "", isComplete: false })

    // Generate preview prompt immediately (same structure for both agents)
    const previewCtx: LLMPromptContext = {
      variant: scenario === "overt" ? "overt" : "cloaked",
      roundNumber: 1,
      totalRounds: TOTAL_ROUNDS,
      myScore: 0,
      opponentScore: 0,
      myHistory: [],
      opponentHistory: [],
    }
    const previewPrompt = buildPrompt(
      previewCtx,
      scenario !== "overt" ? { scenario: scenario as CloakedScenario } : {}
    )
    setSystemPrompt(previewPrompt)

    try {
      console.log("[PlayGame] Starting game via Trigger.dev", { agent1Model, agent2Model, scenario })

      const response = await fetch("/api/start-user-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent1Model,
          agent2Model,
          scenario,
          totalRounds: TOTAL_ROUNDS,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to start game")
      }

      console.log("[PlayGame] Game triggered successfully", { gameId: data.gameId, runId: data.runId })
      setGameId(data.gameId)
      
      // The Realtime subscription will handle round updates
    } catch (err) {
      console.error("[PlayGame] Failed to start game:", err)
      setError(err instanceof Error ? err.message : "Failed to start game")
      setGameState("setup")
      setIsProcessing(false)
    }
  }, [agent1Model, agent2Model, scenario])

  const handleClose = () => {
    // Game continues running on Trigger.dev even after closing modal
    // Just clean up the local subscription and close
    if (gameState === "playing" && gameId) {
      console.log("[PlayGame] Closing modal - game continues in background:", gameId)
    }
    resetGame()
    onClose()
  }

  const selectedScenario = SCENARIOS.find((s) => s.id === scenario)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black"
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black via-black/80 to-transparent">
            <div className="flex items-center gap-4">
              <h2 className="font-mono text-lg text-white">
                {gameState === "setup" && "Configure Match"}
                {gameState === "playing" && (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Round {currentRound} of {TOTAL_ROUNDS}
                  </span>
                )}
                {gameState === "complete" && "Match Complete"}
              </h2>
              {selectedScenario && gameState !== "setup" && (
                <span className="font-mono text-xs px-2 py-1 bg-white/10 text-white/60">
                  {selectedScenario.badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {gameState === "playing" && (
                <div className="flex items-center gap-1.5 text-white/40">
                  <Info className="w-3.5 h-3.5" />
                  <span className="font-mono text-xs">Game continues if closed</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Setup Screen */}
          {gameState === "setup" && (
            <div className="flex items-center justify-center h-full px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl space-y-8"
              >
                {error && (
                  <div className="p-4 border border-red-500/50 bg-red-500/10 text-red-400 font-mono text-sm">
                    {error}
                  </div>
                )}

                {/* Scenario Selection */}
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider text-white/50 mb-4 block">
                    Prompt Type
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setScenario(s.id)}
                        className={`p-4 border text-left transition-all ${
                          scenario === s.id
                            ? "border-white/50 bg-white/5"
                            : "border-white/15 hover:border-white/30 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-xs text-white/40">{s.badge}</span>
                          <span className="font-mono text-sm text-white">{s.name}</span>
                        </div>
                        <p className="text-xs text-white/50">{s.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model Selection */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider text-white/50">Model A</Label>
                    <Select value={agent1Model} onValueChange={setAgent1Model}>
                      <SelectTrigger className="mt-2 w-full font-mono text-sm bg-transparent border-white/15 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-white/15 max-h-64">
                        {Object.entries(groupedModels).map(([provider, models]) => (
                          <div key={provider}>
                            <div className="px-2 py-1.5 text-xs font-mono text-white/50 uppercase">{provider}</div>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id} className="font-mono text-sm text-white/80">
                                {model.displayName}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider text-white/50">Model B</Label>
                    <Select value={agent2Model} onValueChange={setAgent2Model}>
                      <SelectTrigger className="mt-2 w-full font-mono text-sm bg-transparent border-white/15 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-white/15 max-h-64">
                        {Object.entries(groupedModels).map(([provider, models]) => (
                          <div key={provider}>
                            <div className="px-2 py-1.5 text-xs font-mono text-white/50 uppercase">{provider}</div>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id} className="font-mono text-sm text-white/80">
                                {model.displayName}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={startGame}
                  className="w-full font-mono text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90 py-6"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Start Match
                </Button>
              </motion.div>
            </div>
          )}

          {/* Playing / Complete Screen */}
          {(gameState === "playing" || gameState === "complete") && (
            <div className="h-full pt-16 pb-6 px-6 flex flex-col">
              {/* Score Display */}
              <div className="flex items-center justify-center gap-8 py-6">
                <div className="text-center">
                  <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-1">
                    {getShortModelName(agent1Model)}
                  </p>
                  <p
                    className={`font-mono text-5xl font-bold ${
                      gameState === "complete" && agent1Total > agent2Total ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {agent1Total}
                  </p>
                </div>
                <div className="font-mono text-2xl text-white/20">vs</div>
                <div className="text-center">
                  <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-1">
                    {getShortModelName(agent2Model)}
                  </p>
                  <p
                    className={`font-mono text-5xl font-bold ${
                      gameState === "complete" && agent2Total > agent1Total ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {agent2Total}
                  </p>
                </div>
              </div>

              {/* Three Column Layout: Prompt | Agent 1 | Agent 2 */}
              <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
                {/* Left Column: System Prompt (same for both agents) */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-0">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span className="font-mono text-xs text-white/60 uppercase tracking-wider">
                      System Prompt
                    </span>
                  </div>
                  
                  {/* Prompt Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-4">
                      <pre className="font-mono text-xs text-white/60 whitespace-pre-wrap leading-relaxed">
                        {systemPrompt || "Preparing prompt..."}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Middle Column: Agent 1 Response */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-0">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Brain className="w-4 h-4 text-blue-400" />
                    <span className="font-mono text-xs text-white/60 uppercase tracking-wider">
                      {getShortModelName(agent1Model)}
                    </span>
                    {isProcessing && !agent1Thought.isComplete && (
                      <Loader2 className="w-3 h-3 animate-spin text-white/40 ml-auto" />
                    )}
                  </div>
                  
                  {/* Response Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-4">
                      <p className="font-mono text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                        {agent1Thought.text || (isProcessing ? "Analyzing situation..." : "Waiting for round to start...")}
                        {isProcessing && !agent1Thought.isComplete && (
                          <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {/* Decision Footer */}
                  {rounds.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-white/40">Decision:</span>
                      <span
                        className={`font-mono text-sm font-bold ${
                          rounds[rounds.length - 1]?.agent1Decision === "cooperate" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {rounds[rounds.length - 1]?.agent1Decision?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Column: Agent 2 Response */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] min-h-0">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="font-mono text-xs text-white/60 uppercase tracking-wider">
                      {getShortModelName(agent2Model)}
                    </span>
                    {isProcessing && !agent2Thought.isComplete && (
                      <Loader2 className="w-3 h-3 animate-spin text-white/40 ml-auto" />
                    )}
                  </div>
                  
                  {/* Response Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-4">
                      <p className="font-mono text-sm text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                        {agent2Thought.text || (isProcessing ? "Analyzing situation..." : "Waiting for round to start...")}
                        {isProcessing && !agent2Thought.isComplete && (
                          <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {/* Decision Footer */}
                  {rounds.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-white/40">Decision:</span>
                      <span
                        className={`font-mono text-sm font-bold ${
                          rounds[rounds.length - 1]?.agent2Decision === "cooperate" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {rounds[rounds.length - 1]?.agent2Decision?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Round History Strip */}
              <div className="mt-4 flex items-center gap-2 justify-center">
                {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
                  const round = rounds[i]
                  const isCurrent = i === currentRound - 1 && gameState === "playing"

                  if (!round) {
                    return (
                      <div
                        key={i}
                        className={`w-8 h-8 border ${
                          isCurrent ? "border-white/50 animate-pulse" : "border-white/10"
                        } flex items-center justify-center`}
                      >
                        <span className="font-mono text-[10px] text-white/30">{i + 1}</span>
                      </div>
                    )
                  }

                  const a1Won = round.agent1Points > round.agent2Points
                  const a2Won = round.agent2Points > round.agent1Points

                  return (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-8 h-8 border border-white/20 flex items-center justify-center gap-0.5"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          round.agent1Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                        } ${a1Won ? "ring-1 ring-white" : ""}`}
                      />
                      <div
                        className={`w-2 h-2 rounded-full ${
                          round.agent2Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                        } ${a2Won ? "ring-1 ring-white" : ""}`}
                      />
                    </motion.div>
                  )
                })}
              </div>

              {/* Complete Actions */}
              {gameState === "complete" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 justify-center mt-6"
                >
                  <Button
                    onClick={resetGame}
                    variant="outline"
                    className="font-mono text-sm uppercase tracking-wider border-white/15 bg-transparent text-white/80 hover:bg-white/5 px-8"
                  >
                    Play Again
                  </Button>
                  <Button
                    onClick={handleClose}
                    className="font-mono text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90 px-8"
                  >
                    Close
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
