"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DialogFooter } from "@/components/ui/dialog"
import {
  ClipboardCheck, AlertTriangle, CheckCircle, XCircle, Car,
  Loader2, RefreshCw, Download, MoreHorizontal, Pencil, Trash2, Search, Eye, Flag
} from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionGate } from "@/components/permission-gate"

interface IssueDetail {
  note: string
  photos?: string[]
}

interface VehicleChecklist {
  id: string
  driver_name: string
  vehicle_number: string
  has_issues: boolean
  issues: Record<string, string | IssueDetail> | null
  all_items: Record<string, boolean> | null
  checked_at: string
  remarks: string | null
}

const ITEM_LABELS: Record<string, string> = {
  fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition",
  ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness",
}

const PAGE_SIZE = 15

export default function ChecklistsPage() {
  const supabase = createClient()
  const [checklists, setChecklists] = useState<VehicleChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [selectedChecklist, setSelectedChecklist] = useState<VehicleChecklist | null>(null)
  const [editingChecklist, setEditingChecklist] = useState<VehicleChecklist | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [stats, setStats] = useState({ total: 0, withIssues: 0, passed: 0 })

  // Initial load only
  useEffect(() => {
    loadChecklists(true)

    // Real-time subscription for all changes
    const channel = supabase
      .channel('checklists_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_checklists' }, () => {
        loadChecklists(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Page/filter changes - no loading skeleton
  useEffect(() => {
    if (!loading) {
      loadChecklists(false)
    }
  }, [filter, currentPage])

  const loadChecklists = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const start = (currentPage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1

    let query = supabase.from("vehicle_checklists").select("*", { count: "exact" }).order("checked_at", { ascending: false }).range(start, end)
    let countQuery = supabase.from("vehicle_checklists").select("*", { count: "exact", head: true })

    if (filter === "issues") {
      query = query.eq("has_issues", true)
      countQuery = countQuery.eq("has_issues", true)
    }
    if (filter === "passed") {
      query = query.eq("has_issues", false)
      countQuery = countQuery.eq("has_issues", false)
    }

    const [checklistsRes, filteredCountRes, totalRes, issuesRes, passedRes] = await Promise.all([
      query,
      countQuery,
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", true),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", false),
    ])

    setChecklists(checklistsRes.data || [])
    setTotalCount(filteredCountRes.count || 0)
    setStats({ total: totalRes.count || 0, withIssues: issuesRes.count || 0, passed: passedRes.count || 0 })
    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    })
  }

  const getFailedItems = (checklist: VehicleChecklist) => {
    if (!checklist.all_items) return []
    return Object.entries(checklist.all_items).filter(([, passed]) => !passed).map(([key]) => key)
  }

  const handleSave = async () => {
    if (!editingChecklist) return
    setSaving(true)

    const { error } = await supabase.from("vehicle_checklists").update({
      driver_name: editingChecklist.driver_name,
      vehicle_number: editingChecklist.vehicle_number,
      has_issues: editingChecklist.has_issues,
      issues: editingChecklist.issues,
      all_items: editingChecklist.all_items,
      remarks: editingChecklist.remarks,
    }).eq("id", editingChecklist.id)

    if (error) {
      toast.error("Failed to update")
    } else {
      toast.success("Updated successfully")
      // Update local state instead of reloading
      const oldChecklist = checklists.find(c => c.id === editingChecklist.id)
      setChecklists(prev => prev.map(c => c.id === editingChecklist.id ? editingChecklist : c))
      // Update stats if has_issues changed
      if (oldChecklist && oldChecklist.has_issues !== editingChecklist.has_issues) {
        setStats(prev => ({
          ...prev,
          withIssues: editingChecklist.has_issues ? prev.withIssues + 1 : Math.max(0, prev.withIssues - 1),
          passed: editingChecklist.has_issues ? Math.max(0, prev.passed - 1) : prev.passed + 1,
        }))
      }
      setEditingChecklist(null)
    }
    setSaving(false)
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    const checklist = checklists.find(c => c.id === deleteId)
    const { error } = await supabase.from("vehicle_checklists").delete().eq("id", deleteId)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Deleted successfully")
      // Update local state instead of reloading
      setChecklists(prev => prev.filter(c => c.id !== deleteId))
      if (checklist) {
        setStats(prev => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          withIssues: checklist.has_issues ? Math.max(0, prev.withIssues - 1) : prev.withIssues,
          passed: !checklist.has_issues ? Math.max(0, prev.passed - 1) : prev.passed,
        }))
      }
    }
    setDeleteId(null)
  }

  const toggleIssuesStatus = async (checklist: VehicleChecklist) => {
    const newStatus = !checklist.has_issues
    const { error } = await supabase
      .from("vehicle_checklists")
      .update({ has_issues: newStatus })
      .eq("id", checklist.id)

    if (error) {
      toast.error("Failed to update status")
    } else {
      toast.success(newStatus ? "Flagged as having issues" : "Cleared issues")
      setChecklists(prev => prev.map(c => c.id === checklist.id ? { ...c, has_issues: newStatus } : c))
      setStats(prev => ({
        ...prev,
        withIssues: newStatus ? prev.withIssues + 1 : Math.max(0, prev.withIssues - 1),
        passed: newStatus ? Math.max(0, prev.passed - 1) : prev.passed + 1,
      }))
    }
  }

  const toggleItemStatus = (key: string) => {
    if (!editingChecklist?.all_items) return
    const newItems = { ...editingChecklist.all_items, [key]: !editingChecklist.all_items[key] }
    const hasIssues = Object.values(newItems).some(v => !v)
    setEditingChecklist({ ...editingChecklist, all_items: newItems, has_issues: hasIssues })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-40 h-8 bg-muted rounded animate-pulse" />
          <div className="w-56 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="pretrip:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Pre-trip Checks
          </h1>
          <p className="text-sm text-muted-foreground">Driver vehicle inspections</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadChecklists()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <ClipboardCheck className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-xs text-muted-foreground truncate">Total</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 ${stats.withIssues > 0 ? 'ring-2 ring-red-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{stats.withIssues}</p>
              <p className="text-xs text-muted-foreground truncate">With Issues</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.passed}</p>
              <p className="text-xs text-muted-foreground truncate">Passed</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%
            </span>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search driver or vehicle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => { setFilter(v); setCurrentPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="issues">With Issues</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failed Items</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checklists.filter(c => {
              if (!search) return true
              const s = search.toLowerCase()
              return (
                c.driver_name?.toLowerCase().includes(s) ||
                c.vehicle_number?.toLowerCase().includes(s)
              )
            }).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {search ? "No matching checklists" : "No checklists found"}
                </TableCell>
              </TableRow>
            ) : (
              checklists.filter(c => {
                if (!search) return true
                const s = search.toLowerCase()
                return (
                  c.driver_name?.toLowerCase().includes(s) ||
                  c.vehicle_number?.toLowerCase().includes(s)
                )
              }).map(checklist => {
                const failedItems = getFailedItems(checklist)
                return (
                  <TableRow key={checklist.id} className={`group hover:bg-muted/50 transition-colors ${checklist.has_issues ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{checklist.driver_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{checklist.driver_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        {checklist.vehicle_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={checklist.has_issues ? "bg-red-500" : "bg-green-500"}>
                        {checklist.has_issues ? "Issues" : "Passed"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {failedItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {failedItems.slice(0, 2).map(item => (
                            <Badge key={item} variant="outline" className="text-xs text-red-500 border-red-300">
                              {ITEM_LABELS[item] || item}
                            </Badge>
                          ))}
                          {failedItems.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{failedItems.length - 2}</Badge>
                          )}
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(checklist.checked_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingChecklist(checklist)}
                        >
                          <Pencil className="h-4 w-4" />
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
                            <DropdownMenuItem onSelect={() => setSelectedChecklist(checklist)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditingChecklist(checklist)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleIssuesStatus(checklist)}>
                              <Flag className="h-4 w-4 mr-2" />
                              {checklist.has_issues ? "Clear Issues" : "Flag Issues"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => setDeleteId(checklist.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
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

      <Dialog open={!!selectedChecklist} onOpenChange={() => setSelectedChecklist(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Checklist Details</DialogTitle>
          </DialogHeader>
          {selectedChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div><span className="text-muted-foreground">Driver:</span> {selectedChecklist.driver_name}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {selectedChecklist.vehicle_number}</div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedChecklist.checked_at)}</div>
                <div>
                  <Badge className={selectedChecklist.has_issues ? "bg-red-500" : "bg-green-500"}>
                    {selectedChecklist.has_issues ? "Issues Found" : "Passed"}
                  </Badge>
                </div>
              </div>

              {selectedChecklist.has_issues && selectedChecklist.issues && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h3 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Issues
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(selectedChecklist.issues).map(([key, value]) => {
                      const isDetail = typeof value === "object" && value !== null
                      const note = isDetail ? (value as IssueDetail).note : value as string
                      const photos = isDetail ? (value as IssueDetail).photos : undefined

                      return (
                        <div key={key} className="p-2 bg-background rounded border text-sm">
                          <p className="font-medium text-red-600">{ITEM_LABELS[key] || key}</p>
                          <p className="text-muted-foreground">{note}</p>
                          {photos && photos.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {photos.map((photo, i) => (
                                <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="relative group">
                                  <img src={photo} alt="" className="h-16 w-16 object-cover rounded border" />
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                    <Download className="h-4 w-4 text-white" />
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedChecklist.all_items && (
                <div className="p-3 border rounded-lg">
                  <h3 className="font-medium mb-2">All Items</h3>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(selectedChecklist.all_items).map(([key, passed]) => (
                      <div key={key} className={`flex items-center gap-2 p-1.5 rounded text-sm ${passed ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                        {passed ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        {ITEM_LABELS[key] || key}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedChecklist.remarks && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <h3 className="font-medium mb-2">Admin Remarks</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedChecklist.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingChecklist} onOpenChange={() => setEditingChecklist(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Checklist</DialogTitle>
          </DialogHeader>
          {editingChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Driver Name</label>
                  <Input
                    value={editingChecklist.driver_name}
                    onChange={e => setEditingChecklist({ ...editingChecklist, driver_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Vehicle Number</label>
                  <Input
                    value={editingChecklist.vehicle_number}
                    onChange={e => setEditingChecklist({ ...editingChecklist, vehicle_number: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Checklist Items (click to toggle)</label>
                <div className="grid grid-cols-2 gap-2">
                  {editingChecklist.all_items && Object.entries(editingChecklist.all_items).map(([key, passed]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleItemStatus(key)}
                      className={`flex items-center gap-2 p-2 rounded border text-sm text-left transition-colors ${
                        passed
                          ? "bg-green-50 border-green-200 dark:bg-green-950/20"
                          : "bg-red-50 border-red-200 dark:bg-red-950/20"
                      }`}
                    >
                      {passed ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      {ITEM_LABELS[key] || key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show issues with photos */}
              {editingChecklist.issues && Object.keys(editingChecklist.issues).length > 0 && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h3 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Reported Issues
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(editingChecklist.issues).map(([key, value]) => {
                      const isDetail = typeof value === "object" && value !== null
                      const note = isDetail ? (value as IssueDetail).note : value as string
                      const photos = isDetail ? (value as IssueDetail).photos : undefined

                      return (
                        <div key={key} className="p-2 bg-background rounded border text-sm">
                          <p className="font-medium text-red-600">{ITEM_LABELS[key] || key}</p>
                          <p className="text-muted-foreground">{note}</p>
                          {photos && photos.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {photos.map((photo, i) => (
                                <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="relative group">
                                  <img src={photo} alt="" className="h-20 w-20 object-cover rounded border" />
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                    <Download className="h-4 w-4 text-white" />
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Remarks Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Admin Remarks</label>
            <textarea
              className="w-full min-h-[80px] p-3 rounded-md border bg-background text-sm resize-none"
              placeholder="Add comments or remarks about this checklist..."
              value={editingChecklist?.remarks || ""}
              onChange={(e) => setEditingChecklist(prev => prev ? { ...prev, remarks: e.target.value } : null)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingChecklist(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this checklist record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  )
}
