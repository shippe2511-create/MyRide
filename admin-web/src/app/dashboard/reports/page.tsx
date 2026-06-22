"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PermissionGate } from "@/components/permission-gate"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Download, FileSpreadsheet, FileText, Loader2, Calendar, Users, Car, Star, BarChart3, TrendingUp, Package, AlertTriangle, Shield, ClipboardCheck, Fuel } from "lucide-react"
import { toast } from "sonner"

const reportTypes = [
  { id: "rides", name: "Rides Report", description: "All rides with pickup, dropoff, and status", icon: Car },
  { id: "customers", name: "Customers Report", description: "Customer list with contact info", icon: Users },
  { id: "drivers", name: "Drivers Report", description: "Driver list with ratings and trips", icon: Car },
  { id: "driver_performance", name: "Driver Performance", description: "KPIs: completion rate, cancellations, activity", icon: TrendingUp },
  { id: "ratings", name: "Ratings Report", description: "All ratings and feedback", icon: Star },
  { id: "usage", name: "Daily Usage", description: "Rides per day summary", icon: BarChart3 },
  { id: "sos_alerts", name: "SOS Alerts", description: "All emergency alerts with status", icon: AlertTriangle },
  { id: "incidents", name: "Incidents Report", description: "All reported incidents", icon: Shield },
  { id: "vehicle_checks", name: "Vehicle Checks", description: "Pre-trip inspection results", icon: ClipboardCheck },
  { id: "vehicle_logs", name: "Vehicle Logs", description: "Fuel, maintenance, odometer records", icon: Fuel },
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
  driver_performance: {
    "Driver Name": "full_name",
    "Phone": "phone",
    "Rating": "rating",
    "Total Rides": "total_rides",
    "Completed Rides": "completed_rides",
    "Cancelled Rides": "cancelled_rides",
    "Completion Rate": "completion_rate",
    "Cancellation Rate": "cancellation_rate",
    "This Week": "this_week",
    "This Month": "this_month",
    "Online Status": "online_status",
    "Vehicle": "vehicle",
    "License": "license",
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
  sos_alerts: {
    "Alert ID": "id",
    "User Name": "user_name",
    "User Phone": "user_phone",
    "User Type": "user_type",
    "Status": "status",
    "Location": "location",
    "Date": "date",
    "Time": "time",
    "Resolved At": "resolved_at",
  },
  incidents: {
    "Incident ID": "id",
    "Title": "title",
    "Type": "type",
    "Severity": "severity",
    "Status": "status",
    "Reporter": "reporter",
    "Date": "date",
    "Description": "description",
  },
  vehicle_checks: {
    "Check ID": "id",
    "Driver": "driver_name",
    "Vehicle": "vehicle",
    "Status": "status",
    "Date": "date",
    "Issues": "issues",
  },
  vehicle_logs: {
    "Log ID": "id",
    "Driver": "driver_name",
    "Type": "log_type",
    "Amount": "amount",
    "Odometer": "odometer",
    "Date": "date",
    "Notes": "notes",
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

  const generateReport = async (reportType: string, showLoading = true) => {
    if (showLoading) setLoading(reportType)
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

        case "driver_performance": {
          // Get all drivers with profile and vehicle info
          const { data: driversData } = await supabase
            .from("drivers")
            .select(`
              id, rating, is_online, license_number,
              profile:profiles!drivers_profile_id_fkey(full_name, phone),
              vehicle:vehicle_types(plate_no, display_name)
            `)

          // Get all rides
          let ridesQuery = supabase.from("rides").select("id, driver_id, status, created_at")
          if (dateFilter) {
            ridesQuery = ridesQuery.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: ridesData } = await ridesQuery

          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

          rows = (driversData || []).map((d: Record<string, unknown>) => {
            const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
            const vehicle = Array.isArray(d.vehicle) ? d.vehicle[0] : d.vehicle

            // Calculate stats for this driver
            const driverRides = (ridesData || []).filter(r => r.driver_id === d.id)
            const completedRides = driverRides.filter(r => r.status === 'completed').length
            const cancelledRides = driverRides.filter(r => r.status === 'cancelled').length
            const totalRides = driverRides.length

            const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0
            const cancellationRate = totalRides > 0 ? Math.round((cancelledRides / totalRides) * 100) : 0

            const thisWeekRides = driverRides.filter(r =>
              r.status === 'completed' && new Date(r.created_at) >= weekAgo
            ).length
            const thisMonthRides = driverRides.filter(r =>
              r.status === 'completed' && new Date(r.created_at) >= monthAgo
            ).length

            return {
              "Driver Name": String(profile?.full_name || "Unknown"),
              "Phone": formatPhone(profile?.phone as string | null),
              "Rating": d.rating ? `${d.rating}/5` : "-",
              "Total Rides": String(totalRides),
              "Completed Rides": String(completedRides),
              "Cancelled Rides": String(cancelledRides),
              "Completion Rate": `${completionRate}%`,
              "Cancellation Rate": `${cancellationRate}%`,
              "This Week": String(thisWeekRides),
              "This Month": String(thisMonthRides),
              "Online Status": d.is_online ? "Online" : "Offline",
              "Vehicle": vehicle ? `${vehicle.display_name || ""} (${vehicle.plate_no || ""})` : "-",
              "License": String(d.license_number || "-"),
            }
          })

          // Sort by completion rate descending
          rows.sort((a, b) => {
            const rateA = parseInt(a["Completion Rate"]) || 0
            const rateB = parseInt(b["Completion Rate"]) || 0
            return rateB - rateA
          })

          filename = `driver_performance_${new Date().toISOString().split("T")[0]}.csv`
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

        case "sos_alerts": {
          let query = supabase
            .from("sos_alerts")
            .select(`
              id, status, latitude, longitude, location_address, created_at, resolved_at,
              user:profiles!sos_alerts_user_id_fkey(full_name, phone, role)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: alerts } = await query

          rows = (alerts || []).map((a: Record<string, unknown>) => {
            const user = a.user as Record<string, unknown> | null
            return {
              "Alert ID": String(a.id || "").slice(0, 8),
              "User Name": String(user?.full_name || "-"),
              "User Phone": formatPhone(user?.phone as string | null),
              "User Type": user?.role === "driver" ? "Driver" : "Customer",
              "Status": formatStatus(String(a.status || "")),
              "Location": a.location_address ? String(a.location_address) : (a.latitude ? `${a.latitude}, ${a.longitude}` : "-"),
              "Date": formatDate(String(a.created_at || "")),
              "Time": formatTime(String(a.created_at || "")),
              "Resolved At": a.resolved_at ? formatDate(String(a.resolved_at)) : "-",
            }
          })
          filename = `sos_alerts_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "incidents": {
          let query = supabase
            .from("incidents")
            .select(`
              id, title, type, severity, status, description, created_at,
              reporter:profiles!incidents_reported_by_fkey(full_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: incidents } = await query

          rows = (incidents || []).map((i: Record<string, unknown>) => {
            const reporter = i.reporter as Record<string, unknown> | null
            return {
              "Incident ID": String(i.id || "").slice(0, 8),
              "Title": String(i.title || "-"),
              "Type": formatStatus(String(i.type || "")),
              "Severity": formatStatus(String(i.severity || "")),
              "Status": formatStatus(String(i.status || "")),
              "Reporter": String(reporter?.full_name || "-"),
              "Date": formatDate(String(i.created_at || "")),
              "Description": String(i.description || "-").slice(0, 100),
            }
          })
          filename = `incidents_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "vehicle_checks": {
          let query = supabase
            .from("vehicle_checks")
            .select(`
              id, status, created_at, notes,
              driver:drivers!vehicle_checks_driver_id_fkey(
                profile:profiles(full_name)
              ),
              vehicle:vehicle_types(plate_no, display_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: checks } = await query

          rows = (checks || []).map((c: Record<string, unknown>) => {
            const driver = c.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            const vehicle = c.vehicle as Record<string, unknown> | null
            return {
              "Check ID": String(c.id || "").slice(0, 8),
              "Driver": String(profile?.full_name || "-"),
              "Vehicle": vehicle ? `${vehicle.display_name || ""} (${vehicle.plate_no || ""})` : "-",
              "Status": formatStatus(String(c.status || "")),
              "Date": formatDate(String(c.created_at || "")),
              "Issues": String(c.notes || "-"),
            }
          })
          filename = `vehicle_checks_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "vehicle_logs": {
          let query = supabase
            .from("vehicle_logs")
            .select(`
              id, log_type, amount, odometer, notes, log_date, created_at,
              driver:drivers!vehicle_logs_driver_id_fkey(
                profile:profiles(full_name)
              )
            `)
            .order("log_date", { ascending: false })
          if (dateFilter) {
            query = query.gte("log_date", dateFilter.start).lte("log_date", dateFilter.end)
          }
          const { data: logs } = await query

          rows = (logs || []).map((l: Record<string, unknown>) => {
            const driver = l.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Log ID": String(l.id || "").slice(0, 8),
              "Driver": String(profile?.full_name || "-"),
              "Type": formatStatus(String(l.log_type || "")),
              "Amount": l.amount ? `$${l.amount}` : "-",
              "Odometer": l.odometer ? `${l.odometer} km` : "-",
              "Date": formatDate(String(l.log_date || l.created_at || "")),
              "Notes": String(l.notes || "-"),
            }
          })
          filename = `vehicle_logs_${new Date().toISOString().split("T")[0]}.csv`
          break
        }
      }

      if (rows.length === 0) {
        toast.error("No data to export")
        if (showLoading) setLoading(null)
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

    if (showLoading) setLoading(null)
  }

  const downloadAllReports = async () => {
    setLoading("all")
    toast.info("Downloading all reports...")

    let successCount = 0
    for (const report of reportTypes) {
      try {
        await generateReport(report.id, false)
        successCount++
        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        console.error(`Failed to download ${report.name}`, e)
      }
    }

    setLoading(null)
    toast.success(`${successCount} reports downloaded!`)
  }

  return (
    <PermissionGate permission="reports:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate and export reports in CSV format
          </p>
        </div>
        <Button
          onClick={downloadAllReports}
          disabled={loading !== null}
          variant="outline"
          size="lg"
        >
          {loading === "all" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Package className="mr-2 h-4 w-4" />
              Download All Reports
            </>
          )}
        </Button>
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
    </PermissionGate>
  )
}
