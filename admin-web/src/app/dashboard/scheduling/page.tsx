"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus, Bus, Ship, MoreHorizontal, Edit, Trash2, Loader2, Clock, Ban, CheckCircle,
  MapPin, ArrowRight, GripVertical, X, Eye, Upload, FileText, Download
} from "lucide-react"
import { toast } from "sonner"

interface RouteStop {
  id: string
  route_id: string
  stop_name: string
  stop_order: number
  arrival_offset_minutes: number
}

interface RouteSchedule {
  id: string
  route_id: string
  departure_time: string
  days_of_week: string[]
  is_active: boolean
}

interface TransportRoute {
  id: string
  transport_type: "internal_bus" | "mtcc_bus" | "ferry"
  route_name: string
  route_code: string | null
  direction: string
  duration_minutes: number | null
  is_active: boolean
  created_at: string
  stops?: RouteStop[]
  schedules?: RouteSchedule[]
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function SchedulingPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>("internal_bus")
  const [dialogType, setDialogType] = useState<"add" | "edit" | "delete" | "view" | "schedule" | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<TransportRoute | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    transport_type: "internal_bus" as "internal_bus" | "mtcc_bus" | "ferry",
    route_name: "",
    route_code: "",
    direction: "outbound",
    duration_minutes: "",
    is_active: true,
    stops: [] as { name: string; offset: number }[],
  })

  const [scheduleForm, setScheduleForm] = useState({
    departure_time: "",
    days_of_week: ["Mon", "Tue", "Wed", "Thu", "Fri"] as string[],
  })
  const [bulkTimes, setBulkTimes] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [generatorForm, setGeneratorForm] = useState({
    startTime: "06:00",
    endTime: "09:00",
    interval: 15,
  })

  useEffect(() => {
    loadRoutes()
  }, [])

  const loadRoutes = async () => {
    const { data: routesData } = await supabase
      .from("transport_routes")
      .select("*")
      .order("route_name", { ascending: true })

    if (routesData) {
      const routesWithDetails = await Promise.all(
        routesData.map(async (route) => {
          const [stopsRes, schedulesRes] = await Promise.all([
            supabase.from("route_stops").select("*").eq("route_id", route.id).order("stop_order"),
            supabase.from("route_schedules").select("*").eq("route_id", route.id).order("departure_time"),
          ])
          return {
            ...route,
            stops: stopsRes.data || [],
            schedules: schedulesRes.data || [],
          }
        })
      )
      setRoutes(routesWithDetails)
    }
    setLoading(false)
  }

  const internalBuses = routes.filter(r => r.transport_type === "internal_bus")
  const mtccBuses = routes.filter(r => r.transport_type === "mtcc_bus")
  const ferries = routes.filter(r => r.transport_type === "ferry")

  const openAddDialog = () => {
    setSelectedRoute(null)
    setFormData({
      transport_type: activeTab as "internal_bus" | "mtcc_bus" | "ferry",
      route_name: "",
      route_code: "",
      direction: "outbound",
      duration_minutes: "",
      is_active: true,
      stops: [{ name: "", offset: 0 }],
    })
    setDialogType("add")
  }

  const openEditDialog = (route: TransportRoute) => {
    setSelectedRoute(route)
    setFormData({
      transport_type: route.transport_type,
      route_name: route.route_name,
      route_code: route.route_code || "",
      direction: route.direction,
      duration_minutes: route.duration_minutes?.toString() || "",
      is_active: route.is_active,
      stops: route.stops?.map(s => ({ name: s.stop_name, offset: s.arrival_offset_minutes })) || [],
    })
    setDialogType("edit")
  }

  const openViewDialog = (route: TransportRoute) => {
    setSelectedRoute(route)
    setDialogType("view")
  }

  const openScheduleDialog = (route: TransportRoute) => {
    setSelectedRoute(route)
    setScheduleForm({
      departure_time: "",
      days_of_week: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    })
    setDialogType("schedule")
  }

  const addStop = () => {
    const lastOffset = formData.stops.length > 0
      ? formData.stops[formData.stops.length - 1].offset + 2
      : 0
    setFormData({
      ...formData,
      stops: [...formData.stops, { name: "", offset: lastOffset }],
    })
  }

  const removeStop = (index: number) => {
    setFormData({
      ...formData,
      stops: formData.stops.filter((_, i) => i !== index),
    })
  }

  const updateStop = (index: number, field: "name" | "offset", value: string | number) => {
    const newStops = [...formData.stops]
    newStops[index] = { ...newStops[index], [field]: value }
    setFormData({ ...formData, stops: newStops })
  }

  const handleSave = async () => {
    if (!formData.route_name.trim()) {
      toast.error("Route name is required")
      return
    }
    if (formData.stops.length < 2) {
      toast.error("At least 2 stops are required")
      return
    }
    if (formData.stops.some(s => !s.name.trim())) {
      toast.error("All stops must have a name")
      return
    }
    setSaving(true)

    const routePayload = {
      transport_type: formData.transport_type,
      route_name: formData.route_name,
      route_code: formData.route_code || null,
      direction: formData.direction,
      duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes) : null,
      is_active: formData.is_active,
      updated_at: new Date().toISOString(),
    }

    let routeId: string

    if (dialogType === "edit" && selectedRoute) {
      const { error } = await supabase
        .from("transport_routes")
        .update(routePayload)
        .eq("id", selectedRoute.id)

      if (error) {
        toast.error("Failed to update route: " + error.message)
        setSaving(false)
        return
      }
      routeId = selectedRoute.id

      // Delete existing stops
      await supabase.from("route_stops").delete().eq("route_id", routeId)
    } else {
      const { data, error } = await supabase
        .from("transport_routes")
        .insert(routePayload)
        .select()
        .single()

      if (error) {
        toast.error("Failed to create route: " + error.message)
        setSaving(false)
        return
      }
      routeId = data.id
    }

    // Insert stops
    const stopsPayload = formData.stops.map((stop, index) => ({
      route_id: routeId,
      stop_name: stop.name,
      stop_order: index + 1,
      arrival_offset_minutes: stop.offset,
    }))

    const { error: stopsError } = await supabase.from("route_stops").insert(stopsPayload)

    if (stopsError) {
      toast.error("Failed to save stops: " + stopsError.message)
    } else {
      toast.success(dialogType === "edit" ? "Route updated" : "Route created")
      loadRoutes()
    }

    setSaving(false)
    setDialogType(null)
  }

  const handleDelete = async () => {
    if (!selectedRoute) return
    setSaving(true)

    const { error } = await supabase
      .from("transport_routes")
      .delete()
      .eq("id", selectedRoute.id)

    if (error) toast.error("Failed to delete route")
    else {
      toast.success("Route deleted")
      loadRoutes()
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleAddSchedule = async () => {
    if (!selectedRoute || !scheduleForm.departure_time) {
      toast.error("Departure time is required")
      return
    }
    setSaving(true)

    const { error } = await supabase.from("route_schedules").insert({
      route_id: selectedRoute.id,
      departure_time: scheduleForm.departure_time,
      days_of_week: scheduleForm.days_of_week,
      is_active: true,
    })

    if (error) toast.error("Failed to add schedule: " + error.message)
    else {
      toast.success("Schedule added")
      loadRoutes()
    }
    setSaving(false)
    setDialogType(null)
  }

  const deleteSchedule = async (scheduleId: string) => {
    // Instantly update UI
    setRoutes(prev => prev.map(route => ({
      ...route,
      schedules: route.schedules?.filter(s => s.id !== scheduleId)
    })))
    if (selectedRoute) {
      setSelectedRoute({
        ...selectedRoute,
        schedules: selectedRoute.schedules?.filter(s => s.id !== scheduleId)
      })
    }

    // Delete from database
    const { error } = await supabase.from("route_schedules").delete().eq("id", scheduleId)
    if (error) {
      toast.error("Failed to delete schedule")
      loadRoutes() // Reload to restore if failed
    } else {
      toast.success("Schedule deleted")
    }
  }

  const toggleRouteStatus = async (route: TransportRoute) => {
    const { error } = await supabase
      .from("transport_routes")
      .update({ is_active: !route.is_active })
      .eq("id", route.id)

    if (error) toast.error("Failed to update status")
    else {
      toast.success(route.is_active ? "Route suspended" : "Route activated")
      loadRoutes()
    }
  }

  const toggleScheduleDay = (day: string) => {
    setScheduleForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day],
    }))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      // Parse times from file - supports formats like:
      // 06:00, 06:30, 07:00 (comma separated)
      // 06:00 06:30 07:00 (space separated)
      // 06:00\n06:30\n07:00 (newline separated)
      // 6:00 AM, 6:30 AM (12-hour format)
      const timeRegex = /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/gi
      const matches = text.matchAll(timeRegex)
      const times: string[] = []

      for (const match of matches) {
        let hours = parseInt(match[1])
        const minutes = match[2]
        const period = match[3]?.toUpperCase()

        // Convert 12-hour to 24-hour format
        if (period === "PM" && hours !== 12) hours += 12
        if (period === "AM" && hours === 12) hours = 0

        const time24 = `${hours.toString().padStart(2, "0")}:${minutes}`
        if (!times.includes(time24)) {
          times.push(time24)
        }
      }

      // Sort times
      times.sort()
      setBulkTimes(times)

      if (times.length === 0) {
        toast.error("No valid times found in file")
      } else {
        toast.success(`Found ${times.length} departure times`)
      }
    }
    reader.readAsText(file)
    e.target.value = "" // Reset input
  }

  const handleBulkImport = async () => {
    if (!selectedRoute || bulkTimes.length === 0) return
    setImporting(true)

    const schedules = bulkTimes.map(time => ({
      route_id: selectedRoute.id,
      departure_time: time,
      days_of_week: scheduleForm.days_of_week,
      is_active: true,
    }))

    const { error } = await supabase.from("route_schedules").insert(schedules)

    if (error) {
      toast.error("Failed to import: " + error.message)
    } else {
      toast.success(`Added ${bulkTimes.length} schedules successfully!`)
      setBulkTimes([])
      setDialogType(null)
      loadRoutes()
    }
    setImporting(false)
  }

  const removeBulkTime = (time: string) => {
    setBulkTimes(prev => prev.filter(t => t !== time))
  }

  const parseTimesFromText = (text: string) => {
    // Parse times from pasted text - supports formats like:
    // 06:00, 06:30, 07:00 (comma separated)
    // 06:00 06:30 07:00 (space separated)
    // 06:00\n06:30\n07:00 (newline separated)
    // 6:00 AM, 6:30 AM (12-hour format)
    const timeRegex = /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/gi
    const matches = text.matchAll(timeRegex)
    const times: string[] = []

    for (const match of matches) {
      let hours = parseInt(match[1])
      const minutes = match[2]
      const period = match[3]?.toUpperCase()

      // Convert 12-hour to 24-hour format
      if (period === "PM" && hours !== 12) hours += 12
      if (period === "AM" && hours === 12) hours = 0

      const time24 = `${hours.toString().padStart(2, "0")}:${minutes}`
      if (!times.includes(time24)) {
        times.push(time24)
      }
    }

    // Sort times
    times.sort()
    return times
  }

  const handlePasteText = () => {
    const times = parseTimesFromText(pasteText)
    if (times.length === 0) {
      toast.error("No valid times found")
    } else {
      setBulkTimes(prev => {
        const combined = [...new Set([...prev, ...times])]
        combined.sort()
        return combined
      })
      toast.success(`Found ${times.length} departure times`)
      setPasteText("")
    }
  }

  const downloadSampleFile = () => {
    const csvContent = `Time,Period,Notes
06:00,Morning,First bus
06:15,Morning,
06:30,Morning,
06:45,Morning,
07:00,Morning,Peak hour
07:15,Morning,
07:30,Morning,
07:45,Morning,
08:00,Morning,Peak hour
08:15,Morning,
08:30,Morning,
08:45,Morning,
09:00,Morning,
09:30,Morning,Last morning bus
12:00,Midday,
12:15,Midday,
12:30,Midday,
12:45,Midday,
13:00,Midday,
13:15,Midday,
13:30,Midday,
17:00,Evening,Peak hour
17:15,Evening,
17:30,Evening,
17:45,Evening,
18:00,Evening,Peak hour
18:15,Evening,
18:30,Evening,
18:45,Evening,
19:00,Evening,
22:00,Night,
22:30,Night,
23:00,Night,
23:30,Night,Last bus`

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "schedule_template.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("CSV template downloaded")
  }

  const generateTimeRange = () => {
    const { startTime, endTime, interval } = generatorForm
    if (!startTime || !endTime || !interval) {
      toast.error("Please fill all fields")
      return
    }

    const times: string[] = []
    const [startH, startM] = startTime.split(":").map(Number)
    const [endH, endM] = endTime.split(":").map(Number)

    let currentMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    // Handle overnight schedules (e.g., 22:00 to 02:00)
    const actualEnd = endMinutes < currentMinutes ? endMinutes + 24 * 60 : endMinutes

    while (currentMinutes <= actualEnd) {
      const h = Math.floor((currentMinutes % (24 * 60)) / 60)
      const m = currentMinutes % 60
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`)
      currentMinutes += interval
    }

    if (times.length === 0) {
      toast.error("No times generated")
      return
    }

    setBulkTimes(prev => {
      const combined = [...new Set([...prev, ...times])]
      combined.sort()
      return combined
    })
    toast.success(`Generated ${times.length} times (${startTime} to ${endTime}, every ${interval} min)`)
  }

  const formatTime = (time: string) => {
    if (!time) return "-"
    const [hours, minutes] = time.split(":")
    const h = parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const hour = h % 12 || 12
    return `${hour}:${minutes} ${ampm}`
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "internal_bus": return <Bus className="h-4 w-4 text-yellow-500" />
      case "mtcc_bus": return <Bus className="h-4 w-4 text-green-500" />
      case "ferry": return <Ship className="h-4 w-4 text-cyan-500" />
      default: return null
    }
  }

  const renderRouteTable = (data: TransportRoute[]) => (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>Schedules</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No routes found. Click "Add Route" to create one.
                </TableCell>
              </TableRow>
            ) : (
              data.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(route.transport_type)}
                      <div>
                        <p className="font-medium">{route.route_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {route.route_code} • {route.direction}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{route.stops?.length || 0} stops</span>
                    </div>
                    {route.stops && route.stops.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {route.stops[0].stop_name} → {route.stops[route.stops.length - 1].stop_name}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{route.schedules?.length || 0} times</span>
                    </div>
                    {route.schedules && route.schedules.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {route.schedules.slice(0, 3).map(s => formatTime(s.departure_time)).join(", ")}
                        {route.schedules.length > 3 && ` +${route.schedules.length - 3}`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {route.duration_minutes ? `${route.duration_minutes} min` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.is_active ? "success" : "destructive"}>
                      {route.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openViewDialog(route)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Route
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEditDialog(route)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Route
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openScheduleDialog(route)}>
                          <Clock className="mr-2 h-4 w-4" />
                          Add Schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleRouteStatus(route)}>
                          {route.is_active ? (
                            <><Ban className="mr-2 h-4 w-4" />Suspend</>
                          ) : (
                            <><CheckCircle className="mr-2 h-4 w-4" />Activate</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => {
                            setSelectedRoute(route)
                            setDialogType("delete")
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
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
      </CardContent>
    </Card>
  )

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
          <h1 className="text-3xl font-bold">Transport Routes</h1>
          <p className="text-muted-foreground">
            Manage routes, stops, and schedules for staff transport
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Route
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bus className="h-4 w-4 text-yellow-500" />
              Internal Bus Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{internalBuses.length}</div>
            <p className="text-xs text-muted-foreground">
              {internalBuses.filter(r => r.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bus className="h-4 w-4 text-green-500" />
              MTCC Bus Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{mtccBuses.length}</div>
            <p className="text-xs text-muted-foreground">
              {mtccBuses.filter(r => r.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ship className="h-4 w-4 text-cyan-500" />
              Ferry Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{ferries.length}</div>
            <p className="text-xs text-muted-foreground">
              {ferries.filter(r => r.is_active).length} active
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="internal_bus" className="flex items-center gap-2">
            <Bus className="h-4 w-4" />
            Internal Bus ({internalBuses.length})
          </TabsTrigger>
          <TabsTrigger value="mtcc_bus" className="flex items-center gap-2">
            <Bus className="h-4 w-4" />
            MTCC Bus ({mtccBuses.length})
          </TabsTrigger>
          <TabsTrigger value="ferry" className="flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Ferry ({ferries.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="internal_bus">{renderRouteTable(internalBuses)}</TabsContent>
        <TabsContent value="mtcc_bus">{renderRouteTable(mtccBuses)}</TabsContent>
        <TabsContent value="ferry">{renderRouteTable(ferries)}</TabsContent>
      </Tabs>

      {/* Add/Edit Route Dialog */}
      <Dialog open={dialogType === "add" || dialogType === "edit"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogType === "add" ? "Add Route" : "Edit Route"}</DialogTitle>
            <DialogDescription>
              Define route details and stops
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Transport Type *</label>
                <Select
                  value={formData.transport_type}
                  onValueChange={(v) => setFormData({ ...formData, transport_type: v as typeof formData.transport_type })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal_bus">Internal Bus</SelectItem>
                    <SelectItem value="mtcc_bus">MTCC Bus</SelectItem>
                    <SelectItem value="ferry">Ferry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Direction</label>
                <Select
                  value={formData.direction}
                  onValueChange={(v) => setFormData({ ...formData, direction: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Route Name *</label>
                <Input
                  value={formData.route_name}
                  onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
                  placeholder="e.g. Male - Hulhule"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Route Code</label>
                <Input
                  value={formData.route_code}
                  onChange={(e) => setFormData({ ...formData, route_code: e.target.value })}
                  placeholder="INT-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Duration (minutes)</label>
                <Input
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  placeholder="15"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                />
                <span className="text-sm">Active</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Route Stops *</label>
                <Button type="button" variant="outline" size="sm" onClick={addStop}>
                  <Plus className="h-4 w-4 mr-1" /> Add Stop
                </Button>
              </div>
              <div className="space-y-2">
                {formData.stops.map((stop, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6">
                      {index === 0 ? (
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      ) : index === formData.stops.length - 1 ? (
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                      )}
                    </div>
                    <Input
                      className="flex-1"
                      placeholder={`Stop ${index + 1} name`}
                      value={stop.name}
                      onChange={(e) => updateStop(index, "name", e.target.value)}
                    />
                    <Input
                      className="w-20"
                      type="number"
                      placeholder="min"
                      value={stop.offset}
                      onChange={(e) => updateStop(index, "offset", parseInt(e.target.value) || 0)}
                    />
                    <span className="text-xs text-muted-foreground w-8">min</span>
                    {formData.stops.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStop(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Green = First stop, Red = Last stop. Time offset is minutes from departure.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : dialogType === "add" ? "Create Route" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Route Dialog - Modern Design */}
      <Dialog open={dialogType === "view"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                {selectedRoute && getTypeIcon(selectedRoute.transport_type)}
              </div>
              <div>
                <DialogTitle className="text-lg">{selectedRoute?.route_name}</DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedRoute?.route_code} • {selectedRoute?.duration_minutes} min • {selectedRoute?.direction}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRoute && (
            <div className="flex-1 overflow-y-auto space-y-6 py-4">
              {/* Route Stops - Compact Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Route Stops
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedRoute.stops?.map((stop, index) => (
                    <div key={stop.id} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${
                        index === 0 ? "bg-green-500" :
                        index === (selectedRoute.stops?.length || 0) - 1 ? "bg-red-500" :
                        "bg-muted-foreground"
                      }`} />
                      <span className="text-sm">{stop.stop_name}</span>
                      <span className="text-[10px] text-muted-foreground">+{stop.arrival_offset_minutes}m</span>
                      {index < (selectedRoute.stops?.length || 0) - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Departure Times - Modern Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Departure Times
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {selectedRoute.schedules?.length || 0}
                    </Badge>
                  </h4>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => openScheduleDialog(selectedRoute)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Times
                  </Button>
                </div>

                {selectedRoute.schedules && selectedRoute.schedules.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {selectedRoute.schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="group relative bg-card border rounded-lg p-3 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-lg font-semibold">{formatTime(schedule.departure_time)}</span>
                            <div className="flex gap-0.5 mt-1.5">
                              {DAYS.map(day => (
                                <span
                                  key={day}
                                  className={`text-[10px] w-5 h-5 flex items-center justify-center rounded ${
                                    schedule.days_of_week?.includes(day)
                                      ? "bg-primary text-primary-foreground font-medium"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {day[0]}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2"
                            onClick={() => deleteSchedule(schedule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-muted/30 rounded-lg border-2 border-dashed">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No departure times scheduled</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => openScheduleDialog(selectedRoute)}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add First Schedule
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Schedule Dialog - Bulk Add Support */}
      <Dialog open={dialogType === "schedule"} onOpenChange={() => { setDialogType(null); setBulkTimes([]) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Add Departure Times
            </DialogTitle>
            <DialogDescription>
              Add schedules for {selectedRoute?.route_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Bulk Import - Compact */}
            <div className="flex gap-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste times here: 06:00, 06:30, 07:00 or 6:00 AM, 6:30 AM..."
                className="flex-1 h-10 px-3 py-2 text-sm font-mono bg-background border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button onClick={handlePasteText} disabled={!pasteText.trim()} className="h-10">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
              <label>
                <input type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                <Button variant="outline" className="h-10" asChild>
                  <span><Upload className="h-4 w-4" /></span>
                </Button>
              </label>
              <Button variant="outline" className="h-10" onClick={downloadSampleFile} title="Download CSV template">
                <Download className="h-4 w-4" />
              </Button>
            </div>

            {/* Add Single Time */}
            <div className="flex gap-2">
              <Input
                type="time"
                value={scheduleForm.departure_time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, departure_time: e.target.value })}
                className="flex-1 font-mono h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && scheduleForm.departure_time) {
                    if (!bulkTimes.includes(scheduleForm.departure_time)) {
                      setBulkTimes(prev => [...prev, scheduleForm.departure_time].sort())
                    }
                    setScheduleForm({ ...scheduleForm, departure_time: "" })
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (scheduleForm.departure_time && !bulkTimes.includes(scheduleForm.departure_time)) {
                    setBulkTimes(prev => [...prev, scheduleForm.departure_time].sort())
                    setScheduleForm({ ...scheduleForm, departure_time: "" })
                  }
                }}
                disabled={!scheduleForm.departure_time}
                className="h-10"
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {/* Selected Times */}
            {bulkTimes.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{bulkTimes.length} selected</span>
                  <Button variant="ghost" size="sm" onClick={() => setBulkTimes([])} className="h-6 text-xs px-2">
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bulkTimes.map(time => (
                    <span
                      key={time}
                      onClick={() => setBulkTimes(prev => prev.filter(t => t !== time))}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-mono cursor-pointer hover:bg-primary/80"
                    >
                      {formatTime(time)} ×
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Operating Days */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">OPERATING DAYS (applies to all imports)</p>
              <div className="flex gap-1">
                {DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleScheduleDay(day)}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                      scheduleForm.days_of_week.includes(day)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {day.slice(0, 1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setScheduleForm({ ...scheduleForm, days_of_week: ["Mon", "Tue", "Wed", "Thu", "Fri"] })}
                >
                  Weekdays
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setScheduleForm({ ...scheduleForm, days_of_week: ["Sat", "Sun"] })}
                >
                  Weekends
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setScheduleForm({ ...scheduleForm, days_of_week: DAYS })}
                >
                  All Days
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => { setDialogType(null); setBulkTimes([]) }}>
              {bulkTimes.length === 0 ? "Done" : "Cancel"}
            </Button>
            {bulkTimes.length > 0 && (
              <Button onClick={handleBulkImport} disabled={importing}>
                {importing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" /> Save {bulkTimes.length} Times</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={dialogType === "delete"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Route</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedRoute?.route_name}"? This will also delete all stops and schedules. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
