"use client"

import { AnimatedNumber } from "@/components/ui/animated-number"

interface RoundsCardProps {
  controlRounds: number
  hiddenAgendaRounds: number
}

export function RoundsCard({ controlRounds, hiddenAgendaRounds }: RoundsCardProps) {
  return (
    <div className="border border-white/15 p-5 w-full flex-1 flex flex-col gap-4">
      {/* Control Group Rounds */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-white/50 mb-1">Control Group Rounds</p>
        <AnimatedNumber 
          value={controlRounds} 
          className="font-mono text-2xl text-white block"
        />
        <p className="font-mono text-[10px] text-white/50 mt-1">Original Prisoner&apos;s Dilemma</p>
      </div>

      {/* Hidden Agenda Rounds */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-white/50 mb-1">Hidden Agenda Rounds</p>
        <AnimatedNumber 
          value={hiddenAgendaRounds} 
          className="font-mono text-2xl text-white block"
        />
        <p className="font-mono text-[10px] text-white/50 mt-1">Hidden Prisoner&apos;s Agenda Prompt</p>
      </div>
    </div>
  )
}
