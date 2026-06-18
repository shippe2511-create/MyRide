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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus, Loader2, Clock, Calendar, Trash2, Pencil, Users, Wand2
} from "lucide-react"
import { toast } from "sonner"

interface DriverProfile {
  full_name: string
  avatar_url: string | null
  phone: string | null
}

interface Driver {
  id: string
  profile_id: string
  profile?: DriverProfile | DriverProfile[]
}

interface Shift {
  id: string
  driver_id: string
  shift_date: string
  start_time: string
  end_time: string
  shift_type: string
  status: string
  driver?: Driver
}

const SHIFT_TYPES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "full_day", label: "Full Day" },
]

export function ShiftsTable() {
  const supabase = createClient()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false)
  const [autoScheduling, setAutoScheduling] = useState(false)

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDriver, setSelectedDriver] = useState<string>("all")

  const [formData, setFormData] = useState({
    driver_id: "",
    shift_dates: [] as string[],
    start_time: "06:00",
    end_time: "14:00",
    shift_type: "morning",
    status: "scheduled",
  })
  const [dateRangeMode, setDateRangeMode] = useState<"single" | "range" | "select">("select")
  const [rangeStart, setRangeStart] = useState("")
  const [rangeEnd, setRangeEnd] = useState("")

  const getWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1) + weekOffset * 7)

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      return date
    })
  }

  const weekDates = getWeekDates()
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  useEffect(() => {
    loadData()
  }, [weekOffset])

  const loadData = async () => {
    setLoading(true)

    const startStr = weekStart.toISOString().split("T")[0]
    const endStr = weekEnd.toISOString().split("T")[0]

    const [shiftsRes, driversRes] = await Promise.all([
      supabase
        .from("shifts")
        .select(`
          *,
          driver:drivers(
            id,
            profile_id,
            profile:profiles(full_name, avatar_url, phone)
          )
        `)
        .gte("shift_date", startStr)
        .lte("shift_date", endStr)
        .order("shift_date")
        .order("start_time"),
      supabase
        .from("drivers")
        .select("id, profile_id, profile:profiles(full_name, avatar_url, phone)")
    ])

    setShifts(shiftsRes.data || [])
    setDrivers(driversRes.data || [])
    setLoading(false)
  }

  const generateDatesFromRange = () => {
    if (!rangeStart || !rangeEnd) return []
    const dates: string[] = []
    const start = new Date(rangeStart)
    const end = new Date(rangeEnd)
    const current = new Date(start)
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0])
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  const handleSave = async () => {
    const datesToCreate = dateRangeMode === "range" ? generateDatesFromRange() : formData.shift_dates

    if (!formData.driver_id || datesToCreate.length === 0) {
      toast.error("Please select a driver and at least one date")
      return
    }

    setSaving(true)

    if (editingShift) {
      const { error } = await supabase
        .from("shifts")
        .update({
          driver_id: formData.driver_id,
          shift_date: datesToCreate[0],
          start_time: formData.start_time,
          end_time: formData.end_time,
          shift_type: formData.shift_type,
          status: formData.status,
        })
        .eq("id", editingShift.id)

      if (error) {
        toast.error("Failed to update shift")
      } else {
        toast.success("Shift updated")
        closeDialog()
        loadData()
      }
    } else {
      const shiftsToInsert = datesToCreate.map(date => ({
        driver_id: formData.driver_id,
        shift_date: date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        shift_type: formData.shift_type,
        status: formData.status,
      }))

      const { error } = await supabase.from("shifts").insert(shiftsToInsert)

      if (error) {
        toast.error("Failed to create shifts")
      } else {
        toast.success(`${shiftsToInsert.length} shift(s) created`)
        closeDialog()
        loadData()
      }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)

    const { error } = await supabase.from("shifts").delete().eq("id", idToDelete)

    if (error) {
      toast.error("Failed to delete shift")
    } else {
      setShifts(prev => prev.filter(s => s.id !== idToDelete))
      toast.success("Shift deleted")
    }
  }

  const openEditDialog = (shift: Shift) => {
    setEditingShift(shift)
    setDateRangeMode("select")
    setFormData({
      driver_id: shift.driver_id,
      shift_dates: [shift.shift_date],
      start_time: shift.start_time.substring(0, 5),
      end_time: shift.end_time.substring(0, 5),
      shift_type: shift.shift_type || "morning",
      status: shift.status || "scheduled",
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingShift(null)
    setDateRangeMode("select")
    setRangeStart("")
    setRangeEnd("")
    setFormData({
      driver_id: "",
      shift_dates: [],
      start_time: "06:00",
      end_time: "14:00",
      shift_type: "morning",
      status: "scheduled",
    })
  }

  const toggleDate = (dateStr: string) => {
    setFormData(prev => ({
      ...prev,
      shift_dates: prev.shift_dates.includes(dateStr)
        ? prev.shift_dates.filter(d => d !== dateStr)
        : [...prev.shift_dates, dateStr].sort()
    }))
  }

  const getMonthDates = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 2, 0)

    const dates: Date[] = []
    const current = new Date(firstDay)
    while (current <= lastDay) {
      dates.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }

  const formatDateInput = (date: Date) => {
    return date.toISOString().split("T")[0]
  }

  const getDriverProfile = (driver: Driver | undefined) => {
    if (!driver?.profile) return null
    return Array.isArray(driver.profile) ? driver.profile[0] : driver.profile
  }

  const filteredShifts = selectedDriver === "all"
    ? shifts
    : shifts.filter(s => s.driver_id === selectedDriver)

  const handleAutoSchedule = async () => {
    if (drivers.length === 0) {
      toast.error("No drivers available")
      return
    }

    setAutoScheduling(true)

    const shiftsToCreate: { driver_id: string; shift_date: string; start_time: string; end_time: string; shift_type: string; status: string }[] = []
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() + 1)

    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + day)
      const dateStr = date.toISOString().split("T")[0]
      const dayOfWeek = date.getDay()

      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      const shuffledDrivers = [...drivers].sort(() => Math.random() - 0.5)
      const morningDrivers = shuffledDrivers.slice(0, Math.ceil(shuffledDrivers.length / 2))
      const afternoonDrivers = shuffledDrivers.slice(Math.ceil(shuffledDrivers.length / 2))

      for (const driver of morningDrivers) {
        const existingShift = shifts.find(s => s.driver_id === driver.id && s.shift_date === dateStr)
        if (!existingShift) {
          shiftsToCreate.push({
            driver_id: driver.id,
            shift_date: dateStr,
            start_time: "06:00:00",
            end_time: "14:00:00",
            shift_type: "morning",
            status: "scheduled",
          })
        }
      }

      for (const driver of afternoonDrivers) {
        const existingShift = shifts.find(s => s.driver_id === driver.id && s.shift_date === dateStr)
        if (!existingShift) {
          shiftsToCreate.push({
            driver_id: driver.id,
            shift_date: dateStr,
            start_time: "14:00:00",
            end_time: "22:00:00",
            shift_type: "afternoon",
            status: "scheduled",
          })
        }
      }
    }

    if (shiftsToCreate.length === 0) {
      toast.info("All shifts already scheduled for next week")
      setAutoScheduling(false)
      setAutoScheduleOpen(false)
      return
    }

    const { error } = await supabase.from("shifts").insert(shiftsToCreate)

    if (error) {
      toast.error("Failed to create shifts: " + error.message)
    } else {
      toast.success(`Created ${shiftsToCreate.length} shifts for next week`)
      loadData()
    }

    setAutoScheduling(false)
    setAutoScheduleOpen(false)
  }

  const stats = {
    total: shifts.length,
    scheduled: shifts.filter(s => s.status === "scheduled").length,
    completed: shifts.filter(s => s.status === "completed").length,
    driversScheduled: new Set(shifts.map(s => s.driver_id)).size,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Shifts</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-500">{stats.scheduled}</p>
              <p className="text-xs text-muted-foreground">Scheduled</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Clock className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-500">{stats.driversScheduled}</p>
              <p className="text-xs text-muted-foreground">Drivers</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
              Previous
            </Button>
            <span className="text-sm font-medium px-2">
              {formatDate(weekStart)} - {formatDate(weekEnd)}
            </span>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
              Next
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                Today
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map(driver => {
                  const profile = getDriverProfile(driver)
                  return (
                    <SelectItem key={driver.id} value={driver.id}>
                      {profile?.full_name || "Unknown"}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setAutoScheduleOpen(true)}>
              <Wand2 className="h-4 w-4 mr-2" />
              Auto Schedule
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Shift
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShifts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No shifts scheduled for this week
                </TableCell>
              </TableRow>
            ) : (
              filteredShifts.map(shift => {
                const profile = getDriverProfile(shift.driver)
                return (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback>{profile?.full_name?.[0] || "D"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{profile?.full_name || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(shift.shift_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SHIFT_TYPES.find(t => t.value === shift.shift_type)?.label || shift.shift_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={shift.status === "completed" ? "success" : shift.status === "cancelled" ? "destructive" : "secondary"}>
                        {shift.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(shift)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(shift.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Select value={formData.driver_id} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map(driver => {
                    const profile = getDriverProfile(driver)
                    return (
                      <SelectItem key={driver.id} value={driver.id}>
                        {profile?.full_name || "Unknown"}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Dates</label>
                {!editingShift && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant={dateRangeMode === "select" ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDateRangeMode("select")}
                    >
                      Select
                    </Button>
                    <Button
                      type="button"
                      variant={dateRangeMode === "range" ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDateRangeMode("range")}
                    >
                      Range
                    </Button>
                  </div>
                )}
              </div>

              {dateRangeMode === "range" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </div>
                  {rangeStart && rangeEnd && (
                    <p className="col-span-2 text-xs text-muted-foreground">
                      {generateDatesFromRange().length} days selected
                    </p>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-2 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                      <span key={d} className="text-muted-foreground font-medium">{d}</span>
                    ))}
                  </div>
                  {(() => {
                    const monthDates = getMonthDates()
                    const firstDayOfWeek = monthDates[0].getDay()
                    const paddedDates = Array(firstDayOfWeek).fill(null).concat(monthDates)

                    return (
                      <div className="grid grid-cols-7 gap-1">
                        {paddedDates.map((date, i) => {
                          if (!date) return <div key={`pad-${i}`} />
                          const dateStr = date.toISOString().split("T")[0]
                          const isSelected = formData.shift_dates.includes(dateStr)
                          const isToday = dateStr === new Date().toISOString().split("T")[0]

                          return (
                            <button
                              key={dateStr}
                              type="button"
                              onClick={() => toggleDate(dateStr)}
                              className={`
                                h-8 w-full rounded text-xs font-medium transition-colors
                                ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}
                                ${isToday && !isSelected ? "border border-primary" : ""}
                              `}
                            >
                              {date.getDate()}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {formData.shift_dates.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                      {formData.shift_dates.length} date(s) selected
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Time</label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Time</label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift Type</label>
              <Select value={formData.shift_type} onValueChange={(v) => setFormData({ ...formData, shift_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingShift ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this shift? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={autoScheduleOpen} onOpenChange={setAutoScheduleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-Schedule Shifts</AlertDialogTitle>
            <AlertDialogDescription>
              This will automatically generate shifts for the next 7 weekdays.
              Drivers will be randomly assigned to morning (6am-2pm) or afternoon (2pm-10pm) shifts.
              Existing shifts will not be overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              <strong>{drivers.length}</strong> drivers will be scheduled across <strong>5</strong> weekdays.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoScheduling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAutoSchedule} disabled={autoScheduling}>
              {autoScheduling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generate Shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
