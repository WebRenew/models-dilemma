"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/models"
import { X, Loader2, Zap, Brain } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { type RoundResult, type GameRecord, calculatePayoff, getShortModelName } from "@/lib/game-logic"

interface PlayGameModalProps {
  isOpen: boolean
  onClose: () => void
  onGameComplete: (game: GameRecord) => void
}

type Scenario = "overt" | "sales" | "research" | "creator"

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
  const abortControllerRef = useRef<AbortController | null>(null)

  const groupedModels = AI_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = []
      acc[model.provider].push(model)
      return acc
    },
    {} as Record<string, typeof AI_MODELS>,
  )

  const resetGame = useCallback(() => {
    setGameState("setup")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)
    setIsProcessing(false)
    setAgent1Thought({ text: "", isComplete: false })
    setAgent2Thought({ text: "", isComplete: false })
    abortControllerRef.current?.abort()
  }, [])

  const formatHistory = (previousRounds: RoundResult[], agentNumber: 1 | 2): string => {
    if (previousRounds.length === 0) return "No previous rounds."
    
    const scenarioConfig = SCENARIOS.find(s => s.id === scenario)
    const [coopAction, defectAction] = scenarioConfig?.actions || ["COOPERATE", "DEFECT"]
    
    return previousRounds
      .map((r) => {
        const myDecision = agentNumber === 1 ? r.agent1Decision : r.agent2Decision
        const theirDecision = agentNumber === 1 ? r.agent2Decision : r.agent1Decision
        const myAction = myDecision === "cooperate" ? coopAction : defectAction
        const theirAction = theirDecision === "cooperate" ? coopAction : defectAction
        const myPoints = agentNumber === 1 ? r.agent1Points : r.agent2Points
        return `Round ${r.round}: You chose ${myAction}, Opponent chose ${theirAction} → You got ${myPoints} points`
      })
      .join("\n")
  }

  const playRound = useCallback(
    async (roundNumber: number, previousRounds: RoundResult[], signal: AbortSignal) => {
      setIsProcessing(true)
      setAgent1Thought({ text: "", isComplete: false })
      setAgent2Thought({ text: "", isComplete: false })

      try {
        // Calculate cumulative scores from previous rounds
        const score1 = previousRounds.reduce((sum, r) => sum + r.agent1Points, 0)
        const score2 = previousRounds.reduce((sum, r) => sum + r.agent2Points, 0)

        console.log("[PlayGame] Round", roundNumber, "scenario:", scenario, "models:", agent1Model, agent2Model)

        // Start both requests
        const [agent1Response, agent2Response] = await Promise.all([
          fetch("/api/agent-decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentName: "Agent Alpha",
              history: formatHistory(previousRounds, 1),
              round: roundNumber,
              totalRounds: TOTAL_ROUNDS,
              model: agent1Model,
              scenario,
              myScore: score1,
              oppScore: score2,
            }),
            signal,
          }),
          fetch("/api/agent-decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentName: "Agent Omega",
              history: formatHistory(previousRounds, 2),
              round: roundNumber,
              totalRounds: TOTAL_ROUNDS,
              model: agent2Model,
              scenario,
              myScore: score2,
              oppScore: score1,
            }),
            signal,
          }),
        ])

        if (!agent1Response.ok || !agent2Response.ok) {
          throw new Error("Failed to get agent decisions")
        }

        const agent1Data = await agent1Response.json()
        const agent2Data = await agent2Response.json()
        
        // Show the reasoning with typewriter effect
        const typewriterEffect = async (
          text: string,
          setter: React.Dispatch<React.SetStateAction<StreamingThought>>
        ) => {
          const words = text.split(" ")
          let current = ""
          for (let i = 0; i < words.length; i++) {
            if (signal.aborted) return
            current += (i > 0 ? " " : "") + words[i]
            setter({ text: current, isComplete: false })
            await new Promise(r => setTimeout(r, 30))
          }
          setter({ text: current, isComplete: true })
        }

        // Run typewriter effects in parallel
        await Promise.all([
          typewriterEffect(agent1Data.reasoning || "Thinking...", setAgent1Thought),
          typewriterEffect(agent2Data.reasoning || "Thinking...", setAgent2Thought),
        ])

        const { agent1Points, agent2Points } = calculatePayoff(agent1Data.decision, agent2Data.decision)

        const roundResult: RoundResult = {
          round: roundNumber,
          agent1Decision: agent1Data.decision,
          agent2Decision: agent2Data.decision,
          agent1Points,
          agent2Points,
          agent1Reasoning: agent1Data.reasoning,
          agent2Reasoning: agent2Data.reasoning,
        }

        return roundResult
      } catch (error) {
        if (signal.aborted) return null
        console.error("Round error:", error)
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [agent1Model, agent2Model, scenario],
  )

  const startGame = useCallback(async () => {
    setGameState("playing")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Generate game ID and timestamp at start so rounds can be saved live
    const gameId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const gameTimestamp = new Date().toISOString()
    const agent1DisplayName = getShortModelName(agent1Model)
    const agent2DisplayName = getShortModelName(agent2Model)

    let runningRounds: RoundResult[] = []
    let runningAgent1Total = 0
    let runningAgent2Total = 0

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      if (signal.aborted) return

      setCurrentRound(round)
      const result = await playRound(round, runningRounds, signal)

      if (!result) continue

      runningRounds = [...runningRounds, result]
      runningAgent1Total += result.agent1Points
      runningAgent2Total += result.agent2Points

      setRounds(runningRounds)
      setAgent1Total(runningAgent1Total)
      setAgent2Total(runningAgent2Total)

      // Determine if this is the final round
      const isFinalRound = round === TOTAL_ROUNDS
      const winner = isFinalRound
        ? runningAgent1Total > runningAgent2Total ? "agent1" : runningAgent2Total > runningAgent1Total ? "agent2" : "tie"
        : null

      // Save round to database immediately (so it appears in live feed)
      try {
        console.log("[PlayGame] Saving round:", { round, scenario, gameId: gameId.slice(0, 12) })
        const saveResponse = await fetch("/api/save-round", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId,
            gameTimestamp,
            roundNumber: round,
            totalRounds: TOTAL_ROUNDS,
            agent1Model,
            agent2Model,
            agent1DisplayName,
            agent2DisplayName,
            agent1Decision: result.agent1Decision,
            agent2Decision: result.agent2Decision,
            agent1Reasoning: result.agent1Reasoning,
            agent2Reasoning: result.agent2Reasoning,
            agent1Points: result.agent1Points,
            agent2Points: result.agent2Points,
            agent1CumulativeScore: runningAgent1Total,
            agent2CumulativeScore: runningAgent2Total,
            scenario,
            isFinalRound,
            winner,
          }),
        })
        const saveResult = await saveResponse.json()
        if (!saveResult.success) {
          console.error("[PlayGame] Failed to save round:", saveResult.error)
        }
      } catch (e) {
        console.error("[PlayGame] Failed to save round:", e)
      }

      // Longer pause between rounds so users can read agent reasoning
      await new Promise((r) => setTimeout(r, 4000))
    }

    setGameState("complete")

    const finalWinner =
      runningAgent1Total > runningAgent2Total ? "agent1" : runningAgent2Total > runningAgent1Total ? "agent2" : "tie"

    const gameRecord: GameRecord = {
      id: gameId,
      agent1Model,
      agent2Model,
      agent1DisplayName,
      agent2DisplayName,
      rounds: runningRounds,
      agent1TotalScore: runningAgent1Total,
      agent2TotalScore: runningAgent2Total,
      winner: finalWinner,
      timestamp: Date.now(),
      framing: scenario === "overt" ? "overt" : "cloaked",
      scenario: scenario === "overt" ? undefined : scenario,
    }

    onGameComplete(gameRecord)
  }, [agent1Model, agent2Model, scenario, playRound, onGameComplete])

  const handleClose = () => {
    abortControllerRef.current?.abort()
    resetGame()
    onClose()
  }

  const selectedScenario = SCENARIOS.find(s => s.id === scenario)

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
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-white/50 hover:text-white hover:bg-white/5"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Setup Screen */}
          {gameState === "setup" && (
            <div className="flex items-center justify-center h-full px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl space-y-8"
              >
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
                  <p className={`font-mono text-5xl font-bold ${
                    gameState === "complete" && agent1Total > agent2Total ? "text-emerald-400" : "text-white"
                  }`}>
                    {agent1Total}
                  </p>
                </div>
                <div className="font-mono text-2xl text-white/20">vs</div>
                <div className="text-center">
                  <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-1">
                    {getShortModelName(agent2Model)}
                  </p>
                  <p className={`font-mono text-5xl font-bold ${
                    gameState === "complete" && agent2Total > agent1Total ? "text-emerald-400" : "text-white"
                  }`}>
                    {agent2Total}
                  </p>
                </div>
              </div>

              {/* Two Column Thoughts Display */}
              <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
                {/* Agent 1 Thoughts */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-400" />
                    <span className="font-mono text-xs text-white/60 uppercase tracking-wider">
                      {getShortModelName(agent1Model)}
                    </span>
                    {isProcessing && !agent1Thought.isComplete && (
                      <Loader2 className="w-3 h-3 animate-spin text-white/40 ml-auto" />
                    )}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
                    <p className="font-mono text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                      {agent1Thought.text || (isProcessing ? "Analyzing situation..." : "Waiting for round to start...")}
                      {isProcessing && !agent1Thought.isComplete && (
                        <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                  {rounds.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
                      <span className="font-mono text-xs text-white/40">Decision:</span>
                      <span className={`font-mono text-sm font-bold ${
                        rounds[rounds.length - 1]?.agent1Decision === "cooperate" ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {rounds[rounds.length - 1]?.agent1Decision?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Agent 2 Thoughts */}
                <div className="flex flex-col border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="font-mono text-xs text-white/60 uppercase tracking-wider">
                      {getShortModelName(agent2Model)}
                    </span>
                    {isProcessing && !agent2Thought.isComplete && (
                      <Loader2 className="w-3 h-3 animate-spin text-white/40 ml-auto" />
                    )}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
                    <p className="font-mono text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                      {agent2Thought.text || (isProcessing ? "Analyzing situation..." : "Waiting for round to start...")}
                      {isProcessing && !agent2Thought.isComplete && (
                        <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                      )}
                    </p>
                  </div>
                  {rounds.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
                      <span className="font-mono text-xs text-white/40">Decision:</span>
                      <span className={`font-mono text-sm font-bold ${
                        rounds[rounds.length - 1]?.agent2Decision === "cooperate" ? "text-emerald-400" : "text-red-400"
                      }`}>
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
                      <div className={`w-2 h-2 rounded-full ${
                        round.agent1Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                      } ${a1Won ? "ring-1 ring-white" : ""}`} />
                      <div className={`w-2 h-2 rounded-full ${
                        round.agent2Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                      } ${a2Won ? "ring-1 ring-white" : ""}`} />
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
