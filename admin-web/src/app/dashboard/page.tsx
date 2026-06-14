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

async function getStats() {
  const supabase = await createClient()

  const [
    { count: totalCustomers },
    { count: totalDrivers },
    { count: totalRides },
    { count: activeRides },
    { count: completedRides },
    { count: pendingApprovals },
    { data: onlineDrivers },
    { data: recentRides }
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
    `).order("created_at", { ascending: false }).limit(5)
  ])

  return {
    totalCustomers: totalCustomers || 0,
    totalDrivers: totalDrivers || 0,
    totalRides: totalRides || 0,
    activeRides: activeRides || 0,
    completedRides: completedRides || 0,
    pendingApprovals: pendingApprovals || 0,
    onlineDrivers: onlineDrivers?.length || 0,
    recentRides: recentRides || []
  }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const kpis = [
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Total Drivers",
      value: stats.totalDrivers,
      icon: Car,
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Total Rides",
      value: stats.totalRides,
      icon: MapPin,
      trend: "+23%",
      trendUp: true,
    },
    {
      title: "Active Rides",
      value: stats.activeRides,
      icon: Clock,
      color: "text-yellow-500",
    },
    {
      title: "Completed Rides",
      value: stats.completedRides,
      icon: CheckCircle,
      color: "text-green-500",
    },
    {
      title: "Online Drivers",
      value: stats.onlineDrivers,
      icon: TrendingUp,
      color: "text-blue-500",
    },
  ]

  return (
    <div className="space-y-6">
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
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color || "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{kpi.value.toLocaleString()}</div>
              {kpi.trend && (
                <p className={`text-xs ${kpi.trendUp ? "text-green-500" : "text-red-500"}`}>
                  {kpi.trend} from last month
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardCharts />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Rides</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentRides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rides yet</p>
            ) : (
              <div className="space-y-4">
                {stats.recentRides.map((ride: Record<string, unknown>) => (
                  <div key={ride.id as string} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
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

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <a href="/dashboard/drivers?status=pending" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium">Pending Driver Approvals</p>
                <p className="text-sm text-muted-foreground">{stats.pendingApprovals} awaiting review</p>
              </div>
            </a>
            <a href="/dashboard/rides?status=active" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Active Rides</p>
                <p className="text-sm text-muted-foreground">{stats.activeRides} in progress</p>
              </div>
            </a>
            <a href="/dashboard/reports" className="flex items-center gap-2 rounded-lg border p-3 hover:bg-accent">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">Generate Reports</p>
                <p className="text-sm text-muted-foreground">Export CSV or PDF reports</p>
              </div>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
