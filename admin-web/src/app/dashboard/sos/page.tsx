"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle, Phone, MapPin, Clock, CheckCircle, XCircle, Loader2, RefreshCw, Shield
} from "lucide-react"
import { toast } from "sonner"

interface SOSAlert {
  id: string
  user_id: string
  status: string
  latitude: number | null
  longitude: number | null
  location_address: string | null
  notes: string | null
  created_at: string
  user?: { full_name: string; phone: string | null }
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-red-500",
  responding: "bg-yellow-500",
  resolved: "bg-green-500",
  false_alarm: "bg-gray-500",
}

export default function SOSPage() {
  const supabase = createClient()
  const [alerts, setAlerts] = useState<SOSAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedAlert, setSelectedAlert] = useState<SOSAlert | null>(null)
  const [saving, setSaving] = useState(false)

  const [stats, setStats] = useState({ active: 0, responding: 0, resolved: 0 })

  useEffect(() => {
    loadAlerts()
  }, [statusFilter])

  const loadAlerts = async () => {
    setLoading(true)

    let query = supabase
      .from("sos_alerts")
      .select("*, user:profiles!sos_alerts_user_id_fkey(full_name, phone)")
      .order("created_at", { ascending: false })
      .limit(50)

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }

    const [alertsRes, activeRes, respondingRes, resolvedRes] = await Promise.all([
      query,
      supabase.from("sos_alerts").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("sos_alerts").select("*", { count: "exact", head: true }).eq("status", "responding"),
      supabase.from("sos_alerts").select("*", { count: "exact", head: true }).eq("status", "resolved"),
    ])

    setAlerts(alertsRes.data || [])
    setStats({
      active: activeRes.count || 0,
      responding: respondingRes.count || 0,
      resolved: resolvedRes.count || 0,
    })
    setLoading(false)
  }

  const updateStatus = async (alertId: string, newStatus: string) => {
    setSaving(true)
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === "resolved" || newStatus === "false_alarm") {
      updates.resolved_at = new Date().toISOString()
    }

    const { error } = await supabase.from("sos_alerts").update(updates).eq("id", alertId)

    if (error) {
      toast.error("Failed to update")
    } else {
      toast.success("Alert updated")
      setSelectedAlert(null)
      loadAlerts()
    }
    setSaving(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    })
  }

  const openMap = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank")
  }

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" />
            SOS Alerts
          </h1>
          <p className="text-sm text-muted-foreground">Emergency alerts from users</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAlerts}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className={`p-4 ${stats.active > 0 ? "border-red-500" : ""}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.active > 0 ? "bg-red-500/10" : "bg-muted"}`}>
              <AlertTriangle className={`h-5 w-5 ${stats.active > 0 ? "text-red-500 animate-pulse" : ""}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${stats.active > 0 ? "text-red-500" : ""}`}>{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-500">{stats.responding}</p>
              <p className="text-xs text-muted-foreground">Responding</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="responding">Responding</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Time</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  No SOS alerts
                </TableCell>
              </TableRow>
            ) : (
              alerts.map(alert => (
                <TableRow
                  key={alert.id}
                  className={alert.status === "active" ? "bg-red-50 dark:bg-red-950/20" : ""}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{alert.user?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{alert.user?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{alert.user?.phone || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[alert.status] || "bg-gray-500"}>
                      {alert.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {alert.latitude && alert.longitude ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto"
                        onClick={() => openMap(alert.latitude!, alert.longitude!)}
                      >
                        <MapPin className="h-3 w-3 mr-1" />
                        View Map
                      </Button>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(alert.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAlert(alert)}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SOS Alert</DialogTitle>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>{selectedAlert.user?.full_name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedAlert.user?.full_name}</p>
                  {selectedAlert.user?.phone && (
                    <a href={`tel:${selectedAlert.user.phone}`} className="text-sm text-primary flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedAlert.user.phone}
                    </a>
                  )}
                </div>
                <Badge className={`ml-auto ${STATUS_COLORS[selectedAlert.status]}`}>
                  {selectedAlert.status}
                </Badge>
              </div>

              {selectedAlert.latitude && selectedAlert.longitude && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openMap(selectedAlert.latitude!, selectedAlert.longitude!)}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Open in Google Maps
                </Button>
              )}

              {selectedAlert.notes && (
                <div className="p-3 bg-muted rounded">
                  <p className="text-sm font-medium">Notes</p>
                  <p className="text-sm text-muted-foreground">{selectedAlert.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedAlert?.status === "active" && (
              <>
                <Button variant="outline" onClick={() => updateStatus(selectedAlert.id, "responding")} disabled={saving}>
                  Mark Responding
                </Button>
                <Button variant="secondary" onClick={() => updateStatus(selectedAlert.id, "false_alarm")} disabled={saving}>
                  False Alarm
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(selectedAlert.id, "resolved")} disabled={saving}>
                  Resolve
                </Button>
              </>
            )}
            {selectedAlert?.status === "responding" && (
              <>
                <Button variant="secondary" onClick={() => updateStatus(selectedAlert.id, "false_alarm")} disabled={saving}>
                  False Alarm
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(selectedAlert.id, "resolved")} disabled={saving}>
                  Resolve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
