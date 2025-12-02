"use client"

import { motion } from "motion/react"

interface StatsCardProps {
  label: string
  value: string | number
  subtitle?: string
}

export function StatsCard({ label, value, subtitle }: StatsCardProps) {
  return (
    <div className="border border-white/15 p-5 w-full flex-1">
      <p className="font-mono text-xs uppercase tracking-wider text-white/50 mb-2 whitespace-nowrap">{label}</p>
      <motion.p
        key={String(value)}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        className="font-mono text-4xl text-white"
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </motion.p>
      {subtitle && <p className="font-mono text-xs text-white/50 mt-2">{subtitle}</p>}
    </div>
  )
}
