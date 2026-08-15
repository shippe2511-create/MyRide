"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/hooks/usePermissions"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  Plus, Loader2, Clock, Calendar, Trash2, Pencil, Users, Wand2, MoreHorizontal, Search, CalendarDays, Download, Upload, FileSpreadsheet
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
  attendance_status?: string // 'pending' | 'present' | 'absent'
  absence_reason?: string
  marked_at?: string
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
  const { departmentId: userDepartmentId } = usePermissions()
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
  const [autoScheduleShiftType, setAutoScheduleShiftType] = useState("morning")

  const [weekOffset, setWeekOffset] = useState(0)
  const [customStartDate, setCustomStartDate] = useState<string>("")
  const [customEndDate, setCustomEndDate] = useState<string>("")
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [selectedDriver, setSelectedDriver] = useState<string>("all")
  const [selectedDepartment, setSelectedDepartment] = useState<string>("")
  const [departmentInitialized, setDepartmentInitialized] = useState(false)
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([])
  const [selectedShifts, setSelectedShifts] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  // Import/Export states
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{
    driver_name: string
    driver_id: string | null
    shift_date: string
    start_time: string
    end_time: string
    shift_type: string
  }>>([])
  const [importError, setImportError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    driver_ids: [] as string[],
    shift_dates: [] as string[],
    start_time: "08:00",
    end_time: "16:00",
    shift_type: "full_day",
    status: "scheduled",
    attendance_status: "pending" as string,
  })
  const [dateRangeMode, setDateRangeMode] = useState<"single" | "range" | "select">("select")
  const [rangeStart, setRangeStart] = useState("")
  const [rangeEnd, setRangeEnd] = useState("")
  const [dialogCalendarMonth, setDialogCalendarMonth] = useState(new Date().getMonth())
  const [dialogCalendarYear, setDialogCalendarYear] = useState(new Date().getFullYear())

  const getWeekDates = () => {
    // If custom date range is set, use that
    if (customStartDate && customEndDate) {
      const start = new Date(customStartDate)
      const end = new Date(customEndDate)
      const days: Date[] = []
      const current = new Date(start)
      while (current <= end) {
        days.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
      return days.length > 0 ? days : [new Date()]
    }

    // Default week view
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
  const weekEnd = weekDates[weekDates.length - 1]
  const isCustomRange = !!(customStartDate && customEndDate)

  // Use ref to track current week for realtime updates
  const weekOffsetRef = useRef(weekOffset)
  const customStartDateRef = useRef(customStartDate)
  const customEndDateRef = useRef(customEndDate)
  const selectedDepartmentRef = useRef(selectedDepartment)
  const supabaseRef = useRef(supabase)

  // Keep refs in sync
  useEffect(() => {
    weekOffsetRef.current = weekOffset
  }, [weekOffset])

  useEffect(() => {
    customStartDateRef.current = customStartDate
    customEndDateRef.current = customEndDate
  }, [customStartDate, customEndDate])

  useEffect(() => {
    selectedDepartmentRef.current = selectedDepartment
  }, [selectedDepartment])

  // Load departments
  useEffect(() => {
    const loadDepartments = async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .order("name")
      if (data) {
        setDepartments(data)
      }
    }
    loadDepartments()
  }, [])

  // Set default department to user's department
  useEffect(() => {
    if (departments.length > 0 && !departmentInitialized) {
      if (userDepartmentId) {
        setSelectedDepartment(userDepartmentId)
      } else {
        // Fallback to first department (usually Transport)
        setSelectedDepartment(departments[0]?.id || "all")
      }
      setDepartmentInitialized(true)
    }
  }, [departments, userDepartmentId, departmentInitialized])

  // Stable load function using refs
  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    let startStr: string
    let endStr: string

    // Use custom date range if set
    if (customStartDateRef.current && customEndDateRef.current) {
      startStr = customStartDateRef.current
      endStr = customEndDateRef.current
    } else {
      // Calculate dates based on current weekOffset ref
      const today = new Date()
      const currentDay = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1) + weekOffsetRef.current * 7)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      startStr = formatDateInput(monday)
      endStr = formatDateInput(sunday)
    }

    // Filter by selected department
    const deptId = selectedDepartmentRef.current

    let shiftsQuery = supabaseRef.current
      .from("shifts")
      .select(`
        *,
        driver:drivers!inner(
          id,
          profile_id,
          department_id,
          profile:profiles(full_name, avatar_url, phone)
        )
      `)
      .gte("shift_date", startStr)
      .lte("shift_date", endStr)
      .order("shift_date")
      .order("start_time")

    let driversQuery = supabaseRef.current
      .from("drivers")
      .select("id, profile_id, department_id, profile:profiles(full_name, avatar_url, phone)")

    // Apply department filter if not "all"
    if (deptId !== "all") {
      shiftsQuery = shiftsQuery.eq("driver.department_id", deptId)
      driversQuery = driversQuery.eq("department_id", deptId)
    }

    const [shiftsRes, driversRes] = await Promise.all([shiftsQuery, driversQuery])

    setShifts(shiftsRes.data || [])
    setDrivers(driversRes.data || [])
    if (showLoading) setLoading(false)
  }, []) // Empty deps - uses refs for all changing values

  // Load data when week changes, custom date range changes, or department changes
  useEffect(() => {
    loadData(false)
  }, [weekOffset, customStartDate, customEndDate, selectedDepartment]) // Reload when filters change

  // Initial load with spinner - runs once
  const initialLoadDone = useRef(false)
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      loadData(true)
    }
  }, [loadData])

  // Realtime subscription - set up once and never recreate
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  useEffect(() => {
    if (channelRef.current) return // Already subscribed

    channelRef.current = supabaseRef.current
      .channel('shifts_realtime_stable')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadData(false)
      })
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [loadData])

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
      const updateData: Record<string, unknown> = {
        driver_id: formData.driver_ids[0],
        shift_date: datesToCreate[0],
        start_time: formData.start_time,
        end_time: formData.end_time,
        shift_type: formData.shift_type,
        status: formData.status,
        attendance_status: formData.attendance_status,
      }
      // Clear absence_reason if changing from absent to something else
      if (editingShift.attendance_status === "absent" && formData.attendance_status !== "absent") {
        updateData.absence_reason = null
        updateData.marked_at = null
      }
      // Set marked_at when changing attendance
      if (formData.attendance_status !== editingShift.attendance_status) {
        updateData.marked_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from("shifts")
        .update(updateData)
        .eq("id", editingShift.id)

      if (error) {
        toast.error("Failed to update shift")
      } else {
        toast.success("Shift updated")
        closeDialog()
        loadData(false)
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

      // Use upsert to update existing shifts or create new ones
      const { error } = await supabase.from("shifts").upsert(shiftsToInsert, {
        onConflict: "driver_id,shift_date",
        ignoreDuplicates: false,
      })

      if (error) {
        toast.error("Failed to create shifts: " + error.message)
      } else {
        toast.success(`${shiftsToInsert.length} shift(s) created/updated for ${formData.driver_ids.length} driver(s)`)
        closeDialog()
        loadData(false)
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
      attendance_status: shift.attendance_status || "pending",
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
      attendance_status: "pending",
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
    const firstDay = new Date(dialogCalendarYear, dialogCalendarMonth, 1)
    const lastDay = new Date(dialogCalendarYear, dialogCalendarMonth + 1, 0)

    const dates: Date[] = []
    const current = new Date(firstDay)
    while (current <= lastDay) {
      dates.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  const navigateDialogCalendar = (direction: number) => {
    let newMonth = dialogCalendarMonth + direction
    let newYear = dialogCalendarYear
    if (newMonth < 0) {
      newMonth = 11
      newYear--
    } else if (newMonth > 11) {
      newMonth = 0
      newYear++
    }
    setDialogCalendarMonth(newMonth)
    setDialogCalendarYear(newYear)
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      timeZone: "Indian/Maldives",
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }

  const formatDateNumeric = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const formatDateInput = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
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

    // Start from the current week's Monday (the displayed week)
    const startDate = new Date(weekStart)

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
          shift_type: autoScheduleShiftType,
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

    // Use upsert to update existing shifts or create new ones
    const { error } = await supabase.from("shifts").upsert(shiftsToCreate, {
      onConflict: "driver_id,shift_date",
      ignoreDuplicates: false,
    })

    if (error) {
      toast.error("Failed to create shifts: " + error.message)
    } else {
      const periodText = autoSchedulePeriod === "month" ? "month" : "week"
      toast.success(`Created/updated ${shiftsToCreate.length} shifts for ${selectedDriversList.length} driver(s) for the next ${periodText}`)
      loadData(false)
    }

    setAutoScheduling(false)
    setAutoScheduleOpen(false)
    setAutoScheduleDrivers([])
  }

  // Export shifts to CSV
  const exportCSV = () => {
    const formatPhone = (phone: string | null | undefined) => {
      if (!phone) return ""
      return phone.replace(/^\+?960/, "")
    }
    const formatShiftType = (type: string) => {
      if (!type) return ""
      return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    }
    const formatAttendance = (status: string) => {
      if (!status) return "Pending"
      return status.charAt(0).toUpperCase() + status.slice(1)
    }

    const headers = ["Driver Name", "Phone", "Date", "Start Time", "End Time", "Shift Type", "Status", "Attendance"]
    const rows = shifts.map(shift => {
      const profile = getDriverProfile(shift.driver)
      return [
        profile?.full_name || "Unknown",
        formatPhone(profile?.phone),
        shift.shift_date,
        shift.start_time?.substring(0, 5) || "",
        shift.end_time?.substring(0, 5) || "",
        formatShiftType(shift.shift_type || ""),
        formatShiftType(shift.status || ""),
        formatAttendance(shift.attendance_status || "pending")
      ]
    })

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `shifts_${formatDateInput(weekStart)}_to_${formatDateInput(weekEnd)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${shifts.length} shifts`)
  }

  // Download import template
  const downloadTemplate = () => {
    const headers = ["Driver Name", "Shift Date", "Start Time", "End Time", "Shift Type"]
    const exampleRows = [
      ["Hussain Moosa", "2026-07-28", "08:00", "16:00", "Full Day"],
      ["Mujuthaba Nizar", "2026-07-28", "08:00", "12:00", "Morning"],
      ["Mohamed Fazeem", "2026-07-29", "12:00", "18:00", "Afternoon"],
    ]

    const csv = [headers, ...exampleRows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "shifts_import_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split("\n").filter(line => line.trim())
        if (lines.length < 2) {
          setImportError("CSV must have a header row and at least one data row")
          return
        }

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/["']/g, ""))
        const driverNameIdx = headers.findIndex(h => h.includes("driver") && h.includes("name"))
        const dateIdx = headers.findIndex(h => h.includes("date"))
        const startIdx = headers.findIndex(h => h.includes("start"))
        const endIdx = headers.findIndex(h => h.includes("end"))
        const typeIdx = headers.findIndex(h => h.includes("type"))

        if (driverNameIdx === -1 || dateIdx === -1) {
          setImportError("CSV must have 'driver_name' and 'shift_date' columns")
          return
        }

        const parsed: typeof importPreview = []
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim().replace(/["']/g, ""))
          const driverName = values[driverNameIdx] || ""
          const shiftDate = values[dateIdx] || ""

          if (!driverName || !shiftDate) continue

          // Try to match driver by name
          const matchedDriver = drivers.find(d => {
            const profile = getDriverProfile(d)
            return profile?.full_name?.toLowerCase().includes(driverName.toLowerCase()) ||
              driverName.toLowerCase().includes(profile?.full_name?.toLowerCase() || "xxx")
          })

          // Convert readable shift type to snake_case
          let shiftType = typeIdx !== -1 ? (values[typeIdx] || "full_day") : "full_day"
          shiftType = shiftType.toLowerCase().replace(/\s+/g, "_")

          parsed.push({
            driver_name: driverName,
            driver_id: matchedDriver?.id || null,
            shift_date: shiftDate,
            start_time: startIdx !== -1 ? (values[startIdx] || "08:00") : "08:00",
            end_time: endIdx !== -1 ? (values[endIdx] || "16:00") : "16:00",
            shift_type: shiftType,
          })
        }

        if (parsed.length === 0) {
          setImportError("No valid rows found in CSV")
          return
        }

        const unmatchedCount = parsed.filter(p => !p.driver_id).length
        if (unmatchedCount > 0) {
          setImportError(`${unmatchedCount} row(s) have unmatched driver names - they will be skipped`)
        }

        setImportPreview(parsed)
      } catch {
        setImportError("Failed to parse CSV file")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  // Handle import
  const handleImport = async () => {
    const validRows = importPreview.filter(row => row.driver_id)
    if (validRows.length === 0) {
      toast.error("No valid rows to import")
      return
    }

    setImportLoading(true)
    const shiftsToInsert = validRows.map(row => ({
      driver_id: row.driver_id!,
      shift_date: row.shift_date,
      start_time: row.start_time.length === 5 ? row.start_time + ":00" : row.start_time,
      end_time: row.end_time.length === 5 ? row.end_time + ":00" : row.end_time,
      shift_type: row.shift_type,
      status: "scheduled",
    }))

    // Use upsert to update existing or create new
    const { error } = await supabase.from("shifts").upsert(shiftsToInsert, {
      onConflict: "driver_id,shift_date",
      ignoreDuplicates: false,
    })

    if (error) {
      toast.error("Import failed: " + error.message)
    } else {
      toast.success(`Imported ${validRows.length} shifts`)
      setImportDialogOpen(false)
      setImportPreview([])
      setImportError(null)
      loadData(false)
    }
    setImportLoading(false)
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
        {/* Header with navigation and actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-muted/50 rounded-lg p-1">
              <Button variant="ghost" size="sm" className="h-8 px-3" onClick={() => {
                if (isCustomRange) {
                  // Clear custom range and go back to week view
                  setCustomStartDate("")
                  setCustomEndDate("")
                } else {
                  setWeekOffset(w => w - 1)
                }
              }}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </Button>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="px-4 min-w-[180px] text-center hover:bg-muted/50 rounded py-1 transition-colors">
                    <span className="text-sm font-semibold flex items-center justify-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      {formatDateNumeric(weekStart)} - {formatDateNumeric(weekEnd)}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-4" align="start">
                  <div className="space-y-4">
                    {/* Year Navigation */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPickerYear(y => y - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-lg font-semibold">{pickerYear}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setPickerYear(y => y + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Month Grid */}
                    <div className="grid grid-cols-4 gap-2">
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, idx) => {
                        const currentYear = new Date().getFullYear()
                        const currentMonth = new Date().getMonth()
                        const isCurrentMonth = pickerYear === currentYear && idx === currentMonth
                        const isSelected = customStartDate && new Date(customStartDate).getMonth() === idx && new Date(customStartDate).getFullYear() === pickerYear
                        return (
                          <Button
                            key={month}
                            size="sm"
                            variant={isSelected ? "default" : isCurrentMonth ? "secondary" : "outline"}
                            className={`text-sm h-9 ${isCurrentMonth && !isSelected ? "border-primary" : ""}`}
                            onClick={() => {
                              const firstDay = new Date(pickerYear, idx, 1)
                              const lastDay = new Date(pickerYear, idx + 1, 0)
                              setCustomStartDate(formatDateInput(firstDay))
                              setCustomEndDate(formatDateInput(lastDay))
                            }}
                          >
                            {month}
                          </Button>
                        )
                      })}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          const now = new Date()
                          setPickerYear(now.getFullYear())
                          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
                          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                          setCustomStartDate(formatDateInput(firstDay))
                          setCustomEndDate(formatDateInput(lastDay))
                        }}
                      >
                        This Month
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          const today = new Date()
                          const next3Months = new Date(today.getFullYear(), today.getMonth() + 3, 0)
                          setCustomStartDate(formatDateInput(today))
                          setCustomEndDate(formatDateInput(next3Months))
                        }}
                      >
                        Next 3 Months
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Start Date</label>
                        <div
                          className="h-9 px-3 flex items-center justify-between bg-background border rounded-md text-sm cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            const input = document.getElementById('start-date-input') as HTMLInputElement
                            input?.showPicker()
                          }}
                        >
                          {formatDateNumeric(customStartDate ? new Date(customStartDate) : weekStart)}
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <input
                          id="start-date-input"
                          type="date"
                          value={customStartDate || formatDateInput(weekStart)}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="sr-only"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">End Date</label>
                        <div
                          className="h-9 px-3 flex items-center justify-between bg-background border rounded-md text-sm cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            const input = document.getElementById('end-date-input') as HTMLInputElement
                            input?.showPicker()
                          }}
                        >
                          {formatDateNumeric(customEndDate ? new Date(customEndDate) : weekEnd)}
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <input
                          id="end-date-input"
                          type="date"
                          value={customEndDate || formatDateInput(weekEnd)}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="sr-only"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setCustomStartDate("")
                          setCustomEndDate("")
                          setWeekOffset(0)
                          setDatePickerOpen(false)
                        }}
                      >
                        This Week
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          // If no custom dates selected yet, use the current week dates
                          if (!customStartDate) {
                            setCustomStartDate(formatDateInput(weekStart))
                          }
                          if (!customEndDate) {
                            setCustomEndDate(formatDateInput(weekEnd))
                          }
                          setDatePickerOpen(false)
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" className="h-8 px-3" onClick={() => {
                if (isCustomRange) {
                  // Clear custom range and go back to week view
                  setCustomStartDate("")
                  setCustomEndDate("")
                } else {
                  setWeekOffset(w => w + 1)
                }
              }}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Button>
            </div>
            {(weekOffset !== 0 || isCustomRange) && (
              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                setCustomStartDate("")
                setCustomEndDate("")
                setWeekOffset(0)
              }}>
                Today
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedDepartment} onValueChange={(v) => { setSelectedDepartment(v); setSelectedDriver("all"); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DriverFilterDropdown
              drivers={drivers}
              selectedDriver={selectedDriver}
              onSelect={setSelectedDriver}
              getDriverProfile={getDriverProfile}
            />
            <div className="flex items-center gap-2 ml-auto">
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
              <Button size="sm" variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import
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
        </div>

        {/* Modern Roster Grid - Drivers as rows, Days as columns */}
        <div
          className="overflow-x-auto cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return
            const startX = e.clientX
            const startOffset = weekOffset
            let moved = false
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const diff = startX - moveEvent.clientX
              if (Math.abs(diff) > 50) {
                const weeksDiff = diff > 0 ? 1 : -1
                if (!moved) {
                  moved = true
                  setWeekOffset(startOffset + weeksDiff)
                }
              }
            }
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
          onTouchStart={(e) => {
            if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return
            const startX = e.touches[0].clientX
            const startOffset = weekOffset
            let moved = false
            const handleTouchMove = (moveEvent: TouchEvent) => {
              const diff = startX - moveEvent.touches[0].clientX
              if (Math.abs(diff) > 50) {
                const weeksDiff = diff > 0 ? 1 : -1
                if (!moved) {
                  moved = true
                  setWeekOffset(startOffset + weeksDiff)
                }
              }
            }
            const handleTouchEnd = () => {
              document.removeEventListener('touchmove', handleTouchMove)
              document.removeEventListener('touchend', handleTouchEnd)
            }
            document.addEventListener('touchmove', handleTouchMove)
            document.addEventListener('touchend', handleTouchEnd)
          }}
        >
          <div className="min-w-[900px]">
            {/* Header row with days */}
            <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-1 mb-2">
              <div className="p-3 font-semibold text-sm text-muted-foreground">Driver</div>
              {(() => {
                const headers = []
                const today = new Date()
                today.setHours(0, 0, 0, 0)

                for (let i = 0; i < 7; i++) {
                  const date = new Date(weekStart)
                  date.setDate(date.getDate() + i)
                  const isToday = date.getTime() === today.getTime()
                  const dayName = date.toLocaleDateString("en-US", { weekday: "short" })
                  const dayNum = date.getDate()

                  headers.push(
                    <div
                      key={i}
                      className={`p-2 text-center rounded-lg ${
                        isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"
                      }`}
                    >
                      <div className="text-xs font-medium opacity-70">{dayName}</div>
                      <div className="text-lg font-bold">{dayNum}</div>
                    </div>
                  )
                }
                return headers
              })()}
            </div>

            {/* Driver rows */}
            {(selectedDriver === "all" ? drivers : drivers.filter(d => d.id === selectedDriver)).map(driver => {
              const profile = getDriverProfile(driver)
              return (
                <div key={driver.id} className="grid grid-cols-[200px_repeat(7,1fr)] gap-1 mb-1">
                  {/* Driver info */}
                  <div className="p-3 flex items-center gap-3 bg-muted/30 rounded-lg">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{profile?.full_name || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground truncate">{profile?.phone || ""}</div>
                    </div>
                  </div>

                  {/* Day cells */}
                  {(() => {
                    const cells = []
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)

                    for (let i = 0; i < 7; i++) {
                      const date = new Date(weekStart)
                      date.setDate(date.getDate() + i)
                      const dateStr = formatDateInput(date)
                      const isToday = date.getTime() === today.getTime()
                      const shift = shifts.find(s => s.driver_id === driver.id && s.shift_date === dateStr)

                      cells.push(
                        <div
                          key={i}
                          className={`min-h-[60px] p-1 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                            isToday ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-muted-foreground/20 hover:bg-muted/30"
                          }`}
                          onClick={() => {
                            if (shift) {
                              openEditDialog(shift)
                            } else {
                              // Quick add shift for this driver on this date
                              setFormData({
                                driver_ids: [driver.id],
                                shift_dates: [dateStr],
                                start_time: "08:00",
                                end_time: "16:00",
                                shift_type: "full_day",
                                status: "scheduled",
                                attendance_status: "pending",
                              })
                              setDateRangeMode("select")
                              setDialogOpen(true)
                            }
                          }}
                        >
                          {shift ? (
                            <div
                              className={`h-full p-2 rounded-md text-xs relative group ${
                                shift.attendance_status === "present" ? "bg-emerald-500/30 border-2 border-emerald-500"
                                : shift.attendance_status === "absent" ? "bg-red-500/30 border-2 border-red-500"
                                : shift.shift_type === "morning" ? "bg-amber-500/20 border border-amber-500/30"
                                : shift.shift_type === "afternoon" ? "bg-sky-500/20 border border-sky-500/30"
                                : shift.shift_type === "evening" ? "bg-indigo-500/20 border border-indigo-500/30"
                                : shift.shift_type === "night" ? "bg-slate-600/30 border border-slate-500/30"
                                : "bg-emerald-500/20 border border-emerald-500/30"
                              } ${selectedShifts.includes(shift.id) ? "ring-2 ring-primary" : ""}`}
                            >
                              {/* Edit button - shows on hover */}
                              <button
                                className="absolute top-0.5 left-0.5 w-5 h-5 bg-background/80 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditDialog(shift)
                                }}
                                title="Edit shift"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              {/* Select checkbox - top right */}
                              <button
                                className="absolute top-0.5 right-5 w-5 h-5 bg-background/80 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (selectedShifts.includes(shift.id)) {
                                    setSelectedShifts(prev => prev.filter(id => id !== shift.id))
                                  } else {
                                    setSelectedShifts(prev => [...prev, shift.id])
                                  }
                                }}
                                title="Select shift"
                              >
                                <Checkbox checked={selectedShifts.includes(shift.id)} className="w-3 h-3" />
                              </button>
                              {/* Attendance indicator */}
                              {shift.attendance_status === "present" && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-[8px]">✓</span>
                                </div>
                              )}
                              {shift.attendance_status === "absent" && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-[8px]">✕</span>
                                </div>
                              )}
                              <div className="font-semibold text-[11px] mb-0.5">
                                {SHIFT_TYPES.find(t => t.value === shift.shift_type)?.label || shift.shift_type}
                              </div>
                              <div className="font-mono text-[10px] opacity-80">
                                {shift.start_time.substring(0, 5)}-{shift.end_time.substring(0, 5)}
                              </div>
                              {shift.attendance_status === "absent" && shift.absence_reason && (
                                <div className="text-[9px] text-red-400 mt-1 truncate" title={shift.absence_reason}>
                                  {shift.absence_reason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <Plus className="h-4 w-4 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                      )
                    }
                    return cells
                  })()}
                </div>
              )
            })}

            {/* Empty state */}
            {drivers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No drivers found. Add drivers first.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation - Draggable Scroll Bar */}
        <div className="mt-4 pt-4 border-t">
          {/* Week Label */}
          <div className="text-center mb-3">
            <span className="text-sm font-medium">
              {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : weekOffset === 1 ? "Next Week" : (
                `${formatDateNumeric(weekStart)} - ${formatDateNumeric(weekEnd)}`
              )}
            </span>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="ml-3 text-xs text-primary hover:underline"
              >
                Go to Today
              </button>
            )}
          </div>

          {/* Scroll Track with Draggable Thumb */}
          <div
            className="relative h-8 bg-muted/30 rounded-full mx-auto max-w-md cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const clickX = e.clientX - rect.left
              const percent = clickX / rect.width
              const newOffset = Math.round((percent - 0.5) * 20) // -10 to +10 range
              setWeekOffset(Math.max(-10, Math.min(10, newOffset)))
            }}
          >
            {/* Track marks */}
            <div className="absolute inset-0 flex items-center justify-between px-4">
              {[-10, -5, 0, 5, 10].map((mark) => (
                <div
                  key={mark}
                  className={`w-0.5 h-3 rounded-full ${mark === 0 ? 'bg-primary/50 h-4' : 'bg-muted-foreground/20'}`}
                />
              ))}
            </div>

            {/* Draggable Thumb */}
            <div
              className="absolute top-1 h-6 w-16 bg-muted-foreground/60 hover:bg-muted-foreground/80 rounded-full cursor-grab active:cursor-grabbing transition-all shadow-md"
              style={{
                left: `calc(${((weekOffset + 10) / 20) * 100}% - 32px)`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                const startX = e.clientX
                const startOffset = weekOffset
                const track = e.currentTarget.parentElement!
                const trackWidth = track.getBoundingClientRect().width

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const diff = moveEvent.clientX - startX
                  const offsetChange = Math.round((diff / trackWidth) * 20)
                  const newOffset = Math.max(-10, Math.min(10, startOffset + offsetChange))
                  setWeekOffset(newOffset)
                }
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove)
                  document.removeEventListener('mouseup', handleMouseUp)
                }
                document.addEventListener('mousemove', handleMouseMove)
                document.addEventListener('mouseup', handleMouseUp)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                const startX = e.touches[0].clientX
                const startOffset = weekOffset
                const track = e.currentTarget.parentElement!
                const trackWidth = track.getBoundingClientRect().width

                const handleTouchMove = (moveEvent: TouchEvent) => {
                  const diff = moveEvent.touches[0].clientX - startX
                  const offsetChange = Math.round((diff / trackWidth) * 20)
                  const newOffset = Math.max(-10, Math.min(10, startOffset + offsetChange))
                  setWeekOffset(newOffset)
                }
                const handleTouchEnd = () => {
                  document.removeEventListener('touchmove', handleTouchMove)
                  document.removeEventListener('touchend', handleTouchEnd)
                }
                document.addEventListener('touchmove', handleTouchMove)
                document.addEventListener('touchend', handleTouchEnd)
              }}
            />
          </div>

          {/* Quick Navigation */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Color Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t text-xs flex-wrap">
            <span className="text-muted-foreground font-medium">Shift Types:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50" />
              <span>Full Day</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" />
              <span>Morning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-sky-500/30 border border-sky-500/50" />
              <span>Afternoon</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-indigo-500/30 border border-indigo-500/50" />
              <span>Evening</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-slate-600/40 border border-slate-500/50" />
              <span>Night</span>
            </div>
            <span className="text-muted-foreground mx-2">|</span>
            <span className="text-muted-foreground font-medium">Attendance:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500/40 border-2 border-emerald-500" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500/40 border-2 border-red-500" />
              <span>Absent</span>
            </div>
          </div>
        </div>

      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {editingShift ? "Edit Shift" : "Quick Add Shift"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Driver Selection - Compact */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Driver</label>
              {editingShift ? (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{getDriverProfile(drivers.find(d => d.id === formData.driver_ids[0]))?.full_name?.[0] || "?"}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{getDriverProfile(drivers.find(d => d.id === formData.driver_ids[0]))?.full_name || "Unknown"}</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {drivers.map(driver => {
                    const profile = getDriverProfile(driver)
                    const isSelected = formData.driver_ids.includes(driver.id)
                    return (
                      <button
                        key={driver.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setFormData({ ...formData, driver_ids: formData.driver_ids.filter(id => id !== driver.id) })
                          } else {
                            setFormData({ ...formData, driver_ids: [...formData.driver_ids, driver.id] })
                          }
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{profile?.full_name || "Unknown"}</span>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Date Selection - Simplified */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Date</label>
                {!editingShift && (
                  <div className="flex rounded-lg bg-muted/50 p-0.5">
                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        dateRangeMode === "select" ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                      onClick={() => setDateRangeMode("select")}
                    >
                      Pick Dates
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        dateRangeMode === "range" ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                      onClick={() => setDateRangeMode("range")}
                    >
                      Date Range
                    </button>
                  </div>
                )}
              </div>

              {dateRangeMode === "range" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">From</label>
                    <div
                      className="h-9 px-3 flex items-center justify-between bg-background border rounded-md text-sm cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        const input = document.getElementById('range-start-input') as HTMLInputElement
                        input?.showPicker()
                      }}
                    >
                      {rangeStart ? formatDateNumeric(new Date(rangeStart)) : "dd/mm/yyyy"}
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <input
                      id="range-start-input"
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="sr-only"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">To</label>
                    <div
                      className="h-9 px-3 flex items-center justify-between bg-background border rounded-md text-sm cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        const input = document.getElementById('range-end-input') as HTMLInputElement
                        input?.showPicker()
                      }}
                    >
                      {rangeEnd ? formatDateNumeric(new Date(rangeEnd)) : "dd/mm/yyyy"}
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <input
                      id="range-end-input"
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="sr-only"
                    />
                  </div>
                  {rangeStart && rangeEnd && (
                    <p className="col-span-2 text-xs text-primary font-medium">
                      {generateDatesFromRange().length} days will be scheduled
                    </p>
                  )}
                </div>
              ) : (
                <div className="border rounded-xl p-3 bg-muted/30">
                  {/* Month Navigation Header */}
                  <div className="flex items-center justify-between mb-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => navigateDialogCalendar(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">
                      {monthNames[dialogCalendarMonth]} {dialogCalendarYear}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => navigateDialogCalendar(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                      <span key={d} className="text-[10px] font-semibold text-muted-foreground uppercase">{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const monthDates = getMonthDates()
                      const firstDayOfWeek = monthDates[0].getDay()
                      const paddedDates = Array(firstDayOfWeek).fill(null).concat(monthDates)

                      return paddedDates.slice(0, 42).map((date, i) => {
                        if (!date) return <div key={`pad-${i}`} className="h-8" />
                        const dateStr = formatDateInput(date)
                        const isSelected = formData.shift_dates.includes(dateStr)
                        const isToday = dateStr === formatDateInput(new Date())

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => toggleDate(dateStr)}
                            className={`h-8 w-full rounded-lg text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : isToday
                                  ? "bg-primary/20 text-primary font-bold"
                                  : "hover:bg-muted text-foreground"
                            }`}
                          >
                            {date.getDate()}
                          </button>
                        )
                      })
                    })()}
                  </div>
                  {formData.shift_dates.length > 0 && (
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-primary font-medium">{formData.shift_dates.length} date(s) selected</span>
                      <button type="button" onClick={() => setFormData({ ...formData, shift_dates: [] })} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Time & Type - Horizontal compact layout */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Start</label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">End</label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                <Select value={formData.shift_type} onValueChange={(v) => setFormData({ ...formData, shift_type: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Attendance Status - Only show when editing */}
            {editingShift && (
              <div className="space-y-2 pt-2 border-t">
                <label className="text-sm font-medium text-muted-foreground">Attendance Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_status: "pending" })}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.attendance_status === "pending"
                        ? "border-gray-500 bg-gray-500/20 text-gray-200"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_status: "present" })}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.attendance_status === "present"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_status: "absent" })}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.attendance_status === "absent"
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Absent
                  </button>
                </div>
                {editingShift.absence_reason && formData.attendance_status === "absent" && (
                  <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded-md">
                    Reason: {editingShift.absence_reason}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="min-w-[100px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {editingShift ? "Update" : "Add Shift"}
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
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Auto-Schedule Shifts
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Automatically generate shifts for work days (Sun-Thu).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2 space-y-5">
            {/* Period Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Schedule Period</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSchedulePeriod("week")}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    autoSchedulePeriod === "week"
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="font-semibold text-sm">Next 7 Days</div>
                  <div className="text-xs text-muted-foreground mt-0.5">~5 work days</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoSchedulePeriod("month")}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    autoSchedulePeriod === "month"
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="font-semibold text-sm">Full Month</div>
                  <div className="text-xs text-muted-foreground mt-0.5">~22 work days</div>
                </button>
              </div>
            </div>

            {/* Driver Selection - Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">Select Drivers</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setAutoScheduleDrivers(drivers.map(d => d.id))}
                  >
                    Select All
                  </button>
                  {autoScheduleDrivers.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setAutoScheduleDrivers([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {drivers.map(driver => {
                  const profile = getDriverProfile(driver)
                  const isSelected = autoScheduleDrivers.includes(driver.id)
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setAutoScheduleDrivers(prev => prev.filter(id => id !== driver.id))
                        } else {
                          setAutoScheduleDrivers(prev => [...prev, driver.id])
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-transparent bg-muted/50 hover:bg-muted"
                      }`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{profile?.full_name || "Unknown"}</span>
                      {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Shift Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Shift Type</label>
              <Select value={autoScheduleShiftType} onValueChange={setAutoScheduleShiftType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning Shift</SelectItem>
                  <SelectItem value="afternoon">Afternoon Shift</SelectItem>
                  <SelectItem value="evening">Evening Shift</SelectItem>
                  <SelectItem value="night">Night Shift</SelectItem>
                  <SelectItem value="full_day">Full Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Shift Hours</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start Time</label>
                  <Input
                    type="time"
                    value={autoScheduleStartTime}
                    onChange={(e) => setAutoScheduleStartTime(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End Time</label>
                  <Input
                    type="time"
                    value={autoScheduleEndTime}
                    onChange={(e) => setAutoScheduleEndTime(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            {autoScheduleDrivers.length > 0 && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm">
                  <span className="font-bold text-primary">{autoScheduleDrivers.length}</span> driver(s) × <span className="font-bold text-primary">{autoSchedulePeriod === "month" ? "~22" : "~5"}</span> work days = <span className="font-bold">{autoScheduleDrivers.length * (autoSchedulePeriod === "month" ? 22 : 5)}</span> shifts
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={autoScheduling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAutoSchedule}
              disabled={autoScheduling || autoScheduleDrivers.length === 0}
              className="min-w-[140px]"
            >
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

      {/* Import CSV Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open)
        if (!open) {
          setImportPreview([])
          setImportError(null)
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Shifts from CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with shift data. Required columns: <code className="bg-muted px-1 rounded">driver_name</code>, <code className="bg-muted px-1 rounded">shift_date</code>.
              Optional: <code className="bg-muted px-1 rounded">start_time</code>, <code className="bg-muted px-1 rounded">end_time</code>, <code className="bg-muted px-1 rounded">shift_type</code>.
            </p>

            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Template
              </Button>
            </div>

            {importError && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-500">
                {importError}
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {importPreview.filter(r => r.driver_id).length} of {importPreview.length} shifts ready to import:
                </p>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 15).map((row, i) => (
                        <TableRow key={i} className={!row.driver_id ? "opacity-50" : ""}>
                          <TableCell>
                            {row.driver_id ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                                Matched
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                                No Match
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{row.driver_name}</TableCell>
                          <TableCell className="text-muted-foreground">{row.shift_date}</TableCell>
                          <TableCell className="text-muted-foreground">{row.start_time} - {row.end_time}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.shift_type}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importPreview.length > 15 && (
                    <p className="p-2 text-center text-sm text-muted-foreground">
                      ... and {importPreview.length - 15} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={importLoading || importPreview.filter(r => r.driver_id).length === 0}
            >
              {importLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {importPreview.filter(r => r.driver_id).length} Shifts
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Modern Staff Picker Component
function StaffPicker({
  drivers,
  selectedIds,
  onSelectionChange,
  singleSelect = false,
  getDriverProfile,
}: {
  drivers: Driver[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  singleSelect?: boolean
  getDriverProfile: (driver: Driver | undefined) => DriverProfile | null
}) {
  const [search, setSearch] = useState("")

  const filteredDrivers = drivers.filter(driver => {
    const profile = getDriverProfile(driver)
    const name = profile?.full_name?.toLowerCase() || ""
    return name.includes(search.toLowerCase())
  })

  const selectedDrivers = drivers.filter(d => selectedIds.includes(d.id))

  const toggleDriver = (driverId: string) => {
    if (singleSelect) {
      onSelectionChange([driverId])
    } else {
      if (selectedIds.includes(driverId)) {
        onSelectionChange(selectedIds.filter(id => id !== driverId))
      } else {
        onSelectionChange([...selectedIds, driverId])
      }
    }
  }

  const removeDriver = (driverId: string) => {
    onSelectionChange(selectedIds.filter(id => id !== driverId))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          {singleSelect ? "Select Driver" : "Select Staff"}
        </label>
        {!singleSelect && selectedIds.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSelectionChange([])}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Selected Staff Chips */}
      {selectedDrivers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedDrivers.map(driver => {
            const profile = getDriverProfile(driver)
            return (
              <div
                key={driver.id}
                className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full pl-1 pr-2 py-0.5 group"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary/20">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">{profile?.full_name?.split(" ")[0] || "Unknown"}</span>
                {!singleSelect && (
                  <button
                    type="button"
                    onClick={() => removeDriver(driver.id)}
                    className="ml-0.5 h-4 w-4 rounded-full flex items-center justify-center hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Search Input */}
      <div className="relative mb-2">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Quick Actions */}
      {!singleSelect && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border border-b-0 rounded-t-lg">
          <span className="text-xs text-muted-foreground">
            {selectedIds.length} of {drivers.length} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onSelectionChange(drivers.map(d => d.id))}
          >
            Select all
          </Button>
        </div>
      )}

      {/* Driver List - Always visible, scrollable */}
      <div className={`border ${!singleSelect ? 'border-t-0 rounded-b-lg' : 'rounded-lg'} max-h-40 overflow-y-auto`}>
        {filteredDrivers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No drivers found
          </div>
        ) : (
          filteredDrivers.map(driver => {
            const profile = getDriverProfile(driver)
            const isSelected = selectedIds.includes(driver.id)
            return (
              <div
                key={driver.id}
                onClick={() => toggleDriver(driver.id)}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/50 ${
                  isSelected ? "bg-primary/5" : ""
                }`}
              >
                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/30"
                }`}>
                  {isSelected && (
                    <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile?.full_name || "Unknown"}</p>
                  {profile?.phone && (
                    <p className="text-xs text-muted-foreground truncate">{profile.phone}</p>
                  )}
                </div>
                {isSelected && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Driver Filter Dropdown with Search
function DriverFilterDropdown({
  drivers,
  selectedDriver,
  onSelect,
  getDriverProfile,
}: {
  drivers: Driver[]
  selectedDriver: string
  onSelect: (id: string) => void
  getDriverProfile: (driver: Driver | undefined) => DriverProfile | null
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredDrivers = drivers.filter(driver => {
    const profile = getDriverProfile(driver)
    const name = profile?.full_name?.toLowerCase() || ""
    return name.includes(search.toLowerCase())
  })

  const selectedProfile = selectedDriver === "all"
    ? null
    : getDriverProfile(drivers.find(d => d.id === selectedDriver))

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="w-48 justify-between"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {selectedDriver === "all" ? "All Drivers" : selectedProfile?.full_name || "Unknown"}
        </span>
        <Search className="h-4 w-4 ml-2 opacity-50" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 z-50 bg-popover border rounded-lg shadow-lg">
            <div className="p-2 border-b">
              <Input
                placeholder="Search drivers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              <div
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent ${
                  selectedDriver === "all" ? "bg-accent" : ""
                }`}
                onClick={() => {
                  onSelect("all")
                  setOpen(false)
                  setSearch("")
                }}
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">All Drivers</span>
                {selectedDriver === "all" && <span className="ml-auto text-primary">✓</span>}
              </div>
              {filteredDrivers.map(driver => {
                const profile = getDriverProfile(driver)
                const isSelected = selectedDriver === driver.id
                return (
                  <div
                    key={driver.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent ${
                      isSelected ? "bg-accent" : ""
                    }`}
                    onClick={() => {
                      onSelect(driver.id)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{profile?.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{profile?.full_name || "Unknown"}</span>
                    {isSelected && <span className="ml-auto text-primary">✓</span>}
                  </div>
                )
              })}
              {filteredDrivers.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No drivers found
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
