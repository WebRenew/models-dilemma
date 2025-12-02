"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RankingEntry {
  rank: number
  modelId: string
  wins: number
}

interface RankingsCardProps {
  rankings: RankingEntry[]
  onExport: () => void
}

export function RankingsCard({ rankings, onExport }: RankingsCardProps) {
  return (
    <div className="border border-white/15 p-5 flex flex-col justify-between w-full h-full">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-white/50 mb-3">Rankings</p>
        <div className="space-y-1.5">
          {rankings.slice(0, 10).map((entry) => (
            <div key={entry.rank} className="font-mono text-sm text-white/80 flex">
              <span className="text-white/50 w-5 shrink-0">{entry.rank}</span>
              <span className="truncate">{entry.modelId}</span>
            </div>
          ))}
          {rankings.length === 0 && <p className="font-mono text-sm text-white/50">No games yet</p>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className="font-mono text-[10px] uppercase tracking-wider border-white/15 bg-transparent text-white/80 hover:bg-white/5 hover:text-white mt-6 whitespace-nowrap"
      >
        Export Dataset
        <Download className="ml-1.5 h-2.5 w-2.5" />
      </Button>
    </div>
  )
}
