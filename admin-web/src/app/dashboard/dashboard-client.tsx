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
  Star
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
        { count: unassignedRides }
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
        // Today's rides with timing data
        supabase.from("rides").select("id, status, created_at, accepted_at, arrived_at, completed_at").gte("created_at", todayISO),
        // Active shuttles
        supabase.from("bus_location_tracking").select("id, is_full, passengers_on_board, vehicle_capacity, route:transport_routes(route_code)").in("status", ["active", "in_progress"]),
        // SOS alerts (unresolved)
        supabase.from("sos_alerts").select("*", { count: "exact", head: true }).eq("status", "active"),
        // Expiring documents (next 7 days)
        supabase.from("vehicles").select("id, vehicle_number, license_expiry, insurance_expiry").or(`license_expiry.lte.${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]},insurance_expiry.lte.${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`).limit(5),
        // Pending driver approvals
        supabase.from("drivers").select("id, profile:profiles(full_name), created_at").eq("approval_status", "pending").limit(5),
        // Unassigned rides
        supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "pending")
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

      // Calculate today's stats
      const todayRidesArr = todayRides || []
      const todayCompleted = todayRidesArr.filter((r: any) => r.status === 'completed').length
      const todayCancelled = todayRidesArr.filter((r: any) => r.status === 'cancelled').length
      const todayActive = todayRidesArr.filter((r: any) => ['pending', 'accepted', 'arrived', 'in_progress'].includes(r.status)).length

      // Avg wait time (request to accept)
      let totalWait = 0, waitCount = 0
      todayRidesArr.forEach((r: any) => {
        if (r.created_at && r.accepted_at) {
          totalWait += (new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()) / 1000
          waitCount++
        }
      })
      const avgWaitSeconds = waitCount > 0 ? Math.round(totalWait / waitCount) : 0

      // Busiest hour
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

      // Shuttle stats
      const shuttleArr = activeShuttles || []
      const fullShuttles = shuttleArr.filter((s: any) => s.is_full).length

      // Alerts count
      const alertsCount = (sosAlerts || 0) + (pendingApprovals || 0) + (unassignedRides || 0) + (expiringDocs?.length || 0)

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
        // New data
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
        }
      }
    },
    staleTime: 30 * 1000,
  })
}

const supabase = createClient()

export function DashboardClient() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading } = useDashboardData()

  // Realtime subscriptions for dashboard updates
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
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-4 w-20 bg-muted rounded mb-2" />
              <div className="h-8 w-16 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const kpis = [
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      trend: stats.customerTrend.percent > 0 ? `${stats.customerTrend.up ? '+' : '-'}${stats.customerTrend.percent}%` : undefined,
      trendUp: stats.customerTrend.up,
      color: "slate",
      badge: "all",
      href: "/dashboard/customers"
    },
    {
      title: "Total Drivers",
      value: stats.totalDrivers,
      icon: Car,
      trend: stats.driverTrend.percent > 0 ? `${stats.driverTrend.up ? '+' : '-'}${stats.driverTrend.percent}%` : undefined,
      trendUp: stats.driverTrend.up,
      color: "slate",
      badge: "all",
      href: "/dashboard/drivers"
    },
    {
      title: "Total Rides",
      value: stats.totalRides,
      icon: MapPin,
      trend: stats.rideTrend.percent > 0 ? `${stats.rideTrend.up ? '+' : '-'}${stats.rideTrend.percent}%` : undefined,
      trendUp: stats.rideTrend.up,
      color: "slate",
      badge: "all",
      href: "/dashboard/rides"
    },
    {
      title: "Online Drivers",
      value: stats.onlineDrivers,
      icon: Activity,
      color: "blue",
      badge: "live",
      href: "/dashboard/tracking"
    },
  ]

  const statusCards = [
    {
      title: "Active Rides",
      value: stats.activeRides,
      icon: Clock,
      color: "yellow",
      href: "/dashboard/rides?status=active"
    },
    {
      title: "Completed",
      value: stats.completedRides,
      icon: CheckCircle,
      color: "green",
      href: "/dashboard/rides?status=completed"
    },
    {
      title: "Pending Approvals",
      value: stats.pendingApprovals,
      icon: AlertCircle,
      color: "red",
      href: "/dashboard/customers?status=pending"
    },
  ]

  const quickActions = [
    { label: "Add Customer", icon: UserPlus, href: "/dashboard/customers?action=add", color: "bg-blue-500" },
    { label: "Add Driver", icon: Car, href: "/dashboard/drivers?action=add", color: "bg-green-500" },
    { label: "Control Room", icon: MonitorPlay, href: "/control-room", color: "bg-primary" },
    { label: "View Alerts", icon: Bell, href: "/dashboard/sos", color: "bg-red-500", badge: stats.alerts.sos > 0 ? stats.alerts.sos : undefined },
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
              className="shrink-0 gap-2 hover:bg-muted/80"
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center ${action.color}`}>
                <action.icon className="h-3 w-3 text-white" />
              </div>
              {action.label}
              {action.badge && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {action.badge}
                </Badge>
              )}
            </Button>
          </Link>
        ))}
      </div>

      {/* Alerts Banner (if any) */}
      {stats.alerts.total > 0 && (
        <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Attention Required</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.alerts.sos > 0 && `${stats.alerts.sos} SOS alert${stats.alerts.sos > 1 ? 's' : ''}`}
                    {stats.alerts.sos > 0 && stats.alerts.unassigned > 0 && ' • '}
                    {stats.alerts.unassigned > 0 && `${stats.alerts.unassigned} unassigned ride${stats.alerts.unassigned > 1 ? 's' : ''}`}
                    {(stats.alerts.sos > 0 || stats.alerts.unassigned > 0) && stats.alerts.expiringDocs.length > 0 && ' • '}
                    {stats.alerts.expiringDocs.length > 0 && `${stats.alerts.expiringDocs.length} expiring document${stats.alerts.expiringDocs.length > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <Link href="/dashboard/sos">
                <Button size="sm" variant="ghost" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10">
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link href={kpi.href} key={kpi.title}>
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg bg-${kpi.color === 'blue' ? 'blue' : 'muted'}-500/10`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.color === 'blue' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{kpi.title}</span>
                </div>
                {kpi.badge === "live" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-500/50 text-blue-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse" />
                    LIVE
                  </Badge>
                )}
              </div>
              <div className="flex items-end justify-between">
                <p className="text-2xl font-bold">{kpi.value.toLocaleString()}</p>
                <div className="flex items-center gap-1">
                  {kpi.trend && (
                    <span className={`text-xs font-medium ${kpi.trendUp ? 'text-green-500' : 'text-red-500'}`}>
                      {kpi.trend}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Status Cards */}
      <div className="grid gap-3 grid-cols-3">
        {statusCards.map((card) => (
          <Link href={card.href} key={card.title}>
            <Card className={`p-4 bg-gradient-to-br from-${card.color}-500/10 to-${card.color}-600/5 border-${card.color}-500/20 hover:from-${card.color}-500/15 transition-colors cursor-pointer`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${card.color}-500/20 shrink-0`}>
                  <card.icon className={`h-4 w-4 text-${card.color}-500`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-bold tracking-tight text-${card.color}-500`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Today's Summary + Shuttle Status */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Today's Summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Today's Summary
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {format(new Date(), "EEEE, MMM d")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Total Rides</span>
                </div>
                <p className="text-2xl font-bold">{stats.today.total}</p>
                <div className="flex gap-2 mt-1 text-[10px]">
                  <span className="text-green-500">{stats.today.completed} done</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-amber-500">{stats.today.active} active</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs text-muted-foreground">Avg Wait</span>
                </div>
                <p className="text-2xl font-bold">{formatWaitTime(stats.today.avgWaitSeconds)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">request to accept</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-xs text-muted-foreground">Busiest Hour</span>
                </div>
                <p className="text-2xl font-bold">{formatHour(stats.today.busiestHour)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.today.busiestHour !== null ? 'peak demand' : 'no data yet'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-muted-foreground">Success Rate</span>
                </div>
                <p className="text-2xl font-bold">
                  {stats.today.total > 0
                    ? Math.round((stats.today.completed / (stats.today.completed + stats.today.cancelled)) * 100) || 0
                    : 0}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.today.cancelled} cancelled
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shuttle Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bus className="h-4 w-4 text-green-500" />
                Shuttle Status
              </CardTitle>
              <Link href="/dashboard/live-tracking">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View Map <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
                <p className="text-xl font-bold text-green-500">{stats.shuttles.active}</p>
                <p className="text-[10px] text-muted-foreground">Running</p>
              </div>
              <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
                <p className="text-xl font-bold text-red-500">{stats.shuttles.full}</p>
                <p className="text-[10px] text-muted-foreground">Full</p>
              </div>
            </div>

            {stats.shuttles.list.length > 0 ? (
              <div className="space-y-2">
                {stats.shuttles.list.map((shuttle: any) => {
                  const pct = shuttle.vehicle_capacity > 0
                    ? (shuttle.passengers_on_board / shuttle.vehicle_capacity) * 100
                    : 0
                  return (
                    <div key={shuttle.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${shuttle.is_full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`} />
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
          </CardContent>
        </Card>
      </div>

      {/* Charts and Activity */}
      <DashboardCharts />

      {/* Recent Rides */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Recent Rides</CardTitle>
          <Link href="/dashboard/rides" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.recentRides.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent rides</p>
            ) : (
              stats.recentRides.map((ride: RecentRide) => (
                <div key={ride.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{ride.customer?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {ride.pickup_address || 'Pickup'} → {ride.dropoff_address || 'Dropoff'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        ride.status === 'completed' ? 'success' :
                        ride.status === 'in_progress' ? 'default' :
                        ride.status === 'cancelled' ? 'destructive' : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {ride.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
