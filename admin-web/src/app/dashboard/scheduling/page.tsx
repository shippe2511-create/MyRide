"use client"

import { useState, useEffect, useRef } from "react"
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
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from "@dnd-kit/core"
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

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

function SortableRow({
  route,
  selectedIds,
  setSelectedIds,
  toggleRouteStatus,
  setEditingRoute,
  openTimesDialog,
  openStopsDialog,
  setDeleteId,
}: {
  route: TransportRoute
  selectedIds: Set<string>
  setSelectedIds: (ids: Set<string>) => void
  toggleRouteStatus: (route: TransportRoute) => void
  setEditingRoute: (route: TransportRoute) => void
  openTimesDialog: (route: TransportRoute) => void
  openStopsDialog: (route: TransportRoute) => void
  setDeleteId: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: route.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/50 transition-colors">
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
      <TableCell>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
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
              <DropdownMenuItem onClick={() => openStopsDialog(route)}>
                <MapPin className="h-4 w-4 mr-2" />
                Manage Stops
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
  )
}

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

  // Stops management states
  const [stopsRoute, setStopsRoute] = useState<TransportRoute | null>(null)
  const [routeStopsData, setRouteStopsData] = useState<{ id: string; stop_name: string; latitude: number; longitude: number; stop_order: number }[]>([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [stopForm, setStopForm] = useState({ stop_name: "", latitude: "", longitude: "" })
  const [showAddStop, setShowAddStop] = useState(false)
  const [editingStop, setEditingStop] = useState<{ id: string; stop_name: string; latitude: number; longitude: number; stop_order: number } | null>(null)
  const [savingStop, setSavingStop] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const mapPickerRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<any>(null)
  const leafletMarkerRef = useRef<any>(null)
  const setStopFormRef = useRef(setStopForm)
  setStopFormRef.current = setStopForm

  const isSavingRef = useRef(false)

  useEffect(() => {
    loadRoutes()

    const channel = supabase
      .channel('scheduling_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_routes' }, () => {
        if (!isSavingRef.current) loadRoutes(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_schedules' }, (payload) => {
        if (!isSavingRef.current) {
          loadRoutes(false)
          // Also update the schedules dialog if open
          if (payload.new && 'route_id' in payload.new) {
            const routeId = payload.new.route_id
            supabase
              .from("route_schedules")
              .select("*")
              .eq("route_id", routeId)
              .order("departure_time")
              .then(({ data }) => {
                if (data) setSchedules(data)
              })
          }
        }
      })
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
      .order("sort_order")
      .order("route_name")

    setRoutes(data || [])
    if (showLoading) setLoading(false)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const filteredRoutes = routes.filter(r => r.transport_type === activeTab)
    const oldIndex = filteredRoutes.findIndex(r => r.id === active.id)
    const newIndex = filteredRoutes.findIndex(r => r.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Reorder locally first for immediate feedback
    const reordered = arrayMove(filteredRoutes, oldIndex, newIndex)

    // Update sort_order for all affected routes
    isSavingRef.current = true
    const updates = reordered.map((route, index) =>
      supabase.from("transport_routes").update({ sort_order: index }).eq("id", route.id)
    )
    await Promise.all(updates)
    isSavingRef.current = false

    loadRoutes(false)
    toast.success("Order updated")
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
    isSavingRef.current = true
    // Optimistic update
    setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_active: !r.is_active } : r))

    const { error } = await supabase
      .from("transport_routes")
      .update({ is_active: !route.is_active })
      .eq("id", route.id)

    if (error) {
      toast.error("Failed to update")
      // Revert on error
      setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, is_active: route.is_active } : r))
    }
    setTimeout(() => { isSavingRef.current = false }, 500)
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

  const openStopsDialog = async (route: TransportRoute) => {
    setStopsRoute(route)
    setLoadingStops(true)
    const { data } = await supabase
      .from("route_stops")
      .select("*")
      .eq("route_id", route.id)
      .order("stop_order")
    setRouteStopsData(data || [])
    setLoadingStops(false)
  }

  const addStop = async () => {
    if (!stopsRoute || !stopForm.stop_name || !stopForm.latitude || !stopForm.longitude) {
      toast.error("Please fill all fields")
      return
    }
    setSavingStop(true)
    const lat = parseFloat(stopForm.latitude)
    const lng = parseFloat(stopForm.longitude)
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Invalid coordinates")
      setSavingStop(false)
      return
    }

    if (editingStop) {
      const { error } = await supabase
        .from("route_stops")
        .update({ stop_name: stopForm.stop_name, latitude: lat, longitude: lng })
        .eq("id", editingStop.id)
      if (error) {
        toast.error("Failed to update stop")
      } else {
        toast.success("Stop updated")
        setShowAddStop(false)
        setEditingStop(null)
        openStopsDialog(stopsRoute)
      }
    } else {
      const nextOrder = routeStopsData.length > 0 ? Math.max(...routeStopsData.map(s => s.stop_order)) + 1 : 1
      const { error } = await supabase.from("route_stops").insert({
        route_id: stopsRoute.id,
        stop_name: stopForm.stop_name,
        latitude: lat,
        longitude: lng,
        stop_order: nextOrder,
      })
      if (error) {
        toast.error("Failed to add stop")
      } else {
        toast.success("Stop added")
        setShowAddStop(false)
        openStopsDialog(stopsRoute)
      }
    }
    setStopForm({ stop_name: "", latitude: "", longitude: "" })
    setSavingStop(false)
  }

  const deleteStop = async (stopId: string) => {
    if (!stopsRoute) return
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId)
    if (!error) {
      toast.success("Stop deleted")
      openStopsDialog(stopsRoute)
    } else {
      toast.error("Failed to delete stop")
    }
  }

  const moveStop = async (stopId: string, direction: "up" | "down") => {
    const stopIndex = routeStopsData.findIndex(s => s.id === stopId)
    if (stopIndex === -1) return
    const swapIndex = direction === "up" ? stopIndex - 1 : stopIndex + 1
    if (swapIndex < 0 || swapIndex >= routeStopsData.length) return

    const stop = routeStopsData[stopIndex]
    const swapStop = routeStopsData[swapIndex]

    await supabase.from("route_stops").update({ stop_order: swapStop.stop_order }).eq("id", stop.id)
    await supabase.from("route_stops").update({ stop_order: stop.stop_order }).eq("id", swapStop.id)
    openStopsDialog(stopsRoute!)
  }

  const initLeafletMap = async () => {
    if (!mapPickerRef.current) return
    if (leafletMapRef.current) return // Already initialized

    const L = (await import("leaflet")).default
    await import("leaflet/dist/leaflet.css")

    // Fix marker icon paths
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    })

    const defaultCenter = { lat: 4.1755, lng: 73.5093 }
    const initialLat = stopForm.latitude ? parseFloat(stopForm.latitude) : defaultCenter.lat
    const initialLng = stopForm.longitude ? parseFloat(stopForm.longitude) : defaultCenter.lng

    const map = L.map(mapPickerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: false, // We'll add custom zoom control
    })
    leafletMapRef.current = map

    // Dark tile layer matching Service Zones
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CartoDB</a>',
      maxZoom: 19,
    }).addTo(map)

    // Custom yellow marker - larger and more visible
    const yellowIcon = L.divIcon({
      className: "stop-marker-icon",
      html: `<div style="width: 32px; height: 32px; background: #FFD60A; border: 4px solid #000; border-radius: 50%; box-shadow: 0 4px 12px rgba(255,214,10,0.5); cursor: grab;"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })

    const marker = L.marker([initialLat, initialLng], {
      icon: yellowIcon,
      draggable: true,
    }).addTo(map)
    leafletMarkerRef.current = marker

    // Auto-fill coordinates on map load if empty
    if (!stopForm.latitude || !stopForm.longitude) {
      setStopFormRef.current(prev => ({
        ...prev,
        latitude: initialLat.toFixed(7),
        longitude: initialLng.toFixed(7),
      }))
    }

    // Click on map to move marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      setStopFormRef.current(prev => ({
        ...prev,
        latitude: e.latlng.lat.toFixed(7),
        longitude: e.latlng.lng.toFixed(7),
      }))
    })

    // Drag marker
    marker.on("dragend", () => {
      const pos = marker.getLatLng()
      setStopFormRef.current(prev => ({
        ...prev,
        latitude: pos.lat.toFixed(7),
        longitude: pos.lng.toFixed(7),
      }))
    })

    // Add layer control for satellite view
    const baseLayers: Record<string, L.TileLayer> = {
      "Dark": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }),
      "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
      }),
    }

    L.control.layers(baseLayers, {}, { position: "topright" }).addTo(map)

    // Add zoom control at bottom right
    L.control.zoom({ position: "bottomright" }).addTo(map)

    // Add center button
    const CenterControl = L.Control.extend({
      onAdd: function() {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control")
        const btn = L.DomUtil.create("a", "", container)
        btn.href = "#"
        btn.innerHTML = "⊕"
        btn.title = "Center on marker"
        btn.style.cssText = "width: 30px; height: 30px; line-height: 30px; display: block; text-align: center; font-size: 18px; text-decoration: none; color: #333; background: white;"
        L.DomEvent.on(btn, "click", function(e) {
          L.DomEvent.preventDefault(e)
          const pos = marker.getLatLng()
          map.setView(pos, 17)
        })
        return container
      }
    })
    new CenterControl({ position: "bottomright" }).addTo(map)

    // Force map to resize after render
    setTimeout(() => map.invalidateSize(), 100)
  }

  useEffect(() => {
    if (showMapPicker) {
      // Wait for container to be in DOM then init map
      const timer = setTimeout(() => {
        if (mapPickerRef.current && !leafletMapRef.current) {
          initLeafletMap()
        }
      }, 200)
      return () => clearTimeout(timer)
    } else {
      // Cleanup when hidden
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        leafletMarkerRef.current = null
      }
    }
  }, [showMapPicker])

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
      const Tesseract = (await import("tesseract.js")).default
      const result = await Tesseract.recognize(importImage, "eng", { logger: () => {} })
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                    <TableHead className="w-[40px]"></TableHead>
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
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No routes found
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SortableContext items={filteredRoutes.map(r => r.id)} strategy={verticalListSortingStrategy}>
                      {filteredRoutes.map((route) => (
                        <SortableRow
                          key={route.id}
                          route={route}
                          selectedIds={selectedIds}
                          setSelectedIds={setSelectedIds}
                          toggleRouteStatus={toggleRouteStatus}
                          setEditingRoute={setEditingRoute}
                          openTimesDialog={openTimesDialog}
                          openStopsDialog={openStopsDialog}
                          setDeleteId={setDeleteId}
                        />
                      ))}
                    </SortableContext>
                  )}
                </TableBody>
              </Table>
            </DndContext>
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
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Add New Time</h4>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !timesRoute) return
                      try {
                        toast.info("Extracting times from image...")

                        // Convert file to base64 data URL for Tesseract
                        const reader = new FileReader()
                        reader.onload = async () => {
                          try {
                            const imageData = reader.result as string
                            const Tesseract = (await import("tesseract.js")).default
                            const result = await Tesseract.recognize(imageData, "eng", { logger: () => {} })
                            const text = result.data.text

                            // Extract times in format HH:MM
                            const timePattern = /\b([0-2]?[0-9]):([0-5][0-9])\b/g
                            const matches = text.match(timePattern) || []

                            // Normalize and dedupe
                            const times = [...new Set(matches.map(t => {
                              const [h, m] = t.split(":")
                              return `${h.padStart(2, "0")}:${m}`
                            }))].sort()

                            if (times.length === 0) {
                              toast.error("No times found in image. Try a clearer image.")
                              return
                            }

                            // Add extracted times to the route
                            const inserts = times.map(time => ({
                              route_id: timesRoute.id,
                              departure_time: time,
                              days_of_week: newDays.length > 0 ? newDays : DAYS
                            }))

                            const { error } = await supabase.from("route_schedules").insert(inserts)
                            if (error) throw error

                            toast.success(`Added ${times.length} times from image`)

                            // Reload schedules for current route
                            const { data: updatedSchedules } = await supabase
                              .from("route_schedules")
                              .select("*")
                              .eq("route_id", timesRoute.id)
                            setSchedules(updatedSchedules || [])
                          } catch (err: unknown) {
                            const error = err as Error
                            console.error("OCR Error:", error?.message, error?.stack, JSON.stringify(err))
                            toast.error(error?.message || "Failed to read image")
                          }
                        }
                        reader.readAsDataURL(file)
                      } catch (err) {
                        console.error(err)
                        toast.error("Failed to process image")
                      }
                      e.target.value = ""
                    }}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-1" />
                      From Photo
                    </span>
                  </Button>
                </label>
              </div>
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

      {/* Manage Stops Dialog */}
      <Dialog open={!!stopsRoute} onOpenChange={(open) => !open && setStopsRoute(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Stops - {stopsRoute?.route_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loadingStops ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">{routeStopsData.length} stops</p>
                  <Button size="sm" onClick={() => { setShowAddStop(true); setEditingStop(null); setStopForm({ stop_name: "", latitude: "", longitude: "" }) }}>
                    <Plus className="h-4 w-4 mr-1" /> Add Stop
                  </Button>
                </div>

                {routeStopsData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No stops added yet</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {routeStopsData.map((stop, index) => (
                      <div key={stop.id} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveStop(stop.id, "up")} disabled={index === 0}>
                            <span className="text-xs">▲</span>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveStop(stop.id, "down")} disabled={index === routeStopsData.length - 1}>
                            <span className="text-xs">▼</span>
                          </Button>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {stop.stop_order}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{stop.stop_name}</p>
                          <p className="text-xs text-muted-foreground">{stop.latitude}, {stop.longitude}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingStop(stop)
                          setStopForm({ stop_name: stop.stop_name, latitude: stop.latitude.toString(), longitude: stop.longitude.toString() })
                          setShowAddStop(true)
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteStop(stop.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddStop && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="font-medium">{editingStop ? "Edit Stop" : "Add Stop"}</h4>
                    <Input
                      value={stopForm.stop_name}
                      onChange={(e) => setStopForm({ ...stopForm, stop_name: e.target.value })}
                      placeholder="Stop name"
                    />
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Input
                          value={stopForm.latitude}
                          onChange={(e) => setStopForm({ ...stopForm, latitude: e.target.value })}
                          placeholder="Latitude"
                          type="number"
                          step="any"
                        />
                        <Input
                          value={stopForm.longitude}
                          onChange={(e) => setStopForm({ ...stopForm, longitude: e.target.value })}
                          placeholder="Longitude"
                          type="number"
                          step="any"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowMapPicker(!showMapPicker)}
                        title="Pick from map"
                      >
                        <MapPin className="h-4 w-4" />
                      </Button>
                    </div>
                    {showMapPicker && (
                      <div
                        ref={mapPickerRef}
                        className="h-96 w-full rounded-lg border"
                        style={{ minHeight: "384px" }}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button onClick={addStop} disabled={savingStop}>
                        {savingStop && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingStop ? "Update" : "Add"}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowAddStop(false); setEditingStop(null) }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
