"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Bus, Users, AlertTriangle, RefreshCw, Bell, Check,
  Navigation, Clock, ChevronRight, Loader2, MapPin, X,
  TrendingUp, ArrowUp, ArrowDown, UserPlus, Send
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDistanceToNow, format } from "date-fns"

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
  total_stops?: number
  passengers_on_board: number
  vehicle_capacity: number
  vehicle_number?: string | null
  is_full: boolean
  status: string
  last_updated_at: string
  route?: { route_name: string; route_code: string; direction?: string }
  vehicle?: { vehicle_number: string }
  driver?: { profile?: { full_name: string } }
}

interface BusFullAlert {
  id: string
  trip_id: string
  route_id: string
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

interface StopPassengerCount {
  id: string
  stop_index: number
  stop_name: string
  boarded_count: number
  alighted_count: number
  recorded_at: string
}

interface DailySummary {
  total_trips: number
  completed_trips: number
  total_passengers: number
  avg_occupancy: number
}

export default function LiveTrackingPage() {
  const supabase = createClient()
  const [buses, setBuses] = useState<BusLocation[]>([])
  const [alerts, setAlerts] = useState<BusFullAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBus, setSelectedBus] = useState<BusLocation | null>(null)
  const [stopCounts, setStopCounts] = useState<StopPassengerCount[]>([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [summary, setSummary] = useState<DailySummary>({
    total_trips: 0,
    completed_trips: 0,
    total_passengers: 0,
    avg_occupancy: 0,
  })
  const [initialLoad, setInitialLoad] = useState(true)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Backup assignment state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<BusFullAlert | null>(null)
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([])
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([])
  const [selectedDriver, setSelectedDriver] = useState<string>("")
  const [selectedVehicle, setSelectedVehicle] = useState<string>("")
  const [assigningBackup, setAssigningBackup] = useState(false)

  // Debounced load to prevent rapid refreshes
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      loadData(false)
    }, 500)
  }, [])

  useEffect(() => {
    loadData(true)
    const channel = setupRealtime()

    // Poll every 30 seconds as fallback (increased from 10)
    const pollInterval = setInterval(() => loadData(false), 30000)

    return () => {
      clearInterval(pollInterval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Load stop counts when bus is selected
  useEffect(() => {
    if (selectedBus?.trip_id) {
      loadStopCounts(selectedBus.trip_id)
    } else {
      setStopCounts([])
    }
  }, [selectedBus?.trip_id])

  const loadData = async (showLoading = false) => {
    if (showLoading) setLoading(true)

    const { data: busData, error: busError } = await supabase
      .from("bus_location_tracking")
      .select(`
        *,
        route:transport_routes(route_name, route_code, direction)
      `)
      .eq("status", "in_progress")
      .order("last_updated_at", { ascending: false })

    // Fetch driver names and vehicle info separately since nested joins can fail
    const enrichedBuses = await Promise.all((busData || []).map(async (bus) => {
      let enrichedBus = { ...bus }

      if (bus.driver_id) {
        const { data: driver } = await supabase
          .from("drivers")
          .select("profile:profiles(full_name)")
          .eq("id", bus.driver_id)
          .single()
        enrichedBus.driver = driver
      }

      // Get vehicle info if not already in record
      if (bus.vehicle_id && !bus.vehicle_number) {
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("vehicle_number, capacity")
          .eq("id", bus.vehicle_id)
          .single()
        if (vehicle) {
          enrichedBus.vehicle_number = vehicle.vehicle_number
          enrichedBus.vehicle_capacity = enrichedBus.vehicle_capacity || vehicle.capacity
        }
      }

      // Get total stops for the route
      if (bus.route_id) {
        const { count } = await supabase
          .from("route_stops")
          .select("*", { count: "exact", head: true })
          .eq("route_id", bus.route_id)
        enrichedBus.total_stops = count || 0
      }

      return enrichedBus
    }))

    const { data: alertData } = await supabase
      .from("bus_full_alerts")
      .select("*")
      .eq("is_acknowledged", false)
      .order("created_at", { ascending: false })

    setBuses(enrichedBuses || [])
    setAlerts(alertData || [])

    // Load daily summary
    const today = format(new Date(), "yyyy-MM-dd")

    const { data: allTrips } = await supabase
      .from("bus_trips")
      .select("id, status")
      .gte("actual_start_time", `${today}T00:00:00`)

    const { data: allCounts } = await supabase
      .from("stop_passenger_counts")
      .select("boarded_count")
      .gte("recorded_at", `${today}T00:00:00`)

    const todayTrips = allTrips || []
    const totalPassengers = allCounts?.reduce((sum, c) => sum + (c.boarded_count || 0), 0) || 0

    let avgOccupancy = 0
    if (busData && busData.length > 0) {
      const occupancies = busData.map(bus => {
        const capacity = bus.vehicle_capacity || 40
        return Math.min(100, (bus.passengers_on_board / capacity) * 100)
      })
      avgOccupancy = occupancies.reduce((a, b) => a + b, 0) / occupancies.length
    }

    setSummary({
      total_trips: todayTrips.length,
      completed_trips: todayTrips.filter(t => t.status === "completed").length,
      total_passengers: totalPassengers,
      avg_occupancy: Math.round(avgOccupancy),
    })

    setLoading(false)
  }

  const loadStopCounts = async (tripId: string) => {
    setLoadingStops(true)
    const { data } = await supabase
      .from("stop_passenger_counts")
      .select("*")
      .eq("bus_trip_id", tripId)
      .order("stop_index", { ascending: true })

    setStopCounts(data || [])
    setLoadingStops(false)
  }

  const setupRealtime = () => {
    const channel = supabase
      .channel("bus_tracking_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bus_location_tracking" },
        () => debouncedLoad()
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
          debouncedLoad()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bus_full_alerts" },
        () => debouncedLoad()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stop_passenger_counts" },
        () => {
          debouncedLoad()
          if (selectedBus?.trip_id) {
            loadStopCounts(selectedBus.trip_id)
          }
        }
      )
      .subscribe()

    return channel
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

  const openAssignBackupDialog = async (alert: BusFullAlert) => {
    setSelectedAlert(alert)
    setSelectedDriver("")
    setSelectedVehicle("")
    setAssignDialogOpen(true)

    // Load all drivers (show online first, then offline)
    const { data: drivers } = await supabase
      .from("drivers")
      .select(`
        id,
        profile_id,
        is_online,
        profile:profiles(full_name)
      `)
      .order("is_online", { ascending: false })

    // Load available vehicles
    const { data: vehicles } = await supabase
      .from("vehicle_types")
      .select("id, name, capacity")
      .order("name")

    setAvailableDrivers(drivers || [])
    setAvailableVehicles(vehicles || [])
  }

  const assignBackupBus = async () => {
    if (!selectedAlert || !selectedDriver || !selectedVehicle) {
      toast.error("Please select both driver and vehicle")
      return
    }

    setAssigningBackup(true)

    try {
      // Get vehicle and driver info
      const vehicle = availableVehicles.find(v => v.id === selectedVehicle)
      const driver = availableDrivers.find(d => d.id === selectedDriver)
      const vehicleName = vehicle?.name || ""
      const parts = vehicleName.split("_")
      const vehicleNumber = parts.length === 2
        ? `${parts[0].toUpperCase()} (${parts[1].toUpperCase()})`
        : vehicleName

      // Create urgent notification for driver (use profile_id for notifications table)
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: driver?.profile_id || selectedDriver,
          title: "🚨 URGENT: Backup Bus Required",
          message: `Start trip immediately from ${selectedAlert.stop_name} on route ${selectedAlert.route_name}. Bus is full and passengers are waiting!`,
          notification_type: "urgent_backup",
          data: {
            route_id: selectedAlert.route_id,
            route_name: selectedAlert.route_name,
            start_stop: selectedAlert.stop_name,
            start_stop_index: selectedAlert.stop_index,
            vehicle_id: selectedVehicle,
            vehicle_number: vehicleNumber,
            vehicle_capacity: vehicle?.capacity,
            original_trip_id: selectedAlert.trip_id,
          },
          is_read: false,
        })

      if (notifError) throw notifError

      // Create a backup roster assignment for today
      const today = new Date().toISOString().split('T')[0]
      const now = new Date()
      const startTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

      const { error: rosterError } = await supabase
        .from("roster_assignments")
        .insert({
          driver_id: selectedDriver,
          route_id: selectedAlert.route_id,
          vehicle_id: selectedVehicle,
          assignment_date: today,
          start_time: startTime,
          status: 'pending',
          is_backup: true,
          backup_start_stop_index: selectedAlert.stop_index,
          backup_for_trip_id: selectedAlert.trip_id,
        })

      if (rosterError) {
        console.error("Roster error:", rosterError)
        // Continue anyway - notification was sent
      }

      // Mark alert as acknowledged with backup assigned
      await supabase
        .from("bus_full_alerts")
        .update({
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", selectedAlert.id)

      toast.success(`Backup assigned! ${vehicleNumber} notified to start from ${selectedAlert.stop_name}`)
      setAssignDialogOpen(false)
      // Remove the alert from local state instead of full reload
      setAlerts(prev => prev.filter(a => a.id !== selectedAlert.id))
    } catch (error) {
      console.error("Error assigning backup:", error)
      toast.error("Failed to assign backup bus")
    } finally {
      setAssigningBackup(false)
    }
  }

  const getStatusBadge = (bus: BusLocation) => {
    if (bus.is_full) {
      return <Badge className="bg-red-500 text-white text-xs">Full</Badge>
    }
    const ratio = bus.vehicle_capacity > 0 ? bus.passengers_on_board / bus.vehicle_capacity : 0
    if (ratio >= 0.8) {
      return <Badge className="bg-orange-500 text-white text-xs">Almost Full</Badge>
    }
    return <Badge className="bg-green-500 text-white text-xs">Available</Badge>
  }

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500"
    if (percentage >= 70) return "bg-orange-500"
    if (percentage >= 50) return "bg-yellow-500"
    return "bg-green-500"
  }

  const activeBuses = buses.filter(b => !b.is_full).length
  const fullBuses = buses.filter(b => b.is_full).length

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Navigation className="h-6 w-6" />
            Bus Live Tracking
          </h1>
          <p className="text-muted-foreground">Real-time bus locations, capacity & passenger counts</p>
        </div>
        <Button onClick={() => loadData(true)} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-primary">{buses.length}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <Bus className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-green-500">{activeBuses}</p>
                <p className="text-[10px] text-muted-foreground">Available</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-red-500">{fullBuses}</p>
                <p className="text-[10px] text-muted-foreground">Full</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-blue-500">{summary.total_passengers}</p>
                <p className="text-[10px] text-muted-foreground">Passengers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-yellow-500">{summary.avg_occupancy}%</p>
                <p className="text-[10px] text-muted-foreground">Avg Occ.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-orange-500">{alerts.length}</p>
                <p className="text-[10px] text-muted-foreground">Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5 mb-4">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Bus Full Alerts ({alerts.length})</span>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {alerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Bus className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-sm font-medium">{alert.route_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Full at {alert.stop_name} • {alert.vehicle_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAssignBackupDialog(alert)}
                      className="text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10"
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign Backup
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="text-red-500 hover:bg-red-500/10"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content - Map + Sidebar */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Map */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <BusTrackingMap
              buses={buses}
              selectedBusId={selectedBus?.id}
              onBusClick={(bus) => setSelectedBus(bus)}
            />
          </CardContent>
        </Card>

        {/* Sidebar */}
        <Card className="w-80 flex flex-col">
          <CardContent className="p-4 flex flex-col h-full overflow-hidden">
            {selectedBus ? (
              // Selected Bus Detail View
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Bus Details</h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setSelectedBus(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Bus Info */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-semibold">
                      {((selectedBus.driver?.profile as any)?.full_name || "U").charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {(selectedBus.driver?.profile as any)?.full_name || "Unknown Driver"}
                      </p>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(selectedBus)}
                        {selectedBus.vehicle && (
                          <Badge variant="outline" className="text-xs">
                            {selectedBus.vehicle.vehicle_number}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedBus.route && (
                    <div className="p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-sm">
                        <Navigation className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedBus.route.route_name}</span>
                        <span className="text-muted-foreground">({selectedBus.route.route_code})</span>
                      </div>
                    </div>
                  )}

                  {/* Vehicle Info */}
                  {selectedBus.vehicle_number && (
                    <div className="p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-sm">
                        <Bus className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedBus.vehicle_number}</span>
                        <span className="text-muted-foreground">({selectedBus.vehicle_capacity} seats)</span>
                      </div>
                    </div>
                  )}

                  {/* Occupancy Bar */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        Occupancy
                      </span>
                      <span className="font-bold">
                        {selectedBus.passengers_on_board}/{selectedBus.vehicle_capacity}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getOccupancyColor((selectedBus.passengers_on_board / selectedBus.vehicle_capacity) * 100)}`}
                        style={{ width: `${Math.min(100, (selectedBus.passengers_on_board / selectedBus.vehicle_capacity) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {Math.round((selectedBus.passengers_on_board / selectedBus.vehicle_capacity) * 100)}% full
                    </p>
                  </div>

                  {selectedBus.current_stop_name && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>Current: {selectedBus.current_stop_name}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Updated {formatDistanceToNow(new Date(selectedBus.last_updated_at), { addSuffix: true })}
                  </div>
                </div>

                {/* Per-Stop Passenger Counts */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Stop Passenger Counts
                  </h4>

                  {loadingStops ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : stopCounts.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No stop data yet
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {stopCounts.map((stop, idx) => (
                        <div
                          key={stop.id}
                          className={`p-2 rounded-lg border text-sm ${
                            idx === selectedBus.current_stop_index
                              ? "border-primary bg-primary/5"
                              : "bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium truncate flex-1">
                              {stop.stop_name || `Stop ${stop.stop_index + 1}`}
                            </span>
                            {idx === selectedBus.current_stop_index && (
                              <Badge className="bg-primary text-[10px] ml-2">Current</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1 text-green-500">
                              <ArrowUp className="h-3 w-3" />
                              +{stop.boarded_count} boarded
                            </span>
                            <span className="flex items-center gap-1 text-red-500">
                              <ArrowDown className="h-3 w-3" />
                              -{stop.alighted_count} alighted
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Default Bus List View
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Bus className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Active Buses ({buses.length})</h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : buses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bus className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No active buses</p>
                    </div>
                  ) : (
                    buses.map((bus) => {
                      const driverName = (bus.driver?.profile as any)?.full_name || "Unknown"
                      const initial = driverName.charAt(0).toUpperCase()

                      return (
                        <div
                          key={bus.id}
                          onClick={() => setSelectedBus(bus)}
                          className="p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="font-medium truncate">{driverName}</p>
                                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(bus)}
                                <span className="text-xs text-muted-foreground">
                                  {bus.passengers_on_board}/{bus.vehicle_capacity}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Trip Progress Bar (by stops) */}
                          {bus.total_stops && bus.total_stops > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>Stop {bus.current_stop_index + 1} of {bus.total_stops}</span>
                                <span>{Math.round(((bus.current_stop_index + 1) / bus.total_stops) * 100)}%</span>
                              </div>
                              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all bg-blue-500"
                                  style={{ width: `${Math.min(100, ((bus.current_stop_index + 1) / bus.total_stops) * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {(bus.vehicle_number || bus.vehicle) && (
                            <div className="mt-1 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {bus.vehicle_number || bus.vehicle?.vehicle_number}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {bus.vehicle_capacity} seats
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assign Backup Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Assign Backup Bus
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              {/* Alert Info */}
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                <p className="font-medium text-red-500">{selectedAlert.route_name}</p>
                <p className="text-sm text-muted-foreground">
                  Bus full at <strong>{selectedAlert.stop_name}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Passengers waiting: {selectedAlert.passengers_on_board}/{selectedAlert.vehicle_capacity}
                </p>
              </div>

              {/* Driver Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Available Driver</label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrivers.length === 0 ? (
                      <SelectItem value="_none" disabled>No drivers available</SelectItem>
                    ) : (
                      availableDrivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${driver.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {(driver.profile as any)?.full_name || "Unknown Driver"}
                            {!driver.is_online && <span className="text-xs text-muted-foreground">(offline)</span>}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Vehicle Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vehicle</label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVehicles.map((vehicle) => {
                      const parts = vehicle.name?.split("_") || []
                      const displayName = parts.length === 2
                        ? `${parts[0].toUpperCase()} (${parts[1].toUpperCase()})`
                        : vehicle.name
                      return (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{displayName}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {vehicle.capacity} seats
                            </span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setAssignDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={assignBackupBus}
                  disabled={!selectedDriver || !selectedVehicle || assigningBackup}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  {assigningBackup ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Urgent Alert
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Driver will receive an urgent notification to start the trip from {selectedAlert.stop_name}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
