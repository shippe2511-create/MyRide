"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Loader2, Bus, Users, MapPin, Clock, RefreshCw, TrendingUp, Activity } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"
import { format } from "date-fns"

interface BusTrip {
  id: string
  status: string
  actual_start_time: string
  current_stop_id: string | null
  roster_assignment: {
    id: string
    departure_time: string
    service_date: string
    route: {
      id: string
      route_name: string
      route_code: string
      direction: string
      transport_type: string
    }
    driver: {
      id: string
      profile: { full_name: string }
    }
    vehicle: {
      id: string
      name: string
      plate_no: string
      capacity: number
    }
  }
  current_stop?: {
    id: string
    stop_name: string
    stop_order: number
  }
  passenger_counts: {
    boarded_count: number
    alighted_count: number
  }[]
  total_stops: number
}

interface DailySummary {
  total_trips: number
  completed_trips: number
  active_trips: number
  total_passengers: number
  avg_occupancy: number
}

export default function BusOccupancyPage() {
  const supabase = createClient()
  const [activeTrips, setActiveTrips] = useState<BusTrip[]>([])
  const [summary, setSummary] = useState<DailySummary>({
    total_trips: 0,
    completed_trips: 0,
    active_trips: 0,
    total_passengers: 0,
    avg_occupancy: 0,
  })
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)

    const channel = supabase
      .channel("bus_occupancy")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bus_trips" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stop_passenger_counts" },
        () => loadData()
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [])

  const loadData = async () => {
    try {
      const today = format(new Date(), "yyyy-MM-dd")

      const { data: trips } = await supabase
        .from("bus_trips")
        .select(`
          id,
          status,
          actual_start_time,
          current_stop_id,
          roster_assignment:roster_assignments!bus_trips_roster_assignment_id_fkey(
            id,
            departure_time,
            service_date,
            route:transport_routes(id, route_name, route_code, direction, transport_type),
            driver:drivers(id, profile:profiles(full_name)),
            vehicle:vehicles(id, name, plate_no, capacity)
          )
        `)
        .eq("status", "in_progress")

      const tripsWithCounts: BusTrip[] = []

      if (trips) {
        for (const trip of trips) {
          const { data: counts } = await supabase
            .from("stop_passenger_counts")
            .select("boarded_count, alighted_count")
            .eq("bus_trip_id", trip.id)

          let currentStop = null
          if (trip.current_stop_id) {
            const { data: stop } = await supabase
              .from("route_stops")
              .select("id, stop_name, stop_order")
              .eq("id", trip.current_stop_id)
              .single()
            currentStop = stop
          }

          const routeId = (trip.roster_assignment as any)?.route?.id
          let totalStops = 0
          if (routeId) {
            const { count } = await supabase
              .from("route_stops")
              .select("id", { count: "exact", head: true })
              .eq("route_id", routeId)
            totalStops = count || 0
          }

          tripsWithCounts.push({
            ...trip,
            roster_assignment: trip.roster_assignment as any,
            current_stop: currentStop || undefined,
            passenger_counts: counts || [],
            total_stops: totalStops,
          })
        }
      }

      setActiveTrips(tripsWithCounts)

      const { data: allTrips } = await supabase
        .from("bus_trips")
        .select(`
          id,
          status,
          roster_assignment:roster_assignments!bus_trips_roster_assignment_id_fkey(
            service_date,
            vehicle:vehicles(capacity)
          )
        `)
        .gte("actual_start_time", `${today}T00:00:00`)

      const { data: allCounts } = await supabase
        .from("stop_passenger_counts")
        .select("boarded_count, bus_trip_id")
        .gte("recorded_at", `${today}T00:00:00`)

      const todayTrips = allTrips || []
      const totalPassengers = allCounts?.reduce((sum, c) => sum + (c.boarded_count || 0), 0) || 0

      let avgOccupancy = 0
      if (tripsWithCounts.length > 0) {
        const occupancies = tripsWithCounts.map(trip => {
          const capacity = trip.roster_assignment?.vehicle?.capacity || 4
          const onBoard = trip.passenger_counts.reduce(
            (sum, c) => sum + (c.boarded_count || 0) - (c.alighted_count || 0),
            0
          )
          return Math.min(100, (onBoard / capacity) * 100)
        })
        avgOccupancy = occupancies.reduce((a, b) => a + b, 0) / occupancies.length
      }

      setSummary({
        total_trips: todayTrips.length,
        completed_trips: todayTrips.filter(t => t.status === "completed").length,
        active_trips: tripsWithCounts.length,
        total_passengers: totalPassengers,
        avg_occupancy: Math.round(avgOccupancy),
      })

      setLastUpdate(new Date())
      setLoading(false)
    } catch (e) {
      console.error("Error loading bus occupancy:", e)
      setLoading(false)
    }
  }

  const getOccupancy = (trip: BusTrip) => {
    const capacity = trip.roster_assignment?.vehicle?.capacity || 4
    const onBoard = trip.passenger_counts.reduce(
      (sum, c) => sum + (c.boarded_count || 0) - (c.alighted_count || 0),
      0
    )
    return { onBoard, capacity, percentage: Math.min(100, Math.round((onBoard / capacity) * 100)) }
  }

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500"
    if (percentage >= 70) return "bg-orange-500"
    if (percentage >= 50) return "bg-yellow-500"
    return "bg-green-500"
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const h = parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${minutes} ${ampm}`
  }

  return (
    <PermissionGate permission="settings:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Live Transport Occupancy
            </h1>
            <p className="text-muted-foreground">
              Real-time passenger counts and vehicle occupancy
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Last updated: {format(lastUpdate, "HH:mm:ss")}
            </span>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Bus className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.active_trips}</p>
                  <p className="text-sm text-muted-foreground">Active Trips</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Users className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.total_passengers}</p>
                  <p className="text-sm text-muted-foreground">Passengers Today</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <TrendingUp className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.avg_occupancy}%</p>
                  <p className="text-sm text-muted-foreground">Avg Occupancy</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.total_trips}</p>
                  <p className="text-sm text-muted-foreground">Total Trips</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <MapPin className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.completed_trips}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Trips */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Active Trips
            </CardTitle>
            <CardDescription>
              {activeTrips.length} vehicle{activeTrips.length !== 1 ? "s" : ""} currently in service
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active trips at the moment</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeTrips.map((trip) => {
                  const { onBoard, capacity, percentage } = getOccupancy(trip)
                  const assignment = trip.roster_assignment
                  const route = assignment?.route
                  const driver = assignment?.driver
                  const vehicle = assignment?.vehicle
                  const progress = trip.current_stop
                    ? Math.round((trip.current_stop.stop_order / trip.total_stops) * 100)
                    : 0

                  return (
                    <Card key={trip.id} className="overflow-hidden">
                      <div className={`h-1 ${getOccupancyColor(percentage)}`} />
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold">{route?.route_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {route?.route_code} • {route?.direction}
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                            LIVE
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/50">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {trip.current_stop?.stop_name || "Starting..."}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            Stop {trip.current_stop?.stop_order || 1} of {trip.total_stops}
                          </span>
                        </div>

                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Route Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>

                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Occupancy
                            </span>
                            <span className={`text-lg font-bold ${
                              percentage >= 90 ? "text-red-500" :
                              percentage >= 70 ? "text-orange-500" :
                              percentage >= 50 ? "text-yellow-500" :
                              "text-green-500"
                            }`}>
                              {onBoard}/{capacity}
                            </span>
                          </div>
                          <Progress
                            value={percentage}
                            className={`h-3 ${getOccupancyColor(percentage)}`}
                          />
                          <p className="text-xs text-muted-foreground mt-1 text-right">
                            {percentage}% full
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="p-2 rounded bg-muted/50">
                            <p className="text-muted-foreground text-xs">Driver</p>
                            <p className="font-medium truncate">
                              {(driver?.profile as any)?.full_name || "Unassigned"}
                            </p>
                          </div>
                          <div className="p-2 rounded bg-muted/50">
                            <p className="text-muted-foreground text-xs">Vehicle</p>
                            <p className="font-medium truncate">
                              {vehicle?.plate_no || "N/A"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                          <span>
                            Started: {trip.actual_start_time
                              ? format(new Date(trip.actual_start_time), "HH:mm")
                              : "-"}
                          </span>
                          <span>
                            Scheduled: {assignment?.departure_time
                              ? formatTime(assignment.departure_time)
                              : "-"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  )
}
