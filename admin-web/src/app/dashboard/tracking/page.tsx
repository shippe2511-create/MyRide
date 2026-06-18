"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Radio, Car, Users, MapPin, Phone, RefreshCw, Loader2, Navigation
} from "lucide-react"
import { SkeletonCard } from "@/components/ui/skeleton-card"

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
  last_updated: string
  driver?: {
    id: string
    profile_id: string
    profile?: {
      full_name: string
      phone: string | null
      avatar_url: string | null
    }
  }
}

export default function TrackingPage() {
  const supabase = createClient()
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<DriverLocation | null>(null)

  const [stats, setStats] = useState({ online: 0, total: 0 })

  useEffect(() => {
    loadDriverLocations()
    const interval = setInterval(loadDriverLocations, 5000)

    const channel = supabase
      .channel('driver_locations_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
        loadDriverLocations()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [])

  const loadDriverLocations = async () => {
    const { data } = await supabase
      .from("driver_locations")
      .select(`
        *,
        driver:drivers!driver_locations_driver_id_fkey(
          id,
          profile_id,
          profile:profiles!drivers_profile_id_fkey(full_name, phone, avatar_url)
        )
      `)
      .order("last_updated", { ascending: false })

    const locations = data || []
    setDriverLocations(locations)
    setStats({
      online: locations.filter(d => d.is_online).length,
      total: locations.length,
    })
    setLoading(false)
  }

  const onlineDrivers = driverLocations.filter(d => d.is_online)

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <div className="w-36 h-8 bg-muted rounded animate-pulse" />
          <div className="w-48 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-3 grid-cols-2">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="h-96 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4 h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-green-500" />
            Live Tracking
          </h1>
          <p className="text-sm text-muted-foreground">Real-time driver locations</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadDriverLocations}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2">
        <Card className="p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Car className="h-4 w-4 text-green-500" />
              </div>
              {stats.online > 0 && (
                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full animate-pulse">
                  live
                </span>
              )}
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-green-500">{stats.online}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Online Now</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-slate-500/20">
                <Users className="h-4 w-4 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-500/10 px-2 py-1 rounded-full">
                all
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Total Drivers</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-4 h-[calc(100%-180px)]">
        <Card className="col-span-3 overflow-hidden">
          <LiveDriverMap
            drivers={onlineDrivers.map(d => ({
              id: d.driver_id,
              lat: d.lat,
              lng: d.lng,
              heading: d.heading,
              speed: d.speed,
              name: d.driver?.profile?.full_name || "Unknown",
              isOnline: d.is_online,
            }))}
            onDriverClick={(driverId) => {
              const driver = driverLocations.find(d => d.driver_id === driverId)
              setSelectedDriver(driver || null)
            }}
          />
        </Card>

        <Card className="p-4 overflow-y-auto">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Car className="h-4 w-4" />
            Online Drivers ({onlineDrivers.length})
          </h3>
          <div className="space-y-2">
            {onlineDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No drivers online</p>
            ) : (
              onlineDrivers.map(driver => (
                <div
                  key={driver.id}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedDriver?.id === driver.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedDriver(driver)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={driver.driver?.profile?.avatar_url || undefined} />
                      <AvatarFallback>{driver.driver?.profile?.full_name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {driver.driver?.profile?.full_name || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-green-500 border-green-300 text-[10px] px-1">
                          Online
                        </Badge>
                        {driver.speed > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Navigation className="h-3 w-3" />
                            {Math.round(driver.speed)} km/h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedDriver && (
            <div className="mt-4 p-3 border rounded-lg bg-muted/50">
              <h4 className="font-semibold text-sm mb-2">Selected Driver</h4>
              <div className="space-y-1 text-sm">
                <p>{selectedDriver.driver?.profile?.full_name}</p>
                {selectedDriver.driver?.profile?.phone && (
                  <a
                    href={`tel:${selectedDriver.driver.profile.phone}`}
                    className="text-primary flex items-center gap-1"
                  >
                    <Phone className="h-3 w-3" />
                    {selectedDriver.driver.profile.phone}
                  </a>
                )}
                <p className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {selectedDriver.lat.toFixed(4)}, {selectedDriver.lng.toFixed(4)}
                </p>
                <p className="text-muted-foreground">
                  Speed: {Math.round(selectedDriver.speed)} km/h
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
