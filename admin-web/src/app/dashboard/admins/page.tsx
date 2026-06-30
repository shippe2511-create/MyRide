"use client"

import { useState, useEffect } from "react"
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
import { Plus, Shield, Loader2, RefreshCw, Pencil, Trash2, MoreHorizontal, KeyRound, Eye, EyeOff, Info, Settings2, Download, X } from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"
import { usePermissions } from "@/hooks/usePermissions"
import { ROLE_DESCRIPTIONS, type Role, type Permission, getPermissionsForRole } from "@/lib/permissions"
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
}

const ALL_PERMISSIONS: { key: Permission; label: string; category: string }[] = [
  { key: "dashboard:view", label: "View Dashboard", category: "Dashboard" },
  { key: "customers:view", label: "View Customers", category: "Customers" },
  { key: "customers:manage", label: "Manage Customers", category: "Customers" },
  { key: "drivers:view", label: "View Drivers", category: "Drivers" },
  { key: "drivers:manage", label: "Manage Drivers", category: "Drivers" },
  { key: "vehicles:view", label: "View Vehicles", category: "Vehicles" },
  { key: "vehicles:manage", label: "Manage Vehicles", category: "Vehicles" },
  { key: "rides:view", label: "View Rides", category: "Rides" },
  { key: "rides:manage", label: "Manage Rides", category: "Rides" },
  { key: "tracking:view", label: "View Live Tracking", category: "Tracking" },
  { key: "schedules:view", label: "View Schedules", category: "Schedules" },
  { key: "schedules:manage", label: "Manage Schedules", category: "Schedules" },
  { key: "pretrip:view", label: "View Pre-trip Checks", category: "Pre-trip" },
  { key: "pretrip:manage", label: "Manage Pre-trip Checks", category: "Pre-trip" },
  { key: "eligibility:view", label: "View Eligibility", category: "Eligibility" },
  { key: "eligibility:manage", label: "Manage Eligibility", category: "Eligibility" },
  { key: "content:view", label: "View Content", category: "Content" },
  { key: "content:manage", label: "Manage Content", category: "Content" },
  { key: "zones:view", label: "View Service Zones", category: "Zones" },
  { key: "zones:manage", label: "Manage Service Zones", category: "Zones" },
  { key: "chat:view", label: "View Chat", category: "Chat" },
  { key: "chat:manage", label: "Manage Chat", category: "Chat" },
  { key: "sos:view", label: "View SOS Alerts", category: "SOS" },
  { key: "sos:manage", label: "Manage SOS Alerts", category: "SOS" },
  { key: "ratings:view", label: "View Ratings", category: "Ratings" },
  { key: "ratings:manage", label: "Manage Ratings", category: "Ratings" },
  { key: "reports:view", label: "View Reports", category: "Reports" },
  { key: "admins:view", label: "View Admins", category: "Admins" },
  { key: "admins:manage", label: "Manage Admins", category: "Admins" },
  { key: "settings:view", label: "View Settings", category: "Settings" },
  { key: "settings:manage", label: "Manage Settings", category: "Settings" },
]

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "super-admin", label: "Super Admin", color: "bg-red-500" },
  { value: "admin", label: "Admin", color: "bg-blue-500" },
  { value: "operator", label: "Operator", color: "bg-purple-500" },
  { value: "support", label: "Support", color: "bg-green-500" },
  { value: "viewer", label: "Viewer", color: "bg-gray-500" },
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

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "operator",
  })

  useEffect(() => {
    loadAdmins()

    const channel = supabase
      .channel('admins_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadAdmins()
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
      .select("*")
      .in("role", ["super-admin", "admin", "operator", "support", "viewer"])
      .order("created_at", { ascending: false })

    setAdmins(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!formData.full_name || !formData.email) {
      toast.error("Name and email are required")
      return
    }

    setSaving(true)

    if (editingAdmin) {
      const { error } = await supabase.from("profiles").update({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone || null,
        role: formData.role,
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
    setFormData({ full_name: "", email: "", phone: "", role: "operator" })
  }

  const openEdit = (admin: AdminUser) => {
    setEditingAdmin(admin)
    setFormData({
      full_name: admin.full_name,
      email: admin.email,
      phone: admin.phone || "",
      role: admin.role,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)

    const { error } = await supabase.from("profiles").update({ role: "user" }).eq("id", idToDelete)
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
    const headers = ["Name", "Email", "Phone", "Role", "Status", "Created At"]
    const rows = admins.map(a => [
      a.full_name,
      a.email || "",
      a.phone || "",
      a.role,
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
    <PermissionGate permission="admins:view">
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
              <TableHead>Active</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
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
                        <p className="text-xs text-muted-foreground">{admin.phone || "-"}</p>
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
                    <Badge className={admin.status === "approved" ? "bg-green-500" : "bg-yellow-500"}>
                      {admin.status}
                    </Badge>
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
                <p className="text-xs text-muted-foreground mt-1">Only super-admin can change roles</p>
              )}
            </div>
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
                {Array.from(new Set(ALL_PERMISSIONS.map(p => p.category))).map(category => (
                  <div key={category}>
                    <h4 className="font-medium text-sm mb-2 text-muted-foreground">{category}</h4>
                    <div className="space-y-2">
                      {ALL_PERMISSIONS.filter(p => p.category === category).map(perm => (
                        <div key={perm.key} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-accent">
                          <div className="flex items-center gap-2">
                            {isCustomOverride(perm.key) && (
                              <div className="w-2 h-2 rounded-full bg-yellow-500" title="Custom override" />
                            )}
                            <span className="text-sm">{perm.label}</span>
                          </div>
                          <Switch
                            checked={getEffectivePermission(perm.key)}
                            onCheckedChange={() => togglePermission(perm.key)}
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
