"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, Pause, RotateCcw, Zap } from "lucide-react"

interface GameControlsProps {
  isRunning: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onRunAll: () => void
  totalRounds: number
  onTotalRoundsChange: (rounds: number) => void
  currentRound: number
  disabled?: boolean
}

export function GameControls({
  isRunning,
  onStart,
  onPause,
  onReset,
  onRunAll,
  totalRounds,
  onTotalRoundsChange,
  currentRound,
  disabled,
}: GameControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rounds:</span>
        <Select
          value={totalRounds.toString()}
          onValueChange={(v) => onTotalRoundsChange(Number.parseInt(v))}
          disabled={isRunning || currentRound > 0}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {!isRunning ? (
          <Button onClick={onStart} disabled={disabled || currentRound >= totalRounds}>
            <Play className="w-4 h-4 mr-2" />
            {currentRound === 0 ? "Start" : "Continue"}
          </Button>
        ) : (
          <Button onClick={onPause} variant="secondary">
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
        )}

        <Button onClick={onRunAll} variant="outline" disabled={disabled || isRunning || currentRound >= totalRounds}>
          <Zap className="w-4 h-4 mr-2" />
          Run All
        </Button>

        <Button onClick={onReset} variant="ghost" disabled={isRunning}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>

      <div className="ml-auto text-sm text-muted-foreground font-mono">
        Round {currentRound} / {totalRounds}
      </div>
    </div>
  )
}
