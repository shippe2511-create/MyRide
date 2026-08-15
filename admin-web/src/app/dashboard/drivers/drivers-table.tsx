"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/hooks/usePermissions"
import { formatPhone } from "@/lib/format-phone"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ComboboxInput } from "@/components/ui/combobox-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  UserPlus,
  CheckCircle,
  XCircle,
  Car,
  Upload,
  FileSpreadsheet,
  Loader2,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface Vehicle {
  id: string
  vehicle_number: string
  vehicle_model: string | null
  status: string
}

interface Department {
  id: string
  name: string
}
import { formatDate } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { logActivity } from "@/lib/activity-logger"

interface Driver {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  employee_id: string | null
  department: string | null
  gender: string | null
  status: string
  avatar_url: string | null
  created_at: string
  driver_record?: {
    id: string
    vehicle_id: string | null
    vehicle?: Vehicle | null
    department_id?: string | null
    department?: Department | null
    is_online?: boolean
    is_on_break?: boolean
    break_type?: string | null
    break_start_time?: string | null
    total_trips?: number
    rating?: number
    updated_at?: string
  } | null
}

interface DriversTableProps {
  drivers: Driver[]
  totalCount: number
  currentPage: number
  pageSize: number
}

export function DriversTable({ drivers: initialDrivers, totalCount: initialTotalCount, currentPage, pageSize }: DriversTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { departmentId: userDepartmentId, isSuperAdmin } = usePermissions()

  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "edit" | "delete" | "add" | null>(null)
  const [loading, setLoading] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Import state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{
    full_name: string
    email: string
    phone: string
    employee_id: string
    department: string
    gender: string
  }>>([])
  const [importError, setImportError] = useState<string | null>(null)

  // Sync with server data when props change
  useEffect(() => {
    setDrivers(initialDrivers)
    setTotalCount(initialTotalCount)
  }, [initialDrivers, initialTotalCount])

  // Real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('drivers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setDrivers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } as Driver : d))
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setDrivers(prev => prev.filter(d => d.id !== payload.old.id))
          setTotalCount(prev => Math.max(0, prev - 1))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_id: "",
    department: "",
    gender: "",
    vehicle_id: "",
    department_id: "",
    status: "pending",
    pools: { public: true, private: false }
  })
  const [driverPools, setDriverPools] = useState<Record<string, string[]>>({})
  const [todayShifts, setTodayShifts] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [departmentInitialized, setDepartmentInitialized] = useState(false)
  const [poolFilter, setPoolFilter] = useState("all")

  // Set default department to user's department
  useEffect(() => {
    if (departments.length > 0 && !departmentInitialized) {
      if (userDepartmentId) {
        setDepartmentFilter(userDepartmentId)
      } else {
        setDepartmentFilter("all")
      }
      setDepartmentInitialized(true)
    }
  }, [departments, userDepartmentId, departmentInitialized])

  useEffect(() => {
    loadVehicles()
    loadAllDriverPools()
    loadDepartments()
    loadTodayShifts()
  }, [])

  const loadTodayShifts = async () => {
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase
      .from("shifts")
      .select("driver_id")
      .eq("shift_date", today)
      .neq("attendance_status", "absent")
    if (data) {
      setTodayShifts(new Set(data.map(s => s.driver_id)))
    }
  }

  const loadAllDriverPools = async () => {
    const { data } = await supabase.from("driver_pools").select("driver_id, pool:pools(name)")
    if (data) {
      const poolMap: Record<string, string[]> = {}
      data.forEach((row) => {
        if (!poolMap[row.driver_id]) poolMap[row.driver_id] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pool = row.pool as any
        if (pool?.name) poolMap[row.driver_id].push(pool.name)
      })
      setDriverPools(poolMap)
    }
  }

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, vehicle_number, vehicle_model, status")
      .eq("status", "active")
      .order("vehicle_number")
    if (error) {
      console.error("Error loading vehicles:", error)
    }
    setVehicles(data || [])
  }

  // Get set of vehicle IDs that are assigned to drivers
  const assignedVehicleIds = new Set(
    drivers
      .filter(d => d.driver_record?.vehicle_id)
      .map(d => d.driver_record!.vehicle_id!)
  )

  const loadDepartments = async () => {
    const { data, error } = await supabase
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
    if (error) {
      console.error("Error loading departments:", error)
    }
    setDepartments(data || [])
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/dashboard/drivers?${params.toString()}`)
  }

  const handleSearch = (value?: string) => updateParams("search", value ?? search)

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchParams.get("search")) {
        handleSearch(search)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    updateParams("status", value)
  }

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", page.toString())
    router.push(`/dashboard/drivers?${params.toString()}`)
  }

  const handleApprove = async (driver: Driver) => {
    setLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", driver.id)

    if (error) {
      toast.error("Failed to approve driver")
      console.error("Approve error:", error)
    } else {
      toast.success("Driver approved")
      logActivity({ action: 'update', entityType: 'driver', entityId: driver.id, details: { status: 'approved', name: driver.full_name } })
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: "approved" } : d))
    }
    setLoading(false)
  }

  const handleReject = async (driver: Driver) => {
    setLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", driver.id)

    if (error) {
      toast.error("Failed to reject driver")
      console.error("Reject error:", error)
    } else {
      toast.success("Driver rejected")
      logActivity({ action: 'update', entityType: 'driver', entityId: driver.id, details: { status: 'rejected', name: driver.full_name } })
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: "rejected" } : d))
    }
    setLoading(false)
  }

  const handleSuspend = async (driver: Driver) => {
    setLoading(true)
    const newStatus = driver.status === "suspended" ? "approved" : "suspended"
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", driver.id)

    if (error) {
      toast.error("Failed to update driver status")
      console.error("Suspend error:", error)
    } else {
      toast.success(`Driver ${newStatus === "suspended" ? "suspended" : "activated"}`)
      logActivity({ action: 'update', entityType: 'driver', entityId: driver.id, details: { status: newStatus, name: driver.full_name } })
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: newStatus } : d))
    }
    setLoading(false)
  }

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedDriver) return
    const driverToDelete = selectedDriver
    setDialogType(null)
    setLoading(true)

    try {
      // First delete from drivers table (if exists)
      await supabase
        .from("drivers")
        .delete()
        .eq("profile_id", driverToDelete.id)

      // Then delete from profiles table
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", driverToDelete.id)

      if (error) {
        console.error("Delete error:", error)
        toast.error("Failed to delete driver: " + error.message)
      } else {
        toast.success("Driver deleted")
        logActivity({ action: 'delete', entityType: 'driver', entityId: driverToDelete.id, details: { name: driverToDelete.full_name } })
        setDrivers(prev => prev.filter(d => d.id !== driverToDelete.id))
        setTotalCount(prev => Math.max(0, prev - 1))
      }
    } catch (e) {
      console.error("Delete exception:", e)
      toast.error("Failed to delete driver")
    }
    setLoading(false)
  }

  const openEditDialog = async (driver: Driver) => {
    setSelectedDriver(driver)

    // Load driver's current pools
    let currentPools = { public: true, private: false }
    if (driver.driver_record?.id) {
      const { data: poolData } = await supabase
        .from("driver_pools")
        .select("pool")
        .eq("driver_id", driver.driver_record.id)
      if (poolData) {
        currentPools = {
          public: poolData.some(p => p.pool === "public"),
          private: poolData.some(p => p.pool === "private")
        }
      }
    }

    setFormData({
      full_name: driver.full_name || "",
      email: driver.email || "",
      phone: driver.phone || "",
      employee_id: driver.employee_id || "",
      department: driver.department || "",
      gender: driver.gender || "",
      vehicle_id: driver.driver_record?.vehicle_id || "",
      department_id: driver.driver_record?.department_id || "",
      status: driver.status || "pending",
      pools: currentPools
    })
    setDialogType("edit")
  }

  const openAddDialog = () => {
    setSelectedDriver(null)
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      employee_id: "",
      department: "",
      gender: "",
      vehicle_id: "",
      department_id: "",
      status: "pending",
      pools: { public: true, private: false }
    })
    setDialogType("add")
  }

  const saveDriverPools = async (driverId: string, pools: { public: boolean, private: boolean }) => {
    // Delete existing pools
    await supabase.from("driver_pools").delete().eq("driver_id", driverId)

    // Insert new pools
    const poolsToInsert: Array<{ driver_id: string; pool: string }> = []
    if (pools.public) poolsToInsert.push({ driver_id: driverId, pool: "public" })
    if (pools.private) poolsToInsert.push({ driver_id: driverId, pool: "private" })

    if (poolsToInsert.length > 0) {
      await supabase.from("driver_pools").insert(poolsToInsert)
    }

    // Update local state
    setDriverPools(prev => ({
      ...prev,
      [driverId]: poolsToInsert.map(p => p.pool)
    }))
  }

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!formData.phone?.trim()) {
      toast.error("Phone is required")
      return
    }
    if (!formData.employee_id?.trim()) {
      toast.error("Employee ID is required")
      return
    }
    setLoading(true)

    if (dialogType === "edit" && selectedDriver) {
      // Format phone with country code
      let phone = formData.phone || null
      if (phone && !phone.startsWith('+')) {
        phone = `+960${phone}`
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: phone,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status
        })
        .eq("id", selectedDriver.id)

      if (error) {
        toast.error("Failed to update driver")
      } else {
        // Convert "none" to null for vehicle_id
        const vehicleId = formData.vehicle_id && formData.vehicle_id !== "none" ? formData.vehicle_id : null

        // Check if driver record exists
        const { data: existingDriver } = await supabase
          .from("drivers")
          .select("id")
          .eq("profile_id", selectedDriver.id)
          .maybeSingle()

        // Convert "none" to null for department_id
        const deptId = formData.department_id && formData.department_id !== "none" ? formData.department_id : null

        if (existingDriver) {
          // Update existing driver record
          const { error: driverError } = await supabase
            .from("drivers")
            .update({ vehicle_id: vehicleId, department_id: deptId })
            .eq("profile_id", selectedDriver.id)

          if (driverError) {
            console.error("Driver update error:", driverError)
            if (driverError.code === "23505") {
              toast.error("This vehicle is already assigned to another driver")
              return
            } else {
              toast.error("Failed to assign vehicle: " + driverError.message)
              return
            }
          } else {
            // Save pool assignments
            await saveDriverPools(existingDriver.id, formData.pools)
            toast.success("Driver updated")
            logActivity({ action: 'update', entityType: 'driver', entityId: selectedDriver.id, details: { name: formData.full_name } })
          }
        } else {
          // Create new driver record
          const { data: newDriverRecord, error: driverError } = await supabase
            .from("drivers")
            .insert({
              profile_id: selectedDriver.id,
              vehicle_id: vehicleId,
              department_id: deptId
            })
            .select("id")
            .single()

          if (driverError) {
            console.error("Driver insert error:", driverError)
            if (driverError.code === "23505") {
              toast.error("This vehicle is already assigned to another driver")
              return
            } else {
              toast.error("Failed to assign vehicle: " + driverError.message)
              return
            }
          } else {
            // Save pool assignments for newly created driver record
            if (newDriverRecord) {
              await saveDriverPools(newDriverRecord.id, formData.pools)
            }
            toast.success("Driver updated")
            logActivity({ action: 'update', entityType: 'driver', entityId: selectedDriver.id, details: { name: formData.full_name } })
          }
        }
        // Get updated vehicle and department info for local state
        const selectedVehicle = vehicles.find(v => v.id === vehicleId)
        const selectedDept = departments.find(d => d.id === deptId)
        setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? {
          ...d,
          ...formData,
          full_name: formData.full_name,
          status: formData.status,
          driver_record: {
            ...d.driver_record,
            vehicle_id: vehicleId,
            vehicle: selectedVehicle ? { id: selectedVehicle.id, vehicle_number: selectedVehicle.vehicle_number, vehicle_model: selectedVehicle.vehicle_model } : null,
            department_id: deptId,
            department: selectedDept ? { id: selectedDept.id, name: selectedDept.name } : null
          }
        } as Driver : d))
        setDialogType(null)
      }
    } else if (dialogType === "add") {
      // Format phone with country code
      let addPhone = formData.phone || null
      if (addPhone && !addPhone.startsWith('+')) {
        addPhone = `+960${addPhone}`
      }

      const { data: newProfile, error } = await supabase
        .from("profiles")
        .insert({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: addPhone,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status,
          role: "driver"
        })
        .select()
        .single()

      if (error) {
        toast.error("Failed to add driver: " + error.message)
      } else {
        // Create driver record with vehicle and department if assigned
        if (newProfile) {
          const vehicleId = formData.vehicle_id && formData.vehicle_id !== "none" ? formData.vehicle_id : null
          const deptId = formData.department_id && formData.department_id !== "none" ? formData.department_id : null
          const { data: newDriverRecord, error: driverError } = await supabase
            .from("drivers")
            .insert({
              profile_id: newProfile.id,
              vehicle_id: vehicleId,
              department_id: deptId
            })
            .select("id")
            .single()

          if (driverError) {
            console.error("Driver record error:", driverError)
            toast.error("Failed to create driver record: " + driverError.message)
          } else if (newDriverRecord) {
            // Save pool assignments
            await saveDriverPools(newDriverRecord.id, formData.pools)
          }
        }
        toast.success("Driver added")
        logActivity({ action: 'create', entityType: 'driver', entityId: newProfile?.id, details: { name: formData.full_name } })
        if (newProfile) {
          setDrivers(prev => [newProfile as Driver, ...prev].slice(0, pageSize))
          setTotalCount(prev => prev + 1)
        }
        setDialogType(null)
      }
    }
    setLoading(false)
  }

  // Filter drivers by department and pool
  const filteredDrivers = drivers.filter(driver => {
    // Department filter (skip if empty or "all")
    if (departmentFilter && departmentFilter !== "all") {
      if (departmentFilter === "none") {
        if (driver.driver_record?.department_id) return false
      } else {
        if (driver.driver_record?.department_id !== departmentFilter) return false
      }
    }

    // Pool filter
    if (poolFilter !== "all") {
      const pools = driver.driver_record?.id ? driverPools[driver.driver_record.id] || [] : []
      if (poolFilter === "none") {
        if (pools.length > 0) return false
      } else {
        if (!pools.includes(poolFilter)) return false
      }
    }

    return true
  })

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDrivers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDrivers.map(d => d.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "approved" })
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to approve drivers")
    } else {
      toast.success(`${selectedIds.size} drivers approved`)
      setDrivers(prev => prev.map(d => selectedIds.has(d.id) ? { ...d, status: "approved" } : d))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkSuspend = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "suspended" })
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to suspend drivers")
    } else {
      toast.success(`${selectedIds.size} drivers suspended`)
      setDrivers(prev => prev.map(d => selectedIds.has(d.id) ? { ...d, status: "suspended" } : d))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = new Set(selectedIds)
    setBulkLoading(true)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("profiles")
      .delete()
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to delete drivers")
    } else {
      toast.success(`${selectedIds.size} drivers deleted`)
      setDrivers(prev => prev.filter(d => !idsToDelete.has(d.id)))
      setTotalCount(prev => Math.max(0, prev - idsToDelete.size))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const exportCSV = async () => {
    toast.info("Exporting all drivers...")

    // Fetch ALL drivers from database, not just current page
    const { data: allDrivers, error } = await supabase
      .from("profiles")
      .select("full_name, email, phone, employee_id, department, status, created_at")
      .eq("role", "driver")
      .order("full_name", { ascending: true })

    if (error) {
      toast.error("Failed to export drivers")
      return
    }

    // Helper to escape CSV fields (wrap in quotes if contains comma, quote, or newline)
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    // Remove 960 country code prefix from phone
    const formatPhoneForExport = (phone: string | null) => {
      if (!phone) return ""
      return phone.replace(/^(\+?960)/, "")
    }

    const headers = ["Name", "Email", "Phone", "Employee ID", "Department", "Status", "Created At"]
    const rows = (allDrivers || []).map(d => [
      escapeCSV(d.full_name || ""),
      escapeCSV(d.email || ""),
      escapeCSV(formatPhoneForExport(d.phone)),
      escapeCSV(d.employee_id || ""),
      escapeCSV(d.department || ""),
      escapeCSV(d.status || ""),
      escapeCSV(formatDate(d.created_at))
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "drivers.csv"
    a.click()
    toast.success(`Exported ${allDrivers?.length || 0} drivers`)
  }

  // Download CSV template for import
  const downloadTemplate = () => {
    const headers = ["Full Name", "Email", "Phone", "Employee ID", "Department", "Gender"]
    const example = ["John Doe", "john@example.com", "+9601234567", "D-1234", "Transport", "male"]
    const csv = [headers.join(","), example.join(",")].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "driver_import_template.csv"
    a.click()
  }

  // Handle CSV file upload for import
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
          setImportError("CSV file must have a header row and at least one data row")
          return
        }

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, "").replace(/\s+/g, "_"))
        const nameIdx = headers.findIndex(h => h === "full_name" || h === "name")
        const emailIdx = headers.findIndex(h => h === "email")
        const phoneIdx = headers.findIndex(h => h === "phone")
        const empIdIdx = headers.findIndex(h => h === "employee_id" || h === "emp_id" || h === "employeeid")
        const deptIdx = headers.findIndex(h => h === "department" || h === "dept")
        const genderIdx = headers.findIndex(h => h === "gender" || h === "sex")

        if (nameIdx === -1) {
          setImportError("CSV must have a 'Full Name' or 'Name' column")
          return
        }

        const parsed: typeof importPreview = []
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""))
          const name = values[nameIdx] || ""
          if (!name) continue

          let phone = phoneIdx >= 0 ? values[phoneIdx] || "" : ""
          if (phone && !phone.startsWith("+")) {
            phone = `+960${phone}`
          }

          let gender = genderIdx >= 0 ? values[genderIdx]?.toLowerCase() || "" : ""
          if (gender === "m") gender = "male"
          if (gender === "f") gender = "female"

          parsed.push({
            full_name: name,
            email: emailIdx >= 0 ? values[emailIdx] || "" : "",
            phone: phone,
            employee_id: empIdIdx >= 0 ? values[empIdIdx] || "" : "",
            department: deptIdx >= 0 ? values[deptIdx] || "" : "",
            gender: gender,
          })
        }

        if (parsed.length === 0) {
          setImportError("No valid rows found in CSV")
          return
        }

        setImportPreview(parsed)
      } catch {
        setImportError("Failed to parse CSV file")
      }
    }
    reader.readAsText(file)
  }

  // Import drivers from CSV
  const handleImport = async () => {
    if (importPreview.length === 0) return
    setImportLoading(true)

    let successCount = 0
    let skipCount = 0

    for (const row of importPreview) {
      // First, create profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          full_name: row.full_name,
          email: row.email || null,
          phone: row.phone || null,
          employee_id: row.employee_id || null,
          department: row.department || null,
          gender: row.gender || null,
          status: "approved",
          role: "driver",
        })
        .select("id")
        .single()

      if (profileError) {
        if (profileError.message.includes("duplicate") || profileError.message.includes("unique")) {
          skipCount++
        } else {
          console.error("Import error:", profileError)
        }
        continue
      }

      // Then create driver record
      const { error: driverError } = await supabase
        .from("drivers")
        .insert({
          profile_id: profile.id,
        })

      if (driverError) {
        console.error("Driver record error:", driverError)
      } else {
        successCount++
      }
    }

    if (successCount > 0) {
      toast.success(`Imported ${successCount} drivers${skipCount > 0 ? `, skipped ${skipCount} duplicates` : ""}`)
      logActivity({ action: 'create', entityType: 'driver', details: { bulk_import: true, count: successCount } })
    } else if (skipCount > 0) {
      toast.info(`All ${skipCount} drivers already exist`)
    } else {
      toast.error("Failed to import drivers")
    }
    setImportDialogOpen(false)
    setImportPreview([])
    router.refresh()
    setImportLoading(false)
  }

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  const toggleDriverStatus = async (driver: Driver) => {
    const newStatus = driver.status === "approved" ? "suspended" : "approved"
    // Optimistic update
    setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: newStatus } : d))

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", driver.id)

    if (error) {
      toast.error("Failed to update status")
      // Revert on error
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: driver.status } : d))
    } else {
      toast.success(`Driver ${newStatus === "approved" ? "activated" : "suspended"}`)
      logActivity({ action: 'update', entityType: 'driver', entityId: driver.id, details: { status: newStatus } })
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge variant="success">Active</Badge>
      case "pending": return <Badge variant="warning">Pending</Badge>
      case "suspended": return <Badge variant="destructive">Suspended</Badge>
      case "rejected": return <Badge variant="destructive">Rejected</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-64 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="approved">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {isSuperAdmin && <SelectItem value="all">All Depts</SelectItem>}
              {isSuperAdmin && <SelectItem value="none">No Department</SelectItem>}
              {(isSuperAdmin ? departments : departments.filter(d => d.id === userDepartmentId)).map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={poolFilter} onValueChange={setPoolFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Pool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pools</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="none">No Pool</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => { setImportDialogOpen(true); setImportPreview([]); setImportError(null) }}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={openAddDialog}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Driver
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            {/* Only show Approve if at least one selected driver is not approved */}
            {drivers.some(d => selectedIds.has(d.id) && d.status !== 'approved') && (
              <Button size="sm" variant="outline" onClick={handleBulkApprove} disabled={bulkLoading}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleBulkSuspend} disabled={bulkLoading}>
              <Ban className="mr-2 h-4 w-4" />
              Suspend
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkLoading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === filteredDrivers.length && filteredDrivers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Live Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Pool</TableHead>
              <TableHead className="text-center">Trips</TableHead>
              <TableHead className="text-center">Rating</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-16 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDrivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  {drivers.length === 0 ? "No drivers found" : "No drivers match the selected filters"}
                </TableCell>
              </TableRow>
            ) : (
              filteredDrivers.map((driver) => (
                <TableRow key={driver.id} className="group hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(driver.id)}
                      onCheckedChange={() => toggleSelect(driver.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={driver.avatar_url ? `${driver.avatar_url}?t=${Date.now()}` : undefined} />
                        <AvatarFallback>{getInitials(driver.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium">{driver.full_name}</span>
                        <p className="text-xs text-muted-foreground select-text">{formatPhone(driver.phone) || driver.employee_id || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {driver.driver_record?.is_on_break ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5" />
                          {driver.driver_record.break_type || "Break"}
                        </Badge>
                        {driver.driver_record.break_start_time && (
                          <p className="text-xs text-yellow-500">
                            {formatDistanceToNow(new Date(driver.driver_record.break_start_time))}
                          </p>
                        )}
                      </div>
                    ) : driver.driver_record?.is_online ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                        Online
                      </Badge>
                    ) : !driver.driver_record?.id || !todayShifts.has(driver.driver_record.id) ? (
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5" />
                        Not Scheduled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5" />
                        Offline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {driver.driver_record?.vehicle ? (
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{driver.driver_record.vehicle.vehicle_number || 'Vehicle'}</span>
                        {driver.driver_record.vehicle.vehicle_model && (
                          <span className="text-xs text-muted-foreground">({driver.driver_record.vehicle.vehicle_model})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {driver.driver_record?.department ? (
                      <Badge variant="outline">{driver.driver_record.department.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {driver.driver_record?.id && driverPools[driver.driver_record.id]?.length > 0 ? (
                        driverPools[driver.driver_record.id].map((poolName, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">{poolName}</Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{driver.driver_record?.total_trips || 0}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-yellow-500">★</span>
                      <span className="font-medium">{driver.driver_record?.rating?.toFixed(1) || "0.0"}</span>
                    </div>
                  </TableCell>
                                    <TableCell>
                    {driver.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-green-500 border-green-500 hover:bg-green-500 hover:text-white"
                        onClick={() => handleApprove(driver)}
                        disabled={loading}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                    ) : (
                      <Switch
                        checked={driver.status === "approved"}
                        onCheckedChange={() => toggleDriverStatus(driver)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => {
                          setSelectedDriver(driver)
                          setDialogType("view")
                        }}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEditDialog(driver)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {driver.status === "pending" && (
                          <>
                            <DropdownMenuItem onSelect={() => handleApprove(driver)}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleReject(driver)}>
                              <XCircle className="mr-2 h-4 w-4 text-red-500" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        {driver.status !== "pending" && (
                          <DropdownMenuItem onSelect={() => handleSuspend(driver)}>
                            <Ban className="mr-2 h-4 w-4" />
                            {driver.status === "suspended" ? "Activate" : "Suspend"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => {
                            setSelectedDriver(driver)
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
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} drivers
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={dialogType === "delete"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Driver</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedDriver?.full_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={dialogType === "view"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Driver Details</DialogTitle>
            <DialogDescription>
              For performance KPIs, use the Performance tab
            </DialogDescription>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedDriver.avatar_url ? `${selectedDriver.avatar_url}?t=${Date.now()}` : undefined} />
                  <AvatarFallback className="text-lg">{getInitials(selectedDriver.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{selectedDriver.full_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {statusBadge(selectedDriver.status)}
                    {selectedDriver.department && <Badge variant="outline">{selectedDriver.department}</Badge>}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selectedDriver.email || "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{selectedDriver.phone || "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Employee ID</span>
                  <span>{selectedDriver.employee_id || "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Department</span>
                  <span>{selectedDriver.department || "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{formatDate(selectedDriver.created_at)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogType === "edit" || dialogType === "add"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "add" ? "Add Driver" : "Edit Driver"}</DialogTitle>
            <DialogDescription>
              {dialogType === "add" ? "Add a new driver to the system" : "Update driver information"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Full Name *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Phone <span className="text-red-500">*</span></label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="7XXXXXX"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Employee ID <span className="text-red-500">*</span></label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="EMP001"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Assigned Vehicle
                </label>
                <ComboboxInput
                  value={formData.vehicle_id}
                  onChange={(v) => setFormData({ ...formData, vehicle_id: v })}
                  options={[
                    { value: "none", label: "No Vehicle" },
                    ...vehicles.map((vehicle) => {
                      const isAssigned = assignedVehicleIds.has(vehicle.id) && vehicle.id !== formData.vehicle_id
                      return {
                        value: vehicle.id,
                        label: `${vehicle.vehicle_number} ${vehicle.vehicle_model ? `(${vehicle.vehicle_model})` : ""}`.trim(),
                        status: isAssigned ? "assigned" as const : "available" as const
                      }
                    })
                  ]}
                  placeholder="Search vehicle..."
                />
                {selectedDriver?.driver_record?.id && !todayShifts.has(selectedDriver.driver_record.id) && formData.vehicle_id && formData.vehicle_id !== "none" && (
                  <p className="text-xs text-orange-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    Driver not scheduled today - cannot go online
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Department</label>
                <Select value={formData.department_id} onValueChange={(v) => setFormData({ ...formData, department_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="none">No Department</SelectItem>}
                    {(isSuperAdmin ? departments : departments.filter(d => d.id === userDepartmentId)).map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Gender</label>
                <Select value={formData.gender || "unspecified"} onValueChange={(v) => setFormData({ ...formData, gender: v === "unspecified" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Not specified</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={loading || !formData.full_name.trim() || !formData.phone?.trim() || !formData.employee_id?.trim()}
            >
              {loading ? "Saving..." : dialogType === "add" ? "Add Driver" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Drivers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} driver(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import CSV Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Drivers from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file with driver data. Required column: full_name. Optional: email, phone, employee_id, department, gender.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                {importError}
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{importPreview.length} drivers ready to import:</p>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Gender</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{row.full_name}</TableCell>
                          <TableCell className="text-muted-foreground">{row.email || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{formatPhone(row.phone) || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.employee_id || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.department || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.gender || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importPreview.length > 10 && (
                    <p className="p-2 text-center text-sm text-muted-foreground">
                      ... and {importPreview.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importLoading || importPreview.length === 0}>
              {importLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {importPreview.length} Drivers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
