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

export default function Home() {
  const [userGames, setUserGames] = useState<GameRecord[]>([])
  const [whitepaperOpen, setWhitepaperOpen] = useState(false)
  const [playGameOpen, setPlayGameOpen] = useState(false)
  const [liveMatchCount, setLiveMatchCount] = useState(0)
  const [showBanner, setShowBanner] = useState(true)

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

  const handleLiveMatchUpdate = useCallback((count: number) => {
    setLiveMatchCount(count)
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Status Banner */}
      {showBanner && (
        <div className="bg-amber-900/30 border-b border-amber-500/20 px-4 py-2 relative">
          <p className="text-center text-amber-200/80 text-xs sm:text-sm font-mono pr-8">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse" />
            Monitoring issue with <code className="bg-amber-500/20 px-1.5 py-0.5 rounded">deepseek/deepseek-v3.2-thinking</code> — temporarily removed from games
          </p>
          <button
            onClick={() => setShowBanner(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-200/60 hover:text-amber-200 transition-colors p-1"
            aria-label="Dismiss banner"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}

      <header className="relative top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6">
        <div className="font-mono text-xs sm:text-sm tracking-wider flex items-center gap-4">
          <span className="opacity-80">The Model&apos;s Dilemma</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/model-explorer"
            className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
          >
            Model Explorer
          </Link>
          {liveMatchCount > 0 && (
            <span className="font-mono text-[10px] sm:text-xs text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {liveMatchCount} Live
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row min-h-screen">
        <div className="w-full lg:w-[60%] flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 lg:pb-12 overflow-visible z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="font-mono text-3xl sm:text-4xl lg:text-5xl xl:text-6xl text-white leading-tight mb-4 sm:mb-6 text-balance">
              The Model&apos;s Dilemma
            </h1>
            <p className="text-white/80 max-w-lg mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              A recreation of Robert Axelrod&apos;s 1984 experiment on Game Theory&apos;s classic thought experiment the
              Prisoner&apos;s Dilemma.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  document.getElementById("experiment-design")?.scrollIntoView({ behavior: "smooth" })
                }}
                variant="outline"
                className="font-mono text-xs sm:text-sm uppercase tracking-wider border-white/15 bg-transparent text-white hover:bg-white/5 px-4 sm:px-6 py-4 sm:py-5"
              >
                Experiment Design
              </Button>
              <Button
                onClick={() => setPlayGameOpen(true)}
                className="font-mono text-xs sm:text-sm uppercase tracking-wider bg-white text-black hover:bg-white/90 px-4 sm:px-6 py-4 sm:py-5"
              >
                Play Game
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-8 sm:mt-12 lg:mt-16 overflow-visible"
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

        <div className="w-full lg:w-[40%] h-[50vh] lg:h-screen pb-4 lg:pb-8 px-4 lg:px-0 lg:pr-8 z-0">
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
