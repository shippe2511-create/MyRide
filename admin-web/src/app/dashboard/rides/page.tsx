"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  MapPin, Clock, CheckCircle, XCircle, Search, Loader2, RefreshCw, Car, MoreVertical, Edit, Trash2, TrendingUp, ChevronLeft, ChevronRight, Download, Eye, Calendar
} from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterPills } from "@/components/ui/filter-pills"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

interface Ride {
  id: string
  pickup_name: string
  dropoff_name: string
  pickup_lat: number | null
  pickup_lng: number | null
  dropoff_lat: number | null
  dropoff_lng: number | null
  status: string
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  distance_km: number | null
  duration_minutes: number | null
  customer: { full_name: string; phone: string | null } | null
  driver?: { profile: { full_name: string } } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  accepted: "bg-blue-500",
  arrived: "bg-purple-500",
  in_progress: "bg-indigo-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
}

export default function RidesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rides, setRides] = useState<Ride[]>([])
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateRange, setDateRange] = useState("all")
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, cancelled: 0 })
  const [editRide, setEditRide] = useState<Ride | null>(null)
  const [editStatus, setEditStatus] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteRideId, setDeleteRideId] = useState<string | null>(null)
  const [chartData, setChartData] = useState<{ date: string; rides: number }[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    loadData(true)

    // Real-time subscription for rides - refresh silently without loading spinner
    const channel = supabase
      .channel('rides_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        loadData(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [statusFilter, dateRange])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)

    let query = supabase
      .from("rides")
      .select(`*, customer:profiles!rides_customer_id_fkey(full_name, phone), driver:drivers!rides_driver_id_fkey(profile:profiles(full_name))`)
      .order("created_at", { ascending: false })
      .limit(100)

    if (statusFilter !== "all") {
      if (statusFilter === "active") {
        query = query.in("status", ["pending", "accepted", "arrived", "in_progress"])
      } else {
        query = query.eq("status", statusFilter)
      }
    }

    // Apply date range filter
    if (dateRange !== "all") {
      const now = new Date()
      let startDate: Date
      switch (dateRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case "quarter":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(0)
      }
      query = query.gte("created_at", startDate.toISOString())
    }

    const [ridesRes, totalRes, activeRes, completedRes, cancelledRes, last7DaysRes] = await Promise.all([
      query,
      supabase.from("rides").select("*", { count: "exact", head: true }),
      supabase.from("rides").select("*", { count: "exact", head: true }).in("status", ["pending", "accepted", "arrived", "in_progress"]),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
      supabase.from("rides").select("created_at").gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    setRides(ridesRes.data || [])
    setStats({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      completed: completedRes.count || 0,
      cancelled: cancelledRes.count || 0,
    })

    // Build chart data for last 7 days
    const last7Days = last7DaysRes.data || []
    const dateCount: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toLocaleDateString("en-US", { weekday: "short" })
      dateCount[key] = 0
    }
    last7Days.forEach(r => {
      const key = new Date(r.created_at).toLocaleDateString("en-US", { weekday: "short" })
      if (dateCount[key] !== undefined) dateCount[key]++
    })
    setChartData(Object.entries(dateCount).map(([date, rides]) => ({ date, rides })))

    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: true
    })
  }

  const updateRideStatus = async () => {
    if (!editRide || !editStatus) return
    setSaving(true)
    const updates: Record<string, unknown> = { status: editStatus }
    if (editStatus === "completed") {
      updates.completed_at = new Date().toISOString()
    }
    const { error } = await supabase.from("rides").update(updates).eq("id", editRide.id)
    if (error) {
      toast.error("Failed to update ride")
    } else {
      toast.success("Ride updated")
      setEditRide(null)
      loadData()
    }
    setSaving(false)
  }

  const confirmDeleteRide = async () => {
    if (!deleteRideId) return
    const { error } = await supabase.from("rides").delete().eq("id", deleteRideId)
    if (error) {
      toast.error("Failed to delete ride")
    } else {
      toast.success("Ride deleted")
      // Update state directly without full reload
      setRides(prev => prev.filter(r => r.id !== deleteRideId))
      setStats(prev => ({
        ...prev,
        total: prev.total - 1,
        completed: rides.find(r => r.id === deleteRideId)?.status === 'completed' ? prev.completed - 1 : prev.completed
      }))
    }
    setDeleteRideId(null)
  }

  const filteredRides = rides.filter(ride => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      ride.customer?.full_name?.toLowerCase().includes(s) ||
      ride.pickup_name?.toLowerCase().includes(s) ||
      ride.dropoff_name?.toLowerCase().includes(s)
    )
  })

  const exportToCSV = () => {
    const headers = ["ID", "Customer", "Pickup", "Dropoff", "Status", "Date", "Duration (min)", "Distance (km)"]
    const rows = filteredRides.map(ride => [
      ride.id,
      ride.customer?.full_name || "N/A",
      ride.pickup_name,
      ride.dropoff_name,
      ride.status,
      new Date(ride.created_at).toLocaleString(),
      ride.duration_minutes || "",
      ride.distance_km || ""
    ])

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `rides_export_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Rides exported successfully")
  }

  const totalPages = Math.ceil(filteredRides.length / pageSize)
  const paginatedRides = filteredRides.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, dateRange])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="w-32 h-8 bg-muted rounded animate-pulse" />
            <div className="w-48 h-4 bg-muted rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rides</h1>
          <p className="text-sm text-muted-foreground">Monitor and manage all rides</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <MapPin className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground truncate">Total Rides</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground truncate">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.completed.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground truncate">Completed</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{stats.cancelled}</p>
              <p className="text-xs text-muted-foreground truncate">Cancelled</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Rides Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Rides This Week</h3>
            <p className="text-sm text-muted-foreground">Daily ride count for the last 7 days</p>
          </div>
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ridesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />
              <Area type="monotone" dataKey="rides" stroke="#3b82f6" strokeWidth={2} fill="url(#ridesGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FilterPills
          filters={[
            ...(statusFilter !== "all" ? [{ key: "status", label: "Status", value: statusFilter }] : []),
            ...(search ? [{ key: "search", label: "Search", value: search }] : []),
          ]}
          onRemove={(key) => {
            if (key === "status") setStatusFilter("all")
            if (key === "search") setSearch("")
          }}
          onClearAll={() => {
            setStatusFilter("all")
            setSearch("")
          }}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon="rides"
                    title="No rides found"
                    description={search ? "Try adjusting your search or filters" : "Rides will appear here when customers book them"}
                  />
                </TableCell>
              </TableRow>
            ) : (
              paginatedRides.map(ride => (
                <TableRow
                  key={ride.id}
                  className="group cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRide(ride)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{ride.customer?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{ride.customer?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{ride.customer?.phone || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p className="truncate max-w-[200px]">{ride.pickup_name}</p>
                      <p className="text-muted-foreground truncate max-w-[200px]">→ {ride.dropoff_name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {ride.driver?.profile?.full_name || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[ride.status] || "bg-gray-500"}>
                      {ride.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(ride.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); setEditRide(ride); setEditStatus(ride.status); }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedRide(ride); }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditRide(ride); setEditStatus(ride.status); }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Status
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={(e) => { e.stopPropagation(); setDeleteRideId(ride.id); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredRides.length)} of {filteredRides.length} rides
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={!!selectedRide} onOpenChange={() => setSelectedRide(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ride Details</DialogTitle>
          </DialogHeader>
          {selectedRide && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedRide.customer?.full_name}</p>
                  <p className="text-sm">{selectedRide.customer?.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Driver</p>
                  <p className="font-medium">{selectedRide.driver?.profile?.full_name || "Not assigned"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pickup</p>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{selectedRide.pickup_name}</p>
                  {selectedRide.pickup_lat && selectedRide.pickup_lng && (
                    <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => window.open(`https://www.google.com/maps?q=${selectedRide.pickup_lat},${selectedRide.pickup_lng}`, "_blank")}>
                      <MapPin className="h-3 w-3 mr-1" /> View
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Dropoff</p>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{selectedRide.dropoff_name}</p>
                  {selectedRide.dropoff_lat && selectedRide.dropoff_lng && (
                    <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => window.open(`https://www.google.com/maps?q=${selectedRide.dropoff_lat},${selectedRide.dropoff_lng}`, "_blank")}>
                      <MapPin className="h-3 w-3 mr-1" /> View
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={STATUS_COLORS[selectedRide.status]}>{selectedRide.status.replace("_", " ")}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Distance</p>
                  <p className="text-sm font-medium">{selectedRide.distance_km ? `${selectedRide.distance_km} km` : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-sm font-medium">{selectedRide.duration_minutes ? `${selectedRide.duration_minutes} mins` : "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm">{formatDate(selectedRide.created_at)}</p>
              </div>
              {selectedRide.status === "cancelled" && selectedRide.cancel_reason && (
                <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">Cancellation Reason</p>
                  <p className="text-sm">{selectedRide.cancel_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRide} onOpenChange={() => setEditRide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ride</DialogTitle>
          </DialogHeader>
          {editRide && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer</p>
                <p className="font-medium">{editRide.customer?.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Route</p>
                <p className="text-sm">{editRide.pickup_name} → {editRide.dropoff_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Status</p>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="arrived">Arrived</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditRide(null)}>Cancel</Button>
                <Button onClick={updateRideStatus} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRideId} onOpenChange={() => setDeleteRideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ride</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ride? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRide}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
