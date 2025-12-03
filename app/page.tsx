"use client"

import { useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { GameFeed } from "@/components/game-feed"
import { StatsCard } from "@/components/stats-card"
import { RankingsCard } from "@/components/rankings-card"
import { StrategyStats } from "@/components/strategy-stats"
import { RoundsCard } from "@/components/rounds-card"
import { WhitepaperModal } from "@/components/whitepaper-modal"
import { PlayGameModal } from "@/components/play-game-modal"
import { ExperimentDesign } from "@/components/experiment-design"
import { Footer } from "@/components/footer"
import type { GameRecord } from "@/lib/game-logic"
import { MODEL_COUNT } from "@/lib/models"
import { fetchGameStats, fetchModelRankings, exportGameDataCSV, fetchStrategyStats } from "@/lib/supabase/db"
import Link from "next/link"
import { Play, Loader2 } from "lucide-react"

export default function Home() {
  const [userGames, setUserGames] = useState<GameRecord[]>([])
  const [whitepaperOpen, setWhitepaperOpen] = useState(false)
  const [playGameOpen, setPlayGameOpen] = useState(false)
  const [tournamentRunning, setTournamentRunning] = useState(false)
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null)
  const [gameRunning, setGameRunning] = useState(false)
  const [liveMatchCount, setLiveMatchCount] = useState(0)

  const [dbStats, setDbStats] = useState({ totalGames: 0, controlRounds: 0, hiddenAgendaRounds: 0 })
  const [dbRankings, setDbRankings] = useState<
    { modelId: string; displayName: string; totalPoints: number; gamesPlayed: number }[]
  >([])
  const [strategyStats, setStrategyStats] = useState({
    forgiving: 0,
    forgivingTotal: 0,
    retaliating: 0,
    retaliatingTotal: 0,
    nice: 0,
    niceTotal: 0,
    nonEnvious: 0,
    nonEnviousTotal: 0,
  })

  const loadStats = useCallback(async () => {
    const stats = await fetchGameStats()
    setDbStats(stats)
    const rankings = await fetchModelRankings(10)
    setDbRankings(rankings)
    const strategies = await fetchStrategyStats()
    setStrategyStats(strategies)
  }, [])

  useEffect(() => {
    loadStats()

    // Refresh stats every 5 seconds
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [loadStats])

  const gamesPlayed = dbStats.totalGames
  const modelsAvailable = MODEL_COUNT
  const controlRounds = dbStats.controlRounds
  const hiddenAgendaRounds = dbStats.hiddenAgendaRounds

  const rankings = dbRankings.map((r, i) => ({
    rank: i + 1,
    modelId: r.modelId,
    wins: r.totalPoints,
  }))

  const handleGameComplete = useCallback(
    (gameResult: GameRecord) => {
      setUserGames((prev) => [gameResult, ...prev])
      loadStats()
    },
    [loadStats],
  )

  const handleNewGame = useCallback(() => {
    // Stats are refreshed via loadStats polling
  }, [])

  const exportDataset = useCallback(async () => {
    const csv = await exportGameDataCSV()

    if (!csv) {
      alert("No game data to export yet.")
      return
    }

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "prisoners-dilemma-dataset.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const startTournament = useCallback(async () => {
    if (tournamentRunning) return
    
    setTournamentRunning(true)
    setTournamentStatus("Starting tournament...")
    
    try {
      const response = await fetch("/api/start-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchesPerScenario: 25,
          totalRounds: 10,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setTournamentStatus(`Tournament started! ${data.totalMatches} matches queued.`)
        // Keep running state for a bit then reset
        setTimeout(() => {
          setTournamentRunning(false)
          setTournamentStatus(null)
        }, 5000)
      } else {
        throw new Error(data.error || "Failed to start tournament")
      }
    } catch (error) {
      setTournamentStatus(`Error: ${error}`)
      setTournamentRunning(false)
      setTimeout(() => setTournamentStatus(null), 5000)
    }
  }, [tournamentRunning])

  const triggerSingleGame = useCallback(async () => {
    if (gameRunning) return
    
    setGameRunning(true)
    
    const scenarios = ["overt", "sales", "research", "creator"]
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]
    
    try {
      const response = await fetch("/api/run-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framing: scenario === "overt" ? "overt" : "cloaked",
          scenario: scenario === "overt" ? undefined : scenario,
          totalRounds: 10,
          saveToDb: true,
          streamRounds: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Read the stream to completion
      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          decoder.decode(value, { stream: true })
        }
      }
      
      loadStats()
    } catch (error) {
      console.error("Failed to trigger game:", error)
    } finally {
      setGameRunning(false)
    }
  }, [gameRunning, loadStats])

  const handleLiveMatchUpdate = useCallback((count: number) => {
    setLiveMatchCount(count)
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="relative top-0 left-0 right-0 z-40 flex items-center justify-between px-8 py-6">
        <div className="font-mono text-sm tracking-wider flex items-center gap-4">
          <span className="opacity-80">The Model&apos;s Dilemma</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/model-explorer"
            className="font-mono text-xs uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
          >
            Model Explorer
          </Link>
          {liveMatchCount === 0 && !gameRunning ? (
            <Button
              onClick={triggerSingleGame}
              size="sm"
              className="font-mono text-xs uppercase tracking-wider bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50"
            >
              <Play className="h-3 w-3 mr-2" />
              Trigger Game
            </Button>
          ) : gameRunning ? (
            <Button
              disabled
              size="sm"
              className="font-mono text-xs uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 opacity-50"
            >
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              Running...
            </Button>
          ) : (
            <span className="font-mono text-xs text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {liveMatchCount} Live {liveMatchCount === 1 ? "Match" : "Matches"}
            </span>
          )}
          <Button
            onClick={startTournament}
            disabled={tournamentRunning}
            size="sm"
            variant="outline"
            className="font-mono text-xs uppercase tracking-wider border-white/20 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-50"
          >
            {tournamentRunning ? (
              <>
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Tournament...
              </>
            ) : (
              "Run Tournament"
            )}
          </Button>
          {tournamentStatus && (
            <span className="font-mono text-xs text-emerald-400/80">{tournamentStatus}</span>
          )}
        </div>
      </header>

      <div className="flex min-h-screen">
        <div className="w-[60%] flex flex-col justify-center px-12 lg:px-16 xl:px-20 pb-12 overflow-visible z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="font-mono text-4xl lg:text-5xl xl:text-6xl text-white leading-tight mb-6 text-balance">
              The Model&apos;s Dilemma
            </h1>
            <p className="text-white/80 max-w-lg mb-8 leading-relaxed">
              A recreation of Robert Axelrod&apos;s 1984 experiment on Game Theory&apos;s classic thought experiment the
              Prisoner&apos;s Dilemma.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => setWhitepaperOpen(true)}
                variant="outline"
                className="font-mono text-sm uppercase tracking-wider border-white/15 bg-transparent text-white hover:bg-white/5 px-6 py-5"
              >
                Experiment Design
              </Button>
              <Button
                onClick={() => setPlayGameOpen(true)}
                className="font-mono text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90 px-6 py-5"
              >
                Play Game
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-4 gap-2 mt-16 overflow-visible"
          >
            <div className="col-span-2 flex">
              <RankingsCard rankings={rankings} onExport={exportDataset} />
            </div>
            <div className="flex flex-col gap-2">
              <StatsCard label="Games Played" value={gamesPlayed} />
              <StatsCard label="Models Available" value={modelsAvailable} />
              <RoundsCard controlRounds={controlRounds} hiddenAgendaRounds={hiddenAgendaRounds} />
            </div>
            <div className="flex">
              <StrategyStats stats={strategyStats} />
            </div>
          </motion.div>
        </div>

        <div className="w-[40%] h-screen pb-8 pr-8 z-0">
          <GameFeed userGames={userGames} onNewGame={handleNewGame} onLiveMatchCountChange={handleLiveMatchUpdate} />
        </div>
      </div>

      <WhitepaperModal isOpen={whitepaperOpen} onClose={() => setWhitepaperOpen(false)} />

      <PlayGameModal isOpen={playGameOpen} onClose={() => setPlayGameOpen(false)} onGameComplete={handleGameComplete} />

      <ExperimentDesign />

      <Footer />
    </div>
  )
}
