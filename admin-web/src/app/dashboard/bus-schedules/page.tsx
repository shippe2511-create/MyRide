"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Edit, Trash2, Loader2, Clock, Calendar } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"
import { TimePicker } from "@/components/ui/time-picker"

interface BusRoute {
  id: string
  name: string
  origin_label: string
  destination_label: string
}

interface ScheduleTemplate {
  id: string
  route_id: string
  departure_time: string
  shift: string
  days_of_week: number[]
  is_active: boolean
  created_at: string
  route?: BusRoute
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
]

const SHIFTS = [
  { value: "morning", label: "Morning", color: "bg-yellow-500" },
  { value: "evening", label: "Evening", color: "bg-orange-500" },
  { value: "night", label: "Night", color: "bg-blue-500" },
]

export default function BusSchedulesPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ScheduleTemplate | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    route_id: "",
    departure_time: "08:00",
    shift: "morning",
    days_of_week: [1, 2, 3, 4, 5] as number[],
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: routesData } = await supabase
      .from("bus_routes")
      .select("id, name, origin_label, destination_label")
      .eq("is_active", true)
      .order("name")

    if (routesData) setRoutes(routesData)

    const { data: schedulesData } = await supabase
      .from("schedule_templates")
      .select(`
        *,
        route:bus_routes(id, name, origin_label, destination_label)
      `)
      .order("departure_time")

    if (schedulesData) setSchedules(schedulesData)
    setLoading(false)
  }

  const openDialog = (schedule?: ScheduleTemplate) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setForm({
        route_id: schedule.route_id,
        departure_time: schedule.departure_time.slice(0, 5),
        shift: schedule.shift,
        days_of_week: schedule.days_of_week,
      })
    } else {
      setEditingSchedule(null)
      setForm({
        route_id: routes[0]?.id || "",
        departure_time: "08:00",
        shift: "morning",
        days_of_week: [1, 2, 3, 4, 5],
      })
    }
    setShowDialog(true)
  }

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter(d => d !== day)
        : [...f.days_of_week, day].sort()
    }))
  }

  const saveSchedule = async () => {
    if (!form.route_id) {
      toast.error("Please select a route")
      return
    }
    if (form.days_of_week.length === 0) {
      toast.error("Please select at least one day")
      return
    }

    setSaving(true)
    const payload = {
      route_id: form.route_id,
      departure_time: form.departure_time,
      shift: form.shift,
      days_of_week: form.days_of_week,
    }

    if (editingSchedule) {
      const { error } = await supabase
        .from("schedule_templates")
        .update(payload)
        .eq("id", editingSchedule.id)
      if (error) {
        toast.error("Failed to update schedule")
      } else {
        toast.success("Schedule updated")
        setShowDialog(false)
        loadData()
      }
    } else {
      const { error } = await supabase
        .from("schedule_templates")
        .insert(payload)
      if (error) {
        toast.error("Failed to create schedule")
      } else {
        toast.success("Schedule created")
        setShowDialog(false)
        loadData()
      }
    }
    setSaving(false)
  }

  const toggleActive = async (schedule: ScheduleTemplate) => {
    const { error } = await supabase
      .from("schedule_templates")
      .update({ is_active: !schedule.is_active })
      .eq("id", schedule.id)
    if (!error) {
      setSchedules(schedules.map(s =>
        s.id === schedule.id ? { ...s, is_active: !s.is_active } : s
      ))
    }
  }

  const deleteSchedule = async (schedule: ScheduleTemplate) => {
    if (!confirm("Delete this schedule template?")) return
    const { error } = await supabase.from("schedule_templates").delete().eq("id", schedule.id)
    if (error) {
      toast.error("Failed to delete schedule")
    } else {
      toast.success("Schedule deleted")
      loadData()
    }
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const h = parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${minutes} ${ampm}`
  }

  const formatDays = (days: number[]) => {
    if (days.length === 7) return "Every day"
    if (JSON.stringify(days) === JSON.stringify([1, 2, 3, 4, 5])) return "Weekdays"
    if (JSON.stringify(days) === JSON.stringify([6, 7])) return "Weekends"
    return days.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(", ")
  }

  const getShiftBadge = (shift: string) => {
    const s = SHIFTS.find(s => s.value === shift)
    return (
      <Badge variant="outline" className={`${s?.color} text-white border-0`}>
        {s?.label}
      </Badge>
    )
  }

  return (
    <PermissionGate permission="settings:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Bus Schedules
            </h1>
            <p className="text-muted-foreground">Configure recurring departure timetables</p>
          </div>
          <Button onClick={() => openDialog()} disabled={routes.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Add Schedule
          </Button>
        </div>

        {routes.length === 0 && !loading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No routes configured. Please create routes first in Bus Routes.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Schedule Templates</CardTitle>
            <CardDescription>Recurring departure times for each route</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No schedules configured yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{schedule.route?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {schedule.route?.origin_label} → {schedule.route?.destination_label}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatTime(schedule.departure_time)}
                        </div>
                      </TableCell>
                      <TableCell>{getShiftBadge(schedule.shift)}</TableCell>
                      <TableCell>{formatDays(schedule.days_of_week)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={schedule.is_active}
                          onCheckedChange={() => toggleActive(schedule)}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDialog(schedule)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteSchedule(schedule)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
              <DialogDescription>Configure a recurring departure time</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Route</label>
                <Select value={form.route_id} onValueChange={v => setForm({ ...form, route_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {routes.map(route => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Departure Time</label>
                <TimePicker
                  value={form.departure_time}
                  onChange={v => setForm({ ...form, departure_time: v })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Shift</label>
                <Select value={form.shift} onValueChange={v => setForm({ ...form, shift: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map(shift => (
                      <SelectItem key={shift.value} value={shift.value}>
                        {shift.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Days of Week</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <label
                      key={day.value}
                      className={`flex items-center justify-center w-12 h-10 rounded-md border cursor-pointer transition-colors ${
                        form.days_of_week.includes(day.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <Checkbox
                        checked={form.days_of_week.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{day.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, days_of_week: [1, 2, 3, 4, 5] })}
                  >
                    Weekdays
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, days_of_week: [6, 7] })}
                  >
                    Weekends
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, days_of_week: [1, 2, 3, 4, 5, 6, 7] })}
                  >
                    Every Day
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={saveSchedule} disabled={saving}>
                {saving ? "Saving..." : editingSchedule ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
