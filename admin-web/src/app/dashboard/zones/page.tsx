"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Map, Download } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"

interface Zone {
  id: string
  name: string
  zone_type: string
  priority: number
  is_active: boolean
  created_at: string
}

interface Location {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  location_type: string
  is_active: boolean
}

export default function ZonesPage() {
  const supabase = createClient()
  const [zones, setZones] = useState<Zone[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<"zone" | "location" | "delete-zone" | "delete-location" | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [zonesRes, locationsRes] = await Promise.all([
      supabase.from("service_zones").select("*").order("priority", { ascending: false }),
      supabase.from("locations").select("*").order("name", { ascending: true }),
    ])
    setZones(zonesRes.data || [])
    setLocations(locationsRes.data || [])
    setLoading(false)
  }

  const openZoneDialog = (zone?: Zone) => {
    setSelectedItem(zone || null)
    setFormData({
      name: zone?.name || "",
      zone_type: zone?.zone_type || "both",
      priority: zone?.priority || 0,
      is_active: zone?.is_active ?? true
    })
    setDialogType("zone")
  }

  const openLocationDialog = (location?: Location) => {
    setSelectedItem(location || null)
    setFormData({
      name: location?.name || "",
      address: location?.address || "",
      latitude: location?.latitude || "",
      longitude: location?.longitude || "",
      location_type: location?.location_type || "pickup",
      is_active: location?.is_active ?? true
    })
    setDialogType("location")
  }

  const handleSaveZone = async () => {
    if (!formData.name.trim()) {
      toast.error("Zone name is required")
      return
    }
    setSaving(true)

    const payload = {
      name: formData.name,
      zone_type: formData.zone_type,
      priority: parseInt(formData.priority) || 0,
      is_active: formData.is_active
    }

    if (selectedItem) {
      const { error } = await supabase.from("service_zones").update(payload).eq("id", selectedItem.id)
      if (error) toast.error("Failed to update zone")
      else {
        toast.success("Zone updated")
        setZones(prev => prev.map(z => z.id === selectedItem.id ? { ...z, ...payload } : z))
      }
    } else {
      const { data, error } = await supabase.from("service_zones").insert(payload).select().single()
      if (error) toast.error("Failed to create zone: " + error.message)
      else {
        toast.success("Zone created")
        if (data) setZones(prev => [...prev, data])
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleSaveLocation = async () => {
    if (!formData.name.trim()) {
      toast.error("Location name is required")
      return
    }

    // Validate coordinates if provided
    const lat = parseFloat(formData.latitude)
    const lng = parseFloat(formData.longitude)

    if (formData.latitude && (isNaN(lat) || lat < -90 || lat > 90)) {
      toast.error("Latitude must be between -90 and 90")
      return
    }
    if (formData.longitude && (isNaN(lng) || lng < -180 || lng > 180)) {
      toast.error("Longitude must be between -180 and 180")
      return
    }

    setSaving(true)

    const payload = {
      name: formData.name,
      address: formData.address || null,
      latitude: formData.latitude ? lat : null,
      longitude: formData.longitude ? lng : null,
      location_type: formData.location_type,
      is_active: formData.is_active
    }

    if (selectedItem) {
      const { error } = await supabase.from("locations").update(payload).eq("id", selectedItem.id)
      if (error) toast.error("Failed to update location")
      else {
        toast.success("Location updated")
        setLocations(prev => prev.map(l => l.id === selectedItem.id ? { ...l, ...payload } : l))
      }
    } else {
      const { data, error } = await supabase.from("locations").insert(payload).select().single()
      if (error) toast.error("Failed to create location: " + error.message)
      else {
        toast.success("Location created")
        if (data) setLocations(prev => [...prev, data])
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleDeleteZone = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedItem) return
    const itemToDelete = selectedItem
    setDialogType(null)
    setSaving(true)
    const { error } = await supabase.from("service_zones").delete().eq("id", itemToDelete.id)
    if (error) toast.error("Failed to delete zone")
    else {
      toast.success("Zone deleted")
      setZones(prev => prev.filter(z => z.id !== itemToDelete.id))
    }
    setSaving(false)
  }

  const handleDeleteLocation = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedItem) return
    const itemToDelete = selectedItem
    setDialogType(null)
    setSaving(true)
    const { error } = await supabase.from("locations").delete().eq("id", itemToDelete.id)
    if (error) toast.error("Failed to delete location")
    else {
      toast.success("Location deleted")
      setLocations(prev => prev.filter(l => l.id !== itemToDelete.id))
    }
    setSaving(false)
  }

  const exportCSV = () => {
    const headers = ["Name", "Type", "Priority", "Status", "Created At"]
    const rows = zones.map(z => [
      z.name,
      z.zone_type,
      z.priority,
      z.is_active ? "Active" : "Inactive",
      new Date(z.created_at).toLocaleDateString()
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `zones_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Zones exported")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-40 h-9 bg-muted rounded animate-pulse" />
          <div className="w-72 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6" />
            Service Zones
          </h1>
          <p className="text-sm text-muted-foreground">
            Define pickup/dropoff areas and coverage boundaries
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => openZoneDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Create Zone
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Map className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{zones.filter(z => z.is_active).length}</p>
              <p className="text-xs text-muted-foreground truncate">Active Zones</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Plus className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{locations.length}</p>
              <p className="text-xs text-muted-foreground truncate">Saved Locations</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <Map className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{zones.filter(z => z.zone_type === "restricted").length}</p>
              <p className="text-xs text-muted-foreground truncate">Restricted Zones</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Map View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] rounded-lg bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Map className="h-12 w-12 mx-auto mb-2" />
                <p>Interactive map with service zones</p>
                <p className="text-sm">Add Leaflet/Google Maps for visual zone editing</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Service Zones</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openZoneDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No zones defined
                    </TableCell>
                  </TableRow>
                ) : (
                  zones.map((zone) => (
                    <TableRow key={zone.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">{zone.name}</TableCell>
                      <TableCell>
                        <Badge variant={zone.zone_type === "restricted" ? "destructive" : "secondary"}>
                          {zone.zone_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={zone.is_active ? "success" : "secondary"}>
                          {zone.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openZoneDialog(zone)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openZoneDialog(zone)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => {
                                setSelectedItem(zone)
                                setDialogType("delete-zone")
                              }}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Saved Locations</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openLocationDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No locations saved
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((loc) => (
                    <TableRow key={loc.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">{loc.name}</TableCell>
                      <TableCell><Badge variant="secondary">{loc.location_type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={loc.is_active ? "success" : "secondary"}>
                          {loc.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openLocationDialog(loc)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openLocationDialog(loc)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => {
                                setSelectedItem(loc)
                                setDialogType("delete-location")
                              }}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete
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
          </CardContent>
        </Card>
      </div>

      {/* Zone Dialog */}
      <Dialog open={dialogType === "zone"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Zone" : "Create Zone"}</DialogTitle>
            <DialogDescription>Define a service or restricted zone</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Zone Name *</label>
              <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Downtown Area" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={formData.zone_type || "both"} onValueChange={(v) => setFormData({ ...formData, zone_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup Only</SelectItem>
                    <SelectItem value="dropoff">Dropoff Only</SelectItem>
                    <SelectItem value="both">Pickup & Dropoff</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Priority</label>
                <Input type="number" value={formData.priority || 0} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={formData.is_active ? "active" : "inactive"} onValueChange={(v) => setFormData({ ...formData, is_active: v === "active" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSaveZone} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={dialogType === "location"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>Save a frequently used pickup/dropoff location</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Location Name *</label>
              <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Airport Terminal 1" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Address</label>
              <Input value={formData.address || ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Latitude</label>
                <Input type="number" step="any" value={formData.latitude || ""} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} placeholder="4.1755" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Longitude</label>
                <Input type="number" step="any" value={formData.longitude || ""} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} placeholder="73.5093" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={formData.location_type || "pickup"} onValueChange={(v) => setFormData({ ...formData, location_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="dropoff">Dropoff</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={formData.is_active ? "active" : "inactive"} onValueChange={(v) => setFormData({ ...formData, is_active: v === "active" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSaveLocation} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Zone Dialog */}
      <Dialog open={dialogType === "delete-zone"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Zone</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{selectedItem?.name}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteZone} disabled={saving}>{saving ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Location Dialog */}
      <Dialog open={dialogType === "delete-location"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{selectedItem?.name}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteLocation} disabled={saving}>{saving ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
