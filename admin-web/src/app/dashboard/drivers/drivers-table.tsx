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
  icon: string
}
import { formatDate } from "@/lib/utils"
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
  } | null
}

interface DriversTableProps {
  drivers: Driver[]
  totalCount: number
  currentPage: number
  pageSize: number
}

export function DriversTable({ drivers, totalCount, currentPage, pageSize }: DriversTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "edit" | "delete" | "add" | null>(null)
  const [loading, setLoading] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
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
  }, [])

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicle_types")
      .select("id, name, display_name, plate_no, icon")
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
      router.refresh()
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
      router.refresh()
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
      router.refresh()
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
        router.refresh()
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
    setLoading(true)

    if (dialogType === "edit" && selectedDriver) {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: formData.phone || null,
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
            toast.error("Failed to assign vehicle: " + driverError.message)
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
            toast.error("Failed to assign vehicle: " + driverError.message)
          } else {
            toast.success("Driver updated")
            logActivity({ action: 'update', entityType: 'driver', entityId: selectedDriver.id, details: { name: formData.full_name } })
          }
        }
        setDialogType(null)
        router.refresh()
      }
    } else if (dialogType === "add") {
      const { data: newProfile, error } = await supabase
        .from("profiles")
        .insert({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: formData.phone || null,
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
        setDialogType(null)
        router.refresh()
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
      setSelectedIds(new Set())
      router.refresh()
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
      setSelectedIds(new Set())
      router.refresh()
    }
    setBulkLoading(false)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} drivers?`)) return
    setBulkLoading(true)
    const { error } = await supabase
      .from("profiles")
      .delete()
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to delete drivers")
    } else {
      toast.success(`${selectedIds.size} drivers deleted`)
      setSelectedIds(new Set())
      router.refresh()
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
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading}>
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
              <TableHead>Contact</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                        <AvatarImage src={driver.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(driver.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{driver.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm">{driver.email || "-"}</p>
                      <p className="text-sm text-muted-foreground">{driver.phone || "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{driver.employee_id || "-"}</TableCell>
                  <TableCell>{driver.department || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusBadge(driver.status)}
                      {driver.status === "pending" && (
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
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(driver.created_at)}</TableCell>
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
                  <AvatarImage src={selectedDriver.avatar_url || undefined} />
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
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Employee ID</label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="EMP001"
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
    </div>
  )
}
