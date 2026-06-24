"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import {
  Wifi,
  WifiOff,
  Coffee,
  Car,
  Star,
  MapPin,
  Clock,
  Route,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"

interface DriverActivity {
  id: string
  profile_id: string
  is_online: boolean
  is_on_break: boolean
  break_type: string | null
  break_start_time: string | null
  total_trips: number
  rating: number
  current_location_lat: number | null
  current_location_lng: number | null
  updated_at: string
  profile: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string | null
  }
  vehicle: {
    id: string
    display_name: string
    plate_no: string | null
  } | null
}

const supabase = createClient()

export function ActivityTable() {
  const [drivers, setDrivers] = useState<DriverActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ online: 0, onBreak: 0, offline: 0 })

  const fetchDrivers = async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select(`
        id,
        profile_id,
        is_online,
        is_on_break,
        break_type,
        break_start_time,
        total_trips,
        rating,
        current_location_lat,
        current_location_lng,
        updated_at,
        profile:profiles!drivers_profile_id_fkey(id, full_name, avatar_url, phone),
        vehicle:vehicle_types(id, display_name, plate_no)
      `)
      .order("is_online", { ascending: false })
      .order("updated_at", { ascending: false })

    if (!error && data) {
      setDrivers(data as unknown as DriverActivity[])

      const online = data.filter(d => d.is_online && !d.is_on_break).length
      const onBreak = data.filter(d => d.is_on_break).length
      const offline = data.filter(d => !d.is_online).length
      setStats({ online, onBreak, offline })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchDrivers()

    const channel = supabase
      .channel('driver_activity_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchDrivers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const getStatusBadge = (driver: DriverActivity) => {
    if (driver.is_on_break) {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
          <Coffee className="h-3 w-3 mr-1" />
          {driver.break_type || "Break"}
        </Badge>
      )
    }
    if (driver.is_online) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
          <Wifi className="h-3 w-3 mr-1" />
          Online
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
        <WifiOff className="h-3 w-3 mr-1" />
        Offline
      </Badge>
    )
  }

  const formatBreakDuration = (startTime: string | null) => {
    if (!startTime) return "-"
    return formatDistanceToNow(new Date(startTime), { addSuffix: false })
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4">
              <div className="h-12 bg-muted rounded animate-pulse" />
            </Card>
          ))}
        </div>
        <Card className="p-8">
          <div className="h-64 bg-muted rounded animate-pulse" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Wifi className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.online}</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Coffee className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-500">{stats.onBreak}</p>
              <p className="text-xs text-muted-foreground">On Break</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20">
              <WifiOff className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-400">{stats.offline}</p>
              <p className="text-xs text-muted-foreground">Offline</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Activity Table */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Driver Activity</h3>
            <p className="text-sm text-muted-foreground">Real-time driver status and statistics</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDrivers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-center">Today</TableHead>
              <TableHead className="text-center">Total Trips</TableHead>
              <TableHead className="text-center">Rating</TableHead>
              <TableHead>Break Duration</TableHead>
              <TableHead>Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No drivers found
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((driver) => (
                <TableRow key={driver.id} className={driver.is_online ? "bg-green-500/5" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={driver.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(driver.profile?.full_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{driver.profile?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{driver.profile?.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(driver)}</TableCell>
                  <TableCell>
                    {driver.vehicle ? (
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{driver.vehicle.plate_no || driver.vehicle.display_name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">0</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Route className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{driver.total_trips || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="font-medium">{driver.rating?.toFixed(1) || "0.0"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {driver.is_on_break && driver.break_start_time ? (
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="text-sm">{formatBreakDuration(driver.break_start_time)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(driver.updated_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
