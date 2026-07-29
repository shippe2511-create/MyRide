"use client"

import { ReactNode } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

interface GridPanelProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
  editMode?: boolean
}

export function GridPanel({
  title,
  icon,
  children,
  badge,
  actions,
  className,
  contentClassName,
  editMode = false,
}: GridPanelProps) {
  return (
    <div className={cn("grid-panel h-full flex flex-col", className)}>
      <div className="grid-panel-header drag-handle">
        <h3 className="text-xs font-semibold flex items-center gap-2">
          {editMode && <GripVertical className="h-3 w-3 text-muted-foreground" />}
          {icon}
          <span>{title}</span>
          {badge}
        </h3>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      <div className={cn("grid-panel-content flex-1 overflow-auto", contentClassName)}>
        {children}
      </div>
    </div>
  )
}
