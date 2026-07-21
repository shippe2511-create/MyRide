"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Shield, Loader2, RefreshCw, Pencil, Trash2, MoreHorizontal, KeyRound, Eye, EyeOff, Info, Settings2, Download, X, Building2 } from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { usePermissions } from "@/hooks/usePermissions"
import { ROLE_DESCRIPTIONS, ROLE_COLORS, ROLE_LABELS, PERMISSION_CATEGORIES, type Role, type Permission, getPermissionsForRole, ALL_PERMISSIONS, STAFF_ROLES } from "@/lib/permissions"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PermissionGate } from "@/components/permission-gate"

interface AdminUser {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  status: string
  avatar_url: string | null
  created_at: string
  custom_permissions?: Record<string, boolean>
  department_id: string | null
  dept_relation?: { id: string; name: string } | null
}

interface Department {
  id: string
  name: string
  is_active: boolean
}

// 3-tier RBAC system
const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "super_admin", label: ROLE_LABELS["super_admin"], color: ROLE_COLORS["super_admin"] },
  { value: "manager", label: ROLE_LABELS["manager"], color: ROLE_COLORS["manager"] },
  { value: "operator", label: ROLE_LABELS["operator"], color: ROLE_COLORS["operator"] },
]

export default function AdminsPage() {
  const supabase = createClient()
  const { isSuperAdmin, can } = usePermissions()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [resetPasswordAdmin, setResetPasswordAdmin] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [permissionsAdmin, setPermissionsAdmin] = useState<AdminUser | null>(null)
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({})
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "operator",
    department_id: "",
  })

  useEffect(() => {
    loadAdmins()
    loadDepartments()

    const adminRoles = ['super_admin', 'manager', 'operator']

    const channel = supabase
      .channel('admins_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const updated = payload.new as AdminUser
        // Skip if we're currently updating this admin locally
        if (updatingIdsRef.current.has(updated.id)) return

        if (adminRoles.includes(updated.role)) {
          // Update or add if now an admin
          setAdmins(prev => {
            const exists = prev.find(a => a.id === updated.id)
            if (exists) {
              return prev.map(a => a.id === updated.id ? { ...a, ...updated } : a)
            }
            return [...prev, updated]
          })
        } else {
          // Remove if no longer an admin role
          setAdmins(prev => prev.filter(a => a.id !== updated.id))
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
        const inserted = payload.new as AdminUser
        if (adminRoles.includes(inserted.role)) {
          setAdmins(prev => [...prev, inserted])
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, (payload) => {
        const deleted = payload.old as { id: string }
        setAdmins(prev => prev.filter(a => a.id !== deleted.id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadAdmins = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("profiles")
      .select("*, dept_relation:departments(id, name)")
      .in("role", ["super_admin", "manager", "operator"])
      .order("created_at", { ascending: false })

    setAdmins(data || [])
    setLoading(false)
  }

  const loadDepartments = async () => {
    const { data } = await supabase
      .from("departments")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name")
    setDepartments(data || [])
  }

  const handleSave = async () => {
    if (!formData.full_name || !formData.email) {
      toast.error("Name and email are required")
      return
    }

    // Validate department for non-super_admin roles
    if (formData.role !== "super_admin" && !formData.department_id) {
      toast.error("Department is required for Manager and Operator roles")
      return
    }

    setSaving(true)

    // super_admin always has NULL department_id
    const departmentId = formData.role === "super_admin" ? null : (formData.department_id || null)

    if (editingAdmin) {
      const { error } = await supabase.from("profiles").update({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone || null,
        role: formData.role,
        department_id: departmentId,
      }).eq("id", editingAdmin.id)

      if (error) {
        toast.error("Failed to update admin")
      } else {
        toast.success("Admin updated")
        closeDialog()
        loadAdmins()
      }
    } else {
      const { error } = await supabase.from("profiles").insert({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone || null,
        role: formData.role,
        department_id: departmentId,
        status: "approved",
      })

      if (error) {
        toast.error("Failed to create admin")
      } else {
        toast.success("Admin created")
        closeDialog()
        loadAdmins()
      }
    }
    setSaving(false)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingAdmin(null)
    setFormData({ full_name: "", email: "", phone: "", role: "operator", department_id: "" })
  }

  const openEdit = (admin: AdminUser) => {
    setEditingAdmin(admin)
    setFormData({
      full_name: admin.full_name,
      email: admin.email,
      phone: admin.phone || "",
      role: admin.role,
      department_id: admin.department_id || "",
    })
    setDialogOpen(true)
  }

  const updatingIdsRef = useRef<Set<string>>(new Set())

  const toggleAdminStatus = async (admin: AdminUser) => {
    const newStatus = admin.status === "approved" ? "suspended" : "approved"

    // Mark as updating to skip realtime updates
    updatingIdsRef.current.add(admin.id)

    // Optimistic update
    setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, status: newStatus } : a))

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", admin.id)

    // Clear updating flag after a short delay
    setTimeout(() => {
      updatingIdsRef.current.delete(admin.id)
    }, 500)

    if (error) {
      toast.error("Failed to update status")
      // Revert on error
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, status: admin.status } : a))
    } else {
      toast.success(`Admin ${newStatus === "approved" ? "activated" : "suspended"}`)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)

    const { error } = await supabase.from("profiles").update({ role: "customer" }).eq("id", idToDelete)
    if (error) {
      toast.error("Failed to remove admin")
    } else {
      toast.success("Admin removed")
      loadAdmins()
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordAdmin || !newPassword) return
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setResettingPassword(true)
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resetPasswordAdmin.id,
          email: resetPasswordAdmin.email,
          newPassword,
        }),
      })

      if (response.ok) {
        toast.success(`Password reset for ${resetPasswordAdmin.full_name}`)
        setResetPasswordAdmin(null)
        setNewPassword("")
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to reset password")
      }
    } catch {
      toast.error("Failed to reset password")
    }
    setResettingPassword(false)
  }

  const openPermissions = (admin: AdminUser) => {
    setPermissionsAdmin(admin)
    setCustomPermissions(admin.custom_permissions || {})
  }

  const getEffectivePermission = (permission: Permission): boolean => {
    if (customPermissions[permission] !== undefined) {
      return customPermissions[permission]
    }
    if (permissionsAdmin) {
      const rolePermissions = getPermissionsForRole(permissionsAdmin.role)
      return rolePermissions.includes(permission)
    }
    return false
  }

  const isCustomOverride = (permission: Permission): boolean => {
    return customPermissions[permission] !== undefined
  }

  const togglePermission = (permission: Permission) => {
    const rolePermissions = permissionsAdmin ? getPermissionsForRole(permissionsAdmin.role) : []
    const roleHas = rolePermissions.includes(permission)
    const currentCustom = customPermissions[permission]

    if (currentCustom === undefined) {
      setCustomPermissions({ ...customPermissions, [permission]: !roleHas })
    } else if (currentCustom === !roleHas) {
      const newPerms = { ...customPermissions }
      delete newPerms[permission]
      setCustomPermissions(newPerms)
    } else {
      setCustomPermissions({ ...customPermissions, [permission]: !currentCustom })
    }
  }

  const handleSavePermissions = async () => {
    if (!permissionsAdmin) return
    setSavingPermissions(true)

    const { error } = await supabase
      .from("profiles")
      .update({ custom_permissions: customPermissions })
      .eq("id", permissionsAdmin.id)

    if (error) {
      toast.error("Failed to save permissions")
    } else {
      toast.success("Permissions saved")
      setPermissionsAdmin(null)
      loadAdmins()
    }
    setSavingPermissions(false)
  }

  const resetToRoleDefaults = () => {
    setCustomPermissions({})
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteOpen(false)

    const { error } = await supabase
      .from("profiles")
      .update({ role: "user" })
      .in("id", idsToDelete)

    if (error) {
      toast.error("Failed to remove selected admins")
    } else {
      toast.success(`${idsToDelete.length} admin(s) removed`)
      setSelectedIds(new Set())
      loadAdmins()
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === admins.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(admins.map(a => a.id)))
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

  const getRoleColor = (role: string) => {
    return ROLES.find(r => r.value === role)?.color || "bg-gray-500"
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", { timeZone: "Indian/Maldives", month: "short", day: "numeric", year: "numeric" })
  }

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Role", "Department", "Status", "Created At"]
    const rows = admins.map(a => [
      a.full_name,
      a.email || "",
      a.phone || "",
      a.role,
      a.role === "super_admin" ? "All Departments" : (a.dept_relation?.name || ""),
      a.status,
      formatDate(a.created_at)
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `admins_${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Admins exported")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-24 h-8 bg-muted rounded animate-pulse" />
          <div className="w-56 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="staff:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Admins
          </h1>
          <p className="text-sm text-muted-foreground">Manage admin users and access</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={loadAdmins}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Admin
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {ROLES.map(role => {
          const count = admins.filter(a => a.role === role.value).length
          return (
            <Card key={role.value} className={`p-4 bg-gradient-to-br from-${role.color.replace('bg-', '')}/10 to-${role.color.replace('bg-', '')}/5 border-${role.color.replace('bg-', '')}/20`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${role.color}/20 shrink-0`}>
                  <Shield className={`h-4 w-4 text-${role.color.replace('bg-', '')}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-bold tracking-tight ${count > 0 ? `text-${role.color.replace('bg-', '')}` : 'text-muted-foreground'}`}>{count}</p>
                  <p className="text-xs text-muted-foreground truncate">{role.label}</p>
                </div>
              </div>
            </Card>
          )
        })}
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
            Remove Selected
          </Button>
        </div>
      )}

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              {isSuperAdmin && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={admins.length > 0 && selectedIds.size === admins.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  No admin users found
                </TableCell>
              </TableRow>
            ) : (
              admins.map(admin => (
                <TableRow key={admin.id} className={`group hover:bg-muted/50 transition-colors ${selectedIds.has(admin.id) ? 'bg-muted/50' : ''}`}>
                  {isSuperAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(admin.id)}
                        onCheckedChange={() => toggleSelect(admin.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={admin.avatar_url || undefined} />
                        <AvatarFallback>{admin.full_name?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{admin.full_name}</p>
                        <p className="text-xs text-muted-foreground select-text">{admin.phone || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(admin.role)}>
                      {ROLES.find(r => r.value === admin.role)?.label || admin.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {admin.role === "super_admin" ? (
                      <span className="text-xs text-muted-foreground italic">All Departments</span>
                    ) : admin.dept_relation ? (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{admin.dept_relation.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={admin.status === "approved"}
                      onCheckedChange={() => toggleAdminStatus(admin)}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(admin.created_at)}
                  </TableCell>
                  <TableCell>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(admin)}
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
                            <DropdownMenuItem onClick={() => openEdit(admin)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPermissions(admin)}>
                              <Settings2 className="h-4 w-4 mr-2" />
                              Manage Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetPasswordAdmin(admin)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => setDeleteId(admin.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove admin privileges. The user account will remain but won't have admin access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} Admin(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove admin privileges from {selectedIds.size} selected user(s). Their accounts will remain but they won't have admin access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">
              Remove All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAdmin ? "Edit Admin" : "Add Admin User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium">Role</label>
                {formData.role && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-sm">{ROLE_DESCRIPTIONS[formData.role as Role]}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <Select
                value={formData.role}
                onValueChange={v => setFormData({ ...formData, role: v })}
                disabled={!isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <span>{role.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground mt-1">Only Super Admin can change roles</p>
              )}
            </div>
            {formData.role !== "super_admin" && (
              <div>
                <label className="text-sm font-medium">Department *</label>
                <Select
                  value={formData.department_id}
                  onValueChange={v => setFormData({ ...formData, department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {dept.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Required for Manager and Operator roles
                </p>
              </div>
            )}
            {formData.role === "super_admin" && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 inline mr-1" />
                  Super Admins have access to all departments
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingAdmin ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordAdmin} onOpenChange={() => { setResetPasswordAdmin(null); setNewPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Reset Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set a new password for <strong>{resetPasswordAdmin?.full_name}</strong> ({resetPasswordAdmin?.email})
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPasswordAdmin(null); setNewPassword(""); }}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={resettingPassword || !newPassword}>
              {resettingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Permissions Dialog */}
      <Dialog open={!!permissionsAdmin} onOpenChange={() => setPermissionsAdmin(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Manage Permissions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {permissionsAdmin && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{permissionsAdmin.full_name}</p>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    Role: <Badge className={getRoleColor(permissionsAdmin.role)}>{ROLES.find(r => r.value === permissionsAdmin.role)?.label || permissionsAdmin.role}</Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={resetToRoleDefaults}>
                  Reset to Role Defaults
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Toggle permissions to override role defaults. Yellow dot = custom override.
            </p>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
                  <div key={key}>
                    <h4 className="font-medium text-sm mb-2 text-muted-foreground">{category.label}</h4>
                    <div className="space-y-2">
                      {category.permissions.map(perm => (
                        <div key={perm} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-accent">
                          <div className="flex items-center gap-2">
                            {isCustomOverride(perm) && (
                              <div className="w-2 h-2 rounded-full bg-yellow-500" title="Custom override" />
                            )}
                            <span className="text-sm">{perm.replace(":", " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                          </div>
                          <Switch
                            checked={getEffectivePermission(perm)}
                            onCheckedChange={() => togglePermission(perm)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsAdmin(null)}>
              Cancel
            </Button>
            <Button onClick={handleSavePermissions} disabled={savingPermissions}>
              {savingPermissions ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
