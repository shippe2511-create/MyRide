"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Plus,
  XCircle,
  FileWarning,
  Trash2,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterPills } from "@/components/ui/filter-pills"
import { PermissionGate } from "@/components/permission-gate"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Incident {
  id: string
  ride_id: string | null
  type: string
  severity: string
  title: string
  description: string | null
  status: string
  location_name: string | null
  reporter_name: string | null
  created_at: string
  resolved_at: string | null
  resolution: string | null
  customer?: { full_name: string } | null
  driver?: { profile?: { full_name: string } } | null
}

export default function IncidentsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "add" | "resolve" | null>(null)
  const [formData, setFormData] = useState({
    type: "complaint",
    severity: "medium",
    title: "",
    description: "",
    location_name: "",
    reporter_name: "",
  })
  const [resolution, setResolution] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    loadIncidents(true)

    const channel = supabase
      .channel('incidents_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        loadIncidents(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [statusFilter, severityFilter])

  const loadIncidents = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    let query = supabase
      .from("incidents")
      .select(`*`)
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }
    if (severityFilter !== "all") {
      query = query.eq("severity", severityFilter)
    }

    const { data, error } = await query
    if (error) {
      toast.error("Failed to load incidents")
    } else {
      setIncidents(data || [])
    }
    if (showLoading) setLoading(false)
  }

  const filteredIncidents = incidents.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.type.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("Title is required")
      return
    }
    setDialogType(null)
    const { data, error } = await supabase.from("incidents").insert({
      type: formData.type,
      severity: formData.severity,
      title: formData.title,
      description: formData.description || null,
      location_name: formData.location_name || null,
      reporter_name: formData.reporter_name || null,
      status: "open",
    }).select().single()
    if (error) {
      toast.error("Failed to create incident")
    } else {
      toast.success("Incident created")
      setFormData({ type: "complaint", severity: "medium", title: "", description: "", location_name: "", reporter_name: "" })
      if (data) {
        setIncidents(prev => [data, ...prev])
      }
    }
  }

  const handleResolve = async () => {
    if (!selectedIncident) return
    const incidentId = selectedIncident.id
    setDialogType(null)
    setSelectedIncident(null)

    const { error } = await supabase
      .from("incidents")
      .update({
        status: "resolved",
        resolution: resolution || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", incidentId)

    if (error) {
      toast.error("Failed to resolve incident")
    } else {
      toast.success("Incident resolved")
      setResolution("")
      setIncidents(prev => prev.map(i =>
        i.id === incidentId ? { ...i, status: "resolved", resolution: resolution || null } : i
      ))
    }
  }

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("incidents").update({ status }).eq("id", id)
    if (error) {
      toast.error("Failed to update status")
    } else {
      toast.success("Status updated")
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    }
  }

  const severityBadge = (severity: string) => {
    switch (severity) {
      case "high": return <Badge variant="destructive">High</Badge>
      case "medium": return <Badge variant="warning">Medium</Badge>
      case "low": return <Badge variant="secondary">Low</Badge>
      default: return <Badge variant="secondary">{severity}</Badge>
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Open</Badge>
      case "investigating": return <Badge variant="warning"><Clock className="mr-1 h-3 w-3" />Investigating</Badge>
      case "resolved": return <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" />Resolved</Badge>
      case "closed": return <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" />Closed</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("incidents")
      .delete()
      .in("id", idsToDelete)

    if (error) {
      toast.error("Failed to delete selected incidents")
    } else {
      toast.success(`${idsToDelete.length} incident(s) deleted`)
      setSelectedIds(new Set())
      loadIncidents()
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIncidents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredIncidents.map(i => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-48 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="sos:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            Incident Management
          </h1>
          <p className="text-sm text-muted-foreground">Track and resolve service incidents</p>
        </div>
        <Button onClick={() => setDialogType("add")}>
          <Plus className="mr-2 h-4 w-4" />
          Report Incident
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{incidents.filter(i => i.status === "open").length}</p>
              <p className="text-xs text-muted-foreground truncate">Open</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{incidents.filter(i => i.status === "investigating").length}</p>
              <p className="text-xs text-muted-foreground truncate">Investigating</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{incidents.filter(i => i.status === "resolved").length}</p>
              <p className="text-xs text-muted-foreground truncate">Resolved</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <XCircle className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{incidents.filter(i => i.status === "closed").length}</p>
              <p className="text-xs text-muted-foreground truncate">Closed</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <FilterPills
        filters={[
          ...(statusFilter !== "all" ? [{ key: "status", label: "Status", value: statusFilter }] : []),
          ...(severityFilter !== "all" ? [{ key: "severity", label: "Severity", value: severityFilter }] : []),
        ]}
        onRemove={(key) => {
          if (key === "status") setStatusFilter("all")
          if (key === "severity") setSeverityFilter("all")
        }}
        onClearAll={() => {
          setStatusFilter("all")
          setSeverityFilter("all")
        }}
      />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Selected
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={filteredIncidents.length > 0 && selectedIds.size === filteredIncidents.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Incident</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredIncidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-16">
                  <EmptyState
                    icon="incidents"
                    title="No incidents found"
                    description={statusFilter !== "all" || severityFilter !== "all" ? "Try adjusting your filters" : "Incidents will appear here when reported"}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredIncidents.map((incident) => (
                <TableRow key={incident.id} className={`group hover:bg-muted/50 transition-colors ${selectedIds.has(incident.id) ? 'bg-muted/50' : ''}`}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(incident.id)}
                      onCheckedChange={() => toggleSelect(incident.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{incident.title}</p>
                      {incident.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{incident.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{incident.type}</TableCell>
                  <TableCell>{severityBadge(incident.severity)}</TableCell>
                  <TableCell>{statusBadge(incident.status)}</TableCell>
                  <TableCell>{incident.reporter_name || "-"}</TableCell>
                  <TableCell>{incident.location_name || "-"}</TableCell>
                  <TableCell>{formatDate(incident.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setSelectedIncident(incident); setDialogType("view") }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedIncident(incident); setDialogType("view") }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {incident.status !== "resolved" && incident.status !== "closed" && (
                            <>
                              <DropdownMenuItem onClick={() => updateStatus(incident.id, "investigating")}>
                                <Clock className="mr-2 h-4 w-4" />
                                Mark Investigating
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedIncident(incident); setDialogType("resolve") }}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Resolve
                              </DropdownMenuItem>
                            </>
                          )}
                          {incident.status === "resolved" && (
                            <DropdownMenuItem onClick={() => updateStatus(incident.id, "closed")}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Close
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Incident(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected incident(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogType === "add"} onOpenChange={(open) => { if (!open) setDialogType(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report New Incident</DialogTitle>
            <DialogDescription>Create a new incident report</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief description of the incident"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="accident">Accident</SelectItem>
                    <SelectItem value="safety">Safety Issue</SelectItem>
                    <SelectItem value="vehicle">Vehicle Problem</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Severity</label>
                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Reporter Name</label>
                <Input
                  value={formData.reporter_name}
                  onChange={(e) => setFormData({ ...formData, reporter_name: e.target.value })}
                  placeholder="Who reported this?"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  placeholder="Where did this occur?"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of what happened..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Incident</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === "view"} onOpenChange={(open) => { if (!open) { setDialogType(null); setSelectedIncident(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedIncident?.title}</DialogTitle>
            <DialogDescription>Incident details</DialogDescription>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {severityBadge(selectedIncident.severity)}
                {statusBadge(selectedIncident.status)}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p className="capitalize">{selectedIncident.type}</p>
              </div>
              {selectedIncident.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p>{selectedIncident.description}</p>
                </div>
              )}
              {selectedIncident.reporter_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Reporter</p>
                  <p>{selectedIncident.reporter_name}</p>
                </div>
              )}
              {selectedIncident.location_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p>{selectedIncident.location_name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p>{formatDate(selectedIncident.created_at)}</p>
              </div>
              {selectedIncident.resolution && (
                <div>
                  <p className="text-sm text-muted-foreground">Resolution</p>
                  <p>{selectedIncident.resolution}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === "resolve"} onOpenChange={(open) => { if (!open) { setDialogType(null); setSelectedIncident(null); setResolution("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
            <DialogDescription>Provide resolution details for: {selectedIncident?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Resolution Notes</label>
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="How was this incident resolved?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleResolve}>Mark as Resolved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
