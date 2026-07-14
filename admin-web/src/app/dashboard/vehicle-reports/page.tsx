"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Car, AlertTriangle, CheckCircle, Clock, Wrench,
  Loader2, RefreshCw, Search, XCircle,
  History, Download, Calendar, Activity,
  AlertCircle, BarChart3, FileDown, FileSpreadsheet,
} from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

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
  all_items: Record<string, boolean> | null
  checked_at: string
  remarks: string | null
  resolution_status: 'pending' | 'fixed' | 'deferred' | 'not_applicable'
  resolved_at: string | null
  resolved_by: string | null
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

const RESOLUTION_STATUS_LABELS: Record<string, { label: string, color: string, icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-yellow-500", icon: Clock },
  fixed: { label: "Fixed", color: "bg-green-500", icon: CheckCircle },
  deferred: { label: "Deferred", color: "bg-blue-500", icon: Clock },
  not_applicable: { label: "N/A", color: "bg-gray-400", icon: XCircle },
}

export default function VehicleReportsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [vehicleHealthData, setVehicleHealthData] = useState<VehicleHealth[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [vehicleChecklists, setVehicleChecklists] = useState<VehicleChecklist[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"issues" | "pending" | "health">("pending")
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [resolvingChecklist, setResolvingChecklist] = useState<VehicleChecklist | null>(null)
  const [resolutionStatus, setResolutionStatus] = useState<string>("fixed")
  const [resolutionNotes, setResolutionNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [stats, setStats] = useState({
    totalVehicles: 0,
    totalIssues: 0,
    pendingIssues: 0,
    fixedIssues: 0,
    avgHealthScore: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: checklists, error } = await supabase
      .from("vehicle_checklists")
      .select("*")
      .order("checked_at", { ascending: false })

    if (error) {
      toast.error("Failed to load data")
      setLoading(false)
      return
    }

    const vehicleMap = new Map<string, VehicleHealth>()

    let totalIssues = 0
    let pendingIssues = 0
    let fixedIssues = 0

    for (const check of checklists || []) {
      const vn = check.vehicle_number || "Unknown"
      if (!vn || vn === "Unknown" || vn === "") continue

      if (!vehicleMap.has(vn)) {
        vehicleMap.set(vn, {
          vehicle_number: vn,
          total_checks: 0,
          total_issues: 0,
          pending_issues: 0,
          fixed_issues: 0,
          deferred_issues: 0,
          last_check: null,
          first_check: null,
          most_common_issue: null,
          issue_breakdown: {},
          health_score: 100,
          days_in_service: 0,
        })
      }

      const health = vehicleMap.get(vn)!
      health.total_checks++

      if (!health.last_check || new Date(check.checked_at) > new Date(health.last_check)) {
        health.last_check = check.checked_at
      }
      if (!health.first_check || new Date(check.checked_at) < new Date(health.first_check)) {
        health.first_check = check.checked_at
      }

      if (check.has_issues) {
        health.total_issues++
        totalIssues++

        if (check.resolution_status === "pending") {
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

      if (health.first_check) {
        health.days_in_service = Math.ceil(
          (Date.now() - new Date(health.first_check).getTime()) / (1000 * 60 * 60 * 24)
        )
      }

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

  const loadVehicleDetails = async (vehicleNumber: string) => {
    setDetailLoading(true)
    setSelectedVehicle(vehicleNumber)

    const { data } = await supabase
      .from("vehicle_checklists")
      .select("*")
      .eq("vehicle_number", vehicleNumber)
      .order("checked_at", { ascending: false })

    setVehicleChecklists(data || [])
    setDetailLoading(false)
  }

  const openResolveDialog = (checklist: VehicleChecklist) => {
    setResolvingChecklist(checklist)
    setResolutionStatus(checklist.resolution_status || "fixed")
    setResolutionNotes(checklist.resolution_notes || "")
    setResolveDialogOpen(true)
  }

  const handleResolve = async () => {
    if (!resolvingChecklist) return
    setSaving(true)

    const { error } = await supabase
      .from("vehicle_checklists")
      .update({
        resolution_status: resolutionStatus,
        resolution_notes: resolutionNotes,
        resolved_at: resolutionStatus === "fixed" ? new Date().toISOString() : null,
        resolved_by: "Admin",
      })
      .eq("id", resolvingChecklist.id)

    if (error) {
      toast.error("Failed to update")
    } else {
      toast.success("Resolution updated")
      setResolveDialogOpen(false)
      if (selectedVehicle) {
        loadVehicleDetails(selectedVehicle)
      }
      loadData()
    }
    setSaving(false)
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

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500"
    if (score >= 60) return "text-yellow-500"
    if (score >= 40) return "text-orange-500"
    return "text-red-500"
  }

  const getHealthBg = (score: number) => {
    if (score >= 80) return "bg-green-500"
    if (score >= 60) return "bg-yellow-500"
    if (score >= 40) return "bg-orange-500"
    return "bg-red-500"
  }

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent"
    if (score >= 60) return "Good"
    if (score >= 40) return "Fair"
    return "Poor"
  }

  // Download fleet summary as CSV
  const downloadFleetCSV = () => {
    const headers = [
      "Vehicle", "Health Score", "Status", "Days in Service",
      "Total Checks", "Total Issues", "Pending", "Fixed", "Deferred",
      "Most Common Issue", "First Check", "Last Check"
    ]

    const rows = sortedVehicles.map(v => [
      v.vehicle_number,
      v.health_score,
      getHealthLabel(v.health_score),
      v.days_in_service,
      v.total_checks,
      v.total_issues,
      v.pending_issues,
      v.fixed_issues,
      v.deferred_issues,
      v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "None",
      v.first_check ? formatDate(v.first_check) : "",
      v.last_check ? formatDate(v.last_check) : ""
    ])

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `fleet-health-report-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Fleet report downloaded")
  }

  // Download single vehicle report as HTML (printable)
  const downloadVehicleReport = () => {
    if (!selectedVehicle || !selectedVehicleData) return

    const v = selectedVehicleData
    const issuesWithProblems = vehicleChecklists.filter(c => c.has_issues)

    const reportDate = new Date().toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Vehicle Report - ${v.vehicle_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.6; max-width: 900px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #f59e0b; }
    .logo { font-size: 24px; font-weight: 700; color: #f59e0b; }
    .report-title { font-size: 14px; color: #666; margin-top: 4px; }
    .vehicle-id { font-size: 36px; font-weight: 800; }
    .health-score { font-size: 48px; font-weight: 800; }
    .health-excellent { color: #16a34a; }
    .health-good { color: #ca8a04; }
    .health-fair { color: #ea580c; }
    .health-poor { color: #dc2626; }
    .health-label { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 4px; }
    .label-excellent { background: #dcfce7; color: #166534; }
    .label-good { background: #fef9c3; color: #854d0e; }
    .label-fair { background: #ffedd5; color: #9a3412; }
    .label-poor { background: #fee2e2; color: #991b1b; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
    .stat-card { background: #f8f9fa; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e5e5e5; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px; }
    .stat-pending { color: #ca8a04; }
    .stat-issues { color: #ea580c; }
    .stat-fixed { color: #16a34a; }
    .section { margin: 32px 0; }
    .section-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e5e5; display: flex; align-items: center; gap: 8px; }
    .breakdown-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .breakdown-item { background: #fef2f2; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center; }
    .breakdown-label { font-weight: 500; color: #991b1b; }
    .breakdown-count { font-size: 20px; font-weight: 700; color: #dc2626; }
    .issue-card { background: #fff; border: 1px solid #e5e5e5; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 12px; border-radius: 0 8px 8px 0; }
    .issue-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .issue-date { color: #666; font-size: 13px; }
    .issue-status { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-fixed { background: #dcfce7; color: #166534; }
    .status-deferred { background: #dbeafe; color: #1e40af; }
    .issue-item { margin: 8px 0; padding-left: 12px; border-left: 2px solid #fca5a5; font-size: 14px; }
    .issue-type { font-weight: 600; color: #dc2626; }
    .resolution { background: #f0fdf4; padding: 10px; border-radius: 6px; margin-top: 10px; font-size: 13px; }
    .summary-box { background: #fffbeb; border: 2px solid #fbbf24; border-radius: 12px; padding: 20px; margin-top: 32px; }
    .summary-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #92400e; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .summary-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fde68a; }
    .summary-item:last-child { border-bottom: none; }
    .warning-box { background: #fee2e2; border: 2px solid #ef4444; border-radius: 12px; padding: 16px; margin-top: 20px; }
    .warning-title { font-weight: 700; color: #991b1b; margin-bottom: 8px; }
    .warning-text { font-size: 14px; color: #7f1d1d; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #666; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">MyRide</div>
      <div class="report-title">Vehicle Health Report • Generated ${reportDate}</div>
      <div class="vehicle-id">${v.vehicle_number}</div>
      <div style="color: #666; font-size: 14px; margin-top: 4px;">${v.days_in_service} days in service${v.first_check ? ` • Since ${formatDate(v.first_check)}` : ""}</div>
    </div>
    <div style="text-align: right;">
      <div class="health-score health-${getHealthLabel(v.health_score).toLowerCase()}">${v.health_score}%</div>
      <div class="health-label label-${getHealthLabel(v.health_score).toLowerCase()}">${getHealthLabel(v.health_score)} Health</div>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${v.total_checks}</div>
      <div class="stat-label">Inspections</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-issues">${v.total_issues}</div>
      <div class="stat-label">Total Issues</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-pending">${v.pending_issues}</div>
      <div class="stat-label">Pending</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-fixed">${v.fixed_issues}</div>
      <div class="stat-label">Fixed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${v.deferred_issues}</div>
      <div class="stat-label">Deferred</div>
    </div>
  </div>

  ${Object.keys(v.issue_breakdown).length > 0 ? `
  <div class="section">
    <div class="section-title">⚠️ Issue Breakdown by Type</div>
    <div class="breakdown-grid">
      ${Object.entries(v.issue_breakdown).sort((a, b) => b[1] - a[1]).map(([key, count]) => `
        <div class="breakdown-item">
          <span class="breakdown-label">${ITEM_LABELS[key] || key}</span>
          <span class="breakdown-count">${count}×</span>
        </div>
      `).join("")}
    </div>
  </div>
  ` : ""}

  <div class="section">
    <div class="section-title">📋 Issue History (${issuesWithProblems.length} records)</div>
    ${issuesWithProblems.length === 0 ? `
      <p style="color: #666; padding: 20px; text-align: center; background: #f0fdf4; border-radius: 8px;">✓ No issues recorded for this vehicle</p>
    ` : issuesWithProblems.map(check => {
      const statusClass = check.resolution_status === 'fixed' ? 'status-fixed' : check.resolution_status === 'deferred' ? 'status-deferred' : 'status-pending'
      const statusLabel = check.resolution_status === 'fixed' ? 'Fixed' : check.resolution_status === 'deferred' ? 'Deferred' : 'Pending'
      return `
      <div class="issue-card">
        <div class="issue-header">
          <span class="issue-date">${formatDateTime(check.checked_at)} • ${check.driver_name}</span>
          <span class="issue-status ${statusClass}">${statusLabel}</span>
        </div>
        ${check.issues ? Object.entries(check.issues).map(([key, value]) => {
          const note = typeof value === "object" ? (value as IssueDetail).note : value
          return `<div class="issue-item"><span class="issue-type">${ITEM_LABELS[key] || key}:</span> ${note}</div>`
        }).join("") : ""}
        ${check.resolution_notes ? `<div class="resolution"><strong>Resolution:</strong> ${check.resolution_notes}${check.resolved_at ? ` (${formatDate(check.resolved_at)})` : ""}</div>` : ""}
      </div>`
    }).join("")}
  </div>

  <div class="summary-box">
    <div class="summary-title">📊 Vehicle Assessment Summary</div>
    <div class="summary-grid">
      <div class="summary-item">
        <span>Issue Rate</span>
        <span style="font-weight: 600;">${v.total_checks > 0 ? Math.round((v.total_issues / v.total_checks) * 100) : 0}%</span>
      </div>
      <div class="summary-item">
        <span>Pending Issues</span>
        <span style="font-weight: 600; color: ${v.pending_issues > 0 ? '#ca8a04' : '#16a34a'};">${v.pending_issues}</span>
      </div>
      <div class="summary-item">
        <span>Most Common Issue</span>
        <span style="font-weight: 600;">${v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "None"}</span>
      </div>
      <div class="summary-item">
        <span>Last Inspection</span>
        <span style="font-weight: 600;">${v.last_check ? formatDate(v.last_check) : "Never"}</span>
      </div>
    </div>
  </div>

  ${v.health_score < 50 ? `
  <div class="warning-box">
    <div class="warning-title">⚠️ Vehicle Needs Attention</div>
    <div class="warning-text">This vehicle has a poor health score (${v.health_score}%) due to frequent issues and unresolved problems. Consider evaluating for replacement or major maintenance.</div>
  </div>
  ` : ""}

  <div class="footer">
    <p><strong>MyRide Fleet Management</strong> • Vehicle Health Report</p>
    <p>This report is automatically generated and intended for internal use only.</p>
  </div>
</body>
</html>`

    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vehicle-report-${v.vehicle_number}-${new Date().toISOString().split("T")[0]}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Report downloaded - Open in browser and print to PDF")
  }

  // Download vehicle history as CSV
  const downloadVehicleCSV = () => {
    if (!selectedVehicle) return

    const headers = ["Date", "Driver", "Issue Type", "Description", "Status", "Resolution Notes", "Resolved Date"]
    const rows: string[][] = []

    vehicleChecklists.forEach(check => {
      if (check.has_issues && check.issues) {
        Object.entries(check.issues).forEach(([key, value]) => {
          const note = typeof value === "object" ? (value as IssueDetail).note : value
          rows.push([
            formatDateTime(check.checked_at),
            check.driver_name,
            ITEM_LABELS[key] || key,
            `"${note}"`,
            check.resolution_status,
            check.resolution_notes ? `"${check.resolution_notes}"` : "",
            check.resolved_at ? formatDate(check.resolved_at) : ""
          ])
        })
      }
    })

    if (rows.length === 0) {
      toast.error("No issues to export")
      return
    }

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vehicle-issues-${selectedVehicle}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Issue history downloaded")
  }

  const sortedVehicles = useMemo(() => {
    let filtered = vehicleHealthData.filter(v =>
      v.vehicle_number.toLowerCase().includes(search.toLowerCase())
    )

    switch (sortBy) {
      case "pending":
        return filtered.sort((a, b) => b.pending_issues - a.pending_issues || b.total_issues - a.total_issues)
      case "issues":
        return filtered.sort((a, b) => b.total_issues - a.total_issues)
      case "health":
        return filtered.sort((a, b) => a.health_score - b.health_score)
      default:
        return filtered
    }
  }, [vehicleHealthData, search, sortBy])

  const selectedVehicleData = vehicleHealthData.find(v => v.vehicle_number === selectedVehicle)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="w-64 h-8 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 h-[500px] bg-muted/30 rounded-xl animate-pulse" />
          <div className="col-span-2 h-[500px] bg-muted/30 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <PermissionGate permission="pretrip:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Vehicle Reports
            </h1>
            <p className="text-sm text-muted-foreground">
              Track issues, breakdowns & vehicle lifespan for replacement decisions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadFleetCSV}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Fleet Summary (CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-5">
          <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-500/20">
                <Car className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalVehicles}</p>
                <p className="text-xs text-muted-foreground">Vehicles</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/20">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">{stats.totalIssues}</p>
                <p className="text-xs text-muted-foreground">Total Issues</p>
              </div>
            </div>
          </Card>

          <Card className={`p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 ${stats.pendingIssues > 0 ? 'ring-2 ring-yellow-500/50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500">{stats.pendingIssues}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{stats.fixedIssues}</p>
                <p className="text-xs text-muted-foreground">Fixed</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/20">
                <Activity className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getHealthColor(stats.avgHealthScore)}`}>{stats.avgHealthScore}%</p>
                <p className="text-xs text-muted-foreground">Avg Health</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-1 p-0 overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Fleet Overview</h2>
                <Select value={sortBy} onValueChange={(v: typeof sortBy) => setSortBy(v)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">By Pending</SelectItem>
                    <SelectItem value="issues">By Issues</SelectItem>
                    <SelectItem value="health">By Health</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vehicle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              {sortedVehicles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Car className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No vehicles found</p>
                </div>
              ) : (
                sortedVehicles.map(vehicle => (
                  <div
                    key={vehicle.vehicle_number}
                    onClick={() => loadVehicleDetails(vehicle.vehicle_number)}
                    className={`p-4 border-b cursor-pointer transition-all hover:bg-muted/50 ${selectedVehicle === vehicle.vehicle_number ? 'bg-primary/10 border-l-4 border-l-primary' : ''} ${vehicle.pending_issues > 0 ? 'bg-yellow-50/50 dark:bg-yellow-950/10' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{vehicle.vehicle_number}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${getHealthBg(vehicle.health_score)}`} />
                        <span className={`text-sm font-medium ${getHealthColor(vehicle.health_score)}`}>
                          {vehicle.health_score}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        {vehicle.total_issues} issues
                      </span>
                      <span>{vehicle.days_in_service}d service</span>
                    </div>

                    {vehicle.pending_issues > 0 && (
                      <Badge className="mt-2 bg-yellow-500 text-xs">
                        {vehicle.pending_issues} pending
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="col-span-2 p-0 overflow-hidden">
            {!selectedVehicle ? (
              <div className="flex flex-col items-center justify-center h-[580px] text-muted-foreground">
                <Car className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a Vehicle</p>
                <p className="text-sm">Click on a vehicle to view its health report</p>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-[580px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="p-5 border-b bg-gradient-to-r from-muted/50 to-transparent">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Car className="h-5 w-5" />
                        {selectedVehicle}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedVehicleData?.days_in_service || 0} days in service
                        {selectedVehicleData?.first_check && ` • Since ${formatDate(selectedVehicleData.first_check)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={downloadVehicleReport}>
                            <FileDown className="h-4 w-4 mr-2" />
                            Full Report (HTML/PDF)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadVehicleCSV}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Issue History (CSV)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="text-right">
                        <div className={`text-3xl font-bold ${getHealthColor(selectedVehicleData?.health_score || 0)}`}>
                          {selectedVehicleData?.health_score || 0}%
                        </div>
                        <Badge className={`${getHealthBg(selectedVehicleData?.health_score || 0)} mt-1`}>
                          {getHealthLabel(selectedVehicleData?.health_score || 0)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3 mt-4">
                    <div className="p-3 rounded-lg bg-background/80 border text-center">
                      <p className="text-lg font-bold">{selectedVehicleData?.total_checks || 0}</p>
                      <p className="text-xs text-muted-foreground">Checks</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/80 border text-center">
                      <p className="text-lg font-bold text-orange-500">{selectedVehicleData?.total_issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Issues</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/80 border text-center">
                      <p className="text-lg font-bold text-yellow-500">{selectedVehicleData?.pending_issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/80 border text-center">
                      <p className="text-lg font-bold text-green-500">{selectedVehicleData?.fixed_issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Fixed</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/80 border text-center">
                      <p className="text-lg font-bold text-blue-500">{selectedVehicleData?.deferred_issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Deferred</p>
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="issues" className="flex-1">
                  <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                    <TabsTrigger value="issues" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Issues ({vehicleChecklists.filter(c => c.has_issues).length})
                    </TabsTrigger>
                    <TabsTrigger value="breakdown" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Breakdown
                    </TabsTrigger>
                    <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
                      <History className="h-4 w-4 mr-2" />
                      All Checks ({vehicleChecklists.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="issues" className="m-0 max-h-[320px] overflow-y-auto">
                    {vehicleChecklists.filter(c => c.has_issues).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mb-3 text-green-500/30" />
                        <p>No issues reported for this vehicle</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {vehicleChecklists.filter(c => c.has_issues).map(check => {
                          const statusConfig = RESOLUTION_STATUS_LABELS[check.resolution_status] || RESOLUTION_STATUS_LABELS.pending
                          const StatusIcon = statusConfig.icon

                          return (
                            <div key={check.id} className={`p-4 ${check.resolution_status === 'pending' ? 'bg-yellow-50/50 dark:bg-yellow-950/20' : ''}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className={statusConfig.color}>
                                      <StatusIcon className="h-3 w-3 mr-1" />
                                      {statusConfig.label}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">{formatDateTime(check.checked_at)}</span>
                                    <span className="text-sm">• {check.driver_name}</span>
                                  </div>

                                  {check.issues && Object.entries(check.issues).map(([key, value]) => {
                                    const isDetail = typeof value === "object" && value !== null
                                    const note = isDetail ? (value as IssueDetail).note : value as string
                                    const photos = isDetail ? (value as IssueDetail).photos : undefined

                                    return (
                                      <div key={key} className="ml-4 mb-2 pl-3 border-l-2 border-red-300">
                                        <span className="font-medium text-red-600">{ITEM_LABELS[key] || key}</span>
                                        <span className="text-muted-foreground ml-2">{note}</span>
                                        {photos && photos.length > 0 && (
                                          <div className="flex gap-2 mt-2">
                                            {photos.map((photo, i) => (
                                              <a key={i} href={photo} target="_blank" rel="noopener noreferrer">
                                                <img src={photo} alt="" className="h-12 w-12 object-cover rounded border hover:opacity-80" />
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}

                                  {check.resolution_notes && (
                                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-sm">
                                      <span className="font-medium text-green-700 dark:text-green-400">Resolution:</span>{" "}
                                      <span className="text-green-600 dark:text-green-300">{check.resolution_notes}</span>
                                      {check.resolved_at && (
                                        <span className="text-muted-foreground ml-2">({formatDate(check.resolved_at)})</span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <Button
                                  size="sm"
                                  variant={check.resolution_status === "pending" ? "default" : "outline"}
                                  onClick={() => openResolveDialog(check)}
                                >
                                  {check.resolution_status === "pending" ? (
                                    <>
                                      <Wrench className="h-3 w-3 mr-1" />
                                      Resolve
                                    </>
                                  ) : (
                                    "Edit"
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="breakdown" className="m-0 p-4">
                    {Object.keys(selectedVehicleData?.issue_breakdown || {}).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mb-3 text-green-500/30" />
                        <p>No issues to analyze</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h3 className="font-semibold">Issue Frequency by Type</h3>
                        <div className="grid grid-cols-3 gap-3">
                          {Object.entries(selectedVehicleData?.issue_breakdown || {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, count]) => (
                              <div key={key} className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-red-700 dark:text-red-400">{ITEM_LABELS[key] || key}</span>
                                  <span className="text-2xl font-bold text-red-600">{count}×</span>
                                </div>
                              </div>
                            ))}
                        </div>

                        <Card className="p-4 mt-6 bg-muted/30">
                          <h3 className="font-semibold mb-3">Vehicle Summary</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-muted-foreground">Issue Rate</span>
                              <span className="font-medium">
                                {selectedVehicleData?.total_checks
                                  ? Math.round((selectedVehicleData.total_issues / selectedVehicleData.total_checks) * 100)
                                  : 0}%
                              </span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-muted-foreground">Most Common</span>
                              <span className="font-medium">
                                {selectedVehicleData?.most_common_issue
                                  ? ITEM_LABELS[selectedVehicleData.most_common_issue] || selectedVehicleData.most_common_issue
                                  : "None"}
                              </span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-muted-foreground">First Check</span>
                              <span className="font-medium">
                                {selectedVehicleData?.first_check ? formatDate(selectedVehicleData.first_check) : "N/A"}
                              </span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-muted-foreground">Last Check</span>
                              <span className="font-medium">
                                {selectedVehicleData?.last_check ? formatDate(selectedVehicleData.last_check) : "N/A"}
                              </span>
                            </div>
                          </div>
                        </Card>

                        {(selectedVehicleData?.health_score || 0) < 50 && (
                          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="h-6 w-6 text-red-500 mt-0.5" />
                              <div>
                                <p className="font-semibold text-red-700 dark:text-red-400">Vehicle Replacement Recommended</p>
                                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                                  This vehicle has poor health ({selectedVehicleData?.health_score}%) due to frequent issues.
                                  Consider requesting a replacement from management.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="all" className="m-0 max-h-[320px] overflow-y-auto">
                    {vehicleChecklists.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Calendar className="h-12 w-12 mb-3 opacity-30" />
                        <p>No inspections recorded</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {vehicleChecklists.map(check => (
                          <div key={check.id} className="p-3 flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${check.has_issues ? 'bg-red-100 dark:bg-red-950/30' : 'bg-green-100 dark:bg-green-950/30'}`}>
                              {check.has_issues ? (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{check.driver_name}</span>
                                <Badge variant="outline" className={check.has_issues ? 'text-red-500 border-red-300' : 'text-green-500 border-green-300'}>
                                  {check.has_issues ? 'Issue' : 'OK'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{formatDateTime(check.checked_at)}</p>
                            </div>
                            {check.has_issues && check.issues && (
                              <div className="text-xs text-muted-foreground">
                                {Object.keys(check.issues).length} item(s)
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </Card>
        </div>

        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Resolve Issue
              </DialogTitle>
            </DialogHeader>

            {resolvingChecklist && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-muted-foreground">Vehicle:</span>{" "}
                      <span className="font-medium">{resolvingChecklist.vehicle_number}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Driver:</span>{" "}
                      <span className="font-medium">{resolvingChecklist.driver_name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      <span className="font-medium">{formatDateTime(resolvingChecklist.checked_at)}</span>
                    </div>
                  </div>
                </div>

                {resolvingChecklist.issues && (
                  <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Issues Reported
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(resolvingChecklist.issues).map(([key, value]) => {
                        const note = typeof value === "object" ? (value as IssueDetail).note : value
                        return (
                          <div key={key} className="text-sm">
                            <span className="font-medium">{ITEM_LABELS[key] || key}:</span>{" "}
                            <span className="text-muted-foreground">{note}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Resolution Status</label>
                    <Select value={resolutionStatus} onValueChange={setResolutionStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Fixed
                          </div>
                        </SelectItem>
                        <SelectItem value="deferred">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            Deferred (will fix later)
                          </div>
                        </SelectItem>
                        <SelectItem value="pending">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-500" />
                            Still Pending
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Resolution Notes</label>
                    <Textarea
                      placeholder="Describe what was done to fix the issue..."
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleResolve} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
