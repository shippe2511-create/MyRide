"use client"

import { useState, useCallback, memo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PermissionGate } from "@/components/permission-gate"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Download, FileSpreadsheet, FileText, Loader2, Calendar, Users, Car, Star, BarChart3, TrendingUp, Package, AlertTriangle, Shield, ClipboardCheck, Fuel, Coffee, Clock, MessageSquare, Ticket, FileCheck, Truck, Bell, Activity, MessagesSquare, FileDown, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const supabase = createClient()

interface ReportCardProps {
  report: { id: string; name: string; description: string; icon: React.ComponentType<{ className?: string }> }
  loadingType: string | null
  onDownloadCSV: (id: string) => void
  onDownloadPDF: (id: string) => void
}

const ReportCard = memo(function ReportCard({ report, loadingType, onDownloadCSV, onDownloadPDF }: ReportCardProps) {
  const Icon = report.icon
  const isLoadingCSV = loadingType === `${report.id}-csv`
  const isLoadingPDF = loadingType === `${report.id}-pdf`
  const isLoading = isLoadingCSV || isLoadingPDF

  return (
    <div className="group relative flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
        {isLoading ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <Icon className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{report.name}</p>
        <p className="text-xs text-muted-foreground truncate">{report.description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!isLoading) onDownloadCSV(report.id)
          }}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-green-500/30 text-green-600 hover:bg-green-500/10 transition-colors disabled:opacity-50"
          title="Download CSV"
        >
          {isLoadingCSV ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          CSV
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!isLoading) onDownloadPDF(report.id)
          }}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          title="Download PDF"
        >
          {isLoadingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          PDF
        </button>
      </div>
    </div>
  )
})

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

const reportTypes = [
  { id: "rides", name: "Rides Report", description: "All rides with pickup, dropoff, and status", icon: Car },
  { id: "customers", name: "Customers Report", description: "Customer list with contact info", icon: Users },
  { id: "drivers", name: "Drivers Report", description: "Driver list with ratings and trips", icon: Car },
  { id: "driver_performance", name: "Driver Performance", description: "KPIs: completion rate, cancellations, activity", icon: TrendingUp },
  { id: "shifts", name: "Shift Schedule", description: "Driver shift assignments and times", icon: Clock },
  { id: "break_history", name: "Break History", description: "Driver break times and durations", icon: Coffee },
  { id: "support_tickets", name: "Support Tickets", description: "Customer support requests and status", icon: MessageSquare },
  { id: "ratings", name: "Ratings Report", description: "All ratings and feedback", icon: Star },
  { id: "usage", name: "Daily Usage", description: "Rides per day summary", icon: BarChart3 },
  { id: "sos_alerts", name: "SOS Alerts", description: "All emergency alerts with status", icon: AlertTriangle },
  { id: "incidents", name: "Incidents Report", description: "All reported incidents", icon: Shield },
  { id: "vehicle_checks", name: "Vehicle Checks", description: "Pre-trip inspection results", icon: ClipboardCheck },
  { id: "vehicle_logs", name: "Vehicle Logs", description: "Fuel, maintenance, odometer records", icon: Fuel },
  { id: "documents", name: "Driver Documents", description: "Document upload status and verification", icon: FileCheck },
  { id: "vehicles", name: "Vehicles Report", description: "Fleet inventory with status", icon: Truck },
  { id: "announcements", name: "Announcements", description: "All announcements with engagement", icon: Bell },
  { id: "activity_logs", name: "Activity Logs", description: "Admin and system activity", icon: Activity },
  { id: "chat_messages", name: "Chat Messages", description: "Customer-driver chat history", icon: MessagesSquare },
  { id: "scheduled_rides", name: "Scheduled Rides", description: "Upcoming pre-booked rides", icon: Calendar },
  { id: "recurring_rides", name: "Recurring Rides", description: "Regular ride patterns", icon: Clock },
  { id: "cancellations", name: "Cancellations", description: "Cancelled rides with reasons", icon: AlertTriangle },
  { id: "peak_hours", name: "Peak Hours", description: "Ride distribution by hour", icon: TrendingUp },
  { id: "popular_routes", name: "Popular Routes", description: "Most common pickup/dropoff", icon: Car },
  { id: "customer_loyalty", name: "Customer Loyalty", description: "Top customers by ride count", icon: Users },
  { id: "service_zones", name: "Service Zones", description: "Zone coverage and activity", icon: Truck },
  { id: "driver_availability", name: "Driver Availability", description: "Online/offline time per driver", icon: Activity },
  { id: "favorite_drivers", name: "Favorite Drivers", description: "Most favorited drivers", icon: Star },
  { id: "fleet_health", name: "Fleet Health Summary", description: "Vehicle health scores and status", icon: Activity },
  { id: "vehicle_issues", name: "All Vehicle Issues", description: "Complete issue history across vehicles", icon: AlertTriangle },
  { id: "issue_breakdown", name: "Issue Breakdown", description: "Issues categorized by type", icon: BarChart3 },
  { id: "pending_issues", name: "Pending Issues", description: "Unresolved vehicle issues", icon: Clock },
  { id: "resolved_issues", name: "Resolved Issues", description: "Fixed issues with resolution notes", icon: CheckCircle },
  { id: "vehicle_lifespan", name: "Vehicle Lifespan", description: "Vehicle age and replacement recommendations", icon: TrendingUp },
  { id: "vehicle_history", name: "Vehicle Change History", description: "All vehicle changes, assignments, and logs", icon: Activity },
]

// Friendly column names mapping (cleaned - no internal UUIDs)
const columnLabels: Record<string, Record<string, string>> = {
  rides: {
    "Customer": "customer_name",
    "Phone": "customer_phone",
    "Pickup": "pickup_name",
    "Dropoff": "dropoff_name",
    "Status": "status",
    "Distance (km)": "distance_km",
    "Duration (mins)": "duration_minutes",
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
    "Joined": "joined_date",
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
    "Joined": "joined_date",
  },
  driver_performance: {
    "Driver": "full_name",
    "Phone": "phone",
    "Rating": "rating",
    "Total Rides": "total_rides",
    "Completed": "completed_rides",
    "Cancelled": "cancelled_rides",
    "Completion %": "completion_rate",
    "This Week": "this_week",
    "This Month": "this_month",
    "Vehicle": "vehicle",
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
    "Total": "total_rides",
    "Completed": "completed_rides",
    "Cancelled": "cancelled_rides",
    "Completion %": "completion_rate",
  },
  sos_alerts: {
    "User": "user_name",
    "Phone": "user_phone",
    "Type": "user_type",
    "Status": "status",
    "Location": "location",
    "Date": "date",
    "Time": "time",
    "Resolved": "resolved_at",
  },
  incidents: {
    "Title": "title",
    "Type": "type",
    "Severity": "severity",
    "Status": "status",
    "Reporter": "reporter",
    "Date": "date",
    "Description": "description",
  },
  vehicle_checks: {
    "Driver": "driver_name",
    "Vehicle": "vehicle",
    "Status": "status",
    "Date": "date",
    "Issues": "issues",
  },
  vehicle_logs: {
    "Driver": "driver_name",
    "Type": "log_type",
    "Amount": "amount",
    "Odometer": "odometer",
    "Date": "date",
    "Notes": "notes",
  },
  break_history: {
    "Driver": "driver_name",
    "Break Type": "break_type",
    "Started": "started_at",
    "Ended": "ended_at",
    "Duration (mins)": "duration_minutes",
  },
  shifts: {
    "Driver": "driver_name",
    "Date": "shift_date",
    "Start": "start_time",
    "End": "end_time",
    "Type": "shift_type",
    "Status": "status",
  },
  quota_usage: {
    "Customer": "customer_name",
    "Campaign": "campaign_name",
    "Today": "rides_today",
    "This Week": "rides_this_week",
    "This Month": "rides_this_month",
    "Last Ride": "last_ride_date",
  },
  support_tickets: {
    "Customer": "customer_name",
    "Category": "category",
    "Status": "status",
    "Created": "created_at",
    "Resolved": "resolved_at",
    "Description": "description",
  },
  documents: {
    "Driver": "driver_name",
    "Document": "document_type",
    "Status": "status",
    "Uploaded": "uploaded_at",
    "Expires": "expiry_date",
  },
  vehicles: {
    "Plate No": "plate_no",
    "Type": "vehicle_type",
    "Make/Model": "make_model",
    "Color": "color",
    "Status": "status",
    "Driver": "assigned_driver",
    "Capacity": "capacity",
  },
  announcements: {
    "Title": "title",
    "Target": "target",
    "Status": "status",
    "Created": "created_at",
    "Expires": "expires_at",
    "Message": "message",
  },
  activity_logs: {
    "Action": "action",
    "Entity": "entity_type",
    "User": "user_name",
    "Details": "details",
    "Date": "date",
    "Time": "time",
  },
  chat_messages: {
    "Ride": "ride_id",
    "From": "sender_name",
    "To": "receiver_name",
    "Message": "message",
    "Date": "date",
    "Time": "time",
  },
  scheduled_rides: {
    "Customer": "customer_name",
    "Pickup": "pickup_name",
    "Dropoff": "dropoff_name",
    "Scheduled For": "scheduled_time",
    "Status": "status",
    "Created": "created_at",
  },
  recurring_rides: {
    "Customer": "customer_name",
    "Pickup": "pickup_name",
    "Dropoff": "dropoff_name",
    "Days": "days",
    "Time": "time",
    "Status": "status",
  },
  cancellations: {
    "Customer": "customer_name",
    "Driver": "driver_name",
    "Pickup": "pickup_name",
    "Cancelled By": "cancelled_by",
    "Reason": "reason",
    "Date": "date",
  },
  peak_hours: {
    "Hour": "hour",
    "Rides": "ride_count",
    "Completed": "completed",
    "Cancelled": "cancelled",
    "Avg Duration": "avg_duration",
  },
  popular_routes: {
    "Pickup": "pickup_name",
    "Dropoff": "dropoff_name",
    "Rides": "ride_count",
    "Avg Distance": "avg_distance",
    "Avg Duration": "avg_duration",
  },
  customer_loyalty: {
    "Customer": "customer_name",
    "Phone": "phone",
    "Total Rides": "total_rides",
    "Completed": "completed",
    "Cancelled": "cancelled",
    "Last Ride": "last_ride",
  },
  service_zones: {
    "Zone": "zone_name",
    "Status": "status",
    "Rides": "ride_count",
    "Drivers": "driver_count",
  },
  driver_availability: {
    "Driver": "driver_name",
    "Total Hours": "total_hours",
    "Online Hours": "online_hours",
    "Offline Hours": "offline_hours",
    "Availability %": "availability",
  },
  favorite_drivers: {
    "Driver": "driver_name",
    "Rating": "rating",
    "Favorites": "favorite_count",
    "Total Rides": "total_rides",
  },
  fleet_health: {
    "Vehicle": "vehicle_number",
    "Health Score": "health_score",
    "Status": "status",
    "Days Active": "days_in_service",
    "Total Checks": "total_checks",
    "Total Issues": "total_issues",
    "Pending": "pending_issues",
    "Fixed": "fixed_issues",
    "Common Issue": "most_common_issue",
  },
  vehicle_issues: {
    "Date": "date",
    "Vehicle": "vehicle_number",
    "Driver": "driver_name",
    "Issues": "issues",
    "Status": "resolution_status",
    "Resolution": "resolution_notes",
  },
  issue_breakdown: {
    "Issue Type": "issue_type",
    "Occurrences": "count",
    "Vehicles Affected": "vehicles_affected",
  },
  pending_issues: {
    "Date": "date",
    "Vehicle": "vehicle_number",
    "Driver": "driver_name",
    "Issues": "issues",
    "Status": "resolution_status",
  },
  resolved_issues: {
    "Date": "date",
    "Vehicle": "vehicle_number",
    "Driver": "driver_name",
    "Issues": "issues",
    "Resolution": "resolution_notes",
    "Resolved": "resolved_at",
  },
  vehicle_lifespan: {
    "Vehicle": "vehicle_number",
    "Days Active": "days_in_service",
    "Health Score": "health_score",
    "Issue Rate": "issue_rate",
    "Recommendation": "recommendation",
  },
  vehicle_history: {
    "Date": "date",
    "Vehicle": "vehicle_number",
    "Event": "event_type",
    "Driver": "driver_name",
    "Details": "details",
  },
}

export default function ReportsPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Use refs for date values to prevent generateReport from changing
  const dateRangeRef = useRef(dateRange)
  const startDateRef = useRef(startDate)
  const endDateRef = useRef(endDate)
  dateRangeRef.current = dateRange
  startDateRef.current = startDate
  endDateRef.current = endDate

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

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    return d.toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
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
    const dr = dateRangeRef.current
    const sd = startDateRef.current
    const ed = endDateRef.current
    if (dr === "custom" && sd && ed) {
      return { start: sd, end: ed }
    }
    switch (dr) {
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

  const generateReport = useCallback(async (reportType: string, showLoading = true): Promise<void> => {
    try {
      if (showLoading) setLoading(`${reportType}-csv`)
      const dateFilter = getDateFilter()

      let rows: Record<string, string>[] = []
      let filename = ""
      const labels = columnLabels[reportType]
      if (!labels) {
        toast.error(`No column labels defined for: ${reportType}`)
        if (showLoading) setLoading(null)
        return
      }
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
              "Customer": String(customer?.full_name || "-"),
              "Phone": formatPhone(customer?.phone as string | null),
              "Pickup": String(r.pickup_name || ""),
              "Dropoff": String(r.dropoff_name || ""),
              "Status": formatStatus(String(r.status || "")),
              "Distance (km)": r.distance_km ? String(r.distance_km) : "-",
              "Duration (mins)": r.duration_minutes ? String(r.duration_minutes) : "-",
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
            "Joined": formatDate(String(c.created_at || "")),
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
              "Rating": driverInfo?.rating ? `${Number(driverInfo.rating).toFixed(1)} out of 5` : "-",
              "Total Trips": String(driverInfo?.total_trips || "0"),
                            "Joined": formatDate(String(d.created_at || "")),
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
              "Driver": String(profile?.full_name || "Unknown"),
              "Phone": formatPhone(profile?.phone as string | null),
              "Rating": d.rating ? `${Number(d.rating).toFixed(1)} out of 5` : "-",
              "Total Rides": String(totalRides),
              "Completed": String(completedRides),
              "Cancelled": String(cancelledRides),
              "Completion %": `${completionRate}%`,
              "This Week": String(thisWeekRides),
              "This Month": String(thisMonthRides),
              "Vehicle": vehicle ? `${vehicle.display_name || ""} (${vehicle.plate_no || ""})` : "-",
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

        case "break_history": {
          let query = supabase
            .from("break_history")
            .select(`
              break_type, started_at, ended_at, duration_minutes, created_at,
              driver:drivers!break_history_driver_id_fkey(
                profile:profiles!drivers_profile_id_fkey(full_name)
              )
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: breaks } = await query

          rows = (breaks || []).map((b: Record<string, unknown>) => {
            const driver = b.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Break Type": String(b.break_type || "-"),
              "Started": b.started_at ? formatDateTime(String(b.started_at)) : "-",
              "Ended": b.ended_at ? formatDateTime(String(b.ended_at)) : "In Progress",
              "Duration (mins)": b.duration_minutes != null ? String(b.duration_minutes) : "-",
            }
          })
          filename = `break_history_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "shifts": {
          let query = supabase
            .from("shifts")
            .select(`
              shift_date, start_time, end_time, shift_type, status, created_at,
              driver:drivers!shifts_driver_id_fkey(
                profile:profiles!drivers_profile_id_fkey(full_name)
              )
            `)
            .order("shift_date", { ascending: false })
          if (dateFilter) {
            query = query.gte("shift_date", dateFilter.start).lte("shift_date", dateFilter.end)
          }
          const { data: shifts } = await query

          rows = (shifts || []).map((s: Record<string, unknown>) => {
            const driver = s.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Date": formatDate(String(s.shift_date || "")),
              "Start": String(s.start_time || "-"),
              "End": String(s.end_time || "-"),
              "Type": formatStatus(String(s.shift_type || "")),
              "Status": formatStatus(String(s.status || "")),
            }
          })
          filename = `shifts_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "quota_usage": {
          const { data: quotas } = await supabase
            .from("ride_quotas")
            .select(`
              rides_today, rides_this_week, rides_this_month, last_ride_date, updated_at,
              user:profiles!ride_quotas_user_id_fkey(full_name),
              campaign:ride_campaigns!ride_quotas_campaign_id_fkey(name)
            `)
            .order("updated_at", { ascending: false })

          rows = (quotas || []).map((q: Record<string, unknown>) => {
            const user = q.user as Record<string, unknown> | null
            const campaign = q.campaign as Record<string, unknown> | null
            return {
              "Customer": String(user?.full_name || "-"),
              "Campaign": String(campaign?.name || "-"),
              "Today": String(q.rides_today || "0"),
              "This Week": String(q.rides_this_week || "0"),
              "This Month": String(q.rides_this_month || "0"),
              "Last Ride": q.last_ride_date ? formatDate(String(q.last_ride_date)) : "-",
            }
          })
          filename = `quota_usage_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "support_tickets": {
          let query = supabase
            .from("support_tickets")
            .select(`
              id, category, description, status, created_at, resolved_at,
              user:profiles!support_tickets_user_id_fkey(full_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: tickets } = await query

          rows = (tickets || []).map((t: Record<string, unknown>) => {
            const user = t.user as Record<string, unknown> | null
            return {
              "Customer": String(user?.full_name || "-"),
              "Category": formatStatus(String(t.category || "-")),
              "Status": formatStatus(String(t.status || "")),
              "Created": formatDateTime(String(t.created_at || "")),
              "Resolved": t.resolved_at ? formatDateTime(String(t.resolved_at)) : "-",
              "Description": String(t.description || "-").slice(0, 100),
            }
          })
          filename = `support_tickets_${new Date().toISOString().split("T")[0]}.csv`
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
              "Rating": `${Number(r.rating).toFixed(1)} out of 5`,
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
            "Total": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Completion %": stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : "0%",
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
              "User": String(user?.full_name || "-"),
              "Phone": formatPhone(user?.phone as string | null),
              "Type": user?.role === "driver" ? "Driver" : "Customer",
              "Status": formatStatus(String(a.status || "")),
              "Location": a.location_address ? String(a.location_address) : (a.latitude ? `${a.latitude}, ${a.longitude}` : "-"),
              "Date": formatDate(String(a.created_at || "")),
              "Time": formatTime(String(a.created_at || "")),
              "Resolved": a.resolved_at ? formatDateTime(String(a.resolved_at)) : "-",
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
              driver:profiles!incidents_driver_id_fkey(full_name),
              customer:profiles!incidents_customer_id_fkey(full_name)
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: incidents } = await query

          rows = (incidents || []).map((i: Record<string, unknown>) => {
            const driver = i.driver as Record<string, unknown> | null
            const customer = i.customer as Record<string, unknown> | null
            const reporter = driver?.full_name || customer?.full_name || "-"
            return {
              "Title": String(i.title || "-"),
              "Type": formatStatus(String(i.type || "")),
              "Severity": formatStatus(String(i.severity || "")),
              "Status": formatStatus(String(i.status || "")),
              "Reporter": String(reporter),
              "Date": formatDate(String(i.created_at || "")),
              "Description": String(i.description || "-").slice(0, 100),
            }
          })
          filename = `incidents_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "vehicle_checks": {
          let query = supabase
            .from("vehicle_checklists")
            .select("id, driver_name, vehicle_number, has_issues, issues, checked_at, resolution_status")
            .order("checked_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("checked_at", dateFilter.start).lte("checked_at", dateFilter.end + "T23:59:59")
          }
          const { data: checks } = await query

          rows = (checks || []).map((c: Record<string, unknown>) => {
            const issues = c.issues as Record<string, unknown> | null
            const issueList = issues ? Object.keys(issues).join(", ") : ""
            return {
              "Driver": String(c.driver_name || "-"),
              "Vehicle": String(c.vehicle_number || "-"),
              "Status": c.has_issues ? "Issues Found" : "Passed",
              "Date": formatDate(String(c.checked_at || "")),
              "Issues": issueList || "-",
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
                profile:profiles!drivers_profile_id_fkey(full_name)
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
              "Driver": String(profile?.full_name || "-"),
              "Type": formatStatus(String(l.log_type || "")),
              "Amount": l.amount ? `MVR ${l.amount}` : "-",
              "Odometer": l.odometer ? `${l.odometer} km` : "-",
              "Date": formatDate(String(l.log_date || l.created_at || "")),
              "Notes": String(l.notes || "-"),
            }
          })
          filename = `vehicle_logs_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "documents": {
          let query = supabase
            .from("documents")
            .select(`
              id, document_type, status, created_at, expiry_date, verified_by,
              driver:drivers!documents_driver_id_fkey(
                profile:profiles!drivers_profile_id_fkey(full_name)
              )
            `)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: docs } = await query

          rows = (docs || []).map((d: Record<string, unknown>) => {
            const driver = d.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Document": formatStatus(String(d.document_type || "")),
              "Status": formatStatus(String(d.status || "")),
              "Uploaded": formatDate(String(d.created_at || "")),
              "Expires": d.expiry_date ? formatDate(String(d.expiry_date)) : "-",
            }
          })
          filename = `documents_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "vehicles": {
          const { data: vehicles } = await supabase
            .from("vehicle_types")
            .select("id, plate_no, display_name, capacity, is_active, created_at")
            .order("created_at", { ascending: false })

          rows = (vehicles || []).map((v: Record<string, unknown>) => ({
            "Plate No": String(v.plate_no || "-"),
            "Type": String(v.display_name || "-"),
            "Make/Model": "-",
            "Color": "-",
            "Status": v.is_active ? "Active" : "Inactive",
            "Driver": "-",
            "Capacity": String(v.capacity || "-"),
          }))
          filename = `vehicles_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "announcements": {
          let query = supabase
            .from("announcements")
            .select("id, title, message, target_audience, is_active, created_at, expires_at")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: announcements } = await query

          rows = (announcements || []).map((a: Record<string, unknown>) => ({
            "Title": String(a.title || "-"),
            "Target": formatStatus(String(a.target_audience || "all")),
            "Status": a.is_active ? "Active" : "Inactive",
            "Created": formatDate(String(a.created_at || "")),
            "Expires": a.expires_at ? formatDate(String(a.expires_at)) : "-",
            "Message": String(a.message || "-").slice(0, 100),
          }))
          filename = `announcements_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "activity_logs": {
          let query = supabase
            .from("activity_logs")
            .select("action, entity_type, entity_id, details, admin_name, created_at")
            .order("created_at", { ascending: false })
            .limit(1000)
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: logs } = await query

          rows = (logs || []).map((l: Record<string, unknown>) => {
            const details = l.details as Record<string, unknown> | null
            let detailsText = "-"
            if (details) {
              if (details.name) detailsText = String(details.name)
              else if (details.count) detailsText = `${details.count} items`
              else detailsText = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ").slice(0, 50)
            }
            return {
              "Action": formatStatus(String(l.action || "")),
              "Entity": formatStatus(String(l.entity_type || "")),
              "User": String(l.admin_name || "System"),
              "Details": detailsText,
              "Date": formatDate(String(l.created_at || "")),
              "Time": formatTime(String(l.created_at || "")),
            }
          })
          filename = `activity_logs_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "chat_messages": {
          let query = supabase
            .from("chat_messages")
            .select("id, message, sender_type, created_at, ride_id, sender_id, receiver_id")
            .order("created_at", { ascending: false })
            .limit(1000)
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: messages } = await query

          // Get unique user IDs to fetch names
          const userIds = new Set<string>()
          ;(messages || []).forEach((m: Record<string, unknown>) => {
            if (m.sender_id) userIds.add(String(m.sender_id))
            if (m.receiver_id) userIds.add(String(m.receiver_id))
          })

          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", Array.from(userIds))

          const nameMap: Record<string, string> = {}
          ;(profiles || []).forEach((p: { id: string; full_name: string }) => {
            nameMap[p.id] = p.full_name
          })

          rows = (messages || []).map((m: Record<string, unknown>) => ({
            "Ride": m.ride_id ? String(m.ride_id).slice(0, 8) : "-",
            "From": nameMap[String(m.sender_id)] || String(m.sender_type || "-"),
            "To": nameMap[String(m.receiver_id)] || "-",
            "Message": String(m.message || "-").slice(0, 100),
            "Date": formatDate(String(m.created_at || "")),
            "Time": formatTime(String(m.created_at || "")),
          }))
          filename = `chat_messages_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "scheduled_rides": {
          let query = supabase
            .from("rides")
            .select(`id, pickup_name, dropoff_name, scheduled_time, status, created_at, customer:profiles!rides_customer_id_fkey(full_name)`)
            .not("scheduled_time", "is", null)
            .order("scheduled_time", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Dropoff": String(r.dropoff_name || "-"),
              "Scheduled For": formatDateTime(String(r.scheduled_time || "")),
              "Status": formatStatus(String(r.status || "")),
              "Created": formatDate(String(r.created_at || "")),
            }
          })
          filename = `scheduled_rides_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "recurring_rides": {
          const { data: rides } = await supabase
            .from("recurring_rides")
            .select(`id, pickup_name, dropoff_name, days_of_week, pickup_time, is_active, customer:profiles!recurring_rides_customer_id_fkey(full_name)`)
            .order("created_at", { ascending: false })
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            const days = r.days_of_week as string[] | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Dropoff": String(r.dropoff_name || "-"),
              "Days": days ? days.join(", ") : "-",
              "Time": String(r.pickup_time || "-"),
              "Status": r.is_active ? "Active" : "Inactive",
            }
          })
          filename = `recurring_rides_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "cancellations": {
          let query = supabase
            .from("rides")
            .select(`id, pickup_name, status, cancelled_by, cancellation_reason, created_at, customer:profiles!rides_customer_id_fkey(full_name), driver:drivers!rides_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`)
            .eq("status", "cancelled")
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            const driver = r.driver as Record<string, unknown> | null
            const driverProfile = driver?.profile as Record<string, unknown> | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Driver": String(driverProfile?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Cancelled By": formatStatus(String(r.cancelled_by || "-")),
              "Reason": String(r.cancellation_reason || "-"),
              "Date": formatDate(String(r.created_at || "")),
            }
          })
          filename = `cancellations_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "peak_hours": {
          let query = supabase.from("rides").select("created_at, status, duration_minutes")
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          const hourStats: Record<number, { total: number; completed: number; cancelled: number; totalDuration: number }> = {}
          for (let i = 0; i < 24; i++) hourStats[i] = { total: 0, completed: 0, cancelled: 0, totalDuration: 0 }
          ;(rides || []).forEach((r) => {
            const hour = new Date(r.created_at).getHours()
            hourStats[hour].total++
            if (r.status === "completed") {
              hourStats[hour].completed++
              hourStats[hour].totalDuration += r.duration_minutes || 0
            }
            if (r.status === "cancelled") hourStats[hour].cancelled++
          })
          rows = Object.entries(hourStats).map(([hour, stats]) => ({
            "Hour": `${hour.padStart(2, "0")}:00`,
            "Rides": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Avg Duration": stats.completed > 0 ? `${Math.round(stats.totalDuration / stats.completed)} mins` : "-",
          }))
          filename = `peak_hours_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "popular_routes": {
          let query = supabase.from("rides").select("pickup_name, dropoff_name, distance_km, duration_minutes, status")
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          const routeStats: Record<string, { count: number; totalDistance: number; totalDuration: number }> = {}
          ;(rides || []).filter(r => r.status === "completed").forEach((r) => {
            const key = `${r.pickup_name || "Unknown"}|${r.dropoff_name || "Unknown"}`
            if (!routeStats[key]) routeStats[key] = { count: 0, totalDistance: 0, totalDuration: 0 }
            routeStats[key].count++
            routeStats[key].totalDistance += r.distance_km || 0
            routeStats[key].totalDuration += r.duration_minutes || 0
          })
          rows = Object.entries(routeStats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 50)
            .map(([route, stats]) => {
              const [pickup, dropoff] = route.split("|")
              return {
                "Pickup": pickup,
                "Dropoff": dropoff,
                "Rides": String(stats.count),
                "Avg Distance": `${(stats.totalDistance / stats.count).toFixed(1)} km`,
                "Avg Duration": `${Math.round(stats.totalDuration / stats.count)} mins`,
              }
            })
          filename = `popular_routes_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "customer_loyalty": {
          let query = supabase.from("rides").select("customer_id, status, created_at")
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          const customerStats: Record<string, { total: number; completed: number; cancelled: number; lastRide: string }> = {}
          ;(rides || []).forEach((r) => {
            const cid = r.customer_id
            if (!cid) return
            if (!customerStats[cid]) customerStats[cid] = { total: 0, completed: 0, cancelled: 0, lastRide: "" }
            customerStats[cid].total++
            if (r.status === "completed") customerStats[cid].completed++
            if (r.status === "cancelled") customerStats[cid].cancelled++
            if (!customerStats[cid].lastRide || r.created_at > customerStats[cid].lastRide) {
              customerStats[cid].lastRide = r.created_at
            }
          })
          const customerIds = Object.keys(customerStats)
          const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone").in("id", customerIds)
          const profileMap: Record<string, { full_name: string; phone: string }> = {}
          ;(profiles || []).forEach((p) => { profileMap[p.id] = { full_name: p.full_name, phone: p.phone } })
          rows = Object.entries(customerStats)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 100)
            .map(([cid, stats]) => ({
              "Customer": profileMap[cid]?.full_name || "-",
              "Phone": formatPhone(profileMap[cid]?.phone || null),
              "Total Rides": String(stats.total),
              "Completed": String(stats.completed),
              "Cancelled": String(stats.cancelled),
              "Last Ride": formatDate(stats.lastRide),
            }))
          filename = `customer_loyalty_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "service_zones": {
          const { data: zones } = await supabase.from("service_zones").select("id, name, is_active")
          rows = (zones || []).map((z: Record<string, unknown>) => ({
            "Zone": String(z.name || "-"),
            "Status": z.is_active ? "Active" : "Inactive",
            "Rides": "-",
            "Drivers": "-",
          }))
          filename = `service_zones_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "driver_availability": {
          const { data: drivers } = await supabase.from("drivers").select(`id, is_online, profile:profiles!drivers_profile_id_fkey(full_name)`)
          rows = (drivers || []).map((d: Record<string, unknown>) => {
            const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
            return {
              "Driver": String(profile?.full_name || "-"),
              "Total Hours": "-",
              "Online Hours": "-",
              "Offline Hours": "-",
              "Availability %": d.is_online ? "Online Now" : "Offline",
            }
          })
          filename = `driver_availability_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "favorite_drivers": {
          const { data: favorites } = await supabase
            .from("favorite_drivers")
            .select(`driver_id, driver:drivers!favorite_drivers_driver_id_fkey(rating, total_trips, profile:profiles!drivers_profile_id_fkey(full_name))`)
          const driverCounts: Record<string, { name: string; rating: number; trips: number; count: number }> = {}
          ;(favorites || []).forEach((f: Record<string, unknown>) => {
            const driver = f.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            const did = String(f.driver_id)
            if (!driverCounts[did]) {
              driverCounts[did] = {
                name: String(profile?.full_name || "-"),
                rating: Number(driver?.rating || 0),
                trips: Number(driver?.total_trips || 0),
                count: 0,
              }
            }
            driverCounts[did].count++
          })
          rows = Object.values(driverCounts)
            .sort((a, b) => b.count - a.count)
            .map((d) => ({
              "Driver": d.name,
              "Rating": d.rating ? `${Number(d.rating).toFixed(1)} out of 5` : "-",
              "Favorites": String(d.count),
              "Total Rides": String(d.trips),
            }))
          filename = `favorite_drivers_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        case "fleet_health":
        case "vehicle_issues":
        case "issue_breakdown":
        case "pending_issues":
        case "resolved_issues":
        case "vehicle_lifespan": {
          const [vehiclesRes, checklistsRes] = await Promise.all([
            supabase.from("vehicle_types").select("plate_no, display_name, is_active, created_at").eq("is_active", true),
            supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
          ])
          const vehicles = vehiclesRes.data || []
          const checklists = checklistsRes.data || []

          const ITEM_LABELS: Record<string, string> = {
            fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition",
            ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness",
          }

          const vehicleMap = new Map<string, { vehicle_number: string; total_checks: number; total_issues: number; pending_issues: number; fixed_issues: number; deferred_issues: number; first_check: string | null; most_common_issue: string | null; issue_breakdown: Record<string, number>; health_score: number; days_in_service: number }>()
          for (const v of vehicles) {
            if (!v.plate_no) continue
            vehicleMap.set(v.plate_no, {
              vehicle_number: v.plate_no,
              total_checks: 0, total_issues: 0, pending_issues: 0, fixed_issues: 0, deferred_issues: 0,
              first_check: v.created_at, most_common_issue: null, issue_breakdown: {}, health_score: 100,
              days_in_service: v.created_at ? Math.ceil((Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            })
          }

          for (const c of checklists) {
            const vn = c.vehicle_number
            if (!vn || !vehicleMap.has(vn)) continue
            const h = vehicleMap.get(vn)!
            h.total_checks++
            if (c.has_issues) {
              h.total_issues++
              if (c.resolution_status === "pending" || !c.resolution_status) h.pending_issues++
              else if (c.resolution_status === "fixed") h.fixed_issues++
              else if (c.resolution_status === "deferred") h.deferred_issues++
              if (c.issues) {
                for (const key of Object.keys(c.issues)) {
                  h.issue_breakdown[key] = (h.issue_breakdown[key] || 0) + 1
                }
              }
            }
          }

          for (const h of vehicleMap.values()) {
            let maxCount = 0, mostCommon: string | null = null
            for (const [issue, count] of Object.entries(h.issue_breakdown)) {
              if (count > maxCount) { maxCount = count; mostCommon = issue }
            }
            h.most_common_issue = mostCommon
            const issueRate = h.total_checks > 0 ? (h.total_issues / h.total_checks) * 100 : 0
            h.health_score = Math.max(0, Math.min(100, Math.round(100 - issueRate * 2 - h.pending_issues * 10)))
          }

          const getHealthLabel = (score: number) => score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor"
          const healthData = Array.from(vehicleMap.values())

          if (reportType === "fleet_health") {
            rows = healthData.map(v => ({
              "Vehicle": v.vehicle_number,
              "Health Score": `${v.health_score}%`,
              "Status": getHealthLabel(v.health_score),
              "Days Active": String(v.days_in_service),
              "Total Checks": String(v.total_checks),
              "Total Issues": String(v.total_issues),
              "Pending": String(v.pending_issues),
              "Fixed": String(v.fixed_issues),
              "Common Issue": v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "-",
            }))
            filename = `fleet_health_${new Date().toISOString().split("T")[0]}.csv`
          } else if (reportType === "vehicle_issues") {
            rows = checklists.filter((c: Record<string, unknown>) => c.has_issues).map((c: Record<string, unknown>) => ({
              "Date": formatDate(String(c.checked_at)),
              "Vehicle": String(c.vehicle_number || "-"),
              "Driver": String(c.driver_name || "-"),
              "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
              "Status": String(c.resolution_status || "pending"),
              "Resolution": String(c.resolution_notes || "-"),
            }))
            filename = `vehicle_issues_${new Date().toISOString().split("T")[0]}.csv`
          } else if (reportType === "issue_breakdown") {
            const breakdown: Record<string, { count: number; vehicles: Set<string> }> = {}
            checklists.forEach((c: Record<string, unknown>) => {
              if (c.issues) {
                Object.keys(c.issues as Record<string, unknown>).forEach(key => {
                  if (!breakdown[key]) breakdown[key] = { count: 0, vehicles: new Set() }
                  breakdown[key].count++
                  breakdown[key].vehicles.add(String(c.vehicle_number))
                })
              }
            })
            rows = Object.entries(breakdown).map(([key, val]) => ({
              "Issue Type": ITEM_LABELS[key] || key,
              "Occurrences": String(val.count),
              "Vehicles Affected": String(val.vehicles.size),
            })).sort((a, b) => parseInt(b["Occurrences"]) - parseInt(a["Occurrences"]))
            filename = `issue_breakdown_${new Date().toISOString().split("T")[0]}.csv`
          } else if (reportType === "pending_issues") {
            rows = checklists.filter((c: Record<string, unknown>) => c.has_issues && (!c.resolution_status || c.resolution_status === "pending")).map((c: Record<string, unknown>) => ({
              "Date": formatDate(String(c.checked_at)),
              "Vehicle": String(c.vehicle_number || "-"),
              "Driver": String(c.driver_name || "-"),
              "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
              "Status": "Pending",
            }))
            filename = `pending_issues_${new Date().toISOString().split("T")[0]}.csv`
          } else if (reportType === "resolved_issues") {
            rows = checklists.filter((c: Record<string, unknown>) => c.has_issues && c.resolution_status === "fixed").map((c: Record<string, unknown>) => ({
              "Date": formatDate(String(c.checked_at)),
              "Vehicle": String(c.vehicle_number || "-"),
              "Driver": String(c.driver_name || "-"),
              "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
              "Resolution": String(c.resolution_notes || "-"),
              "Resolved": c.resolved_at ? formatDate(String(c.resolved_at)) : "-",
            }))
            filename = `resolved_issues_${new Date().toISOString().split("T")[0]}.csv`
          } else if (reportType === "vehicle_lifespan") {
            rows = healthData.map(v => ({
              "Vehicle": v.vehicle_number,
              "Days Active": String(v.days_in_service),
              "Health Score": `${v.health_score}%`,
              "Issue Rate": v.total_checks > 0 ? `${Math.round((v.total_issues / v.total_checks) * 100)}%` : "0%",
              "Recommendation": v.health_score < 40 ? "Consider Replacement" : "Keep",
            })).sort((a, b) => parseInt(a["Health Score"]) - parseInt(b["Health Score"]))
            filename = `vehicle_lifespan_${new Date().toISOString().split("T")[0]}.csv`
          }
          break
        }

        case "vehicle_history": {
          // Fetch vehicle logs, checklists, and driver assignments
          const [logsRes, checklistsRes, driversRes] = await Promise.all([
            supabase.from("vehicle_logs").select(`*, driver:drivers!vehicle_logs_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("created_at", { ascending: false }),
            supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
            supabase.from("drivers").select(`vehicle_id, profile:profiles!drivers_profile_id_fkey(full_name), vehicle:vehicle_types!drivers_vehicle_id_fkey(plate_no)`).not("vehicle_id", "is", null),
          ])

          const logs = logsRes.data || []
          const checklists = checklistsRes.data || []
          const ITEM_LABELS: Record<string, string> = { fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition", ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness" }

          const historyRows: { date: string; vehicle: string; event: string; driver: string; details: string; timestamp: number }[] = []

          // Add vehicle logs (fuel, maintenance, etc.)
          logs.forEach((log: Record<string, unknown>) => {
            const driver = log.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            historyRows.push({
              date: formatDate(String(log.created_at)),
              vehicle: String(log.vehicle_number || "-"),
              event: String(log.log_type || "Log Entry"),
              driver: String(profile?.full_name || "-"),
              details: `Odometer: ${log.odometer_reading || "-"}, Fuel: ${log.fuel_amount || "-"}L, Notes: ${log.notes || "-"}`,
              timestamp: new Date(String(log.created_at)).getTime(),
            })
          })

          // Add pre-trip checks
          checklists.forEach((c: Record<string, unknown>) => {
            const event = c.has_issues ? "Pre-trip Check (Issues Found)" : "Pre-trip Check (Passed)"
            const issues = c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "All OK"
            historyRows.push({
              date: formatDate(String(c.checked_at)),
              vehicle: String(c.vehicle_number || "-"),
              event: event,
              driver: String(c.driver_name || "-"),
              details: c.has_issues ? `Issues: ${issues}` : "All items passed",
              timestamp: new Date(String(c.checked_at)).getTime(),
            })

            // Add resolution as separate event if exists
            if (c.resolution_status === "fixed" && c.resolved_at) {
              historyRows.push({
                date: formatDate(String(c.resolved_at)),
                vehicle: String(c.vehicle_number || "-"),
                event: "Issue Resolved",
                driver: "-",
                details: String(c.resolution_notes || "Issue fixed"),
                timestamp: new Date(String(c.resolved_at)).getTime(),
              })
            }
          })

          // Sort by date (newest first)
          historyRows.sort((a, b) => b.timestamp - a.timestamp)

          rows = historyRows.map(h => ({
            "Date": h.date,
            "Vehicle": h.vehicle,
            "Event": h.event,
            "Driver": h.driver,
            "Details": h.details,
          }))
          filename = `vehicle_history_${new Date().toISOString().split("T")[0]}.csv`
          break
        }

        default: {
          toast.error(`Unknown report type: ${reportType}`)
          if (showLoading) setLoading(null)
          return
        }
      }

      if (!rows || rows.length === 0) {
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
      downloadCSV(csv, filename)
      toast.success(`${rows.length} records exported`)
    } catch (error: unknown) {
      console.error("Report generation error:", error)
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      if (showLoading) setLoading(null)
    }
  }, [])

  const downloadAllReports = useCallback(async () => {
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
  }, [generateReport])

  const generatePDF = useCallback(async (reportType: string): Promise<void> => {
    try {
      setLoading(`${reportType}-pdf`)
      const dateFilter = getDateFilter()

      let rows: Record<string, string>[] = []
      let reportName = reportTypes.find(r => r.id === reportType)?.name || reportType
      const labels = columnLabels[reportType]
      if (!labels) {
        toast.error(`No column labels defined for: ${reportType}`)
        setLoading(null)
        return
      }
      const headers = Object.keys(labels)

      // Reuse the same data fetching logic from generateReport
      // For simplicity, we'll call generateReport logic but output HTML instead
      switch (reportType) {
        case "rides": {
          let query = supabase
            .from("rides")
            .select(`id, pickup_name, dropoff_name, status, distance_km, duration_minutes, created_at, customer:profiles!rides_customer_id_fkey(full_name, phone)`)
            .order("created_at", { ascending: false })
          if (dateFilter) {
            query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          }
          const { data: rides } = await query
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Phone": formatPhone(customer?.phone as string | null),
              "Pickup": String(r.pickup_name || ""),
              "Dropoff": String(r.dropoff_name || ""),
              "Status": formatStatus(String(r.status || "")),
              "Distance (km)": r.distance_km ? String(r.distance_km) : "-",
              "Duration (mins)": r.duration_minutes ? String(r.duration_minutes) : "-",
              "Date": formatDate(String(r.created_at || "")),
              "Time": formatTime(String(r.created_at || "")),
            }
          })
          break
        }
        case "customers": {
          let query = supabase.from("profiles").select("full_name, employee_id, phone, email, department, gender, status, created_at").eq("role", "customer").order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: customers } = await query
          rows = (customers || []).map((c: Record<string, unknown>) => ({
            "Name": String(c.full_name || ""),
            "Employee ID": String(c.employee_id || "-"),
            "Phone": formatPhone(c.phone as string | null),
            "Email": String(c.email || "-"),
            "Department": String(c.department || "-"),
            "Gender": String(c.gender || "-"),
            "Status": formatStatus(String(c.status || "")),
            "Joined": formatDate(String(c.created_at || "")),
          }))
          break
        }
        case "drivers": {
          let query = supabase.from("profiles").select(`full_name, employee_id, phone, email, department, gender, status, created_at, driver:drivers(rating, total_trips, is_online)`).eq("role", "driver").order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
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
              "Rating": driverInfo?.rating ? `${Number(driverInfo.rating).toFixed(1)} out of 5` : "-",
              "Total Trips": String(driverInfo?.total_trips || "0"),
                            "Joined": formatDate(String(d.created_at || "")),
            }
          })
          break
        }
        case "vehicle_checks": {
          let query = supabase.from("vehicle_checklists").select("id, driver_name, vehicle_number, has_issues, issues, checked_at, resolution_status").order("checked_at", { ascending: false })
          if (dateFilter) query = query.gte("checked_at", dateFilter.start).lte("checked_at", dateFilter.end + "T23:59:59")
          const { data: checks } = await query
          rows = (checks || []).map((c: Record<string, unknown>) => {
            const issues = c.issues as Record<string, unknown> | null
            const issueList = issues ? Object.keys(issues).join(", ") : ""
            return {
              "Driver": String(c.driver_name || "-"),
              "Vehicle": String(c.vehicle_number || "-"),
              "Status": c.has_issues ? "Issues Found" : "Passed",
              "Date": formatDate(String(c.checked_at || "")),
              "Issues": issueList || "-",
            }
          })
          break
        }
        case "vehicles": {
          const { data: vehicles } = await supabase.from("vehicle_types").select("id, plate_no, display_name, capacity, is_active, created_at").order("created_at", { ascending: false })
          rows = (vehicles || []).map((v: Record<string, unknown>) => ({
            "Plate No": String(v.plate_no || "-"),
            "Type": String(v.display_name || "-"),
            "Make/Model": "-",
            "Color": "-",
            "Status": v.is_active ? "Active" : "Inactive",
            "Driver": "-",
            "Capacity": String(v.capacity || "-"),
          }))
          break
        }
        case "vehicle_logs": {
          let query = supabase.from("vehicle_logs").select(`id, log_type, amount, odometer, notes, log_date, created_at, driver:drivers!vehicle_logs_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("log_date", { ascending: false })
          if (dateFilter) query = query.gte("log_date", dateFilter.start).lte("log_date", dateFilter.end)
          const { data: logs } = await query
          rows = (logs || []).map((l: Record<string, unknown>) => {
            const driver = l.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Type": formatStatus(String(l.log_type || "")),
              "Amount": l.amount ? `MVR ${l.amount}` : "-",
              "Odometer": l.odometer ? `${l.odometer} km` : "-",
              "Date": formatDate(String(l.log_date || l.created_at || "")),
              "Notes": String(l.notes || "-"),
            }
          })
          break
        }
        case "ratings": {
          let query = supabase.from("ratings").select(`rating, comment, created_at, from_user:profiles!ratings_from_user_id_fkey(full_name), to_user:profiles!ratings_to_user_id_fkey(full_name)`).order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: ratings } = await query
          rows = (ratings || []).map((r: Record<string, unknown>) => {
            const fromUser = r.from_user as Record<string, unknown> | null
            const toUser = r.to_user as Record<string, unknown> | null
            return {
              "From": String(fromUser?.full_name || "-"),
              "To": String(toUser?.full_name || "-"),
              "Rating": `${Number(r.rating).toFixed(1)} out of 5`,
              "Comment": String(r.comment || "-"),
              "Date": formatDate(String(r.created_at || "")),
            }
          })
          break
        }
        case "sos_alerts": {
          let query = supabase.from("sos_alerts").select(`id, status, location_address, created_at, resolved_at, user:profiles!sos_alerts_user_id_fkey(full_name, phone, role)`).order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: alerts } = await query
          rows = (alerts || []).map((a: Record<string, unknown>) => {
            const user = a.user as Record<string, unknown> | null
            return {
              "User": String(user?.full_name || "-"),
              "Phone": formatPhone(user?.phone as string | null),
              "Type": user?.role === "driver" ? "Driver" : "Customer",
              "Status": formatStatus(String(a.status || "")),
              "Location": String(a.location_address || "-"),
              "Date": formatDate(String(a.created_at || "")),
              "Time": formatTime(String(a.created_at || "")),
              "Resolved": a.resolved_at ? formatDateTime(String(a.resolved_at)) : "-",
            }
          })
          break
        }
        case "activity_logs": {
          let query = supabase.from("activity_logs").select("action, entity_type, entity_id, details, admin_name, created_at").order("created_at", { ascending: false }).limit(1000)
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: logs } = await query
          rows = (logs || []).map((l: Record<string, unknown>) => {
            const details = l.details as Record<string, unknown> | null
            // Format details as readable text
            let detailsText = "-"
            if (details) {
              if (details.name) detailsText = String(details.name)
              else if (details.count) detailsText = `${details.count} items`
              else detailsText = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ").slice(0, 50)
            }
            return {
              "Action": formatStatus(String(l.action || "")),
              "Entity": formatStatus(String(l.entity_type || "")),
              "User": String(l.admin_name || "System"),
              "Details": detailsText,
              "Date": formatDate(String(l.created_at || "")),
              "Time": formatTime(String(l.created_at || "")),
            }
          })
          break
        }
        case "driver_performance": {
          const { data: driversData } = await supabase.from("drivers").select(`id, rating, profile:profiles!drivers_profile_id_fkey(full_name, phone), vehicle:vehicle_types(plate_no, display_name)`)
          let ridesQuery = supabase.from("rides").select("id, driver_id, status, created_at")
          if (dateFilter) ridesQuery = ridesQuery.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: ridesData } = await ridesQuery
          rows = (driversData || []).map((d: Record<string, unknown>) => {
            const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
            const vehicle = Array.isArray(d.vehicle) ? d.vehicle[0] : d.vehicle
            const driverRides = (ridesData || []).filter(r => r.driver_id === d.id)
            const completedRides = driverRides.filter(r => r.status === 'completed').length
            const totalRides = driverRides.length
            const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0
            return {
              "Driver": String(profile?.full_name || "Unknown"),
              "Phone": formatPhone(profile?.phone as string | null),
              "Rating": d.rating ? `${Number(d.rating).toFixed(1)} out of 5` : "-",
              "Total Rides": String(totalRides),
              "Completed": String(completedRides),
              "Cancelled": String(driverRides.filter(r => r.status === 'cancelled').length),
              "Completion %": `${completionRate}%`,
              "This Week": String(driverRides.filter(r => r.status === 'completed' && new Date(r.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length),
              "This Month": String(driverRides.filter(r => r.status === 'completed' && new Date(r.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length),
              "Vehicle": vehicle ? `${vehicle.display_name || ""} (${vehicle.plate_no || ""})` : "-",
            }
          })
          break
        }
        case "shifts": {
          let query = supabase.from("shifts").select(`shift_date, start_time, end_time, shift_type, status, driver:drivers!shifts_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("shift_date", { ascending: false })
          if (dateFilter) query = query.gte("shift_date", dateFilter.start).lte("shift_date", dateFilter.end)
          const { data: shifts } = await query
          rows = (shifts || []).map((s: Record<string, unknown>) => {
            const driver = s.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Date": formatDate(String(s.shift_date || "")),
              "Start": String(s.start_time || "-"),
              "End": String(s.end_time || "-"),
              "Type": formatStatus(String(s.shift_type || "")),
              "Status": formatStatus(String(s.status || "")),
            }
          })
          break
        }
        case "break_history": {
          let query = supabase.from("break_history").select(`break_type, started_at, ended_at, duration_minutes, driver:drivers!break_history_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("started_at", { ascending: false })
          if (dateFilter) query = query.gte("started_at", dateFilter.start).lte("started_at", dateFilter.end + "T23:59:59")
          const { data: breaks } = await query
          rows = (breaks || []).map((b: Record<string, unknown>) => {
            const driver = b.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Break Type": String(b.break_type || "-"),
              "Started": b.started_at ? formatDateTime(String(b.started_at)) : "-",
              "Ended": b.ended_at ? formatDateTime(String(b.ended_at)) : "In Progress",
              "Duration (mins)": b.duration_minutes != null ? String(b.duration_minutes) : "-",
            }
          })
          break
        }
        case "quota_usage": {
          const { data: quotas } = await supabase.from("ride_quotas").select(`rides_today, rides_this_week, rides_this_month, last_ride_date, user:profiles!ride_quotas_user_id_fkey(full_name), campaign:ride_campaigns!ride_quotas_campaign_id_fkey(name)`).order("updated_at", { ascending: false })
          rows = (quotas || []).map((q: Record<string, unknown>) => {
            const user = q.user as Record<string, unknown> | null
            const campaign = q.campaign as Record<string, unknown> | null
            return {
              "Customer": String(user?.full_name || "-"),
              "Campaign": String(campaign?.name || "-"),
              "Today": String(q.rides_today || "0"),
              "This Week": String(q.rides_this_week || "0"),
              "This Month": String(q.rides_this_month || "0"),
              "Last Ride": q.last_ride_date ? formatDate(String(q.last_ride_date)) : "-",
            }
          })
          break
        }
        case "support_tickets": {
          let query = supabase.from("support_tickets").select(`category, description, status, created_at, resolved_at, user:profiles!support_tickets_user_id_fkey(full_name)`).order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: tickets } = await query
          rows = (tickets || []).map((t: Record<string, unknown>) => {
            const user = t.user as Record<string, unknown> | null
            return {
              "Customer": String(user?.full_name || "-"),
              "Category": formatStatus(String(t.category || "-")),
              "Status": formatStatus(String(t.status || "")),
              "Created": formatDateTime(String(t.created_at || "")),
              "Resolved": t.resolved_at ? formatDateTime(String(t.resolved_at)) : "-",
              "Description": String(t.description || "-").slice(0, 50),
            }
          })
          break
        }
        case "usage": {
          let query = supabase.from("rides").select("created_at, status")
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
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
            "Total": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Completion %": stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : "0%",
          }))
          break
        }
        case "incidents": {
          let query = supabase.from("incidents").select(`title, type, severity, status, description, created_at, driver:profiles!incidents_driver_id_fkey(full_name), customer:profiles!incidents_customer_id_fkey(full_name)`).order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: incidents } = await query
          rows = (incidents || []).map((i: Record<string, unknown>) => {
            const driver = i.driver as Record<string, unknown> | null
            const customer = i.customer as Record<string, unknown> | null
            return {
              "Title": String(i.title || "-"),
              "Type": formatStatus(String(i.type || "")),
              "Severity": formatStatus(String(i.severity || "")),
              "Status": formatStatus(String(i.status || "")),
              "Reporter": String(driver?.full_name || customer?.full_name || "-"),
              "Date": formatDate(String(i.created_at || "")),
              "Description": String(i.description || "-").slice(0, 50),
            }
          })
          break
        }
        case "documents": {
          let query = supabase.from("documents").select(`document_type, status, created_at, expiry_date, driver:drivers!documents_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: docs } = await query
          rows = (docs || []).map((d: Record<string, unknown>) => {
            const driver = d.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            return {
              "Driver": String(profile?.full_name || "-"),
              "Document": formatStatus(String(d.document_type || "")),
              "Status": formatStatus(String(d.status || "")),
              "Uploaded": formatDate(String(d.created_at || "")),
              "Expires": d.expiry_date ? formatDate(String(d.expiry_date)) : "-",
            }
          })
          break
        }
        case "announcements": {
          let query = supabase.from("announcements").select("title, message, target_audience, is_active, created_at, expires_at").order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: announcements } = await query
          rows = (announcements || []).map((a: Record<string, unknown>) => ({
            "Title": String(a.title || "-"),
            "Target": formatStatus(String(a.target_audience || "all")),
            "Status": a.is_active ? "Active" : "Inactive",
            "Created": formatDate(String(a.created_at || "")),
            "Expires": a.expires_at ? formatDate(String(a.expires_at)) : "-",
            "Message": String(a.message || "-").slice(0, 50),
          }))
          break
        }
        case "chat_messages": {
          let query = supabase.from("chat_messages").select("message, sender_type, created_at, ride_id, sender_id, receiver_id").order("created_at", { ascending: false }).limit(500)
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: messages } = await query
          const userIds = new Set<string>()
          ;(messages || []).forEach((m: Record<string, unknown>) => {
            if (m.sender_id) userIds.add(String(m.sender_id))
            if (m.receiver_id) userIds.add(String(m.receiver_id))
          })
          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(userIds))
          const nameMap: Record<string, string> = {}
          ;(profiles || []).forEach((p: { id: string; full_name: string }) => { nameMap[p.id] = p.full_name })
          rows = (messages || []).map((m: Record<string, unknown>) => ({
            "Ride": m.ride_id ? String(m.ride_id).slice(0, 8) : "-",
            "From": nameMap[String(m.sender_id)] || String(m.sender_type || "-"),
            "To": nameMap[String(m.receiver_id)] || "-",
            "Message": String(m.message || "-").slice(0, 50),
            "Date": formatDate(String(m.created_at || "")),
            "Time": formatTime(String(m.created_at || "")),
          }))
          break
        }
        case "scheduled_rides": {
          let query = supabase.from("rides").select(`pickup_name, dropoff_name, scheduled_time, status, created_at, customer:profiles!rides_customer_id_fkey(full_name)`).not("scheduled_time", "is", null).order("scheduled_time", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: rides } = await query
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Dropoff": String(r.dropoff_name || "-"),
              "Scheduled For": formatDateTime(String(r.scheduled_time || "")),
              "Status": formatStatus(String(r.status || "")),
              "Created": formatDate(String(r.created_at || "")),
            }
          })
          break
        }
        case "recurring_rides": {
          const { data: rides } = await supabase.from("recurring_rides").select(`pickup_name, dropoff_name, days_of_week, pickup_time, is_active, customer:profiles!recurring_rides_customer_id_fkey(full_name)`).order("created_at", { ascending: false })
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            const days = r.days_of_week as string[] | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Dropoff": String(r.dropoff_name || "-"),
              "Days": days ? days.join(", ") : "-",
              "Time": String(r.pickup_time || "-"),
              "Status": r.is_active ? "Active" : "Inactive",
            }
          })
          break
        }
        case "cancellations": {
          let query = supabase.from("rides").select(`pickup_name, cancelled_by, cancellation_reason, created_at, customer:profiles!rides_customer_id_fkey(full_name), driver:drivers!rides_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).eq("status", "cancelled").order("created_at", { ascending: false })
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: rides } = await query
          rows = (rides || []).map((r: Record<string, unknown>) => {
            const customer = r.customer as Record<string, unknown> | null
            const driver = r.driver as Record<string, unknown> | null
            const driverProfile = driver?.profile as Record<string, unknown> | null
            return {
              "Customer": String(customer?.full_name || "-"),
              "Driver": String(driverProfile?.full_name || "-"),
              "Pickup": String(r.pickup_name || "-"),
              "Cancelled By": formatStatus(String(r.cancelled_by || "-")),
              "Reason": String(r.cancellation_reason || "-"),
              "Date": formatDate(String(r.created_at || "")),
            }
          })
          break
        }
        case "peak_hours": {
          let query = supabase.from("rides").select("created_at, status, duration_minutes")
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: rides } = await query
          const hourStats: Record<number, { total: number; completed: number; cancelled: number; totalDuration: number }> = {}
          for (let i = 0; i < 24; i++) hourStats[i] = { total: 0, completed: 0, cancelled: 0, totalDuration: 0 }
          ;(rides || []).forEach((r) => {
            const hour = new Date(r.created_at).getHours()
            hourStats[hour].total++
            if (r.status === "completed") { hourStats[hour].completed++; hourStats[hour].totalDuration += r.duration_minutes || 0 }
            if (r.status === "cancelled") hourStats[hour].cancelled++
          })
          rows = Object.entries(hourStats).map(([hour, stats]) => ({
            "Hour": `${hour.padStart(2, "0")}:00`,
            "Rides": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Avg Duration": stats.completed > 0 ? `${Math.round(stats.totalDuration / stats.completed)} mins` : "-",
          }))
          break
        }
        case "popular_routes": {
          let query = supabase.from("rides").select("pickup_name, dropoff_name, distance_km, duration_minutes, status")
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: rides } = await query
          const routeStats: Record<string, { count: number; totalDistance: number; totalDuration: number }> = {}
          ;(rides || []).filter(r => r.status === "completed").forEach((r) => {
            const key = `${r.pickup_name || "Unknown"}|${r.dropoff_name || "Unknown"}`
            if (!routeStats[key]) routeStats[key] = { count: 0, totalDistance: 0, totalDuration: 0 }
            routeStats[key].count++
            routeStats[key].totalDistance += r.distance_km || 0
            routeStats[key].totalDuration += r.duration_minutes || 0
          })
          rows = Object.entries(routeStats).sort((a, b) => b[1].count - a[1].count).slice(0, 50).map(([route, stats]) => {
            const [pickup, dropoff] = route.split("|")
            return { "Pickup": pickup, "Dropoff": dropoff, "Rides": String(stats.count), "Avg Distance": `${(stats.totalDistance / stats.count).toFixed(1)} km`, "Avg Duration": `${Math.round(stats.totalDuration / stats.count)} mins` }
          })
          break
        }
        case "customer_loyalty": {
          let query = supabase.from("rides").select("customer_id, status, created_at")
          if (dateFilter) query = query.gte("created_at", dateFilter.start).lte("created_at", dateFilter.end + "T23:59:59")
          const { data: rides } = await query
          const customerStats: Record<string, { total: number; completed: number; cancelled: number; lastRide: string }> = {}
          ;(rides || []).forEach((r) => {
            const cid = r.customer_id
            if (!cid) return
            if (!customerStats[cid]) customerStats[cid] = { total: 0, completed: 0, cancelled: 0, lastRide: "" }
            customerStats[cid].total++
            if (r.status === "completed") customerStats[cid].completed++
            if (r.status === "cancelled") customerStats[cid].cancelled++
            if (!customerStats[cid].lastRide || r.created_at > customerStats[cid].lastRide) customerStats[cid].lastRide = r.created_at
          })
          const customerIds = Object.keys(customerStats)
          const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone").in("id", customerIds)
          const profileMap: Record<string, { full_name: string; phone: string }> = {}
          ;(profiles || []).forEach((p) => { profileMap[p.id] = { full_name: p.full_name, phone: p.phone } })
          rows = Object.entries(customerStats).sort((a, b) => b[1].total - a[1].total).slice(0, 100).map(([cid, stats]) => ({
            "Customer": profileMap[cid]?.full_name || "-",
            "Phone": formatPhone(profileMap[cid]?.phone || null),
            "Total Rides": String(stats.total),
            "Completed": String(stats.completed),
            "Cancelled": String(stats.cancelled),
            "Last Ride": formatDate(stats.lastRide),
          }))
          break
        }
        case "service_zones": {
          const { data: zones } = await supabase.from("service_zones").select("name, is_active")
          rows = (zones || []).map((z: Record<string, unknown>) => ({ "Zone": String(z.name || "-"), "Status": z.is_active ? "Active" : "Inactive", "Rides": "-", "Drivers": "-" }))
          break
        }
        case "driver_availability": {
          const { data: drivers } = await supabase.from("drivers").select(`is_online, profile:profiles!drivers_profile_id_fkey(full_name)`)
          rows = (drivers || []).map((d: Record<string, unknown>) => {
            const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile
            return { "Driver": String(profile?.full_name || "-"), "Total Hours": "-", "Online Hours": "-", "Offline Hours": "-", "Availability %": d.is_online ? "Online Now" : "Offline" }
          })
          break
        }
        case "favorite_drivers": {
          const { data: favorites } = await supabase.from("favorite_drivers").select(`driver_id, driver:drivers!favorite_drivers_driver_id_fkey(rating, total_trips, profile:profiles!drivers_profile_id_fkey(full_name))`)
          const driverCounts: Record<string, { name: string; rating: number; trips: number; count: number }> = {}
          ;(favorites || []).forEach((f: Record<string, unknown>) => {
            const driver = f.driver as Record<string, unknown> | null
            const profile = driver?.profile as Record<string, unknown> | null
            const did = String(f.driver_id)
            if (!driverCounts[did]) driverCounts[did] = { name: String(profile?.full_name || "-"), rating: Number(driver?.rating || 0), trips: Number(driver?.total_trips || 0), count: 0 }
            driverCounts[did].count++
          })
          rows = Object.values(driverCounts).sort((a, b) => b.count - a.count).map((d) => ({ "Driver": d.name, "Rating": d.rating ? `${Number(d.rating).toFixed(1)} out of 5` : "-", "Favorites": String(d.count), "Total Rides": String(d.trips) }))
          break
        }
        case "fleet_health":
        case "vehicle_issues":
        case "issue_breakdown":
        case "pending_issues":
        case "resolved_issues":
        case "vehicle_lifespan": {
          const [vehiclesRes, checklistsRes] = await Promise.all([
            supabase.from("vehicle_types").select("plate_no, display_name, is_active, created_at").eq("is_active", true),
            supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
          ])
          const vehicles = vehiclesRes.data || []
          const checklists = checklistsRes.data || []
          const ITEM_LABELS: Record<string, string> = { fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition", ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness" }
          const vehicleMap = new Map<string, { vehicle_number: string; total_checks: number; total_issues: number; pending_issues: number; fixed_issues: number; deferred_issues: number; most_common_issue: string | null; issue_breakdown: Record<string, number>; health_score: number; days_in_service: number }>()
          for (const v of vehicles) {
            if (!v.plate_no) continue
            vehicleMap.set(v.plate_no, { vehicle_number: v.plate_no, total_checks: 0, total_issues: 0, pending_issues: 0, fixed_issues: 0, deferred_issues: 0, most_common_issue: null, issue_breakdown: {}, health_score: 100, days_in_service: v.created_at ? Math.ceil((Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0 })
          }
          for (const c of checklists) {
            const vn = c.vehicle_number; if (!vn || !vehicleMap.has(vn)) continue
            const h = vehicleMap.get(vn)!; h.total_checks++
            if (c.has_issues) { h.total_issues++; if (c.resolution_status === "pending" || !c.resolution_status) h.pending_issues++; else if (c.resolution_status === "fixed") h.fixed_issues++; if (c.issues) { for (const key of Object.keys(c.issues)) { h.issue_breakdown[key] = (h.issue_breakdown[key] || 0) + 1 } } }
          }
          for (const h of vehicleMap.values()) {
            let maxCount = 0, mostCommon: string | null = null; for (const [issue, count] of Object.entries(h.issue_breakdown)) { if (count > maxCount) { maxCount = count; mostCommon = issue } }; h.most_common_issue = mostCommon
            const issueRate = h.total_checks > 0 ? (h.total_issues / h.total_checks) * 100 : 0; h.health_score = Math.max(0, Math.min(100, Math.round(100 - issueRate * 2 - h.pending_issues * 10)))
          }
          const getHealthLabel = (score: number) => score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor"
          const healthData = Array.from(vehicleMap.values())
          if (reportType === "fleet_health") { rows = healthData.map(v => ({ "Vehicle": v.vehicle_number, "Health Score": `${v.health_score}%`, "Status": getHealthLabel(v.health_score), "Days Active": String(v.days_in_service), "Total Checks": String(v.total_checks), "Total Issues": String(v.total_issues), "Pending": String(v.pending_issues), "Fixed": String(v.fixed_issues), "Common Issue": v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "-" })) }
          else if (reportType === "vehicle_issues") { rows = checklists.filter((c: Record<string, unknown>) => c.has_issues).map((c: Record<string, unknown>) => ({ "Date": formatDate(String(c.checked_at)), "Vehicle": String(c.vehicle_number || "-"), "Driver": String(c.driver_name || "-"), "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-", "Status": String(c.resolution_status || "pending"), "Resolution": String(c.resolution_notes || "-") })) }
          else if (reportType === "issue_breakdown") { const breakdown: Record<string, { count: number; vehicles: Set<string> }> = {}; checklists.forEach((c: Record<string, unknown>) => { if (c.issues) { Object.keys(c.issues as Record<string, unknown>).forEach(key => { if (!breakdown[key]) breakdown[key] = { count: 0, vehicles: new Set() }; breakdown[key].count++; breakdown[key].vehicles.add(String(c.vehicle_number)) }) } }); rows = Object.entries(breakdown).map(([key, val]) => ({ "Issue Type": ITEM_LABELS[key] || key, "Occurrences": String(val.count), "Vehicles Affected": String(val.vehicles.size) })).sort((a, b) => parseInt(b["Occurrences"]) - parseInt(a["Occurrences"])) }
          else if (reportType === "pending_issues") { rows = checklists.filter((c: Record<string, unknown>) => c.has_issues && (!c.resolution_status || c.resolution_status === "pending")).map((c: Record<string, unknown>) => ({ "Date": formatDate(String(c.checked_at)), "Vehicle": String(c.vehicle_number || "-"), "Driver": String(c.driver_name || "-"), "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-", "Status": "Pending" })) }
          else if (reportType === "resolved_issues") { rows = checklists.filter((c: Record<string, unknown>) => c.has_issues && c.resolution_status === "fixed").map((c: Record<string, unknown>) => ({ "Date": formatDate(String(c.checked_at)), "Vehicle": String(c.vehicle_number || "-"), "Driver": String(c.driver_name || "-"), "Issues": c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "-", "Resolution": String(c.resolution_notes || "-"), "Resolved": c.resolved_at ? formatDate(String(c.resolved_at)) : "-" })) }
          else if (reportType === "vehicle_lifespan") { rows = healthData.map(v => ({ "Vehicle": v.vehicle_number, "Days Active": String(v.days_in_service), "Health Score": `${v.health_score}%`, "Issue Rate": v.total_checks > 0 ? `${Math.round((v.total_issues / v.total_checks) * 100)}%` : "0%", "Recommendation": v.health_score < 40 ? "Consider Replacement" : "Keep" })).sort((a, b) => parseInt(a["Health Score"]) - parseInt(b["Health Score"])) }
          break
        }
        case "vehicle_history": {
          const [logsRes, checklistsRes] = await Promise.all([
            supabase.from("vehicle_logs").select(`*, driver:drivers!vehicle_logs_driver_id_fkey(profile:profiles!drivers_profile_id_fkey(full_name))`).order("created_at", { ascending: false }),
            supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
          ])
          const logs = logsRes.data || []
          const checklists = checklistsRes.data || []
          const ITEM_LABELS: Record<string, string> = { fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition", ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness" }
          const historyRows: { date: string; vehicle: string; event: string; driver: string; details: string; timestamp: number }[] = []
          logs.forEach((log: Record<string, unknown>) => { const driver = log.driver as Record<string, unknown> | null; const profile = driver?.profile as Record<string, unknown> | null; historyRows.push({ date: formatDate(String(log.created_at)), vehicle: String(log.vehicle_number || "-"), event: String(log.log_type || "Log Entry"), driver: String(profile?.full_name || "-"), details: `Odometer: ${log.odometer_reading || "-"}, Fuel: ${log.fuel_amount || "-"}L`, timestamp: new Date(String(log.created_at)).getTime() }) })
          checklists.forEach((c: Record<string, unknown>) => { const event = c.has_issues ? "Pre-trip Check (Issues)" : "Pre-trip Check (Passed)"; const issues = c.issues ? Object.keys(c.issues as Record<string, unknown>).map(k => ITEM_LABELS[k] || k).join(", ") : "All OK"; historyRows.push({ date: formatDate(String(c.checked_at)), vehicle: String(c.vehicle_number || "-"), event: event, driver: String(c.driver_name || "-"), details: c.has_issues ? `Issues: ${issues}` : "All items passed", timestamp: new Date(String(c.checked_at)).getTime() }); if (c.resolution_status === "fixed" && c.resolved_at) { historyRows.push({ date: formatDate(String(c.resolved_at)), vehicle: String(c.vehicle_number || "-"), event: "Issue Resolved", driver: "-", details: String(c.resolution_notes || "Fixed"), timestamp: new Date(String(c.resolved_at)).getTime() }) } })
          historyRows.sort((a, b) => b.timestamp - a.timestamp)
          rows = historyRows.map(h => ({ "Date": h.date, "Vehicle": h.vehicle, "Event": h.event, "Driver": h.driver, "Details": h.details }))
          break
        }
        default: {
          toast.error("PDF not available for this report type")
          setLoading(null)
          return
        }
      }

      const reportDate = new Date().toLocaleString("en-US", {
        timeZone: "Indian/Maldives",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

      // Generate PDF using jsPDF
      const doc = new jsPDF()

      // Header
      doc.setFontSize(20)
      doc.setTextColor(245, 158, 11) // Orange color
      doc.text("MyRide", 14, 20)

      doc.setFontSize(14)
      doc.setTextColor(0, 0, 0)
      doc.text(reportName, 14, 30)

      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated ${reportDate}${dateFilter ? ` • ${dateFilter.start} to ${dateFilter.end}` : ' • All Time'}`, 14, 38)

      // Draw header line
      doc.setDrawColor(245, 158, 11)
      doc.setLineWidth(0.5)
      doc.line(14, 42, 196, 42)

      if (rows.length > 0) {
        // Table data
        const tableData = rows.map(row => headers.map(h => row[h] || "-"))

        autoTable(doc, {
          head: [headers],
          body: tableData,
          startY: 48,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [248, 249, 250], textColor: [100, 100, 100], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [252, 252, 252] },
        })

        // Record count
        const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 50
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`${rows.length} records`, 14, finalY + 10)
      } else {
        doc.setFontSize(12)
        doc.setTextColor(100, 100, 100)
        doc.text("No data available for the selected period", 14, 60)
      }

      // Footer
      const pageHeight = doc.internal.pageSize.height
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text("MyRide Fleet Management", 14, pageHeight - 10)

      // Save PDF
      doc.save(`${reportType}-report-${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success(`PDF downloaded - ${rows.length} records`)
    } catch (error: unknown) {
      console.error("PDF generation error:", error)
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(null)
    }
  }, [])

  const categories = [
    { name: "People", reports: ["customers", "drivers", "driver_performance", "customer_loyalty", "favorite_drivers"] },
    { name: "Operations", reports: ["rides", "scheduled_rides", "recurring_rides", "cancellations", "shifts", "break_history"] },
    { name: "Feedback", reports: ["ratings", "support_tickets"] },
    { name: "Safety", reports: ["sos_alerts", "incidents"] },
    { name: "Vehicles", reports: ["vehicles", "vehicle_checks", "vehicle_logs"] },
    { name: "Fleet", reports: ["service_zones", "driver_availability"] },
    { name: "Documents", reports: ["documents"] },
    { name: "Communications", reports: ["announcements", "chat_messages"] },
    { name: "Analytics", reports: ["usage", "activity_logs", "peak_hours", "popular_routes"] },
  ]

  return (
    <PermissionGate permission="reports:view">
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Export data in CSV format for analysis
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (loading) return
            downloadAllReports().catch(console.error)
          }}
          disabled={loading !== null}
          size="lg"
          className="gap-2"
        >
          {loading === "all" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Package className="h-4 w-4" />
              Download All
            </>
          )}
        </Button>
      </div>

      {/* Date Filter - Compact */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-muted/30 border">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-36 h-9">
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
            <div className="h-4 w-px bg-border" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-36 h-9"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-36 h-9"
            />
          </>
        )}
      </div>

      {/* Reports by Category */}
      {categories.map((category) => {
        const categoryReports = reportTypes.filter(r => category.reports.includes(r.id))
        if (categoryReports.length === 0) return null

        return (
          <div key={category.name} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {category.name}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {categoryReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  loadingType={loading}
                  onDownloadCSV={(id) => generateReport(id, true)}
                  onDownloadPDF={generatePDF}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
    </PermissionGate>
  )
}
