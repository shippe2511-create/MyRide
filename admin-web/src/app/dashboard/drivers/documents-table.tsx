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
  CheckCircle,
  XCircle,
  FileText,
  ExternalLink,
  Loader2,
  Bell,
  Calendar,
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
    profile_id: string
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

export function DocumentsTable() {
  const supabase = createClient()

  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "delete" | "reminder" | null>(null)
  const [updating, setUpdating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [driverFilter, setDriverFilter] = useState("all")
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({
    title: "",
    message: "",
    remind_date: "",
    remind_time: "08:00",
  })
  const [documentReminders, setDocumentReminders] = useState<Record<string, { date: string; sent: boolean }>>({})

  const loadReminders = async () => {
    const { data } = await supabase
      .from("reminders")
      .select("target_id, remind_date, is_sent, message")
      .eq("target_type", "specific_driver")
      .like("message", "%expires%")

    if (data) {
      const reminderMap: Record<string, { date: string; sent: boolean }> = {}
      data.forEach(r => {
        if (r.target_id) {
          reminderMap[r.target_id] = { date: r.remind_date, sent: r.is_sent }
        }
      })
      setDocumentReminders(reminderMap)
    }
  }

  useEffect(() => {
    loadDocuments(true)
    loadCurrentUser()
    loadReminders()

    const channel = supabase
      .channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        loadDocuments(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
        loadReminders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", user.email)
        .single()
      if (profile) {
        setCurrentUserId(profile.id)
      }
    }
  }

  const loadDocuments = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from("documents")
      .select(`
        *,
        driver:drivers!inner(
          id,
          profile_id,
          profile:profiles(
            full_name,
            avatar_url,
            phone,
            employee_id
          )
        )
      `)
      .order("uploaded_at", { ascending: false })

    if (!error && data) {
      setDocuments(data)
    }
    if (showLoading) setLoading(false)
  }

  // Get unique drivers for filter dropdown
  const uniqueDrivers = Array.from(
    new Map(
      documents
        .filter(doc => doc.driver?.profile?.full_name)
        .map(doc => [doc.driver_id, { id: doc.driver_id, name: doc.driver?.profile?.full_name || "" }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const isExpired = (date: string | null) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false
    const expiryDate = new Date(date)
    const today = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = search === "" ||
      doc.driver?.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(search.toLowerCase())

    let matchesStatus = true
    if (statusFilter === "all") {
      matchesStatus = true
    } else if (statusFilter === "expired") {
      matchesStatus = isExpired(doc.expiry_date)
    } else if (statusFilter === "expiring_soon") {
      matchesStatus = isExpiringSoon(doc.expiry_date) && !isExpired(doc.expiry_date)
    } else {
      matchesStatus = doc.status === statusFilter
    }

    const matchesType = typeFilter === "all" || doc.document_type === typeFilter
    const matchesDriver = driverFilter === "all" || doc.driver_id === driverFilter
    return matchesSearch && matchesStatus && matchesType && matchesDriver
  })

  const handleApprove = async (doc: Document) => {
    setUpdating(true)
    const { error } = await supabase
      .from("documents")
      .update({ status: "verified", verified_at: new Date().toISOString(), verified_by: currentUserId })
      .eq("id", doc.id)

    if (error) {
      toast.error("Failed to approve document")
    } else {
      toast.success("Document approved")
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "verified", verified_at: new Date().toISOString() } : d))
    }
    setUpdating(false)
  }

  const handleReject = async (doc: Document) => {
    setUpdating(true)
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
    setUpdating(false)
  }

  const handleDelete = async (doc: Document) => {
    setUpdating(true)
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
    setUpdating(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDocuments.map(d => d.id)))
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
      .update({ status: "verified", verified_at: new Date().toISOString(), verified_by: currentUserId })
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
    setBulkDeleteOpen(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
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
              className="w-64 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
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
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers</SelectItem>
              {uniqueDrivers.map(driver => (
                <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkLoading}>
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
                  checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Document Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Reminder</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map((doc) => (
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
                          disabled={updating}
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
                    {doc.driver?.profile_id && documentReminders[doc.driver.profile_id] ? (() => {
                      const reminder = documentReminders[doc.driver.profile_id]
                      const reminderDate = new Date(reminder.date)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const isPast = reminderDate < today
                      const colorClass = reminder.sent ? "text-green-500" : isPast ? "text-red-500" : "text-yellow-500"
                      return (
                        <div className="flex items-center gap-2">
                          <Bell className={`h-3 w-3 ${colorClass}`} />
                          <span className={`text-sm ${colorClass}`}>
                            {formatDate(reminder.date)}
                          </span>
                          {reminder.sent && (
                            <Badge variant="outline" className="text-xs text-green-500 border-green-500">Sent</Badge>
                          )}
                        </div>
                      )
                    })() : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
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
                          <DropdownMenuItem onSelect={() => {
                            setSelectedDocument(doc)
                            const driverName = doc.driver?.profile?.full_name || "Driver"
                            const docType = getDocTypeLabel(doc.document_type)
                            const expiryDate = doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : "N/A"
                            setReminderForm({
                              title: `Document Expiry Reminder`,
                              message: `Your ${docType} expires on ${expiryDate}. Please renew it before expiry.`,
                              remind_date: new Date().toISOString().split("T")[0],
                              remind_time: "08:00",
                            })
                            setDialogType("reminder")
                          }}>
                            <Bell className="mr-2 h-4 w-4" />
                            Set Reminder
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
                disabled={updating}
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
                disabled={updating}
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
              disabled={updating}
            >
              {updating ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Documents</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} document{selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkLoading}
            >
              {bulkLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Reminder Dialog */}
      <Dialog open={dialogType === "reminder"} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Set Document Reminder
            </DialogTitle>
            <DialogDescription>
              Send a reminder to {selectedDocument?.driver?.profile?.full_name} about their {selectedDocument && getDocTypeLabel(selectedDocument.document_type)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={reminderForm.title}
                onChange={(e) => setReminderForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Reminder title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Input
                value={reminderForm.message}
                onChange={(e) => setReminderForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Reminder message"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  className="[color-scheme:dark]"
                  value={reminderForm.remind_date}
                  onChange={(e) => setReminderForm(f => ({ ...f, remind_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  className="[color-scheme:dark]"
                  value={reminderForm.remind_time}
                  onChange={(e) => setReminderForm(f => ({ ...f, remind_time: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedDocument || !reminderForm.title || !reminderForm.remind_date) {
                  toast.error("Please fill in all fields")
                  return
                }
                setUpdating(true)

                // Get driver profile ID
                const { data: driverData, error: driverError } = await supabase
                  .from("drivers")
                  .select("profile_id")
                  .eq("id", selectedDocument.driver_id)
                  .single()

                if (driverError || !driverData?.profile_id) {
                  console.error("Driver lookup error:", driverError)
                  toast.error("Could not find driver profile")
                  setUpdating(false)
                  return
                }

                const { error } = await supabase.rpc("create_reminder", {
                  p_title: reminderForm.title,
                  p_message: reminderForm.message,
                  p_target_type: "specific_driver",
                  p_target_id: driverData.profile_id,
                  p_remind_date: reminderForm.remind_date,
                  p_remind_time: reminderForm.remind_time,
                })

                if (error) {
                  console.error("Reminder insert error:", error)
                  toast.error("Failed to create reminder: " + error.message)
                } else {
                  toast.success("Reminder scheduled")
                  setDialogType(null)
                  loadReminders()
                }
                setUpdating(false)
              }}
              disabled={updating}
            >
              {updating ? "Saving..." : "Schedule Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
