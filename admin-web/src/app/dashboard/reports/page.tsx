"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Download, FileSpreadsheet, FileText, Loader2, Calendar, Users, Car, Star, BarChart3 } from "lucide-react"
import { toast } from "sonner"

const reportTypes = [
  { id: "rides", name: "Rides Report", description: "All rides with pickup, dropoff, and status", icon: Car },
  { id: "customers", name: "Customers Report", description: "Customer list with contact info", icon: Users },
  { id: "drivers", name: "Drivers Report", description: "Driver list with ratings and trips", icon: Car },
  { id: "ratings", name: "Ratings Report", description: "All ratings and feedback", icon: Star },
  { id: "usage", name: "Daily Usage", description: "Rides per day summary", icon: BarChart3 },
]

// Friendly column names mapping
const columnLabels: Record<string, Record<string, string>> = {
  rides: {
    "Ride ID": "id",
    "Pickup Location": "pickup_name",
    "Dropoff Location": "dropoff_name",
    "Status": "status",
    "Distance (km)": "distance_km",
    "Duration (mins)": "duration_minutes",
    "Customer Name": "customer_name",
    "Customer Phone": "customer_phone",
    "Date": "date",
    "Time": "time",
  },
  customers: {
    "Name": "full_name",
    "Employee ID": "employee_id",
    "Phone": "phone",
    "Email": "email",
    "Department": "department",
    "Gender": "gender",
    "Status": "status",
    "Joined Date": "joined_date",
  },
  drivers: {
    "Name": "full_name",
    "Employee ID": "employee_id",
    "Phone": "phone",
    "Email": "email",
    "Department": "department",
    "Gender": "gender",
    "Status": "status",
    "Rating": "rating",
    "Total Trips": "total_trips",
    "Online Status": "online_status",
    "Joined Date": "joined_date",
  },
  ratings: {
    "From": "from_name",
    "To": "to_name",
    "Rating": "rating",
    "Comment": "comment",
    "Date": "date",
  },
  usage: {
    "Date": "date",
    "Total Rides": "total_rides",
    "Completed": "completed_rides",
    "Cancelled": "cancelled_rides",
    "Completion Rate": "completion_rate",
  },
}

export default function ReportsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", {
      timeZone: "Indian/Maldives",
      year: "numeric",
      month: "short",
      day: "numeric"
    })
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    return d.toLocaleTimeString("en-US", {
      timeZone: "Indian/Maldives",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    })
  }

  const formatStatus = (status: string) => {
    if (!status) return ""
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  }

  const formatPhone = (phone: string | number | null) => {
    if (!phone) return ""
    const str = String(phone)
    if (str.length === 10) return `+960 ${str.slice(0, 3)} ${str.slice(3, 6)} ${str.slice(6)}`
    return str
  }

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
      let rows: Record<string, string>[] = []
      let filename = ""
      const labels = columnLabels[reportType]
      const headers = Object.keys(labels)

      switch (reportType) {
        case "rides": {
          let query = supabase
            .from("rides")
            .select(`
              id, pickup_name, dropoff_name, status, distance_km, duration_minutes, created_at,
              customer:profiles!rides_customer_id_fkey(full_name, phone)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query

          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            return {
              "Ride ID": String(r.id || "").slice(0, 8),
              "Pickup Location": String(r.pickup_name || ""),
              "Dropoff Location": String(r.dropoff_name || ""),
              "Status": formatStatus(String(r.status || "")),
              "Distance (km)": r.distance_km ? String(r.distance_km) : "-",
              "Duration (mins)": r.duration_minutes ? String(r.duration_minutes) : "-",
              "Customer Name": String(customer?.full_name || "-"),
              "Customer Phone": formatPhone(customer?.phone as string | null),
              "Date": formatDate(String(r.created_at || "")),
              "Time": formatTime(String(r.created_at || "")),
            }
          })
          filename = `rides_report_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "customers": {
          let query = supabase
            .from("profiles")
            .select("full_name, employee_id, phone, email, department, gender, status, created_at")
            .eq("role", "customer")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: customers } = await query

          rows = (customers || []).map((c: Record<string, unknown>) => ({
            "Name": String(c.full_name || ""),
            "Employee ID": String(c.employee_id || "-"),
            "Phone": formatPhone(c.phone as string | null),
            "Email": String(c.email || "-"),
            "Department": String(c.department || "-"),
            "Gender": String(c.gender || "-"),
            "Status": formatStatus(String(c.status || "")),
            "Joined Date": formatDate(String(c.created_at || "")),
          }))
          filename = `customers_report_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "drivers": {
          let query = supabase
            .from("profiles")
            .select(`
              full_name, employee_id, phone, email, department, gender, status, created_at,
              driver:drivers(rating, total_trips, is_online)
            `)
            .eq("role", "driver")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: drivers } = await query

          rows = (drivers || []).map((d: Record<string, unknown>) => {
            const driverInfo = Array.isArray(d.driver) ? d.driver[0] : d.driver
            return {
              "Name": String(d.full_name || ""),
              "Employee ID": String(d.employee_id || "-"),
              "Phone": formatPhone(d.phone as string | null),
              "Email": String(d.email || "-"),
              "Department": String(d.department || "-"),
              "Gender": String(d.gender || "-"),
              "Status": formatStatus(String(d.status || "")),
              "Rating": driverInfo?.rating ? `${driverInfo.rating}/5` : "-",
              "Total Trips": String(driverInfo?.total_trips || "0"),
              "Online Status": driverInfo?.is_online ? "Online" : "Offline",
              "Joined Date": formatDate(String(d.created_at || "")),
            }
          })
          filename = `drivers_report_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "ratings": {
          let query = supabase
            .from("ratings")
            .select(`
              rating, comment, created_at,
              from_user:profiles!ratings_from_user_id_fkey(full_name),
              to_user:profiles!ratings_to_user_id_fkey(full_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: ratings } = await query

          rows = (ratings || []).map((r: Record<string, unknown>) => {
            const fromUser = r.from_user as Record<string, unknown> | null
            const toUser = r.to_user as Record<string, unknown> | null
            return {
              "From": String(fromUser?.full_name || "-"),
              "To": String(toUser?.full_name || "-"),
              "Rating": `${r.rating}/5`,
              "Comment": String(r.comment || "-"),
              "Date": formatDate(String(r.created_at || "")),
            }
          })
          filename = `ratings_report_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "usage": {
          let query = supabase.from("rides").select("created_at, status")
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query

          const grouped = (rides || []).reduce((acc: Record<string, { total: number; completed: number; cancelled: number }>, ride) => {
            const date = formatDate(ride.created_at)
            if (!acc[date]) acc[date] = { total: 0, completed: 0, cancelled: 0 }
            acc[date].total++
            if (ride.status === "completed") acc[date].completed++
            if (ride.status === "cancelled") acc[date].cancelled++
            return acc
          }, {})

          rows = Object.entries(grouped).map(([date, stats]) => ({
            "Date": date,
            "Total Rides": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Completion Rate": stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : "0%",
          }))
          filename = `daily_usage_${new Date().toISOString().split("T")[0]}.csv`
          break
        }
      }

      if (rows.length === 0) {
        toast.error("No data to export")
        setLoading(null)
        return
      }

      // Generate CSV with proper escaping
      const csvRows = rows.map(row =>
        headers.map(h => {
          const val = row[h] || ""
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return val
        }).join(",")
      )

      const csv = [headers.join(","), ...csvRows].join("\n")
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }) // BOM for Excel
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`${rows.length} records exported`)
    } catch (error) {
      toast.error("Failed to generate report")
      console.error(error)
    }

    setLoading(null)
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
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range
          </CardTitle>
          <CardDescription>Filter reports by date (optional)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateRange === "custom" && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">From:</span>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">To:</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <Card key={report.id} className="hover:border-primary/50 transition-colors">
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
    </div>
  )
}
