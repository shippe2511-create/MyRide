"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Car, MapPin, Users, Clock, CheckCircle, XCircle, Navigation, Phone, Search, Download,
  Loader2, MoreHorizontal, Eye, RefreshCw, Activity, Gauge, ChevronLeft, ChevronRight
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"

const LiveDriverMap = dynamic(() => import("@/components/live-driver-map").then(mod => mod.LiveDriverMap), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-muted/50"><Loader2 className="h-8 w-8 animate-spin" /></div>
})

interface DriverLocation {
  id: string
  driver_id: string
  lat: number
  lng: number
  heading: number
  speed: number
  is_online: boolean
  last_updated: string
  driver?: {
    id: string
    full_name: string
    phone: string | null
    avatar_url: string | null
  }
}

interface Ride {
  id: string
  pickup_name: string
  dropoff_name: string
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  status: string
  scheduled_time: string | null
  accepted_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  distance_km: number | null
  duration_minutes: number | null
  fare_amount: number | null
  created_at: string
  customer: {
    id: string
    full_name: string
    phone: string | null
    avatar_url: string | null
  } | null
  driver_id: string | null
}

export default function RidesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rides, setRides] = useState<Ride[]>([])
  const [activeRides, setActiveRides] = useState<Ride[]>([])
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([])
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "cancel" | "assign" | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeTab, setActiveTab] = useState("active")
  const [availableDrivers, setAvailableDrivers] = useState<Array<{id: string, profile_id: string, full_name: string, is_online: boolean}>>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>("")
  const pageSize = 10

  // Stats
  const [stats, setStats] = useState({
    totalRides: 0,
    activeRides: 0,
    completedToday: 0,
    cancelledToday: 0,
    onlineDrivers: 0
  })

  useEffect(() => {
    loadData()
    const interval = setInterval(loadDriverLocations, 5000) // Refresh every 5 seconds for live tracking

    // Subscribe to real-time updates for driver locations
    const channel = supabase
      .channel('driver_locations_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
        loadDriverLocations()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [currentPage, statusFilter])

  const loadData = async () => {
    setLoading(true)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const start = (currentPage - 1) * pageSize
    const end = start + pageSize - 1

    // Build query
    let query = supabase
      .from("rides")
      .select(`*, customer:profiles!rides_customer_id_fkey(id, full_name, phone, avatar_url)`, { count: "exact" })
      .order("created_at", { ascending: false })

    if (statusFilter === "active") {
      query = query.in("status", ["pending", "accepted", "arrived", "in_progress"])
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }

    if (search) {
      query = query.or(`pickup_name.ilike.%${search}%,dropoff_name.ilike.%${search}%`)
    }

    query = query.range(start, end)

    const [ridesRes, activeRes, completedRes, cancelledRes, locationsRes] = await Promise.all([
      query,
      supabase.from("rides").select("*", { count: "exact", head: true }).in("status", ["pending", "accepted", "arrived", "in_progress"]),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", today.toISOString()),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "cancelled").gte("cancelled_at", today.toISOString()),
      supabase.from("driver_locations").select(`
        id,
        driver_id,
        lat,
        lng,
        heading,
        speed,
        is_online,
        last_updated,
        driver:drivers!driver_locations_driver_id_fkey(
          id,
          profile:profiles!drivers_profile_id_fkey(
            id,
            full_name,
            phone,
            avatar_url
          )
        )
      `).eq("is_online", true)
    ])

    // Get active rides with full details
    const { data: activeRidesData } = await supabase
      .from("rides")
      .select(`*, customer:profiles!rides_customer_id_fkey(id, full_name, phone, avatar_url)`)
      .in("status", ["pending", "accepted", "arrived", "in_progress"])
      .order("created_at", { ascending: false })

    setRides(ridesRes.data || [])
    setTotalCount(ridesRes.count || 0)
    setActiveRides(activeRidesData || [])

    // Map driver locations data to expected structure
    if (locationsRes.data) {
      const mapped: DriverLocation[] = locationsRes.data.map((loc: any) => ({
        id: loc.id,
        driver_id: loc.driver_id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading || 0,
        speed: loc.speed || 0,
        is_online: loc.is_online ?? true,
        last_updated: loc.last_updated || new Date().toISOString(),
        driver: loc.driver ? {
          id: loc.driver.id,
          full_name: loc.driver.profile?.full_name || 'Unknown',
          phone: loc.driver.profile?.phone || null,
          avatar_url: loc.driver.profile?.avatar_url || null
        } : undefined
      }))
      setDriverLocations(mapped)
    } else {
      setDriverLocations([])
    }

    setStats({
      totalRides: ridesRes.count || 0,
      activeRides: activeRes.count || 0,
      completedToday: completedRes.count || 0,
      cancelledToday: cancelledRes.count || 0,
      onlineDrivers: locationsRes.data?.length || 0
    })

    setLoading(false)
  }

  const loadDriverLocations = async () => {
    // Query driver_locations table with driver and profile info
    const { data } = await supabase
      .from("driver_locations")
      .select(`
        id,
        driver_id,
        lat,
        lng,
        heading,
        speed,
        is_online,
        last_updated,
        driver:drivers!driver_locations_driver_id_fkey(
          id,
          profile:profiles!drivers_profile_id_fkey(
            id,
            full_name,
            phone,
            avatar_url
          )
        )
      `)
      .eq("is_online", true)

    if (data) {
      // Map the nested structure to flat driver info
      const mapped: DriverLocation[] = data.map(loc => ({
        id: loc.id,
        driver_id: loc.driver_id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading || 0,
        speed: loc.speed || 0,
        is_online: loc.is_online ?? true,
        last_updated: loc.last_updated || new Date().toISOString(),
        driver: loc.driver ? {
          id: (loc.driver as any).id,
          full_name: (loc.driver as any).profile?.full_name || 'Unknown',
          phone: (loc.driver as any).profile?.phone || null,
          avatar_url: (loc.driver as any).profile?.avatar_url || null
        } : undefined
      }))
      setDriverLocations(mapped)
    }
  }

  const handleCancel = async () => {
    if (!selectedRide) return
    setSaving(true)

    const { error } = await supabase
      .from("rides")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason || "Cancelled by admin"
      })
      .eq("id", selectedRide.id)

    if (error) {
      toast.error("Failed to cancel ride")
    } else {
      toast.success("Ride cancelled")
      setDialogType(null)
      setCancelReason("")
      loadData()
    }
    setSaving(false)
  }

  const loadAvailableDrivers = async () => {
    const { data } = await supabase
      .from("drivers")
      .select(`id, profile_id, is_online, profile:profiles!drivers_profile_id_fkey(full_name)`)
      .order("is_online", { ascending: false })

    if (data) {
      setAvailableDrivers(data.map(d => ({
        id: d.id,
        profile_id: d.profile_id,
        full_name: (d.profile as any)?.full_name || "Unknown Driver",
        is_online: d.is_online || false
      })))
    }
  }

  const handleAssignDriver = async () => {
    if (!selectedRide || !selectedDriverId) return
    setSaving(true)

    const { error } = await supabase
      .from("rides")
      .update({
        driver_id: selectedDriverId,
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", selectedRide.id)

    if (error) {
      toast.error("Failed to assign driver")
    } else {
      toast.success("Driver assigned successfully")
      setDialogType(null)
      setSelectedDriverId("")
      loadData()
    }
    setSaving(false)
  }

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    })
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return "Just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const getInitials = (name: string) => name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="success">Completed</Badge>
      case "in_progress": return <Badge className="bg-blue-500">In Progress</Badge>
      case "accepted": return <Badge className="bg-cyan-500">Accepted</Badge>
      case "arrived": return <Badge className="bg-purple-500">Arrived</Badge>
      case "pending": return <Badge variant="warning">Pending</Badge>
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  const exportCSV = () => {
    const headers = ["ID", "Customer", "Pickup", "Dropoff", "Status", "Distance", "Created"]
    const rows = rides.map(r => [
      r.id.slice(0, 8),
      r.customer?.full_name || "-",
      r.pickup_name,
      r.dropoff_name,
      r.status,
      r.distance_km ? `${r.distance_km}km` : "-",
      formatDateTime(r.created_at)
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rides.csv"
    a.click()
  }

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
          <h1 className="text-3xl font-bold">Rides</h1>
          <p className="text-muted-foreground">
            Monitor live rides, track drivers, and manage trip history
          </p>
        </div>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Rides</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.activeRides}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.completedToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled Today</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.cancelledToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online Drivers</CardTitle>
            <Car className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.onlineDrivers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Rides</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRides}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="map" className="gap-2">
            <Navigation className="h-4 w-4" />
            Live Map
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <Activity className="h-4 w-4" />
            Live Rides ({activeRides.length})
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2">
            <Car className="h-4 w-4" />
            Online Drivers ({driverLocations.length})
          </TabsTrigger>
          <TabsTrigger value="history">All Rides</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Live Driver Tracking</CardTitle>
                  <CardDescription>Real-time location of all active drivers</CardDescription>
                </div>
                <Badge variant="outline" className="gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                  {driverLocations.length} Online
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] rounded-lg overflow-hidden border">
                <LiveDriverMap
                  driverLocations={driverLocations}
                  activeRides={activeRides}
                />
              </div>
              {activeRides.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {activeRides.map((ride) => {
                    const driverLoc = driverLocations.find(d => d.driver_id === ride.driver_id)
                    return (
                      <div key={ride.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <div className={`h-3 w-3 rounded-full ${driverLoc ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{ride.customer?.full_name || 'Customer'}</p>
                          <p className="text-xs text-muted-foreground truncate">{ride.pickup_name} → {ride.dropoff_name}</p>
                        </div>
                        {driverLoc && (
                          <div className="text-right">
                            <p className="text-sm font-medium">{driverLoc.speed?.toFixed(0) || 0} km/h</p>
                            <p className="text-xs text-muted-foreground">{formatTime(driverLoc.last_updated)}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Rides</CardTitle>
              <CardDescription>Real-time view of ongoing trips</CardDescription>
            </CardHeader>
            <CardContent>
              {activeRides.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active rides at the moment</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {activeRides.map((ride) => {
                    const driverLoc = driverLocations.find(d => d.driver_id === ride.driver_id)
                    return (
                      <Card key={ride.id} className="border-2">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            {statusBadge(ride.status)}
                            <span className="text-xs text-muted-foreground">{formatTime(ride.created_at)}</span>
                          </div>

                          <div className="space-y-2 mb-3">
                            <div className="flex items-center gap-2 text-sm">
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              <span className="truncate">{ride.pickup_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              <span className="truncate">{ride.dropoff_name}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={ride.customer?.avatar_url || undefined} />
                                <AvatarFallback>{getInitials(ride.customer?.full_name || "")}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{ride.customer?.full_name}</p>
                                <p className="text-xs text-muted-foreground">{ride.customer?.phone}</p>
                              </div>
                            </div>
                            {ride.customer?.phone && (
                              <Button size="icon" variant="ghost">
                                <Phone className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          {driverLoc && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={driverLoc.driver?.avatar_url || undefined} />
                                    <AvatarFallback className="text-xs">{getInitials(driverLoc.driver?.full_name || "")}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">{driverLoc.driver?.full_name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Gauge className="h-3 w-3" />
                                  {driverLoc.speed?.toFixed(0) || 0} km/h
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Last update: {formatTime(driverLoc.last_updated)}
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2 mt-3">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                              setSelectedRide(ride)
                              setDialogType("view")
                            }}>
                              <Eye className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                            {ride.status === "pending" && (
                              <Button size="sm" variant="default" className="flex-1" onClick={() => {
                                setSelectedRide(ride)
                                loadAvailableDrivers()
                                setDialogType("assign")
                              }}>
                                <Users className="h-3 w-3 mr-1" />
                                Assign
                              </Button>
                            )}
                            {!["completed", "cancelled"].includes(ride.status) && (
                              <Button size="sm" variant="destructive" className="flex-1" onClick={() => {
                                setSelectedRide(ride)
                                setDialogType("cancel")
                              }}>
                                <XCircle className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers">
          <Card>
            <CardHeader>
              <CardTitle>Online Drivers</CardTitle>
              <CardDescription>Drivers currently available for rides</CardDescription>
            </CardHeader>
            <CardContent>
              {driverLocations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No drivers online</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Speed</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Last Update</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverLocations.map((loc) => (
                      <TableRow key={loc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={loc.driver?.avatar_url || undefined} />
                              <AvatarFallback>{getInitials(loc.driver?.full_name || "")}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{loc.driver?.full_name}</p>
                              <p className="text-xs text-muted-foreground">{loc.driver?.phone}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="success" className="gap-1">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            Online
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Gauge className="h-4 w-4 text-muted-foreground" />
                            {loc.speed?.toFixed(0) || 0} km/h
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{loc.lat?.toFixed(4)}, {loc.lng?.toFixed(4)}</p>
                            <p className="text-xs text-muted-foreground">Heading: {loc.heading?.toFixed(0) || 0}°</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatTime(loc.last_updated)}</span>
                        </TableCell>
                        <TableCell>
                          {loc.driver?.phone && (
                            <Button size="icon" variant="ghost">
                              <Phone className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ride History</CardTitle>
                  <CardDescription>All rides in the system</CardDescription>
                </div>
                <Button variant="outline" onClick={exportCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by location..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadData()}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rides.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No rides found
                      </TableCell>
                    </TableRow>
                  ) : (
                    rides.map((ride) => (
                      <TableRow key={ride.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={ride.customer?.avatar_url || undefined} />
                              <AvatarFallback>{getInitials(ride.customer?.full_name || "")}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{ride.customer?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{ride.customer?.phone || "-"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              <span className="max-w-[150px] truncate">{ride.pickup_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              <span className="max-w-[150px] truncate">{ride.dropoff_name}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(ride.status)}</TableCell>
                        <TableCell>{ride.distance_km ? `${ride.distance_km} km` : "-"}</TableCell>
                        <TableCell>
                          <span className="text-sm">{formatDateTime(ride.created_at)}</span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => {
                                setSelectedRide(ride)
                                setDialogType("view")
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {ride.status === "pending" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => {
                                    setSelectedRide(ride)
                                    loadAvailableDrivers()
                                    setDialogType("assign")
                                  }}>
                                    <Users className="mr-2 h-4 w-4" />
                                    Assign Driver
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!["completed", "cancelled"].includes(ride.status) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onSelect={() => {
                                    setSelectedRide(ride)
                                    setDialogType("cancel")
                                  }}>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Ride
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={dialogType === "cancel"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Ride</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this ride? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Keep Ride</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={saving}>
              {saving ? "Cancelling..." : "Cancel Ride"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={dialogType === "view"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ride Details</DialogTitle>
          </DialogHeader>
          {selectedRide && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ride ID</span>
                <span className="font-mono text-sm">{selectedRide.id.slice(0, 8)}...</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-3 w-3 rounded-full bg-green-500" />
                  <div>
                    <p className="font-medium">{selectedRide.pickup_name}</p>
                    <p className="text-sm text-muted-foreground">Pickup</p>
                  </div>
                </div>
                <div className="ml-1.5 h-6 w-0.5 bg-border" />
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-3 w-3 rounded-full bg-red-500" />
                  <div>
                    <p className="font-medium">{selectedRide.dropoff_name}</p>
                    <p className="text-sm text-muted-foreground">Dropoff</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {statusBadge(selectedRide.status)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{selectedRide.customer?.full_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{selectedRide.customer?.phone || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Distance</span>
                  <span>{selectedRide.distance_km ? `${selectedRide.distance_km} km` : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{selectedRide.duration_minutes ? `${selectedRide.duration_minutes} min` : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDateTime(selectedRide.created_at)}</span>
                </div>
                {selectedRide.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{formatDateTime(selectedRide.completed_at)}</span>
                  </div>
                )}
                {selectedRide.cancel_reason && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cancel Reason</span>
                    <span className="text-destructive">{selectedRide.cancel_reason}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Driver Dialog */}
      <Dialog open={dialogType === "assign"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Driver</DialogTitle>
            <DialogDescription>
              Select a driver to assign to this ride. Online drivers are shown first.
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a driver" />
            </SelectTrigger>
            <SelectContent>
              {availableDrivers.map(driver => (
                <SelectItem key={driver.id} value={driver.id}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${driver.is_online ? "bg-green-500" : "bg-gray-400"}`} />
                    {driver.full_name}
                    {driver.is_online && <span className="text-xs text-muted-foreground">(Online)</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleAssignDriver} disabled={saving || !selectedDriverId}>
              {saving ? "Assigning..." : "Assign Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
