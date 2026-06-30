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
import { Switch } from "@/components/ui/switch"
import {
  Plus, Bus, Ship, Loader2, Clock, MapPin, RefreshCw, MoreHorizontal, Pencil, Trash2, X, Upload, Image, FileText, GripVertical, Download
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
import { PermissionGate } from "@/components/permission-gate"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

interface TransportRoute {
  id: string
  transport_type: string
  route_name: string
  route_code: string | null
  direction: string
  stops: string[]
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
    stops: [] as string[],
    is_active: true,
  })
  const [editingRoute, setEditingRoute] = useState<TransportRoute | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [timesRoute, setTimesRoute] = useState<TransportRoute | null>(null)
  const [schedules, setSchedules] = useState<{ id: string; departure_time: string; days_of_week: string[]; is_active: boolean }[]>([])
  const [newTime, setNewTime] = useState("")
  const [newDays, setNewDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"])

  // Bulk selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Import states
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importStep, setImportStep] = useState<"upload" | "review">("upload")
  const [importImage, setImportImage] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractedTimes, setExtractedTimes] = useState<string[]>([])
  const [routeName, setRouteName] = useState("")
  const [routeCode, setRouteCode] = useState("")
  const [routeDirection, setRouteDirection] = useState("outbound")
  const [routeStops, setRouteStops] = useState("")
  const [importSaving, setImportSaving] = useState(false)
  const [draggedStopIndex, setDraggedStopIndex] = useState<number | null>(null)

  useEffect(() => {
    loadRoutes()

    const channel = supabase
      .channel('scheduling_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_routes' }, () => loadRoutes(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_schedules' }, () => loadRoutes(false))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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
      stops: formData.stops,
      is_active: formData.is_active,
    }).select().single()

    if (error) {
      toast.error("Failed to create route")
    } else {
      toast.success("Route created")
      setFormData({ transport_type: activeTab, route_name: "", route_code: "", direction: "outbound", stops: [], is_active: true })
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
      stops: routeToUpdate.stops || [],
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

  const toggleRouteStatus = async (route: TransportRoute) => {
    const { error } = await supabase
      .from("transport_routes")
      .update({ is_active: !route.is_active })
      .eq("id", route.id)
    if (error) toast.error("Failed to update")
    else {
      setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_active: !r.is_active } : r))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    setBulkDeleting(true)
    const idsToDelete = Array.from(selectedIds)

    const { error } = await supabase
      .from("transport_routes")
      .delete()
      .in("id", idsToDelete)

    if (error) {
      toast.error("Failed to delete routes")
    } else {
      toast.success(`Deleted ${idsToDelete.length} route${idsToDelete.length > 1 ? 's' : ''}`)
      setRoutes(prev => prev.filter(r => !selectedIds.has(r.id)))
      setSelectedIds(new Set())
    }
    setBulkDeleting(false)
    setBulkDeleteOpen(false)
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

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImportImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Extract times from image using Tesseract OCR
  const extractTimesFromImage = async () => {
    if (!importImage) return

    setExtracting(true)
    try {
      const Tesseract = (await import('tesseract.js')).default

      const result = await Tesseract.recognize(importImage, 'eng', {
        logger: () => {}
      })

      const text = result.data.text

      // Extract all times in HH:MM format
      const timePattern = /\b([0-2]?[0-9]):([0-5][0-9])\b/g
      const matches = text.match(timePattern) || []

      // Normalize and dedupe
      const normalized = matches.map(t => {
        const [h, m] = t.split(':')
        return `${h.padStart(2, '0')}:${m}`
      })
      const uniqueTimes = [...new Set(normalized)].sort()

      if (uniqueTimes.length === 0) {
        toast.error("No times found in image. Try a clearer image.")
      } else {
        setExtractedTimes(uniqueTimes)
        setImportStep("review")
        toast.success(`Found ${uniqueTimes.length} times - please review`)
      }
    } catch (error) {
      console.error("OCR Error:", error)
      toast.error("Failed to read image")
    }
    setExtracting(false)
  }

  // Remove a time from extracted list
  const removeExtractedTime2 = (time: string) => {
    setExtractedTimes(prev => prev.filter(t => t !== time))
  }

  // Add a time manually
  const addTimeManually = (time: string) => {
    if (time && !extractedTimes.includes(time)) {
      setExtractedTimes(prev => [...prev, time].sort())
    }
  }

  // Save the route with extracted times
  const saveExtractedRoute = async () => {
    if (!routeName) {
      toast.error("Please enter route name")
      return
    }
    if (extractedTimes.length === 0) {
      toast.error("No times to save")
      return
    }

    setImportSaving(true)
    try {
      // Create route
      const { data: newRoute, error: routeError } = await supabase
        .from("transport_routes")
        .insert({
          transport_type: activeTab,
          route_name: routeName,
          route_code: routeCode || null,
          direction: routeDirection,
          stops: routeStops ? routeStops.split(',').map(s => s.trim()).filter(s => s) : [],
          is_active: true,
        })
        .select()
        .single()

      if (routeError) {
        console.error("Route error:", routeError)
        toast.error(`Route error: ${routeError.message}`)
        setImportSaving(false)
        return
      }

      // Add all times (format as HH:MM:SS for postgres time type)
      const scheduleInserts = extractedTimes.map(time => ({
        route_id: newRoute.id,
        departure_time: `${time}:00`,
        days_of_week: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        is_active: true,
      }))

      const { error: scheduleError } = await supabase
        .from("route_schedules")
        .insert(scheduleInserts)

      if (scheduleError) {
        console.error("Schedule error:", scheduleError)
        toast.error(`Schedule error: ${scheduleError.message}`)
        setImportSaving(false)
        return
      }

      toast.success(`Created route with ${extractedTimes.length} times`)
      resetImportDialog()
      loadRoutes()
    } catch (error: unknown) {
      console.error("Save error:", error)
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    setImportSaving(false)
  }

  const resetImportDialog = () => {
    setImportDialogOpen(false)
    setImportStep("upload")
    setImportImage(null)
    setExtractedTimes([])
    setRouteName("")
    setRouteCode("")
    setRouteDirection("outbound")
    setRouteStops("")
  }

  const filteredRoutes = routes.filter(r => r.transport_type === activeTab)

  const stats = {
    total: filteredRoutes.length,
    active: filteredRoutes.filter(r => r.is_active).length,
  }

  const exportCSV = () => {
    const headers = ["Route Name", "Code", "Direction", "Stops", "Status", "Type"]
    const rows = filteredRoutes.map(r => [
      r.route_name,
      r.route_code || "",
      r.direction,
      r.stops.join(" > "),
      r.is_active ? "Active" : "Inactive",
      r.transport_type
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `schedules_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Schedules exported")
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
    <PermissionGate permission="schedules:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-sm text-muted-foreground">Manage transport routes and schedules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadRoutes()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import from Image
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
          <div className="grid gap-3 grid-cols-2 mb-4">
            <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
                  <MapPin className="h-4 w-4 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tracking-tight">{stats.total}</p>
                  <p className="text-xs text-muted-foreground truncate">Total Routes</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
                  <Clock className="h-4 w-4 text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tracking-tight text-green-500">{stats.active}</p>
                  <p className="text-xs text-muted-foreground truncate">Active</p>
                </div>
                <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
                  {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
                </span>
              </div>
            </Card>
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <Card className="p-3 mb-4 bg-muted/50 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedIds.size} route{selectedIds.size > 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={filteredRoutes.length > 0 && filteredRoutes.every(r => selectedIds.has(r.id))}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds(new Set(filteredRoutes.map(r => r.id)))
                        } else {
                          setSelectedIds(new Set())
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Schedules</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No routes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoutes.map(route => (
                    <TableRow key={route.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(route.id)}
                          onCheckedChange={(checked) => {
                            const newSelected = new Set(selectedIds)
                            if (checked) {
                              newSelected.add(route.id)
                            } else {
                              newSelected.delete(route.id)
                            }
                            setSelectedIds(newSelected)
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{route.route_name}</TableCell>
                      <TableCell>{route.route_code || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{route.direction}</Badge>
                      </TableCell>
                      <TableCell>
                        {route.schedules?.length || 0} times
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={route.is_active}
                          onCheckedChange={() => toggleRouteStatus(route)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingRoute(route)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
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
                        </div>
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
            <div>
              <label className="text-sm font-medium">Stops</label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="add-stop-input"
                  placeholder="Type stop name and press Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const input = e.currentTarget
                      const val = input.value.trim()
                      if (val && !formData.stops.includes(val)) {
                        setFormData({ ...formData, stops: [...formData.stops, val] })
                        input.value = ''
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById('add-stop-input') as HTMLInputElement
                    const val = input?.value.trim()
                    if (val && !formData.stops.includes(val)) {
                      setFormData({ ...formData, stops: [...formData.stops, val] })
                      input.value = ''
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.stops.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.stops.map((stop, i) => (
                    <span
                      key={i}
                      draggable
                      onDragStart={(e) => {
                        setDraggedStopIndex(i)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedStopIndex !== null && draggedStopIndex !== i) {
                          const newStops = [...formData.stops]
                          const [dragged] = newStops.splice(draggedStopIndex, 1)
                          newStops.splice(i, 0, dragged)
                          setFormData({ ...formData, stops: newStops })
                        }
                        setDraggedStopIndex(null)
                      }}
                      onDragEnd={() => setDraggedStopIndex(null)}
                      className={`inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm cursor-grab active:cursor-grabbing ${draggedStopIndex === i ? 'opacity-50 ring-2 ring-primary' : ''}`}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                      {stop}
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          stops: formData.stops.filter((_, idx) => idx !== i)
                        })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Stops</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="edit-stop-input"
                    placeholder="Type stop name and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const input = e.currentTarget
                        const val = input.value.trim()
                        if (val && !editingRoute.stops?.includes(val)) {
                          setEditingRoute({
                            ...editingRoute,
                            stops: [...(editingRoute.stops || []), val]
                          })
                          input.value = ''
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const input = document.getElementById('edit-stop-input') as HTMLInputElement
                      const val = input?.value.trim()
                      if (val && !editingRoute.stops?.includes(val)) {
                        setEditingRoute({
                          ...editingRoute,
                          stops: [...(editingRoute.stops || []), val]
                        })
                        input.value = ''
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {editingRoute.stops && editingRoute.stops.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingRoute.stops.map((stop, i) => (
                      <span
                        key={i}
                        draggable
                        onDragStart={(e) => {
                          setDraggedStopIndex(i)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (draggedStopIndex !== null && draggedStopIndex !== i) {
                            const newStops = [...(editingRoute.stops || [])]
                            const [dragged] = newStops.splice(draggedStopIndex, 1)
                            newStops.splice(i, 0, dragged)
                            setEditingRoute({ ...editingRoute, stops: newStops })
                          }
                          setDraggedStopIndex(null)
                        }}
                        onDragEnd={() => setDraggedStopIndex(null)}
                        className={`inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm cursor-grab active:cursor-grabbing ${draggedStopIndex === i ? 'opacity-50 ring-2 ring-primary' : ''}`}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        {stop}
                        <button
                          type="button"
                          onClick={() => setEditingRoute({
                            ...editingRoute,
                            stops: editingRoute.stops?.filter((_, idx) => idx !== i)
                          })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Route{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected route{selectedIds.size > 1 ? 's' : ''} and all their schedules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedIds.size} Route${selectedIds.size > 1 ? 's' : ''}`
              )}
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

      {/* Import from Image Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) resetImportDialog() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              {importStep === "upload" ? "Import Schedule from Image" : "Review Extracted Times"}
            </DialogTitle>
          </DialogHeader>

          {importStep === "upload" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a schedule image. Times will be extracted automatically for you to review.
              </p>

              {!importImage ? (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> schedule image
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG</p>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="relative border rounded-lg overflow-hidden">
                    <img
                      src={importImage}
                      alt="Schedule"
                      className="w-full max-h-64 object-contain bg-muted"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => setImportImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={resetImportDialog}>Cancel</Button>
                <Button onClick={extractTimesFromImage} disabled={!importImage || extracting}>
                  {extracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Extract Times
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Route Info */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Route Name *</Label>
                  <Input
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    placeholder="e.g., R1 - Route One"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Route Code</Label>
                  <Input
                    value={routeCode}
                    onChange={(e) => setRouteCode(e.target.value)}
                    placeholder="e.g., R1"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Direction</Label>
                  <Select value={routeDirection} onValueChange={setRouteDirection}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stops */}
              <div>
                <Label className="text-xs">Stops (comma-separated)</Label>
                <Input
                  value={routeStops}
                  onChange={(e) => setRouteStops(e.target.value)}
                  placeholder="e.g., Water Supply, New Cargo, IT, Corporate Office, Domestic"
                  className="mt-1"
                />
              </div>

              {/* Extracted Times */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">
                    Extracted Times ({extractedTimes.length})
                  </Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="time"
                      id="add-time-manual"
                      className="w-28 h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const input = document.getElementById("add-time-manual") as HTMLInputElement
                        if (input?.value) {
                          addTimeManually(input.value)
                          input.value = ""
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Click on a time to remove it. Add missing times with the picker above.
                </p>
                <ScrollArea className="h-[200px] border rounded-lg p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {extractedTimes.map((time) => (
                      <Badge
                        key={time}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        onClick={() => removeExtractedTime2(time)}
                      >
                        {time}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                    {extractedTimes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No times. Add manually using the picker above.</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("upload")}>
                  Back
                </Button>
                <Button
                  onClick={saveExtractedRoute}
                  disabled={!routeName || extractedTimes.length === 0 || importSaving}
                >
                  {importSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Route ({extractedTimes.length} times)
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
