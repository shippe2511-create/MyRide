"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  AlertTriangle, Phone, MapPin, Clock, CheckCircle, XCircle, Shield,
  Loader2, RefreshCw, User, Car, ExternalLink, Bell
} from "lucide-react"
import { toast } from "sonner"

interface SOSAlert {
  id: string
  user_id: string
  ride_id: string | null
  driver_id: string | null
  status: "active" | "responding" | "resolved" | "false_alarm"
  latitude: number | null
  longitude: number | null
  location_address: string | null
  notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  user?: {
    full_name: string
    phone: string | null
    avatar_url: string | null
  }
  driver?: {
    full_name: string
    phone: string | null
    avatar_url: string | null
  }
  ride?: {
    id: string
    status: string
    pickup_address: string | null
    dropoff_address: string | null
  }
}

const STATUS_CONFIG = {
  active: { label: "Active", color: "destructive", icon: AlertTriangle },
  responding: { label: "Responding", color: "warning", icon: Bell },
  resolved: { label: "Resolved", color: "success", icon: CheckCircle },
  false_alarm: { label: "False Alarm", color: "secondary", icon: XCircle },
}

export default function SOSPage() {
  const supabase = createClient()
  const [alerts, setAlerts] = useState<SOSAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("active")
  const [selectedAlert, setSelectedAlert] = useState<SOSAlert | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [resolveNotes, setResolveNotes] = useState("")

  const [stats, setStats] = useState({
    active: 0,
    responding: 0,
    resolvedToday: 0,
    total: 0,
  })

  const loadAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("sos_alerts")
      .select(`
        *,
        user:profiles!sos_alerts_user_id_fkey(full_name, phone, avatar_url),
        driver:profiles!sos_alerts_driver_id_fkey(full_name, phone, avatar_url),
        ride:rides(id, status, pickup_address, dropoff_address)
      `)
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load SOS alerts")
      setLoading(false)
      return
    }

    const alertsData = data || []
    setAlerts(alertsData)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    setStats({
      active: alertsData.filter(a => a.status === "active").length,
      responding: alertsData.filter(a => a.status === "responding").length,
      resolvedToday: alertsData.filter(a =>
        a.status === "resolved" && new Date(a.resolved_at!) >= today
      ).length,
      total: alertsData.length,
    })

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadAlerts()

    const channel = supabase
      .channel('sos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
        loadAlerts()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadAlerts, supabase])

  const updateStatus = async (alertId: string, newStatus: string, notes?: string) => {
    setUpdating(true)

    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === "resolved" || newStatus === "false_alarm") {
      updates.resolved_at = new Date().toISOString()
      if (notes) updates.notes = notes
    }

    const { error } = await supabase
      .from("sos_alerts")
      .update(updates)
      .eq("id", alertId)

    if (error) {
      toast.error("Failed to update alert")
    } else {
      toast.success(`Alert marked as ${newStatus.replace("_", " ")}`)
      loadAlerts()
      setDetailsOpen(false)
      setResolveNotes("")
    }
    setUpdating(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTimeSince = (date: string) => {
    const now = new Date()
    const created = new Date(date)
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank")
  }

  const filteredAlerts = alerts.filter(alert =>
    statusFilter === "all" || alert.status === statusFilter
  )

  const activeAlerts = alerts.filter(a => a.status === "active")

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
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-red-500" />
            SOS Emergency Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monitor and respond to emergency alerts from riders and drivers
          </p>
        </div>
        <Button variant="outline" onClick={() => loadAlerts()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {activeAlerts.length > 0 && (
        <Card className="border-red-500 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
              {activeAlerts.length} Active Emergency Alert{activeAlerts.length > 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeAlerts.slice(0, 3).map(alert => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border border-red-200 cursor-pointer hover:border-red-400 transition-colors"
                  onClick={() => {
                    setSelectedAlert(alert)
                    setDetailsOpen(true)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={alert.user?.avatar_url || undefined} />
                      <AvatarFallback className="bg-red-100 text-red-600">
                        {alert.user?.full_name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{alert.user?.full_name || "Unknown User"}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getTimeSince(alert.created_at)}
                        {alert.location_address && (
                          <>
                            <span className="mx-1">•</span>
                            <MapPin className="h-3 w-3" />
                            {alert.location_address.slice(0, 30)}...
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="destructive">
                    Respond Now
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className={stats.active > 0 ? "border-red-500" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${stats.active > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${stats.active > 0 ? "text-red-500" : ""}`}>
              {stats.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-yellow-500" />
              Responding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-500">{stats.responding}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Resolved Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{stats.resolvedToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All SOS Alerts</CardTitle>
          <CardDescription>
            History of all emergency alerts triggered by users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="responding">Responding</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="false_alarm">False Alarm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No SOS alerts found</p>
                    <p className="text-sm">Emergency alerts will appear here when triggered</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAlerts.map(alert => {
                  const StatusIcon = STATUS_CONFIG[alert.status].icon
                  const statusColor = STATUS_CONFIG[alert.status].color

                  return (
                    <TableRow
                      key={alert.id}
                      className={alert.status === "active" ? "bg-red-50 dark:bg-red-950/20" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={alert.user?.avatar_url || undefined} />
                            <AvatarFallback>{alert.user?.full_name?.[0] || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{alert.user?.full_name || "Unknown"}</p>
                            {alert.user?.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {alert.user.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor as "destructive" | "warning" | "success" | "secondary"}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[alert.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {alert.latitude && alert.longitude ? (
                          <Button
                            variant="link"
                            className="p-0 h-auto text-left"
                            onClick={() => openGoogleMaps(alert.latitude!, alert.longitude!)}
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            {alert.location_address?.slice(0, 25) || "View on map"}...
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">No location</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {alert.driver ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={alert.driver.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {alert.driver.full_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{alert.driver.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getTimeSince(alert.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAlert(alert)
                            setDetailsOpen(true)
                          }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={selectedAlert?.status === "active" ? "text-red-500" : "text-muted-foreground"} />
              SOS Alert Details
            </DialogTitle>
            <DialogDescription>
              Triggered {selectedAlert && formatDate(selectedAlert.created_at)}
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={selectedAlert.user?.avatar_url || undefined} />
                  <AvatarFallback className="text-lg">
                    {selectedAlert.user?.full_name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-semibold text-lg">{selectedAlert.user?.full_name || "Unknown User"}</p>
                  {selectedAlert.user?.phone && (
                    <a
                      href={`tel:${selectedAlert.user.phone}`}
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {selectedAlert.user.phone}
                    </a>
                  )}
                </div>
                <Badge variant={STATUS_CONFIG[selectedAlert.status].color as "destructive" | "warning" | "success" | "secondary"}>
                  {STATUS_CONFIG[selectedAlert.status].label}
                </Badge>
              </div>

              {selectedAlert.latitude && selectedAlert.longitude && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    {selectedAlert.location_address || `${selectedAlert.latitude}, ${selectedAlert.longitude}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openGoogleMaps(selectedAlert.latitude!, selectedAlert.longitude!)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Google Maps
                  </Button>
                </div>
              )}

              {selectedAlert.driver && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Assigned Driver
                  </p>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={selectedAlert.driver.avatar_url || undefined} />
                      <AvatarFallback>{selectedAlert.driver.full_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{selectedAlert.driver.full_name}</p>
                      {selectedAlert.driver.phone && (
                        <a href={`tel:${selectedAlert.driver.phone}`} className="text-sm text-primary">
                          {selectedAlert.driver.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selectedAlert.ride && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Related Ride
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedAlert.ride.pickup_address} → {selectedAlert.ride.dropoff_address}
                  </p>
                  <Badge variant="outline" className="mt-2">{selectedAlert.ride.status}</Badge>
                </div>
              )}

              {selectedAlert.notes && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground">{selectedAlert.notes}</p>
                </div>
              )}

              {(selectedAlert.status === "active" || selectedAlert.status === "responding") && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">Resolution Notes</p>
                  <Textarea
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    placeholder="Add notes about the resolution..."
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedAlert?.status === "active" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateStatus(selectedAlert.id, "responding")}
                  disabled={updating}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Mark Responding
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => updateStatus(selectedAlert.id, "false_alarm", resolveNotes)}
                  disabled={updating}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  False Alarm
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => updateStatus(selectedAlert.id, "resolved", resolveNotes)}
                  disabled={updating}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
              </>
            )}
            {selectedAlert?.status === "responding" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => updateStatus(selectedAlert.id, "false_alarm", resolveNotes)}
                  disabled={updating}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  False Alarm
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => updateStatus(selectedAlert.id, "resolved", resolveNotes)}
                  disabled={updating}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
              </>
            )}
            {(selectedAlert?.status === "resolved" || selectedAlert?.status === "false_alarm") && (
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
