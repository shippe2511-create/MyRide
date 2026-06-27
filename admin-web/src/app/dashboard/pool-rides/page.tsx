"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Car, Users, MapPin, Clock, Play, Square, RefreshCw,
  ChevronRight, Armchair, AlertCircle, CheckCircle2, XCircle
} from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"

interface PooledTrip {
  id: string
  vehicle_id: string
  driver_id: string
  total_seats: number
  available_seats: number
  status: "active" | "completed" | "cancelled"
  started_at: string
  completed_at: string | null
  driver_name: string
  driver_avatar: string | null
  vehicle_number: string
  vehicle_model: string
  bookings_count: number
  stops_count: number
}

interface PoolBooking {
  id: string
  trip_id: string
  customer_id: string
  seats_booked: number
  pickup_name: string
  dropoff_name: string
  status: string
  created_at: string
  customer_name: string
  customer_phone: string
}

interface Vehicle {
  id: string
  vehicle_number: string
  vehicle_model: string
  capacity: number
  driver_id: string
  driver_name: string
  is_active: boolean
}

export default function PoolRidesPage() {
  const supabase = createClient()
  const [trips, setTrips] = useState<PooledTrip[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedTrip, setSelectedTrip] = useState<PooledTrip | null>(null)
  const [tripBookings, setTripBookings] = useState<PoolBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("")
  const [capacityDialogOpen, setCapacityDialogOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [newCapacity, setNewCapacity] = useState<number>(6)

  useEffect(() => {
    loadData()

    // Real-time subscription
    const channel = supabase
      .channel('pool_rides_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pooled_trips' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_bookings' }, () => loadData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    const [tripsRes, vehiclesRes] = await Promise.all([
      supabase.from("pooled_trips").select(`
        *,
        driver:drivers!pooled_trips_driver_id_fkey(
          id,
          profile:profiles!drivers_profile_id_fkey(full_name, avatar_url)
        ),
        vehicle:vehicles!pooled_trips_vehicle_id_fkey(vehicle_number, vehicle_model)
      `).order("created_at", { ascending: false }),

      supabase.from("vehicles").select(`
        id, vehicle_number, vehicle_model, capacity, driver_id, is_active,
        driver:drivers!vehicles_driver_id_fkey(
          profile:profiles!drivers_profile_id_fkey(full_name)
        )
      `).eq("is_active", true)
    ])

    // Get booking counts for each trip
    const tripIds = (tripsRes.data || []).map(t => t.id)
    const bookingsRes = tripIds.length > 0
      ? await supabase.from("pool_bookings").select("trip_id").in("trip_id", tripIds)
      : { data: [] }

    const stopsRes = tripIds.length > 0
      ? await supabase.from("pool_stops").select("trip_id").in("trip_id", tripIds)
      : { data: [] }

    const bookingCounts: Record<string, number> = {}
    const stopCounts: Record<string, number> = {}

    ;(bookingsRes.data || []).forEach(b => {
      bookingCounts[b.trip_id] = (bookingCounts[b.trip_id] || 0) + 1
    })
    ;(stopsRes.data || []).forEach(s => {
      stopCounts[s.trip_id] = (stopCounts[s.trip_id] || 0) + 1
    })

    const formattedTrips: PooledTrip[] = (tripsRes.data || []).map(t => {
      const driver = Array.isArray(t.driver) ? t.driver[0] : t.driver
      const profile = driver?.profile
      const vehicle = Array.isArray(t.vehicle) ? t.vehicle[0] : t.vehicle

      return {
        id: t.id,
        vehicle_id: t.vehicle_id,
        driver_id: t.driver_id,
        total_seats: t.total_seats,
        available_seats: t.available_seats,
        status: t.status,
        started_at: t.started_at,
        completed_at: t.completed_at,
        driver_name: profile?.full_name || "Unknown",
        driver_avatar: profile?.avatar_url,
        vehicle_number: vehicle?.vehicle_number || "N/A",
        vehicle_model: vehicle?.vehicle_model || "Vehicle",
        bookings_count: bookingCounts[t.id] || 0,
        stops_count: stopCounts[t.id] || 0
      }
    })

    const formattedVehicles: Vehicle[] = (vehiclesRes.data || []).map(v => {
      const driver = Array.isArray(v.driver) ? v.driver[0] : v.driver
      const profileData = driver?.profile
      const profile = Array.isArray(profileData) ? profileData[0] : profileData
      return {
        id: v.id,
        vehicle_number: v.vehicle_number,
        vehicle_model: v.vehicle_model || "Vehicle",
        capacity: v.capacity || 6,
        driver_id: v.driver_id,
        driver_name: profile?.full_name || "Unassigned",
        is_active: v.is_active
      }
    })

    setTrips(formattedTrips)
    setVehicles(formattedVehicles)
    setLoading(false)
  }

  const loadTripBookings = async (tripId: string) => {
    const { data } = await supabase
      .from("pool_bookings")
      .select(`
        *,
        customer:profiles!pool_bookings_customer_id_fkey(full_name, phone)
      `)
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })

    const bookings: PoolBooking[] = (data || []).map(b => {
      const customer = Array.isArray(b.customer) ? b.customer[0] : b.customer
      return {
        id: b.id,
        trip_id: b.trip_id,
        customer_id: b.customer_id,
        seats_booked: b.seats_booked,
        pickup_name: b.pickup_name || "Pickup",
        dropoff_name: b.dropoff_name || "Dropoff",
        status: b.status,
        created_at: b.created_at,
        customer_name: customer?.full_name || "Customer",
        customer_phone: customer?.phone || ""
      }
    })

    setTripBookings(bookings)
  }

  const handleSelectTrip = (trip: PooledTrip) => {
    setSelectedTrip(trip)
    loadTripBookings(trip.id)
  }

  const handleStartTrip = async () => {
    if (!selectedVehicleId) {
      toast.error("Please select a vehicle")
      return
    }

    const vehicle = vehicles.find(v => v.id === selectedVehicleId)
    if (!vehicle) return

    const { data, error } = await supabase.rpc("start_pooled_trip", {
      p_vehicle_id: selectedVehicleId,
      p_driver_id: vehicle.driver_id
    })

    if (error || !data.success) {
      toast.error(data?.error || error?.message || "Failed to start trip")
    } else {
      toast.success("Pool trip started!")
      setCreateDialogOpen(false)
      setSelectedVehicleId("")
      loadData()
    }
  }

  const handleEndTrip = async (tripId: string) => {
    const { error } = await supabase
      .from("pooled_trips")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", tripId)

    if (error) {
      toast.error("Failed to end trip")
    } else {
      toast.success("Trip ended")
      loadData()
      setSelectedTrip(null)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    const { data, error } = await supabase.rpc("cancel_pool_booking", {
      p_booking_id: bookingId
    })

    if (error || !data.success) {
      toast.error(data?.error || error?.message || "Failed to cancel booking")
    } else {
      toast.success(`Booking cancelled, ${data.seats_returned} seats returned`)
      if (selectedTrip) loadTripBookings(selectedTrip.id)
      loadData()
    }
  }

  const handleUpdateCapacity = async () => {
    if (!editingVehicle) return

    const { error } = await supabase
      .from("vehicles")
      .update({ capacity: newCapacity })
      .eq("id", editingVehicle.id)

    if (error) {
      toast.error("Failed to update capacity")
    } else {
      toast.success("Vehicle capacity updated")
      setCapacityDialogOpen(false)
      setEditingVehicle(null)
      loadData()
    }
  }

  const filteredTrips = trips.filter(t => {
    if (filter === "active") return t.status === "active"
    if (filter === "completed") return t.status === "completed"
    return true
  })

  const activeTrips = trips.filter(t => t.status === "active")
  const totalSeatsInUse = activeTrips.reduce((acc, t) => acc + (t.total_seats - t.available_seats), 0)
  const totalSeatsAvailable = activeTrips.reduce((acc, t) => acc + t.available_seats, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonTable />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Armchair className="h-6 w-6" />
            Pool Rides
          </h1>
          <p className="text-muted-foreground">Manage seat-based ride pooling</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Play className="h-4 w-4 mr-2" />
            Start Pool Trip
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <Car className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeTrips.length}</p>
                <p className="text-sm text-muted-foreground">Active Trips</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-yellow-500/10">
                <Armchair className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSeatsInUse}</p>
                <p className="text-sm text-muted-foreground">Seats In Use</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Armchair className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSeatsAvailable}</p>
                <p className="text-sm text-muted-foreground">Seats Available</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-500/10">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeTrips.reduce((acc, t) => acc + t.bookings_count, 0)}</p>
                <p className="text-sm text-muted-foreground">Active Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trips List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pool Trips</CardTitle>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-center">Seats</TableHead>
                  <TableHead className="text-center">Bookings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No trips found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTrips.map((trip) => (
                    <TableRow
                      key={trip.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSelectTrip(trip)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{trip.vehicle_number}</p>
                          <p className="text-xs text-muted-foreground">{trip.vehicle_model}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={trip.driver_avatar || undefined} />
                            <AvatarFallback>{trip.driver_name[0]}</AvatarFallback>
                          </Avatar>
                          <span>{trip.driver_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={trip.available_seats > 0 ? "default" : "secondary"}>
                          {trip.total_seats - trip.available_seats}/{trip.total_seats}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{trip.bookings_count}</TableCell>
                      <TableCell>
                        <Badge variant={trip.status === "active" ? "default" : "secondary"}>
                          {trip.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatDate(trip.started_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Vehicle Capacities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle Capacities
            </CardTitle>
            <CardDescription>Set default seat capacity per vehicle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setEditingVehicle(vehicle)
                    setNewCapacity(vehicle.capacity)
                    setCapacityDialogOpen(true)
                  }}
                >
                  <div>
                    <p className="font-medium">{vehicle.vehicle_number}</p>
                    <p className="text-xs text-muted-foreground">{vehicle.driver_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Armchair className="h-4 w-4 text-muted-foreground" />
                    <span className="font-bold text-lg">{vehicle.capacity}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trip Details Dialog */}
      <Dialog open={!!selectedTrip} onOpenChange={() => setSelectedTrip(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trip Details</DialogTitle>
            <DialogDescription>
              {selectedTrip?.vehicle_number} - {selectedTrip?.driver_name}
            </DialogDescription>
          </DialogHeader>

          {selectedTrip && (
            <div className="space-y-4">
              {/* Seat status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <Armchair className="h-6 w-6" />
                  <div>
                    <p className="font-medium">Seat Status</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedTrip.total_seats - selectedTrip.available_seats} booked, {selectedTrip.available_seats} available
                    </p>
                  </div>
                </div>
                <Badge variant={selectedTrip.status === "active" ? "default" : "secondary"} className="text-lg px-4 py-1">
                  {selectedTrip.total_seats - selectedTrip.available_seats}/{selectedTrip.total_seats}
                </Badge>
              </div>

              {/* Bookings list */}
              <div>
                <h4 className="font-medium mb-2">Bookings ({tripBookings.length})</h4>
                {tripBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No bookings yet</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {tripBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            booking.status === "onboard" ? "bg-green-500" :
                            booking.status === "dropped" ? "bg-gray-400" :
                            booking.status === "cancelled" ? "bg-red-500" :
                            "bg-yellow-500"
                          }`} />
                          <div>
                            <p className="font-medium">{booking.customer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {booking.pickup_name} → {booking.dropoff_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{booking.seats_booked} seat{booking.seats_booked > 1 ? "s" : ""}</Badge>
                          <Badge variant={
                            booking.status === "onboard" ? "default" :
                            booking.status === "dropped" ? "secondary" :
                            booking.status === "cancelled" ? "destructive" :
                            "outline"
                          }>
                            {booking.status}
                          </Badge>
                          {booking.status !== "dropped" && booking.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleCancelBooking(booking.id)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                {selectedTrip.status === "active" && (
                  <Button variant="destructive" onClick={() => handleEndTrip(selectedTrip.id)}>
                    <Square className="h-4 w-4 mr-2" />
                    End Trip
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Start Trip Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Pool Trip</DialogTitle>
            <DialogDescription>Select a vehicle to start a new pool trip</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.filter(v => !activeTrips.some(t => t.vehicle_id === v.id)).map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.vehicle_number} - {vehicle.driver_name} ({vehicle.capacity} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedVehicleId && (
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  This will start a pool trip with{" "}
                  <span className="font-bold text-foreground">
                    {vehicles.find(v => v.id === selectedVehicleId)?.capacity || 6}
                  </span>{" "}
                  available seats.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStartTrip}>
              <Play className="h-4 w-4 mr-2" />
              Start Trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Capacity Dialog */}
      <Dialog open={capacityDialogOpen} onOpenChange={setCapacityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle Capacity</DialogTitle>
            <DialogDescription>
              Set the default seat capacity for {editingVehicle?.vehicle_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Seat Capacity</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={newCapacity}
                onChange={(e) => setNewCapacity(parseInt(e.target.value) || 6)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCapacityDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCapacity}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
