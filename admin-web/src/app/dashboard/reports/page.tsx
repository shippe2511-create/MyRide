"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Download, FileSpreadsheet, FileText, Loader2, Calendar } from "lucide-react"
import { toast } from "sonner"

const reportTypes = [
  { id: "rides", name: "Rides Report", description: "All ride data with customer and driver info", icon: FileSpreadsheet },
  { id: "customers", name: "Customers Report", description: "Customer profiles and activity", icon: FileSpreadsheet },
  { id: "drivers", name: "Drivers Report", description: "Driver profiles, ratings, and trips", icon: FileSpreadsheet },
  { id: "ratings", name: "Ratings Report", description: "All ratings and feedback", icon: FileSpreadsheet },
  { id: "usage", name: "Usage Statistics", description: "Daily/weekly/monthly usage stats", icon: FileText },
]

export default function ReportsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Get date filter range
  const getDateFilter = () => {
    const now = new Date()
    if (dateRange === "custom" && startDate && endDate) {
      return { start: startDate, end: endDate }
    }
    switch (dateRange) {
      case "today":
        const today = now.toISOString().split("T")[0]
        return { start: today, end: today }
      case "week":
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        return { start: weekAgo, end: now.toISOString().split("T")[0] }
      case "month":
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().split("T")[0]
        return { start: monthAgo, end: now.toISOString().split("T")[0] }
      case "year":
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split("T")[0]
        return { start: yearAgo, end: now.toISOString().split("T")[0] }
      default:
        return null
    }
  }

  const generateReport = async (reportType: string) => {
    setLoading(reportType)
    const dateFilter = getDateFilter()

    try {
      let data: Record<string, unknown>[] = []
      let filename = ""

      switch (reportType) {
        case "rides": {
          let query = supabase
            .from("rides")
            .select(`
              id, pickup_name, dropoff_name, status, distance_km, duration_minutes, created_at, completed_at,
              customer:profiles!rides_customer_id_fkey(full_name, phone)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          data = rides || []
          filename = "rides_report.csv"
          break
        }
        case "customers": {
          let query = supabase
            .from("profiles")
            .select("*")
            .eq("role", "customer")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: customers } = await query
          data = customers || []
          filename = "customers_report.csv"
          break
        }
        case "drivers": {
          let query = supabase
            .from("profiles")
            .select(`
              *,
              driver:drivers(rating, total_trips, is_online)
            `)
            .eq("role", "driver")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: drivers } = await query
          data = drivers || []
          filename = "drivers_report.csv"
          break
        }
        case "ratings": {
          let query = supabase
            .from("ratings")
            .select(`
              *,
              from_user:profiles!ratings_from_user_id_fkey(full_name),
              to_user:profiles!ratings_to_user_id_fkey(full_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: ratings } = await query
          data = ratings || []
          filename = "ratings_report.csv"
          break
        }
        case "usage": {
          let query = supabase
            .from("rides")
            .select("created_at, status")
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query

          const grouped = (rides || []).reduce((acc: Record<string, { total: number; completed: number }>, ride) => {
            const date = new Date(ride.created_at).toISOString().split("T")[0]
            if (!acc[date]) acc[date] = { total: 0, completed: 0 }
            acc[date].total++
            if (ride.status === "completed") acc[date].completed++
            return acc
          }, {})

          data = Object.entries(grouped).map(([date, stats]) => ({
            date,
            total_rides: stats.total,
            completed_rides: stats.completed,
            completion_rate: ((stats.completed / stats.total) * 100).toFixed(1) + "%"
          }))
          filename = "usage_report.csv"
          break
        }
      }

      if (data.length === 0) {
        toast.error("No data to export")
        setLoading(null)
        return
      }

      const headers = Object.keys(flattenObject(data[0]))
      const rows = data.map(row => {
        const flat = flattenObject(row)
        return headers.map(h => {
          const val = flat[h]
          if (val === null || val === undefined) return ""
          if (typeof val === "string" && val.includes(",")) return `"${val}"`
          return String(val)
        }).join(",")
      })

      const csv = [headers.join(","), ...rows].join("\n")
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`${filename} downloaded`)
    } catch (error) {
      toast.error("Failed to generate report")
      console.error(error)
    }

    setLoading(null)
  }

  const flattenObject = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const key in obj) {
      const value = obj[key]
      const newKey = prefix ? `${prefix}_${key}` : key
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value as Record<string, unknown>, newKey))
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
        Object.assign(result, flattenObject(value[0] as Record<string, unknown>, newKey))
      } else {
        result[newKey] = value
      }
    }
    return result
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">
          Generate and export reports in CSV format
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
          <CardDescription>Filter reports by date (optional)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateRange === "custom" && (
              <>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <report.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{report.name}</CardTitle>
                  <CardDescription className="text-xs">{report.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => generateReport(report.id)}
                disabled={loading !== null}
              >
                {loading === report.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            Report exports are generated on-demand and downloaded directly.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
