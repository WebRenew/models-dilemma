"use client"

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

function formatPercent(count: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((count / total) * 100)}%`
}

export function StrategyStats({ stats }: StrategyStatsProps) {
  return (
    <div className="border border-white/15 p-3 sm:p-5 w-full h-full">
      <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 mb-2 sm:mb-3">Agent Behavior</p>
      <div className="space-y-1.5 sm:space-y-2">
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Forgiving</p>
          <p className="font-mono text-xl sm:text-2xl text-white">{formatPercent(stats.forgiving, stats.forgivingTotal)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Retaliating</p>
          <p className="font-mono text-xl sm:text-2xl text-white">{formatPercent(stats.retaliating, stats.retaliatingTotal)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Nice</p>
          <p className="font-mono text-xl sm:text-2xl text-white">{formatPercent(stats.nice, stats.niceTotal)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50">Non-Envious</p>
          <p className="font-mono text-xl sm:text-2xl text-white">{formatPercent(stats.nonEnvious, stats.nonEnviousTotal)}</p>
        </div>
      </div>
    </div>
  )
}
