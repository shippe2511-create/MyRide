"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { toast } from "sonner"
import { Loader2, Clock, Calendar, Users, Car, ChevronLeft, ChevronRight, Wand2, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"
import { format, addDays, subDays } from "date-fns"

interface Driver {
  id: string
  profile_id: string
  profile?: { full_name: string }
}

interface Vehicle {
  id: string
  plate_no: string
  display_name: string
  capacity: number
}

interface TransportRoute {
  id: string
  route_name: string
  route_code: string | null
  transport_type: string
  direction: string
}

interface RouteSchedule {
  id: string
  route_id: string
  departure_time: string
  days_of_week: string[]
  is_active: boolean
  route?: TransportRoute
}

interface RosterAssignment {
  id: string
  route_schedule_id: string | null
  driver_id: string | null
  vehicle_id: string | null
  route_id: string
  departure_time: string
  service_date: string
  status: string
  route?: TransportRoute
  driver?: Driver
  vehicle?: Vehicle
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500",
  scheduled: "bg-blue-500",
  in_progress: "bg-yellow-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
}

export default function BusRosterPage() {
  const supabase = createClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [roster, setRoster] = useState<RosterAssignment[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [schedules, setSchedules] = useState<RouteSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [transportType, setTransportType] = useState("internal_bus")
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<"time" | "route" | "driver" | "vehicle" | "status">("time")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const [generateForm, setGenerateForm] = useState({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
  })

  useEffect(() => {
    loadMasterData()
  }, [transportType])

  useEffect(() => {
    setSelectedIds(new Set()) // Clear selection when date/type changes
    loadRoster()
  }, [selectedDate, transportType])

  const loadMasterData = async () => {
    const [driversRes, vehiclesRes, schedulesRes] = await Promise.all([
      supabase.from("drivers").select("id, profile_id, profile:profiles(full_name)"),
      supabase.from("vehicle_types").select("id, plate_no, display_name, capacity").eq("is_active", true),
      supabase.from("route_schedules").select(`
        *,
        route:transport_routes(id, route_name, route_code, transport_type, direction)
      `).eq("is_active", true),
    ])

    if (driversRes.data) setDrivers(driversRes.data as unknown as Driver[])
    if (vehiclesRes.data) setVehicles(vehiclesRes.data)
    if (schedulesRes.data) {
      // Filter schedules by transport type
      const filtered = (schedulesRes.data as RouteSchedule[]).filter(
        s => s.route?.transport_type === transportType
      )
      setSchedules(filtered)
    }
  }

  const loadRoster = async () => {
    setLoading(true)
    const dateStr = format(selectedDate, "yyyy-MM-dd")

    // First get route IDs for this transport type
    const { data: routes } = await supabase
      .from("transport_routes")
      .select("id")
      .eq("transport_type", transportType)

    if (!routes || routes.length === 0) {
      setRoster([])
      setLoading(false)
      return
    }

    const routeIds = routes.map(r => r.id)

    // Get roster assignments
    const { data: assignments, error } = await supabase
      .from("roster_assignments")
      .select("*")
      .eq("service_date", dateStr)
      .in("route_id", routeIds)
      .order("departure_time")

    if (error) {
      console.error("Load roster error:", error)
      setRoster([])
      setLoading(false)
      return
    }

    if (!assignments || assignments.length === 0) {
      setRoster([])
      setLoading(false)
      return
    }

    // Get related data separately
    const { data: routeData } = await supabase
      .from("transport_routes")
      .select("id, route_name, route_code, transport_type, direction")
      .in("id", routeIds)

    const driverIds = assignments.map(a => a.driver_id).filter(Boolean)
    const vehicleIds = assignments.map(a => a.vehicle_id).filter(Boolean)

    const { data: driverData } = driverIds.length > 0
      ? await supabase.from("drivers").select("id, profile_id, profile:profiles(full_name)").in("id", driverIds)
      : { data: [] }

    const { data: vehicleData } = vehicleIds.length > 0
      ? await supabase.from("vehicle_types").select("id, plate_no, display_name, capacity").in("id", vehicleIds)
      : { data: [] }

    // Combine data
    const combined = assignments.map(a => ({
      ...a,
      route: routeData?.find(r => r.id === a.route_id),
      driver: driverData?.find(d => d.id === a.driver_id),
      vehicle: vehicleData?.find(v => v.id === a.vehicle_id),
    }))

    setRoster(combined as RosterAssignment[])
    setLoading(false)
  }

  const navigateDate = (direction: "prev" | "next") => {
    setSelectedDate(direction === "prev" ? subDays(selectedDate, 1) : addDays(selectedDate, 1))
  }

  const updateAssignment = async (id: string, field: "driver_id" | "vehicle_id", value: string | null) => {
    setSaving(id)

    // Find current assignment to determine new status
    const current = roster.find(r => r.id === id)
    const newDriverId = field === "driver_id" ? value : current?.driver_id
    const newVehicleId = field === "vehicle_id" ? value : current?.vehicle_id

    // Only update status if currently pending or scheduled (not in_progress/completed)
    let newStatus = current?.status
    if (current?.status === "scheduled" || current?.status === "pending") {
      newStatus = (newDriverId && newVehicleId) ? "scheduled" : "pending"
    }

    const { error } = await supabase
      .from("roster_assignments")
      .update({ [field]: value || null, status: newStatus })
      .eq("id", id)

    if (error) {
      toast.error("Failed to update assignment")
    } else {
      setRoster(prev => prev.map(r => {
        if (r.id !== id) return r
        if (field === "driver_id") {
          const driver = drivers.find(d => d.id === value)
          return { ...r, driver_id: value, driver: driver || undefined, status: newStatus || r.status }
        } else {
          const vehicle = vehicles.find(v => v.id === value)
          return { ...r, vehicle_id: value, vehicle: vehicle || undefined, status: newStatus || r.status }
        }
      }))
      toast.success("Updated")
    }
    setSaving(null)
  }

  const generateRoster = async () => {
    const start = new Date(generateForm.startDate)
    const end = new Date(generateForm.endDate)

    if (start > end) {
      toast.error("End date must be after start date")
      return
    }

    setGenerating(true)

    try {
      // Map day names to day numbers (Mon=1, Sun=7)
      const dayNameToNum: Record<string, number> = {
        "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7
      }

      // Build all entries first
      const entries: Array<{
        route_schedule_id: string
        route_id: string
        departure_time: string
        service_date: string
        status: string
      }> = []

      for (let date = start; date <= end; date = addDays(date, 1)) {
        const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay()
        const dateStr = format(date, "yyyy-MM-dd")

        for (const schedule of schedules) {
          const scheduleDays = schedule.days_of_week?.map(d => dayNameToNum[d] || 0) || []
          if (!scheduleDays.includes(dayOfWeek)) continue

          entries.push({
            route_schedule_id: schedule.id,
            route_id: schedule.route_id,
            departure_time: schedule.departure_time,
            service_date: dateStr,
            status: "pending",
          })
        }
      }

      if (entries.length === 0) {
        toast.error("No entries to generate for this date range")
        setGenerating(false)
        return
      }

      // Batch insert with upsert (ignore conflicts)
      const { error, count } = await supabase
        .from("roster_assignments")
        .upsert(entries, {
          onConflict: "route_schedule_id,service_date",
          ignoreDuplicates: true
        })
        .select()

      if (error) {
        console.error("Insert error:", error)
        toast.error("Failed to generate roster: " + error.message)
      } else {
        toast.success(`Generated roster entries`)
      }
    } catch (e) {
      console.error("Generate error:", e)
      toast.error("Failed to generate roster")
    }

    setGenerating(false)
    setShowGenerateDialog(false)
    loadRoster()
  }

  const confirmDeleteSingle = (id: string) => {
    setDeleteTargetId(id)
  }

  const deleteAssignment = async () => {
    if (!deleteTargetId) return
    const { error } = await supabase.from("roster_assignments").delete().eq("id", deleteTargetId)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Deleted")
      loadRoster()
    }
    setDeleteTargetId(null)
  }

  const confirmDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setShowDeleteDialog(true)
  }

  const deleteSelectedAssignments = async () => {
    setShowDeleteDialog(false)
    setDeleting(true)
    const { error } = await supabase
      .from("roster_assignments")
      .delete()
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to delete selected assignments")
    } else {
      toast.success(`Deleted ${selectedIds.size} assignments`)
      setSelectedIds(new Set())
      loadRoster()
    }
    setDeleting(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedRoster.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedRoster.map(r => r.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const h = parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${minutes} ${ampm}`
  }

  const getStatusBadge = (assignment: RosterAssignment) => {
    // Show "Pending" if driver or vehicle is missing (unless completed/in_progress/cancelled)
    let displayStatus = assignment.status
    if (assignment.status === "scheduled" || assignment.status === "pending") {
      if (!assignment.driver_id || !assignment.vehicle_id) {
        displayStatus = "pending"
      } else {
        displayStatus = "scheduled"
      }
    }

    return (
      <Badge variant="outline" className={`${STATUS_COLORS[displayStatus] || "bg-gray-500"} text-white border-0 capitalize`}>
        {displayStatus.replace("_", " ")}
      </Badge>
    )
  }

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />
    return sortDirection === "asc"
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />
  }

  // Get unique routes from roster for filter tabs
  const uniqueRoutes = roster.reduce((acc, item) => {
    if (item.route && !acc.find(r => r.id === item.route?.id)) {
      acc.push({
        id: item.route.id,
        name: item.route.route_name,
        code: item.route.route_code,
        direction: item.route.direction
      })
    }
    return acc
  }, [] as { id: string; name: string; code: string | null; direction: string }[])

  // Filter by selected route
  const filteredRoster = selectedRouteId
    ? roster.filter(r => r.route?.id === selectedRouteId)
    : roster

  const sortedRoster = [...filteredRoster].sort((a, b) => {
    const dir = sortDirection === "asc" ? 1 : -1
    switch (sortField) {
      case "time":
        return dir * a.departure_time.localeCompare(b.departure_time)
      case "route":
        return dir * (a.route?.route_name || "").localeCompare(b.route?.route_name || "")
      case "driver":
        const driverA = (a.driver?.profile as { full_name?: string })?.full_name || ""
        const driverB = (b.driver?.profile as { full_name?: string })?.full_name || ""
        return dir * driverA.localeCompare(driverB)
      case "vehicle":
        return dir * (a.vehicle?.display_name || "").localeCompare(b.vehicle?.display_name || "")
      case "status":
        return dir * a.status.localeCompare(b.status)
      default:
        return 0
    }
  })

  const getTransportLabel = (type: string) => {
    switch (type) {
      case "internal_bus": return "Internal Bus"
      case "mtcc_bus": return "MTCC Bus"
      case "ferry": return "Ferry"
      default: return type
    }
  }

  return (
    <PermissionGate permission="settings:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Bus Roster
            </h1>
            <p className="text-muted-foreground">Assign drivers and vehicles to scheduled departures</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={confirmDeleteSelected}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete ({selectedIds.size})
              </Button>
            )}
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Wand2 className="h-4 w-4 mr-2" />
              Generate Roster
            </Button>
          </div>
        </div>

        {/* Transport Type Filter */}
        <div className="flex gap-2">
          {["internal_bus", "mtcc_bus", "ferry"].map(type => (
            <Button
              key={type}
              variant={transportType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setTransportType(type)}
            >
              {getTransportLabel(type)}
            </Button>
          ))}
        </div>

        {/* Date Navigation - Compact Design */}
        <div className="flex items-center justify-center gap-3 bg-card/50 rounded-lg p-2 border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateDate("prev")}
            className="h-8 w-8 rounded-full hover:bg-primary/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">
                {format(selectedDate, "d")}
              </span>
              <div className="text-left">
                <p className="text-xs font-medium leading-tight">{format(selectedDate, "MMMM yyyy")}</p>
                <p className="text-[10px] text-muted-foreground">{format(selectedDate, "EEEE")}</p>
              </div>
            </div>

            <div className="h-6 w-px bg-border" />

            <label className="relative w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors">
              <input
                type="date"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={(e) => e.target.value && setSelectedDate(new Date(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Calendar className="h-4 w-4 text-primary pointer-events-none" />
            </label>

            <Button
              variant={format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDate(new Date())}
              className="rounded-full px-3 h-7 text-xs"
            >
              Today
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateDate("next")}
            className="h-8 w-8 rounded-full hover:bg-primary/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Route Filter Tabs */}
        {uniqueRoutes.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedRouteId === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRouteId(null)}
            >
              All Routes ({roster.length})
            </Button>
            {uniqueRoutes.map(route => (
              <Button
                key={route.id}
                variant={selectedRouteId === route.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRouteId(route.id)}
              >
                {route.name}
              </Button>
            ))}
          </div>
        )}

        {/* Roster Table */}
        <Card>
          <CardHeader>
            <CardTitle>Roster for {format(selectedDate, "MMMM d, yyyy")}</CardTitle>
            <CardDescription>
              {sortedRoster.length} departures {selectedRouteId ? "for this route" : "scheduled"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : roster.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No departures scheduled for this date. Use "Generate Roster" to create from schedules.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === sortedRoster.length && sortedRoster.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("time")} className="flex items-center hover:text-foreground transition-colors">
                        Time <SortIcon field="time" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("route")} className="flex items-center hover:text-foreground transition-colors">
                        Route <SortIcon field="route" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("driver")} className="flex items-center hover:text-foreground transition-colors">
                        Driver <SortIcon field="driver" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("vehicle")} className="flex items-center hover:text-foreground transition-colors">
                        Vehicle <SortIcon field="vehicle" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => handleSort("status")} className="flex items-center hover:text-foreground transition-colors">
                        Status <SortIcon field="status" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRoster.map((assignment) => (
                    <TableRow key={assignment.id} className={selectedIds.has(assignment.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(assignment.id)}
                          onChange={() => toggleSelect(assignment.id)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{formatTime(assignment.departure_time)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{assignment.route?.route_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {assignment.route?.route_code} • {assignment.route?.direction}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-44">
                          <ComboboxInput
                            value={assignment.driver_id || ""}
                            onChange={(v) => updateAssignment(assignment.id, "driver_id", v || null)}
                            options={drivers.map(d => ({
                              value: d.id,
                              label: (d.profile as { full_name: string })?.full_name || "Unknown"
                            }))}
                            placeholder="Search driver..."
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-44">
                          <ComboboxInput
                            value={assignment.vehicle_id || ""}
                            onChange={(v) => updateAssignment(assignment.id, "vehicle_id", v || null)}
                            options={vehicles.map(v => ({
                              value: v.id,
                              label: `${v.display_name} (${v.plate_no})`
                            }))}
                            placeholder="Search vehicle..."
                          />
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(assignment)}</TableCell>
                      <TableCell>
                        {assignment.status === "scheduled" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDeleteSingle(assignment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Single Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this roster assignment. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAssignment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} assignments?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected roster assignments. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteSelectedAssignments} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Generate Roster Dialog */}
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Roster</DialogTitle>
              <DialogDescription>
                Create roster entries from {getTransportLabel(transportType)} schedules for a date range.
                Existing entries will not be duplicated.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={generateForm.startDate}
                    onChange={(e) => setGenerateForm({ ...generateForm, startDate: e.target.value })}
                    className="[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={generateForm.endDate}
                    onChange={(e) => setGenerateForm({ ...generateForm, endDate: e.target.value })}
                    className="[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  />
                </div>
              </div>
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p className="font-medium">Active Schedules: {schedules.length}</p>
                <p className="text-muted-foreground">
                  Roster entries will be created based on active {getTransportLabel(transportType)} schedules.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
              <Button onClick={generateRoster} disabled={generating || schedules.length === 0}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
