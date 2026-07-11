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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  Upload,
  UserPlus,
  CheckCircle,
  XCircle,
  CheckSquare,
  Square,
  Users,
  Mail,
  Phone,
  FileSpreadsheet,
  Loader2,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { formatDate } from "@/lib/utils"
import { logActivity } from "@/lib/activity-logger"

interface Customer {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  employee_id: string | null
  department: string | null
  gender: string | null
  status: string
  role: string
  avatar_url: string | null
  created_at: string
}

interface CustomersTableProps {
  customers: Customer[]
  totalCount: number
  currentPage: number
  pageSize: number
}

export function CustomersTable({ customers: initialCustomers, totalCount: initialTotalCount, currentPage, pageSize }: CustomersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [dialogType, setDialogType] = useState<"view" | "edit" | "delete" | "add" | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_id: "",
    department: "",
    gender: "",
    status: "approved",
    role: "customer",
    emergency_contact: ""
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{
    full_name: string
    email: string
    phone: string
    employee_id: string
    department: string
    gender: string
  }>>([])
  const [importError, setImportError] = useState<string | null>(null)

  // Sync with server data when props change
  useEffect(() => {
    setCustomers(initialCustomers)
    setTotalCount(initialTotalCount)
  }, [initialCustomers, initialTotalCount])

  const totalPages = Math.ceil(totalCount / pageSize)

  // Real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('customers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setCustomers(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } as Customer : c))
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setCustomers(prev => prev.filter(c => c.id !== payload.old.id))
          setTotalCount(prev => Math.max(0, prev - 1))
        } else if (payload.eventType === 'INSERT' && payload.new) {
          const newCustomer = payload.new as Customer
          if (['customer', 'super-admin', 'admin', 'operator', 'support', 'viewer'].includes(newCustomer.role)) {
            setCustomers(prev => {
              // Check if already exists to prevent duplicates
              if (prev.some(c => c.id === newCustomer.id)) return prev
              return [newCustomer, ...prev].slice(0, pageSize)
            })
            setTotalCount(prev => prev + 1)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, pageSize])

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    router.push(`/dashboard/customers?${params.toString()}`)
  }

  const handleSearch = (value?: string) => {
    updateParams("search", value ?? search)
  }

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchParams.get("search")) {
        handleSearch(search)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    updateParams("status", value)
  }

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", page.toString())
    router.push(`/dashboard/customers?${params.toString()}`)
  }

  const handleSuspend = async (customer: Customer) => {
    setLoading(true)
    const newStatus = customer.status === "suspended" ? "approved" : "suspended"
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", customer.id)

    if (error) {
      toast.error("Failed to update customer status")
    } else {
      toast.success(`Customer ${newStatus === "suspended" ? "suspended" : "activated"}`)
      logActivity({ action: 'update', entityType: 'customer', entityId: customer.id, details: { status: newStatus, name: customer.full_name } })
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: newStatus } : c))
    }
    setLoading(false)
  }

  const toggleCustomerStatus = async (customer: Customer) => {
    const newStatus = customer.status === "approved" ? "suspended" : "approved"
    // Optimistic update
    setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: newStatus } : c))

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", customer.id)

    if (error) {
      toast.error("Failed to update status")
      // Revert on error
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: customer.status } : c))
    } else {
      toast.success(`Customer ${newStatus === "approved" ? "activated" : "suspended"}`)
      logActivity({ action: 'update', entityType: 'customer', entityId: customer.id, details: { status: newStatus, name: customer.full_name } })
    }
  }

  const handleApprove = async (customer: Customer) => {
    setLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", customer.id)

    if (error) {
      toast.error("Failed to approve customer")
    } else {
      toast.success("Customer approved")
      logActivity({ action: 'update', entityType: 'customer', entityId: customer.id, details: { status: 'approved', name: customer.full_name } })
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: "approved" } : c))
    }
    setLoading(false)
  }

  const handleReject = async (customer: Customer) => {
    setLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", customer.id)

    if (error) {
      toast.error("Failed to reject customer")
    } else {
      toast.success("Customer rejected")
      logActivity({ action: 'update', entityType: 'customer', entityId: customer.id, details: { status: 'rejected', name: customer.full_name } })
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: "rejected" } : c))
    }
    setLoading(false)
  }

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedCustomer) return
    const customerToDelete = selectedCustomer
    setDialogType(null)
    setLoading(true)

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", customerToDelete.id)

    if (error) {
      toast.error("Failed to delete customer")
    } else {
      toast.success("Customer deleted")
      logActivity({ action: 'delete', entityType: 'customer', entityId: customerToDelete.id, details: { name: customerToDelete.full_name } })
      setCustomers(prev => prev.filter(c => c.id !== customerToDelete.id))
      setTotalCount(prev => Math.max(0, prev - 1))
    }
    setLoading(false)
  }

  const openEditDialog = async (customer: Customer) => {
    setSelectedCustomer(customer)
    // Fetch emergency_contacts from DB
    const { data } = await supabase.from("profiles").select("emergency_contacts").eq("id", customer.id).single()
    const emergencyContacts = data?.emergency_contacts || []
    const emergencyContact = Array.isArray(emergencyContacts) && emergencyContacts.length > 0
      ? (emergencyContacts[0]?.phone || emergencyContacts[0] || "")
      : ""
    setFormData({
      full_name: customer.full_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      employee_id: customer.employee_id || "",
      department: customer.department || "",
      gender: customer.gender || "",
      status: customer.status || "approved",
      role: customer.role || "customer",
      emergency_contact: emergencyContact
    })
    setDialogType("edit")
  }

  const openAddDialog = () => {
    setSelectedCustomer(null)
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      employee_id: "",
      department: "",
      gender: "",
      status: "approved",
      role: "customer",
      emergency_contact: ""
    })
    setDialogType("add")
  }

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!formData.phone?.trim()) {
      toast.error("Phone is required")
      return
    }
    if (!formData.employee_id?.trim()) {
      toast.error("Employee ID is required")
      return
    }
    setLoading(true)

    if (dialogType === "edit" && selectedCustomer) {
      // Format phone with country code
      let phone = formData.phone || null
      if (phone && !phone.startsWith('+')) {
        phone = `+960${phone}`
      }

      // Format emergency contact as array
      const emergencyContacts = formData.emergency_contact
        ? [{ phone: formData.emergency_contact.startsWith('+') ? formData.emergency_contact : `+960${formData.emergency_contact}`, name: 'Emergency' }]
        : []

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: phone,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status,
          role: formData.role,
          emergency_contacts: emergencyContacts
        })
        .eq("id", selectedCustomer.id)

      if (error) {
        toast.error("Failed to update customer")
      } else {
        toast.success("Customer updated")
        logActivity({ action: 'update', entityType: 'customer', entityId: selectedCustomer.id, details: { name: formData.full_name } })
        setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...formData } as Customer : c))
        setDialogType(null)
      }
    } else if (dialogType === "add") {
      // Format phone with country code
      let phone = formData.phone || null
      if (phone && !phone.startsWith('+')) {
        phone = `+960${phone}`
      }

      // Format emergency contact as array
      const emergencyContacts = formData.emergency_contact
        ? [{ phone: formData.emergency_contact.startsWith('+') ? formData.emergency_contact : `+960${formData.emergency_contact}`, name: 'Emergency' }]
        : []

      const { data, error } = await supabase
        .from("profiles")
        .insert({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: phone,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status,
          role: "customer",
          emergency_contacts: emergencyContacts
        })
        .select()
        .single()

      if (error) {
        toast.error("Failed to add customer: " + error.message)
      } else {
        toast.success("Customer added")
        logActivity({ action: 'create', entityType: 'customer', details: { name: formData.full_name } })
        if (data) {
          setCustomers(prev => [data as Customer, ...prev].slice(0, pageSize))
          setTotalCount(prev => prev + 1)
        }
        setDialogType(null)
      }
    }
    setLoading(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(customers.map(c => c.id)))
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
    const { error } = await supabase
      .from("profiles")
      .update({ status: "approved" })
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to approve customers")
    } else {
      toast.success(`${selectedIds.size} customers approved`)
      setCustomers(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status: "approved" } : c))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkSuspend = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const { error } = await supabase
      .from("profiles")
      .update({ status: "suspended" })
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to suspend customers")
    } else {
      toast.success(`${selectedIds.size} customers suspended`)
      setCustomers(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status: "suspended" } : c))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = new Set(selectedIds)
    setBulkLoading(true)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("profiles")
      .delete()
      .in("id", Array.from(selectedIds))

    if (error) {
      toast.error("Failed to delete customers")
    } else {
      toast.success(`${selectedIds.size} customers deleted`)
      setCustomers(prev => prev.filter(c => !idsToDelete.has(c.id)))
      setTotalCount(prev => Math.max(0, prev - idsToDelete.size))
      setSelectedIds(new Set())
    }
    setBulkLoading(false)
  }

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Employee ID", "Department", "Status", "Created At"]
    const rows = customers.map(c => [
      c.full_name,
      c.email || "",
      c.phone || "",
      c.employee_id || "",
      c.department || "",
      c.status,
      formatDate(c.created_at)
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers.csv"
    a.click()
  }

  const downloadTemplate = () => {
    const headers = ["full_name", "email", "phone", "employee_id", "department", "gender"]
    const example = ["John Doe", "john@example.com", "+9601234567", "A-1234", "IT Division", "male"]
    const csv = [headers.join(","), example.join(",")].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customer_import_template.csv"
    a.click()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split("\n").filter(line => line.trim())
        if (lines.length < 2) {
          setImportError("CSV file must have a header row and at least one data row")
          return
        }

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""))
        const nameIdx = headers.findIndex(h => h === "full_name" || h === "name")
        const emailIdx = headers.findIndex(h => h === "email")
        const phoneIdx = headers.findIndex(h => h === "phone")
        const empIdIdx = headers.findIndex(h => h === "employee_id" || h === "emp_id" || h === "employeeid")
        const deptIdx = headers.findIndex(h => h === "department" || h === "dept")
        const genderIdx = headers.findIndex(h => h === "gender" || h === "sex")

        if (nameIdx === -1) {
          setImportError("CSV must have a 'full_name' or 'name' column")
          return
        }

        const parsed: typeof importPreview = []
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""))
          const name = values[nameIdx] || ""
          if (!name) continue

          let phone = phoneIdx >= 0 ? values[phoneIdx] || "" : ""
          if (phone && !phone.startsWith("+")) {
            phone = `+960${phone}`
          }

          let gender = genderIdx >= 0 ? values[genderIdx]?.toLowerCase() || "" : ""
          if (gender === "m") gender = "male"
          if (gender === "f") gender = "female"

          parsed.push({
            full_name: name,
            email: emailIdx >= 0 ? values[emailIdx] || "" : "",
            phone: phone,
            employee_id: empIdIdx >= 0 ? values[empIdIdx] || "" : "",
            department: deptIdx >= 0 ? values[deptIdx] || "" : "",
            gender: gender,
          })
        }

        if (parsed.length === 0) {
          setImportError("No valid rows found in CSV")
          return
        }

        setImportPreview(parsed)
      } catch {
        setImportError("Failed to parse CSV file")
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (importPreview.length === 0) return
    setImportLoading(true)

    const toInsert = importPreview.map(row => ({
      full_name: row.full_name,
      email: row.email || null,
      phone: row.phone || null,
      employee_id: row.employee_id || null,
      department: row.department || null,
      gender: row.gender || null,
      status: "approved",
      role: "customer",
    }))

    // Insert one by one to skip duplicates
    let successCount = 0
    let skipCount = 0

    for (const customer of toInsert) {
      const { error } = await supabase
        .from("profiles")
        .insert(customer)

      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          skipCount++
        } else {
          console.error("Import error:", error)
        }
      } else {
        successCount++
      }
    }

    if (successCount > 0) {
      toast.success(`Imported ${successCount} customers${skipCount > 0 ? `, skipped ${skipCount} duplicates` : ""}`)
      logActivity({ action: 'create', entityType: 'customer', details: { bulk_import: true, count: successCount } })
    } else if (skipCount > 0) {
      toast.info(`All ${skipCount} customers already exist`)
    } else {
      toast.error("Failed to import customers")
    }
    setImportDialogOpen(false)
    setImportPreview([])
    router.refresh()
    setImportLoading(false)
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="success" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Active
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="warning" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Pending
          </Badge>
        )
      case "suspended":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Suspended
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
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
              <SelectItem value="approved">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => { setImportDialogOpen(true); setImportPreview([]); setImportError(null) }}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={openAddDialog}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Customer
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
            <Button size="sm" variant="outline" onClick={handleBulkSuspend} disabled={bulkLoading}>
              <Ban className="mr-2 h-4 w-4" />
              Suspend
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
                  checked={selectedIds.size === customers.length && customers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id} className="group hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(customer.id)}
                      onCheckedChange={() => toggleSelect(customer.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                        <AvatarImage src={customer.avatar_url ? `${customer.avatar_url}?t=${Date.now()}` : undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(customer.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{customer.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {customer.email ? (
                        <p className="text-sm flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {customer.email}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                      {customer.phone ? (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground select-text">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.employee_id ? (
                      <code className="px-2 py-1 rounded bg-muted text-xs font-mono">
                        {customer.employee_id}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer.department ? (
                      <Badge variant="outline" className="font-normal">
                        {customer.department}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="warning" className="gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                          Pending
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-green-500 border-green-500 hover:bg-green-500 hover:text-white"
                          onClick={() => handleApprove(customer)}
                          disabled={loading}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <Switch
                        checked={customer.status === "approved"}
                        onCheckedChange={() => toggleCustomerStatus(customer)}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" title={formatDate(customer.created_at)}>
                      {formatRelativeDate(customer.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(customer)}
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
                          setSelectedCustomer(customer)
                          setDialogType("view")
                        }}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEditDialog(customer)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {customer.status === "pending" && (
                          <>
                            <DropdownMenuItem onSelect={() => handleApprove(customer)}>
                              <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleReject(customer)}>
                              <XCircle className="mr-2 h-4 w-4 text-red-500" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        {customer.status !== "pending" && (
                          <DropdownMenuItem onSelect={() => handleSuspend(customer)}>
                            <Ban className="mr-2 h-4 w-4" />
                            {customer.status === "suspended" ? "Activate" : "Suspend"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => {
                            setSelectedCustomer(customer)
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
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} customers
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

      <Dialog open={dialogType === "delete"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedCustomer?.full_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === "view"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedCustomer.avatar_url ? `${selectedCustomer.avatar_url}?t=${Date.now()}` : undefined} />
                  <AvatarFallback className="text-lg">{getInitials(selectedCustomer.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{selectedCustomer.full_name}</p>
                  {statusBadge(selectedCustomer.status)}
                </div>
              </div>
              <div className="grid gap-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selectedCustomer.email || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{selectedCustomer.phone || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee ID</span>
                  <span>{selectedCustomer.employee_id || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{selectedCustomer.department || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{formatDate(selectedCustomer.created_at)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === "edit" || dialogType === "add"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "add" ? "Add Customer" : "Edit Customer"}</DialogTitle>
            <DialogDescription>
              {dialogType === "add" ? "Add a new customer to the system" : "Update customer information"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Full Name *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Phone <span className="text-red-500">*</span></label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="7XXXXXX"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Employee ID <span className="text-red-500">*</span></label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="EMP001"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Department</label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="Engineering"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Gender</label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Role</label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="super-admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Emergency Contact</label>
              <Input
                value={formData.emergency_contact}
                onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                placeholder="7XXXXXX"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : dialogType === "add" ? "Add Customer" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} customer(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import CSV Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Customers from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file with customer data. Required column: full_name. Optional: email, phone, employee_id, department.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Template
              </Button>
            </div>

            {importError && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                {importError}
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{importPreview.length} customers ready to import:</p>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Gender</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{row.full_name}</TableCell>
                          <TableCell className="text-muted-foreground">{row.email || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.phone || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.employee_id || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.department || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.gender || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importPreview.length > 10 && (
                    <p className="p-2 text-center text-sm text-muted-foreground">
                      ... and {importPreview.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importLoading || importPreview.length === 0}>
              {importLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {importPreview.length} Customers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
