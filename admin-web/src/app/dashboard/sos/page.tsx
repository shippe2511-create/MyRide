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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle, Phone, MapPin, Clock, CheckCircle, XCircle, Loader2, RefreshCw, Shield, MoreVertical, Edit, Trash2, Plus, GripVertical, Flame, Heart, Building, Save, Search
} from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from "@dnd-kit/core"
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Breadcrumbs } from "@/components/breadcrumbs"

interface SOSAlert {
  id: string
  user_id: string
  driver_id: string | null
  status: string
  latitude: number | null
  longitude: number | null
  location_address: string | null
  notes: string | null
  created_at: string
  user?: { full_name: string; phone: string | null; role: string | null }
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-red-500",
  responding: "bg-yellow-500",
  resolved: "bg-green-500",
  false_alarm: "bg-gray-500",
}

interface ContactIcon {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface SortableContactItemProps {
  contact: { id: string; name: string; phone: string; icon: string; is_active: boolean }
  updateContact: (id: string, field: string, value: string | boolean) => void
  removeContact: (id: string) => void
  icons: ContactIcon[]
}

function SortableContactItem({ contact, updateContact, removeContact, icons }: SortableContactItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contact.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Input
        value={contact.name}
        onChange={(e) => updateContact(contact.id, "name", e.target.value)}
        placeholder="Contact name"
        className="flex-1"
      />
      <Input
        value={contact.phone}
        onChange={(e) => updateContact(contact.id, "phone", e.target.value)}
        placeholder="Phone number"
        className="w-40"
      />
      <Select value={contact.icon} onValueChange={(v) => updateContact(contact.id, "icon", v)}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {icons.map(icon => (
            <SelectItem key={icon.value} value={icon.value}>
              <div className="flex items-center gap-2">
                <icon.icon className="h-4 w-4" />
                {icon.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Switch
        checked={contact.is_active}
        onCheckedChange={(v) => updateContact(contact.id, "is_active", v)}
      />
      <Button variant="ghost" size="icon" onClick={() => removeContact(contact.id)}>
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  )
}

export default function SOSPage() {
  const supabase = createClient()
  const [alerts, setAlerts] = useState<SOSAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedAlert, setSelectedAlert] = useState<SOSAlert | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [alertToDelete, setAlertToDelete] = useState<string | null>(null)

  const [stats, setStats] = useState({ active: 0, responding: 0, resolved: 0 })

  interface EmergencyContact {
    id: string
    name: string
    phone: string
    icon: string
    sort_order: number
    is_active: boolean
  }

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])
  const [savingContacts, setSavingContacts] = useState(false)

  const CONTACT_ICONS = [
    { value: "shield", label: "Shield (Police)", icon: Shield },
    { value: "heart", label: "Heart (Medical)", icon: Heart },
    { value: "flame", label: "Flame (Fire)", icon: Flame },
    { value: "building", label: "Building (Office)", icon: Building },
    { value: "phone", label: "Phone (General)", icon: Phone },
  ]

  const playAlarmSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.type = 'sawtooth'
      gainNode.gain.value = 0.5

      oscillator.start()

      // Siren effect - sweep between frequencies
      let time = audioContext.currentTime
      for (let i = 0; i < 6; i++) {
        oscillator.frequency.setValueAtTime(600, time)
        oscillator.frequency.linearRampToValueAtTime(1200, time + 0.25)
        oscillator.frequency.linearRampToValueAtTime(600, time + 0.5)
        time += 0.5
      }

      oscillator.stop(audioContext.currentTime + 3)
    } catch (e) {
      console.error('Audio error:', e)
    }
  }

  useEffect(() => {
    loadAlerts()
    loadEmergencyContacts()

    // Real-time subscription for SOS alerts
    const channel = supabase
      .channel('sos_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, (payload) => {
        if (payload.new && payload.new.status === 'active') {
          playAlarmSound()
          toast.error("🚨 NEW SOS ALERT!", { duration: 10000 })
        }
        loadAlerts()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sos_alerts' }, () => {
        loadAlerts()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [statusFilter])

  const loadAlerts = async () => {
    setLoading(true)

    let query = supabase
      .from("sos_alerts")
      .select("*, user:profiles!sos_alerts_user_id_fkey(full_name, phone, role)")
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

  const loadEmergencyContacts = async () => {
    const { data } = await supabase
      .from("emergency_contacts")
      .select("*")
      .order("sort_order")
    setEmergencyContacts(data || [])
  }

  const addEmergencyContact = () => {
    setEmergencyContacts(prev => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        name: "",
        phone: "",
        icon: "phone",
        sort_order: prev.length,
        is_active: true,
      }
    ])
  }

  const updateContact = (id: string, field: string, value: string | boolean) => {
    setEmergencyContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const removeContact = (id: string) => {
    setEmergencyContacts(prev => prev.filter(c => c.id !== id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setEmergencyContacts(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        const reordered = arrayMove(prev, oldIndex, newIndex)
        return reordered.map((c, i) => ({ ...c, sort_order: i }))
      })
    }
  }

  const saveEmergencyContacts = async () => {
    setSavingContacts(true)

    try {
      const existingIds = emergencyContacts.filter(c => !c.id.startsWith("new_")).map(c => c.id)

      if (existingIds.length > 0) {
        await supabase.from("emergency_contacts").delete().not("id", "in", `(${existingIds.join(",")})`)
      } else {
        await supabase.from("emergency_contacts").delete().neq("id", "placeholder")
      }

      const updatedContacts: EmergencyContact[] = []

      for (const contact of emergencyContacts) {
        if (contact.id.startsWith("new_")) {
          const { data } = await supabase.from("emergency_contacts").insert({
            name: contact.name,
            phone: contact.phone,
            icon: contact.icon,
            sort_order: contact.sort_order,
            is_active: contact.is_active,
          }).select().single()
          if (data) updatedContacts.push(data as EmergencyContact)
        } else {
          await supabase.from("emergency_contacts").update({
            name: contact.name,
            phone: contact.phone,
            icon: contact.icon,
            sort_order: contact.sort_order,
            is_active: contact.is_active,
          }).eq("id", contact.id)
          updatedContacts.push(contact)
        }
      }

      setEmergencyContacts(updatedContacts)
      toast.success("Emergency contacts saved")
    } catch (e) {
      toast.error("Failed to save contacts")
    }

    setSavingContacts(false)
  }

  const updateStatus = async (alertId: string, newStatus: string) => {
    setSelectedAlert(null)
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
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus } : a))
    }
    setSaving(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: true
    })
  }

  const openMap = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank")
  }

  const confirmDelete = (alertId: string) => {
    setAlertToDelete(alertId)
    setDeleteDialogOpen(true)
  }

  const deleteAlert = async () => {
    if (!alertToDelete) return
    const idToDelete = alertToDelete
    setDeleteDialogOpen(false)
    setAlertToDelete(null)

    const { error } = await supabase.from("sos_alerts").delete().eq("id", idToDelete)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Alert deleted")
      setAlerts(prev => prev.filter(a => a.id !== idToDelete))
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-48 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" />
            SOS Alerts
          </h1>
          <p className="text-sm text-muted-foreground">Emergency alerts from users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={playAlarmSound}>
            🔊 Test Sound
          </Button>
          <Button variant="outline" size="sm" onClick={loadAlerts}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className={`p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 ${stats.active > 0 ? 'ring-2 ring-red-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <AlertTriangle className={`h-4 w-4 text-red-500 ${stats.active > 0 ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground truncate">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{stats.responding}</p>
              <p className="text-xs text-muted-foreground truncate">Responding</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground truncate">Resolved</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
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
            {alerts.filter(alert => {
              if (!search) return true
              const s = search.toLowerCase()
              return (
                alert.user?.full_name?.toLowerCase().includes(s) ||
                alert.user?.phone?.toLowerCase().includes(s)
              )
            }).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  {search ? "No matching SOS alerts" : "No SOS alerts"}
                </TableCell>
              </TableRow>
            ) : (
              alerts.filter(alert => {
                if (!search) return true
                const s = search.toLowerCase()
                return (
                  alert.user?.full_name?.toLowerCase().includes(s) ||
                  alert.user?.phone?.toLowerCase().includes(s)
                )
              }).map(alert => (
                <TableRow
                  key={alert.id}
                  className={`hover:bg-muted/50 transition-colors ${alert.status === "active" ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{alert.user?.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{alert.user?.full_name || "Unknown"}</p>
                          <Badge variant="outline" className="text-xs">
                            {alert.user?.role === "driver" ? "Driver" : "Customer"}
                          </Badge>
                        </div>
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
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                        <DropdownMenuItem onClick={() => setSelectedAlert(alert)}>
                          <Edit className="h-4 w-4 mr-2" />
                          View / Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500"
                          onClick={() => confirmDelete(alert.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Emergency Contacts Section */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <div>
              <h3 className="font-semibold">Emergency Contacts</h3>
              <p className="text-sm text-muted-foreground">SOS screen emergency contact numbers</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addEmergencyContact}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
            <Button size="sm" onClick={saveEmergencyContacts} disabled={savingContacts}>
              {savingContacts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={emergencyContacts.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <SortableContactItem
                  key={contact.id}
                  contact={contact}
                  updateContact={updateContact}
                  removeContact={removeContact}
                  icons={CONTACT_ICONS}
                />
              ))}
              {emergencyContacts.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No emergency contacts configured</p>
              )}
            </div>
          </SortableContext>
        </DndContext>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SOS Alert</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this SOS alert? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAlert} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
