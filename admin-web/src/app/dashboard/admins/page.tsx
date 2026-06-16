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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Shield, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface AdminUser {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  status: string
  avatar_url: string | null
  created_at: string
}

const ROLES = [
  { value: "super-admin", label: "Super Admin", color: "bg-red-500" },
  { value: "admin", label: "Admin", color: "bg-blue-500" },
  { value: "operator", label: "Operator", color: "bg-purple-500" },
  { value: "support", label: "Support", color: "bg-green-500" },
  { value: "viewer", label: "Viewer", color: "bg-gray-500" },
]

export default function AdminsPage() {
  const supabase = createClient()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "operator",
  })

  useEffect(() => {
    loadAdmins()
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
      setDialogOpen(false)
      setFormData({ full_name: "", email: "", phone: "", role: "operator" })
      loadAdmins()
    }
    setSaving(false)
  }

  const getRoleColor = (role: string) => {
    return ROLES.find(r => r.value === role)?.color || "bg-gray-500"
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Admins
          </h1>
          <p className="text-sm text-muted-foreground">Manage admin users and access</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAdmins}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Admin
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No admin users found
                </TableCell>
              </TableRow>
            ) : (
              admins.map(admin => (
                <TableRow key={admin.id}>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
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
              <label className="text-sm font-medium">Role</label>
              <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
