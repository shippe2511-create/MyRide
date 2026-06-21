"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckCircle,
  XCircle,
  FileText,
  ExternalLink,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDate } from "@/lib/utils"

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

interface DocumentsTableProps {
  documents: Document[]
  totalCount: number
  currentPage: number
  pageSize: number
}

const DOCUMENT_TYPES = [
  { value: "license", label: "Driver's License" },
  { value: "id_card", label: "ID Card" },
  { value: "insurance", label: "Insurance" },
  { value: "vehicle_reg", label: "Vehicle Registration" },
  { value: "profile_photo", label: "Profile Photo" },
  { value: "police_clearance", label: "Police Clearance" },
]

export function DocumentsTable({ documents: initialDocuments, totalCount, currentPage, pageSize }: DocumentsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [documents, setDocuments] = useState(initialDocuments)
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "delete" | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const totalPages = Math.ceil(totalCount / pageSize)

  useEffect(() => {
    setDocuments(initialDocuments)
  }, [initialDocuments])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        router.refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, router])

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/dashboard/documents?${params.toString()}`)
  }

  const handleSearch = () => {
    updateParams("search", search)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    updateParams("status", value)
  }

  const handleTypeChange = (value: string) => {
    setTypeFilter(value)
    updateParams("type", value)
  }

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", page.toString())
    router.push(`/dashboard/documents?${params.toString()}`)
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
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "rejected" } : d))
    }
  }

  const handleDelete = async (doc: Document) => {
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id)

    if (error) {
      toast.error("Failed to delete document")
    } else {
      toast.success("Document deleted")
      setDialogType(null)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from("documents")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .in("id", ids)

    if (error) {
      toast.error("Failed to approve documents")
    } else {
      toast.success(`${selectedIds.size} documents approved`)
      setDocuments(prev => prev.map(d => ids.includes(d.id) ? { ...d, status: "verified", verified_at: new Date().toISOString() } : d))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from("documents")
      .update({ status: "rejected" })
      .in("id", ids)

    if (error) {
      toast.error("Failed to reject documents")
    } else {
      toast.success(`${selectedIds.size} documents rejected`)
      setDocuments(prev => prev.map(d => ids.includes(d.id) ? { ...d, status: "rejected" } : d))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} documents?`)) return
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from("documents")
      .delete()
      .in("id", ids)

    if (error) {
      toast.error("Failed to delete documents")
    } else {
      toast.success(`${selectedIds.size} documents deleted`)
      setDocuments(prev => prev.filter(d => !ids.includes(d.id)))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const exportCSV = () => {
    const headers = ["Driver", "Document Type", "Status", "Expiry Date", "Uploaded At"]
    const rows = documents.map(d => [
      d.driver?.profile?.full_name || "Unknown",
      getDocTypeLabel(d.document_type),
      d.status,
      d.expiry_date || "",
      formatDate(d.uploaded_at)
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "documents.csv"
    a.click()
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getDocTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type)?.label || type.replace(/_/g, " ")
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge variant="success" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Approved
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="warning" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Pending
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return formatDate(dateStr)
  }

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false
    const expiry = new Date(expiryDate)
    const now = new Date()
    const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays > 0 && diffDays <= 30
  }

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false
    return new Date(expiryDate) < new Date()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-64 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DOCUMENT_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleBulkApprove} disabled={bulkLoading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkReject} disabled={bulkLoading}>
              <Ban className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === documents.length && documents.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Document Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id} className="group hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => toggleSelect(doc.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                        <AvatarImage src={doc.driver?.profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(doc.driver?.profile?.full_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="font-medium">{doc.driver?.profile?.full_name || "Unknown"}</span>
                        {doc.driver?.profile?.employee_id && (
                          <p className="text-xs text-muted-foreground">{doc.driver.profile.employee_id}</p>
                        )}
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
                    <div className="flex items-center gap-2">
                      {statusBadge(doc.status)}
                      {doc.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-green-500 border-green-500 hover:bg-green-500 hover:text-white"
                          onClick={() => handleApprove(doc)}
                          disabled={loading}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={isExpired(doc.expiry_date) ? "text-red-500" : isExpiringSoon(doc.expiry_date) ? "text-orange-500" : ""}>
                        {doc.expiry_date ? formatDate(doc.expiry_date) : "-"}
                      </span>
                      {isExpired(doc.expiry_date) && (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      )}
                      {isExpiringSoon(doc.expiry_date) && !isExpired(doc.expiry_date) && (
                        <Badge variant="warning" className="text-xs">Soon</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" title={formatDate(doc.uploaded_at)}>
                      {formatRelativeDate(doc.uploaded_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSelectedDocument(doc)
                          setDialogType("view")
                        }}
                      >
                        <Edit className="h-4 w-4" />
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
                            setSelectedDocument(doc)
                            setDialogType("view")
                          }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => {
                            setSelectedDocument(doc)
                            setDialogType("view")
                          }}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {doc.status !== "rejected" && (
                            <DropdownMenuItem onSelect={() => handleReject(doc)}>
                              <Ban className="mr-2 h-4 w-4" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => {
                              setSelectedDocument(doc)
                              setDialogType("delete")
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
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
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} documents
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number
                if (totalPages <= 5) {
                  page = i + 1
                } else if (currentPage <= 3) {
                  page = i + 1
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i
                } else {
                  page = currentPage - 2 + i
                }
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    className="w-8"
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* View Details Dialog */}
      <Dialog open={dialogType === "view"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedDocument && getDocTypeLabel(selectedDocument.document_type)}
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.driver?.profile?.full_name} - Uploaded {selectedDocument && formatDate(selectedDocument.uploaded_at)}
            </DialogDescription>
          </DialogHeader>

          {selectedDocument?.file_url && (
            <div className="rounded-lg overflow-hidden border">
              {selectedDocument.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img
                  src={selectedDocument.file_url}
                  alt="Document preview"
                  className="w-full"
                />
              ) : selectedDocument.file_url.match(/\.pdf$/i) ? (
                <iframe
                  src={selectedDocument.file_url}
                  className="w-full h-96"
                  title="Document preview"
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p>Preview not available</p>
                  <Button variant="outline" className="mt-4" onClick={() => window.open(selectedDocument.file_url!, "_blank")}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open File
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <div className="mt-1">{selectedDocument && statusBadge(selectedDocument.status)}</div>
            </div>
            <div>
              <p className="text-muted-foreground">Expiry Date</p>
              <p className="font-medium mt-1">{selectedDocument?.expiry_date ? formatDate(selectedDocument.expiry_date) : "Not set"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Driver</p>
              <p className="font-medium mt-1">{selectedDocument?.driver?.profile?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Employee ID</p>
              <p className="font-medium mt-1">{selectedDocument?.driver?.profile?.employee_id || "-"}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {selectedDocument?.file_url && (
              <Button variant="outline" onClick={() => window.open(selectedDocument.file_url!, "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Full Size
              </Button>
            )}
            {selectedDocument?.status !== "verified" && (
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  if (selectedDocument) handleApprove(selectedDocument)
                  setDialogType(null)
                }}
                disabled={loading}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
            )}
            {selectedDocument?.status !== "rejected" && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedDocument) handleReject(selectedDocument)
                  setDialogType(null)
                }}
                disabled={loading}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={dialogType === "delete"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedDocument && handleDelete(selectedDocument)}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
