"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Star, Search, TrendingUp, TrendingDown, AlertTriangle, Loader2, Car, Phone, MapPin, Calendar, CheckCircle2, XCircle, Clock, Award, Zap, Target, Activity, Trophy, Medal, Crown, Download, Trash2, X } from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDate } from "@/lib/utils"
import { PermissionGate } from "@/components/permission-gate"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

// Circular Progress Component
const CircularProgress = ({ value, size = 120, strokeWidth = 10, color = "yellow" }: { value: number, size?: number, strokeWidth?: number, color?: string }) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  const colorMap: Record<string, string> = {
    yellow: "#facc15",
    green: "#22c55e",
    red: "#ef4444",
    blue: "#3b82f6",
    purple: "#a855f7"
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colorMap[color] || color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
    </div>
  )
}

interface DriverRating {
  id: string
  driver_id: string
  full_name: string
  avatar_url: string | null
  phone: string | null
  total_ratings: number
  avg_rating: number
  five_star: number
  one_star: number
  recent_trend: "up" | "down" | "stable"
}

interface RecentReview {
  id: string
  rating: number
  comment: string | null
  created_at: string
  customer_name: string
  customer_avatar: string | null
  driver_name: string
  driver_id: string
}

interface LeaderboardDriver {
  id: string
  driver_id: string
  full_name: string
  avatar_url: string | null
  rating: number
  review_count: number
  completion_rate: number
  this_month_reviews: number
}

interface DriverDetails {
  id: string
  profile_id: string
  full_name: string
  phone: string | null
  email: string | null
  avatar_url: string | null
  rating: number
  total_trips: number
  license_number: string | null
  license_expiry: string | null
  vehicle_plate: string | null
  vehicle_model: string | null
  is_online: boolean
  is_on_break: boolean
  break_type: string | null
  created_at: string
  reviews: RecentReview[]
  // KPIs
  completed_rides: number
  cancelled_rides: number
  acceptance_rate: number
  completion_rate: number
  cancellation_rate: number
  avg_response_time: number | null
  this_week_rides: number
  this_month_rides: number
  // Additional KPIs
  last_ride_date: string | null
  avg_rating_last_10: number | null
  peak_hours_active: string | null
  avg_rides_per_day: number
  total_distance_km: number
  avg_trip_duration_min: number
  busiest_day: string | null
  active_days_this_month: number
  streak_days: number
  on_time_rate: number
}

export default function RatingsPage() {
  const supabase = createClient()
  const [drivers, setDrivers] = useState<DriverRating[]>([])
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "low" | "high">("all")
  const [selectedDriver, setSelectedDriver] = useState<DriverDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [allRatingsData, setAllRatingsData] = useState<{id: string, to_user_id: string}[]>([])

  useEffect(() => {
    loadData()

    // Real-time subscription for ratings and drivers
    const channel = supabase
      .channel('ratings_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    const [driversRes, ratingsRes, ridesRes] = await Promise.all([
      // Get drivers with their profile info
      supabase.from("drivers").select(`
        id,
        profile_id,
        rating,
        total_trips,
        profile:profiles!drivers_profile_id_fkey(id, full_name, avatar_url, phone, status)
      `).not("profile", "is", null),
      supabase.from("ratings").select(`
        *,
        from_user:profiles!ratings_from_user_id_fkey(full_name, avatar_url),
        to_user:profiles!ratings_to_user_id_fkey(id, full_name, avatar_url, role)
      `).order("created_at", { ascending: false }).limit(100),
      // Get all rides for leaderboard calculation
      supabase.from("rides").select("id, driver_id, status, created_at")
    ])

    const allDrivers = (driversRes.data || []).filter(d => {
      const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
      return profile?.status === "approved"
    })
    const allRatings = ratingsRes.data || []

    // Filter ratings to only those given TO drivers (from customers)
    const driverRatings = allRatings.filter(r => r.to_user?.role === "driver")

    // Store ratings data for bulk delete
    setAllRatingsData(driverRatings.map(r => ({ id: r.id, to_user_id: r.to_user_id })))

    // Calculate per-driver stats
    const driverStats: DriverRating[] = allDrivers.map(driver => {
      const driverReviews = driverRatings.filter(r => r.to_user_id === driver.profile_id)
      const reviewCount = driverReviews.length
      // Use rating from drivers table if no reviews, otherwise calculate from reviews
      const avgFromReviews = reviewCount > 0 ? driverReviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount : 0
      const avg = reviewCount > 0 ? avgFromReviews : (parseFloat(driver.rating) || 0)
      const fiveStar = driverReviews.filter(r => r.rating === 5).length
      const oneStar = driverReviews.filter(r => r.rating <= 2).length

      // Recent trend (last 5 vs previous 5)
      const sorted = [...driverReviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const recent5 = sorted.slice(0, 5)
      const prev5 = sorted.slice(5, 10)
      const recentAvg = recent5.length > 0 ? recent5.reduce((a, r) => a + r.rating, 0) / recent5.length : 0
      const prevAvg = prev5.length > 0 ? prev5.reduce((a, r) => a + r.rating, 0) / prev5.length : recentAvg

      let trend: "up" | "down" | "stable" = "stable"
      if (recentAvg > prevAvg + 0.3) trend = "up"
      else if (recentAvg < prevAvg - 0.3) trend = "down"

      const profile = Array.isArray(driver.profile) ? driver.profile[0] : driver.profile
      return {
        id: driver.id,
        driver_id: driver.profile_id,
        full_name: profile?.full_name || "Unknown",
        avatar_url: profile?.avatar_url,
        phone: profile?.phone,
        total_ratings: reviewCount,
        avg_rating: Math.round(avg * 10) / 10,
        five_star: fiveStar,
        one_star: oneStar,
        recent_trend: trend
      }
    })

    // Sort by avg rating descending
    driverStats.sort((a, b) => b.avg_rating - a.avg_rating)
    setDrivers(driverStats)

    // Recent reviews for drivers
    const recent = driverRatings.slice(0, 20).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      customer_name: r.from_user?.full_name || "Customer",
      customer_avatar: r.from_user?.avatar_url,
      driver_name: r.to_user?.full_name || "Driver",
      driver_id: r.to_user_id
    }))
    setRecentReviews(recent)

    // Calculate leaderboard
    const allRides = ridesRes.data || []
    const now = new Date()
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const leaderboardData: LeaderboardDriver[] = allDrivers.map(driver => {
      const driverRides = allRides.filter(r => r.driver_id === driver.id)
      const completedRides = driverRides.filter(r => r.status === 'completed').length
      const totalRides = driverRides.length
      const completionRate = totalRides > 0 ? (completedRides / totalRides) * 100 : 0

      // Count reviews (ratings) for this driver
      const driverReviews = allRatings.filter(r => r.to_user_id === driver.profile_id)
      const reviewCount = driverReviews.length
      const thisMonthReviews = driverReviews.filter(r =>
        new Date(r.created_at) >= monthAgo
      ).length

      const profile = Array.isArray(driver.profile) ? driver.profile[0] : driver.profile
      return {
        id: driver.id,
        driver_id: driver.profile_id,
        full_name: profile?.full_name || "Unknown",
        avatar_url: profile?.avatar_url,
        rating: parseFloat(driver.rating) || 0,
        review_count: reviewCount,
        completion_rate: Math.round(completionRate),
        this_month_reviews: thisMonthReviews
      }
    })

    // Sort by: rating first, then review count, then completion rate
    leaderboardData.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating
      if (b.review_count !== a.review_count) return b.review_count - a.review_count
      return b.completion_rate - a.completion_rate
    })

    setLeaderboard(leaderboardData.slice(0, 5)) // Top 5 drivers

    setLoading(false)
  }

  const loadDriverDetails = async (driverId: string, profileId: string) => {
    setLoadingDetails(true)
    try {
      const [driverRes, reviewsRes, allRidesRes] = await Promise.all([
        supabase.from("drivers").select(`
          *,
          profile:profiles!drivers_profile_id_fkey(full_name, phone, email, avatar_url, created_at),
          vehicle:vehicle_types(plate_no, display_name)
        `).eq("id", driverId).single(),
        supabase.from("ratings").select(`
          *,
          from_user:profiles!ratings_from_user_id_fkey(full_name, avatar_url)
        `).eq("to_user_id", profileId).order("created_at", { ascending: false }).limit(10),
        supabase.from("rides").select("id, status, created_at, accepted_at, completed_at, distance_km, duration_minutes").eq("driver_id", driverId).order("created_at", { ascending: false })
      ])

      if (driverRes.data) {
        const d = driverRes.data
        const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
        const vehicle = Array.isArray(d.vehicle) ? d.vehicle[0] : d.vehicle
        const allRides = allRidesRes.data || []

        // Calculate KPIs
        const completedRides = allRides.filter(r => r.status === 'completed').length
        const cancelledRides = allRides.filter(r => r.status === 'cancelled').length
        const totalRides = allRides.length

        const completionRate = totalRides > 0 ? (completedRides / totalRides) * 100 : 0
        const cancellationRate = totalRides > 0 ? (cancelledRides / totalRides) * 100 : 0
        const acceptanceRate = totalRides > 0 ? 100 : 0

        // This week and month rides
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const thisWeekRides = allRides.filter(r =>
          r.status === 'completed' && new Date(r.created_at) >= weekAgo
        ).length
        const thisMonthRides = allRides.filter(r =>
          r.status === 'completed' && new Date(r.created_at) >= monthAgo
        ).length

        // Last ride date
        const lastCompletedRide = allRides.find(r => r.status === 'completed')
        const lastRideDate = lastCompletedRide?.completed_at || lastCompletedRide?.created_at || null

        // Avg rating from last 10 reviews
        const reviewRatings = (reviewsRes.data || []).map(r => r.rating)
        const avgRatingLast10 = reviewRatings.length > 0
          ? reviewRatings.reduce((a, b) => a + b, 0) / reviewRatings.length
          : null

        // Calculate additional KPIs
        const completedRidesList = allRides.filter(r => r.status === 'completed')

        // Total distance
        const totalDistanceKm = completedRidesList.reduce((sum, r) => sum + (r.distance_km || 0), 0)

        // Average trip duration
        const durations = completedRidesList.filter(r => r.duration_minutes).map(r => r.duration_minutes)
        const avgTripDurationMin = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

        // Active days this month
        const monthRideDates = completedRidesList
          .filter(r => new Date(r.created_at) >= monthAgo)
          .map(r => new Date(r.created_at).toDateString())
        const activeDaysThisMonth = new Set(monthRideDates).size

        // Average rides per day (last 30 days)
        const avgRidesPerDay = activeDaysThisMonth > 0 ? Math.round((thisMonthRides / activeDaysThisMonth) * 10) / 10 : 0

        // Busiest day of the week
        const dayCount: Record<string, number> = {}
        completedRidesList.forEach(r => {
          const day = new Date(r.created_at).toLocaleDateString('en-US', { timeZone: 'Indian/Maldives', weekday: 'long' })
          dayCount[day] = (dayCount[day] || 0) + 1
        })
        const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null

        // Streak days (consecutive days with rides)
        let streakDays = 0
        if (completedRidesList.length > 0) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          let checkDate = new Date(today)
          while (true) {
            const dateStr = checkDate.toDateString()
            if (monthRideDates.includes(dateStr)) {
              streakDays++
              checkDate.setDate(checkDate.getDate() - 1)
            } else {
              break
            }
          }
        }

        // On-time rate (completed vs total assigned, excluding cancelled by customer)
        const onTimeRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 100

        const driverReviews = (reviewsRes.data || []).map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
          customer_name: r.from_user?.full_name || "Customer",
          customer_avatar: r.from_user?.avatar_url,
          driver_name: profile?.full_name || "Driver",
          driver_id: profileId
        }))

        setSelectedDriver({
          id: d.id,
          profile_id: d.profile_id,
          full_name: profile?.full_name || "Unknown",
          phone: profile?.phone,
          email: profile?.email,
          avatar_url: profile?.avatar_url,
          rating: parseFloat(d.rating) || 0,
          total_trips: completedRides,
          license_number: d.license_number,
          license_expiry: d.license_expiry,
          vehicle_plate: vehicle?.plate_no,
          vehicle_model: vehicle?.display_name,
          is_online: d.is_online,
          is_on_break: d.is_on_break || false,
          break_type: d.break_type,
          created_at: profile?.created_at,
          reviews: driverReviews,
          completed_rides: completedRides,
          cancelled_rides: cancelledRides,
          acceptance_rate: Math.round(acceptanceRate),
          completion_rate: Math.round(completionRate),
          cancellation_rate: Math.round(cancellationRate),
          avg_response_time: null,
          this_week_rides: thisWeekRides,
          this_month_rides: thisMonthRides,
          last_ride_date: lastRideDate,
          avg_rating_last_10: avgRatingLast10,
          peak_hours_active: null,
          avg_rides_per_day: avgRidesPerDay,
          total_distance_km: Math.round(totalDistanceKm * 10) / 10,
          avg_trip_duration_min: avgTripDurationMin,
          busiest_day: busiestDay,
          active_days_this_month: activeDaysThisMonth,
          streak_days: streakDays,
          on_time_rate: onTimeRate
        })
      }
    } catch (e) {
      console.error("Error loading driver details:", e)
    }
    setLoadingDetails(false)
  }

  const totalReviews = drivers.reduce((acc, d) => acc + d.total_ratings, 0)
  const driversWithRating = drivers.filter(d => d.avg_rating > 0)
  const overallAvg = driversWithRating.length > 0
    ? (driversWithRating.reduce((acc, d) => acc + d.avg_rating, 0) / driversWithRating.length).toFixed(1)
    : "0.0"
  const lowRatedDrivers = drivers.filter(d => d.avg_rating > 0 && d.avg_rating < 3).length
  const topDrivers = drivers.filter(d => d.avg_rating >= 4.5).length

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.full_name.toLowerCase().includes(search.toLowerCase())
    if (filter === "low") return matchesSearch && d.avg_rating > 0 && d.avg_rating < 3
    if (filter === "high") return matchesSearch && d.avg_rating >= 4.5
    return matchesSearch
  })

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("ratings")
      .delete()
      .in("id", idsToDelete)

    if (error) {
      toast.error("Failed to delete selected ratings")
    } else {
      toast.success(`${idsToDelete.length} rating(s) deleted`)
      setSelectedIds(new Set())
      loadData()
    }
  }

  const toggleSelectAll = () => {
    // Select all recent reviews that are displayed
    if (selectedIds.size === recentReviews.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(recentReviews.map(r => r.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const exportCSV = () => {
    const headers = ["Driver", "Phone", "Avg Rating", "Total Ratings", "5 Star Count", "1 Star Count", "Trend"]
    const rows = filteredDrivers.map(d => [
      d.full_name,
      d.phone || "",
      d.avg_rating.toFixed(1),
      d.total_ratings,
      d.five_star,
      d.one_star,
      d.recent_trend
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `driver_ratings_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-40 h-9 bg-muted rounded animate-pulse" />
          <div className="w-72 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} />
      </div>
    )
  }

  return (
    <PermissionGate permission="ratings:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Driver Ratings
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor driver performance and customer feedback
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{totalReviews}</p>
              <p className="text-xs text-muted-foreground truncate">Total Reviews</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{overallAvg}</p>
              <p className="text-xs text-muted-foreground truncate">Average Rating</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Trophy className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{topDrivers}</p>
              <p className="text-xs text-muted-foreground truncate">Top Drivers</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">4.5+</span>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 ${lowRatedDrivers > 0 ? 'ring-2 ring-red-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{lowRatedDrivers}</p>
              <p className="text-xs text-muted-foreground truncate">Low Rated (&lt;3)</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Driver Performance
            </CardTitle>
            <CardDescription>Rating summary for all drivers. Select ratings from recent reviews below to delete.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search driver..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
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
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDrivers.map((driver) => (
                    <TableRow
                      key={driver.id}
                      className="group cursor-pointer hover:bg-muted/50"
                      onClick={() => loadDriverDetails(driver.id, driver.driver_id)}
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
                        {driver.avg_rating > 0 ? (
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            loadDriverDetails(driver.id, driver.driver_id)
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Recent Reviews with Selection - moved below table */}
            {recentReviews.length > 0 && (
              <div className="mt-6 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Recent Reviews</h4>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground">({selectedIds.size} selected)</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setSelectedIds(new Set())}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setBulkDeleteOpen(true)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Checkbox
                      checked={recentReviews.length > 0 && selectedIds.size === recentReviews.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {recentReviews.slice(0, 10).map(review => (
                    <div key={review.id} className={`group flex items-center gap-2 p-2 rounded border text-sm transition-colors hover:bg-muted/50 ${selectedIds.has(review.id) ? 'bg-muted border-primary' : 'bg-background'}`}>
                      <Checkbox
                        checked={selectedIds.has(review.id)}
                        onCheckedChange={() => toggleSelect(review.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate">{review.customer_name}</span>
                        <span className="text-muted-foreground mx-1">rated</span>
                        <span className="font-medium truncate">{review.driver_name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`h-3 w-3 ${s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const { error } = await supabase.from("ratings").delete().eq("id", review.id)
                          if (error) {
                            toast.error("Failed to delete rating")
                          } else {
                            toast.success("Rating deleted")
                            loadData()
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/5 via-orange-500/5 to-red-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Leaderboard</CardTitle>
                <CardDescription>Top performers</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No drivers yet</p>
              ) : (
                leaderboard.map((driver, index) => (
                  <div
                    key={driver.id}
                    className={`relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:scale-[1.02] ${
                      index === 0
                        ? "bg-gradient-to-r from-yellow-500/20 to-yellow-500/5 border border-yellow-500/30"
                        : index === 1
                        ? "bg-gradient-to-r from-gray-400/20 to-gray-400/5 border border-gray-400/30"
                        : index === 2
                        ? "bg-gradient-to-r from-orange-700/20 to-orange-700/5 border border-orange-700/30"
                        : "bg-muted/30 border border-transparent"
                    }`}
                    onClick={() => loadDriverDetails(driver.id, driver.driver_id)}
                  >
                    {/* Rank Badge */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      index === 0
                        ? "bg-gradient-to-br from-yellow-400 to-yellow-600"
                        : index === 1
                        ? "bg-gradient-to-br from-gray-300 to-gray-500"
                        : index === 2
                        ? "bg-gradient-to-br from-orange-600 to-orange-800"
                        : "bg-muted"
                    }`}>
                      {index === 0 ? (
                        <Crown className="h-4 w-4 text-white" />
                      ) : index === 1 || index === 2 ? (
                        <Medal className="h-4 w-4 text-white" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={driver.avatar_url || undefined} />
                      <AvatarFallback className={`${
                        index === 0 ? "bg-yellow-500/20 text-yellow-600" :
                        index === 1 ? "bg-gray-500/20 text-gray-600" :
                        index === 2 ? "bg-orange-500/20 text-orange-600" :
                        "bg-muted"
                      }`}>
                        {driver.full_name[0]}
                      </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{driver.full_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {driver.review_count} reviews
                        </span>
                        <span>•</span>
                        <span>{driver.completion_rate}% rate</span>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold">{driver.rating.toFixed(1)}</span>
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      </div>
                      {driver.this_month_reviews > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {driver.this_month_reviews} this month
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* View All Link */}
            {leaderboard.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-center text-muted-foreground">
                  Click any driver in the table to view full performance details
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Rating(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected rating(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clean Modern Driver Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={() => setSelectedDriver(null)}>
        <DialogContent className="max-w-xl p-6">
          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedDriver && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedDriver.avatar_url || undefined} />
                  <AvatarFallback className="text-xl font-semibold bg-primary/10">
                    {selectedDriver.full_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{selectedDriver.full_name}</h2>
                    <span className={`w-2 h-2 rounded-full ${selectedDriver.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedDriver.phone}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-2xl font-bold">{selectedDriver.rating.toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedDriver.total_trips} trips</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{selectedDriver.completed_rides + selectedDriver.cancelled_rides}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-green-600">{selectedDriver.completed_rides}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-red-500">{selectedDriver.cancelled_rides}</p>
                  <p className="text-xs text-muted-foreground">Cancelled</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{selectedDriver.reviews.length}</p>
                  <p className="text-xs text-muted-foreground">Reviews</p>
                </div>
              </div>

              {/* Performance */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Completion Rate</span>
                  <span className="text-sm font-medium text-green-600">{selectedDriver.completion_rate}%</span>
                </div>
                <Progress value={selectedDriver.completion_rate} className="h-2" />

                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm">Cancellation Rate</span>
                  <span className="text-sm font-medium text-red-500">{selectedDriver.cancellation_rate}%</span>
                </div>
                <Progress value={selectedDriver.cancellation_rate} className="h-2" />
              </div>

              {/* Activity KPIs */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.this_week_rides}</p>
                  <p className="text-[10px] text-muted-foreground">This Week</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.this_month_rides}</p>
                  <p className="text-[10px] text-muted-foreground">This Month</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.avg_rides_per_day}</p>
                  <p className="text-[10px] text-muted-foreground">Avg/Day</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.active_days_this_month}</p>
                  <p className="text-[10px] text-muted-foreground">Active Days</p>
                </div>
              </div>

              {/* Additional KPIs */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.total_distance_km}</p>
                  <p className="text-[10px] text-muted-foreground">Total KM</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.avg_trip_duration_min}</p>
                  <p className="text-[10px] text-muted-foreground">Avg Min/Trip</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold text-blue-500">{selectedDriver.streak_days}</p>
                  <p className="text-[10px] text-muted-foreground">Day Streak</p>
                </div>
                <div className="p-2.5 border rounded-lg text-center">
                  <p className="text-lg font-semibold">{selectedDriver.on_time_rate}%</p>
                  <p className="text-[10px] text-muted-foreground">On-Time</p>
                </div>
              </div>

              {/* Busiest Day */}
              {selectedDriver.busiest_day && (
                <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Busiest Day</span>
                  <span className="text-sm font-medium">{selectedDriver.busiest_day}</span>
                </div>
              )}

              {/* Status */}
              <div className="flex gap-2 pt-2">
                <Badge variant={selectedDriver.is_online ? "default" : "secondary"} className="text-xs">
                  {selectedDriver.is_online ? "Online" : "Offline"}
                </Badge>
                {selectedDriver.is_on_break && (
                  <Badge variant="outline" className="text-xs text-orange-500 border-orange-500">
                    On Break {selectedDriver.break_type ? `(${selectedDriver.break_type})` : ""}
                  </Badge>
                )}
                {selectedDriver.last_ride_date && (
                  <Badge variant="outline" className="text-xs">
                    Last ride: {formatDate(selectedDriver.last_ride_date)}
                  </Badge>
                )}
              </div>


              {/* Reviews */}
              {selectedDriver.reviews.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-3">Recent Reviews</p>
                  <div className="space-y-3 max-h-40 overflow-auto">
                    {selectedDriver.reviews.map((review) => (
                      <div key={review.id} className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{review.customer_name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{review.customer_name}</span>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star key={s} className={`h-3 w-3 ${s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`} />
                              ))}
                            </div>
                          </div>
                          {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
