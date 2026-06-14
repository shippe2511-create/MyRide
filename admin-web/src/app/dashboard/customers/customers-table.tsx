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
  UserPlus,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { formatDate } from "@/lib/utils"

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

export function CustomersTable({ customers, totalCount, currentPage, pageSize }: CustomersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

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
    role: "customer"
  })

  const totalPages = Math.ceil(totalCount / pageSize)

  // Real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('customers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
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
    router.push(`/dashboard/customers?${params.toString()}`)
  }

  const handleSearch = () => {
    updateParams("search", search)
  }

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
      router.refresh()
    }
    setLoading(false)
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
      router.refresh()
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
      router.refresh()
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!selectedCustomer) return
    setLoading(true)

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", selectedCustomer.id)

    if (error) {
      toast.error("Failed to delete customer")
    } else {
      toast.success("Customer deleted")
      setDialogType(null)
      router.refresh()
    }
    setLoading(false)
  }

  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer)
    setFormData({
      full_name: customer.full_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      employee_id: customer.employee_id || "",
      department: customer.department || "",
      gender: customer.gender || "",
      status: customer.status || "approved",
      role: customer.role || "customer"
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
      role: "customer"
    })
    setDialogType("add")
  }

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast.error("Name is required")
      return
    }
    setLoading(true)

    if (dialogType === "edit" && selectedCustomer) {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: formData.phone || null,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status,
          role: formData.role
        })
        .eq("id", selectedCustomer.id)

      if (error) {
        toast.error("Failed to update customer")
      } else {
        toast.success("Customer updated")
        setDialogType(null)
        router.refresh()
      }
    } else if (dialogType === "add") {
      const { error } = await supabase
        .from("profiles")
        .insert({
          full_name: formData.full_name,
          email: formData.email || null,
          phone: formData.phone || null,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          status: formData.status,
          role: "customer"
        })

      if (error) {
        toast.error("Failed to add customer: " + error.message)
      } else {
        toast.success("Customer added")
        setDialogType(null)
        router.refresh()
      }
    }
    setLoading(false)
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
        return <Badge variant="success">Active</Badge>
      case "pending":
        return <Badge variant="warning">Pending</Badge>
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
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
          <Button onClick={openAddDialog}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={customer.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(customer.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{customer.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm">{customer.email || "-"}</p>
                      <p className="text-sm text-muted-foreground">{customer.phone || "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{customer.employee_id || "-"}</TableCell>
                  <TableCell>{customer.department || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusBadge(customer.status)}
                      {customer.status === "pending" && (
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
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(customer.created_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
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
                  <AvatarImage src={selectedCustomer.avatar_url || undefined} />
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
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Employee ID</label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="EMP001"
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : dialogType === "add" ? "Add Customer" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
