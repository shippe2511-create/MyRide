"use client"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import {
  FileX, Users, Car, AlertTriangle, ClipboardList, Star,
  Calendar, Settings, MapPin, MessageSquare, Shield, Fuel,
  LucideIcon
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  rides: Car,
  customers: Users,
  drivers: Users,
  incidents: AlertTriangle,
  checklists: ClipboardList,
  ratings: Star,
  schedules: Calendar,
  settings: Settings,
  zones: MapPin,
  chat: MessageSquare,
  sos: Shield,
  vehicles: Car,
  logs: Fuel,
  default: FileX,
}

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon = "default", title, description, action, className }: EmptyStateProps) {
  const Icon = ICONS[icon] || ICONS.default

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}
