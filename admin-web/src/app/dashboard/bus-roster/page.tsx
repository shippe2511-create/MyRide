"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/hooks/usePermissions"
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
import { Loader2, Clock, Calendar, Users, Car, ChevronLeft, ChevronRight, Wand2, Trash2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Bus, CheckCircle2 } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"
import { format, addDays, subDays, parse } from "date-fns"

interface Driver {
  id: string
  profile_id: string
  profile?: { full_name: string }
}

interface DriverShift {
  id: string
  driver_id: string
  shift_date: string
  start_time: string
  end_time: string
  attendance_status: string
  absence_reason?: string
  driver?: Driver
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
  color?: string
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
  is_backup?: boolean
  backup_for_trip_id?: string | null
  route?: TransportRoute
  driver?: Driver
  vehicle?: Vehicle
}

interface FullShuttle {
  trip_id: string
  vehicle_number: string
  route_name: string
  route_id: string
  current_stop_name: string
  passengers_on_board: number
  vehicle_capacity: number
  driver_name: string
  has_backup: boolean
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
  const { isSuperAdmin } = usePermissions()
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
  const [driverShifts, setDriverShifts] = useState<DriverShift[]>([])
  const [showDriverPanel, setShowDriverPanel] = useState(true)
  const [fullShuttles, setFullShuttles] = useState<FullShuttle[]>([])
  const [showBackupDialog, setShowBackupDialog] = useState(false)
  const [selectedFullShuttle, setSelectedFullShuttle] = useState<FullShuttle | null>(null)
  const [backupDriverId, setBackupDriverId] = useState<string | null>(null)
  const [backupVehicleId, setBackupVehicleId] = useState<string | null>(null)
  const [assigningBackup, setAssigningBackup] = useState(false)
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<string>("transport")

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
    loadDriverShifts()
    loadFullShuttles()
  }, [selectedDate, transportType])

  useEffect(() => {
    if (departments.length > 0) {
      loadDriverShifts()
    }
  }, [selectedDepartment, departments])

  // Realtime subscription for bus_location_tracking (full shuttles)
  useEffect(() => {
    const trackingChannel = supabase
      .channel('bus_tracking_roster')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bus_location_tracking' },
        () => {
          loadFullShuttles()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(trackingChannel)
    }
  }, [])

  // Realtime subscription for shifts attendance updates
  useEffect(() => {
    const shiftsChannel = supabase
      .channel('shifts_attendance_updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          loadDriverShifts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shiftsChannel)
    }
  }, [selectedDate])

  // Realtime subscription for roster assignments
  useEffect(() => {
    const rosterChannel = supabase
      .channel('roster_assignments_updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'roster_assignments' },
        () => {
          loadRoster(false) // Don't show loading spinner for realtime updates
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rosterChannel)
    }
  }, [selectedDate, transportType])

  const loadDriverShifts = async () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd")

    const { data } = await supabase
      .from("shifts")
      .select(`
        id, driver_id, shift_date, start_time, end_time, attendance_status, absence_reason,
        driver:drivers!inner(id, profile_id, department_id, profile:profiles(full_name))
      `)
      .eq("shift_date", dateStr)

    if (data) {
      // Filter by selected department
      let filtered = data
      if (selectedDepartment !== "all") {
        const dept = departments.find(d => d.name.toLowerCase() === selectedDepartment)
        if (dept) {
          filtered = data.filter((s: any) => s.driver?.department_id === dept.id)
        }
      }
      setDriverShifts(filtered as unknown as DriverShift[])
    }
  }

  const loadFullShuttles = async () => {
    // Get shuttles that are full (passengers = capacity) and in_progress
    const { data: tracking } = await supabase
      .from("bus_location_tracking")
      .select(`
        id, trip_id, vehicle_number, passengers_on_board, vehicle_capacity,
        current_stop_name, status,
        route:transport_routes(id, route_name),
        driver:drivers(profile:profiles(full_name))
      `)
      .eq("status", "in_progress")

    if (!tracking) {
      setFullShuttles([])
      return
    }

    // Filter to only full shuttles
    const full = tracking.filter(t =>
      t.vehicle_capacity > 0 && t.passengers_on_board >= t.vehicle_capacity
    )

    // Check which have backups assigned
    const tripIds = full.map(f => f.trip_id)
    const { data: backups } = tripIds.length > 0
      ? await supabase
          .from("roster_assignments")
          .select("backup_for_trip_id")
          .in("backup_for_trip_id", tripIds)
      : { data: [] }

    const tripsWithBackup = new Set((backups || []).map(b => b.backup_for_trip_id))

    setFullShuttles(full.map(t => ({
      trip_id: t.trip_id,
      vehicle_number: t.vehicle_number,
      route_name: (t.route as any)?.route_name || "Unknown",
      route_id: (t.route as any)?.id || "",
      current_stop_name: t.current_stop_name || "",
      passengers_on_board: t.passengers_on_board,
      vehicle_capacity: t.vehicle_capacity,
      driver_name: (t.driver as any)?.profile?.full_name || "Unknown",
      has_backup: tripsWithBackup.has(t.trip_id)
    })))
  }

  const assignBackupBus = async () => {
    if (!selectedFullShuttle || !backupDriverId || !backupVehicleId) {
      toast.error("Please select driver and vehicle")
      return
    }

    setAssigningBackup(true)

    // Create a backup roster assignment
    const { error } = await supabase
      .from("roster_assignments")
      .insert({
        route_id: selectedFullShuttle.route_id,
        driver_id: backupDriverId,
        vehicle_id: backupVehicleId,
        service_date: format(new Date(), "yyyy-MM-dd"),
        departure_time: format(new Date(), "HH:mm:ss"),
        status: "scheduled",
        is_backup: true,
        backup_for_trip_id: selectedFullShuttle.trip_id
      })

    setAssigningBackup(false)

    if (error) {
      toast.error("Failed to assign backup: " + error.message)
    } else {
      toast.success(`Backup bus assigned for ${selectedFullShuttle.vehicle_number}`)
      setShowBackupDialog(false)
      setSelectedFullShuttle(null)
      setBackupDriverId(null)
      setBackupVehicleId(null)
      loadFullShuttles()
    }
  }

  const loadMasterData = async () => {
    // Load departments
    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .order("name")
    if (depts) setDepartments(depts)

    // Get Transport department ID for driver filtering
    const transportDept = depts?.find(d => d.name === "Transport")

    const [driversRes, vehiclesRes, schedulesRes] = await Promise.all([
      transportDept
        ? supabase.from("drivers").select("id, profile_id, profile:profiles(full_name)").eq("department_id", transportDept.id)
        : supabase.from("drivers").select("id, profile_id, profile:profiles(full_name)"),
      supabase.from("vehicle_types").select("id, plate_no, display_name, capacity").eq("is_active", true),
      supabase.from("route_schedules").select(`
        *,
        route:transport_routes(id, route_name, route_code, transport_type, direction, color)
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

  const loadRoster = async (showLoading = true) => {
    if (showLoading) setLoading(true)
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
      .select("id, route_name, route_code, transport_type, direction, color")
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
      loadRoster(false)
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
      loadRoster(false)
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

        {/* Full Shuttles Alert */}
        {fullShuttles.filter(s => !s.has_backup).length > 0 && (
          <Card className="border-red-500/50 bg-red-500/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Full Shuttles Need Backup ({fullShuttles.filter(s => !s.has_backup).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-2">
                {fullShuttles.filter(s => !s.has_backup).map(shuttle => (
                  <div
                    key={shuttle.trip_id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-red-500/30"
                  >
                    <div className="flex items-center gap-3">
                      <Bus className="h-4 w-4 text-red-400" />
                      <div>
                        <div className="font-medium text-sm">{shuttle.vehicle_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {shuttle.route_name} • {shuttle.driver_name} • @ {shuttle.current_stop_name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-500 text-white">
                        {shuttle.passengers_on_board}/{shuttle.vehicle_capacity} FULL
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        onClick={() => {
                          setSelectedFullShuttle(shuttle)
                          setShowBackupDialog(true)
                        }}
                      >
                        Assign Backup
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Driver Availability Panel */}
        <Card className="border-2 border-dashed">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Driver Availability for {format(selectedDate, "MMM d")}
              </CardTitle>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="h-8 px-2 text-sm rounded-md border bg-background"
                  >
                    <option value="transport">Transport</option>
                    <option value="all">All Departments</option>
                    {departments.filter(d => d.name !== "Transport").map(d => (
                      <option key={d.id} value={d.name.toLowerCase()}>{d.name}</option>
                    ))}
                  </select>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDriverPanel(!showDriverPanel)}
                >
                  {showDriverPanel ? "Hide" : "Show"}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showDriverPanel && (
            <CardContent className="pt-0">
              {driverShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shifts scheduled for this date</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* Present Drivers */}
                  {driverShifts.filter(s => s.attendance_status === "present").length > 0 && (
                    <div className="col-span-full">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-sm font-medium text-emerald-500">
                          Present ({driverShifts.filter(s => s.attendance_status === "present").length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {driverShifts.filter(s => s.attendance_status === "present").map(shift => {
                          const profile = shift.driver?.profile as { full_name?: string } | undefined
                          return (
                            <div
                              key={shift.id}
                              className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-sm text-emerald-600 dark:text-emerald-400"
                            >
                              {profile?.full_name || "Unknown"}
                              <span className="ml-2 text-xs opacity-70">
                                {shift.start_time.substring(0, 5)}-{shift.end_time.substring(0, 5)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Absent Drivers */}
                  {driverShifts.filter(s => s.attendance_status === "absent").length > 0 && (
                    <div className="col-span-full">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-sm font-medium text-red-500">
                          Absent ({driverShifts.filter(s => s.attendance_status === "absent").length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {driverShifts.filter(s => s.attendance_status === "absent").map(shift => {
                          const profile = shift.driver?.profile as { full_name?: string } | undefined
                          return (
                            <div
                              key={shift.id}
                              className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full text-sm text-red-600 dark:text-red-400"
                              title={shift.absence_reason || "No reason provided"}
                            >
                              {profile?.full_name || "Unknown"}
                              {shift.absence_reason && (
                                <span className="ml-2 text-xs opacity-70">({shift.absence_reason})</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pending Drivers */}
                  {driverShifts.filter(s => s.attendance_status === "pending" || !s.attendance_status).length > 0 && (
                    <div className="col-span-full">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                          Pending ({driverShifts.filter(s => s.attendance_status === "pending" || !s.attendance_status).length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {driverShifts.filter(s => s.attendance_status === "pending" || !s.attendance_status).map(shift => {
                          const profile = shift.driver?.profile as { full_name?: string } | undefined
                          return (
                            <div
                              key={shift.id}
                              className="px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-sm text-yellow-600 dark:text-yellow-400"
                            >
                              {profile?.full_name || "Unknown"}
                              <span className="ml-2 text-xs opacity-70">
                                {shift.start_time.substring(0, 5)}-{shift.end_time.substring(0, 5)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

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
                    <TableRow
                        key={assignment.id}
                        className={selectedIds.has(assignment.id) ? "bg-primary/5" : ""}
                        style={{ borderLeft: `4px solid ${assignment.route?.color || '#3B82F6'}` }}
                      >
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
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: assignment.route?.color || '#3B82F6' }}
                          />
                          <div>
                            <p className="font-medium">{assignment.route?.route_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {assignment.route?.route_code} • {assignment.route?.direction}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-44">
                          <ComboboxInput
                            value={assignment.driver_id || ""}
                            onChange={(v) => updateAssignment(assignment.id, "driver_id", v || null)}
                            options={drivers.map(d => {
                              const shift = driverShifts.find(s => s.driver_id === d.id)
                              const status = shift?.attendance_status === "present" ? "available"
                                : shift?.attendance_status === "absent" ? "assigned"
                                : undefined
                              return {
                                value: d.id,
                                label: (d.profile as { full_name: string })?.full_name || "Unknown",
                                status: status as "available" | "assigned" | undefined
                              }
                            })}
                            placeholder="Search driver..."
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-44">
                          <ComboboxInput
                            value={assignment.vehicle_id || ""}
                            onChange={(v) => updateAssignment(assignment.id, "vehicle_id", v || null)}
                            options={vehicles.map(v => {
                              // Check if vehicle is assigned to another roster entry (not this one)
                              const isOccupied = roster.some(r =>
                                r.vehicle_id === v.id && r.id !== assignment.id
                              )
                              return {
                                value: v.id,
                                label: `${v.display_name} (${v.plate_no})`,
                                status: isOccupied ? "assigned" as const : "available" as const
                              }
                            })}
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
                  <div className="relative flex items-center">
                    <div className="flex-1 h-10 px-3 py-2 rounded-md border border-input bg-background text-sm">
                      {generateForm.startDate ? format(parse(generateForm.startDate, "yyyy-MM-dd", new Date()), "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </div>
                    <input
                      type="date"
                      value={generateForm.startDate}
                      onChange={(e) => setGenerateForm({ ...generateForm, startDate: e.target.value })}
                      className="absolute right-0 w-10 h-10 opacity-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <Calendar className="absolute right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <div className="relative flex items-center">
                    <div className="flex-1 h-10 px-3 py-2 rounded-md border border-input bg-background text-sm">
                      {generateForm.endDate ? format(parse(generateForm.endDate, "yyyy-MM-dd", new Date()), "dd/MM/yyyy") : "dd/mm/yyyy"}
                    </div>
                    <input
                      type="date"
                      value={generateForm.endDate}
                      onChange={(e) => setGenerateForm({ ...generateForm, endDate: e.target.value })}
                      className="absolute right-0 w-10 h-10 opacity-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <Calendar className="absolute right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
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

        {/* Assign Backup Dialog */}
        <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bus className="h-5 w-5 text-red-400" />
                Assign Backup Bus
              </DialogTitle>
              <DialogDescription>
                {selectedFullShuttle && (
                  <>
                    Assign a backup bus for <strong>{selectedFullShuttle.vehicle_number}</strong> on route{" "}
                    <strong>{selectedFullShuttle.route_name}</strong>.
                    Current stop: {selectedFullShuttle.current_stop_name}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Backup Driver</label>
                <Select value={backupDriverId || ""} onValueChange={setBackupDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(driver => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.profile?.full_name || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Backup Vehicle</label>
                <Select value={backupVehicleId || ""} onValueChange={setBackupVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(vehicle => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.display_name} ({vehicle.plate_no}) - {vehicle.capacity} seats
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBackupDialog(false)}>Cancel</Button>
              <Button
                onClick={assignBackupBus}
                disabled={assigningBackup || !backupDriverId || !backupVehicleId}
                className="bg-green-600 hover:bg-green-700"
              >
                {assigningBackup ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Assign Backup
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
