"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface Vehicle {
  id: string
  name: string
  display_name: string
  plate_no: string | null
  is_active: boolean
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

  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "edit" | "delete" | "add" | null>(null)
  const [loading, setLoading] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [favoriteCounts, setFavoriteCounts] = useState<Record<string, number>>({})
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)
  const [selectedDriverFavorites, setSelectedDriverFavorites] = useState<{driverId: string, driverName: string, favorites: {id: string, customer_name: string, customer_id: string, created_at: string}[]}>({driverId: '', driverName: '', favorites: []})
  const [favoritesLoading, setFavoritesLoading] = useState(false)

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
    status: "pending"
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    loadVehicles()
    loadFavoriteCounts()
  }, [])

  const loadFavoriteCounts = async () => {
    const { data, error } = await supabase
      .from('favorite_drivers')
      .select('driver_id')

    if (!error && data) {
      const counts: Record<string, number> = {}
      data.forEach(row => {
        counts[row.driver_id] = (counts[row.driver_id] || 0) + 1
      })
      setFavoriteCounts(counts)
    }
  }

  const loadDriverFavorites = async (driverId: string, driverName: string) => {
    setFavoritesLoading(true)
    setFavoritesDialogOpen(true)

    const { data, error } = await supabase
      .from('favorite_drivers')
      .select(`
        id,
        customer_id,
        created_at,
        profiles!favorite_drivers_customer_id_fkey(full_name)
      `)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load favorites')
      setFavoritesLoading(false)
      return
    }

    setSelectedDriverFavorites({
      driverId,
      driverName,
      favorites: (data || []).map(f => ({
        id: f.id,
        customer_id: f.customer_id,
        customer_name: (f.profiles as unknown as { full_name: string } | null)?.full_name || 'Unknown',
        created_at: f.created_at
      }))
    })
    setFavoritesLoading(false)
  }

  const removeFavorite = async (favoriteId: string) => {
    const { error } = await supabase
      .from('favorite_drivers')
      .delete()
      .eq('id', favoriteId)

    if (error) {
      toast.error('Failed to remove favorite')
      return
    }

    toast.success('Favorite removed')
    setSelectedDriverFavorites(prev => ({
      ...prev,
      favorites: prev.favorites.filter(f => f.id !== favoriteId)
    }))
    setFavoriteCounts(prev => ({
      ...prev,
      [selectedDriverFavorites.driverId]: Math.max(0, (prev[selectedDriverFavorites.driverId] || 1) - 1)
    }))
  }

  const removeAllFavorites = async () => {
    const { error } = await supabase
      .from('favorite_drivers')
      .delete()
      .eq('driver_id', selectedDriverFavorites.driverId)

    if (error) {
      toast.error('Failed to remove all favorites')
      return
    }

    toast.success('All favorites removed')
    setSelectedDriverFavorites(prev => ({ ...prev, favorites: [] }))
    setFavoriteCounts(prev => ({
      ...prev,
      [selectedDriverFavorites.driverId]: 0
    }))
  }

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicle_types")
      .select("id, name, display_name, plate_no, is_active")
      .eq("is_active", true)
      .order("display_name")
    if (error) {
      console.error("Error loading vehicles:", error)
    }
    setVehicles(data || [])
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

  const handleSearch = () => updateParams("search", search)
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

  const openEditDialog = (driver: Driver) => {
    setSelectedDriver(driver)
    setFormData({
      full_name: driver.full_name || "",
      email: driver.email || "",
      phone: driver.phone || "",
      employee_id: driver.employee_id || "",
      department: driver.department || "",
      gender: driver.gender || "",
      vehicle_id: driver.driver_record?.vehicle_id || "",
      status: driver.status || "pending"
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
      status: "pending"
    })
    setDialogType("add")
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

        if (existingDriver) {
          // Update existing driver record
          const { error: driverError } = await supabase
            .from("drivers")
            .update({ vehicle_id: vehicleId })
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
            toast.success("Driver updated")
            logActivity({ action: 'update', entityType: 'driver', entityId: selectedDriver.id, details: { name: formData.full_name } })
          }
        } else {
          // Create new driver record
          const { error: driverError } = await supabase
            .from("drivers")
            .insert({
              profile_id: selectedDriver.id,
              vehicle_id: vehicleId
            })

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
            toast.success("Driver updated")
            logActivity({ action: 'update', entityType: 'driver', entityId: selectedDriver.id, details: { name: formData.full_name } })
          }
        }
        // Get updated vehicle info for local state
        const selectedVehicle = vehicles.find(v => v.id === vehicleId)
        setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? {
          ...d,
          ...formData,
          full_name: formData.full_name,
          status: formData.status,
          driver_record: {
            ...d.driver_record,
            vehicle_id: vehicleId,
            vehicle: selectedVehicle ? { id: selectedVehicle.id, display_name: selectedVehicle.display_name, plate_no: selectedVehicle.plate_no } : null
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
        // Create driver record with vehicle if assigned
        if (newProfile) {
          const vehicleId = formData.vehicle_id && formData.vehicle_id !== "none" ? formData.vehicle_id : null
          const { error: driverError } = await supabase
            .from("drivers")
            .insert({
              profile_id: newProfile.id,
              vehicle_id: vehicleId
            })

          if (driverError) {
            console.error("Driver record error:", driverError)
            toast.error("Failed to create driver record: " + driverError.message)
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

  const toggleSelectAll = () => {
    if (selectedIds.size === drivers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(drivers.map(d => d.id)))
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

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Employee ID", "Department", "Status", "Created At"]
    const rows = drivers.map(d => [
      d.full_name,
      d.email || "",
      d.phone || "",
      d.employee_id || "",
      d.department || "",
      d.status,
      formatDate(d.created_at)
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "drivers.csv"
    a.click()
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
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
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
            <Button size="sm" variant="outline" onClick={handleBulkApprove} disabled={bulkLoading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
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
                  checked={selectedIds.size === drivers.length && drivers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Live Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-center">Trips</TableHead>
              <TableHead className="text-center">Rating</TableHead>
              <TableHead className="text-center">Favorites</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No drivers found
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((driver) => (
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
                        <p className="text-xs text-muted-foreground">{driver.phone || driver.employee_id || "-"}</p>
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
                        <span className="text-sm font-medium">{driver.driver_record.vehicle.display_name || 'Vehicle'}</span>
                        {driver.driver_record.vehicle.plate_no && (
                          <span className="text-xs text-muted-foreground">({driver.driver_record.vehicle.plate_no})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
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
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      {driver.driver_record?.id && favoriteCounts[driver.driver_record.id] ? (
                        <button
                          onClick={() => loadDriverFavorites(driver.driver_record!.id, driver.full_name)}
                          className="flex items-center gap-1 hover:bg-muted px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          <span className="text-pink-500">♥</span>
                          <span className="font-medium">{favoriteCounts[driver.driver_record.id]}</span>
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
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
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(driver)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
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
                    </div>
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
                <label className="text-sm font-medium">Department</label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="IT Division"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Car className="h-4 w-4" />
                Assigned Vehicle
              </label>
              <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Vehicle</SelectItem>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.display_name} {vehicle.plate_no && `(${vehicle.plate_no})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Gender</label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
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
            <Button onClick={handleSave} disabled={loading}>
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

      {/* Favorites Management Dialog */}
      <Dialog open={favoritesDialogOpen} onOpenChange={setFavoritesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-pink-500">♥</span>
              Favorites for {selectedDriverFavorites.driverName}
            </DialogTitle>
            <DialogDescription>
              {selectedDriverFavorites.favorites.length} customer(s) have favorited this driver
            </DialogDescription>
          </DialogHeader>

          {favoritesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : selectedDriverFavorites.favorites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No favorites yet
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {selectedDriverFavorites.favorites.map((fav) => (
                <div key={fav.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{fav.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDistanceToNow(new Date(fav.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => removeFavorite(fav.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedDriverFavorites.favorites.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={removeAllFavorites}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove All
              </Button>
            )}
            <Button variant="outline" onClick={() => setFavoritesDialogOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
