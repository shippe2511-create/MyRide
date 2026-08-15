"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import {
  MapPin, Clock, Star,
  Calendar, Activity, Target, Award, Zap, Users, Car, TrendingUp, AlertTriangle, Repeat, BarChart3
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
    avgRating: 0,
    totalRatings: 0,
    onlineDrivers: 0,
    totalVehicles: 0,
    sosAlerts: 0,
    avgRidesPerDay: 0,
    repeatCustomers: 0,
    totalDriverTrips: 0,
  })

  const [dailyData, setDailyData] = useState<{ date: string; rides: number; completed: number; cancelled: number }[]>([])
  const [hourlyHeatmap, setHourlyHeatmap] = useState<{ day: string; hour: number; value: number }[]>([])
  const [topDrivers, setTopDrivers] = useState<{ name: string; avatar: string | null; rides: number; rating: number }[]>([])
  const [topRoutes, setTopRoutes] = useState<{ route: string; count: number }[]>([])
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number; color: string }[]>([])

  useEffect(() => {
    loadAnalytics()

    const channel = supabase.channel('analytics_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => loadAnalytics(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadAnalytics(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadAnalytics(false))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [period])

  const loadAnalytics = async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const daysAgo = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    const prevStartDate = new Date(startDate)
    prevStartDate.setDate(prevStartDate.getDate() - daysAgo)

    const [ridesRes, prevRidesRes, driversRes, customersRes, prevCustomersRes, ratingsRes, onlineDriversRes, vehiclesRes, sosRes] = await Promise.all([
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
        .select("id, rating, total_trips, profile:profiles(full_name, avatar_url)"),
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
      supabase
        .from("ratings")
        .select("rating")
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("is_online", true),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("sos_alerts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate.toISOString()),
    ])

    const allRides = (ridesRes.data || []) as Ride[]
    const allDrivers = (driversRes.data || []) as Driver[]
    setRides(allRides)
    setDrivers(allDrivers)

    const completed = allRides.filter(r => r.status === "completed")
    const cancelled = allRides.filter(r => r.status === "cancelled")
    const durations = completed.filter(r => r.duration_minutes).map(r => r.duration_minutes!)
    const distances = completed.filter(r => r.distance_km).map(r => r.distance_km!)

    const prevRidesCount = prevRidesRes.count || 0
    const ridesChange = prevRidesCount > 0 ? Math.round(((allRides.length - prevRidesCount) / prevRidesCount) * 100) : 0

    const prevCustomersCount = prevCustomersRes.count || 0
    const currentCustomersCount = customersRes.count || 0
    const customersChange = prevCustomersCount > 0 ? Math.round(((currentCustomersCount - prevCustomersCount) / prevCustomersCount) * 100) : 0

    const hourCounts: Record<number, number> = {}
    allRides.forEach(r => {
      const hour = new Date(r.created_at).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
    const peakHourStr = peakHour ? `${peakHour[0].padStart(2, "0")}:00` : "-"

    const dayCounts: Record<string, number> = {}
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    allRides.forEach(r => {
      const day = dayNames[new Date(r.created_at).getDay()]
      dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"

    const ratingsArr = ratingsRes.data || []
    const avgRating = ratingsArr.length > 0
      ? ratingsArr.reduce((sum, r: any) => sum + (r.rating || 0), 0) / ratingsArr.length
      : 0

    const customerRides: Record<string, number> = {}
    allRides.forEach(r => {
      if (r.customer_id) {
        customerRides[r.customer_id] = (customerRides[r.customer_id] || 0) + 1
      }
    })
    const repeatCustomers = Object.values(customerRides).filter(c => c > 1).length

    const totalDriverTrips = allDrivers.reduce((sum, d: any) => sum + (d.total_trips || 0), 0)

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
      avgRating: Math.round(avgRating * 10) / 10,
      totalRatings: ratingsArr.length,
      onlineDrivers: onlineDriversRes.count || 0,
      totalVehicles: vehiclesRes.count || 0,
      sosAlerts: sosRes.count || 0,
      avgRidesPerDay: daysAgo > 0 ? Math.round((allRides.length / daysAgo) * 10) / 10 : 0,
      repeatCustomers,
      totalDriverTrips,
    })

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
        date: (() => { const d = new Date(date); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` })(),
        ...data,
      }))
    setDailyData(daily)

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
        <div className="flex items-center justify-between">
          <div>
            <div className="w-32 h-8 bg-muted/50 rounded-lg animate-pulse" />
            <div className="w-64 h-4 bg-muted/50 rounded animate-pulse mt-2" />
          </div>
          <div className="w-36 h-10 bg-muted/50 rounded-lg animate-pulse" />
        </div>
        <div className="grid gap-4 grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 rounded-xl bg-card/50 animate-pulse border border-border/50" />
          ))}
        </div>
        <div className="grid gap-4 grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-20 rounded-xl bg-card/50 animate-pulse border border-border/50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <PermissionGate permission="reports:view">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform performance and insights</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 bg-card/80 border-border/50">
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

      {/* Top Insights Row - Colored gradient cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {/* Peak Hour */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 to-yellow-500/5 border border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/20">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-300">{stats.peakHour}</p>
              <p className="text-xs text-amber-400/70">Peak Hour</p>
            </div>
          </div>
        </div>

        {/* Busiest Day */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/15 to-cyan-500/5 border border-blue-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/20">
              <Calendar className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-300">{stats.busiestDay}</p>
              <p className="text-xs text-blue-400/70">Busiest Day</p>
            </div>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/15 to-green-500/5 border border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20">
              <Target className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-300">{stats.completionRate}%</p>
              <p className="text-xs text-emerald-400/70">Completion</p>
            </div>
          </div>
        </div>

        {/* Avg Duration */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/15 to-purple-500/5 border border-violet-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-500/20">
              <Clock className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-violet-300">{stats.avgDuration} min</p>
              <p className="text-xs text-violet-400/70">Avg Duration</p>
            </div>
          </div>
        </div>

        {/* Avg Distance */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/15 to-pink-500/5 border border-rose-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-500/20">
              <MapPin className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-300">{stats.avgDistance} km</p>
              <p className="text-xs text-rose-400/70">Avg Distance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {/* Total Rides */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalRides}</p>
              <p className="text-xs text-muted-foreground">Total Rides</p>
            </div>
          </div>
        </div>

        {/* New Customers */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalCustomers}</p>
              <p className="text-xs text-muted-foreground">New Customers</p>
            </div>
          </div>
        </div>

        {/* Avg Rating */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Star className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgRating || "—"}</p>
              <p className="text-xs text-muted-foreground">Avg Rating ({stats.totalRatings})</p>
            </div>
          </div>
        </div>

        {/* Rides/Day */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgRidesPerDay}</p>
              <p className="text-xs text-muted-foreground">Rides/Day</p>
            </div>
          </div>
        </div>

        {/* Repeat Customers */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-500/10">
              <Repeat className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.repeatCustomers}</p>
              <p className="text-xs text-muted-foreground">Repeat Customers</p>
            </div>
          </div>
        </div>

        {/* SOS Alerts */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-500/10">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.sosAlerts}</p>
              <p className="text-xs text-muted-foreground">SOS Alerts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fleet & Driver Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {/* Active Vehicles */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-500/10">
              <Car className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalVehicles}</p>
              <p className="text-xs text-muted-foreground">Active Vehicles</p>
            </div>
          </div>
        </div>

        {/* Online Now */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20">
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-300">{stats.onlineDrivers}</p>
              <p className="text-xs text-emerald-400/70">Online Now</p>
            </div>
          </div>
        </div>

        {/* Active Drivers */}
        <div className="p-4 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10">
              <Users className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeDrivers}</p>
              <p className="text-xs text-muted-foreground">Active Drivers</p>
            </div>
          </div>
        </div>

        {/* Total Driver Trips */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/10 to-pink-500/5 border border-rose-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-500/20">
              <Target className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-300">{stats.totalDriverTrips.toLocaleString()}</p>
              <p className="text-xs text-rose-400/70">Total Driver Trips</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ride Trends */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="mb-4">
            <h3 className="font-semibold text-lg">Ride Trends</h3>
            <p className="text-sm text-muted-foreground">Daily rides over time</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px" }} />
              <Legend />
              <Area type="monotone" dataKey="completed" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Completed" />
              <Area type="monotone" dataKey="cancelled" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Cancelled" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status Breakdown */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="mb-4">
            <h3 className="font-semibold text-lg">Status Breakdown</h3>
            <p className="text-sm text-muted-foreground">Ride status distribution</p>
          </div>
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
              <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap */}
      <div className="p-5 rounded-xl bg-card/80 border border-border/50">
        <div className="mb-4">
          <h3 className="font-semibold text-lg">Activity Heatmap</h3>
          <p className="text-sm text-muted-foreground">Ride demand by day and hour</p>
        </div>
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
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Drivers */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold text-lg">Top Performing Drivers</h3>
          </div>
          {topDrivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-3">
              {topDrivers.map((driver, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold w-6 ${i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                      #{i + 1}
                    </span>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={driver.avatar || undefined} />
                      <AvatarFallback className="text-sm">{driver.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{driver.name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        {driver.rating.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-muted">{driver.rides} rides</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Popular Routes */}
        <div className="p-5 rounded-xl bg-card/80 border border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-blue-400" />
            <h3 className="font-semibold text-lg">Popular Routes</h3>
          </div>
          {topRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-2">
              {topRoutes.map((route, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <p className="text-sm font-medium">{route.route}</p>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">{route.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </PermissionGate>
  )
}
