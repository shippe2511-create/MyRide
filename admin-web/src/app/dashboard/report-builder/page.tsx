"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Play,
  Download,
  Plus,
  X,
  FileSpreadsheet,
  Calendar,
  ArrowUpDown,
  BarChart3,
  Clock,
  TrendingUp,
} from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"

interface Column {
  id: string
  name: string
  table: string
  type?: "text" | "number" | "date" | "boolean"
}

interface Filter {
  column: string
  operator: string
  value: string
}

const TABLES = [
  { id: "rides", name: "Rides", icon: "🚗" },
  { id: "profiles", name: "Customers/Users", icon: "👥" },
  { id: "drivers", name: "Drivers", icon: "🧑‍✈️" },
  { id: "vehicle_types", name: "Vehicles", icon: "🚙" },
  { id: "shifts", name: "Shifts", icon: "📅" },
  { id: "ratings", name: "Ratings", icon: "⭐" },
  { id: "incidents", name: "Incidents", icon: "⚠️" },
  { id: "support_tickets", name: "Support Tickets", icon: "🎫" },
  { id: "sos_alerts", name: "SOS Alerts", icon: "🆘" },
  { id: "saved_places", name: "Saved Places", icon: "📍" },
  { id: "notifications", name: "Notifications", icon: "🔔" },
]

const COLUMNS: Record<string, Column[]> = {
  profiles: [
    { id: "id", name: "ID", table: "profiles" },
    { id: "full_name", name: "Name", table: "profiles", type: "text" },
    { id: "email", name: "Email", table: "profiles", type: "text" },
    { id: "phone", name: "Phone", table: "profiles", type: "text" },
    { id: "status", name: "Status", table: "profiles", type: "text" },
    { id: "role", name: "Role", table: "profiles", type: "text" },
    { id: "department", name: "Department", table: "profiles", type: "text" },
    { id: "employee_id", name: "Employee ID", table: "profiles", type: "text" },
    { id: "created_at", name: "Created At", table: "profiles", type: "date" },
  ],
  drivers: [
    { id: "id", name: "ID", table: "drivers" },
    { id: "profile_id", name: "Profile ID", table: "drivers" },
    { id: "is_online", name: "Online", table: "drivers", type: "boolean" },
    { id: "is_on_break", name: "On Break", table: "drivers", type: "boolean" },
    { id: "rating", name: "Rating", table: "drivers", type: "number" },
    { id: "total_trips", name: "Total Trips", table: "drivers", type: "number" },
    { id: "vehicle_id", name: "Vehicle ID", table: "drivers" },
    { id: "created_at", name: "Created At", table: "drivers", type: "date" },
  ],
  rides: [
    { id: "id", name: "ID", table: "rides" },
    { id: "customer_id", name: "Customer ID", table: "rides" },
    { id: "driver_id", name: "Driver ID", table: "rides" },
    { id: "status", name: "Status", table: "rides", type: "text" },
    { id: "pickup_name", name: "Pickup", table: "rides", type: "text" },
    { id: "dropoff_name", name: "Dropoff", table: "rides", type: "text" },
    { id: "distance_km", name: "Distance (km)", table: "rides", type: "number" },
    { id: "duration_minutes", name: "Duration (min)", table: "rides", type: "number" },
    { id: "scheduled_time", name: "Scheduled Time", table: "rides", type: "date" },
    { id: "created_at", name: "Created At", table: "rides", type: "date" },
    { id: "completed_at", name: "Completed At", table: "rides", type: "date" },
  ],
  vehicle_types: [
    { id: "id", name: "ID", table: "vehicle_types" },
    { id: "name", name: "Name", table: "vehicle_types", type: "text" },
    { id: "display_name", name: "Display Name", table: "vehicle_types", type: "text" },
    { id: "plate_no", name: "Plate No", table: "vehicle_types", type: "text" },
    { id: "capacity", name: "Capacity", table: "vehicle_types", type: "number" },
    { id: "status", name: "Status", table: "vehicle_types", type: "text" },
    { id: "created_at", name: "Created At", table: "vehicle_types", type: "date" },
  ],
  shifts: [
    { id: "id", name: "ID", table: "shifts" },
    { id: "driver_id", name: "Driver ID", table: "shifts" },
    { id: "shift_date", name: "Date", table: "shifts", type: "date" },
    { id: "start_time", name: "Start Time", table: "shifts", type: "text" },
    { id: "end_time", name: "End Time", table: "shifts", type: "text" },
    { id: "shift_type", name: "Type", table: "shifts", type: "text" },
    { id: "status", name: "Status", table: "shifts", type: "text" },
  ],
  incidents: [
    { id: "id", name: "ID", table: "incidents" },
    { id: "type", name: "Type", table: "incidents", type: "text" },
    { id: "severity", name: "Severity", table: "incidents", type: "text" },
    { id: "title", name: "Title", table: "incidents", type: "text" },
    { id: "description", name: "Description", table: "incidents", type: "text" },
    { id: "status", name: "Status", table: "incidents", type: "text" },
    { id: "created_at", name: "Created At", table: "incidents", type: "date" },
    { id: "resolved_at", name: "Resolved At", table: "incidents", type: "date" },
  ],
  ratings: [
    { id: "id", name: "ID", table: "ratings" },
    { id: "ride_id", name: "Ride ID", table: "ratings" },
    { id: "driver_id", name: "Driver ID", table: "ratings" },
    { id: "rating", name: "Rating", table: "ratings", type: "number" },
    { id: "comment", name: "Comment", table: "ratings", type: "text" },
    { id: "created_at", name: "Created At", table: "ratings", type: "date" },
  ],
  support_tickets: [
    { id: "id", name: "ID", table: "support_tickets" },
    { id: "user_id", name: "User ID", table: "support_tickets" },
    { id: "driver_id", name: "Driver ID", table: "support_tickets" },
    { id: "ride_id", name: "Ride ID", table: "support_tickets" },
    { id: "category", name: "Category", table: "support_tickets", type: "text" },
    { id: "description", name: "Description", table: "support_tickets", type: "text" },
    { id: "status", name: "Status", table: "support_tickets", type: "text" },
    { id: "admin_notes", name: "Admin Notes", table: "support_tickets", type: "text" },
    { id: "created_at", name: "Created At", table: "support_tickets", type: "date" },
    { id: "resolved_at", name: "Resolved At", table: "support_tickets", type: "date" },
  ],
  sos_alerts: [
    { id: "id", name: "ID", table: "sos_alerts" },
    { id: "user_id", name: "User ID", table: "sos_alerts" },
    { id: "ride_id", name: "Ride ID", table: "sos_alerts" },
    { id: "status", name: "Status", table: "sos_alerts", type: "text" },
    { id: "latitude", name: "Latitude", table: "sos_alerts", type: "number" },
    { id: "longitude", name: "Longitude", table: "sos_alerts", type: "number" },
    { id: "created_at", name: "Created At", table: "sos_alerts", type: "date" },
  ],
  saved_places: [
    { id: "id", name: "ID", table: "saved_places" },
    { id: "user_id", name: "User ID", table: "saved_places" },
    { id: "name", name: "Name", table: "saved_places", type: "text" },
    { id: "address", name: "Address", table: "saved_places", type: "text" },
    { id: "icon", name: "Icon", table: "saved_places", type: "text" },
    { id: "created_at", name: "Created At", table: "saved_places", type: "date" },
  ],
  notifications: [
    { id: "id", name: "ID", table: "notifications" },
    { id: "user_id", name: "User ID", table: "notifications" },
    { id: "title", name: "Title", table: "notifications", type: "text" },
    { id: "body", name: "Body", table: "notifications", type: "text" },
    { id: "type", name: "Type", table: "notifications", type: "text" },
    { id: "read", name: "Read", table: "notifications", type: "boolean" },
    { id: "created_at", name: "Created At", table: "notifications", type: "date" },
  ],
}

const OPERATORS = [
  { id: "eq", name: "Equals", icon: "=" },
  { id: "neq", name: "Not Equals", icon: "≠" },
  { id: "gt", name: "Greater Than", icon: ">" },
  { id: "gte", name: "Greater or Equal", icon: "≥" },
  { id: "lt", name: "Less Than", icon: "<" },
  { id: "lte", name: "Less or Equal", icon: "≤" },
  { id: "like", name: "Contains", icon: "∋" },
  { id: "is_null", name: "Is Empty", icon: "∅" },
  { id: "not_null", name: "Is Not Empty", icon: "∃" },
]

const QUICK_DATE_RANGES = [
  { id: "today", name: "Today" },
  { id: "yesterday", name: "Yesterday" },
  { id: "last_7_days", name: "Last 7 Days" },
  { id: "last_30_days", name: "Last 30 Days" },
  { id: "this_month", name: "This Month" },
  { id: "last_month", name: "Last Month" },
  { id: "this_year", name: "This Year" },
]

export default function ReportBuilderPage() {
  const supabase = createClient()
  const [selectedTable, setSelectedTable] = useState("rides")
  const [selectedColumns, setSelectedColumns] = useState<string[]>(["id", "status", "created_at"])
  const [filters, setFilters] = useState<Filter[]>([])
  const [limit, setLimit] = useState(100)
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [reportName, setReportName] = useState("")
  const [sortColumn, setSortColumn] = useState("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [dateRange, setDateRange] = useState("")
  const [dateColumn, setDateColumn] = useState("created_at")

  const availableColumns = COLUMNS[selectedTable] || []
  const dateColumns = availableColumns.filter(c => c.type === "date")

  const toggleColumn = (columnId: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    )
  }

  const selectAllColumns = () => {
    setSelectedColumns(availableColumns.map(c => c.id))
  }

  const clearColumns = () => {
    setSelectedColumns([])
  }

  const addFilter = () => {
    setFilters([...filters, { column: availableColumns[0]?.id || "", operator: "eq", value: "" }])
  }

  const updateFilter = (index: number, field: keyof Filter, value: string) => {
    const newFilters = [...filters]
    newFilters[index] = { ...newFilters[index], [field]: value }
    setFilters(newFilters)
  }

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index))
  }

  const getDateRangeFilter = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (dateRange) {
      case "today":
        return { start: today.toISOString(), end: now.toISOString() }
      case "yesterday": {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        return { start: yesterday.toISOString(), end: today.toISOString() }
      }
      case "last_7_days": {
        const start = new Date(today)
        start.setDate(start.getDate() - 7)
        return { start: start.toISOString(), end: now.toISOString() }
      }
      case "last_30_days": {
        const start = new Date(today)
        start.setDate(start.getDate() - 30)
        return { start: start.toISOString(), end: now.toISOString() }
      }
      case "this_month": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        return { start: start.toISOString(), end: now.toISOString() }
      }
      case "last_month": {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const end = new Date(now.getFullYear(), now.getMonth(), 1)
        return { start: start.toISOString(), end: end.toISOString() }
      }
      case "this_year": {
        const start = new Date(now.getFullYear(), 0, 1)
        return { start: start.toISOString(), end: now.toISOString() }
      }
      default:
        return null
    }
  }

  const runReport = async () => {
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column")
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from(selectedTable)
        .select(selectedColumns.join(","))
        .order(sortColumn, { ascending: sortDirection === "asc" })
        .limit(limit)

      // Apply date range filter
      const dateFilter = getDateRangeFilter()
      if (dateFilter && dateColumn) {
        query = query.gte(dateColumn, dateFilter.start).lte(dateColumn, dateFilter.end)
      }

      // Apply custom filters
      for (const filter of filters) {
        if (filter.operator === "is_null") {
          query = query.is(filter.column, null)
          continue
        }
        if (filter.operator === "not_null") {
          query = query.not(filter.column, "is", null)
          continue
        }
        if (!filter.value) continue

        switch (filter.operator) {
          case "eq":
            query = query.eq(filter.column, filter.value)
            break
          case "neq":
            query = query.neq(filter.column, filter.value)
            break
          case "gt":
            query = query.gt(filter.column, filter.value)
            break
          case "gte":
            query = query.gte(filter.column, filter.value)
            break
          case "lt":
            query = query.lt(filter.column, filter.value)
            break
          case "lte":
            query = query.lte(filter.column, filter.value)
            break
          case "like":
            query = query.ilike(filter.column, `%${filter.value}%`)
            break
        }
      }

      const { data, error } = await query

      if (error) {
        toast.error("Failed to run report: " + error.message)
      } else if (data) {
        setResults(data as unknown as Record<string, unknown>[])
        toast.success(`Found ${data.length} records`)
      }
    } catch {
      toast.error("Failed to run report")
    }
    setLoading(false)
  }

  const exportCSV = () => {
    if (results.length === 0) {
      toast.error("No data to export")
      return
    }

    const headers = selectedColumns.map(col => {
      const column = availableColumns.find(c => c.id === col)
      return column?.name || col
    })
    const rows = results.map(row =>
      selectedColumns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ""
        if (typeof val === "object") return JSON.stringify(val)
        return String(val).replace(/,/g, ";")
      })
    )

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${reportName || selectedTable}_report_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    toast.success("Report exported as CSV")
  }

  const exportJSON = () => {
    if (results.length === 0) {
      toast.error("No data to export")
      return
    }

    const json = JSON.stringify(results, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${reportName || selectedTable}_report_${new Date().toISOString().split("T")[0]}.json`
    a.click()
    toast.success("Report exported as JSON")
  }

  // Calculate summary stats for numeric columns
  const getColumnStats = (columnId: string) => {
    const column = availableColumns.find(c => c.id === columnId)
    if (column?.type !== "number" || results.length === 0) return null

    const values = results
      .map(r => r[columnId])
      .filter((v): v is number => typeof v === "number")

    if (values.length === 0) return null

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    return { sum, avg, min, max, count: values.length }
  }

  const table = TABLES.find(t => t.id === selectedTable)

  return (
    <PermissionGate permission="reports:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Report Builder
          </h1>
          <p className="text-muted-foreground">Create custom reports from your data</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportJSON} disabled={results.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={results.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          {/* Report Configuration */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Configuration
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Report Name</label>
                <Input
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="My Custom Report"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Data Source</label>
                <Select value={selectedTable} onValueChange={(v) => {
                  setSelectedTable(v)
                  setSelectedColumns(["id", "created_at"])
                  setFilters([])
                  setResults([])
                  setSortColumn("created_at")
                  setDateColumn("created_at")
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TABLES.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span>{t.icon}</span>
                          <span>{t.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Limit</label>
                  <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="100">100 rows</SelectItem>
                      <SelectItem value="500">500 rows</SelectItem>
                      <SelectItem value="1000">1000 rows</SelectItem>
                      <SelectItem value="5000">5000 rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Sort</label>
                  <Select value={sortDirection} onValueChange={(v) => setSortDirection(v as "asc" | "desc")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest First</SelectItem>
                      <SelectItem value="asc">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Date Range */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Range
            </h3>
            <div className="space-y-3">
              {dateColumns.length > 0 && (
                <Select value={dateColumn} onValueChange={setDateColumn}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Date column" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateColumns.map(col => (
                      <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="grid grid-cols-2 gap-2">
                {QUICK_DATE_RANGES.map(range => (
                  <Button
                    key={range.id}
                    variant={dateRange === range.id ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setDateRange(dateRange === range.id ? "" : range.id)}
                  >
                    {range.name}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* Columns */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Columns</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="text-xs h-6" onClick={selectAllColumns}>All</Button>
                <Button size="sm" variant="ghost" className="text-xs h-6" onClick={clearColumns}>Clear</Button>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableColumns.map(col => (
                <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:bg-accent p-1 rounded">
                  <Checkbox
                    checked={selectedColumns.includes(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                  <span className="text-sm flex-1">{col.name}</span>
                  {col.type && (
                    <Badge variant="outline" className="text-xs">{col.type}</Badge>
                  )}
                </label>
              ))}
            </div>
          </Card>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filters</h3>
              <Button size="sm" variant="outline" onClick={addFilter}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-3">
              {filters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No filters applied</p>
              ) : (
                filters.map((filter, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <Select value={filter.column} onValueChange={(v) => updateFilter(index, "column", v)}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns.map(col => (
                          <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filter.operator} onValueChange={(v) => updateFilter(index, "operator", v)}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map(op => (
                          <SelectItem key={op.id} value={op.id}>
                            <span className="flex items-center gap-1">
                              <span className="font-mono">{op.icon}</span>
                              <span>{op.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!["is_null", "not_null"].includes(filter.operator) && (
                      <Input
                        value={filter.value}
                        onChange={(e) => updateFilter(index, "value", e.target.value)}
                        placeholder="Value"
                        className="flex-1"
                      />
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removeFilter(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Run Button */}
          <Button onClick={runReport} disabled={loading} className="w-full" size="lg">
            <Play className="h-4 w-4 mr-2" />
            {loading ? "Running..." : "Run Report"}
          </Button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary Stats */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="text-xs">Total Records</span>
                </div>
                <p className="text-2xl font-bold">{results.length}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Data Source</span>
                </div>
                <p className="text-lg font-semibold">{table?.name}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="text-xs">Columns</span>
                </div>
                <p className="text-2xl font-bold">{selectedColumns.length}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">Date Range</span>
                </div>
                <p className="text-lg font-semibold">{dateRange ? QUICK_DATE_RANGES.find(r => r.id === dateRange)?.name : "All Time"}</p>
              </Card>
            </div>
          )}

          {/* Results Table */}
          <Card>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">Results</span>
                {results.length > 0 && (
                  <Badge variant="secondary">{results.length} rows</Badge>
                )}
              </div>
            </div>
            <div className="overflow-auto max-h-[500px]">
              {results.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Run a report to see results</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedColumns.map(col => {
                        const column = availableColumns.find(c => c.id === col)
                        return <TableHead key={col}>{column?.name || col}</TableHead>
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((row, i) => (
                      <TableRow key={i}>
                        {selectedColumns.map(col => (
                          <TableCell key={col} className="max-w-xs truncate">
                            {row[col] === null ? <span className="text-muted-foreground">-</span> :
                             row[col] === true ? <Badge variant="outline" className="bg-green-500/10">Yes</Badge> :
                             row[col] === false ? <Badge variant="outline" className="bg-red-500/10">No</Badge> :
                             String(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>

          {/* Numeric Column Stats */}
          {results.length > 0 && selectedColumns.some(col => availableColumns.find(c => c.id === col)?.type === "number") && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Numeric Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedColumns.map(col => {
                  const stats = getColumnStats(col)
                  if (!stats) return null
                  const column = availableColumns.find(c => c.id === col)
                  return (
                    <div key={col} className="space-y-2">
                      <p className="text-sm font-medium">{column?.name}</p>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Sum: <span className="font-mono">{stats.sum.toFixed(2)}</span></p>
                        <p>Avg: <span className="font-mono">{stats.avg.toFixed(2)}</span></p>
                        <p>Min: <span className="font-mono">{stats.min}</span> / Max: <span className="font-mono">{stats.max}</span></p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
    </PermissionGate>
  )
}
