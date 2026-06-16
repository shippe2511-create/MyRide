"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus, Bus, Ship, Loader2, Clock, MapPin, RefreshCw
} from "lucide-react"
import { toast } from "sonner"

interface TransportRoute {
  id: string
  transport_type: string
  route_name: string
  route_code: string | null
  direction: string
  is_active: boolean
  schedules?: { departure_time: string; days_of_week: string[] }[]
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function SchedulingPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("internal_bus")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    transport_type: "internal_bus",
    route_name: "",
    route_code: "",
    direction: "outbound",
    is_active: true,
  })

  useEffect(() => {
    loadRoutes()
  }, [])

  const loadRoutes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("transport_routes")
      .select("*, schedules:route_schedules(departure_time, days_of_week)")
      .order("route_name")

    setRoutes(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!formData.route_name) {
      toast.error("Route name is required")
      return
    }

    setSaving(true)
    const { error } = await supabase.from("transport_routes").insert({
      transport_type: formData.transport_type,
      route_name: formData.route_name,
      route_code: formData.route_code || null,
      direction: formData.direction,
      is_active: formData.is_active,
    })

    if (error) {
      toast.error("Failed to create route")
    } else {
      toast.success("Route created")
      setDialogOpen(false)
      setFormData({ transport_type: activeTab, route_name: "", route_code: "", direction: "outbound", is_active: true })
      loadRoutes()
    }
    setSaving(false)
  }

  const filteredRoutes = routes.filter(r => r.transport_type === activeTab)

  const stats = {
    total: filteredRoutes.length,
    active: filteredRoutes.filter(r => r.is_active).length,
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
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-sm text-muted-foreground">Manage transport routes and schedules</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRoutes}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { setFormData({ ...formData, transport_type: activeTab }); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Route
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="internal_bus" className="gap-2">
            <Bus className="h-4 w-4" />
            Internal Bus
          </TabsTrigger>
          <TabsTrigger value="mtcc_bus" className="gap-2">
            <Bus className="h-4 w-4" />
            MTCC Bus
          </TabsTrigger>
          <TabsTrigger value="ferry" className="gap-2">
            <Ship className="h-4 w-4" />
            Ferry
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="grid gap-3 grid-cols-2 mb-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Routes</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Clock className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-500">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Schedules</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No routes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoutes.map(route => (
                    <TableRow key={route.id}>
                      <TableCell className="font-medium">{route.route_name}</TableCell>
                      <TableCell>{route.route_code || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{route.direction}</Badge>
                      </TableCell>
                      <TableCell>
                        {route.schedules?.length || 0} times
                      </TableCell>
                      <TableCell>
                        <Badge className={route.is_active ? "bg-green-500" : "bg-gray-500"}>
                          {route.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Route Name</label>
              <Input
                value={formData.route_name}
                onChange={e => setFormData({ ...formData, route_name: e.target.value })}
                placeholder="e.g., Hulhumale to Male"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Route Code</label>
              <Input
                value={formData.route_code}
                onChange={e => setFormData({ ...formData, route_code: e.target.value })}
                placeholder="e.g., HM-01"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Direction</label>
              <Select value={formData.direction} onValueChange={v => setFormData({ ...formData, direction: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.is_active}
                onCheckedChange={c => setFormData({ ...formData, is_active: !!c })}
              />
              <label className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
