"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Activity
} from "lucide-react"
import { DashboardCharts } from "./charts"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

function useDashboardData() {
  const supabase = createClient()

  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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
        { count: lastMonthRides }
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
        supabase.from("rides").select("*", { count: "exact", head: true }).lt("created_at", thisMonth.toISOString())
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
        rideTrend
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

  return (
    <div className="space-y-6">
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
              stats.recentRides.map((ride: any) => (
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
