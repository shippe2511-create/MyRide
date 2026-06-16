"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  MapPin, Clock, CheckCircle, XCircle, Search, Loader2, RefreshCw, Car
} from "lucide-react"

interface Ride {
  id: string
  pickup_name: string
  dropoff_name: string
  status: string
  created_at: string
  completed_at: string | null
  customer: { full_name: string; phone: string | null } | null
  driver?: { profile: { full_name: string } } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  accepted: "bg-blue-500",
  arrived: "bg-purple-500",
  in_progress: "bg-indigo-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
}

export default function RidesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rides, setRides] = useState<Ride[]>([])
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 })

  useEffect(() => {
    loadData()
  }, [statusFilter])

  const loadData = async () => {
    setLoading(true)

    let query = supabase
      .from("rides")
      .select(`*, customer:profiles!rides_customer_id_fkey(full_name, phone), driver:drivers!rides_driver_id_fkey(profile:profiles(full_name))`)
      .order("created_at", { ascending: false })
      .limit(50)

    if (statusFilter !== "all") {
      if (statusFilter === "active") {
        query = query.in("status", ["pending", "accepted", "arrived", "in_progress"])
      } else {
        query = query.eq("status", statusFilter)
      }
    }

    const [ridesRes, totalRes, activeRes, completedRes] = await Promise.all([
      query,
      supabase.from("rides").select("*", { count: "exact", head: true }),
      supabase.from("rides").select("*", { count: "exact", head: true }).in("status", ["pending", "accepted", "arrived", "in_progress"]),
      supabase.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
    ])

    setRides(ridesRes.data || [])
    setStats({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      completed: completedRes.count || 0,
    })
    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    })
  }

  const filteredRides = rides.filter(ride => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      ride.customer?.full_name?.toLowerCase().includes(s) ||
      ride.pickup_name?.toLowerCase().includes(s) ||
      ride.dropoff_name?.toLowerCase().includes(s)
    )
  })

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
          <h1 className="text-2xl font-bold">Rides</h1>
          <p className="text-sm text-muted-foreground">Monitor and manage all rides</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Rides</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
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
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No rides found
                </TableCell>
              </TableRow>
            ) : (
              filteredRides.map(ride => (
                <TableRow
                  key={ride.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRide(ride)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{ride.customer?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{ride.customer?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{ride.customer?.phone || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p className="truncate max-w-[200px]">{ride.pickup_name}</p>
                      <p className="text-muted-foreground truncate max-w-[200px]">→ {ride.dropoff_name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {ride.driver?.profile?.full_name || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[ride.status] || "bg-gray-500"}>
                      {ride.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(ride.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedRide} onOpenChange={() => setSelectedRide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ride Details</DialogTitle>
          </DialogHeader>
          {selectedRide && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedRide.customer?.full_name}</p>
                  <p className="text-sm">{selectedRide.customer?.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Driver</p>
                  <p className="font-medium">{selectedRide.driver?.profile?.full_name || "Not assigned"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Route</p>
                <p className="font-medium">{selectedRide.pickup_name}</p>
                <p className="text-sm text-muted-foreground">→ {selectedRide.dropoff_name}</p>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={STATUS_COLORS[selectedRide.status]}>{selectedRide.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="text-sm">{formatDate(selectedRide.created_at)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
