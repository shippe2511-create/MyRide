"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  getActiveTrips,
  getActiveShuttles,
  getFleetStatus,
  getTodayStats,
  getYesterdayStats,
  getRosterGaps,
  getDriverLocations,
  getHourlyTrends,
  getSOSAlerts,
  getShiftWarnings,
  getScheduledRides,
  getRecentRatings,
  computeMetrics,
  subscribeToControlRoomUpdates,
  unsubscribeFromControlRoom,
  formatDuration,
  getAttentionLevel,
  type ActiveTrip,
  type ActiveShuttle,
  type DriverStatus,
  type DriverLocation,
  type ComputedMetrics,
  type RosterGap,
  type HourlyTrend,
  type ControlRoomSubscriptions,
  type MapMarker,
  type SOSAlert,
  type ShiftWarning,
  type ScheduledRide,
  type RecentRating,
} from "@/lib/control-room-data"
import dynamic from "next/dynamic"

const ControlRoomMap = dynamic(
  () => import("@/components/control-room-map").then(mod => mod.ControlRoomMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted/50 animate-pulse rounded-lg" /> }
)
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Car, Bus, Users, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, ArrowRight, MapPin, Phone,
  RefreshCw, Maximize2, Minimize2, X, Coffee, Moon, UserX,
  Navigation, Route, Loader2, Circle, Activity, Timer, Percent,
  ChevronUp, ChevronDown, Filter, Eye, PhoneCall, XCircle,
  ArrowUpDown, Volume2, VolumeX, Keyboard, Siren, Star, CalendarClock,
  UserMinus
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { formatDistanceToNow, format } from "date-fns"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Status colors
const STATUS_COLORS = {
  pending: "bg-amber-500",
  accepted: "bg-blue-500",
  arrived: "bg-purple-500",
  in_progress: "bg-green-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
}

const STATUS_LABELS = {
  pending: "Awaiting Driver",
  accepted: "Driver Assigned",
  arrived: "Driver Arrived",
  in_progress: "In Progress",
}

export default function ControlRoomPage() {
  const supabase = createClient()
  const subscriptionsRef = useRef<ControlRoomSubscriptions | null>(null)

  // Data state
  const [activeTrips, setActiveTrips] = useState<ActiveTrip[]>([])
  const [activeShuttles, setActiveShuttles] = useState<ActiveShuttle[]>([])
  const [fleet, setFleet] = useState<DriverStatus[]>([])
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([])
  const [metrics, setMetrics] = useState<ComputedMetrics | null>(null)
  const [rosterGaps, setRosterGaps] = useState<RosterGap[]>([])
  const [hourlyTrends, setHourlyTrends] = useState<HourlyTrend[]>([])
  const [sosAlerts, setSOSAlerts] = useState<SOSAlert[]>([])
  const [shiftWarnings, setShiftWarnings] = useState<ShiftWarning[]>([])
  const [scheduledRides, setScheduledRides] = useState<ScheduledRide[]>([])
  const [recentRatings, setRecentRatings] = useState<RecentRating[]>([])
  const [departmentId, setDepartmentId] = useState<string | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const prevPendingCountRef = useRef(0)
  const prevSOSCountRef = useRef(0)

  // Trips table state
  const [tripsSortBy, setTripsSortBy] = useState<"wait" | "status" | "customer">("wait")
  const [tripsSortDir, setTripsSortDir] = useState<"asc" | "desc">("desc")
  const [tripsFilter, setTripsFilter] = useState<"all" | "pending" | "accepted" | "arrived" | "in_progress">("all")
  const [selectedTrip, setSelectedTrip] = useState<ActiveTrip | null>(null)
  const [tripDetailOpen, setTripDetailOpen] = useState(false)

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Play alert sound for new pending trips
  const playAlertSound = useCallback(() => {
    if (!audioEnabled) return
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
      }, 300)
    } catch (e) {
      console.error("Audio error:", e)
    }
  }, [audioEnabled])

  // Play urgent SOS alarm (louder, more urgent)
  const playSOSAlarm = useCallback(() => {
    if (!audioEnabled) return
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Siren-like sound pattern
      oscillator.type = "sawtooth"
      gainNode.gain.value = 0.5

      const now = audioContext.currentTime
      oscillator.frequency.setValueAtTime(600, now)
      oscillator.frequency.linearRampToValueAtTime(1200, now + 0.2)
      oscillator.frequency.linearRampToValueAtTime(600, now + 0.4)
      oscillator.frequency.linearRampToValueAtTime(1200, now + 0.6)

      oscillator.start()
      setTimeout(() => {
        oscillator.stop()
        audioContext.close()
      }, 600)
    } catch (e) {
      console.error("SOS Audio error:", e)
    }
  }, [audioEnabled])

  // Check for new pending trips and play alert
  useEffect(() => {
    const currentPendingCount = activeTrips.filter(t => t.status === "pending").length
    if (currentPendingCount > prevPendingCountRef.current && prevPendingCountRef.current >= 0) {
      playAlertSound()
      toast.warning("New ride request!", { duration: 3000 })
    }
    prevPendingCountRef.current = currentPendingCount
  }, [activeTrips, playAlertSound])

  // Check for new SOS alerts and play urgent alarm
  useEffect(() => {
    if (sosAlerts.length > prevSOSCountRef.current && prevSOSCountRef.current >= 0) {
      playSOSAlarm()
      toast.error("EMERGENCY: New SOS Alert!", { duration: 10000 })
    }
    prevSOSCountRef.current = sosAlerts.length
  }, [sosAlerts, playSOSAlarm])

  // Screen wake lock to prevent display sleep
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen")
          console.log("[ControlRoom] Wake lock acquired")
        }
      } catch (e) {
        console.log("[ControlRoom] Wake lock failed:", e)
      }
    }

    requestWakeLock()

    // Re-acquire wake lock when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    }
  }, [])

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // Load user's department for filtering
  useEffect(() => {
    const loadUserDepartment = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("department_id, role")
          .eq("id", user.id)
          .single()

        // Only filter by department if not super_admin
        if (profile && profile.role !== "super_admin") {
          setDepartmentId(profile.department_id)
        }
      }
    }
    loadUserDepartment()
  }, [])

  // Load all data
  const loadData = useCallback(async () => {
    setIsUpdating(true)
    const [trips, shuttles, fleetData, locations, todayStats, yesterdayStats, gaps, trends, sos, shifts, scheduled, ratings] = await Promise.all([
      getActiveTrips(supabase, departmentId),
      getActiveShuttles(supabase),
      getFleetStatus(supabase, departmentId),
      getDriverLocations(supabase, departmentId),
      getTodayStats(supabase, departmentId),
      getYesterdayStats(supabase, departmentId),
      getRosterGaps(supabase),
      getHourlyTrends(supabase, departmentId),
      getSOSAlerts(supabase),
      getShiftWarnings(supabase, departmentId),
      getScheduledRides(supabase, departmentId),
      getRecentRatings(supabase),
    ])

    setActiveTrips(trips)
    setActiveShuttles(shuttles)
    setFleet(fleetData)
    setDriverLocations(locations)
    setRosterGaps(gaps)
    setHourlyTrends(trends)
    setSOSAlerts(sos)
    setShiftWarnings(shifts)
    setScheduledRides(scheduled)
    setRecentRatings(ratings)

    const computedMetrics = computeMetrics(trips, shuttles, fleetData, todayStats, yesterdayStats, gaps)
    setMetrics(computedMetrics)

    setLastUpdate(new Date())
    setLoading(false)
    setIsUpdating(false)
  }, [supabase, departmentId])

  // Initial load and realtime subscription
  useEffect(() => {
    loadData()

    // Set up realtime subscriptions
    subscriptionsRef.current = subscribeToControlRoomUpdates(supabase, loadData)

    return () => {
      if (subscriptionsRef.current) {
        unsubscribeFromControlRoom(supabase, subscriptionsRef.current)
      }
    }
  }, [loadData, supabase])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case "r":
          // R - Refresh data
          loadData()
          break
        case "f":
          // F - Toggle fullscreen
          toggleFullscreen()
          break
        case "m":
          // M - Toggle audio/mute
          setAudioEnabled(prev => !prev)
          toast.info(audioEnabled ? "Audio muted" : "Audio enabled", { duration: 1500 })
          break
        case "escape":
          // Escape - Close dialogs or exit fullscreen
          if (tripDetailOpen) {
            setTripDetailOpen(false)
          } else if (isFullscreen) {
            document.exitFullscreen()
          }
          break
        case "1":
          // 1 - Filter to pending
          setTripsFilter("pending")
          break
        case "2":
          // 2 - Filter to accepted
          setTripsFilter("accepted")
          break
        case "0":
          // 0 - Show all trips
          setTripsFilter("all")
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [loadData, toggleFullscreen, tripDetailOpen, isFullscreen, audioEnabled])

  // Fleet counts
  const onlineDrivers = fleet.filter(d => d.is_online && !d.is_on_break).length
  const onBreakDrivers = fleet.filter(d => d.is_online && d.is_on_break).length
  const offlineDrivers = fleet.filter(d => !d.is_online).length
  const totalDrivers = fleet.length

  // Attention level
  const attentionLevel = metrics ? getAttentionLevel(metrics) : "calm"

  // Sort and filter trips
  const sortedFilteredTrips = activeTrips
    .filter(trip => tripsFilter === "all" || trip.status === tripsFilter)
    .sort((a, b) => {
      let cmp = 0
      if (tripsSortBy === "wait") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else if (tripsSortBy === "status") {
        const order = { pending: 0, accepted: 1, arrived: 2, in_progress: 3 }
        cmp = (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4)
      } else if (tripsSortBy === "customer") {
        cmp = (a.customer?.full_name || "").localeCompare(b.customer?.full_name || "")
      }
      return tripsSortDir === "desc" ? -cmp : cmp
    })

  // Toggle sort direction or change column
  const handleSort = (col: "wait" | "status" | "customer") => {
    if (tripsSortBy === col) {
      setTripsSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setTripsSortBy(col)
      setTripsSortDir("desc")
    }
  }

  // View trip details
  const viewTripDetails = (trip: ActiveTrip) => {
    setSelectedTrip(trip)
    setTripDetailOpen(true)
  }

  // Build map markers from driver locations
  const mapMarkers: MapMarker[] = driverLocations.map(loc => ({
    id: loc.driver_id,
    type: 'taxi' as const,
    lat: loc.lat,
    lng: loc.lng,
    status: loc.active_ride_status || 'available',
    label: loc.driver_name?.split(' ')[0] || 'Driver',
    sublabel: loc.vehicle_number || undefined,
    isAlert: false,
  }))

  // Add shuttle markers from bus_location_tracking (they have lat/lng)
  activeShuttles.forEach(shuttle => {
    // bus_location_tracking has latitude/longitude directly
    const lat = typeof shuttle.route === 'object' ? 0 : 0 // Placeholder, we need actual coords
    const lng = 0
    // Skip shuttles without valid coordinates for now
  })

  // Cancel trip action
  const cancelTrip = async (tripId: string) => {
    const { error } = await supabase
      .from("rides")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cancelled by admin from control room"
      })
      .eq("id", tripId)

    if (error) {
      toast.error("Failed to cancel trip")
    } else {
      toast.success("Trip cancelled")
      loadData()
    }
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading Control Room...</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="h-full w-full flex flex-col p-4 gap-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Transport Operations</h1>
          </div>
          <Badge
            variant="outline"
            className={`
              ${attentionLevel === "calm" ? "border-green-500 text-green-500" : ""}
              ${attentionLevel === "amber" ? "border-amber-500 text-amber-500 animate-pulse" : ""}
              ${attentionLevel === "red" ? "border-red-500 text-red-500 animate-pulse" : ""}
            `}
          >
            {attentionLevel === "calm" && "All Clear"}
            {attentionLevel === "amber" && "Attention Needed"}
            {attentionLevel === "red" && "Action Required"}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tabular-nums">
              {format(currentTime, "HH:mm:ss")}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(currentTime, "EEEE, d MMMM yyyy")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={loadData}
              title="Refresh (R)"
              className="relative"
            >
              <RefreshCw className={`h-4 w-4 ${isUpdating ? "animate-spin" : ""}`} />
              {isUpdating && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAudioEnabled(!audioEnabled)}
              title={`${audioEnabled ? "Mute" : "Unmute"} (M)`}
              className={audioEnabled ? "" : "text-muted-foreground"}
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => window.location.href = "/dashboard"} title="Exit (Esc)">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-8 gap-3 shrink-0">
        <MetricCard
          icon={<Car className="h-5 w-5" />}
          label="Active Trips"
          value={metrics?.activeTrips ?? 0}
          color="text-blue-400"
        />
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Awaiting Driver"
          value={metrics?.awaitingDriver ?? 0}
          color={metrics && metrics.awaitingDriver > 0 ? "text-amber-400" : "text-green-400"}
          alert={!!(metrics && metrics.awaitingDriver > 3)}
        />
        <MetricCard
          icon={<Timer className="h-5 w-5" />}
          label="Avg Accept"
          value={formatDuration(metrics?.avgAcceptSeconds ?? 0)}
          delta={metrics?.avgAcceptDelta}
          lowerIsBetter
          color="text-purple-400"
        />
        <MetricCard
          icon={<Navigation className="h-5 w-5" />}
          label="Avg Arrival"
          value={formatDuration(metrics?.avgArrivalSeconds ?? 0)}
          delta={metrics?.avgArrivalDelta}
          lowerIsBetter
          color="text-cyan-400"
        />
        <MetricCard
          icon={<Bus className="h-5 w-5" />}
          label="Shuttles Running"
          value={metrics?.shuttlesRunning ?? 0}
          color="text-green-400"
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Completed Today"
          value={metrics?.completedToday ?? 0}
          delta={metrics?.completedDelta}
          color="text-emerald-400"
        />
        <MetricCard
          icon={<Percent className="h-5 w-5" />}
          label="Utilisation"
          value={`${Math.round(metrics?.vehicleUtilisationPercent ?? 0)}%`}
          color="text-primary"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Cancel Rate"
          value={`${(metrics?.cancellationRate ?? 0).toFixed(1)}%`}
          color={metrics && metrics.cancellationRate > 10 ? "text-red-400" : "text-muted-foreground"}
        />
      </div>

      {/* Main Content - 3 columns */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Column - Active Trips Table */}
        <div className="col-span-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-400" />
              Active Taxi Rides
            </h2>
            <div className="flex items-center gap-2">
              {/* Filter dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    {tripsFilter === "all" ? "All" : STATUS_LABELS[tripsFilter as keyof typeof STATUS_LABELS]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTripsFilter("all")}>
                    All ({activeTrips.length})
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTripsFilter("pending")}>
                    Awaiting Driver ({activeTrips.filter(t => t.status === "pending").length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTripsFilter("accepted")}>
                    Driver Assigned ({activeTrips.filter(t => t.status === "accepted").length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTripsFilter("arrived")}>
                    Driver Arrived ({activeTrips.filter(t => t.status === "arrived").length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTripsFilter("in_progress")}>
                    In Progress ({activeTrips.filter(t => t.status === "in_progress").length})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                {sortedFilteredTrips.length} shown
              </span>
            </div>
          </div>
          <Card className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {sortedFilteredTrips.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{tripsFilter === "all" ? "No active rides" : "No matching rides"}</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th
                        className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 select-none"
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center gap-1">
                          Status
                          {tripsSortBy === "status" && (
                            tripsSortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 select-none"
                        onClick={() => handleSort("customer")}
                      >
                        <div className="flex items-center gap-1">
                          Customer
                          {tripsSortBy === "customer" && (
                            tripsSortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th className="text-left p-2 font-medium">Route</th>
                      <th className="text-left p-2 font-medium">Driver</th>
                      <th
                        className="text-right p-2 font-medium cursor-pointer hover:bg-muted/70 select-none"
                        onClick={() => handleSort("wait")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Wait
                          {tripsSortBy === "wait" && (
                            tripsSortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFilteredTrips.map((trip) => {
                      const waitSeconds = (Date.now() - new Date(trip.created_at).getTime()) / 1000
                      const isLongWait = trip.status === "pending" && waitSeconds > 300

                      return (
                        <tr
                          key={trip.id}
                          className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${isLongWait ? "bg-red-500/10" : ""}`}
                          onClick={() => viewTripDetails(trip)}
                        >
                          <td className="p-2">
                            <Badge className={`${STATUS_COLORS[trip.status]} text-white text-[10px]`}>
                              {STATUS_LABELS[trip.status as keyof typeof STATUS_LABELS] || trip.status}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <div className="truncate max-w-[120px]">
                              {trip.customer?.full_name || "Unknown"}
                            </div>
                            {trip.customer?.department?.name && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                {trip.customer.department.name}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1 text-xs">
                              <MapPin className="h-3 w-3 text-green-500 shrink-0" />
                              <span className="truncate max-w-[80px]">{trip.pickup_name?.split(",")[0]}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[80px]">{trip.dropoff_name?.split(",")[0]}</span>
                            </div>
                          </td>
                          <td className="p-2">
                            {trip.driver ? (
                              <div>
                                <div className="truncate max-w-[100px]">
                                  {(trip.driver.profile as any)?.full_name || "Assigned"}
                                </div>
                                {trip.driver.vehicle && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {trip.driver.vehicle.vehicle_number}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-500 text-xs">Unassigned</span>
                            )}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            <span className={isLongWait ? "text-red-400 font-medium" : ""}>
                              {formatDuration(waitSeconds)}
                            </span>
                          </td>
                          <td className="p-2" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <ArrowUpDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => viewTripDetails(trip)}>
                                  <Eye className="h-3 w-3 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {trip.customer?.phone && (
                                  <DropdownMenuItem onClick={() => window.open(`tel:${trip.customer?.phone}`)}>
                                    <PhoneCall className="h-3 w-3 mr-2" />
                                    Call Customer
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-500"
                                  onClick={() => cancelTrip(trip.id)}
                                >
                                  <XCircle className="h-3 w-3 mr-2" />
                                  Cancel Trip
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        {/* Center Column - Map + Alerts */}
        <div className="col-span-4 flex flex-col gap-4 min-h-0">
          {/* SOS Alerts Panel - TOP PRIORITY */}
          {sosAlerts.length > 0 && (
            <Card className="shrink-0 border-red-500 bg-red-500/10 p-3 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-red-500">
                  <Siren className="h-5 w-5" />
                  <span className="text-sm font-bold uppercase tracking-wide">SOS Alerts</span>
                </div>
                <Badge className="bg-red-500 text-white">{sosAlerts.length} Active</Badge>
              </div>
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {sosAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-2 rounded bg-red-500/20 border border-red-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      <div>
                        <div className="font-medium text-sm">{alert.user_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    {alert.user_phone && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 gap-1"
                        onClick={() => window.open(`tel:${alert.user_phone}`)}
                      >
                        <PhoneCall className="h-3 w-3" />
                        Call
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Attention Items Panel */}
          {(metrics?.awaitingDriver ?? 0) > 0 || (metrics?.shuttlesNearCapacity ?? 0) > 0 || (metrics?.rosterGaps ?? 0) > 0 ? (
            <Card className="shrink-0 border-amber-500/50 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 mb-2 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-semibold">Attention Items</span>
              </div>
              <div className="space-y-2 text-sm">
                {metrics && metrics.oldestUnassignedSeconds > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <span>Oldest unassigned request</span>
                    <span className={`font-mono ${metrics.oldestUnassignedSeconds > 300 ? "text-red-400" : "text-amber-400"}`}>
                      {formatDuration(metrics.oldestUnassignedSeconds)}
                    </span>
                  </div>
                )}
                {metrics && metrics.shuttlesNearCapacity > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <span>Shuttles near capacity</span>
                    <span className="text-amber-400 font-medium">{metrics.shuttlesNearCapacity}</span>
                  </div>
                )}
                {rosterGaps.length > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <span>Roster gaps (no driver)</span>
                    <span className="text-amber-400 font-medium">{rosterGaps.length}</span>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {/* Live Map */}
          <Card className="flex-1 min-h-[200px] overflow-hidden">
            <ControlRoomMap
              trips={mapMarkers}
              onMarkerClick={(id, type) => {
                if (type === 'taxi') {
                  const trip = activeTrips.find(t => t.driver_id === id)
                  if (trip) viewTripDetails(trip)
                }
              }}
            />
          </Card>

          {/* Fleet Summary */}
          <Card className="shrink-0 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Fleet Status
              </h2>
              <span className="text-xs text-muted-foreground">{totalDrivers} drivers</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded bg-green-500/10 text-center">
                <div className="text-lg font-bold text-green-400">{onlineDrivers}</div>
                <div className="text-[10px] text-muted-foreground">Active</div>
              </div>
              <div className="p-2 rounded bg-amber-500/10 text-center">
                <div className="text-lg font-bold text-amber-400">{onBreakDrivers}</div>
                <div className="text-[10px] text-muted-foreground">On Break</div>
              </div>
              <div className="p-2 rounded bg-gray-500/10 text-center">
                <div className="text-lg font-bold text-gray-400">{offlineDrivers}</div>
                <div className="text-[10px] text-muted-foreground">Offline</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Shuttles + Trends */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          {/* Active Shuttles */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Bus className="h-4 w-4 text-green-400" />
                Active Shuttles
              </h2>
              <span className="text-xs text-muted-foreground">
                {activeShuttles.length} running
              </span>
            </div>
            <Card className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto p-2 space-y-2">
                {activeShuttles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Bus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No active shuttles</p>
                    </div>
                  </div>
                ) : (
                  activeShuttles.map((shuttle) => {
                    const occupancyPct = shuttle.vehicle_capacity > 0
                      ? (shuttle.passengers_on_board / shuttle.vehicle_capacity) * 100
                      : 0
                    const isNearCapacity = occupancyPct >= 80
                    const progressPct = shuttle.total_stops
                      ? ((shuttle.current_stop_index + 1) / shuttle.total_stops) * 100
                      : 0

                    // If backup is assigned, don't show as urgent
                    const showUrgentFull = shuttle.is_full && !shuttle.has_backup_assigned

                    return (
                      <div
                        key={shuttle.id}
                        className={`p-3 rounded-lg border transition-all ${
                          showUrgentFull
                            ? "border-red-500/50 bg-red-500/5 animate-pulse"
                            : shuttle.is_full && shuttle.has_backup_assigned
                            ? "border-green-500/50 bg-green-500/5"
                            : isNearCapacity
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "bg-muted/30 border-transparent"
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              showUrgentFull ? "bg-red-500" :
                              shuttle.is_full && shuttle.has_backup_assigned ? "bg-green-500" :
                              isNearCapacity ? "bg-amber-500" : "bg-green-500"
                            }`} />
                            <span className="font-bold text-sm">
                              {shuttle.route?.route_code || "BUS"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {shuttle.vehicle_number}
                            </span>
                          </div>
                          {shuttle.is_full && (
                            shuttle.has_backup_assigned ? (
                              <Badge className="bg-green-500 text-white text-[9px]">BACKUP SENT</Badge>
                            ) : (
                              <Badge className="bg-red-500 text-white text-[9px]">FULL</Badge>
                            )
                          )}
                        </div>

                        {/* Route name + Driver */}
                        <div className="text-[10px] text-muted-foreground mb-2 truncate">
                          {shuttle.route?.route_name}
                          {shuttle.driver_name && (
                            <span className="ml-2 text-primary">• {shuttle.driver_name}</span>
                          )}
                        </div>

                        {/* Occupancy bar */}
                        <div className="mb-2">
                          <OccupancyBar
                            current={shuttle.passengers_on_board}
                            capacity={shuttle.vehicle_capacity}
                            isFull={shuttle.is_full}
                          />
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                            {shuttle.current_stop_index + 1}/{shuttle.total_stops || "?"}
                          </span>
                        </div>
                        {shuttle.current_stop_name && (
                          <div className="text-[9px] text-muted-foreground mt-1 truncate">
                            @ {shuttle.current_stop_name}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Hourly Trend Chart */}
          <Card className="shrink-0 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                Today's Activity
              </h2>
              <span className="text-xs text-muted-foreground">
                {hourlyTrends.reduce((sum, h) => sum + h.requests, 0)} requests
              </span>
            </div>
            <div className="h-10">
              <Sparkline
                data={hourlyTrends.map(h => h.requests)}
                color="#3b82f6"
                height={40}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>00:00</span>
              <span>Now</span>
            </div>
          </Card>

          {/* Shift Ending Soon */}
          {shiftWarnings.length > 0 && (
            <Card className="shrink-0 p-3 border-orange-500/50 bg-orange-500/5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-orange-400">
                  <UserMinus className="h-4 w-4" />
                  Shift Ending Soon
                </h2>
                <span className="text-xs text-muted-foreground">{shiftWarnings.length}</span>
              </div>
              <div className="space-y-1 max-h-[80px] overflow-y-auto">
                {shiftWarnings.map((warning) => (
                  <div
                    key={warning.driver_id}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      warning.has_active_ride ? "bg-red-500/20 border border-red-500/50" : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[100px]">{warning.driver_name}</span>
                      {warning.has_active_ride && (
                        <Badge variant="outline" className="text-[9px] border-red-500 text-red-400">
                          On Trip
                        </Badge>
                      )}
                    </div>
                    <span className={`font-mono text-xs ${
                      warning.minutes_remaining <= 10 ? "text-red-400" : "text-orange-400"
                    }`}>
                      {warning.minutes_remaining}m
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Scheduled Rides Queue */}
          {scheduledRides.length > 0 && (
            <Card className="shrink-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-purple-400">
                  <CalendarClock className="h-4 w-4" />
                  Upcoming Scheduled
                </h2>
                <span className="text-xs text-muted-foreground">{scheduledRides.length}</span>
              </div>
              <div className="space-y-1 max-h-[80px] overflow-y-auto">
                {scheduledRides.map((ride) => (
                  <div
                    key={ride.id}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      ride.minutes_until <= 30 ? "bg-purple-500/20" : "bg-muted/50"
                    }`}
                  >
                    <div className="truncate max-w-[140px]">
                      <div className="text-xs font-medium">{ride.customer_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{ride.pickup_name}</div>
                    </div>
                    <span className={`font-mono text-xs whitespace-nowrap ${
                      ride.minutes_until <= 30 ? "text-purple-400" : "text-muted-foreground"
                    }`}>
                      {ride.minutes_until}m
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Live Ratings Ticker */}
          {recentRatings.length > 0 && (
            <Card className="shrink-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-yellow-400">
                  <Star className="h-4 w-4 fill-yellow-400" />
                  Recent Ratings
                </h2>
              </div>
              <div className="space-y-1 max-h-[60px] overflow-y-auto">
                {recentRatings.slice(0, 3).map((rating) => (
                  <div
                    key={rating.id}
                    className="flex items-center justify-between p-1.5 rounded bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-2.5 w-2.5 ${
                              i < rating.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "fill-muted text-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {rating.driver_name}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(rating.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Circle className={`h-2 w-2 fill-green-500 text-green-500 ${isUpdating ? "" : "animate-pulse"}`} />
            <span>Live • Realtime updates</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">R</kbd> Refresh
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">F</kbd> Fullscreen
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">M</kbd> Mute
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">0-2</kbd> Filter
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!audioEnabled && (
            <span className="text-amber-500 flex items-center gap-1">
              <VolumeX className="h-3 w-3" /> Muted
            </span>
          )}
          <span>Updated: {format(lastUpdate, "HH:mm:ss")}</span>
        </div>
      </div>

      {/* Trip Detail Dialog */}
      <Dialog open={tripDetailOpen} onOpenChange={setTripDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Trip Details
            </DialogTitle>
          </DialogHeader>
          {selectedTrip && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={`${STATUS_COLORS[selectedTrip.status]} text-white`}>
                  {STATUS_LABELS[selectedTrip.status as keyof typeof STATUS_LABELS] || selectedTrip.status}
                </Badge>
              </div>

              {/* Customer */}
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Customer</div>
                <div className="font-medium">{selectedTrip.customer?.full_name || "Unknown"}</div>
                {selectedTrip.customer?.phone && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{selectedTrip.customer.phone}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => window.open(`tel:${selectedTrip.customer?.phone}`)}
                    >
                      <PhoneCall className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {selectedTrip.customer?.department?.name && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedTrip.customer.department.name}
                  </div>
                )}
              </div>

              {/* Route */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Pickup</div>
                    <div className="text-sm">{selectedTrip.pickup_name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Dropoff</div>
                    <div className="text-sm">{selectedTrip.dropoff_name}</div>
                  </div>
                </div>
              </div>

              {/* Driver */}
              {selectedTrip.driver && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-1">Driver</div>
                  <div className="font-medium">
                    {(selectedTrip.driver.profile as any)?.full_name || "Assigned"}
                  </div>
                  {selectedTrip.driver.vehicle && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Vehicle: {selectedTrip.driver.vehicle.vehicle_number}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-2 text-sm">
                <div className="text-xs text-muted-foreground mb-2">Timeline</div>
                <div className="flex items-center justify-between">
                  <span>Requested</span>
                  <span className="tabular-nums">{format(new Date(selectedTrip.created_at), "HH:mm:ss")}</span>
                </div>
                {selectedTrip.accepted_at && (
                  <div className="flex items-center justify-between">
                    <span>Accepted</span>
                    <span className="tabular-nums">{format(new Date(selectedTrip.accepted_at), "HH:mm:ss")}</span>
                  </div>
                )}
                {selectedTrip.arrived_at && (
                  <div className="flex items-center justify-between">
                    <span>Driver Arrived</span>
                    <span className="tabular-nums">{format(new Date(selectedTrip.arrived_at), "HH:mm:ss")}</span>
                  </div>
                )}
                {selectedTrip.started_at && (
                  <div className="flex items-center justify-between">
                    <span>Trip Started</span>
                    <span className="tabular-nums">{format(new Date(selectedTrip.started_at), "HH:mm:ss")}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setTripDetailOpen(false)}
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    cancelTrip(selectedTrip.id)
                    setTripDetailOpen(false)
                  }}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Trip
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}

// Metric Card Component
function MetricCard({
  icon,
  label,
  value,
  delta,
  lowerIsBetter = false,
  color = "text-foreground",
  alert = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  delta?: number
  lowerIsBetter?: boolean
  color?: string
  alert?: boolean
}) {
  const showDelta = delta !== undefined && delta !== 0
  const deltaPositive = lowerIsBetter ? delta! < 0 : delta! > 0

  return (
    <Card className={`p-3 ${alert ? "border-red-500/50 bg-red-500/5" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-lg font-bold ${color}`}>{value}</span>
        {showDelta && (
          <span className={`text-[10px] flex items-center ${deltaPositive ? "text-green-400" : "text-red-400"}`}>
            {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(Math.round(delta!))}
          </span>
        )}
      </div>
    </Card>
  )
}

// Sparkline Chart Component
function Sparkline({
  data,
  color = "#22c55e",
  height = 32,
  showArea = true,
}: {
  data: number[]
  color?: string
  height?: number
  showArea?: boolean
}) {
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 100

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(" ")

  const areaPath = `M0,${height} L${points} L${width},${height} Z`
  const linePath = `M${points}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      {showArea && (
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.1}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * height}
          r={2}
          fill={color}
        />
      )}
    </svg>
  )
}

// Occupancy Bar Component
function OccupancyBar({
  current,
  capacity,
  isFull,
}: {
  current: number
  capacity: number
  isFull: boolean
}) {
  const pct = capacity > 0 ? (current / capacity) * 100 : 0
  const isNearCapacity = pct >= 80

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isFull ? "bg-red-500" : isNearCapacity ? "bg-amber-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className={`text-xs font-medium w-10 text-right ${
          isFull ? "text-red-400" : isNearCapacity ? "text-amber-400" : "text-green-400"
        }`}>
          {current}/{capacity}
        </span>
      </div>
      {/* Capacity segments */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 border-r border-background/50 last:border-r-0"
          />
        ))}
      </div>
    </div>
  )
}
