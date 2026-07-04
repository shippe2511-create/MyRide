"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Radio, Car, Users, MapPin, Phone, RefreshCw, Loader2, Navigation,
  Coffee, Clock, Route, User, X, Filter, ChevronRight
} from "lucide-react"
import { SkeletonCard } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

const LiveDriverMap = dynamic(
  () => import("@/components/live-driver-map").then(mod => mod.LiveDriverMap),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> }
)

interface DriverLocation {
  id: string
  driver_id: string
  lat: number
  lng: number
  heading: number
  speed: number
  is_online: boolean
  is_on_break?: boolean
  break_type?: string
  last_updated: string
  driver?: {
    id: string
    profile_id: string
    is_on_break?: boolean
    break_type?: string
    vehicle?: {
      display_name: string | null
      plate_no: string | null
    }
    profile?: {
      full_name: string
      phone: string | null
      avatar_url: string | null
    }
  }
  activeRide?: {
    id: string
    status: string
    pickup_lat: number
    pickup_lng: number
    dropoff_lat: number
    dropoff_lng: number
    pickup_address?: string
    dropoff_address?: string
    customer?: {
      full_name: string
      phone: string | null
    }
  } | null
}

const supabase = createClient()

export default function TrackingPage() {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)

  const { data: driverLocations = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["tracking-page"],
    queryFn: async () => {
      // Get driver locations with driver info
      const { data: locations } = await supabase
        .from("driver_locations")
        .select(`
          *,
          driver:drivers!driver_locations_driver_id_fkey(
            id,
            profile_id,
            is_on_break,
            break_type,
            vehicle:vehicles(display_name, plate_no),
            profile:profiles!drivers_profile_id_fkey(full_name, phone, avatar_url)
          )
        `)
        .order("last_updated", { ascending: false })

      // Get active rides for these drivers with customer info
      const driverIds = locations?.map(l => l.driver_id).filter(Boolean) || []
      const { data: activeRides } = await supabase
        .from("rides")
        .select(`
          id, driver_id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
          pickup_address, dropoff_address,
          customer:profiles!rides_customer_id_fkey(full_name, phone)
        `)
        .in("driver_id", driverIds)
        .in("status", ["accepted", "arriving", "in_progress"])

      // Merge active rides into locations
      return (locations || []).map(loc => ({
        ...loc,
        activeRide: activeRides?.find(r => r.driver_id === loc.driver_id) || null
      }))
    },
    staleTime: 3 * 1000,
    refetchInterval: 3000,
  })

  // Realtime updates for driver locations
  useEffect(() => {
    const channel = supabase.channel('tracking_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => refetch())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const onlineDrivers = driverLocations.filter(d => d.is_online)

  const stats = {
    online: onlineDrivers.length,
    available: onlineDrivers.filter(d => !d.activeRide && !d.driver?.is_on_break).length,
    busy: onlineDrivers.filter(d => d.activeRide != null).length,
    onBreak: onlineDrivers.filter(d => d.driver?.is_on_break).length,
  }

  const filteredDrivers = onlineDrivers

  const selectedDriver = driverLocations.find(d => d.driver_id === selectedDriverId)

  const handleDriverClick = (driver: { id: string }) => {
    setSelectedDriverId(driver.id)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <div className="w-36 h-8 bg-muted rounded animate-pulse" />
          <div className="w-48 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-3 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="h-96 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <PermissionGate permission="tracking:view">
    <div className="space-y-4 h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-green-500 animate-pulse" />
            Live Tracking
          </h1>
          <p className="text-sm text-muted-foreground">Real-time driver locations and active rides</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-4">
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Car className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{stats.online}</p>
              <p className="text-xs text-muted-foreground truncate">Online</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Users className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.available}</p>
              <p className="text-xs text-muted-foreground truncate">Available</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Route className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{stats.busy}</p>
              <p className="text-xs text-muted-foreground truncate">On Ride</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 shrink-0">
              <Coffee className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-amber-500">{stats.onBreak}</p>
              <p className="text-xs text-muted-foreground truncate">On Break</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Map and Driver List */}
      <div className="grid grid-cols-4 gap-4 h-[calc(100%-200px)]">
        {/* Map */}
        <Card className="col-span-3 overflow-hidden">
          <LiveDriverMap
            drivers={filteredDrivers.map(d => ({
              id: d.driver_id,
              lat: d.lat,
              lng: d.lng,
              heading: d.heading,
              speed: d.speed,
              name: d.driver?.profile?.full_name || "Unknown",
              phone: d.driver?.profile?.phone || undefined,
              avatarUrl: d.driver?.profile?.avatar_url || undefined,
              vehicleNumber: d.driver?.vehicle?.display_name || d.driver?.vehicle?.plate_no || undefined,
              isOnline: d.is_online,
              isOnBreak: d.driver?.is_on_break,
              breakType: d.driver?.break_type,
              activeRide: d.activeRide ? {
                id: d.activeRide.id,
                status: d.activeRide.status,
                pickup_lat: d.activeRide.pickup_lat,
                pickup_lng: d.activeRide.pickup_lng,
                dropoff_lat: d.activeRide.dropoff_lat,
                dropoff_lng: d.activeRide.dropoff_lng,
                pickup_address: d.activeRide.pickup_address,
                dropoff_address: d.activeRide.dropoff_address,
                customer_name: d.activeRide.customer?.full_name,
                customer_phone: d.activeRide.customer?.phone,
              } : undefined,
            }))}
            showRoutes={true}
            selectedDriverId={selectedDriverId}
            onDriverClick={handleDriverClick}
          />
        </Card>

        {/* Driver List & Details Panel */}
        <Card className="p-4 overflow-y-auto">
          {/* Driver List */}
          {!selectedDriver ? (
            <>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Online Drivers ({filteredDrivers.length})
              </h3>
              <div className="space-y-2">
                {filteredDrivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No drivers found</p>
                ) : (
                  filteredDrivers.map(driver => (
                    <div
                      key={driver.id}
                      className="p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted"
                      onClick={() => {
                        setSelectedDriverId(driver.driver_id)
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={driver.driver?.profile?.avatar_url || undefined} />
                          <AvatarFallback>{driver.driver?.profile?.full_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {driver.driver?.profile?.full_name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {driver.driver?.is_on_break ? (
                              <Badge variant="outline" className="text-amber-500 border-amber-300 text-[10px] px-1.5">
                                <Coffee className="h-3 w-3 mr-1" />
                                Break
                              </Badge>
                            ) : driver.activeRide ? (
                              <Badge variant="outline" className="text-blue-500 border-blue-300 text-[10px] px-1.5">
                                <Route className="h-3 w-3 mr-1" />
                                {driver.activeRide.status.replace("_", " ")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-500 border-green-300 text-[10px] px-1.5">
                                Available
                              </Badge>
                            )}
                            {driver.speed > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Navigation className="h-3 w-3" />
                                {Math.round(driver.speed)} km/h
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* Details Panel */
            <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Driver Details
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedDriverId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Driver Info */}
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={selectedDriver.driver?.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-lg">
                  {selectedDriver.driver?.profile?.full_name?.[0] || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">
                  {selectedDriver.driver?.profile?.full_name || "Unknown"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {selectedDriver.driver?.is_on_break ? (
                    <Badge variant="outline" className="text-amber-500 border-amber-300">
                      <Coffee className="h-3 w-3 mr-1" />
                      {selectedDriver.driver.break_type || "Break"}
                    </Badge>
                  ) : selectedDriver.activeRide ? (
                    <Badge variant="outline" className="text-green-500 border-green-300">
                      <Route className="h-3 w-3 mr-1" />
                      {selectedDriver.activeRide.status.replace("_", " ")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-blue-500 border-blue-300">
                      Available
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Contact */}
            {selectedDriver.driver?.profile?.phone && (
              <a
                href={`tel:${selectedDriver.driver.profile.phone}`}
                className="flex items-center gap-2 p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors mb-4"
              >
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm">{selectedDriver.driver.profile.phone}</span>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </a>
            )}

            {/* Location Info */}
            <div className="space-y-2 mb-4 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Location
                </span>
                <span className="font-mono text-xs">
                  {selectedDriver.lat.toFixed(5)}, {selectedDriver.lng.toFixed(5)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Navigation className="h-3 w-3" />
                  Speed
                </span>
                <span>{Math.round(selectedDriver.speed)} km/h</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Last Update
                </span>
                <span>{new Date(selectedDriver.last_updated).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Active Ride Info */}
            {selectedDriver.activeRide && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Active Ride
                </h4>

                {/* Customer */}
                {selectedDriver.activeRide.customer && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {(selectedDriver.activeRide.customer as { full_name?: string })?.full_name?.[0] || "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {(selectedDriver.activeRide.customer as { full_name?: string })?.full_name || "Customer"}
                      </p>
                      {(selectedDriver.activeRide.customer as { phone?: string | null })?.phone && (
                        <a
                          href={`tel:${(selectedDriver.activeRide.customer as { phone?: string | null }).phone}`}
                          className="text-xs text-primary"
                        >
                          {(selectedDriver.activeRide.customer as { phone?: string | null }).phone}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Route */}
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      A
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Pickup</p>
                      <p className="text-sm">
                        {selectedDriver.activeRide.pickup_address || "Loading..."}
                      </p>
                    </div>
                  </div>
                  <div className="ml-3 border-l-2 border-dashed border-muted-foreground/30 h-4" />
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      B
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Dropoff</p>
                      <p className="text-sm">
                        {selectedDriver.activeRide.dropoff_address || "Loading..."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className="bg-yellow-500 text-black capitalize">
                    {selectedDriver.activeRide.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            )}
            </>
          )}
        </Card>
      </div>
    </div>
    </PermissionGate>
  )
}
