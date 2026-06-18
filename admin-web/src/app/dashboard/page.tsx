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
  XCircle,
  AlertCircle
} from "lucide-react"
import { DashboardCharts } from "./charts"
import { DashboardRefresh } from "./dashboard-refresh"
import { ActivityFeed } from "@/components/activity-feed"

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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Rides</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentRides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rides yet</p>
            ) : (
              <div className="space-y-4">
                {stats.recentRides.map((ride: Record<string, unknown>) => (
                  <div key={ride.id as string} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors">
                    <div>
                      <p className="font-medium">{(ride.customer as { full_name: string })?.full_name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">
                        {ride.pickup_name as string} → {ride.dropoff_name as string}
                      </p>
                    </div>
                    <Badge
                      variant={
                        ride.status === "completed" ? "success" :
                        ride.status === "cancelled" ? "destructive" :
                        ride.status === "in_progress" ? "default" : "secondary"
                      }
                    >
                      {(ride.status as string)?.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ActivityFeed />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <a href="/dashboard/drivers?status=pending" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent transition-colors">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium text-sm">Pending Approvals</p>
                <p className="text-xs text-muted-foreground">{stats.pendingApprovals} awaiting</p>
              </div>
            </a>
            <a href="/dashboard/rides?status=active" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent transition-colors">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium text-sm">Active Rides</p>
                <p className="text-xs text-muted-foreground">{stats.activeRides} in progress</p>
              </div>
            </a>
            <a href="/dashboard/reports" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent transition-colors">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium text-sm">Reports</p>
                <p className="text-xs text-muted-foreground">Export data</p>
              </div>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
