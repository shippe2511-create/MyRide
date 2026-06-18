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
  MapPin, Clock, CheckCircle, XCircle, Search, Loader2, RefreshCw, Car, MoreVertical, Edit, Trash2
} from "lucide-react"
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
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 })
  const [editRide, setEditRide] = useState<Ride | null>(null)
  const [editStatus, setEditStatus] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteRideId, setDeleteRideId] = useState<string | null>(null)

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
  }, [statusFilter])

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

    const [ridesRes, totalRes, activeRes, completedRes] = await Promise.all([
      query,
      supabase.from("rides").select("*", { count: "exact", head: true }),
      supabase.from("rides").select("*", { count: "exact", head: true }).in("status", ["pending", "accepted", "arrived", "in_progress"]),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
    ])

    setRides(ridesRes.data || [])
    setStats({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      completed: completedRes.count || 0,
    })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <Button variant="outline" size="sm" onClick={() => loadData(true)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card className="p-5 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-slate-500/20">
                <MapPin className="h-5 w-5 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-500/10 px-2 py-1 rounded-full">
                all time
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight">{stats.total.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Total Rides</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-blue-500/20">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <span className="text-xs font-medium text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">
                live
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-blue-500">{stats.active}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-green-500">{stats.completed.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Completed</p>
            </div>
          </div>
        </Card>
      </div>

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
        </div>

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
            {filteredRides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No rides found
                </TableCell>
              </TableRow>
            ) : (
              filteredRides.map(ride => (
                <TableRow
                  key={ride.id}
                  className="cursor-pointer hover:bg-muted/50"
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
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
