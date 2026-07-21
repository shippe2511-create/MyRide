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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus, Loader2, Clock, Calendar, Trash2, Pencil, Users, Wand2, Check, MoreHorizontal
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
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
  const [autoScheduleDrivers, setAutoScheduleDrivers] = useState<string[]>([])
  const [autoSchedulePeriod, setAutoSchedulePeriod] = useState<"week" | "month">("week")
  const [autoScheduleStartTime, setAutoScheduleStartTime] = useState("08:00")
  const [autoScheduleEndTime, setAutoScheduleEndTime] = useState("16:00")

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDriver, setSelectedDriver] = useState<string>("all")
  const [selectedShifts, setSelectedShifts] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  const [formData, setFormData] = useState({
    driver_ids: [] as string[],
    shift_dates: [] as string[],
    start_time: "08:00",
    end_time: "16:00",
    shift_type: "full_day",
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
    loadData(true)

    // Realtime subscription for shifts updates
    const channel = supabase
      .channel('shifts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadData(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [weekOffset])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)

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
    if (showLoading) setLoading(false)
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

    if (editingShift) {
      if (formData.driver_ids.length === 0 || datesToCreate.length === 0) {
        toast.error("Please select a driver and at least one date")
        return
      }

      setSaving(true)
      const { error } = await supabase
        .from("shifts")
        .update({
          driver_id: formData.driver_ids[0],
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
      if (formData.driver_ids.length === 0 || datesToCreate.length === 0) {
        toast.error("Please select at least one driver and one date")
        return
      }

      setSaving(true)
      const shiftsToInsert: { driver_id: string; shift_date: string; start_time: string; end_time: string; shift_type: string; status: string }[] = []

      for (const driverId of formData.driver_ids) {
        for (const date of datesToCreate) {
          shiftsToInsert.push({
            driver_id: driverId,
            shift_date: date,
            start_time: formData.start_time,
            end_time: formData.end_time,
            shift_type: formData.shift_type,
            status: formData.status,
          })
        }
      }

      const { error } = await supabase.from("shifts").insert(shiftsToInsert)

      if (error) {
        toast.error("Failed to create shifts")
      } else {
        toast.success(`${shiftsToInsert.length} shift(s) created for ${formData.driver_ids.length} driver(s)`)
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

  const handleBulkDelete = async () => {
    if (selectedShifts.length === 0) return

    setBulkDeleting(true)
    const { error } = await supabase.from("shifts").delete().in("id", selectedShifts)

    if (error) {
      toast.error("Failed to delete shifts: " + error.message)
    } else {
      setShifts(prev => prev.filter(s => !selectedShifts.includes(s.id)))
      toast.success(`${selectedShifts.length} shift(s) deleted`)
      setSelectedShifts([])
    }
    setBulkDeleting(false)
  }

  const handleClearAllShifts = async () => {
    setClearingAll(true)
    const { error } = await supabase.from("shifts").delete().neq("id", "00000000-0000-0000-0000-000000000000")

    if (error) {
      toast.error("Failed to clear shifts: " + error.message)
    } else {
      toast.success("All shifts cleared")
      setShifts([])
      setSelectedShifts([])
    }
    setClearingAll(false)
    setClearAllOpen(false)
  }

  const openEditDialog = (shift: Shift) => {
    setEditingShift(shift)
    setDateRangeMode("select")
    setFormData({
      driver_ids: [shift.driver_id],
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
      driver_ids: [],
      shift_dates: [],
      start_time: "08:00",
      end_time: "16:00",
      shift_type: "full_day",
      status: "scheduled",
    })
  }

  const toggleDriverSelection = (driverId: string) => {
    setFormData(prev => ({
      ...prev,
      driver_ids: prev.driver_ids.includes(driverId)
        ? prev.driver_ids.filter(id => id !== driverId)
        : [...prev.driver_ids, driverId]
    }))
  }

  const selectAllDrivers = () => {
    setFormData(prev => ({
      ...prev,
      driver_ids: drivers.map(d => d.id)
    }))
  }

  const clearDriverSelection = () => {
    setFormData(prev => ({
      ...prev,
      driver_ids: []
    }))
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
      timeZone: "Indian/Maldives",
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
    const selectedDriversList = autoScheduleDrivers.length > 0
      ? drivers.filter(d => autoScheduleDrivers.includes(d.id))
      : drivers

    if (selectedDriversList.length === 0) {
      toast.error("No drivers selected")
      return
    }

    setAutoScheduling(true)

    const shiftsToCreate: { driver_id: string; shift_date: string; start_time: string; end_time: string; shift_type: string; status: string }[] = []
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() + 1)

    // Calculate number of days based on period
    const daysToSchedule = autoSchedulePeriod === "month" ? 31 : 7

    for (let day = 0; day < daysToSchedule; day++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + day)
      const dateStr = date.toISOString().split("T")[0]
      const dayOfWeek = date.getDay()

      // Maldives work week: Sunday (0) to Thursday (4)
      // Skip Friday (5) and Saturday (6)
      if (dayOfWeek === 5 || dayOfWeek === 6) continue

      // Selected drivers get shift with selected times
      for (const driver of selectedDriversList) {
        shiftsToCreate.push({
          driver_id: driver.id,
          shift_date: dateStr,
          start_time: autoScheduleStartTime + ":00",
          end_time: autoScheduleEndTime + ":00",
          shift_type: "full_day",
          status: "scheduled",
        })
      }
    }

    if (shiftsToCreate.length === 0) {
      toast.info("No shifts to create")
      setAutoScheduling(false)
      setAutoScheduleOpen(false)
      return
    }

    const { error } = await supabase.from("shifts").insert(shiftsToCreate)

    if (error) {
      toast.error("Failed to create shifts: " + error.message)
    } else {
      const periodText = autoSchedulePeriod === "month" ? "month" : "week"
      toast.success(`Created ${shiftsToCreate.length} shifts for ${selectedDriversList.length} driver(s) for the next ${periodText}`)
      loadData()
    }

    setAutoScheduling(false)
    setAutoScheduleOpen(false)
    setAutoScheduleDrivers([])
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
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-xs text-muted-foreground truncate">Total Shifts</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{stats.scheduled}</p>
              <p className="text-xs text-muted-foreground truncate">Scheduled</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Clock className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.completed}</p>
              <p className="text-xs text-muted-foreground truncate">Completed</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-purple-500">{stats.driversScheduled}</p>
              <p className="text-xs text-muted-foreground truncate">Drivers</p>
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
            {selectedShifts.length > 0 && (
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete {selectedShifts.length}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-red-500 border-red-500/50 hover:bg-red-500/10" onClick={() => setClearAllOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
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
              <TableHead className="w-10">
                <Checkbox
                  checked={filteredShifts.length > 0 && selectedShifts.length === filteredShifts.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedShifts(filteredShifts.map(s => s.id))
                    } else {
                      setSelectedShifts([])
                    }
                  }}
                />
              </TableHead>
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
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No shifts scheduled for this week
                </TableCell>
              </TableRow>
            ) : (
              filteredShifts.map(shift => {
                const profile = getDriverProfile(shift.driver)
                const isSelected = selectedShifts.includes(shift.id)
                return (
                  <TableRow key={shift.id} className={isSelected ? "bg-accent/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedShifts(prev => [...prev, shift.id])
                          } else {
                            setSelectedShifts(prev => prev.filter(id => id !== shift.id))
                          }
                        }}
                      />
                    </TableCell>
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
                        timeZone: "Indian/Maldives",
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(shift)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteId(shift.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {editingShift ? "Driver" : "Drivers"}
                  {!editingShift && formData.driver_ids.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formData.driver_ids.length} selected)
                    </span>
                  )}
                </label>
                {!editingShift && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={selectAllDrivers}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={clearDriverSelection}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              {editingShift ? (
                <Select value={formData.driver_ids[0] || ""} onValueChange={(v) => setFormData({ ...formData, driver_ids: [v] })}>
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
              ) : (
                <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                  {drivers.map(driver => {
                    const profile = getDriverProfile(driver)
                    const isSelected = formData.driver_ids.includes(driver.id)
                    return (
                      <div
                        key={driver.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                        onClick={() => toggleDriverSelection(driver.id)}
                      >
                        <Checkbox checked={isSelected} />
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "D"}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{profile?.full_name || "Unknown"}</span>
                      </div>
                    )
                  })}
                </div>
              )}
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
                <div className="border rounded-lg p-2">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 sticky top-0 bg-background pb-2">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                      <span key={d} className="text-muted-foreground font-medium">{d}</span>
                    ))}
                  </div>
                  <div className="max-h-40 overflow-y-auto">
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
                  </div>
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

      <AlertDialog open={autoScheduleOpen} onOpenChange={(open) => {
        setAutoScheduleOpen(open)
        if (!open) {
          setAutoScheduleDrivers([])
          setAutoSchedulePeriod("week")
          setAutoScheduleStartTime("08:00")
          setAutoScheduleEndTime("16:00")
        }
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-Schedule Shifts</AlertDialogTitle>
            <AlertDialogDescription>
              Generate 8:00 AM - 4:00 PM shifts for work days (Sun-Thu).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={autoSchedulePeriod === "week" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoSchedulePeriod("week")}
                >
                  Next 7 Days
                </Button>
                <Button
                  type="button"
                  variant={autoSchedulePeriod === "month" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoSchedulePeriod("month")}
                >
                  Full Month
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Drivers
                  {autoScheduleDrivers.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({autoScheduleDrivers.length} selected)
                    </span>
                  )}
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setAutoScheduleDrivers(drivers.map(d => d.id))}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setAutoScheduleDrivers([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                {drivers.map(driver => {
                  const profile = getDriverProfile(driver)
                  const isSelected = autoScheduleDrivers.includes(driver.id)
                  return (
                    <div
                      key={driver.id}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setAutoScheduleDrivers(prev => prev.filter(id => id !== driver.id))
                        } else {
                          setAutoScheduleDrivers(prev => [...prev, driver.id])
                        }
                      }}
                    >
                      <Checkbox checked={isSelected} />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "D"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{profile?.full_name || "Unknown"}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift Time</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Start</label>
                  <Input
                    type="time"
                    value={autoScheduleStartTime}
                    onChange={(e) => setAutoScheduleStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End</label>
                  <Input
                    type="time"
                    value={autoScheduleEndTime}
                    onChange={(e) => setAutoScheduleEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>{autoScheduleDrivers.length || drivers.length}</strong> driver(s) will be scheduled across{" "}
              <strong>{autoSchedulePeriod === "month" ? "~22" : "5"}</strong> work days.
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

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Shifts</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL shifts from the database.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-sm text-red-500 font-medium">
              {shifts.length} shift(s) will be deleted.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllShifts} disabled={clearingAll} className="bg-red-600 hover:bg-red-700">
              {clearingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Clear All Shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
