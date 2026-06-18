"use client"

import { X } from "lucide-react"
import { Badge } from "./badge"

interface FilterPill {
  key: string
  label: string
  value: string
}

interface FilterPillsProps {
  filters: FilterPill[]
  onRemove: (key: string) => void
  onClearAll?: () => void
}

export function FilterPills({ filters, onRemove, onClearAll }: FilterPillsProps) {
  if (filters.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Filters:</span>
      {filters.map((filter) => (
        <Badge
          key={filter.key}
          variant="secondary"
          className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80"
          onClick={() => onRemove(filter.key)}
        >
          <span className="text-muted-foreground">{filter.label}:</span>
          {filter.value}
          <X className="h-3 w-3 ml-1" />
        </Badge>
      ))}
      {filters.length > 1 && onClearAll && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
