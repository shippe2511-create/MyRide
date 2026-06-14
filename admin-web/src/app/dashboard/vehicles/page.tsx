"use client"

import { useState, useEffect } from "react"
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Car, Bus, Truck, Bike, Ship, GripVertical } from "lucide-react"
import { toast } from "sonner"

interface VehicleType {
  id: string
  name: string
  display_name: string
  description: string | null
  icon: string
  plate_no: string | null
  capacity: number
  base_fare: number
  per_km_rate: number
  per_min_rate: number
  min_fare: number
  is_active: boolean
  sort_order: number
  features: string[]
  created_at: string
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

export default function VehiclesPage() {
  const supabase = createClient()
  const [vehicles, setVehicles] = useState<VehicleType[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    display_name: "",
    description: "",
    icon: "car",
    plate_no: "",
    capacity: 4,
    base_fare: 0,
    per_km_rate: 0,
    per_min_rate: 0,
    min_fare: 0,
    is_active: true,
    features: ""
  })

  useEffect(() => {
    loadVehicles()
  }, [])

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicle_types")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) {
      // Table might not exist, create it
      if (error.code === "42P01") {
        toast.error("Vehicle types table not found. Please create it in Supabase.")
      }
    }
    setVehicles(data || [])
    setLoading(false)
  }

  const openAddDialog = () => {
    setSelectedVehicle(null)
    setFormData({
      name: "",
      display_name: "",
      description: "",
      icon: "car",
      plate_no: "",
      capacity: 4,
      base_fare: 0,
      per_km_rate: 0,
      per_min_rate: 0,
      min_fare: 0,
      is_active: true,
      features: ""
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
      capacity: vehicle.capacity,
      base_fare: vehicle.base_fare,
      per_km_rate: vehicle.per_km_rate,
      per_min_rate: vehicle.per_min_rate,
      min_fare: vehicle.min_fare,
      is_active: vehicle.is_active,
      features: (vehicle.features || []).join(", ")
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

    const payload = {
      name: selectedVehicle ? selectedVehicle.name : autoName,
      display_name: formData.display_name,
      description: formData.description || null,
      icon: formData.icon,
      plate_no: formData.plate_no || null,
      capacity: formData.capacity,
      base_fare: formData.base_fare,
      per_km_rate: formData.per_km_rate,
      per_min_rate: formData.per_min_rate,
      min_fare: formData.min_fare,
      is_active: formData.is_active,
      features: formData.features.split(",").map(f => f.trim()).filter(Boolean),
      sort_order: selectedVehicle?.sort_order || vehicles.length + 1
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

  const handleDelete = async () => {
    if (!selectedVehicle) return
    setSaving(true)

    const { error } = await supabase.from("vehicle_types").delete().eq("id", selectedVehicle.id)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Vehicle type deleted")
      setDeleteDialogOpen(false)
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

  const activeCount = vehicles.filter(v => v.is_active).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vehicle Types</h1>
          <p className="text-muted-foreground">
            Manage vehicle categories shown in customer and driver apps
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            Synced to Apps
          </Badge>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle Type
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vehicles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">{vehicles.length - activeCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vehicle Types</CardTitle>
          <CardDescription>
            Configure vehicle types, pricing, and features for your transport service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No vehicle types configured. Add your first vehicle type to get started.
                  </TableCell>
                </TableRow>
              ) : (
                vehicles.map((vehicle) => {
                  const IconComponent = getIconComponent(vehicle.icon)
                  return (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <IconComponent className="h-5 w-5 text-primary" />
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
                      <TableCell>{vehicle.capacity} seats</TableCell>
                      <TableCell>
                        <Switch
                          checked={vehicle.is_active}
                          onCheckedChange={() => toggleActive(vehicle)}
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
              Configure vehicle details, pricing, and features
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
            <div className="grid gap-2">
              <label className="text-sm font-medium">Features (comma separated)</label>
              <Input
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                placeholder="AC, WiFi, USB Charging"
              />
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
    </div>
  )
}
