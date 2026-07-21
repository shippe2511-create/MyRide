"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Building2, Plus, Loader2, RefreshCw, Pencil, Trash2, MoreHorizontal, Users, CheckCircle, XCircle } from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

interface Department {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  staff_count?: number
}

const supabase = createClient()

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState<string>("")
  const [deleteStaffCount, setDeleteStaffCount] = useState<number>(0)

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  })

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalStaff: 0,
  })

  useEffect(() => {
    loadDepartments()

    const channel = supabase
      .channel('departments_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => {
        loadDepartments()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadDepartments()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadDepartments = async () => {
    const { data: depts, error } = await supabase
      .from("departments")
      .select("*")
      .order("name", { ascending: true })

    if (error) {
      toast.error("Failed to load departments")
      setLoading(false)
      return
    }

    // Get staff counts per department
    const { data: staffCounts } = await supabase
      .from("profiles")
      .select("department_id")
      .in("role", ["super_admin", "manager", "operator"])
      .not("department_id", "is", null)

    const countMap: Record<string, number> = {}
    staffCounts?.forEach(s => {
      if (s.department_id) {
        countMap[s.department_id] = (countMap[s.department_id] || 0) + 1
      }
    })

    const deptsWithCount = (depts || []).map(d => ({
      ...d,
      staff_count: countMap[d.id] || 0,
    }))

    setDepartments(deptsWithCount)
    setStats({
      total: deptsWithCount.length,
      active: deptsWithCount.filter(d => d.is_active).length,
      inactive: deptsWithCount.filter(d => !d.is_active).length,
      totalStaff: Object.values(countMap).reduce((a, b) => a + b, 0),
    })
    setLoading(false)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Department name is required")
      return
    }

    setSaving(true)

    if (editingDepartment) {
      const { error } = await supabase
        .from("departments")
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        })
        .eq("id", editingDepartment.id)

      if (error) {
        if (error.code === "23505") {
          toast.error("A department with this name already exists")
        } else {
          toast.error("Failed to update department")
        }
      } else {
        toast.success("Department updated")
        closeDialog()
        loadDepartments()
      }
    } else {
      const { error } = await supabase
        .from("departments")
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        })

      if (error) {
        if (error.code === "23505") {
          toast.error("A department with this name already exists")
        } else {
          toast.error("Failed to create department")
        }
      } else {
        toast.success("Department created")
        closeDialog()
        loadDepartments()
      }
    }
    setSaving(false)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingDepartment(null)
    setFormData({ name: "", description: "", is_active: true })
  }

  const openEdit = (dept: Department) => {
    setEditingDepartment(dept)
    setFormData({
      name: dept.name,
      description: dept.description || "",
      is_active: dept.is_active,
    })
    setDialogOpen(true)
  }

  const confirmDelete = (dept: Department) => {
    setDeleteId(dept.id)
    setDeleteName(dept.name)
    setDeleteStaffCount(dept.staff_count || 0)
  }

  const handleDelete = async () => {
    if (!deleteId) return

    if (deleteStaffCount > 0) {
      toast.error(`Cannot delete department with ${deleteStaffCount} assigned staff. Reassign them first.`)
      setDeleteId(null)
      return
    }

    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", deleteId)

    if (error) {
      toast.error("Failed to delete department")
    } else {
      toast.success("Department deleted")
      loadDepartments()
    }
    setDeleteId(null)
  }

  const toggleActive = async (dept: Department) => {
    const { error } = await supabase
      .from("departments")
      .update({ is_active: !dept.is_active })
      .eq("id", dept.id)

    if (error) {
      toast.error("Failed to update department")
    } else {
      setDepartments(prev =>
        prev.map(d => d.id === dept.id ? { ...d, is_active: !d.is_active } : d)
      )
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-56 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="departments:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Departments
            </h1>
            <p className="text-sm text-muted-foreground">Manage organizational departments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDepartments}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Department
            </Button>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Building2 className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Departments</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/20">
                <XCircle className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.inactive}</p>
                <p className="text-xs text-muted-foreground">Inactive</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Users className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalStaff}</p>
                <p className="text-xs text-muted-foreground">Assigned Staff</p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No departments found. Create your first department.
                  </TableCell>
                </TableRow>
              ) : (
                departments.map(dept => (
                  <TableRow key={dept.id} className="group hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{dept.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {dept.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {dept.staff_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={dept.is_active}
                        onCheckedChange={() => toggleActive(dept)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(dept.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(dept)}
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
                            <DropdownMenuItem onClick={() => openEdit(dept)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => confirmDelete(dept)}
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
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDepartment ? "Edit Department" : "Add Department"}</DialogTitle>
              <DialogDescription>
                {editingDepartment
                  ? "Update department details"
                  : "Create a new organizational department"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Operations, IT, HR"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description of this department"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Active</label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={checked => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingDepartment ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Department?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteStaffCount > 0 ? (
                  <span className="text-red-500">
                    Cannot delete "{deleteName}" because it has {deleteStaffCount} staff member(s) assigned.
                    Reassign them to another department first.
                  </span>
                ) : (
                  <>
                    This will permanently delete the "{deleteName}" department.
                    This action cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600"
                disabled={deleteStaffCount > 0}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGate>
  )
}
