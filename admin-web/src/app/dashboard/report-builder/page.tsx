"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  Save,
  Trash2,
} from "lucide-react"

interface Column {
  id: string
  name: string
  table: string
}

interface Filter {
  column: string
  operator: string
  value: string
}

const TABLES = [
  { id: "profiles", name: "Customers/Users" },
  { id: "drivers", name: "Drivers" },
  { id: "rides", name: "Rides" },
  { id: "vehicle_types", name: "Vehicles" },
  { id: "shifts", name: "Shifts" },
  { id: "incidents", name: "Incidents" },
  { id: "ratings", name: "Ratings" },
]

const COLUMNS: Record<string, Column[]> = {
  profiles: [
    { id: "id", name: "ID", table: "profiles" },
    { id: "full_name", name: "Name", table: "profiles" },
    { id: "email", name: "Email", table: "profiles" },
    { id: "phone", name: "Phone", table: "profiles" },
    { id: "status", name: "Status", table: "profiles" },
    { id: "role", name: "Role", table: "profiles" },
    { id: "department", name: "Department", table: "profiles" },
    { id: "created_at", name: "Created At", table: "profiles" },
  ],
  drivers: [
    { id: "id", name: "ID", table: "drivers" },
    { id: "profile_id", name: "Profile ID", table: "drivers" },
    { id: "is_available", name: "Available", table: "drivers" },
    { id: "current_lat", name: "Latitude", table: "drivers" },
    { id: "current_lng", name: "Longitude", table: "drivers" },
    { id: "created_at", name: "Created At", table: "drivers" },
  ],
  rides: [
    { id: "id", name: "ID", table: "rides" },
    { id: "customer_id", name: "Customer ID", table: "rides" },
    { id: "driver_id", name: "Driver ID", table: "rides" },
    { id: "status", name: "Status", table: "rides" },
    { id: "pickup_name", name: "Pickup", table: "rides" },
    { id: "dropoff_name", name: "Dropoff", table: "rides" },
    { id: "distance_km", name: "Distance (km)", table: "rides" },
    { id: "duration_minutes", name: "Duration (min)", table: "rides" },
    { id: "created_at", name: "Created At", table: "rides" },
    { id: "completed_at", name: "Completed At", table: "rides" },
  ],
  vehicle_types: [
    { id: "id", name: "ID", table: "vehicle_types" },
    { id: "name", name: "Name", table: "vehicle_types" },
    { id: "display_name", name: "Display Name", table: "vehicle_types" },
    { id: "plate_no", name: "Plate No", table: "vehicle_types" },
    { id: "capacity", name: "Capacity", table: "vehicle_types" },
  ],
  shifts: [
    { id: "id", name: "ID", table: "shifts" },
    { id: "driver_id", name: "Driver ID", table: "shifts" },
    { id: "date", name: "Date", table: "shifts" },
    { id: "start_time", name: "Start Time", table: "shifts" },
    { id: "end_time", name: "End Time", table: "shifts" },
    { id: "status", name: "Status", table: "shifts" },
  ],
  incidents: [
    { id: "id", name: "ID", table: "incidents" },
    { id: "type", name: "Type", table: "incidents" },
    { id: "severity", name: "Severity", table: "incidents" },
    { id: "title", name: "Title", table: "incidents" },
    { id: "status", name: "Status", table: "incidents" },
    { id: "created_at", name: "Created At", table: "incidents" },
  ],
  ratings: [
    { id: "id", name: "ID", table: "ratings" },
    { id: "ride_id", name: "Ride ID", table: "ratings" },
    { id: "driver_id", name: "Driver ID", table: "ratings" },
    { id: "rating", name: "Rating", table: "ratings" },
    { id: "comment", name: "Comment", table: "ratings" },
    { id: "created_at", name: "Created At", table: "ratings" },
  ],
}

const OPERATORS = [
  { id: "eq", name: "Equals" },
  { id: "neq", name: "Not Equals" },
  { id: "gt", name: "Greater Than" },
  { id: "gte", name: "Greater or Equal" },
  { id: "lt", name: "Less Than" },
  { id: "lte", name: "Less or Equal" },
  { id: "like", name: "Contains" },
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

  const availableColumns = COLUMNS[selectedTable] || []

  const toggleColumn = (columnId: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    )
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
        .limit(limit)

      for (const filter of filters) {
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

    const headers = selectedColumns
    const rows = results.map(row =>
      selectedColumns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ""
        if (typeof val === "object") return JSON.stringify(val)
        return String(val)
      })
    )

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${reportName || selectedTable}_report_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    toast.success("Report exported")
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-3xl font-bold">Report Builder</h1>
        <p className="text-muted-foreground">Create custom reports from your data</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-4">Report Configuration</h3>

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
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TABLES.map(table => (
                      <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-4">Columns</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableColumns.map(col => (
                <label key={col.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedColumns.includes(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                  <span className="text-sm">{col.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
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
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns.map(col => (
                          <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filter.operator} onValueChange={(v) => updateFilter(index, "operator", v)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map(op => (
                          <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={filter.value}
                      onChange={(e) => updateFilter(index, "value", e.target.value)}
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeFilter(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={runReport} disabled={loading} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              {loading ? "Running..." : "Run Report"}
            </Button>
            <Button variant="outline" onClick={exportCSV} disabled={results.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">Results</span>
                {results.length > 0 && (
                  <Badge variant="secondary">{results.length} rows</Badge>
                )}
              </div>
            </div>
            <div className="overflow-auto max-h-[600px]">
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
                            {row[col] === null ? "-" : String(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
