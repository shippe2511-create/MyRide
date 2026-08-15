"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface RecentRide {
  id: string
  status: string
  pickup_address: string | null
  dropoff_address: string | null
  created_at: string
  customer?: { full_name: string } | null
  driver?: { profile?: { full_name: string } | null } | null
}
import { Badge } from "@/components/ui/badge"
import {
  Car,
  Users,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
  Activity,
  Plus,
  MonitorPlay,
  Bell,
  Bus,
  TrendingUp,
  Timer,
  UserPlus,
  FileWarning,
  AlertTriangle,
  Zap,
  Star,
  Coffee,
  TrendingDown
} from "lucide-react"
import { DashboardCharts } from "./charts"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow, format } from "date-fns"

function useDashboardData() {
  const supabase = createClient()

  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayISO = todayStart.toISOString()

      const [
        { count: totalCustomers },
        { count: totalDrivers },
        { count: totalRides },
        { count: activeRides },
        { count: completedRides },
        { count: pendingApprovals },
        { data: onlineDrivers },
        { data: recentRides },
        { count: lastMonthCustomers },
        { count: lastMonthDrivers },
        { count: lastMonthRides },
        { data: todayRides },
        { data: activeShuttles },
        { count: sosAlerts },
        { data: expiringDocs },
        { data: pendingDrivers },
        { count: unassignedRides },
        { count: totalVehicles },
        { data: driversOnBreak },
        { data: topDriver },
        { data: avgRating },
        { data: weekRides },
        { data: lastWeekRides },
        { count: cancelledToday },
        { data: shiftsToday }
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver"),
        supabase.from("rides").select("*", { count: "exact", head: true }),
        supabase.from("rides").select("*", { count: "exact", head: true }).in("status", ["pending", "accepted", "in_progress"]),
        supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("drivers").select("*").eq("is_online", true),
        supabase.from("rides").select(`
          *,
          customer:profiles!rides_customer_id_fkey(full_name),
          driver:drivers!rides_driver_id_fkey(
            profile:profiles(full_name)
          )
        `).order("created_at", { ascending: false }).limit(5),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").lt("created_at", thisMonth.toISOString()),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").lt("created_at", thisMonth.toISOString()),
        supabase.from("rides").select("*", { count: "exact", head: true }).lt("created_at", thisMonth.toISOString()),
        supabase.from("rides").select("id, status, created_at, accepted_at, arrived_at, completed_at").gte("created_at", todayISO),
        supabase.from("bus_location_tracking").select("id, is_full, passengers_on_board, vehicle_capacity, route:transport_routes(route_code)").in("status", ["active", "in_progress"]),
        supabase.from("sos_alerts").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("vehicles").select("id, vehicle_number, license_expiry, insurance_expiry").or(`license_expiry.lte.${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]},insurance_expiry.lte.${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`).limit(5),
        supabase.from("drivers").select("id, profile:profiles(full_name), created_at").eq("approval_status", "pending").limit(5),
        supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("drivers").select("id, profile:profiles(full_name)").eq("is_on_break", true),
        supabase.from("rides").select("driver_id, driver:drivers(profile:profiles(full_name))").eq("status", "completed").gte("created_at", thisMonth.toISOString()),
        supabase.from("ratings").select("rating"),
        supabase.from("rides").select("id, status, created_at").gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("rides").select("id, status, created_at").gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()).lt("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "cancelled").gte("created_at", todayISO),
        supabase.from("shifts").select("id, attendance_status").eq("shift_date", todayISO.split('T')[0])
      ])

      const calcTrend = (current: number, lastMonthTotal: number) => {
        const newThisMonth = current - lastMonthTotal
        if (lastMonthTotal === 0) return { percent: newThisMonth > 0 ? 100 : 0, up: newThisMonth > 0 }
        const percent = Math.round((newThisMonth / lastMonthTotal) * 100)
        return { percent: Math.abs(percent), up: percent >= 0 }
      }

      const customerTrend = calcTrend(totalCustomers || 0, lastMonthCustomers || 0)
      const driverTrend = calcTrend(totalDrivers || 0, lastMonthDrivers || 0)
      const rideTrend = calcTrend(totalRides || 0, lastMonthRides || 0)

      const todayRidesArr = todayRides || []
      const todayCompleted = todayRidesArr.filter((r: any) => r.status === 'completed').length
      const todayCancelled = todayRidesArr.filter((r: any) => r.status === 'cancelled').length
      const todayActive = todayRidesArr.filter((r: any) => ['pending', 'accepted', 'arrived', 'in_progress'].includes(r.status)).length

      let totalWait = 0, waitCount = 0
      todayRidesArr.forEach((r: any) => {
        if (r.created_at && r.accepted_at) {
          totalWait += (new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()) / 1000
          waitCount++
        }
      })
      const avgWaitSeconds = waitCount > 0 ? Math.round(totalWait / waitCount) : 0

      const hourCounts: Record<number, number> = {}
      todayRidesArr.forEach((r: any) => {
        const hour = new Date(r.created_at).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      })
      let busiestHour = null
      let maxCount = 0
      Object.entries(hourCounts).forEach(([hour, count]) => {
        if (count > maxCount) {
          maxCount = count
          busiestHour = parseInt(hour)
        }
      })

      const shuttleArr = activeShuttles || []
      const fullShuttles = shuttleArr.filter((s: any) => s.is_full).length

      const alertsCount = (sosAlerts || 0) + (pendingApprovals || 0) + (unassignedRides || 0) + (expiringDocs?.length || 0)

      const ratingsArr = avgRating || []
      const avgRatingValue = ratingsArr.length > 0
        ? ratingsArr.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / ratingsArr.length
        : 0

      const driverCounts: Record<string, { count: number, name: string }> = {}
      const topDriverRides = topDriver || []
      topDriverRides.forEach((r: any) => {
        if (r.driver_id && r.driver?.profile?.full_name) {
          if (!driverCounts[r.driver_id]) {
            driverCounts[r.driver_id] = { count: 0, name: r.driver.profile.full_name }
          }
          driverCounts[r.driver_id].count++
        }
      })
      let topDriverInfo = null
      let maxTrips = 0
      Object.entries(driverCounts).forEach(([id, info]) => {
        if (info.count > maxTrips) {
          maxTrips = info.count
          topDriverInfo = { id, name: info.name, trips: info.count }
        }
      })

      const weekRidesArr = weekRides || []
      const lastWeekRidesArr = lastWeekRides || []
      const weekCompleted = weekRidesArr.filter((r: any) => r.status === 'completed').length
      const lastWeekCompleted = lastWeekRidesArr.filter((r: any) => r.status === 'completed').length
      const weekChange = lastWeekCompleted > 0 ? Math.round(((weekCompleted - lastWeekCompleted) / lastWeekCompleted) * 100) : 0

      const shiftsArr = shiftsToday || []
      const presentDrivers = shiftsArr.filter((s: any) => s.attendance_status === 'present').length
      const absentDrivers = shiftsArr.filter((s: any) => s.attendance_status === 'absent').length
      const pendingAttendance = shiftsArr.filter((s: any) => s.attendance_status === 'pending').length

      return {
        totalCustomers: totalCustomers || 0,
        totalDrivers: totalDrivers || 0,
        totalRides: totalRides || 0,
        activeRides: activeRides || 0,
        completedRides: completedRides || 0,
        pendingApprovals: pendingApprovals || 0,
        onlineDrivers: onlineDrivers?.length || 0,
        recentRides: recentRides || [],
        customerTrend,
        driverTrend,
        rideTrend,
        today: {
          total: todayRidesArr.length,
          completed: todayCompleted,
          cancelled: todayCancelled,
          active: todayActive,
          avgWaitSeconds,
          busiestHour
        },
        shuttles: {
          active: shuttleArr.length,
          full: fullShuttles,
          list: shuttleArr.slice(0, 3)
        },
        alerts: {
          total: alertsCount,
          sos: sosAlerts || 0,
          unassigned: unassignedRides || 0,
          expiringDocs: expiringDocs || [],
          pendingDrivers: pendingDrivers || []
        },
        totalVehicles: totalVehicles || 0,
        driversOnBreak: driversOnBreak?.length || 0,
        avgRating: Math.round(avgRatingValue * 10) / 10,
        topDriver: topDriverInfo,
        weekComparison: {
          thisWeek: weekCompleted,
          lastWeek: lastWeekCompleted,
          change: weekChange
        },
        attendance: {
          total: shiftsArr.length,
          present: presentDrivers,
          absent: absentDrivers,
          pending: pendingAttendance
        },
        cancelledToday: cancelledToday || 0
      }
    },
    staleTime: 30 * 1000,
  })
}

const supabase = createClient()

export function DashboardClient() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading } = useDashboardData()

  useEffect(() => {
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-card/50 animate-pulse border border-border/50" />
          ))}
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card/50 animate-pulse border border-border/50" />
          ))}
        </div>
      </div>
    )
  }

  const quickActions = [
    { label: "Add Customer", icon: UserPlus, href: "/dashboard/customers?action=add", color: "bg-blue-500 hover:bg-blue-600" },
    { label: "Add Driver", icon: Car, href: "/dashboard/drivers?action=add", color: "bg-emerald-500 hover:bg-emerald-600" },
    { label: "Control Room", icon: MonitorPlay, href: "/control-room", color: "bg-violet-500 hover:bg-violet-600" },
    { label: "View Alerts", icon: Bell, href: "/dashboard/sos", color: "bg-rose-500 hover:bg-rose-600", badge: stats.alerts.sos > 0 ? stats.alerts.sos : undefined },
  ]

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    return `${Math.round(seconds / 60)}m`
  }

  const formatHour = (hour: number | null) => {
    if (hour === null) return "—"
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h = hour % 12 || 12
    return `${h}${ampm}`
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href}>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 bg-card/50 hover:bg-card border-border/50"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${action.color} transition-colors`}>
                <action.icon className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-medium">{action.label}</span>
              {action.badge && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-semibold">
                  {action.badge}
                </Badge>
              )}
            </Button>
          </Link>
        ))}
      </div>

      {/* Alerts Banner */}
      {stats.alerts.total > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-200">Attention Required</p>
                <p className="text-sm text-amber-300/70">
                  {stats.alerts.sos > 0 && `${stats.alerts.sos} SOS alert${stats.alerts.sos > 1 ? 's' : ''}`}
                  {stats.alerts.sos > 0 && stats.alerts.unassigned > 0 && ' • '}
                  {stats.alerts.unassigned > 0 && `${stats.alerts.unassigned} unassigned ride${stats.alerts.unassigned > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <Link href="/dashboard/sos">
              <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/20">
                View All <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Main KPIs Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total Customers */}
        <Link href="/dashboard/customers">
          <div className="group p-5 rounded-xl bg-card/80 border border-border/50 hover:border-border hover:bg-card transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Customers</span>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold tracking-tight">{stats.totalCustomers.toLocaleString()}</p>
              {stats.customerTrend.percent > 0 && (
                <span className={`text-sm font-medium flex items-center gap-0.5 ${stats.customerTrend.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.customerTrend.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {stats.customerTrend.percent}%
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* Total Drivers */}
        <Link href="/dashboard/drivers">
          <div className="group p-5 rounded-xl bg-card/80 border border-border/50 hover:border-border hover:bg-card transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-3">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Drivers</span>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold tracking-tight">{stats.totalDrivers.toLocaleString()}</p>
              {stats.driverTrend.percent > 0 && (
                <span className={`text-sm font-medium flex items-center gap-0.5 ${stats.driverTrend.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.driverTrend.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {stats.driverTrend.percent}%
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* Total Rides */}
        <Link href="/dashboard/rides">
          <div className="group p-5 rounded-xl bg-card/80 border border-border/50 hover:border-border hover:bg-card transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Rides</span>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold tracking-tight">{stats.totalRides.toLocaleString()}</p>
              {stats.rideTrend.percent > 0 && (
                <span className={`text-sm font-medium flex items-center gap-0.5 ${stats.rideTrend.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.rideTrend.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {stats.rideTrend.percent}%
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* Online Drivers - Live */}
        <Link href="/dashboard/tracking">
          <div className="group p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 hover:border-blue-500/50 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-blue-300/80">Online Drivers</span>
              </div>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-5 border-blue-500/50 text-blue-400 bg-blue-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 animate-pulse" />
                LIVE
              </Badge>
            </div>
            <p className="text-3xl font-bold tracking-tight text-blue-100">{stats.onlineDrivers}</p>
          </div>
        </Link>
      </div>

      {/* Status Cards Row */}
      <div className="grid gap-4 grid-cols-3">
        {/* Active Rides */}
        <Link href="/dashboard/rides?status=active">
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 to-yellow-500/5 border border-amber-500/30 hover:border-amber-500/50 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-300">{stats.activeRides}</p>
                <p className="text-sm text-amber-400/70">Active Rides</p>
              </div>
            </div>
          </div>
        </Link>

        {/* Completed */}
        <Link href="/dashboard/rides?status=completed">
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/15 to-green-500/5 border border-emerald-500/30 hover:border-emerald-500/50 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-300">{stats.completedRides.toLocaleString()}</p>
                <p className="text-sm text-emerald-400/70">Completed</p>
              </div>
            </div>
          </div>
        </Link>

        {/* Pending Approvals */}
        <Link href="/dashboard/customers?status=pending">
          <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/15 to-red-500/5 border border-rose-500/30 hover:border-rose-500/50 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/20">
                <AlertCircle className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-rose-300">{stats.pendingApprovals}</p>
                <p className="text-sm text-rose-400/70">Pending Approvals</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Today's Summary + Shuttle Status */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Today's Summary */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              <h3 className="font-semibold text-lg">Today's Summary</h3>
            </div>
            <Badge variant="outline" className="text-xs bg-muted/50 border-border/50">
              {format(new Date(), "EEEE, MMM d")}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Total Rides</span>
              </div>
              <p className="text-2xl font-bold">{stats.today.total}</p>
              <div className="flex gap-2 mt-1.5 text-xs">
                <span className="text-emerald-400">{stats.today.completed} done</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-amber-400">{stats.today.active} active</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="h-4 w-4 text-violet-400" />
                <span className="text-xs text-muted-foreground">Avg Wait</span>
              </div>
              <p className="text-2xl font-bold">{formatWaitTime(stats.today.avgWaitSeconds)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">request to accept</p>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">Busiest Hour</span>
              </div>
              <p className="text-2xl font-bold">{formatHour(stats.today.busiestHour)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {stats.today.busiestHour !== null ? 'peak demand' : 'no data yet'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Success Rate</span>
              </div>
              <p className="text-2xl font-bold">
                {stats.today.total > 0
                  ? Math.round((stats.today.completed / (stats.today.completed + stats.today.cancelled)) * 100) || 0
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {stats.today.cancelled} cancelled
              </p>
            </div>
          </div>
        </div>

        {/* Shuttle Status */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bus className="h-5 w-5 text-emerald-400" />
              <h3 className="font-semibold">Shuttle Status</h3>
            </div>
            <Link href="/dashboard/live-tracking">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                View Map <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-2xl font-bold text-emerald-400">{stats.shuttles.active}</p>
              <p className="text-xs text-emerald-400/70">Running</p>
            </div>
            <div className="flex-1 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
              <p className="text-2xl font-bold text-rose-400">{stats.shuttles.full}</p>
              <p className="text-xs text-rose-400/70">Full</p>
            </div>
          </div>

          {stats.shuttles.list.length > 0 ? (
            <div className="space-y-2">
              {stats.shuttles.list.map((shuttle: any) => {
                const pct = shuttle.vehicle_capacity > 0
                  ? (shuttle.passengers_on_board / shuttle.vehicle_capacity) * 100
                  : 0
                return (
                  <div key={shuttle.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${shuttle.is_full ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      <span className="text-sm font-medium">
                        {shuttle.route?.route_code || 'Bus'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {shuttle.passengers_on_board}/{shuttle.vehicle_capacity}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No active shuttles</p>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {/* Active Vehicles */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10">
              <Car className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalVehicles}</p>
              <p className="text-sm text-muted-foreground">Active Vehicles</p>
            </div>
          </div>
        </div>

        {/* Average Rating */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Star className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgRating.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">Avg Rating</p>
            </div>
          </div>
        </div>

        {/* Weekly Comparison */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-500/10">
              <TrendingUp className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.weekComparison.thisWeek}</p>
              <p className="text-sm text-muted-foreground">
                This Week
                {stats.weekComparison.change !== 0 && (
                  <span className={`ml-1.5 ${stats.weekComparison.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stats.weekComparison.change > 0 ? '+' : ''}{stats.weekComparison.change}%
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Drivers on Break */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-orange-500/10">
              <Coffee className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.driversOnBreak}</p>
              <p className="text-sm text-muted-foreground">On Break</p>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance & Top Driver */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Today's Attendance */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-blue-400" />
            <h3 className="font-semibold">Today's Attendance</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-2xl font-bold text-emerald-400">{stats.attendance.present}</p>
              <p className="text-xs text-emerald-400/70">Present</p>
            </div>
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
              <p className="text-2xl font-bold text-rose-400">{stats.attendance.absent}</p>
              <p className="text-xs text-rose-400/70">Absent</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-2xl font-bold text-amber-400">{stats.attendance.pending}</p>
              <p className="text-xs text-amber-400/70">Pending</p>
            </div>
          </div>
          {stats.attendance.total > 0 && (
            <div className="mt-4 h-2.5 rounded-full bg-muted/50 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(stats.attendance.present / stats.attendance.total) * 100}%` }}
              />
              <div
                className="h-full bg-rose-500 transition-all"
                style={{ width: `${(stats.attendance.absent / stats.attendance.total) * 100}%` }}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(stats.attendance.pending / stats.attendance.total) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Top Driver This Month */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold">Top Driver This Month</h3>
          </div>
          {stats.topDriver ? (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <span className="text-2xl">🏆</span>
              </div>
              <div>
                <p className="font-semibold text-xl">{(stats.topDriver as any).name}</p>
                <p className="text-sm text-muted-foreground">
                  {(stats.topDriver as any).trips} completed trips
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No data yet this month</p>
          )}
        </div>
      </div>

      {/* Charts and Activity */}
      <DashboardCharts />

      {/* Recent Rides */}
      <div className="p-5 rounded-xl bg-card/80 border border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Recent Rides</h3>
          <Link href="/dashboard/rides" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-1">
          {stats.recentRides.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No recent rides</p>
          ) : (
            stats.recentRides.map((ride: RecentRide) => (
              <div key={ride.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{ride.customer?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {ride.pickup_address || 'Pickup'} → {ride.dropoff_address || 'Dropoff'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    ride.status === 'completed' ? 'success' :
                    ride.status === 'in_progress' ? 'default' :
                    ride.status === 'cancelled' ? 'destructive' : 'secondary'
                  }
                  className="text-xs capitalize"
                >
                  {ride.status.replace('_', ' ')}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
