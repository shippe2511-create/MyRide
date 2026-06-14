"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Shield, ShieldCheck, UserCog, Headphones, Eye, MoreHorizontal, Edit, Trash2, Loader2, Ban, CheckCircle, KeyRound } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"

interface AdminUser {
  id: string
  full_name: string
  email: string
  phone: string | null
  employee_id: string | null
  department: string | null
  gender: string | null
  role: string
  status: string
  avatar_url: string | null
  created_at: string
}

interface AuditLog {
  id: string
  user_id: string
  action: string
  table_name: string | null
  created_at: string
  user: { full_name: string } | null
}

const ROLES = [
  {
    value: "super-admin",
    label: "Super Admin",
    description: "Full access to all features and settings",
    icon: ShieldCheck,
    color: "text-red-500"
  },
  {
    value: "admin",
    label: "Admin",
    description: "Manage users, content, and view reports",
    icon: Shield,
    color: "text-orange-500"
  },
  {
    value: "operator",
    label: "Operator",
    description: "Manage schedules, routes, and daily operations",
    icon: UserCog,
    color: "text-blue-500"
  },
  {
    value: "support",
    label: "Support",
    description: "Handle customer inquiries and basic updates",
    icon: Headphones,
    color: "text-green-500"
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "View-only access to dashboard and reports",
    icon: Eye,
    color: "text-gray-500"
  },
]

export default function AdminsPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<"add" | "edit" | "delete" | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_id: "",
    department: "",
    gender: "",
    role: "operator",
    status: "approved"
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [usersRes, logsRes] = await Promise.all([
      supabase.from("profiles").select("*").in("role", ["admin", "super-admin", "operator", "support", "viewer"]).order("created_at", { ascending: false }),
      supabase.from("audit_logs").select("*, user:profiles(full_name)").order("created_at", { ascending: false }).limit(20),
    ])
    setUsers(usersRes.data || [])
    setAuditLogs(logsRes.data || [])
    setLoading(false)
  }

  const openAddDialog = () => {
    setSelectedUser(null)
    setFormData({
      full_name: "",
      email: "",
      phone: "",
      employee_id: "",
      department: "",
      gender: "",
      role: "operator",
      status: "approved"
    })
    setDialogType("add")
  }

  const openEditDialog = (user: AdminUser) => {
    setSelectedUser(user)
    setFormData({
      full_name: user.full_name || "",
      email: user.email || "",
      phone: user.phone || "",
      employee_id: user.employee_id || "",
      department: user.department || "",
      gender: user.gender || "",
      role: user.role,
      status: user.status
    })
    setDialogType("edit")
  }

  const handleSave = async () => {
    if (!formData.full_name.trim() || !formData.email.trim()) {
      toast.error("Name and email are required")
      return
    }
    setSaving(true)

    if (dialogType === "edit" && selectedUser) {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone || null,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          role: formData.role,
          status: formData.status
        })
        .eq("id", selectedUser.id)

      if (error) toast.error("Failed to update user")
      else {
        toast.success("User updated")
        loadData()
      }
    } else {
      const { error } = await supabase
        .from("profiles")
        .insert({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone || null,
          employee_id: formData.employee_id || null,
          department: formData.department || null,
          gender: formData.gender || null,
          role: formData.role,
          status: formData.status
        })

      if (error) toast.error("Failed to add user: " + error.message)
      else {
        toast.success("User added")
        loadData()
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleDelete = async () => {
    if (!selectedUser) return
    setSaving(true)

    const { error } = await supabase.from("profiles").delete().eq("id", selectedUser.id)
    if (error) toast.error("Failed to delete user")
    else {
      toast.success("User deleted")
      loadData()
    }
    setSaving(false)
    setDialogType(null)
  }

  const toggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === "approved" ? "suspended" : "approved"
    const { error } = await supabase.from("profiles").update({ status: newStatus }).eq("id", user.id)
    if (error) toast.error("Failed to update status")
    else {
      toast.success(newStatus === "approved" ? "User activated" : "User suspended")
      loadData()
    }
  }

  const sendResetLink = async (user: AdminUser) => {
    if (!user.email) {
      toast.error("User has no email address")
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        toast.error(error.message)
      } else {
        toast.success(`Password reset link sent to ${user.email}`)
      }
    } catch {
      toast.error("Failed to send reset link")
    }
  }

  const getRoleInfo = (role: string) => {
    return ROLES.find(r => r.value === role) || ROLES[2]
  }

  const getRoleBadge = (role: string) => {
    const roleInfo = getRoleInfo(role)
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
      "super-admin": "destructive",
      "admin": "warning",
      "operator": "default",
      "support": "success",
      "viewer": "secondary"
    }
    return <Badge variant={variants[role] || "secondary"}>{roleInfo.label}</Badge>
  }

  const superAdmins = users.filter(u => u.role === "super-admin")
  const admins = users.filter(u => u.role === "admin")
  const operators = users.filter(u => u.role === "operator")
  const support = users.filter(u => u.role === "support")
  const viewers = users.filter(u => u.role === "viewer")

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users & Roles</h1>
          <p className="text-muted-foreground">
            Manage admin accounts, staff users, and permissions
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-red-500" />
              Super Admins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{superAdmins.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-500" />
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{admins.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCog className="h-4 w-4 text-blue-500" />
              Operators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{operators.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Headphones className="h-4 w-4 text-green-500" />
              Support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{support.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4 text-gray-500" />
              Viewers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{viewers.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Users ({users.length})</TabsTrigger>
          <TabsTrigger value="roles">Role Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Staff Users</CardTitle>
              <CardDescription>Users with access to the admin panel</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback>{user.full_name?.[0] || "U"}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          <Badge variant={user.status === "approved" ? "success" : user.status === "suspended" ? "destructive" : "warning"}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(user.created_at)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEditDialog(user)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => sendResetLink(user)}>
                                <KeyRound className="mr-2 h-4 w-4" />Send Reset Link
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => toggleStatus(user)}>
                                {user.status === "approved" ? (
                                  <><Ban className="mr-2 h-4 w-4" />Suspend</>
                                ) : (
                                  <><CheckCircle className="mr-2 h-4 w-4" />Activate</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onSelect={() => {
                                setSelectedUser(user)
                                setDialogType("delete")
                              }}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>Overview of what each role can do</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ROLES.map((role) => {
                  const Icon = role.icon
                  return (
                    <Card key={role.value} className="border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${role.color}`} />
                          {role.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                        <div className="space-y-1 text-xs">
                          {role.value === "super-admin" && (
                            <>
                              <p className="text-green-500">+ All permissions</p>
                              <p className="text-green-500">+ Manage other admins</p>
                              <p className="text-green-500">+ System settings</p>
                              <p className="text-green-500">+ Delete data</p>
                            </>
                          )}
                          {role.value === "admin" && (
                            <>
                              <p className="text-green-500">+ Manage users</p>
                              <p className="text-green-500">+ Manage content</p>
                              <p className="text-green-500">+ View reports</p>
                              <p className="text-red-500">- Cannot manage admins</p>
                            </>
                          )}
                          {role.value === "operator" && (
                            <>
                              <p className="text-green-500">+ Manage schedules</p>
                              <p className="text-green-500">+ Manage routes</p>
                              <p className="text-green-500">+ Update content</p>
                              <p className="text-red-500">- Cannot manage users</p>
                            </>
                          )}
                          {role.value === "support" && (
                            <>
                              <p className="text-green-500">+ View customers</p>
                              <p className="text-green-500">+ Update status</p>
                              <p className="text-green-500">+ Add announcements</p>
                              <p className="text-red-500">- Cannot delete data</p>
                            </>
                          )}
                          {role.value === "viewer" && (
                            <>
                              <p className="text-green-500">+ View dashboard</p>
                              <p className="text-green-500">+ View reports</p>
                              <p className="text-red-500">- Read-only access</p>
                              <p className="text-red-500">- Cannot modify data</p>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>Recent admin activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[500px] overflow-auto">
                {auditLogs.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No activity yet</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                      <div className="mt-0.5 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{log.user?.full_name || "System"}</span>
                          {" "}
                          <span className="text-muted-foreground">{log.action}</span>
                          {log.table_name && (
                            <span className="text-muted-foreground"> on {log.table_name}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogType === "add" || dialogType === "edit"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "add" ? "Add User" : "Edit User"}</DialogTitle>
            <DialogDescription>
              {dialogType === "add" ? "Add a new staff user with role assignment" : "Update user information and role"}
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
                <label className="text-sm font-medium">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@macl.aero"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+9607XXXXXX"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Employee ID</label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  placeholder="A-1234"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Department</label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="IT Division"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Gender</label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Role</label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => {
                    const Icon = role.icon
                    return (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${role.color}`} />
                          <span>{role.label}</span>
                          <span className="text-xs text-muted-foreground">- {role.description}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : dialogType === "add" ? "Add User" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={dialogType === "delete"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedUser?.full_name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
