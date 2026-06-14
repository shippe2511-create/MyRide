"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { DriversTable } from "./drivers-table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Users, UserCheck, Clock, UserX, Star, Car, UserPlus, AlertTriangle, CheckCircle, Trophy, TrendingUp, TrendingDown, Search, Loader2, XCircle, X } from "lucide-react"

interface DriverPerformance {
  id: string
  full_name: string
  avatar_url: string | null
  phone: string | null
  email: string | null
  employee_id: string | null
  department: string | null
  total_ratings: number
  avg_rating: number
  five_star: number
  one_star: number
  recent_trend: "up" | "down" | "stable"
  total_rides: number
  completed_rides: number
  cancelled_rides: number
  completion_rate: number
  rides_this_week: number
  rides_this_month: number
}

interface RecentReview {
  id: string
  rating: number
  comment: string | null
  created_at: string
  customer_name: string
  driver_name: string
}

export default function DriversPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [drivers, setDrivers] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // KPI stats
  const [stats, setStats] = useState({
    totalDrivers: 0,
    activeDrivers: 0,
    pendingDrivers: 0,
    suspendedDrivers: 0,
    newThisMonth: 0,
    docsExpiring: 0,
    avgRating: "0.0",
    totalRides: 0,
    ridesThisWeek: 0,
    completionRate: 100,
    completedRides: 0,
    topPerformer: null as { full_name: string; avatar_url: string | null; avg: number } | null
  })

  // Performance tab state
  const [driverPerformance, setDriverPerformance] = useState<DriverPerformance[]>([])
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([])
  const [perfSearch, setPerfSearch] = useState("")
  const [perfFilter, setPerfFilter] = useState<"all" | "low" | "high">("all")
  const [selectedPerformance, setSelectedPerformance] = useState<DriverPerformance | null>(null)

  useEffect(() => {
    loadData()

    // Real-time subscription for live updates
    const channel = supabase
      .channel('drivers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentPage])

  const loadData = async () => {
    setLoading(true)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const next30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const start = (currentPage - 1) * pageSize
    const end = start + pageSize - 1

    const [
      driversRes, driverRecordsRes, totalRes, activeRes, pendingRes, suspendedRes,
      newThisMonthRes, ratingsRes, ridesRes, ridesWeekRes,
      completedRidesRes, cancelledRidesRes, docsExpiringRes, allDriversRes, allRidesRes
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact" }).eq("role", "driver").order("created_at", { ascending: false }).range(start, end),
      supabase.from("drivers").select("id, profile_id, vehicle_id, vehicle:vehicle_types(id, display_name, plate_no)"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "approved"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "pending"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "suspended"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").gte("created_at", startOfMonth),
      supabase.from("ratings").select(`*, from_user:profiles!ratings_from_user_id_fkey(full_name), to_user:profiles!ratings_to_user_id_fkey(id, full_name, avatar_url, phone, email, employee_id, department, role)`).order("created_at", { ascending: false }),
      supabase.from("rides").select("*", { count: "exact", head: true }),
      supabase.from("rides").select("*", { count: "exact", head: true }).gte("created_at", startOfWeek),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").lte("license_expiry", next30Days).gte("license_expiry", new Date().toISOString()),
      supabase.from("profiles").select("*").eq("role", "driver").eq("status", "approved"),
      supabase.from("rides").select("driver_id, status, created_at")
    ])

    // Merge driver records with profiles
    const driverRecords = driverRecordsRes.data || []
    const driversWithVehicles = (driversRes.data || []).map(profile => {
      const driverRecord = driverRecords.find(d => d.profile_id === profile.id)
      return {
        ...profile,
        driver_record: driverRecord ? {
          id: driverRecord.id,
          vehicle_id: driverRecord.vehicle_id,
          vehicle: driverRecord.vehicle
        } : null
      }
    })
    setDrivers(driversWithVehicles)
    setTotalCount(driversRes.count || 0)

    const allRatings = ratingsRes.data || []
    const driverRatings = allRatings.filter(r => r.to_user?.role === "driver")

    // Calculate stats
    const completedRides = completedRidesRes.count || 0
    const cancelledRides = cancelledRidesRes.count || 0
    const totalFinishedRides = completedRides + cancelledRides
    const completionRate = totalFinishedRides > 0 ? Math.round((completedRides / totalFinishedRides) * 100) : 100

    const avgRating = driverRatings.length > 0
      ? (driverRatings.reduce((acc, r) => acc + r.rating, 0) / driverRatings.length).toFixed(1)
      : "0.0"

    // Calculate per-driver stats for performance tab
    const allDriversList = allDriversRes.data || []
    const driverStatsMap: Record<string, { total: number; count: number; fiveStar: number; oneStar: number; ratings: number[] }> = {}

    driverRatings.forEach(r => {
      const driverId = r.to_user?.id
      if (!driverId) return
      if (!driverStatsMap[driverId]) {
        driverStatsMap[driverId] = { total: 0, count: 0, fiveStar: 0, oneStar: 0, ratings: [] }
      }
      driverStatsMap[driverId].total += r.rating
      driverStatsMap[driverId].count += 1
      driverStatsMap[driverId].ratings.push(r.rating)
      if (r.rating === 5) driverStatsMap[driverId].fiveStar += 1
      if (r.rating <= 2) driverStatsMap[driverId].oneStar += 1
    })

    // Find top performer
    let topPerformer: { full_name: string; avatar_url: string | null; avg: number } | null = null
    let topAvg = 0
    Object.entries(driverStatsMap).forEach(([id, data]) => {
      if (data.count >= 3) {
        const avg = data.total / data.count
        if (avg > topAvg) {
          topAvg = avg
          const driver = allDriversList.find(d => d.id === id)
          if (driver) {
            topPerformer = { full_name: driver.full_name, avatar_url: driver.avatar_url, avg }
          }
        }
      }
    })

    // Build per-driver ride stats
    const allRides = allRidesRes.data || []
    const driverRideStats: Record<string, { total: number; completed: number; cancelled: number; thisWeek: number; thisMonth: number }> = {}

    allRides.forEach(ride => {
      if (!ride.driver_id) return
      if (!driverRideStats[ride.driver_id]) {
        driverRideStats[ride.driver_id] = { total: 0, completed: 0, cancelled: 0, thisWeek: 0, thisMonth: 0 }
      }
      driverRideStats[ride.driver_id].total += 1
      if (ride.status === "completed") driverRideStats[ride.driver_id].completed += 1
      if (ride.status === "cancelled") driverRideStats[ride.driver_id].cancelled += 1
      if (new Date(ride.created_at) >= new Date(startOfWeek)) driverRideStats[ride.driver_id].thisWeek += 1
      if (new Date(ride.created_at) >= new Date(startOfMonth)) driverRideStats[ride.driver_id].thisMonth += 1
    })

    // Build driver performance list
    const perfList: DriverPerformance[] = allDriversList.map(driver => {
      const dStats = driverStatsMap[driver.id] || { total: 0, count: 0, fiveStar: 0, oneStar: 0, ratings: [] }
      const rStats = driverRideStats[driver.id] || { total: 0, completed: 0, cancelled: 0, thisWeek: 0, thisMonth: 0 }
      const avg = dStats.count > 0 ? dStats.total / dStats.count : 0

      // Calculate trend
      const sorted = [...dStats.ratings]
      const recent5 = sorted.slice(0, 5)
      const prev5 = sorted.slice(5, 10)
      const recentAvg = recent5.length > 0 ? recent5.reduce((a, r) => a + r, 0) / recent5.length : 0
      const prevAvg = prev5.length > 0 ? prev5.reduce((a, r) => a + r, 0) / prev5.length : recentAvg

      let trend: "up" | "down" | "stable" = "stable"
      if (recentAvg > prevAvg + 0.3) trend = "up"
      else if (recentAvg < prevAvg - 0.3) trend = "down"

      const totalFinished = rStats.completed + rStats.cancelled
      const compRate = totalFinished > 0 ? Math.round((rStats.completed / totalFinished) * 100) : 100

      return {
        id: driver.id,
        full_name: driver.full_name || "Unknown",
        avatar_url: driver.avatar_url,
        phone: driver.phone,
        email: driver.email,
        employee_id: driver.employee_id,
        department: driver.department,
        total_ratings: dStats.count,
        avg_rating: Math.round(avg * 10) / 10,
        five_star: dStats.fiveStar,
        one_star: dStats.oneStar,
        recent_trend: trend,
        total_rides: rStats.total,
        completed_rides: rStats.completed,
        cancelled_rides: rStats.cancelled,
        completion_rate: compRate,
        rides_this_week: rStats.thisWeek,
        rides_this_month: rStats.thisMonth
      }
    }).sort((a, b) => b.avg_rating - a.avg_rating)

    setDriverPerformance(perfList)

    // Recent reviews
    const reviews = driverRatings.slice(0, 15).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      customer_name: r.from_user?.full_name || "Customer",
      driver_name: r.to_user?.full_name || "Driver"
    }))
    setRecentReviews(reviews)

    setStats({
      totalDrivers: totalRes.count || 0,
      activeDrivers: activeRes.count || 0,
      pendingDrivers: pendingRes.count || 0,
      suspendedDrivers: suspendedRes.count || 0,
      newThisMonth: newThisMonthRes.count || 0,
      docsExpiring: docsExpiringRes.count || 0,
      avgRating,
      totalRides: ridesRes.count || 0,
      ridesThisWeek: ridesWeekRes.count || 0,
      completionRate,
      completedRides,
      topPerformer
    })

    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const filteredPerformance = driverPerformance.filter(d => {
    const matchesSearch = d.full_name.toLowerCase().includes(perfSearch.toLowerCase())
    if (perfFilter === "low") return matchesSearch && d.avg_rating > 0 && d.avg_rating < 3
    if (perfFilter === "high") return matchesSearch && d.avg_rating >= 4.5
    return matchesSearch
  })

  const lowRatedDrivers = driverPerformance.filter(d => d.avg_rating > 0 && d.avg_rating < 3).length
  const topDrivers = driverPerformance.filter(d => d.avg_rating >= 4.5 && d.total_ratings >= 5).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Drivers</h1>
        <p className="text-muted-foreground">
          Manage driver accounts, documents, and performance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Drivers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.activeDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.pendingDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suspended</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.suspendedDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New This Month</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.newThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Docs Expiring</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.docsExpiring}</div>
            <p className="text-xs text-muted-foreground">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats.avgRating}</span>
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Rides</CardTitle>
            <Car className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRides}</div>
            <p className="text-xs text-muted-foreground">{stats.ridesThisWeek} this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completionRate}%</div>
            <p className="text-xs text-muted-foreground">{stats.completedRides} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Performer</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {stats.topPerformer ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={stats.topPerformer.avatar_url || undefined} />
                  <AvatarFallback>{stats.topPerformer.full_name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium truncate max-w-[100px]">{stats.topPerformer.full_name}</p>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs">{stats.topPerformer.avg.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Drivers</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <DriversTable
            drivers={drivers}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
          />
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Driver Performance Comparison
                </CardTitle>
                <CardDescription>
                  Compare ratings across all drivers • {topDrivers} top performers • {lowRatedDrivers} need attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search driver..."
                      value={perfSearch}
                      onChange={(e) => setPerfSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={perfFilter} onValueChange={(v) => setPerfFilter(v as typeof perfFilter)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Drivers</SelectItem>
                      <SelectItem value="high">Top Rated (4.5+)</SelectItem>
                      <SelectItem value="low">Low Rated (&lt;3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead className="text-center">Reviews</TableHead>
                      <TableHead className="text-center">5★</TableHead>
                      <TableHead className="text-center">≤2★</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPerformance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No drivers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPerformance.map((driver) => (
                        <TableRow
                          key={driver.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedPerformance(driver)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={driver.avatar_url || undefined} />
                                <AvatarFallback>{driver.full_name[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{driver.full_name}</p>
                                <p className="text-xs text-muted-foreground">{driver.phone || "No phone"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {driver.total_ratings > 0 ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="font-semibold">{driver.avg_rating}</span>
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{driver.total_ratings}</TableCell>
                          <TableCell className="text-center text-green-500">{driver.five_star}</TableCell>
                          <TableCell className="text-center text-red-500">{driver.one_star}</TableCell>
                          <TableCell className="text-center">
                            {driver.total_ratings >= 5 ? (
                              driver.recent_trend === "up" ? (
                                <TrendingUp className="h-4 w-4 text-green-500 mx-auto" />
                              ) : driver.recent_trend === "down" ? (
                                <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedPerformance ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Driver Performance</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPerformance(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={selectedPerformance.avatar_url || undefined} />
                      <AvatarFallback className="text-lg">{selectedPerformance.full_name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-lg font-semibold">{selectedPerformance.full_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="success">Active</Badge>
                        {selectedPerformance.department && <Badge variant="outline">{selectedPerformance.department}</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Email</span>
                      <span className="truncate ml-2">{selectedPerformance.email || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Phone</span>
                      <span>{selectedPerformance.phone || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Employee ID</span>
                      <span>{selectedPerformance.employee_id || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Department</span>
                      <span>{selectedPerformance.department || "-"}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4" />
                      Performance KPIs
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border rounded-lg p-2 text-center">
                        <Car className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                        <p className="text-xl font-bold">{selectedPerformance.total_rides}</p>
                        <p className="text-xs text-muted-foreground">Total Rides</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />
                        <p className="text-xl font-bold text-green-500">{selectedPerformance.completion_rate}%</p>
                        <p className="text-xs text-muted-foreground">Completion</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <Star className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
                        <p className="text-xl font-bold">{selectedPerformance.avg_rating || "-"}</p>
                        <p className="text-xs text-muted-foreground">Rating ({selectedPerformance.total_ratings})</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <Star className="h-4 w-4 mx-auto mb-1 text-green-500" />
                        <p className="text-xl font-bold text-green-500">{selectedPerformance.five_star}</p>
                        <p className="text-xs text-muted-foreground">5-Star</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <Car className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xl font-bold">{selectedPerformance.rides_this_week}</p>
                        <p className="text-xs text-muted-foreground">This Week</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <Car className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xl font-bold">{selectedPerformance.rides_this_month}</p>
                        <p className="text-xs text-muted-foreground">This Month</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />
                        <p className="text-xl font-bold">{selectedPerformance.completed_rides}</p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                      <div className="border rounded-lg p-2 text-center">
                        <XCircle className="h-4 w-4 mx-auto mb-1 text-red-500" />
                        <p className="text-xl font-bold text-red-500">{selectedPerformance.cancelled_rides}</p>
                        <p className="text-xs text-muted-foreground">Cancelled</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Reviews</CardTitle>
                  <CardDescription>Click a driver to see their KPIs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-[500px] overflow-auto">
                    {recentReviews.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">No reviews yet</p>
                    ) : (
                      recentReviews.map((review) => (
                        <div key={review.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-sm">{review.driver_name}</p>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-3 w-3 ${star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                                />
                              ))}
                            </div>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground mb-1 line-clamp-2">{review.comment}</p>
                          )}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>by {review.customer_name}</span>
                            <span>{formatDate(review.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
