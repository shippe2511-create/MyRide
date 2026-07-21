"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Layers, Plus, Pencil, Users, Car, Lock, Globe, Trash2, MoreHorizontal, Ban } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"
import { usePermissions } from "@/hooks/usePermissions"
import { toast } from "sonner"
import { PoolDriversTab } from "./pool-drivers-tab"
import { PoolCustomersTab } from "./pool-customers-tab"

const supabase = createClient()

interface Pool {
  id: string
  name: string
  description: string | null
  access_type: "open" | "restricted"
  is_active: boolean
  created_at: string
  driver_count?: number
  customer_count?: number
}

function usePoolsData() {
  return useQuery({
    queryKey: ["pools"],
    queryFn: async () => {
      const { data: pools, error } = await supabase
        .from("pools")
        .select("*")
        .order("name")

      if (error) throw error

      const poolsWithCounts = await Promise.all(
        (pools || []).map(async (pool) => {
          const [driverRes, customerRes] = await Promise.all([
            supabase
              .from("driver_pools")
              .select("*", { count: "exact", head: true })
              .eq("pool_id", pool.id),
            supabase
              .from("customer_pools")
              .select("*", { count: "exact", head: true })
              .eq("pool_id", pool.id),
          ])
          return {
            ...pool,
            driver_count: driverRes.count || 0,
            customer_count: customerRes.count || 0,
          }
        })
      )

      const stats = {
        total: poolsWithCounts.length,
        active: poolsWithCounts.filter((p) => p.is_active).length,
        open: poolsWithCounts.filter((p) => p.access_type === "open").length,
        restricted: poolsWithCounts.filter((p) => p.access_type === "restricted").length,
      }

      return { pools: poolsWithCounts, stats }
    },
    staleTime: 30 * 1000,
  })
}

export default function PoolsPage() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canManage = can("pools:manage")

  const { data, isLoading } = usePoolsData()
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    access_type: "open" as "open" | "restricted",
    is_active: true,
  })

  useEffect(() => {
    const channel = supabase
      .channel("pools_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pools" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pools"] })
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_pools" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pools"] })
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_pools" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pools"] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("pools").insert({
        name: data.name,
        description: data.description || null,
        access_type: data.access_type,
        is_active: data.is_active,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsCreateOpen(false)
      resetForm()
      toast.success("Pool created successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create pool")
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("pools")
        .update({
          name: data.name,
          description: data.description || null,
          access_type: data.access_type,
          is_active: data.is_active,
        })
        .eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsEditOpen(false)
      setSelectedPool(null)
      resetForm()
      toast.success("Pool updated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update pool")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pools").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsDeleteOpen(false)
      setSelectedPool(null)
      toast.success("Pool deleted successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete pool")
    },
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      access_type: "open",
      is_active: true,
    })
  }

  const openEditDialog = (pool: Pool) => {
    setSelectedPool(pool)
    setFormData({
      name: pool.name,
      description: pool.description || "",
      access_type: pool.access_type,
      is_active: pool.is_active,
    })
    setIsEditOpen(true)
  }

  const openDeleteDialog = (pool: Pool) => {
    setSelectedPool(pool)
    setIsDeleteOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  if (!data) return null

  const { pools, stats } = data

  return (
    <PermissionGate permission="pools:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6" />
              Service Pools
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage driver pools and customer access
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Pool
            </Button>
          )}
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
                <Layers className="h-4 w-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight">{stats.total}</p>
                <p className="text-xs text-muted-foreground truncate">Total Pools</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
                <Globe className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-green-500">{stats.open}</p>
                <p className="text-xs text-muted-foreground truncate">Open Pools</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
                <Lock className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-yellow-500">
                  {stats.restricted}
                </p>
                <p className="text-xs text-muted-foreground truncate">Restricted</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
                <Car className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-blue-500">{stats.active}</p>
                <p className="text-xs text-muted-foreground truncate">Active</p>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="pools">
          <TabsList>
            <TabsTrigger value="pools" className="gap-2">
              <Layers className="h-4 w-4" />
              Pools
            </TabsTrigger>
            <TabsTrigger value="drivers" className="gap-2">
              <Car className="h-4 w-4" />
              Driver Assignments
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="h-4 w-4" />
              Customer Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pools" className="mt-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Access Type</TableHead>
                    <TableHead>Drivers</TableHead>
                    <TableHead>Customers</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="text-center py-8">
                        <p className="text-muted-foreground">No pools found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pools.map((pool) => (
                      <TableRow key={pool.id}>
                        <TableCell className="font-medium">{pool.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {pool.description || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={pool.access_type === "open" ? "default" : "secondary"}
                            className={
                              pool.access_type === "open"
                                ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                                : "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30"
                            }
                          >
                            {pool.access_type === "open" ? (
                              <Globe className="h-3 w-3 mr-1" />
                            ) : (
                              <Lock className="h-3 w-3 mr-1" />
                            )}
                            {pool.access_type === "open" ? "Open" : "Restricted"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            {pool.driver_count}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {pool.customer_count}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={pool.is_active ? "default" : "secondary"}>
                            {pool.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openEditDialog(pool)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: pool.id,
                                      data: { ...pool, is_active: !pool.is_active },
                                    })
                                  }
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  {pool.is_active ? "Suspend" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(pool)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="drivers" className="mt-4">
            <PoolDriversTab pools={pools} canManage={canManage} />
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <PoolCustomersTab pools={pools} canManage={canManage} />
          </TabsContent>
        </Tabs>

        {/* Create Pool Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Pool</DialogTitle>
              <DialogDescription>
                Create a new service pool for drivers and customers
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Pool Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., VIP, Corporate, Standard"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description for this pool"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access_type">Access Type</Label>
                <Select
                  value={formData.access_type}
                  onValueChange={(value: "open" | "restricted") =>
                    setFormData({ ...formData, access_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-green-500" />
                        Open — Any customer can book
                      </div>
                    </SelectItem>
                    <SelectItem value="restricted">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-yellow-500" />
                        Restricted — Approved customers only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Pool"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Pool Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Pool</DialogTitle>
              <DialogDescription>Update pool settings</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Pool Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-access_type">Access Type</Label>
                <Select
                  value={formData.access_type}
                  onValueChange={(value: "open" | "restricted") =>
                    setFormData({ ...formData, access_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-green-500" />
                        Open — Any customer can book
                      </div>
                    </SelectItem>
                    <SelectItem value="restricted">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-yellow-500" />
                        Restricted — Approved customers only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-is_active">Active</Label>
                <Switch
                  id="edit-is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedPool && updateMutation.mutate({ id: selectedPool.id, data: formData })
                }
                disabled={!formData.name || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Pool</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the pool "{selectedPool?.name}"? This will remove
                all driver and customer assignments for this pool. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedPool && deleteMutation.mutate(selectedPool.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Pool"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
