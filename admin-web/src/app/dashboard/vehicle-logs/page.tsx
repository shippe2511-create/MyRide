"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Fuel, Loader2, MoreVertical, Edit, Trash2, Plus, Wrench, Sparkles, Car, Filter, TrendingUp, TrendingDown, Calendar, DollarSign, Users, Download } from "lucide-react"
import { toast } from "sonner"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { SkeletonCard, SkeletonTable, SkeletonChart } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"

interface VehicleLog {
  id: string
  driver_id: string
  log_type: string
  amount: number | null
  odometer: number | null
  notes: string | null
  log_date: string
  created_at: string
  driver?: {
    profile?: {
      full_name: string
    }
  }
}

const LOG_TYPES = [
  { value: "fuel", label: "Fuel", icon: Fuel, color: "bg-orange-500" },
  { value: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-blue-500" },
  { value: "repair", label: "Repair", icon: Wrench, color: "bg-red-500" },
  { value: "cleaning", label: "Cleaning", icon: Sparkles, color: "bg-green-500" },
  { value: "inspection", label: "Inspection", icon: Car, color: "bg-purple-500" },
]

export default function VehicleLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<VehicleLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState("all")

  const [formData, setFormData] = useState({
    log_type: "fuel",
    amount: "",
    odometer: "",
    notes: "",
    log_date: new Date().toISOString().split("T")[0],
  })

  // Calculate stats
  const stats = LOG_TYPES.map(type => {
    const typeLogs = logs.filter(l => l.log_type === type.value)
    const total = typeLogs.reduce((sum, l) => sum + (l.amount || 0), 0)
    return {
      ...type,
      count: typeLogs.length,
      total,
    }
  })

  const totalSpent = logs.reduce((sum, l) => sum + (l.amount || 0), 0)

  // This month stats
  const now = new Date()
  const thisMonthLogs = logs.filter(l => {
    const logDate = new Date(l.log_date)
    return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear()
  })
  const thisMonthSpent = thisMonthLogs.reduce((sum, l) => sum + (l.amount || 0), 0)

  // Last month stats for comparison
  const lastMonthLogs = logs.filter(l => {
    const logDate = new Date(l.log_date)
    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    return logDate.getMonth() === lastMonth && logDate.getFullYear() === lastMonthYear
  })
  const lastMonthSpent = lastMonthLogs.reduce((sum, l) => sum + (l.amount || 0), 0)
  const monthOverMonthChange = lastMonthSpent > 0 ? ((thisMonthSpent - lastMonthSpent) / lastMonthSpent * 100) : 0

  // Average per log
  const avgPerLog = logs.length > 0 ? totalSpent / logs.length : 0

  // Top spending driver
  const driverSpending: { [name: string]: number } = {}
  logs.forEach(log => {
    const name = log.driver?.profile?.full_name || "Unknown"
    driverSpending[name] = (driverSpending[name] || 0) + (log.amount || 0)
  })
  const topDrivers = Object.entries(driverSpending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // Monthly chart data (last 6 months)
  const getMonthlyData = () => {
    const months: { [key: string]: { [type: string]: number } } = {}

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toLocaleDateString("en-US", { month: "short" })
      months[key] = {}
      LOG_TYPES.forEach(t => months[key][t.value] = 0)
    }

    logs.forEach(log => {
      const logDate = new Date(log.log_date)
      const monthKey = logDate.toLocaleDateString("en-US", { month: "short" })
      if (months[monthKey] && log.amount) {
        months[monthKey][log.log_type] = (months[monthKey][log.log_type] || 0) + log.amount
      }
    })

    return Object.entries(months).map(([month, data]) => ({
      month,
      ...data,
      total: Object.values(data).reduce((a, b) => a + b, 0),
    }))
  }

  const monthlyData = getMonthlyData()

  useEffect(() => {
    loadLogs()

    const channel = supabase
      .channel('vehicle_logs_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_logs' }, () => {
        loadLogs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filterType])

  const loadLogs = async () => {
    setLoading(true)
    let query = supabase
      .from("vehicle_logs")
      .select(`
        *,
        driver:drivers!vehicle_logs_driver_id_fkey(
          profile:profiles(full_name)
        )
      `)
      .order("log_date", { ascending: false })

    if (filterType !== "all") {
      query = query.eq("log_type", filterType)
    }

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }

  const openDialog = (log?: VehicleLog) => {
    if (log) {
      setSelectedLog(log)
      setFormData({
        log_type: log.log_type,
        amount: log.amount?.toString() || "",
        odometer: log.odometer?.toString() || "",
        notes: log.notes || "",
        log_date: log.log_date,
      })
    } else {
      setSelectedLog(null)
      setFormData({
        log_type: "fuel",
        amount: "",
        odometer: "",
        notes: "",
        log_date: new Date().toISOString().split("T")[0],
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)

    const payload = {
      log_type: formData.log_type,
      amount: formData.amount ? parseFloat(formData.amount) : null,
      odometer: formData.odometer ? parseInt(formData.odometer) : null,
      notes: formData.notes || null,
      log_date: formData.log_date,
    }

    if (selectedLog) {
      const { error } = await supabase
        .from("vehicle_logs")
        .update(payload)
        .eq("id", selectedLog.id)

      if (error) {
        toast.error("Failed to update log")
      } else {
        toast.success("Log updated")
        setLogs(prev => prev.map(l => l.id === selectedLog.id ? { ...l, ...payload } : l))
      }
    }

    setSaving(false)
    setDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!selectedLog) return

    const { error } = await supabase
      .from("vehicle_logs")
      .delete()
      .eq("id", selectedLog.id)

    if (error) {
      toast.error("Failed to delete log")
    } else {
      toast.success("Log deleted")
      setLogs(prev => prev.filter(l => l.id !== selectedLog.id))
    }

    setDeleteDialogOpen(false)
    setSelectedLog(null)
  }

  const confirmDelete = (log: VehicleLog) => {
    setSelectedLog(log)
    setDeleteDialogOpen(true)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatAmount = (amount: number | null) => {
    if (!amount) return "-"
    return `MVR ${amount.toFixed(2)}`
  }

  const getLogTypeInfo = (type: string) => {
    return LOG_TYPES.find(t => t.value === type) || LOG_TYPES[0]
  }

  const exportCSV = () => {
    const headers = ["Type", "Driver", "Amount", "Odometer", "Date", "Notes"]
    const rows = logs.map(l => [
      l.log_type,
      l.driver?.profile?.full_name || "-",
      l.amount || "",
      l.odometer || "",
      formatDate(l.log_date),
      l.notes || ""
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vehicle_logs_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Logs exported")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-36 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="h-6 w-6" />
            Vehicle Logs
          </h1>
          <p className="text-sm text-muted-foreground">Fuel, maintenance, and repair records</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Summary Stats Row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">MVR {totalSpent.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground truncate">Total Spent</p>
            </div>
            <span className="text-xs font-medium text-slate-400 ml-auto shrink-0">{logs.length}</span>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br ${monthOverMonthChange >= 0 ? 'from-red-500/10 to-red-600/5 border-red-500/20' : 'from-green-500/10 to-green-600/5 border-green-500/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${monthOverMonthChange >= 0 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
              <Calendar className={`h-4 w-4 ${monthOverMonthChange >= 0 ? 'text-red-500' : 'text-green-500'}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-xl font-bold tracking-tight ${monthOverMonthChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>MVR {thisMonthSpent.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground truncate">This Month</p>
            </div>
            <span className={`text-xs font-medium ml-auto shrink-0 flex items-center gap-0.5 ${monthOverMonthChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              {monthOverMonthChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(monthOverMonthChange).toFixed(0)}%
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">MVR {avgPerLog.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground truncate">Avg per Log</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-tight text-purple-500 truncate">{topDrivers[0]?.[0] || "N/A"}</p>
              <p className="text-xs text-muted-foreground truncate">MVR {(topDrivers[0]?.[1] || 0).toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Category Breakdown Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {stats.map(stat => {
          const Icon = stat.icon
          const percentage = totalSpent > 0 ? (stat.total / totalSpent * 100).toFixed(0) : 0
          return (
            <Card key={stat.value} className={`p-4 ${stat.color.replace('bg-', 'bg-gradient-to-br from-')}/10 to-${stat.color.replace('bg-', '')}/5 border-${stat.color.replace('bg-', '')}/20 hover:border-${stat.color.replace('bg-', '')}/40 transition-colors`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color}/20 shrink-0`}>
                  <Icon className={`h-4 w-4 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tracking-tight">MVR {stat.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground ml-auto shrink-0">{stat.count}</span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Monthly Bar Chart */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-lg">Monthly Spending</h3>
              <p className="text-sm text-muted-foreground">Last 6 months breakdown by category</p>
            </div>
            <div className="flex items-center gap-3">
              {LOG_TYPES.map(type => (
                <div key={type.value} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${type.color}`} />
                  <span className="text-muted-foreground">{type.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} barCategoryGap="20%">
                <XAxis
                  dataKey="month"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  formatter={(value) => [`MVR ${Number(value).toLocaleString()}`, '']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                />
                <Bar dataKey="fuel" stackId="a" fill="#f97316" name="Fuel" radius={[0, 0, 0, 0]} />
                <Bar dataKey="maintenance" stackId="a" fill="#3b82f6" name="Maintenance" />
                <Bar dataKey="repair" stackId="a" fill="#ef4444" name="Repair" />
                <Bar dataKey="cleaning" stackId="a" fill="#22c55e" name="Cleaning" />
                <Bar dataKey="inspection" stackId="a" fill="#a855f7" name="Inspection" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Category Pie Chart */}
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-lg">Category Distribution</h3>
            <p className="text-sm text-muted-foreground">Spending by type</p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.filter(s => s.total > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="label"
                >
                  {stats.filter(s => s.total > 0).map((stat, index) => (
                    <Cell key={stat.value} fill={['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#a855f7'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`MVR ${Number(value).toLocaleString()}`, '']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {stats.filter(s => s.total > 0).map((stat, index) => (
              <div key={stat.value} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#a855f7'][index % 5] }} />
                  <span className="text-muted-foreground">{stat.label}</span>
                </div>
                <span className="font-medium">{totalSpent > 0 ? (stat.total / totalSpent * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LOG_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{logs.length} records</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Odometer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No vehicle logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map(log => {
                const typeInfo = getLogTypeInfo(log.log_type)
                const Icon = typeInfo.icon
                return (
                  <TableRow key={log.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${typeInfo.color}`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="capitalize">{log.log_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.driver?.profile?.full_name || "-"}
                    </TableCell>
                    <TableCell>{formatAmount(log.amount)}</TableCell>
                    <TableCell>
                      {log.odometer ? `${log.odometer.toLocaleString()} km` : "-"}
                    </TableCell>
                    <TableCell>{formatDate(log.log_date)}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {log.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openDialog(log)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(log)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => confirmDelete(log)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={formData.log_type} onValueChange={v => setFormData(p => ({ ...p, log_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Amount (MVR)</label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Odometer (km)</label>
              <Input
                type="number"
                value={formData.odometer}
                onChange={e => setFormData(p => ({ ...p, odometer: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={formData.log_date}
                onChange={e => setFormData(p => ({ ...p, log_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this vehicle log? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
