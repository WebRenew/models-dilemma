"use client"

import { AnimatedNumber } from "@/components/ui/animated-number"

interface StatsCardProps {
  label: string
  value: string | number
  subtitle?: string
}

export function StatsCard({ label, value, subtitle }: StatsCardProps) {
  return (
    <div className="border border-white/15 p-3 sm:p-5 w-full flex-1">
      <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-white/50 mb-1 sm:mb-2 whitespace-nowrap">{label}</p>
      {typeof value === "number" ? (
        <AnimatedNumber 
          value={value} 
          className="font-mono text-2xl sm:text-4xl text-white block"
        />
      ) : (
        <p className="font-mono text-2xl sm:text-4xl text-white">{value}</p>
      )}
      {subtitle && <p className="font-mono text-[10px] sm:text-xs text-white/50 mt-1 sm:mt-2">{subtitle}</p>}
    </div>
  )
}
