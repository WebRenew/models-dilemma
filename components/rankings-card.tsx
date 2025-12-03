"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { ScrambleText } from "@/components/animations/ScrambleText"

interface RankingEntry {
  rank: number
  modelId: string
  wins: number
  losses: number
}

interface RankingsCardProps {
  rankings: RankingEntry[]
  onExport: () => void
}

/** Stagger delay between each row in milliseconds */
const ROW_STAGGER_MS = 80

export function RankingsCard({ rankings, onExport }: RankingsCardProps) {
  return (
    <div className="border border-white/15 p-3 sm:p-5 flex flex-col justify-between w-full h-full">
      <div>
        <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 mb-2 sm:mb-3">Rankings</p>
        <div className="space-y-1 sm:space-y-1.5">
          {rankings.slice(0, 10).map((entry, index) => (
            <div 
              key={entry.rank} 
              className="font-mono text-xs sm:text-sm flex items-center text-white/80"
            >
              <span className="w-4 sm:w-5 shrink-0 text-white/50">
                {entry.rank}
              </span>
              <ScrambleText 
                text={entry.modelId} 
                className="truncate flex-1"
                delayMs={index * ROW_STAGGER_MS}
              />
              <span className="flex gap-1.5 ml-2 shrink-0">
                <span className="text-[#4ade80]">
                  <AnimatedNumber value={entry.wins} suffix="W" />
                </span>
                <span className="text-[#f87171]">
                  <AnimatedNumber value={entry.losses} suffix="L" />
                </span>
              </span>
            </div>
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
