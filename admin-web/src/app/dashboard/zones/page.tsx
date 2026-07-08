"use client"

import { useState, useEffect, useRef } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Map, Download, CheckSquare } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionGate } from "@/components/permission-gate"
import { ZoneMap } from "@/components/zone-map"
import { LocationPicker } from "@/components/location-picker"

interface Zone {
  id: string
  name: string
  zone_type: string
  priority: number
  is_active: boolean
  created_at: string
  boundary_coords?: number[][]
}

interface Location {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  location_type: string
  is_active: boolean
}

export default function ZonesPage() {
  const supabase = createClient()
  const [zones, setZones] = useState<Zone[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<"zone" | "location" | "delete-zone" | "delete-location" | "bulk-delete-zones" | "bulk-delete-locations" | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({})
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [pendingCoords, setPendingCoords] = useState<number[][] | null>(null)
  const [serviceAreaRadius, setServiceAreaRadius] = useState(5000)
  const [serviceAreaCenter, setServiceAreaCenter] = useState({ lat: 4.1755, lng: 73.5093 })
  const [rideHeatmapData, setRideHeatmapData] = useState<{ lat: number; lng: number }[]>([])
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set())
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set())

  const isSavingRef = useRef(false)

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel('zones_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_zones' }, () => {
        if (!isSavingRef.current) loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        if (!isSavingRef.current) loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    const [zonesRes, locationsRes, settingsRes, ridesRes] = await Promise.all([
      supabase.from("service_zones").select("id, name, zone_type, priority, is_active, created_at, boundary_coords").order("priority", { ascending: false }),
      supabase.from("locations").select("*").order("name", { ascending: true }),
      supabase.from("app_settings").select("service_area_radius, service_area_center_lat, service_area_center_lng").limit(1).maybeSingle(),
      supabase.from("rides").select("pickup_lat, pickup_lng, dropoff_lat, dropoff_lng").not("pickup_lat", "is", null).limit(500),
    ])
    setZones(zonesRes.data || [])
    setLocations(locationsRes.data || [])
    if (settingsRes.data) {
      if (settingsRes.data.service_area_radius) setServiceAreaRadius(settingsRes.data.service_area_radius)
      if (settingsRes.data.service_area_center_lat && settingsRes.data.service_area_center_lng) {
        setServiceAreaCenter({ lat: settingsRes.data.service_area_center_lat, lng: settingsRes.data.service_area_center_lng })
      }
    }
    // Build heatmap data from ride pickup/dropoff points
    const heatmapPoints: { lat: number; lng: number }[] = []
    ridesRes.data?.forEach(r => {
      if (r.pickup_lat && r.pickup_lng) heatmapPoints.push({ lat: r.pickup_lat, lng: r.pickup_lng })
      if (r.dropoff_lat && r.dropoff_lng) heatmapPoints.push({ lat: r.dropoff_lat, lng: r.dropoff_lng })
    })
    setRideHeatmapData(heatmapPoints)
    setLoading(false)
  }

  const handleZoneCreate = (coordinates: number[][]) => {
    setPendingCoords(coordinates)
    setFormData({
      name: "",
      zone_type: "pickup",
      priority: 0,
      is_active: true
    })
    setDialogType("zone")
  }

  const handleZoneUpdate = async (zoneId: string, coordinates: number[][]) => {
    const { error } = await supabase
      .from("service_zones")
      .update({ boundary_coords: coordinates })
      .eq("id", zoneId)

    if (error) {
      toast.error("Failed to update zone boundary")
    } else {
      toast.success("Zone boundary updated")
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, boundary_coords: coordinates } : z))
    }
  }

  const handleServiceAreaChange = async (radius: number, center: { lat: number; lng: number }) => {
    const { error } = await supabase
      .from("app_settings")
      .update({
        service_area_radius: radius,
        service_area_center_lat: center.lat,
        service_area_center_lng: center.lng
      })
      .eq("id", "default")

    if (error) {
      toast.error("Failed to save service area")
    } else {
      setServiceAreaRadius(radius)
      setServiceAreaCenter(center)
      toast.success(`Service area updated to ${(radius / 1000).toFixed(1)} km`)
    }
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
      lat: location?.lat || "",
      lng: location?.lng || "",
      location_type: location?.location_type || "both",
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

    const payload: any = {
      name: formData.name,
      zone_type: formData.zone_type,
      priority: parseInt(formData.priority) || 0,
      is_active: formData.is_active
    }

    // Include coordinates if drawing a new zone
    if (pendingCoords) {
      payload.boundary_coords = pendingCoords
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
    setPendingCoords(null)
    setSelectedZone(null)
  }

  const handleSaveLocation = async () => {
    if (!formData.name.trim()) {
      toast.error("Location name is required")
      return
    }

    // Validate coordinates if provided
    const lat = parseFloat(formData.lat)
    const lng = parseFloat(formData.lng)

    if (formData.lat && (isNaN(lat) || lat < -90 || lat > 90)) {
      toast.error("Latitude must be between -90 and 90")
      return
    }
    if (formData.lng && (isNaN(lng) || lng < -180 || lng > 180)) {
      toast.error("Longitude must be between -180 and 180")
      return
    }

    setSaving(true)

    const payload = {
      name: formData.name,
      address: formData.address || null,
      lat: formData.lat ? lat : null,
      lng: formData.lng ? lng : null,
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

  const toggleZoneStatus = async (zone: Zone) => {
    isSavingRef.current = true
    // Optimistic update
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_active: !z.is_active } : z))

    const { error } = await supabase
      .from("service_zones")
      .update({ is_active: !zone.is_active })
      .eq("id", zone.id)

    if (error) {
      toast.error("Failed to update")
      // Revert on error
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_active: zone.is_active } : z))
    }
    setTimeout(() => { isSavingRef.current = false }, 500)
  }

  const toggleLocationStatus = async (loc: Location) => {
    isSavingRef.current = true
    // Optimistic update
    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_active: !l.is_active } : l))

    const { error } = await supabase
      .from("locations")
      .update({ is_active: !loc.is_active })
      .eq("id", loc.id)

    if (error) {
      toast.error("Failed to update")
      // Revert on error
      setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_active: loc.is_active } : l))
    }
    setTimeout(() => { isSavingRef.current = false }, 500)
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

  const handleBulkDeleteZones = async () => {
    if (selectedZoneIds.size === 0) return
    setDialogType(null)
    setSaving(true)
    const ids = Array.from(selectedZoneIds)
    const { error } = await supabase.from("service_zones").delete().in("id", ids)
    if (error) toast.error("Failed to delete zones")
    else {
      toast.success(`${ids.length} zone(s) deleted`)
      setZones(prev => prev.filter(z => !selectedZoneIds.has(z.id)))
      setSelectedZoneIds(new Set())
    }
    setSaving(false)
  }

  const handleBulkDeleteLocations = async () => {
    if (selectedLocationIds.size === 0) return
    setDialogType(null)
    setSaving(true)
    const ids = Array.from(selectedLocationIds)
    const { error } = await supabase.from("locations").delete().in("id", ids)
    if (error) toast.error("Failed to delete locations")
    else {
      toast.success(`${ids.length} location(s) deleted`)
      setLocations(prev => prev.filter(l => !selectedLocationIds.has(l.id)))
      setSelectedLocationIds(new Set())
    }
    setSaving(false)
  }

  const toggleZoneSelection = (id: string) => {
    setSelectedZoneIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const toggleLocationSelection = (id: string) => {
    setSelectedLocationIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const toggleAllZones = () => {
    if (selectedZoneIds.size === zones.length) {
      setSelectedZoneIds(new Set())
    } else {
      setSelectedZoneIds(new Set(zones.map(z => z.id)))
    }
  }

  const toggleAllLocations = () => {
    if (selectedLocationIds.size === locations.length) {
      setSelectedLocationIds(new Set())
    } else {
      setSelectedLocationIds(new Set(locations.map(l => l.id)))
    }
  }

  const exportCSV = () => {
    const headers = ["Name", "Type", "Priority", "Status", "Created At"]
    const rows = zones.map(z => [
      z.name,
      z.zone_type,
      z.priority,
      z.is_active ? "Active" : "Inactive",
      new Date(z.created_at).toLocaleDateString('en-US', { timeZone: 'Indian/Maldives' })
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
    <PermissionGate permission="zones:view">
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
            <ZoneMap
              zones={zones.map(z => ({
                ...z,
                coordinates: z.boundary_coords
              }))}
              locations={locations}
              selectedZone={selectedZone ? { ...selectedZone, coordinates: selectedZone.boundary_coords } : null}
              onZoneSelect={(z) => setSelectedZone(z ? zones.find(zone => zone.id === z.id) || null : null)}
              onZoneCreate={handleZoneCreate}
              onZoneUpdate={handleZoneUpdate}
              onZoneEdit={(z) => {
                const zone = zones.find(zone => zone.id === z.id)
                if (zone) openZoneDialog(zone)
              }}
              drawingMode={drawingMode}
              setDrawingMode={setDrawingMode}
              serviceAreaRadius={serviceAreaRadius}
              serviceAreaCenter={serviceAreaCenter}
              onServiceAreaChange={handleServiceAreaChange}
              rideHeatmapData={rideHeatmapData}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Service Zones</CardTitle>
            <div className="flex items-center gap-2">
              {selectedZoneIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={() => setDialogType("bulk-delete-zones")}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedZoneIds.size})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openZoneDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={zones.length > 0 && selectedZoneIds.size === zones.length}
                      onCheckedChange={toggleAllZones}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No zones defined
                    </TableCell>
                  </TableRow>
                ) : (
                  zones.map((zone) => (
                    <TableRow key={zone.id} className={`group hover:bg-muted/50 transition-colors ${selectedZoneIds.has(zone.id) ? "bg-muted/30" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedZoneIds.has(zone.id)}
                          onCheckedChange={() => toggleZoneSelection(zone.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{zone.name}</TableCell>
                      <TableCell>
                        <Badge variant={zone.zone_type === "restricted" ? "destructive" : "secondary"}>
                          {zone.zone_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={zone.is_active}
                          onCheckedChange={() => toggleZoneStatus(zone)}
                        />
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
            <div className="flex items-center gap-2">
              {selectedLocationIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={() => setDialogType("bulk-delete-locations")}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedLocationIds.size})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openLocationDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={locations.length > 0 && selectedLocationIds.size === locations.length}
                      onCheckedChange={toggleAllLocations}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No locations saved
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((loc) => (
                    <TableRow key={loc.id} className={`group hover:bg-muted/50 transition-colors ${selectedLocationIds.has(loc.id) ? "bg-muted/30" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLocationIds.has(loc.id)}
                          onCheckedChange={() => toggleLocationSelection(loc.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{loc.name}</TableCell>
                      <TableCell><Badge variant="secondary">{loc.location_type}</Badge></TableCell>
                      <TableCell>
                        <Switch
                          checked={loc.is_active}
                          onCheckedChange={() => toggleLocationStatus(loc)}
                        />
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
      <Dialog open={dialogType === "zone"} onOpenChange={() => { setDialogType(null); setPendingCoords(null); setSelectedZone(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Zone" : "Create Zone"}</DialogTitle>
            <DialogDescription>Define a service or restricted zone</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Zone Name *</label>
              <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Airport Zone" />
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
            {/* Boundary info */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Zone Boundary</label>
              {pendingCoords ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Map className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-500">Polygon drawn ({pendingCoords.length} points)</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setPendingCoords(null)}>Clear</Button>
                </div>
              ) : selectedItem?.boundary_coords ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Map className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-blue-500">Existing boundary ({selectedItem.boundary_coords.length} points)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
                  <Map className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">No boundary - use pencil tool on map to draw</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogType(null); setPendingCoords(null); setSelectedZone(null) }}>Cancel</Button>
            <Button onClick={handleSaveZone} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={dialogType === "location"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>Save a frequently used pickup/dropoff location</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Location Name *</label>
              <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Airport Terminal 1" />
            </div>

            {/* Location Picker with map */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Location</label>
              <LocationPicker
                latitude={formData.lat ? parseFloat(formData.lat) : null}
                longitude={formData.lng ? parseFloat(formData.lng) : null}
                address={formData.address || ""}
                onLocationChange={(lat, lng, addr) => setFormData({
                  ...formData,
                  lat: lat.toString(),
                  lng: lng.toString(),
                  address: addr || formData.address
                })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={formData.location_type || "both"} onValueChange={(v) => setFormData({ ...formData, location_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup Only</SelectItem>
                    <SelectItem value="dropoff">Dropoff Only</SelectItem>
                    <SelectItem value="both">Pickup & Dropoff</SelectItem>
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

      {/* Bulk Delete Zones Dialog */}
      <Dialog open={dialogType === "bulk-delete-zones"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedZoneIds.size} Zone(s)</DialogTitle>
            <DialogDescription>Are you sure you want to delete {selectedZoneIds.size} selected zone(s)? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteZones} disabled={saving}>{saving ? "Deleting..." : "Delete All"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Locations Dialog */}
      <Dialog open={dialogType === "bulk-delete-locations"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedLocationIds.size} Location(s)</DialogTitle>
            <DialogDescription>Are you sure you want to delete {selectedLocationIds.size} selected location(s)? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteLocations} disabled={saving}>{saving ? "Deleting..." : "Delete All"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
