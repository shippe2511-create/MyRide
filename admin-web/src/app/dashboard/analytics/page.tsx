"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts"
import {
  Car, MapPin, Clock, Star, Loader2,
  Calendar, Activity, Target, Award, Zap
} from "lucide-react"
import { SkeletonCard, SkeletonChart } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

interface Ride {
  id: string
  status: string
  created_at: string
  customer_id: string
  driver_id: string | null
  pickup_name: string | null
  dropoff_name: string | null
  distance_km: number | null
  duration_minutes: number | null
}

interface DriverProfile {
  full_name: string
  avatar_url: string | null
}

interface Driver {
  id: string
  rating: number
  profile?: DriverProfile | DriverProfile[]
}

const COLORS = ["#facc15", "#22c55e", "#3b82f6", "#f97316", "#ec4899", "#8b5cf6", "#14b8a6"]

export default function AnalyticsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")
  const [rides, setRides] = useState<Ride[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])

  const [stats, setStats] = useState({
    totalRides: 0,
    completedRides: 0,
    cancelledRides: 0,
    avgDuration: 0,
    avgDistance: 0,
    completionRate: 0,
    peakHour: "",
    busiestDay: "",
    totalCustomers: 0,
    activeDrivers: 0,
    ridesChange: 0,
    customersChange: 0,
  })

  const [dailyData, setDailyData] = useState<{ date: string; rides: number; completed: number; cancelled: number }[]>([])
  const [hourlyHeatmap, setHourlyHeatmap] = useState<{ day: string; hour: number; value: number }[]>([])
  const [topDrivers, setTopDrivers] = useState<{ name: string; avatar: string | null; rides: number; rating: number }[]>([])
  const [topRoutes, setTopRoutes] = useState<{ route: string; count: number }[]>([])
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number; color: string }[]>([])

  useEffect(() => {
    loadAnalytics()

    // Realtime updates for analytics
    const channel = supabase.channel('analytics_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => loadAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadAnalytics())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [period])

  const loadAnalytics = async () => {
    setLoading(true)

    const daysAgo = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    const prevStartDate = new Date(startDate)
    prevStartDate.setDate(prevStartDate.getDate() - daysAgo)

    const [ridesRes, prevRidesRes, driversRes, customersRes, prevCustomersRes] = await Promise.all([
      supabase
        .from("rides")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .gte("created_at", prevStartDate.toISOString())
        .lt("created_at", startDate.toISOString()),
      supabase
        .from("drivers")
        .select("id, rating, profile:profiles(full_name, avatar_url)"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer")
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer")
        .gte("created_at", prevStartDate.toISOString())
        .lt("created_at", startDate.toISOString()),
    ])

    const allRides = (ridesRes.data || []) as Ride[]
    const allDrivers = (driversRes.data || []) as Driver[]
    setRides(allRides)
    setDrivers(allDrivers)

    // Calculate stats
    const completed = allRides.filter(r => r.status === "completed")
    const cancelled = allRides.filter(r => r.status === "cancelled")
    const durations = completed.filter(r => r.duration_minutes).map(r => r.duration_minutes!)
    const distances = completed.filter(r => r.distance_km).map(r => r.distance_km!)

    const prevRidesCount = prevRidesRes.count || 0
    const ridesChange = prevRidesCount > 0 ? Math.round(((allRides.length - prevRidesCount) / prevRidesCount) * 100) : 0

    const prevCustomersCount = prevCustomersRes.count || 0
    const currentCustomersCount = customersRes.count || 0
    const customersChange = prevCustomersCount > 0 ? Math.round(((currentCustomersCount - prevCustomersCount) / prevCustomersCount) * 100) : 0

    // Peak hour calculation
    const hourCounts: Record<number, number> = {}
    allRides.forEach(r => {
      const hour = new Date(r.created_at).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
    const peakHourStr = peakHour ? `${peakHour[0].padStart(2, "0")}:00` : "-"

    // Busiest day
    const dayCounts: Record<string, number> = {}
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    allRides.forEach(r => {
      const day = dayNames[new Date(r.created_at).getDay()]
      dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"

    setStats({
      totalRides: allRides.length,
      completedRides: completed.length,
      cancelledRides: cancelled.length,
      avgDuration: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      avgDistance: distances.length > 0 ? Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 10) / 10 : 0,
      completionRate: allRides.length > 0 ? Math.round((completed.length / allRides.length) * 100) : 0,
      peakHour: peakHourStr,
      busiestDay,
      totalCustomers: currentCustomersCount,
      activeDrivers: allDrivers.filter(d => d.rating > 0).length,
      ridesChange,
      customersChange,
    })

    // Daily trend data
    const dailyMap: Record<string, { rides: number; completed: number; cancelled: number }> = {}
    allRides.forEach(r => {
      const dateStr = new Date(r.created_at).toISOString().split("T")[0]
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { rides: 0, completed: 0, cancelled: 0 }
      }
      dailyMap[dateStr].rides++
      if (r.status === "completed") dailyMap[dateStr].completed++
      if (r.status === "cancelled") dailyMap[dateStr].cancelled++
    })
    const daily = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...data,
      }))
    setDailyData(daily)

    // Hourly heatmap
    const heatmapData: { day: string; hour: number; value: number }[] = []
    const dayHourCounts: Record<string, Record<number, number>> = {}
    allRides.forEach(r => {
      const d = new Date(r.created_at)
      const day = dayNames[d.getDay()]
      const hour = d.getHours()
      if (!dayHourCounts[day]) dayHourCounts[day] = {}
      dayHourCounts[day][hour] = (dayHourCounts[day][hour] || 0) + 1
    })
    dayNames.forEach(day => {
      for (let h = 6; h <= 22; h++) {
        heatmapData.push({ day, hour: h, value: dayHourCounts[day]?.[h] || 0 })
      }
    })
    setHourlyHeatmap(heatmapData)

    // Top drivers
    const driverRideCounts: Record<string, number> = {}
    allRides.filter(r => r.driver_id && r.status === "completed").forEach(r => {
      driverRideCounts[r.driver_id!] = (driverRideCounts[r.driver_id!] || 0) + 1
    })
    const topDriversList = Object.entries(driverRideCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([driverId, count]) => {
        const driver = allDrivers.find(d => d.id === driverId)
        const profile = Array.isArray(driver?.profile) ? driver.profile[0] : driver?.profile
        return {
          name: profile?.full_name || "Unknown",
          avatar: profile?.avatar_url || null,
          rides: count,
          rating: driver?.rating || 0,
        }
      })
    setTopDrivers(topDriversList)

    // Top routes
    const routeCounts: Record<string, number> = {}
    allRides.filter(r => r.pickup_name && r.dropoff_name).forEach(r => {
      const route = `${r.pickup_name?.split(",")[0]} → ${r.dropoff_name?.split(",")[0]}`
      routeCounts[route] = (routeCounts[route] || 0) + 1
    })
    const topRoutesList = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => ({ route, count }))
    setTopRoutes(topRoutesList)

    // Status breakdown
    setStatusBreakdown([
      { name: "Completed", value: completed.length, color: "#22c55e" },
      { name: "Cancelled", value: cancelled.length, color: "#ef4444" },
      { name: "Pending", value: allRides.filter(r => r.status === "pending").length, color: "#facc15" },
      { name: "In Progress", value: allRides.filter(r => r.status === "in_progress").length, color: "#3b82f6" },
    ])

    setLoading(false)
  }

  const getHeatmapColor = (value: number, max: number) => {
    if (value === 0) return "bg-muted/30"
    const intensity = Math.min(value / Math.max(max, 1), 1)
    if (intensity < 0.25) return "bg-yellow-500/20"
    if (intensity < 0.5) return "bg-yellow-500/40"
    if (intensity < 0.75) return "bg-yellow-500/60"
    return "bg-yellow-500/80"
  }

  const maxHeatmapValue = Math.max(...hourlyHeatmap.map(h => h.value), 1)

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">Platform performance and insights</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Period Summary - Compact insights bar */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Zap className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{stats.peakHour}</p>
              <p className="text-xs text-muted-foreground truncate">Peak Hour</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{stats.busiestDay}</p>
              <p className="text-xs text-muted-foreground truncate">Busiest Day</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Target className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.completionRate}%</p>
              <p className="text-xs text-muted-foreground truncate">Completion</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
              <Clock className="h-4 w-4 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-purple-500">{stats.avgDuration} min</p>
              <p className="text-xs text-muted-foreground truncate">Avg Duration</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20 shrink-0">
              <MapPin className="h-4 w-4 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-orange-500">{stats.avgDistance} km</p>
              <p className="text-xs text-muted-foreground truncate">Avg Distance</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ride Trends</CardTitle>
            <CardDescription>Daily rides over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }} />
                <Legend />
                <Area type="monotone" dataKey="completed" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Completed" />
                <Area type="monotone" dataKey="cancelled" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Cancelled" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
            <CardDescription>Ride status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusBreakdown.filter(s => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {statusBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Heatmap</CardTitle>
          <CardDescription>Ride demand by day and hour</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex gap-1 mb-2">
                <div className="w-12"></div>
                {Array.from({ length: 17 }, (_, i) => i + 6).map(h => (
                  <div key={h} className="flex-1 text-center text-xs text-muted-foreground">
                    {h}
                  </div>
                ))}
              </div>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                <div key={day} className="flex gap-1 mb-1">
                  <div className="w-12 text-xs text-muted-foreground flex items-center">{day}</div>
                  {Array.from({ length: 17 }, (_, i) => i + 6).map(hour => {
                    const cell = hourlyHeatmap.find(h => h.day === day && h.hour === hour)
                    return (
                      <div
                        key={hour}
                        className={`flex-1 h-6 rounded ${getHeatmapColor(cell?.value || 0, maxHeatmapValue)}`}
                        title={`${day} ${hour}:00 - ${cell?.value || 0} rides`}
                      />
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                <span>Less</span>
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded bg-muted/30" />
                  <div className="w-4 h-4 rounded bg-yellow-500/20" />
                  <div className="w-4 h-4 rounded bg-yellow-500/40" />
                  <div className="w-4 h-4 rounded bg-yellow-500/60" />
                  <div className="w-4 h-4 rounded bg-yellow-500/80" />
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Top Performing Drivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-4">
                {topDrivers.map((driver, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                        #{i + 1}
                      </span>
                      <Avatar>
                        <AvatarImage src={driver.avatar || undefined} />
                        <AvatarFallback>{driver.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{driver.name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          {driver.rating.toFixed(1)}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary">{driver.rides} rides</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              Popular Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topRoutes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topRoutes.map((route, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                      <p className="text-sm font-medium">{route.route}</p>
                    </div>
                    <Badge>{route.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
