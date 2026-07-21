"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { Plus, Edit, Trash2, MoreHorizontal, Car, Bus, Truck, Bike, Ship, GripVertical, Download, Search } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

interface VehicleType {
  id: string
  name: string
  display_name: string
  description: string | null
  icon: string
  plate_no: string | null
  make_model: string | null
  color: string | null
  capacity: number
  base_fare: number
  per_km_rate: number
  per_min_rate: number
  min_fare: number
  is_active: boolean
  sort_order: number
  features: string[]
  department_id: string | null
  department?: { id: string; name: string } | null
  created_at: string
}

interface Department {
  id: string
  name: string
}

const VEHICLE_CATEGORIES = [
  { value: "car", label: "Car / Sedan" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van / Shuttle" },
  { value: "bus", label: "Bus" },
  { value: "bike", label: "Bike / Motorcycle" },
  { value: "ferry", label: "Ferry / Boat" },
  { value: "truck", label: "Truck / Pickup" },
  { value: "luxury", label: "Luxury / Premium" },
  { value: "electric", label: "Electric" },
]

const CATEGORY_ICONS: Record<string, typeof Car> = {
  car: Car,
  suv: Car,
  van: Truck,
  bus: Bus,
  bike: Bike,
  ferry: Ship,
  truck: Truck,
  luxury: Car,
  electric: Car,
}

const getIconComponent = (iconName: string | null) => {
  if (!iconName) return Car
  // Map old material icons to new ones
  const legacyMap: Record<string, typeof Car> = {
    "directions_car": Car,
    "directions_bus": Bus,
    "airport_shuttle": Truck,
    "local_shipping": Truck,
    "electric_car": Car,
    "star": Car,
  }
  if (legacyMap[iconName]) return legacyMap[iconName]
  return CATEGORY_ICONS[iconName] || Car
}

const supabase = createClient()

export default function VehiclesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [departments, setDepartments] = useState<Department[]>([])
  const [formData, setFormData] = useState({
    name: "",
    display_name: "",
    description: "",
    icon: "car",
    plate_no: "",
    make_model: "",
    color: "",
    capacity: 4,
    is_active: true,
    features: "",
    department_id: ""
  })

  const { data: vehicles = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["vehicles-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*, department:departments(id, name)")
        .order("sort_order", { ascending: true })

      if (error && error.code === "42P01") {
        toast.error("Vehicle types table not found. Please create it in Supabase.")
      }
      return data || []
    },
    staleTime: 30 * 1000,
  })

  // Load departments
  useEffect(() => {
    const loadDepartments = async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
      setDepartments(data || [])
    }
    loadDepartments()
  }, [])

  // Realtime subscription for vehicle updates
  useEffect(() => {
    const channel = supabase
      .channel('vehicles_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_types' }, () => {
        queryClient.invalidateQueries({ queryKey: ["vehicles-page"], exact: false })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const loadVehicles = () => refetch()

  const openAddDialog = () => {
    setSelectedVehicle(null)
    setFormData({
      name: "",
      display_name: "",
      description: "",
      icon: "car",
      plate_no: "",
      make_model: "",
      color: "",
      capacity: 4,
      is_active: true,
      features: "",
      department_id: ""
    })
    setDialogOpen(true)
  }

  const openEditDialog = (vehicle: VehicleType) => {
    setSelectedVehicle(vehicle)
    setFormData({
      name: vehicle.name,
      display_name: vehicle.display_name,
      description: vehicle.description || "",
      icon: vehicle.icon,
      plate_no: vehicle.plate_no || "",
      make_model: vehicle.make_model || "",
      color: vehicle.color || "",
      capacity: vehicle.capacity,
      is_active: vehicle.is_active,
      features: (vehicle.features || []).join(", "),
      department_id: vehicle.department_id || ""
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.display_name.trim()) {
      toast.error("Display name is required")
      return
    }
    setSaving(true)

    // Auto-generate unique internal name from display_name + plate_no
    const autoName = `${formData.display_name}_${formData.plate_no || Date.now()}`.replace(/\s+/g, "_").toLowerCase()

    const deptId = formData.department_id && formData.department_id !== "none" ? formData.department_id : null

    const payload = {
      name: selectedVehicle ? selectedVehicle.name : autoName,
      display_name: formData.display_name,
      description: formData.description || null,
      icon: formData.icon,
      plate_no: formData.plate_no || null,
      make_model: formData.make_model || null,
      color: formData.color || null,
      capacity: formData.capacity,
      is_active: formData.is_active,
      features: formData.features.split(",").map(f => f.trim()).filter(Boolean),
      sort_order: selectedVehicle?.sort_order || vehicles.length + 1,
      department_id: deptId
    }

    let error
    if (selectedVehicle) {
      const res = await supabase.from("vehicle_types").update(payload).eq("id", selectedVehicle.id)
      error = res.error
    } else {
      const res = await supabase.from("vehicle_types").insert(payload)
      error = res.error
    }

    if (error) {
      toast.error("Failed to save: " + error.message)
    } else {
      toast.success(selectedVehicle ? "Vehicle type updated" : "Vehicle type added")
      setDialogOpen(false)
      loadVehicles()
    }
    setSaving(false)
  }

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedVehicle) return
    const vehicleToDelete = selectedVehicle
    setDeleteDialogOpen(false)
    setSaving(true)

    const { error } = await supabase.from("vehicle_types").delete().eq("id", vehicleToDelete.id)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Vehicle type deleted")
      loadVehicles()
    }
    setSaving(false)
  }

  const toggleActive = async (vehicle: VehicleType) => {
    const { error } = await supabase
      .from("vehicle_types")
      .update({ is_active: !vehicle.is_active })
      .eq("id", vehicle.id)

    if (error) {
      toast.error("Failed to update")
    } else {
      toast.success(vehicle.is_active ? "Vehicle type disabled" : "Vehicle type enabled")
      loadVehicles()
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setSaving(true)

    const { error } = await supabase
      .from("vehicle_types")
      .delete()
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to delete vehicles: " + error.message)
    } else {
      toast.success(`Deleted ${selectedIds.size} vehicle${selectedIds.size > 1 ? "s" : ""}`)
      setSelectedIds(new Set())
      loadVehicles()
    }
    setBulkDeleteOpen(false)
    setSaving(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === vehicles.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(vehicles.map(v => v.id)))
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

  const activeCount = vehicles.filter(v => v.is_active).length

  // Filter vehicles by search
  const filteredVehicles = vehicles.filter(v => {
    if (!search.trim()) return true
    const searchLower = search.toLowerCase()
    return (
      v.name?.toLowerCase().includes(searchLower) ||
      v.display_name?.toLowerCase().includes(searchLower) ||
      v.plate_no?.toLowerCase().includes(searchLower) ||
      v.make_model?.toLowerCase().includes(searchLower) ||
      v.color?.toLowerCase().includes(searchLower)
    )
  })

  const exportCSV = () => {
    const headers = ["Name", "Display Name", "Plate No", "Capacity", "Status", "Created At"]
    const rows = vehicles.map(v => [
      v.name,
      v.display_name,
      v.plate_no || "",
      v.capacity,
      v.is_active ? "Active" : "Inactive",
      new Date(v.created_at).toLocaleDateString()
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vehicles_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Vehicles exported")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-40 h-9 bg-muted rounded animate-pulse" />
          <div className="w-80 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="vehicles:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="h-6 w-6" />
            Vehicle Types
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage vehicle categories shown in customer and driver apps
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle Type
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <Car className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{vehicles.length}</p>
              <p className="text-xs text-muted-foreground truncate">Total Types</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Car className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{activeCount}</p>
              <p className="text-xs text-muted-foreground truncate">Active</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {vehicles.length > 0 ? Math.round((activeCount / vehicles.length) * 100) : 0}%
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <Car className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-muted-foreground">{vehicles.length - activeCount}</p>
              <p className="text-xs text-muted-foreground truncate">Inactive</p>
            </div>
          </div>
        </Card>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted/50 border rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} vehicle{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Vehicle Types</CardTitle>
              <CardDescription>
                Configure vehicle types and features for your transport service
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={vehicles.length > 0 && selectedIds.size === vehicles.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {search ? "No vehicles match your search." : "No vehicle types configured. Add your first vehicle type to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const IconComponent = getIconComponent(vehicle.icon)
                  return (
                    <TableRow key={vehicle.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(vehicle.id)}
                          onCheckedChange={() => toggleSelect(vehicle.id)}
                          aria-label={`Select ${vehicle.display_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <IconComponent className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{vehicle.plate_no || "-"}</p>
                            <p className="text-xs text-muted-foreground">{vehicle.display_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {vehicle.icon || "car"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {vehicle.department ? (
                          <Badge variant="outline">{vehicle.department.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>{vehicle.capacity} seats</TableCell>
                      <TableCell>
                        <Switch
                          checked={vehicle.is_active}
                          onCheckedChange={() => toggleActive(vehicle)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(vehicle)}
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
                              <DropdownMenuItem onSelect={() => openEditDialog(vehicle)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => {
                                  setSelectedVehicle(vehicle)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                  <Trash2 className="mr-2 h-4 w-4" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedVehicle ? "Edit Vehicle Type" : "Add Vehicle Type"}</DialogTitle>
            <DialogDescription>
              Configure vehicle details and features
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Vehicle ID *</label>
                <Input
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value.toUpperCase() })}
                  placeholder="MV70"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Plate Number</label>
                <Input
                  value={formData.plate_no}
                  onChange={(e) => setFormData({ ...formData, plate_no: e.target.value.toUpperCase() })}
                  placeholder="C7846"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Make/Model</label>
                <Input
                  value={formData.make_model}
                  onChange={(e) => setFormData({ ...formData, make_model: e.target.value })}
                  placeholder="Toyota Hiace"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Color</label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="White"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Affordable rides for everyday travel"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Category</label>
                <ComboboxInput
                  value={formData.icon}
                  onChange={(v) => setFormData({ ...formData, icon: v })}
                  options={VEHICLE_CATEGORIES}
                  placeholder="Select or add category"
                  allowCustom={true}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Capacity (Seats)</label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={50}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Features (comma separated)</label>
                <Input
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="AC, WiFi, USB Charging"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Department</label>
                <Select value={formData.department_id} onValueChange={(v) => setFormData({ ...formData, department_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Department</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <label className="text-sm">Active (visible in apps)</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedVehicle ? "Update" : "Add Vehicle Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vehicle Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedVehicle?.display_name}"? This may affect existing rides and bookings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete AlertDialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} vehicle{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected vehicle type{selectedIds.size > 1 ? "s" : ""} and may affect existing rides and bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  )
}
