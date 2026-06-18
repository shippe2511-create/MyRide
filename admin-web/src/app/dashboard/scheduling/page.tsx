"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus, Bus, Ship, Loader2, Clock, MapPin, RefreshCw, MoreHorizontal, Pencil, Trash2, X
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"

interface TransportRoute {
  id: string
  transport_type: string
  route_name: string
  route_code: string | null
  direction: string
  is_active: boolean
  schedules?: { departure_time: string; days_of_week: string[] }[]
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function SchedulingPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("internal_bus")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    transport_type: "internal_bus",
    route_name: "",
    route_code: "",
    direction: "outbound",
    is_active: true,
  })
  const [editingRoute, setEditingRoute] = useState<TransportRoute | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [timesRoute, setTimesRoute] = useState<TransportRoute | null>(null)
  const [schedules, setSchedules] = useState<{ id: string; departure_time: string; days_of_week: string[]; is_active: boolean }[]>([])
  const [newTime, setNewTime] = useState("")
  const [newDays, setNewDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"])

  useEffect(() => {
    loadRoutes()
  }, [])

  const loadRoutes = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const { data } = await supabase
      .from("transport_routes")
      .select("*, schedules:route_schedules(id, departure_time, days_of_week, is_active)")
      .order("route_name")

    setRoutes(data || [])
    if (showLoading) setLoading(false)
  }

  const handleSave = async () => {
    if (!formData.route_name) {
      toast.error("Route name is required")
      return
    }

    setDialogOpen(false)
    setSaving(true)
    const { data, error } = await supabase.from("transport_routes").insert({
      transport_type: formData.transport_type,
      route_name: formData.route_name,
      route_code: formData.route_code || null,
      direction: formData.direction,
      is_active: formData.is_active,
    }).select().single()

    if (error) {
      toast.error("Failed to create route")
    } else {
      toast.success("Route created")
      setFormData({ transport_type: activeTab, route_name: "", route_code: "", direction: "outbound", is_active: true })
      if (data) setRoutes(prev => [...prev, data])
    }
    setSaving(false)
  }

  const handleUpdate = async () => {
    if (!editingRoute) return
    const routeToUpdate = editingRoute
    setEditingRoute(null)
    setSaving(true)

    const { error } = await supabase.from("transport_routes").update({
      route_name: routeToUpdate.route_name,
      route_code: routeToUpdate.route_code,
      direction: routeToUpdate.direction,
      is_active: routeToUpdate.is_active,
    }).eq("id", routeToUpdate.id)

    if (error) {
      toast.error("Failed to update route")
    } else {
      toast.success("Route updated")
      setRoutes(prev => prev.map(r => r.id === routeToUpdate.id ? { ...r, ...routeToUpdate } : r))
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)

    const { error } = await supabase.from("transport_routes").delete().eq("id", idToDelete)

    if (error) {
      toast.error("Failed to delete route")
    } else {
      toast.success("Route deleted")
      setRoutes(prev => prev.filter(r => r.id !== idToDelete))
    }
  }

  const openTimesDialog = async (route: TransportRoute) => {
    setTimesRoute(route)
    const { data } = await supabase
      .from("route_schedules")
      .select("*")
      .eq("route_id", route.id)
      .order("departure_time")
    setSchedules(data || [])
  }

  const addSchedule = async () => {
    if (!timesRoute || !newTime) {
      toast.error("Please enter a time")
      return
    }

    const { error } = await supabase.from("route_schedules").insert({
      route_id: timesRoute.id,
      departure_time: newTime,
      days_of_week: newDays,
      is_active: true,
    })

    if (error) {
      toast.error("Failed to add time")
    } else {
      toast.success("Time added")
      setNewTime("")
      // Reload schedules for current route
      const { data: updatedSchedules } = await supabase
        .from("route_schedules")
        .select("id, departure_time, days_of_week, is_active")
        .eq("route_id", timesRoute.id)
        .order("departure_time")
      setSchedules(updatedSchedules || [])
      loadRoutes(false)
    }
  }

  const deleteSchedule = async (scheduleId: string) => {
    const { error } = await supabase.from("route_schedules").delete().eq("id", scheduleId)

    if (error) {
      toast.error("Failed to delete time")
    } else {
      toast.success("Time deleted")
      // Update schedules list without closing dialog
      setSchedules(prev => prev.filter(s => s.id !== scheduleId))
      loadRoutes(false)
    }
  }

  const filteredRoutes = routes.filter(r => r.transport_type === activeTab)

  const stats = {
    total: filteredRoutes.length,
    active: filteredRoutes.filter(r => r.is_active).length,
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-2">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-sm text-muted-foreground">Manage transport routes and schedules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadRoutes()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { setFormData({ ...formData, transport_type: activeTab }); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Route
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="internal_bus" className="gap-2">
            <Bus className="h-4 w-4" />
            Internal Bus
          </TabsTrigger>
          <TabsTrigger value="mtcc_bus" className="gap-2">
            <Bus className="h-4 w-4" />
            MTCC Bus
          </TabsTrigger>
          <TabsTrigger value="ferry" className="gap-2">
            <Ship className="h-4 w-4" />
            Ferry
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="grid gap-4 grid-cols-2 mb-4">
            <Card className="p-5 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-slate-500/20">
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-400 bg-slate-500/10 px-2 py-1 rounded-full">
                    all
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Total Routes</p>
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Clock className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                    {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold tracking-tight text-green-500">{stats.active}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Active</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Schedules</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No routes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoutes.map(route => (
                    <TableRow key={route.id}>
                      <TableCell className="font-medium">{route.route_name}</TableCell>
                      <TableCell>{route.route_code || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{route.direction}</Badge>
                      </TableCell>
                      <TableCell>
                        {route.schedules?.length || 0} times
                      </TableCell>
                      <TableCell>
                        <Badge className={route.is_active ? "bg-green-500" : "bg-gray-500"}>
                          {route.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTimesDialog(route)}>
                              <Clock className="h-4 w-4 mr-2" />
                              Manage Times
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingRoute(route)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteId(route.id)} className="text-red-500">
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Route Name</label>
              <Input
                value={formData.route_name}
                onChange={e => setFormData({ ...formData, route_name: e.target.value })}
                placeholder="e.g., Hulhumale to Male"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Route Code</label>
              <Input
                value={formData.route_code}
                onChange={e => setFormData({ ...formData, route_code: e.target.value })}
                placeholder="e.g., HM-01"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Direction</label>
              <Select value={formData.direction} onValueChange={v => setFormData({ ...formData, direction: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.is_active}
                onCheckedChange={c => setFormData({ ...formData, is_active: !!c })}
              />
              <label className="text-sm">Active</label>
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

      {/* Edit Dialog */}
      <Dialog open={!!editingRoute} onOpenChange={() => setEditingRoute(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Route</DialogTitle>
          </DialogHeader>
          {editingRoute && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Route Name</label>
                <Input
                  value={editingRoute.route_name}
                  onChange={(e) => setEditingRoute({ ...editingRoute, route_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Route Code</label>
                <Input
                  value={editingRoute.route_code || ""}
                  onChange={(e) => setEditingRoute({ ...editingRoute, route_code: e.target.value })}
                  placeholder="e.g. R01"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Direction</label>
                <Select
                  value={editingRoute.direction}
                  onValueChange={(v) => setEditingRoute({ ...editingRoute, direction: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="round">Round Trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-active"
                  checked={editingRoute.is_active}
                  onCheckedChange={(c) => setEditingRoute({ ...editingRoute, is_active: !!c })}
                />
                <label htmlFor="edit-active" className="text-sm">Active</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoute(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this route and all its schedules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Times Dialog */}
      <Dialog open={!!timesRoute} onOpenChange={() => setTimesRoute(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Trip Times - {timesRoute?.route_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add New Time */}
            <div className="p-4 border rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Add New Time</h4>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addSchedule} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {DAYS.map(day => (
                  <Button
                    key={day}
                    variant={newDays.includes(day) ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (newDays.includes(day)) {
                        setNewDays(newDays.filter(d => d !== day))
                      } else {
                        setNewDays([...newDays, day])
                      }
                    }}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>

            {/* Existing Times */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Scheduled Times ({schedules.length})</h4>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No times added yet</p>
              ) : (
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {schedules.map(schedule => (
                    <div key={schedule.id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div>
                        <p className="font-medium">{schedule.departure_time?.slice(0, 5)}</p>
                        <p className="text-xs text-muted-foreground">
                          {schedule.days_of_week?.join(", ") || "All days"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => deleteSchedule(schedule.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTimesRoute(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
