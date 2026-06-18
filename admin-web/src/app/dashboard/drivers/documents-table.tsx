"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FileText, Search, MoreHorizontal, CheckCircle, XCircle, Clock, Eye, AlertTriangle, Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

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

const DOCUMENT_TYPES = [
  { value: "license", label: "Driver's License" },
  { value: "id_card", label: "ID Card" },
  { value: "insurance", label: "Insurance" },
  { value: "vehicle_reg", label: "Vehicle Registration" },
  { value: "profile_photo", label: "Profile Photo" },
  { value: "police_clearance", label: "Police Clearance" },
]

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "warning", icon: Clock },
  verified: { label: "Approved", color: "success", icon: CheckCircle },
  rejected: { label: "Rejected", color: "destructive", icon: XCircle },
  expired: { label: "Expired", color: "destructive", icon: AlertTriangle },
}

export function DocumentsTable() {
  const supabase = createClient()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    rejected: 0,
    expiringSoon: 0,
  })

  useEffect(() => {
    loadDocuments()

    const channel = supabase
      .channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        loadDocuments()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadDocuments = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from("documents")
      .select(`
        *,
        driver:drivers!documents_driver_id_fkey(
          id,
          profile:profiles!drivers_profile_id_fkey(full_name, avatar_url, phone, employee_id)
        )
      `)
      .order("uploaded_at", { ascending: false })

    if (error) {
      toast.error("Failed to load documents")
      setLoading(false)
      return
    }

    const docs = data || []
    setDocuments(docs)

    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    setStats({
      total: docs.length,
      pending: docs.filter(d => d.status === "pending").length,
      verified: docs.filter(d => d.status === "verified").length,
      rejected: docs.filter(d => d.status === "rejected").length,
      expiringSoon: docs.filter(d => {
        if (!d.expiry_date) return false
        const expiry = new Date(d.expiry_date)
        return expiry > now && expiry <= in30Days
      }).length,
    })

    setLoading(false)
  }

  const updateStatus = async (docId: string, newStatus: string) => {
    setUpdating(docId)

    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === "verified") {
      updates.verified_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from("documents")
      .update(updates)
      .eq("id", docId)

    if (error) {
      toast.error("Failed to update status")
    } else {
      toast.success(`Document ${newStatus}`)
      loadDocuments()
    }
    setUpdating(null)
  }

  const formatDate = (date: string | null) => {
    if (!date) return "-"
    return new Date(date).toLocaleDateString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  const getDocTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type)?.label || type
  }

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false
    const expiry = new Date(expiryDate)
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return expiry > now && expiry <= in30Days
  }

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false
    return new Date(expiryDate) < new Date()
  }

  const filteredDocuments = documents.filter(doc => {
    const profile = doc.driver?.profile
    const matchesSearch =
      profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      profile?.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === "all" || doc.status === statusFilter
    const matchesType = typeFilter === "all" || doc.document_type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-5 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-slate-500/20">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 bg-slate-500/10 px-2 py-1 rounded-full">all</span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Total Documents</p>
            </div>
          </div>
        </Card>
        <Card className={`p-5 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 ${stats.pending > 0 ? 'ring-2 ring-yellow-500/50' : ''}`}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Clock className="h-4 w-4 text-yellow-500" />
              </div>
              {stats.pending > 0 && (
                <span className="text-xs font-medium text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full animate-pulse">review</span>
              )}
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-yellow-500">{stats.pending}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Pending</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                {stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-green-500">{stats.verified}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Approved</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-red-500/20">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-red-500">{stats.rejected}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Rejected</p>
            </div>
          </div>
        </Card>
        <Card className={`p-5 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 ${stats.expiringSoon > 0 ? 'ring-2 ring-orange-500/50' : ''}`}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
              {stats.expiringSoon > 0 && (
                <span className="text-xs font-medium text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full animate-pulse">alert</span>
              )}
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold tracking-tight text-orange-500">{stats.expiringSoon}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Expiring Soon</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Driver Documents
          </CardTitle>
          <CardDescription>
            Review and verify uploaded driver documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by driver name, ID, or document type..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Document Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DOCUMENT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
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
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {documents.length === 0
                      ? "No documents uploaded yet"
                      : "No documents match your filters"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocuments.map((doc) => {
                  const StatusIcon = STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG]?.icon || Clock
                  const statusColor = STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG]?.color || "secondary"
                  const expired = isExpired(doc.expiry_date)
                  const expiring = isExpiringSoon(doc.expiry_date)

                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={doc.driver?.profile?.avatar_url || undefined} />
                            <AvatarFallback>
                              {doc.driver?.profile?.full_name?.[0] || "D"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{doc.driver?.profile?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.driver?.profile?.employee_id || doc.driver?.profile?.phone || "-"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {getDocTypeLabel(doc.document_type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor as "warning" | "success" | "destructive" | "secondary"}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG]?.label || doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {formatDate(doc.expiry_date)}
                          {expired && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                          {expiring && !expired && (
                            <Badge variant="warning" className="text-xs">Soon</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(doc.uploaded_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={updating === doc.id}>
                              {updating === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {doc.file_url && (
                              <DropdownMenuItem onClick={() => {
                                setPreviewDoc(doc)
                                setPreviewOpen(true)
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </DropdownMenuItem>
                            )}
                            {doc.file_url && (
                              <DropdownMenuItem onClick={() => window.open(doc.file_url!, "_blank")}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open in New Tab
                              </DropdownMenuItem>
                            )}
                            {doc.status !== "verified" && (
                              <DropdownMenuItem
                                className="text-green-600"
                                onClick={() => updateStatus(doc.id, "verified")}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {doc.status !== "rejected" && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => updateStatus(doc.id, "rejected")}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </DropdownMenuItem>
                            )}
                            {doc.status !== "pending" && (
                              <DropdownMenuItem onClick={() => updateStatus(doc.id, "pending")}>
                                <Clock className="mr-2 h-4 w-4" />
                                Mark as Pending
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewDoc && getDocTypeLabel(previewDoc.document_type)}
            </DialogTitle>
            <DialogDescription>
              {previewDoc?.driver?.profile?.full_name} - Uploaded {formatDate(previewDoc?.uploaded_at || null)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {previewDoc?.file_url ? (
              previewDoc.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img
                  src={previewDoc.file_url}
                  alt="Document preview"
                  className="w-full rounded-lg"
                />
              ) : previewDoc.file_url.match(/\.pdf$/i) ? (
                <iframe
                  src={previewDoc.file_url}
                  className="w-full h-[500px] rounded-lg border"
                  title="PDF preview"
                />
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Cannot preview this file type</p>
                  <Button onClick={() => window.open(previewDoc.file_url!, "_blank")}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in New Tab
                  </Button>
                </div>
              )
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No file available
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            {previewDoc && previewDoc.status !== "verified" && (
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  updateStatus(previewDoc.id, "verified")
                  setPreviewOpen(false)
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
            )}
            {previewDoc && previewDoc.status !== "rejected" && (
              <Button
                variant="destructive"
                onClick={() => {
                  updateStatus(previewDoc.id, "rejected")
                  setPreviewOpen(false)
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
