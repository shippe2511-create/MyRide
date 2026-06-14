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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, Search, TrendingUp, TrendingDown, AlertTriangle, Loader2, Car } from "lucide-react"
import { formatDate } from "@/lib/utils"

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

export default function RatingsPage() {
  const supabase = createClient()
  const [drivers, setDrivers] = useState<DriverRating[]>([])
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "low" | "high">("all")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [driversRes, ratingsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "driver").eq("status", "approved"),
      supabase.from("ratings").select(`
        *,
        from_user:profiles!ratings_from_user_id_fkey(full_name, avatar_url),
        to_user:profiles!ratings_to_user_id_fkey(id, full_name, avatar_url, role)
      `).order("created_at", { ascending: false }).limit(100)
    ])

    const allDrivers = driversRes.data || []
    const allRatings = ratingsRes.data || []

    // Filter ratings to only those given TO drivers (from customers)
    const driverRatings = allRatings.filter(r => r.to_user?.role === "driver")

    // Calculate per-driver stats
    const driverStats: DriverRating[] = allDrivers.map(driver => {
      const driverReviews = driverRatings.filter(r => r.to_user_id === driver.id)
      const total = driverReviews.length
      const avg = total > 0 ? driverReviews.reduce((acc, r) => acc + r.rating, 0) / total : 0
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

      return {
        id: driver.id,
        driver_id: driver.id,
        full_name: driver.full_name || "Unknown",
        avatar_url: driver.avatar_url,
        phone: driver.phone,
        total_ratings: total,
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

    setLoading(false)
  }

  const totalReviews = drivers.reduce((acc, d) => acc + d.total_ratings, 0)
  const overallAvg = drivers.length > 0 && totalReviews > 0
    ? (drivers.reduce((acc, d) => acc + d.avg_rating * d.total_ratings, 0) / totalReviews).toFixed(1)
    : "0.0"
  const lowRatedDrivers = drivers.filter(d => d.avg_rating > 0 && d.avg_rating < 3).length
  const topDrivers = drivers.filter(d => d.avg_rating >= 4.5 && d.total_ratings >= 5).length

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.full_name.toLowerCase().includes(search.toLowerCase())
    if (filter === "low") return matchesSearch && d.avg_rating > 0 && d.avg_rating < 3
    if (filter === "high") return matchesSearch && d.avg_rating >= 4.5
    return matchesSearch
  })

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
        <h1 className="text-3xl font-bold">Driver Ratings</h1>
        <p className="text-muted-foreground">
          Monitor driver performance and customer feedback
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalReviews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold">{overallAvg}</div>
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Drivers (4.5+)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{topDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Low Rated (&lt;3)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{lowRatedDrivers}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Driver Performance
            </CardTitle>
            <CardDescription>Rating summary for all drivers</CardDescription>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No drivers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDrivers.map((driver) => (
                    <TableRow key={driver.id}>
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

        <Card>
          <CardHeader>
            <CardTitle>Recent Reviews</CardTitle>
            <CardDescription>Latest customer feedback</CardDescription>
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
      </div>
    </div>
  )
}
