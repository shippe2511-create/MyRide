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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Clock, Calendar, Users, Car, ChevronLeft, ChevronRight, Wand2, Trash2 } from "lucide-react"
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
  name: string
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

  const [generateForm, setGenerateForm] = useState({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
  })

  useEffect(() => {
    loadMasterData()
  }, [transportType])

  useEffect(() => {
    loadRoster()
  }, [selectedDate, transportType])

  const loadMasterData = async () => {
    const [driversRes, vehiclesRes, schedulesRes] = await Promise.all([
      supabase.from("drivers").select("id, profile_id, profile:profiles(full_name)").eq("status", "approved"),
      supabase.from("vehicles").select("id, plate_no, name, capacity").eq("is_active", true),
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

    const { data } = await supabase
      .from("roster_assignments")
      .select(`
        *,
        route:transport_routes(id, route_name, route_code, transport_type, direction),
        driver:drivers(id, profile_id, profile:profiles(full_name)),
        vehicle:vehicles(id, plate_no, name, capacity)
      `)
      .eq("service_date", dateStr)
      .order("departure_time")

    if (data) {
      // Filter by transport type
      const filtered = (data as RosterAssignment[]).filter(
        r => r.route?.transport_type === transportType
      )
      setRoster(filtered)
    }
    setLoading(false)
  }

  const navigateDate = (direction: "prev" | "next") => {
    setSelectedDate(direction === "prev" ? subDays(selectedDate, 1) : addDays(selectedDate, 1))
  }

  const updateAssignment = async (id: string, field: "driver_id" | "vehicle_id", value: string | null) => {
    setSaving(id)
    const { error } = await supabase
      .from("roster_assignments")
      .update({ [field]: value || null })
      .eq("id", id)

    if (error) {
      toast.error("Failed to update assignment")
    } else {
      setRoster(roster.map(r => r.id === id ? { ...r, [field]: value } : r))
      loadRoster()
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
    let created = 0
    let skipped = 0

    // Map day names to day numbers (Mon=1, Sun=7)
    const dayNameToNum: Record<string, number> = {
      "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7
    }

    for (let date = start; date <= end; date = addDays(date, 1)) {
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay()
      const dateStr = format(date, "yyyy-MM-dd")

      for (const schedule of schedules) {
        // Check if schedule runs on this day
        const scheduleDays = schedule.days_of_week?.map(d => dayNameToNum[d] || 0) || []
        if (!scheduleDays.includes(dayOfWeek)) continue

        // Check if assignment already exists
        const { data: existing } = await supabase
          .from("roster_assignments")
          .select("id")
          .eq("route_schedule_id", schedule.id)
          .eq("service_date", dateStr)
          .single()

        if (existing) {
          skipped++
          continue
        }

        const { error } = await supabase.from("roster_assignments").insert({
          route_schedule_id: schedule.id,
          route_id: schedule.route_id,
          departure_time: schedule.departure_time,
          service_date: dateStr,
          status: "scheduled",
        })

        if (!error) created++
      }
    }

    setGenerating(false)
    setShowGenerateDialog(false)
    toast.success(`Generated ${created} roster entries${skipped > 0 ? `, ${skipped} skipped (already exist)` : ""}`)
    loadRoster()
  }

  const deleteAssignment = async (id: string) => {
    if (!confirm("Delete this roster assignment?")) return
    const { error } = await supabase.from("roster_assignments").delete().eq("id", id)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Deleted")
      loadRoster()
    }
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const h = parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${minutes} ${ampm}`
  }

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="outline" className={`${STATUS_COLORS[status] || "bg-gray-500"} text-white border-0 capitalize`}>
        {status.replace("_", " ")}
      </Badge>
    )
  }

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
              Transport Roster
            </h1>
            <p className="text-muted-foreground">Assign drivers and vehicles to scheduled departures</p>
          </div>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <Wand2 className="h-4 w-4 mr-2" />
            Generate Roster
          </Button>
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

        {/* Date Navigation */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigateDate("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <Input
                  type="date"
                  value={format(selectedDate, "yyyy-MM-dd")}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="w-40"
                />
                <span className="text-lg font-medium">
                  {format(selectedDate, "EEEE, MMM d, yyyy")}
                </span>
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateDate("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
                Today
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Roster Table */}
        <Card>
          <CardHeader>
            <CardTitle>Roster for {format(selectedDate, "MMMM d, yyyy")}</CardTitle>
            <CardDescription>
              {roster.length} departures scheduled
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
                    <TableHead>Time</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((assignment) => (
                    <TableRow key={assignment.id}>
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
                        <Select
                          value={assignment.driver_id || "unassigned"}
                          onValueChange={(v) => updateAssignment(assignment.id, "driver_id", v === "unassigned" ? null : v)}
                          disabled={saving === assignment.id || assignment.status !== "scheduled"}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Assign driver" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {drivers.map(d => (
                              <SelectItem key={d.id} value={d.id}>
                                {(d.profile as { full_name: string })?.full_name || "Unknown"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={assignment.vehicle_id || "unassigned"}
                          onValueChange={(v) => updateAssignment(assignment.id, "vehicle_id", v === "unassigned" ? null : v)}
                          disabled={saving === assignment.id || assignment.status !== "scheduled"}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Assign vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {vehicles.map(v => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} ({v.plate_no})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                      <TableCell>
                        {assignment.status === "scheduled" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAssignment(assignment.id)}
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
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={generateForm.endDate}
                    onChange={(e) => setGenerateForm({ ...generateForm, endDate: e.target.value })}
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
