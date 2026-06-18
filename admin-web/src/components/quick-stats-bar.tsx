"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Car, Users, AlertTriangle, Clock, CheckCircle } from "lucide-react"

interface QuickStats {
  todayRides: number
  activeDrivers: number
  pendingAlerts: number
  activeRides: number
}

export function QuickStatsBar() {
  const supabase = createClient()
  const [stats, setStats] = useState<QuickStats>({ todayRides: 0, activeDrivers: 0, pendingAlerts: 0, activeRides: 0 })

  useEffect(() => {
    loadStats()

    const channel = supabase
      .channel('quick_stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => loadStats())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadStats = async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [todayRidesRes, activeDriversRes, pendingAlertsRes, activeRidesRes] = await Promise.all([
      supabase.from('rides').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('is_online', true),
      supabase.from('sos_alerts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('rides').select('*', { count: 'exact', head: true }).in('status', ['pending', 'accepted', 'arrived', 'in_progress']),
    ])

    setStats({
      todayRides: todayRidesRes.count || 0,
      activeDrivers: activeDriversRes.count || 0,
      pendingAlerts: pendingAlertsRes.count || 0,
      activeRides: activeRidesRes.count || 0,
    })
  }

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-muted/30 border-b text-sm">
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-blue-500" />
        <span className="text-muted-foreground">Today:</span>
        <span className="font-semibold">{stats.todayRides}</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-yellow-500" />
        <span className="text-muted-foreground">Active:</span>
        <span className="font-semibold text-yellow-500">{stats.activeRides}</span>
      </div>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-green-500" />
        <span className="text-muted-foreground">Drivers Online:</span>
        <span className="font-semibold text-green-500">{stats.activeDrivers}</span>
      </div>
      {stats.pendingAlerts > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
          <span className="font-semibold text-red-500">{stats.pendingAlerts} SOS</span>
        </div>
      )}
    </div>
  )
}
