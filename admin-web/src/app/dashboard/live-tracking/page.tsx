"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  Bus, Users, MapPin, AlertTriangle, RefreshCw, Bell, Check,
  Navigation, Clock, ChevronRight, Map, List, Loader2
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

const BusTrackingMap = dynamic(
  () => import("@/components/bus-tracking-map").then(mod => mod.BusTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

interface BusLocation {
  id: string
  trip_id: string
  driver_id: string
  vehicle_id: string | null
  route_id: string
  latitude: number
  longitude: number
  current_stop_name: string | null
  current_stop_index: number
  passengers_on_board: number
  vehicle_capacity: number
  is_full: boolean
  status: string
  last_updated_at: string
  route?: { route_name: string; route_code: string }
  vehicle?: { vehicle_number: string }
  driver?: { profile?: { full_name: string } }
}

interface BusFullAlert {
  id: string
  trip_id: string
  route_name: string
  stop_name: string
  stop_index: number
  vehicle_number: string | null
  passengers_on_board: number
  vehicle_capacity: number
  is_acknowledged: boolean
  acknowledged_at: string | null
  created_at: string
}

export default function LiveTrackingPage() {
  const supabase = createClient()
  const [buses, setBuses] = useState<BusLocation[]>([])
  const [alerts, setAlerts] = useState<BusFullAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBus, setSelectedBus] = useState<BusLocation | null>(null)
  const [viewMode, setViewMode] = useState<"map" | "list">("map")

  useEffect(() => {
    loadData()
    setupRealtime()

    return () => {
      supabase.removeAllChannels()
    }
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: busData } = await supabase
      .from("bus_location_tracking")
      .select(`
        *,
        route:transport_routes(route_name, route_code),
        vehicle:vehicles(vehicle_number),
        driver:drivers(profile:profiles(full_name))
      `)
      .eq("status", "in_progress")
      .order("last_updated_at", { ascending: false })

    const { data: alertData } = await supabase
      .from("bus_full_alerts")
      .select("*")
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false })

    setBuses(busData || [])
    setAlerts(alertData || [])
    setLoading(false)
  }

  const setupRealtime = () => {
    supabase
      .channel("bus_tracking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bus_location_tracking" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bus_full_alerts" },
        (payload) => {
          playAlertSound()
          toast.error(
            `Bus Full Alert: ${payload.new.route_name} at ${payload.new.stop_name}`,
            { duration: 10000 }
          )
          loadData()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bus_full_alerts" },
        () => loadData()
      )
      .subscribe()
  }

  const playAlertSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = "sine"
      gainNode.gain.value = 0.3

      oscillator.start()
      setTimeout(() => {
        oscillator.stop()
        audioContext.close()
      }, 500)
    } catch (e) {
      console.error("Audio error:", e)
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("bus_full_alerts")
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString()
      })
      .eq("id", alertId)

    if (error) {
      toast.error("Failed to acknowledge alert")
    } else {
      toast.success("Alert acknowledged")
      loadData()
    }
  }

  const getCapacityColor = (passengers: number, capacity: number) => {
    if (capacity === 0) return "bg-gray-500"
    const ratio = passengers / capacity
    if (ratio >= 1) return "bg-red-500"
    if (ratio >= 0.8) return "bg-orange-500"
    if (ratio >= 0.5) return "bg-yellow-500"
    return "bg-green-500"
  }

  const getCapacityText = (passengers: number, capacity: number) => {
    if (capacity === 0) return "N/A"
    const ratio = Math.round((passengers / capacity) * 100)
    return `${ratio}%`
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Navigation className="h-6 w-6" />
            Live Bus Tracking
          </h1>
          <p className="text-muted-foreground">Monitor bus locations and capacity in real-time</p>
        </div>
        <div className="flex gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "map" | "list")}>
            <TabsList>
              <TabsTrigger value="map" className="gap-2">
                <Map className="h-4 w-4" />
                Map
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Bus Full Alerts ({alerts.length})
            </CardTitle>
            <CardDescription>
              These buses have reached capacity and may need backup vehicles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 bg-red-500/10 rounded-lg border border-red-500/20"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Bus className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold">{alert.route_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Full at <span className="font-medium text-red-400">{alert.stop_name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {alert.vehicle_number} • {alert.passengers_on_board}/{alert.vehicle_capacity} passengers
                      • {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Acknowledge
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{buses.length}</p>
                <p className="text-xs text-muted-foreground">Active Buses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {buses.reduce((sum, b) => sum + b.passengers_on_board, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Passengers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{buses.filter(b => b.is_full).length}</p>
                <p className="text-xs text-muted-foreground">Full Buses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alerts.length}</p>
                <p className="text-xs text-muted-foreground">Pending Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map or List View */}
      {viewMode === "map" ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="h-[600px]">
              <BusTrackingMap
                buses={buses}
                selectedBusId={selectedBus?.id}
                onBusClick={(bus) => setSelectedBus(bus)}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active Buses</CardTitle>
            <CardDescription>Real-time location and capacity of all active buses</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : buses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active buses at the moment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {buses.map((bus) => (
                  <div
                    key={bus.id}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                      bus.is_full ? "border-red-500/50 bg-red-500/5" : ""
                    }`}
                    onClick={() => setSelectedBus(bus)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          bus.is_full ? "bg-red-500/20" : "bg-primary/10"
                        }`}>
                          <Bus className={`h-6 w-6 ${bus.is_full ? "text-red-500" : "text-primary"}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{bus.route?.route_name || "Unknown Route"}</p>
                            {bus.is_full && (
                              <Badge variant="destructive" className="text-xs">FULL</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {bus.vehicle?.vehicle_number || "No Vehicle"} • {(bus.driver?.profile as any)?.full_name || "Unknown Driver"}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {bus.current_stop_name || `Stop ${bus.current_stop_index + 1}`}
                            <span className="mx-1">•</span>
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(bus.last_updated_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-bold text-lg">
                              {bus.passengers_on_board}/{bus.vehicle_capacity}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`${getCapacityColor(bus.passengers_on_board, bus.vehicle_capacity)} text-white border-0 text-xs`}
                          >
                            {getCapacityText(bus.passengers_on_board, bus.vehicle_capacity)} Capacity
                          </Badge>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
