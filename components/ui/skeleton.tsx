"use client"

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-white/10",
        className
      )}
    />
  )
}

export function StatsSkeleton() {
  return (
    <div className="border border-white/15 p-3 sm:p-5 w-full flex-1">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-8 w-16" />
    </div>
  )
}

export function RankingsSkeleton() {
  return (
    <div className="border border-white/15 p-3 sm:p-5 flex flex-col justify-between w-full h-full">
      <div>
        <Skeleton className="h-3 w-16 mb-3" />
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-8 w-full mt-4" />
    </div>
  )
}

export function StrategyStatsSkeleton() {
  return (
    <div className="border border-white/15 p-3 sm:p-5 w-full h-full">
      <Skeleton className="h-3 w-24 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-2.5 w-16 mb-1" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function RoundsCardSkeleton() {
  return (
    <div className="border border-white/15 p-5 w-full flex-1 flex flex-col gap-4">
      <div>
        <Skeleton className="h-2.5 w-28 mb-1" />
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-2.5 w-36 mt-1" />
      </div>
      <div>
        <Skeleton className="h-2.5 w-28 mb-1" />
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-2.5 w-40 mt-1" />
      </div>
    </div>
  )
}
