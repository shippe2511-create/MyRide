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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FileText, Clock, CheckCircle, XCircle, Loader2, RefreshCw,
  MoreHorizontal, Pencil, Trash2, Search, Eye, ExternalLink
} from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"

interface Document {
  id: string
  driver_id: string
  document_type: string
  file_url: string | null
  status: string
  expiry_date: string | null
  uploaded_at: string
  verified_at: string | null
  driver?: {
    id: string
    profile?: {
      full_name: string
      avatar_url: string | null
      phone: string | null
      employee_id: string | null
    }
  }
}

const PAGE_SIZE = 15

const DOCUMENT_TYPES: Record<string, string> = {
  license: "Driver's License",
  id_card: "ID Card",
  insurance: "Insurance",
  vehicle_reg: "Vehicle Registration",
  profile_photo: "Profile Photo",
  police_clearance: "Police Clearance",
}

export default function DocumentsPage() {
  const supabase = createClient()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 })

  useEffect(() => {
    loadDocuments(true)

    const channel = supabase
      .channel('documents_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        loadDocuments(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      loadDocuments(false)
    }
  }, [filter, currentPage])

  const loadDocuments = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const start = (currentPage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1

    let query = supabase
      .from("documents")
      .select(`
        *,
        driver:drivers!inner(
          id,
          profile:profiles(
            full_name,
            avatar_url,
            phone,
            employee_id
          )
        )
      `, { count: "exact" })
      .order("uploaded_at", { ascending: false })
      .range(start, end)

    let countQuery = supabase.from("documents").select("*", { count: "exact", head: true })

    if (filter === "pending") {
      query = query.eq("status", "pending")
      countQuery = countQuery.eq("status", "pending")
    }
    if (filter === "approved") {
      query = query.eq("status", "verified")
      countQuery = countQuery.eq("status", "verified")
    }
    if (filter === "rejected") {
      query = query.eq("status", "rejected")
      countQuery = countQuery.eq("status", "rejected")
    }

    const [docsRes, filteredCountRes, totalRes, pendingRes, approvedRes, rejectedRes] = await Promise.all([
      query,
      countQuery,
      supabase.from("documents").select("*", { count: "exact", head: true }),
      supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "verified"),
      supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    ])

    setDocuments(docsRes.data || [])
    setTotalCount(filteredCountRes.count || 0)
    setStats({
      total: totalRes.count || 0,
      pending: pendingRes.count || 0,
      approved: approvedRes.count || 0,
      rejected: rejectedRes.count || 0,
    })
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

  const formatExpiryDate = (date: string | null) => {
    if (!date) return "-"
    return new Date(date).toLocaleDateString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  const getDocTypeLabel = (type: string) => {
    return DOCUMENT_TYPES[type] || type.replace(/_/g, " ")
  }

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  const isExpired = (date: string | null) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false
    const expiry = new Date(date)
    const now = new Date()
    const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays > 0 && diffDays <= 30
  }

  const handleApprove = async (doc: Document) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", doc.id)

    if (error) {
      toast.error("Failed to approve document")
    } else {
      toast.success("Document approved")
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "verified", verified_at: new Date().toISOString() } : d))
      setStats(prev => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        approved: prev.approved + 1
      }))
    }
  }

  const handleReject = async (doc: Document) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "rejected" })
      .eq("id", doc.id)

    if (error) {
      toast.error("Failed to reject document")
    } else {
      toast.success("Document rejected")
      const wasApproved = doc.status === "verified"
      const wasPending = doc.status === "pending"
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "rejected" } : d))
      setStats(prev => ({
        ...prev,
        pending: wasPending ? Math.max(0, prev.pending - 1) : prev.pending,
        approved: wasApproved ? Math.max(0, prev.approved - 1) : prev.approved,
        rejected: prev.rejected + 1
      }))
    }
  }

  const handleSave = async () => {
    if (!editingDocument) return
    setSaving(true)

    const { error } = await supabase
      .from("documents")
      .update({
        document_type: editingDocument.document_type,
        expiry_date: editingDocument.expiry_date,
      })
      .eq("id", editingDocument.id)

    if (error) {
      toast.error("Failed to update document")
    } else {
      toast.success("Document updated")
      setDocuments(prev => prev.map(d => d.id === editingDocument.id ? { ...d, ...editingDocument } : d))
      setEditingDocument(null)
    }
    setSaving(false)
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    const doc = documents.find(d => d.id === deleteId)
    const { error } = await supabase.from("documents").delete().eq("id", deleteId)

    if (error) {
      toast.error("Failed to delete document")
    } else {
      toast.success("Document deleted")
      setDocuments(prev => prev.filter(d => d.id !== deleteId))
      if (doc) {
        setStats(prev => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          pending: doc.status === "pending" ? Math.max(0, prev.pending - 1) : prev.pending,
          approved: doc.status === "verified" ? Math.max(0, prev.approved - 1) : prev.approved,
          rejected: doc.status === "rejected" ? Math.max(0, prev.rejected - 1) : prev.rejected,
        }))
      }
    }
    setDeleteId(null)
  }

  const filteredDocuments = documents.filter(doc => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      doc.driver?.profile?.full_name?.toLowerCase().includes(s) ||
      doc.document_type?.toLowerCase().includes(s) ||
      getDocTypeLabel(doc.document_type).toLowerCase().includes(s)
    )
  })

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Documents
          </h1>
          <p className="text-sm text-muted-foreground">Driver document verification</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadDocuments()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-xs text-muted-foreground truncate">Total</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 ${stats.pending > 0 ? 'ring-2 ring-yellow-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-yellow-500">{stats.pending}</p>
              <p className="text-xs text-muted-foreground truncate">Pending</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.approved}</p>
              <p className="text-xs text-muted-foreground truncate">Approved</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
            </span>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search driver or document..."
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Document Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {search ? "No matching documents" : "No documents found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map(doc => (
                <TableRow
                  key={doc.id}
                  className={`group hover:bg-muted/50 transition-colors ${
                    doc.status === "pending" ? "bg-yellow-50 dark:bg-yellow-950/20" :
                    doc.status === "rejected" ? "bg-red-50 dark:bg-red-950/20" : ""
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={doc.driver?.profile?.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(doc.driver?.profile?.full_name || "?")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium text-sm">{doc.driver?.profile?.full_name || "Unknown"}</span>
                        {doc.driver?.profile?.employee_id && (
                          <p className="text-xs text-muted-foreground">{doc.driver.profile.employee_id}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {getDocTypeLabel(doc.document_type)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      doc.status === "verified" ? "bg-green-500" :
                      doc.status === "pending" ? "bg-yellow-500" :
                      "bg-red-500"
                    }>
                      {doc.status === "verified" ? "Approved" : doc.status === "pending" ? "Pending" : "Rejected"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <span className={isExpired(doc.expiry_date) ? "text-red-500" : isExpiringSoon(doc.expiry_date) ? "text-orange-500" : ""}>
                        {formatExpiryDate(doc.expiry_date)}
                      </span>
                      {isExpired(doc.expiry_date) && (
                        <Badge variant="outline" className="text-xs text-red-500 border-red-300">Expired</Badge>
                      )}
                      {isExpiringSoon(doc.expiry_date) && !isExpired(doc.expiry_date) && (
                        <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">Soon</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(doc.uploaded_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingDocument(doc)}
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
                          <DropdownMenuItem onSelect={() => setSelectedDocument(doc)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditingDocument(doc)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {doc.status === "pending" && (
                            <DropdownMenuItem onSelect={() => handleApprove(doc)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                          )}
                          {doc.status !== "rejected" && (
                            <DropdownMenuItem onSelect={() => handleReject(doc)}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-500"
                            onSelect={() => setDeleteId(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
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

      {/* View Details Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div><span className="text-muted-foreground">Driver:</span> {selectedDocument.driver?.profile?.full_name || "Unknown"}</div>
                <div><span className="text-muted-foreground">Type:</span> {getDocTypeLabel(selectedDocument.document_type)}</div>
                <div><span className="text-muted-foreground">Uploaded:</span> {formatDate(selectedDocument.uploaded_at)}</div>
                <div>
                  <Badge className={
                    selectedDocument.status === "verified" ? "bg-green-500" :
                    selectedDocument.status === "pending" ? "bg-yellow-500" :
                    "bg-red-500"
                  }>
                    {selectedDocument.status === "verified" ? "Approved" : selectedDocument.status === "pending" ? "Pending" : "Rejected"}
                  </Badge>
                </div>
              </div>

              {selectedDocument.expiry_date && (
                <div className="p-3 border rounded-lg">
                  <h3 className="font-medium mb-1">Expiry Date</h3>
                  <p className={`text-sm ${isExpired(selectedDocument.expiry_date) ? "text-red-500" : isExpiringSoon(selectedDocument.expiry_date) ? "text-orange-500" : "text-muted-foreground"}`}>
                    {formatExpiryDate(selectedDocument.expiry_date)}
                    {isExpired(selectedDocument.expiry_date) && " (Expired)"}
                    {isExpiringSoon(selectedDocument.expiry_date) && !isExpired(selectedDocument.expiry_date) && " (Expiring Soon)"}
                  </p>
                </div>
              )}

              {selectedDocument.verified_at && (
                <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
                  <h3 className="font-medium text-green-600 mb-1">Verification</h3>
                  <p className="text-sm text-muted-foreground">
                    Verified on {formatDate(selectedDocument.verified_at)}
                  </p>
                </div>
              )}

              {selectedDocument.file_url && (
                <div className="p-3 border rounded-lg">
                  <h3 className="font-medium mb-2">Document File</h3>
                  <a
                    href={selectedDocument.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-500 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Document
                  </a>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {selectedDocument.status === "pending" && (
                  <>
                    <Button
                      variant="outline"
                      className="text-red-500 border-red-300 hover:bg-red-50"
                      onClick={() => {
                        handleReject(selectedDocument)
                        setSelectedDocument(null)
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      className="bg-green-500 hover:bg-green-600"
                      onClick={() => {
                        handleApprove(selectedDocument)
                        setSelectedDocument(null)
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingDocument} onOpenChange={() => setEditingDocument(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          {editingDocument && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Driver</Label>
                <Input
                  value={editingDocument.driver?.profile?.full_name || "Unknown"}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select
                  value={editingDocument.document_type}
                  onValueChange={(val) => setEditingDocument({ ...editingDocument, document_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={editingDocument.expiry_date || ""}
                  onChange={(e) => setEditingDocument({ ...editingDocument, expiry_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingDocument.status}
                  onValueChange={(val) => setEditingDocument({ ...editingDocument, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDocument(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The document will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
