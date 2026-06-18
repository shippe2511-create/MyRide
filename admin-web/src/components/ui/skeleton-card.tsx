"use client"

import { cn } from "@/lib/utils"

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("p-5 rounded-lg border bg-card animate-pulse", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-muted" />
        <div className="w-16 h-5 rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="w-24 h-8 rounded bg-muted" />
        <div className="w-20 h-4 rounded bg-muted" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-muted rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 bg-muted/50 rounded" />
      ))}
    </div>
  )
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-6 animate-pulse", className)}>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="w-32 h-5 rounded bg-muted" />
          <div className="w-48 h-4 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-16 h-4 rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="h-64 bg-muted/50 rounded" />
    </div>
  )
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
