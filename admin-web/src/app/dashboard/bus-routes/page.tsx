"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Edit, Trash2, MapPin, GripVertical, Loader2, Route, Bus } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"

interface BusRoute {
  id: string
  name: string
  origin_label: string
  destination_label: string
  is_active: boolean
  created_at: string
  stops_count?: number
}

interface RouteStop {
  id: string
  route_id: string
  stop_name: string
  latitude: number
  longitude: number
  stop_order: number
  is_pickup: boolean
  is_dropoff: boolean
}

export default function BusRoutesPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [showRouteDialog, setShowRouteDialog] = useState(false)
  const [showStopsDialog, setShowStopsDialog] = useState(false)
  const [editingRoute, setEditingRoute] = useState<BusRoute | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null)
  const [stops, setStops] = useState<RouteStop[]>([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [saving, setSaving] = useState(false)

  const [routeForm, setRouteForm] = useState({
    name: "",
    origin_label: "",
    destination_label: "",
  })

  const [stopForm, setStopForm] = useState({
    stop_name: "",
    latitude: "",
    longitude: "",
  })
  const [showAddStop, setShowAddStop] = useState(false)
  const [editingStop, setEditingStop] = useState<RouteStop | null>(null)

  useEffect(() => {
    loadRoutes()
  }, [])

  const loadRoutes = async () => {
    setLoading(true)
    const { data: routesData } = await supabase
      .from("bus_routes")
      .select("*")
      .order("name")

    if (routesData) {
      // Get stops count for each route
      const routesWithCounts = await Promise.all(
        routesData.map(async (route) => {
          const { count } = await supabase
            .from("route_stops")
            .select("*", { count: "exact", head: true })
            .eq("route_id", route.id)
          return { ...route, stops_count: count || 0 }
        })
      )
      setRoutes(routesWithCounts)
    }
    setLoading(false)
  }

  const loadStops = async (routeId: string) => {
    setLoadingStops(true)
    const { data } = await supabase
      .from("route_stops")
      .select("*")
      .eq("route_id", routeId)
      .order("stop_order")
    if (data) setStops(data)
    setLoadingStops(false)
  }

  const openRouteDialog = (route?: BusRoute) => {
    if (route) {
      setEditingRoute(route)
      setRouteForm({
        name: route.name,
        origin_label: route.origin_label,
        destination_label: route.destination_label,
      })
    } else {
      setEditingRoute(null)
      setRouteForm({ name: "", origin_label: "", destination_label: "" })
    }
    setShowRouteDialog(true)
  }

  const saveRoute = async () => {
    if (!routeForm.name || !routeForm.origin_label || !routeForm.destination_label) {
      toast.error("Please fill in all fields")
      return
    }

    setSaving(true)
    if (editingRoute) {
      const { error } = await supabase
        .from("bus_routes")
        .update(routeForm)
        .eq("id", editingRoute.id)
      if (error) {
        toast.error("Failed to update route")
      } else {
        toast.success("Route updated")
        setShowRouteDialog(false)
        loadRoutes()
      }
    } else {
      const { error } = await supabase
        .from("bus_routes")
        .insert(routeForm)
      if (error) {
        toast.error("Failed to create route")
      } else {
        toast.success("Route created")
        setShowRouteDialog(false)
        loadRoutes()
      }
    }
    setSaving(false)
  }

  const toggleRouteActive = async (route: BusRoute) => {
    const { error } = await supabase
      .from("bus_routes")
      .update({ is_active: !route.is_active })
      .eq("id", route.id)
    if (!error) {
      setRoutes(routes.map(r => r.id === route.id ? { ...r, is_active: !r.is_active } : r))
    }
  }

  const deleteRoute = async (route: BusRoute) => {
    if (!confirm(`Delete route "${route.name}"? This will also delete all stops and schedules.`)) return
    const { error } = await supabase.from("bus_routes").delete().eq("id", route.id)
    if (error) {
      toast.error("Failed to delete route")
    } else {
      toast.success("Route deleted")
      loadRoutes()
    }
  }

  const openStopsDialog = (route: BusRoute) => {
    setSelectedRoute(route)
    loadStops(route.id)
    setShowStopsDialog(true)
  }

  const saveStop = async () => {
    if (!selectedRoute || !stopForm.stop_name || !stopForm.latitude || !stopForm.longitude) {
      toast.error("Please fill in all fields")
      return
    }

    setSaving(true)
    const lat = parseFloat(stopForm.latitude)
    const lng = parseFloat(stopForm.longitude)

    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Invalid coordinates")
      setSaving(false)
      return
    }

    if (editingStop) {
      const { error } = await supabase
        .from("route_stops")
        .update({
          stop_name: stopForm.stop_name,
          latitude: lat,
          longitude: lng,
        })
        .eq("id", editingStop.id)
      if (error) {
        toast.error("Failed to update stop")
      } else {
        toast.success("Stop updated")
        setShowAddStop(false)
        setEditingStop(null)
        loadStops(selectedRoute.id)
      }
    } else {
      const nextOrder = stops.length > 0 ? Math.max(...stops.map(s => s.stop_order)) + 1 : 1
      const { error } = await supabase
        .from("route_stops")
        .insert({
          route_id: selectedRoute.id,
          stop_name: stopForm.stop_name,
          latitude: lat,
          longitude: lng,
          stop_order: nextOrder,
        })
      if (error) {
        toast.error("Failed to add stop")
      } else {
        toast.success("Stop added")
        setShowAddStop(false)
        loadStops(selectedRoute.id)
        loadRoutes()
      }
    }
    setStopForm({ stop_name: "", latitude: "", longitude: "" })
    setSaving(false)
  }

  const deleteStop = async (stop: RouteStop) => {
    if (!selectedRoute) return
    const { error } = await supabase.from("route_stops").delete().eq("id", stop.id)
    if (!error) {
      toast.success("Stop deleted")
      loadStops(selectedRoute.id)
      loadRoutes()
    }
  }

  const moveStop = async (stop: RouteStop, direction: "up" | "down") => {
    if (!selectedRoute) return
    const currentIndex = stops.findIndex(s => s.id === stop.id)
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= stops.length) return

    const swapStop = stops[swapIndex]
    await supabase.from("route_stops").update({ stop_order: swapStop.stop_order }).eq("id", stop.id)
    await supabase.from("route_stops").update({ stop_order: stop.stop_order }).eq("id", swapStop.id)
    loadStops(selectedRoute.id)
  }

  const openEditStop = (stop: RouteStop) => {
    setEditingStop(stop)
    setStopForm({
      stop_name: stop.stop_name,
      latitude: stop.latitude.toString(),
      longitude: stop.longitude.toString(),
    })
    setShowAddStop(true)
  }

  return (
    <PermissionGate permission="settings:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bus className="h-6 w-6" />
              Bus Routes
            </h1>
            <p className="text-muted-foreground">Manage fixed shuttle routes and stops</p>
          </div>
          <Button onClick={() => openRouteDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Route
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Routes</CardTitle>
            <CardDescription>Configure routes for scheduled bus/shuttle service</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : routes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No routes configured. Add your first route to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route Name</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Stops</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell className="font-medium">{route.name}</TableCell>
                      <TableCell>{route.origin_label}</TableCell>
                      <TableCell>{route.destination_label}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openStopsDialog(route)}>
                          <MapPin className="h-4 w-4 mr-1" />
                          {route.stops_count || 0} stops
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={route.is_active}
                          onCheckedChange={() => toggleRouteActive(route)}
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
                            <DropdownMenuItem onClick={() => openRouteDialog(route)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openStopsDialog(route)}>
                              <MapPin className="h-4 w-4 mr-2" />
                              Manage Stops
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteRoute(route)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Route Dialog */}
        <Dialog open={showRouteDialog} onOpenChange={setShowRouteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRoute ? "Edit Route" : "Add Route"}</DialogTitle>
              <DialogDescription>Configure the route details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Route Name</label>
                <Input
                  value={routeForm.name}
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                  placeholder="e.g., R1 WSS to ATC"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Origin</label>
                <Input
                  value={routeForm.origin_label}
                  onChange={(e) => setRouteForm({ ...routeForm, origin_label: e.target.value })}
                  placeholder="e.g., WSS Terminal"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination</label>
                <Input
                  value={routeForm.destination_label}
                  onChange={(e) => setRouteForm({ ...routeForm, destination_label: e.target.value })}
                  placeholder="e.g., ATC Building"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRouteDialog(false)}>Cancel</Button>
              <Button onClick={saveRoute} disabled={saving}>
                {saving ? "Saving..." : editingRoute ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Stops Dialog */}
        <Dialog open={showStopsDialog} onOpenChange={setShowStopsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Manage Stops - {selectedRoute?.name}</DialogTitle>
              <DialogDescription>
                {selectedRoute?.origin_label} → {selectedRoute?.destination_label}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {loadingStops ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : stops.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No stops added yet</p>
              ) : (
                <div className="space-y-2">
                  {stops.map((stop, index) => (
                    <div key={stop.id} className="flex items-center gap-2 p-3 border rounded-lg">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStop(stop, "up")}
                          disabled={index === 0}
                        >
                          <span className="text-xs">▲</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveStop(stop, "down")}
                          disabled={index === stops.length - 1}
                        >
                          <span className="text-xs">▼</span>
                        </Button>
                      </div>
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {stop.stop_order}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{stop.stop_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEditStop(stop)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteStop(stop)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {showAddStop ? (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">{editingStop ? "Edit Stop" : "Add Stop"}</h4>
                  <Input
                    value={stopForm.stop_name}
                    onChange={(e) => setStopForm({ ...stopForm, stop_name: e.target.value })}
                    placeholder="Stop name"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={stopForm.latitude}
                      onChange={(e) => setStopForm({ ...stopForm, latitude: e.target.value })}
                      placeholder="Latitude"
                      type="number"
                      step="any"
                    />
                    <Input
                      value={stopForm.longitude}
                      onChange={(e) => setStopForm({ ...stopForm, longitude: e.target.value })}
                      placeholder="Longitude"
                      type="number"
                      step="any"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveStop} disabled={saving} size="sm">
                      {saving ? "Saving..." : editingStop ? "Update Stop" : "Add Stop"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddStop(false)
                        setEditingStop(null)
                        setStopForm({ stop_name: "", latitude: "", longitude: "" })
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddStop(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stop
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStopsDialog(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
