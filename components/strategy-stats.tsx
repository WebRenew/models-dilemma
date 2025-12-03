"use client"

import { AnimatedPercent } from "@/components/ui/animated-number"

interface StrategyStatsProps {
  stats: {
    forgiving: number
    forgivingTotal: number
    retaliating: number
    retaliatingTotal: number
    nice: number
    niceTotal: number
    nonEnvious: number
    nonEnviousTotal: number
  }
}

export function StrategyStats({ stats }: StrategyStatsProps) {
  return (
    <div className="border border-white/15 p-3 sm:p-5 w-full h-full">
      <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 mb-2 sm:mb-3">Agent Behavior</p>
      <div className="space-y-1.5 sm:space-y-2">
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Forgiving</p>
          <AnimatedPercent 
            value={stats.forgiving} 
            total={stats.forgivingTotal} 
            className="font-mono text-xl sm:text-2xl text-white block"
          />
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Retaliating</p>
          <AnimatedPercent 
            value={stats.retaliating} 
            total={stats.retaliatingTotal} 
            className="font-mono text-xl sm:text-2xl text-white block"
          />
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Nice</p>
          <AnimatedPercent 
            value={stats.nice} 
            total={stats.niceTotal} 
            className="font-mono text-xl sm:text-2xl text-white block"
          />
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Non-Envious</p>
          <AnimatedPercent 
            value={stats.nonEnvious} 
            total={stats.nonEnviousTotal} 
            className="font-mono text-xl sm:text-2xl text-white block"
          />
        </div>
      </div>
    </div>
  )
}
