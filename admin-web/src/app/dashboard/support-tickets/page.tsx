"use client"

import { useState, useEffect } from "react"
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
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  MoreHorizontal,
  MessageSquare,
  CheckCircle,
  Clock,
  Eye,
  XCircle,
  Loader2,
  RefreshCw,
  Ticket,
  AlertCircle,
  Trash2,
  X,
} from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface SupportTicket {
  id: string
  user_id: string
  driver_id: string | null
  ride_id: string | null
  category: string
  description: string
  status: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  admin_notes: string | null
  user?: {
    full_name: string
    phone: string | null
    email: string | null
    employee_id: string | null
  }
  driver?: {
    profile?: {
      full_name: string
      phone: string | null
    }
    vehicle_number: string | null
  } | null
}

const CATEGORIES = [
  { value: "Driver Issue", label: "Driver Issue", color: "bg-orange-500" },
  { value: "App Bug", label: "App Bug", color: "bg-purple-500" },
  { value: "Lost Item", label: "Lost Item", color: "bg-blue-500" },
  { value: "Safety Concern", label: "Safety Concern", color: "bg-red-500" },
  { value: "Other", label: "Other", color: "bg-gray-500" },
]

const PAGE_SIZE = 15

export default function SupportTicketsPage() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "resolve" | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
  })

  const loadTickets = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const start = (currentPage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1

    let query = supabase
      .from("support_tickets")
      .select(`
        *,
        user:profiles!support_tickets_user_id_fkey(full_name, phone, email, employee_id)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(start, end)

    let countQuery = supabase.from("support_tickets").select("*", { count: "exact", head: true })

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter)
      countQuery = countQuery.eq("status", statusFilter)
    }

    const [ticketsRes, filteredCountRes, totalRes, openRes, inProgressRes, resolvedRes] = await Promise.all([
      query,
      countQuery,
      supabase.from("support_tickets").select("*", { count: "exact", head: true }),
      supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
      supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "resolved"),
    ])

    setTickets(ticketsRes.data || [])
    setTotalCount(filteredCountRes.count || 0)
    setStats({
      total: totalRes.count || 0,
      open: openRes.count || 0,
      inProgress: inProgressRes.count || 0,
      resolved: resolvedRes.count || 0,
    })
    setLoading(false)
  }

  useEffect(() => {
    loadTickets(true)

    const channel = supabase
      .channel('support_tickets_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        loadTickets(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      loadTickets(false)
    }
  }, [statusFilter, currentPage])

  const filteredTickets = tickets.filter(t =>
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()) ||
    t.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.user?.employee_id?.toLowerCase().includes(search.toLowerCase())
  )

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString()
    }

    const { error } = await supabase.from("support_tickets").update(updates).eq("id", id)

    if (error) {
      toast.error("Failed to update status")
    } else {
      toast.success(`Ticket ${status === "resolved" ? "resolved" : "updated"}`)
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status, ...updates } : t))

      // Update stats locally
      const oldTicket = tickets.find(t => t.id === id)
      if (oldTicket) {
        setStats(prev => {
          const newStats = { ...prev }
          if (oldTicket.status === "open") newStats.open--
          if (oldTicket.status === "in_progress") newStats.inProgress--
          if (oldTicket.status === "resolved") newStats.resolved--
          if (status === "open") newStats.open++
          if (status === "in_progress") newStats.inProgress++
          if (status === "resolved") newStats.resolved++
          return newStats
        })
      }
    }
  }

  const saveAdminNotes = async () => {
    if (!selectedTicket) return
    setSaving(true)

    const { error } = await supabase
      .from("support_tickets")
      .update({ admin_notes: adminNotes, updated_at: new Date().toISOString() })
      .eq("id", selectedTicket.id)

    if (error) {
      toast.error("Failed to save notes")
    } else {
      toast.success("Notes saved")
      setTickets(prev => prev.map(t =>
        t.id === selectedTicket.id ? { ...t, admin_notes: adminNotes } : t
      ))
      setSelectedTicket(prev => prev ? { ...prev, admin_notes: adminNotes } : null)
    }
    setSaving(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatRelativeTime = (date: string) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(date)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-red-500"><AlertCircle className="mr-1 h-3 w-3" />Open</Badge>
      case "in_progress":
        return <Badge className="bg-yellow-500"><Clock className="mr-1 h-3 w-3" />In Progress</Badge>
      case "resolved":
        return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Resolved</Badge>
      case "closed":
        return <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" />Closed</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const categoryBadge = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return (
      <Badge variant="outline" className="font-normal">
        <span className={`w-2 h-2 rounded-full mr-1.5 ${cat?.color || "bg-gray-500"}`} />
        {category}
      </Badge>
    )
  }

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("support_tickets")
      .delete()
      .in("id", idsToDelete)

    if (error) {
      toast.error("Failed to delete selected tickets")
    } else {
      toast.success(`${idsToDelete.length} ticket(s) deleted`)
      setSelectedIds(new Set())
      loadTickets()
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTickets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTickets.map(t => t.id)))
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
            <Ticket className="h-6 w-6" />
            Support Tickets
          </h1>
          <p className="text-sm text-muted-foreground">Customer-reported issues and requests</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadTickets()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20">
              <Ticket className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 ${stats.open > 0 ? 'ring-2 ring-red-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-red-500">{stats.open}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-yellow-500">{stats.inProgress}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-500">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </div>
        </Card>
      </div>

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

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={filteredTickets.length > 0 && selectedIds.size === filteredTickets.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>User</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {search ? "No matching tickets" : "No tickets found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map(ticket => (
                <TableRow
                  key={ticket.id}
                  className={`group hover:bg-muted/50 transition-colors ${
                    ticket.status === "open" ? "bg-red-50 dark:bg-red-950/20" : ""
                  } ${selectedIds.has(ticket.id) ? 'bg-muted/50' : ''}`}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(ticket.id)}
                      onCheckedChange={() => toggleSelect(ticket.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(ticket.user?.full_name || "?")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{ticket.user?.full_name || "Unknown"}</p>
                        {ticket.user?.employee_id && (
                          <p className="text-xs text-muted-foreground">{ticket.user.employee_id}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {ticket.driver ? (
                      <div>
                        <p className="font-medium text-sm">{ticket.driver.profile?.full_name || "Unknown"}</p>
                        {ticket.driver.vehicle_number && (
                          <p className="text-xs text-muted-foreground">{ticket.driver.vehicle_number}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{categoryBadge(ticket.category)}</TableCell>
                  <TableCell>
                    <p className="text-sm truncate max-w-[200px]" title={ticket.description}>
                      {ticket.description}
                    </p>
                  </TableCell>
                  <TableCell>{statusBadge(ticket.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(ticket.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSelectedTicket(ticket)
                          setAdminNotes(ticket.admin_notes || "")
                          setDialogType("view")
                        }}
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
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => {
                            setSelectedTicket(ticket)
                            setAdminNotes(ticket.admin_notes || "")
                            setDialogType("view")
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {ticket.status === "open" && (
                            <DropdownMenuItem onSelect={() => updateStatus(ticket.id, "in_progress")}>
                              <Clock className="h-4 w-4 mr-2" />
                              Mark In Progress
                            </DropdownMenuItem>
                          )}
                          {ticket.status !== "resolved" && (
                            <DropdownMenuItem onSelect={() => updateStatus(ticket.id, "resolved")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Resolve
                            </DropdownMenuItem>
                          )}
                          {ticket.status === "resolved" && (
                            <DropdownMenuItem onSelect={() => updateStatus(ticket.id, "closed")}>
                              <XCircle className="h-4 w-4 mr-2" />
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

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {Math.ceil(totalCount / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Ticket(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected ticket(s). This action cannot be undone.
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

      {/* View/Edit Dialog */}
      <Dialog open={dialogType === "view"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ticket Details</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">User:</span>{" "}
                  {selectedTicket.user?.full_name || "Unknown"}
                </div>
                <div>
                  <span className="text-muted-foreground">Employee ID:</span>{" "}
                  {selectedTicket.user?.employee_id || "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>{" "}
                  {selectedTicket.user?.phone || "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {selectedTicket.user?.email || "-"}
                </div>
              </div>

              {selectedTicket.driver && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800">
                  <div>
                    <span className="text-muted-foreground">Driver:</span>{" "}
                    {selectedTicket.driver.profile?.full_name || "Unknown"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vehicle:</span>{" "}
                    {selectedTicket.driver.vehicle_number || "-"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Driver Phone:</span>{" "}
                    {selectedTicket.driver.profile?.phone || "-"}
                  </div>
                </div>
              )}

              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Issue</h3>
                  {categoryBadge(selectedTicket.category)}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  {statusBadge(selectedTicket.status)}
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  {formatDate(selectedTicket.created_at)}
                </div>
              </div>

              {selectedTicket.resolved_at && (
                <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
                  <h3 className="font-medium text-green-600 mb-1">Resolved</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedTicket.resolved_at)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this ticket..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {selectedTicket?.status === "open" && (
              <Button
                variant="outline"
                onClick={() => {
                  updateStatus(selectedTicket.id, "in_progress")
                  setDialogType(null)
                }}
              >
                <Clock className="h-4 w-4 mr-2" />
                In Progress
              </Button>
            )}
            {selectedTicket?.status !== "resolved" && selectedTicket?.status !== "closed" && (
              <Button
                variant="outline"
                className="text-green-500 border-green-500 hover:bg-green-50"
                onClick={() => {
                  if (selectedTicket) {
                    updateStatus(selectedTicket.id, "resolved")
                    setDialogType(null)
                  }
                }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Resolve
              </Button>
            )}
            <Button onClick={saveAdminNotes} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
