import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Car,
  Users,
  MapPin,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowUpRight,
  FileText,
  ChevronRight
} from "lucide-react"
import { DashboardCharts } from "./charts"
import { DashboardRefresh } from "./dashboard-refresh"
import { ActivityFeed } from "@/components/activity-feed"
import Link from "next/link"

async function getStats() {
  const supabase = await createClient()

  // Get date for last month comparison
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
    // Last month counts for trend calculation
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").lt("created_at", thisMonth.toISOString()),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").lt("created_at", thisMonth.toISOString()),
    supabase.from("rides").select("*", { count: "exact", head: true }).lt("created_at", thisMonth.toISOString())
  ])

  // Calculate trends (new this month vs total last month)
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
}

export default async function DashboardPage() {
  const stats = await getStats()

  const kpis = [
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      trend: stats.customerTrend.percent > 0 ? `${stats.customerTrend.up ? '+' : '-'}${stats.customerTrend.percent}%` : undefined,
      trendUp: stats.customerTrend.up,
      color: "slate",
      badge: "all",
    },
    {
      title: "Total Drivers",
      value: stats.totalDrivers,
      icon: Car,
      trend: stats.driverTrend.percent > 0 ? `${stats.driverTrend.up ? '+' : '-'}${stats.driverTrend.percent}%` : undefined,
      trendUp: stats.driverTrend.up,
      color: "slate",
      badge: "all",
    },
    {
      title: "Total Rides",
      value: stats.totalRides,
      icon: MapPin,
      trend: stats.rideTrend.percent > 0 ? `${stats.rideTrend.up ? '+' : '-'}${stats.rideTrend.percent}%` : undefined,
      trendUp: stats.rideTrend.up,
      color: "slate",
      badge: "all",
    },
    {
      title: "Active Rides",
      value: stats.activeRides,
      icon: Clock,
      color: "yellow",
    },
    {
      title: "Completed Rides",
      value: stats.completedRides,
      icon: CheckCircle,
      color: "green",
    },
    {
      title: "Online Drivers",
      value: stats.onlineDrivers,
      icon: TrendingUp,
      color: "blue",
    },
  ]

  return (
    <div className="space-y-6">
      <DashboardRefresh />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your MyRide platform
          </p>
        </div>
        {stats.pendingApprovals > 0 && (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {stats.pendingApprovals} pending approval{stats.pendingApprovals > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => {
          const colorMap: Record<string, { bg: string; icon: string; text: string; border: string }> = {
            slate: { bg: "from-slate-500/10 to-slate-600/5", icon: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/20" },
            green: { bg: "from-green-500/10 to-green-600/5", icon: "bg-green-500/20", text: "text-green-500", border: "border-green-500/20" },
            yellow: { bg: "from-yellow-500/10 to-yellow-600/5", icon: "bg-yellow-500/20", text: "text-yellow-500", border: "border-yellow-500/20" },
            blue: { bg: "from-blue-500/10 to-blue-600/5", icon: "bg-blue-500/20", text: "text-blue-500", border: "border-blue-500/20" },
          }
          const colors = colorMap[kpi.color] || colorMap.slate
          return (
            <Card key={kpi.title} className={`p-5 bg-gradient-to-br ${colors.bg} ${colors.border}`}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${colors.icon}`}>
                    <kpi.icon className={`h-4 w-4 ${colors.text}`} />
                  </div>
                  {kpi.badge && (
                    <span className={`text-xs font-medium ${colors.text} bg-${kpi.color}-500/10 px-2 py-1 rounded-full`}>
                      {kpi.badge}
                    </span>
                  )}
                  {kpi.trend && (
                    <span className={`text-xs font-medium ${kpi.trendUp ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"} px-2 py-1 rounded-full`}>
                      {kpi.trend}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <p className={`text-2xl font-bold tracking-tight ${kpi.color !== "slate" ? colors.text : ""}`}>{kpi.value.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{kpi.title}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <DashboardCharts />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Recent Rides</CardTitle>
            <Link
              href="/dashboard/rides"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {stats.recentRides.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Car className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No rides yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {stats.recentRides.map((ride: Record<string, unknown>) => {
                  const createdAt = new Date(ride.created_at as string)
                  const now = new Date()
                  const diffMs = now.getTime() - createdAt.getTime()
                  const diffMins = Math.floor(diffMs / 60000)
                  let timeAgo = ""
                  if (diffMins < 1) timeAgo = "Just now"
                  else if (diffMins < 60) timeAgo = `${diffMins}m ago`
                  else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`
                  else timeAgo = `${Math.floor(diffMins / 1440)}d ago`

                  return (
                    <Link
                      key={ride.id as string}
                      href={`/dashboard/rides?id=${ride.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Car className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium group-hover:text-primary transition-colors">
                            {(ride.customer as { full_name: string })?.full_name || "Unknown"}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {(ride.pickup_name as string)?.split(",")[0]} → {(ride.dropoff_name as string)?.split(",")[0]}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{timeAgo}</span>
                        <Badge
                          variant={
                            ride.status === "completed" ? "success" :
                            ride.status === "cancelled" ? "destructive" :
                            ride.status === "in_progress" ? "default" : "secondary"
                          }
                          className="gap-1"
                        >
                          {ride.status === "in_progress" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                          {(ride.status as string)?.replace("_", " ")}
                        </Badge>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <ActivityFeed />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/drivers?status=pending"
          className={`group relative overflow-hidden rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
            stats.pendingApprovals > 0
              ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30'
              : 'bg-gradient-to-br from-slate-500/10 to-slate-600/5 border border-slate-500/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className={`p-2.5 rounded-xl ${stats.pendingApprovals > 0 ? 'bg-yellow-500/20' : 'bg-slate-500/20'}`}>
              <AlertCircle className={`h-5 w-5 ${stats.pendingApprovals > 0 ? 'text-yellow-500' : 'text-slate-400'}`} />
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <p className={`text-3xl font-bold ${stats.pendingApprovals > 0 ? 'text-yellow-500' : ''}`}>
              {stats.pendingApprovals}
            </p>
            <p className="text-sm font-medium mt-1">Pending Approvals</p>
            <p className="text-xs text-muted-foreground mt-0.5">Drivers awaiting review</p>
          </div>
          {stats.pendingApprovals > 0 && (
            <div className="absolute top-3 right-3">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
              </span>
            </div>
          )}
        </Link>

        <Link
          href="/dashboard/rides?status=active"
          className={`group relative overflow-hidden rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
            stats.activeRides > 0
              ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30'
              : 'bg-gradient-to-br from-slate-500/10 to-slate-600/5 border border-slate-500/20'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className={`p-2.5 rounded-xl ${stats.activeRides > 0 ? 'bg-blue-500/20' : 'bg-slate-500/20'}`}>
              <Clock className={`h-5 w-5 ${stats.activeRides > 0 ? 'text-blue-500' : 'text-slate-400'}`} />
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <p className={`text-3xl font-bold ${stats.activeRides > 0 ? 'text-blue-500' : ''}`}>
              {stats.activeRides}
            </p>
            <p className="text-sm font-medium mt-1">Active Rides</p>
            <p className="text-xs text-muted-foreground mt-0.5">Currently in progress</p>
          </div>
          {stats.activeRides > 0 && (
            <div className="absolute top-3 right-3">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            </div>
          )}
        </Link>

        <Link
          href="/dashboard/reports"
          className="group relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-green-500/20">
              <FileText className="h-5 w-5 text-green-500" />
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-green-500">Reports</p>
            <p className="text-sm font-medium mt-1">Export Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">Download CSV reports</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
