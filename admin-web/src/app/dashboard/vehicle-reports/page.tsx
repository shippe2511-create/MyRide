"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Car, AlertTriangle, CheckCircle, Clock,
  Search, FileText, TrendingUp, Wrench,
  Activity, BarChart3, FileDown, FileSpreadsheet,
  AlertCircle, Truck, ClipboardCheck, Info, X, Eye,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { PermissionGate } from "@/components/permission-gate"
import { cn } from "@/lib/utils"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface IssueDetail {
  note: string
  photos?: string[]
}

interface VehicleChecklist {
  id: string
  driver_id: string
  driver_name: string
  vehicle_number: string
  has_issues: boolean
  issues: Record<string, string | IssueDetail> | null
  checked_at: string
  resolution_status: string
  resolved_at: string | null
  resolution_notes: string | null
}

interface VehicleHealth {
  vehicle_number: string
  total_checks: number
  total_issues: number
  pending_issues: number
  fixed_issues: number
  deferred_issues: number
  last_check: string | null
  first_check: string | null
  most_common_issue: string | null
  issue_breakdown: Record<string, number>
  health_score: number
  days_in_service: number
}

const ITEM_LABELS: Record<string, string> = {
  fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition",
  ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness",
}

// Report types
const REPORT_CATEGORIES = [
  {
    name: "FLEET OVERVIEW",
    reports: [
      { id: "fleet-health", name: "Fleet Health Summary", icon: Activity, description: "Overview of all vehicle health scores and status" },
      { id: "all-issues", name: "All Vehicle Issues", icon: AlertTriangle, description: "Complete issue history across all vehicles" },
    ]
  },
  {
    name: "VEHICLE DETAILS",
    reports: [
      { id: "vehicle-checks", name: "Pre-trip Inspections", icon: ClipboardCheck, description: "All pre-trip check results by vehicle" },
      { id: "issue-breakdown", name: "Issue Breakdown", icon: BarChart3, description: "Issues categorized by type (tires, lights, etc.)" },
      { id: "pending-issues", name: "Pending Issues", icon: Clock, description: "Unresolved issues that need attention" },
    ]
  },
  {
    name: "MAINTENANCE",
    reports: [
      { id: "resolved-issues", name: "Resolved Issues", icon: CheckCircle, description: "Issues that have been fixed with resolution notes" },
      { id: "vehicle-lifespan", name: "Vehicle Lifespan", icon: TrendingUp, description: "Vehicle age, issue rate, and replacement recommendations" },
    ]
  },
]

export default function VehicleReportsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedReport, setSelectedReport] = useState("fleet-health")
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => {
    // Set end date to tomorrow to include all of today
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split("T")[0]
  })

  const [vehicleHealthData, setVehicleHealthData] = useState<VehicleHealth[]>([])
  const [allChecklists, setAllChecklists] = useState<VehicleChecklist[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalVehicles: 0,
    totalIssues: 0,
    pendingIssues: 0,
    fixedIssues: 0,
    avgHealthScore: 0,
  })

  useEffect(() => {
    loadData()

    // Realtime subscription for vehicle_checklists
    const channel = supabase
      .channel('vehicle_reports_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_checklists' }, () => {
        // Auto-update end date to today if behind
        const today = new Date().toISOString().split("T")[0]
        setEndDate(prev => prev < today ? today : prev)
        loadData(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_types' }, () => {
        loadData(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const [vehiclesRes, checklistsRes] = await Promise.all([
      supabase.from("vehicle_types").select("plate_no, display_name, is_active, created_at").eq("is_active", true),
      supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
    ])

    if (vehiclesRes.error || checklistsRes.error) {
      toast.error("Failed to load data")
      setLoading(false)
      return
    }

    const registeredVehicles = vehiclesRes.data || []
    const checklists = checklistsRes.data || []
    setAllChecklists(checklists)

    const vehicleMap = new Map<string, VehicleHealth>()

    for (const vehicle of registeredVehicles) {
      const vn = vehicle.plate_no
      if (!vn) continue

      vehicleMap.set(vn, {
        vehicle_number: vn,
        total_checks: 0,
        total_issues: 0,
        pending_issues: 0,
        fixed_issues: 0,
        deferred_issues: 0,
        last_check: null,
        first_check: vehicle.created_at,
        most_common_issue: null,
        issue_breakdown: {},
        health_score: 100,
        days_in_service: vehicle.created_at
          ? Math.ceil((Date.now() - new Date(vehicle.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      })
    }

    let totalIssues = 0
    let pendingIssues = 0
    let fixedIssues = 0

    for (const check of checklists) {
      const vn = check.vehicle_number
      if (!vn || !vehicleMap.has(vn)) continue

      const health = vehicleMap.get(vn)!
      health.total_checks++

      if (!health.last_check || new Date(check.checked_at) > new Date(health.last_check)) {
        health.last_check = check.checked_at
      }

      if (check.has_issues) {
        health.total_issues++
        totalIssues++

        if (check.resolution_status === "pending" || !check.resolution_status) {
          health.pending_issues++
          pendingIssues++
        } else if (check.resolution_status === "fixed") {
          health.fixed_issues++
          fixedIssues++
        } else if (check.resolution_status === "deferred") {
          health.deferred_issues++
        }

        if (check.issues) {
          for (const key of Object.keys(check.issues)) {
            health.issue_breakdown[key] = (health.issue_breakdown[key] || 0) + 1
          }
        }
      }
    }

    for (const health of vehicleMap.values()) {
      let maxCount = 0
      let mostCommon: string | null = null
      for (const [issue, count] of Object.entries(health.issue_breakdown)) {
        if (count > maxCount) {
          maxCount = count
          mostCommon = issue
        }
      }
      health.most_common_issue = mostCommon

      const issueRate = health.total_checks > 0 ? (health.total_issues / health.total_checks) * 100 : 0
      health.health_score = Math.max(0, Math.min(100, Math.round(100 - issueRate * 2 - health.pending_issues * 10)))
    }

    const healthData = Array.from(vehicleMap.values())
    const avgHealth = healthData.length > 0
      ? healthData.reduce((sum, v) => sum + v.health_score, 0) / healthData.length
      : 100

    setVehicleHealthData(healthData)
    setStats({
      totalVehicles: healthData.length,
      totalIssues,
      pendingIssues,
      fixedIssues,
      avgHealthScore: Math.round(avgHealth),
    })
    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent"
    if (score >= 60) return "Good"
    if (score >= 40) return "Fair"
    return "Poor"
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500"
    if (score >= 60) return "text-yellow-500"
    if (score >= 40) return "text-orange-500"
    return "text-red-500"
  }

  const filterByDateRange = (items: VehicleChecklist[]) => {
    return items.filter(item => {
      const date = new Date(item.checked_at)
      return date >= new Date(startDate) && date <= new Date(endDate + "T23:59:59")
    })
  }

  const getReportData = () => {
    const filtered = filterByDateRange(allChecklists)

    switch (selectedReport) {
      case "fleet-health":
        return vehicleHealthData
      case "all-issues":
        return filtered.filter(c => c.has_issues)
      case "vehicle-checks":
        return filtered
      case "issue-breakdown":
        const breakdown: Record<string, { count: number, vehicles: Set<string> }> = {}
        filtered.forEach(c => {
          if (c.issues) {
            Object.keys(c.issues).forEach(key => {
              if (!breakdown[key]) breakdown[key] = { count: 0, vehicles: new Set() }
              breakdown[key].count++
              breakdown[key].vehicles.add(c.vehicle_number)
            })
          }
        })
        return Object.entries(breakdown).map(([key, val]) => ({
          issue_type: ITEM_LABELS[key] || key,
          count: val.count,
          vehicles_affected: val.vehicles.size,
        })).sort((a, b) => b.count - a.count)
      case "pending-issues":
        return filtered.filter(c => c.has_issues && (!c.resolution_status || c.resolution_status === "pending"))
      case "resolved-issues":
        return filtered.filter(c => c.has_issues && c.resolution_status === "fixed")
      case "vehicle-lifespan":
        return vehicleHealthData.map(v => ({
          ...v,
          issue_rate: v.total_checks > 0 ? Math.round((v.total_issues / v.total_checks) * 100) : 0,
          needs_replacement: v.health_score < 40,
        })).sort((a, b) => a.health_score - b.health_score)
      default:
        return []
    }
  }

  const selectedReportInfo = REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === selectedReport)

  const exportPDF = () => {
    setGenerating(true)
    const data = getReportData()
    const reportDate = new Date().toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    let headers: string[] = []
    let rows: string[][] = []

    switch (selectedReport) {
      case "fleet-health":
        headers = ["Vehicle", "Health", "Status", "Checks", "Issues", "Pending", "Fixed"]
        rows = (data as VehicleHealth[]).map(v => [
          v.vehicle_number,
          `${v.health_score}%`,
          getHealthLabel(v.health_score),
          String(v.total_checks),
          String(v.total_issues),
          String(v.pending_issues),
          String(v.fixed_issues),
        ])
        break
      case "all-issues":
      case "pending-issues":
      case "resolved-issues":
        headers = ["Date", "Vehicle", "Driver", "Issues", "Status", "Resolution"]
        rows = (data as VehicleChecklist[]).map(c => [
          formatDateTime(c.checked_at),
          c.vehicle_number,
          c.driver_name,
          c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
          c.resolution_status || "Pending",
          c.resolution_notes || "-",
        ])
        break
      case "vehicle-checks":
        headers = ["Date", "Vehicle", "Driver", "Status", "Issues"]
        rows = (data as VehicleChecklist[]).map(c => [
          formatDateTime(c.checked_at),
          c.vehicle_number,
          c.driver_name,
          c.has_issues ? "Issue" : "OK",
          c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
        ])
        break
      case "issue-breakdown":
        headers = ["Issue Type", "Occurrences", "Vehicles Affected"]
        rows = (data as { issue_type: string, count: number, vehicles_affected: number }[]).map(d => [
          d.issue_type,
          String(d.count),
          String(d.vehicles_affected),
        ])
        break
      case "vehicle-lifespan":
        headers = ["Vehicle", "Days Active", "Health", "Issue Rate", "Recommendation"]
        rows = (data as (VehicleHealth & { issue_rate: number, needs_replacement: boolean })[]).map(v => [
          v.vehicle_number,
          String(v.days_in_service),
          `${v.health_score}%`,
          `${v.issue_rate}%`,
          v.needs_replacement ? "Replace" : "Keep",
        ])
        break
    }

    // Generate PDF using jsPDF
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.setTextColor(245, 158, 11)
    doc.text("MyRide", 14, 20)

    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text(selectedReportInfo?.name || "Report", 14, 30)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Generated ${reportDate} • ${formatDate(startDate)} to ${formatDate(endDate)}`, 14, 38)

    // Draw header line
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.5)
    doc.line(14, 42, 196, 42)

    if (rows.length > 0) {
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 48,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [248, 249, 250], textColor: [100, 100, 100], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [252, 252, 252] },
      })

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
    doc.save(`${selectedReport}-${new Date().toISOString().split("T")[0]}.pdf`)
    toast.success(`PDF downloaded - ${rows.length} records`)
    setGenerating(false)
  }

  const exportExcel = () => {
    setGenerating(true)
    const data = getReportData()

    let headers: string[] = []
    let rows: string[][] = []

    switch (selectedReport) {
      case "fleet-health":
        headers = ["Vehicle", "Health Score", "Status", "Days Active", "Total Checks", "Total Issues", "Pending", "Fixed", "Deferred", "Common Issue"]
        rows = (data as VehicleHealth[]).map(v => [
          v.vehicle_number,
          String(v.health_score),
          getHealthLabel(v.health_score),
          String(v.days_in_service),
          String(v.total_checks),
          String(v.total_issues),
          String(v.pending_issues),
          String(v.fixed_issues),
          String(v.deferred_issues),
          v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "-",
        ])
        break
      case "all-issues":
      case "pending-issues":
      case "resolved-issues":
        headers = ["Date", "Vehicle", "Driver", "Issue Type", "Description", "Status", "Resolution Notes", "Resolved Date"]
        ;(data as VehicleChecklist[]).forEach(c => {
          if (c.issues) {
            Object.entries(c.issues).forEach(([key, value]) => {
              const note = typeof value === "object" ? (value as IssueDetail).note : String(value)
              rows.push([
                formatDateTime(c.checked_at),
                c.vehicle_number,
                c.driver_name,
                ITEM_LABELS[key] || key,
                `"${note.replace(/"/g, '""')}"`,
                c.resolution_status || "pending",
                c.resolution_notes ? `"${c.resolution_notes.replace(/"/g, '""')}"` : "",
                c.resolved_at ? formatDate(c.resolved_at) : "",
              ])
            })
          }
        })
        break
      case "vehicle-checks":
        headers = ["Date", "Vehicle", "Driver", "Status", "Issues"]
        rows = (data as VehicleChecklist[]).map(c => [
          formatDateTime(c.checked_at),
          c.vehicle_number,
          c.driver_name,
          c.has_issues ? "Issue" : "OK",
          c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join("; ") : "-",
        ])
        break
      case "issue-breakdown":
        headers = ["Issue Type", "Occurrences", "Vehicles Affected"]
        rows = (data as { issue_type: string, count: number, vehicles_affected: number }[]).map(d => [
          d.issue_type,
          String(d.count),
          String(d.vehicles_affected),
        ])
        break
      case "vehicle-lifespan":
        headers = ["Vehicle", "Days Active", "Health Score", "Status", "Issue Rate", "Recommendation"]
        rows = (data as (VehicleHealth & { issue_rate: number, needs_replacement: boolean })[]).map(v => [
          v.vehicle_number,
          String(v.days_in_service),
          String(v.health_score),
          getHealthLabel(v.health_score),
          `${v.issue_rate}%`,
          v.needs_replacement ? "Replace" : "Keep",
        ])
        break
    }

    if (rows.length === 0) {
      toast.error("No data to export for selected date range")
      setGenerating(false)
      return
    }

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedReport}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} records exported`)
    setGenerating(false)
  }

  const filteredReports = REPORT_CATEGORIES.map(cat => ({
    ...cat,
    reports: cat.reports.filter(r =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.reports.length > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <PermissionGate permission="pretrip:view">
      <div className="flex h-[calc(100vh-120px)] gap-0">
        {/* Left Sidebar - Report List */}
        <div className="w-72 border-r bg-card/50 flex flex-col">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {filteredReports.map((category) => (
              <div key={category.name} className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground tracking-wider">
                  {category.name}
                </div>
                <div className="space-y-1">
                  {category.reports.map((report) => {
                    const Icon = report.icon
                    const isSelected = selectedReport === report.id
                    return (
                      <button
                        key={report.id}
                        onClick={() => setSelectedReport(report.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium truncate">{report.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b">
            <h1 className="text-2xl font-bold">{selectedReportInfo?.name}</h1>
            <p className="text-muted-foreground mt-1">{selectedReportInfo?.description}</p>

            {/* Date Range & Export */}
            <div className="flex items-center gap-4 mt-6 p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40 h-9 px-3 rounded-md border border-input bg-background text-sm cursor-pointer [color-scheme:dark]"
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40 h-9 px-3 rounded-md border border-input bg-background text-sm cursor-pointer [color-scheme:dark]"
                />
              </div>
              <div className="flex-1" />
              <Button
                variant="outline"
                onClick={exportPDF}
                disabled={generating}
                className="border-red-500/50 text-red-500 hover:bg-red-500/10"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                onClick={exportExcel}
                disabled={generating}
                className="border-green-500/50 text-green-500 hover:bg-green-500/10"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-3 mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-500">
                {selectedReport === "fleet-health" && "This report shows overall health status of all vehicles in your fleet."}
                {selectedReport === "all-issues" && "This report shows all issues found during pre-trip inspections for the selected date range."}
                {selectedReport === "vehicle-checks" && "This report shows all pre-trip inspection results including passed and failed checks."}
                {selectedReport === "issue-breakdown" && "This report categorizes issues by type to identify common problems across your fleet."}
                {selectedReport === "pending-issues" && "This report shows unresolved issues that require attention."}
                {selectedReport === "resolved-issues" && "This report shows issues that have been fixed along with resolution notes."}
                {selectedReport === "vehicle-lifespan" && "This report analyzes vehicle age and issue rates to recommend replacements."}
              </p>
            </div>
          </div>

          {/* Data Preview */}
          <div className="flex-1 overflow-auto p-6">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  {selectedReport === "fleet-health" && (
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Health</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Checks</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Issues</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Pending</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Common Issue</th>
                    </tr>
                  )}
                  {(selectedReport === "all-issues" || selectedReport === "pending-issues" || selectedReport === "resolved-issues") && (
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Driver</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Issues</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    </tr>
                  )}
                  {selectedReport === "vehicle-checks" && (
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Driver</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Result</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Details</th>
                    </tr>
                  )}
                  {selectedReport === "issue-breakdown" && (
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Issue Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrences</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Vehicles Affected</th>
                    </tr>
                  )}
                  {selectedReport === "vehicle-lifespan" && (
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Days Active</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Health</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Issue Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Recommendation</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y">
                  {selectedReport === "fleet-health" && vehicleHealthData.map((v) => (
                    <tr
                      key={v.vehicle_number}
                      className="hover:bg-muted/30 cursor-pointer group"
                      onClick={() => setSelectedVehicle(v.vehicle_number)}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {v.vehicle_number}
                          <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 font-bold", getHealthColor(v.health_score))}>{v.health_score}%</td>
                      <td className="px-4 py-3">
                        <Badge variant={v.health_score >= 80 ? "default" : v.health_score >= 60 ? "secondary" : "destructive"}>
                          {getHealthLabel(v.health_score)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{v.total_checks}</td>
                      <td className="px-4 py-3 text-orange-500">{v.total_issues}</td>
                      <td className="px-4 py-3 text-yellow-500">{v.pending_issues}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "-"}</td>
                    </tr>
                  ))}

                  {(selectedReport === "all-issues" || selectedReport === "pending-issues" || selectedReport === "resolved-issues") &&
                    (getReportData() as VehicleChecklist[]).slice(0, 50).map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm">{formatDateTime(c.checked_at)}</td>
                      <td className="px-4 py-3 font-medium">{c.vehicle_number}</td>
                      <td className="px-4 py-3">{c.driver_name}</td>
                      <td className="px-4 py-3 text-sm">{c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.resolution_status === "fixed" ? "default" : "secondary"}>
                          {c.resolution_status || "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}

                  {selectedReport === "vehicle-checks" &&
                    (getReportData() as VehicleChecklist[]).slice(0, 50).map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm">{formatDateTime(c.checked_at)}</td>
                      <td className="px-4 py-3 font-medium">{c.vehicle_number}</td>
                      <td className="px-4 py-3">{c.driver_name}</td>
                      <td className="px-4 py-3">
                        <Badge className={c.has_issues ? "bg-red-500" : "bg-green-500"}>
                          {c.has_issues ? "Issue" : "OK"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-"}</td>
                    </tr>
                  ))}

                  {selectedReport === "issue-breakdown" &&
                    (getReportData() as { issue_type: string, count: number, vehicles_affected: number }[]).map((d) => (
                    <tr key={d.issue_type} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{d.issue_type}</td>
                      <td className="px-4 py-3 text-orange-500 font-semibold">{d.count}</td>
                      <td className="px-4 py-3">{d.vehicles_affected}</td>
                    </tr>
                  ))}

                  {selectedReport === "vehicle-lifespan" &&
                    (getReportData() as (VehicleHealth & { issue_rate: number, needs_replacement: boolean })[]).map((v) => (
                    <tr
                      key={v.vehicle_number}
                      className="hover:bg-muted/30 cursor-pointer group"
                      onClick={() => setSelectedVehicle(v.vehicle_number)}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {v.vehicle_number}
                          <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </td>
                      <td className="px-4 py-3">{v.days_in_service} days</td>
                      <td className={cn("px-4 py-3 font-bold", getHealthColor(v.health_score))}>{v.health_score}%</td>
                      <td className="px-4 py-3">{v.issue_rate}%</td>
                      <td className="px-4 py-3">
                        <Badge variant={v.needs_replacement ? "destructive" : "default"}>
                          {v.needs_replacement ? "Consider Replacement" : "Keep"}
                        </Badge>
                      </td>
                    </tr>
                  ))}

                  {getReportData().length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        No data available for the selected date range
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {(getReportData() as unknown[]).length > 50 && (
              <p className="text-center text-sm text-muted-foreground mt-4">
                Showing first 50 records. Export to see all {(getReportData() as unknown[]).length} records.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Vehicle History Dialog */}
      <Dialog open={!!selectedVehicle} onOpenChange={() => setSelectedVehicle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle History: {selectedVehicle}
            </DialogTitle>
          </DialogHeader>

          {selectedVehicle && (() => {
            const vehicleHealth = vehicleHealthData.find(v => v.vehicle_number === selectedVehicle)
            const vehicleChecklists = allChecklists.filter(c => c.vehicle_number === selectedVehicle)

            return (
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* Summary Stats */}
                {vehicleHealth && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className={cn("text-2xl font-bold", getHealthColor(vehicleHealth.health_score))}>
                        {vehicleHealth.health_score}%
                      </p>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold">{vehicleHealth.total_checks}</p>
                      <p className="text-xs text-muted-foreground">Total Checks</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold text-orange-500">{vehicleHealth.total_issues}</p>
                      <p className="text-xs text-muted-foreground">Total Issues</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold text-yellow-500">{vehicleHealth.pending_issues}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                )}

                {/* Issue Breakdown */}
                {vehicleHealth && Object.keys(vehicleHealth.issue_breakdown).length > 0 && (
                  <div className="p-4 rounded-lg border">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Issue Breakdown
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(vehicleHealth.issue_breakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([issue, count]) => (
                          <Badge key={issue} variant="outline" className="text-sm">
                            {ITEM_LABELS[issue] || issue}: {count}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                {/* Check History */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b">
                    <h3 className="font-medium flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" />
                      Pre-trip Check History ({vehicleChecklists.length})
                    </h3>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-muted/30 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Driver</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Issues</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Resolution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vehicleChecklists.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                              No pre-trip checks recorded for this vehicle
                            </td>
                          </tr>
                        ) : (
                          vehicleChecklists.map(check => (
                            <tr key={check.id} className={check.has_issues ? "bg-red-500/5" : ""}>
                              <td className="px-4 py-2 text-sm">{formatDateTime(check.checked_at)}</td>
                              <td className="px-4 py-2 text-sm">{check.driver_name}</td>
                              <td className="px-4 py-2">
                                <Badge className={cn("text-xs", check.has_issues ? "bg-red-500" : "bg-green-500")}>
                                  {check.has_issues ? "Issue" : "OK"}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-sm text-muted-foreground">
                                {check.issues
                                  ? Object.keys(check.issues).map(k => ITEM_LABELS[k] || k).join(", ")
                                  : "-"}
                              </td>
                              <td className="px-4 py-2">
                                {check.has_issues && (
                                  <Badge
                                    variant={check.resolution_status === "fixed" ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {check.resolution_status || "Pending"}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </PermissionGate>
  )
}
