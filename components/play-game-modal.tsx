"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/models"
import { X, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { type RoundResult, type GameRecord, calculatePayoff, formatHistory, getShortModelName } from "@/lib/game-logic"

interface PlayGameModalProps {
  isOpen: boolean
  onClose: () => void
  onGameComplete: (game: GameRecord) => void
}

const TOTAL_ROUNDS = 10

export function PlayGameModal({ isOpen, onClose, onGameComplete }: PlayGameModalProps) {
  const [agent1Model, setAgent1Model] = useState(DEFAULT_MODEL)
  const [agent2Model, setAgent2Model] = useState("anthropic/claude-sonnet-4-20250514")
  const [gameState, setGameState] = useState<"setup" | "playing" | "complete">("setup")
  const [currentRound, setCurrentRound] = useState(0)
  const [rounds, setRounds] = useState<RoundResult[]>([])
  const [agent1Total, setAgent1Total] = useState(0)
  const [agent2Total, setAgent2Total] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const roundsContainerRef = useRef<HTMLDivElement>(null)

  const groupedModels = AI_MODELS.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = []
      acc[model.provider].push(model)
      return acc
    },
    {} as Record<string, typeof AI_MODELS>,
  )

  useEffect(() => {
    if (roundsContainerRef.current) {
      roundsContainerRef.current.scrollTop = roundsContainerRef.current.scrollHeight
    }
  }, [rounds.length])

  const resetGame = useCallback(() => {
    setGameState("setup")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)
    setIsProcessing(false)
    abortControllerRef.current?.abort()
  }, [])

  const playRound = useCallback(
    async (roundNumber: number, previousRounds: RoundResult[], signal: AbortSignal) => {
      setIsProcessing(true)

      try {
        const [agent1Response, agent2Response] = await Promise.all([
          fetch("/api/agent-decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentName: "Agent Alpha",
              personality:
                "You are strategic and analytical. You believe in reciprocity - start by cooperating, then mirror your opponent's previous move.",
              history: formatHistory(previousRounds, 1),
              round: roundNumber,
              totalRounds: TOTAL_ROUNDS,
              model: agent1Model,
            }),
            signal,
          }),
          fetch("/api/agent-decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentName: "Agent Omega",
              personality:
                "You are a game theory optimizer. You analyze patterns and try to maximize long-term gains through strategic cooperation and occasional defection.",
              history: formatHistory(previousRounds, 2),
              round: roundNumber,
              totalRounds: TOTAL_ROUNDS,
              model: agent2Model,
            }),
            signal,
          }),
        ])

        if (!agent1Response.ok || !agent2Response.ok) {
          throw new Error("Failed to get agent decisions")
        }

        const agent1Data = await agent1Response.json()
        const agent2Data = await agent2Response.json()
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
    [agent1Model, agent2Model],
  )

  const startGame = useCallback(async () => {
    setGameState("playing")
    setCurrentRound(0)
    setRounds([])
    setAgent1Total(0)
    setAgent2Total(0)

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

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

      await new Promise((r) => setTimeout(r, 300))
    }

    setGameState("complete")

    const winner =
      runningAgent1Total > runningAgent2Total ? "agent1" : runningAgent2Total > runningAgent1Total ? "agent2" : "tie"

    const gameRecord: GameRecord = {
      id: `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agent1Model,
      agent2Model,
      agent1DisplayName: getShortModelName(agent1Model),
      agent2DisplayName: getShortModelName(agent2Model),
      rounds: runningRounds,
      agent1TotalScore: runningAgent1Total,
      agent2TotalScore: runningAgent2Total,
      winner,
      timestamp: Date.now(),
    }

    try {
      await fetch("/api/run-automated-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent1Model,
          agent2Model,
          gameSource: "user",
        }),
      })
    } catch (e) {
      console.error("Failed to save user game:", e)
    }

    onGameComplete(gameRecord)
  }, [agent1Model, agent2Model, playRound, onGameComplete])

  const handleClose = () => {
    abortControllerRef.current?.abort()
    resetGame()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-black border border-white/15 p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-mono text-lg text-white">
                {gameState === "setup" && "Play Game"}
                {gameState === "playing" && `Round ${currentRound} of ${TOTAL_ROUNDS}`}
                {gameState === "complete" && "Game Complete"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {gameState === "setup" && (
              <div className="space-y-6">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider text-white/50">Agent 1 Model</Label>
                  <Select value={agent1Model} onValueChange={setAgent1Model}>
                    <SelectTrigger className="mt-2 font-mono text-sm bg-transparent border-white/15 text-white">
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
                  <Label className="font-mono text-xs uppercase tracking-wider text-white/50">Agent 2 Model</Label>
                  <Select value={agent2Model} onValueChange={setAgent2Model}>
                    <SelectTrigger className="mt-2 font-mono text-sm bg-transparent border-white/15 text-white">
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

                <div className="border border-white/15 p-4">
                  <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-2">Game Settings</p>
                  <p className="font-mono text-sm text-white">10 Rounds • Standard Payoff Matrix</p>
                </div>

                <Button
                  onClick={startGame}
                  className="w-full font-mono text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90"
                >
                  Start Match
                </Button>
              </div>
            )}

            {(gameState === "playing" || gameState === "complete") && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/15">
                  <div className="text-center flex-1">
                    <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-1">
                      {getShortModelName(agent1Model)}
                    </p>
                    <p
                      className={`font-mono text-2xl ${
                        gameState === "complete" && agent1Total > agent2Total ? "text-emerald-400" : "text-white"
                      }`}
                    >
                      {agent1Total}
                    </p>
                  </div>
                  <div className="px-4 text-white/30 font-mono">vs</div>
                  <div className="text-center flex-1">
                    <p className="font-mono text-xs text-white/50 uppercase tracking-wider mb-1">
                      {getShortModelName(agent2Model)}
                    </p>
                    <p
                      className={`font-mono text-2xl ${
                        gameState === "complete" && agent2Total > agent1Total ? "text-emerald-400" : "text-white"
                      }`}
                    >
                      {agent2Total}
                    </p>
                  </div>
                </div>

                <div ref={roundsContainerRef} className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {rounds.map((round, idx) => {
                    const a1Won = round.agent1Points > round.agent2Points
                    const a2Won = round.agent2Points > round.agent1Points
                    const tie = round.agent1Points === round.agent2Points

                    return (
                      <motion.div
                        key={round.round}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center gap-3 p-3 border border-white/10"
                      >
                        <span className="font-mono text-xs text-white/40 w-8">R{round.round}</span>
                        <div className={`flex-1 flex items-center gap-2 ${a1Won ? "opacity-100" : "opacity-60"}`}>
                          <div
                            className={`w-3 h-3 rounded-full ${
                              round.agent1Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                            }`}
                          />
                          <span className="font-mono text-xs text-white/80">
                            {round.agent1Decision === "cooperate" ? "C" : "D"}
                          </span>
                          <span
                            className={`font-mono text-xs ml-auto ${
                              a1Won ? "text-emerald-400" : tie ? "text-white/50" : "text-white/50"
                            }`}
                          >
                            +{round.agent1Points}
                          </span>
                        </div>
                        <span className="text-white/20">|</span>
                        <div className={`flex-1 flex items-center gap-2 ${a2Won ? "opacity-100" : "opacity-60"}`}>
                          <div
                            className={`w-3 h-3 rounded-full ${
                              round.agent2Decision === "cooperate" ? "bg-emerald-400" : "bg-red-400"
                            }`}
                          />
                          <span className="font-mono text-xs text-white/80">
                            {round.agent2Decision === "cooperate" ? "C" : "D"}
                          </span>
                          <span
                            className={`font-mono text-xs ml-auto ${
                              a2Won ? "text-emerald-400" : tie ? "text-white/50" : "text-white/50"
                            }`}
                          >
                            +{round.agent2Points}
                          </span>
                        </div>
                      </motion.div>
                    )
                  })}

                  {isProcessing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center gap-2 p-3 border border-white/10 border-dashed"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                      <span className="font-mono text-xs text-white/50">Models thinking...</span>
                    </motion.div>
                  )}
                </div>

                {gameState === "complete" && (
                  <div className="flex gap-2 pt-4 border-t border-white/15">
                    <Button
                      onClick={resetGame}
                      variant="outline"
                      className="flex-1 font-mono text-xs uppercase tracking-wider border-white/15 bg-transparent text-white/80 hover:bg-white/5"
                    >
                      Play Again
                    </Button>
                    <Button
                      onClick={handleClose}
                      className="flex-1 font-mono text-xs uppercase tracking-wider bg-white text-black hover:bg-white/90"
                    >
                      Close
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
