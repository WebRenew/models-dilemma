"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { ScrambleText } from "@/components/animations/ScrambleText"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { fetchModelDetailedStats, type ModelDetailedStats } from "@/lib/supabase/db"

interface RankingEntry {
  rank: number
  modelId: string
  totalPoints: number
  wins: number
  losses: number
}

interface RankingsCardProps {
  rankings: RankingEntry[]
  onExport: () => void
}

/** Stagger delay between each row in milliseconds */
const ROW_STAGGER_MS = 80

function ModelHoverContent({ modelId }: { modelId: string }) {
  const [stats, setStats] = useState<ModelDetailedStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasFetched, setHasFetched] = useState(false)

  const loadStats = async () => {
    if (hasFetched) return
    setHasFetched(true)
    setIsLoading(true)
    const data = await fetchModelDetailedStats(modelId)
    setStats(data)
    setIsLoading(false)
  }

  // Load stats when component mounts (hover opens)
  if (!hasFetched) {
    loadStats()
  }

  if (isLoading) {
    return (
      <div className="min-w-[280px] p-1">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-white/10 rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-w-[280px] p-1">
        <p className="text-white/50 text-xs font-mono">No data available</p>
      </div>
    )
  }

  const formatPercent = (value: number, total: number) => {
    if (total === 0) return "N/A"
    return `${Math.round((value / total) * 100)}%`
  }

  return (
    <div className="min-w-[280px] space-y-3">
      {/* Header */}
      <div className="border-b border-white/10 pb-2">
        <p className="font-mono text-sm text-white font-medium whitespace-nowrap">
          {stats.displayName}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="font-mono text-[10px] text-white/40 uppercase">Games Played</p>
          <p className="font-mono text-sm text-white">{stats.totalGames}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-white/40 uppercase">Total Points</p>
          <p className="font-mono text-sm text-white">{stats.totalPoints.toLocaleString()}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-white/40 uppercase">Record</p>
          <p className="font-mono text-sm">
            <span className="text-emerald-400">{stats.wins}W</span>
            <span className="text-white/30 mx-1">-</span>
            <span className="text-red-400">{stats.losses}L</span>
            <span className="text-white/30 mx-1">-</span>
            <span className="text-white/80">{stats.ties}T</span>
          </p>
          <p className="font-mono text-[10px] text-white/40 mt-1">
            <span className="text-emerald-400/70">W</span>in · <span className="text-red-400/70">L</span>oss · <span className="text-white/60">T</span>ie
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-white/40 uppercase">Total Errors</p>
          <p className={`font-mono text-sm ${stats.totalErrors > 0 ? "text-amber-400" : "text-white/60"}`}>
            {stats.totalErrors}
          </p>
        </div>
      </div>

      {/* Behavior Summary */}
      <div className="border-t border-white/10 pt-2">
        <p className="font-mono text-[10px] text-white/40 uppercase mb-2">Agent Behavior</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[10px] text-white/60">Forgiving</span>
            <span className="font-mono text-xs text-white">
              {formatPercent(stats.behavior.forgiving, stats.behavior.forgivingTotal)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[10px] text-white/60">Retaliating</span>
            <span className="font-mono text-xs text-white">
              {formatPercent(stats.behavior.retaliating, stats.behavior.retaliatingTotal)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[10px] text-white/60">Nice</span>
            <span className="font-mono text-xs text-white">
              {formatPercent(stats.behavior.nice, stats.behavior.niceTotal)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[10px] text-white/60">Non-Envious</span>
            <span className="font-mono text-xs text-white">
              {formatPercent(stats.behavior.nonEnvious, stats.behavior.nonEnviousTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RankingsCard({ rankings, onExport }: RankingsCardProps) {
  return (
    <div className="border border-white/15 p-3 sm:p-5 flex flex-col justify-between w-full h-full">
      <div>
        <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 mb-2 sm:mb-3">Rankings</p>
        <div className="space-y-1 sm:space-y-1.5">
          {rankings.slice(0, 10).map((entry, index) => (
            <HoverCard key={entry.rank} openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="font-mono text-xs sm:text-sm flex items-center text-white/80 cursor-pointer hover:bg-white/5 -mx-2 px-2 py-0.5 rounded transition-colors">
                  <span className="w-4 sm:w-5 shrink-0 text-white/50">
                    {entry.rank}
                  </span>
                  <ScrambleText 
                    text={entry.modelId} 
                    className="truncate flex-1 min-w-0"
                    delayMs={index * ROW_STAGGER_MS}
                  />
                  <span className="flex gap-1 sm:gap-1.5 ml-1 sm:ml-2 shrink-0 text-[10px] sm:text-xs">
                    <span className="text-[#4ade80]">
                      <AnimatedNumber value={entry.wins} suffix="W" />
                    </span>
                    <span className="text-[#f87171]">
                      <AnimatedNumber value={entry.losses} suffix="L" />
                    </span>
                  </span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent 
                side="right" 
                align="start" 
                className="bg-[#111] border-white/15 p-4 w-auto"
              >
                <ModelHoverContent modelId={entry.modelId} />
              </HoverCardContent>
            </HoverCard>
          ))}
          {rankings.length === 0 && <p className="font-mono text-xs sm:text-sm text-white/50">No games yet</p>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider border-white/15 bg-transparent text-white/80 hover:bg-white/5 hover:text-white mt-4 sm:mt-6 whitespace-nowrap"
      >
        Export Dataset
        <Download className="ml-1 sm:ml-1.5 h-2 w-2 sm:h-2.5 sm:w-2.5" />
      </Button>
    </div>
  )
}
