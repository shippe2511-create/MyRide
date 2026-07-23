"use client"

import { useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Plus, Search, Lock, MoreHorizontal, UserPlus, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { formatPhone } from "@/lib/format-phone"

const supabase = createClient()

interface Pool {
  id: string
  name: string
  access_type: "open" | "restricted"
  is_active: boolean
}

interface CustomerPool {
  id: string
  customer_id: string
  pool_id: string
  granted_by: string | null
  granted_at: string
  created_at: string
  customer: {
    full_name: string
    phone: string
    email: string
  }
  pool: {
    name: string
    access_type: string
  }
  granter?: {
    full_name: string
  } | null
}

interface Customer {
  id: string
  full_name: string
  phone: string
  email: string
}

function useCustomerPoolsData(poolFilter?: string) {
  return useQuery({
    queryKey: ["customer-pools", poolFilter],
    queryFn: async () => {
      let query = supabase
        .from("customer_pools")
        .select(`
          id,
          customer_id,
          pool_id,
          granted_by,
          granted_at,
          created_at,
          customer:profiles!customer_id(full_name, phone, email),
          pool:pools!pool_id(name, access_type),
          granter:profiles!granted_by(full_name)
        `)
        .order("granted_at", { ascending: false })

      if (poolFilter && poolFilter !== "all") {
        query = query.eq("pool_id", poolFilter)
      }

      const { data, error } = await query

      if (error) throw error
      return data as unknown as CustomerPool[]
    },
    staleTime: 30 * 1000,
  })
}

function useAvailableCustomers() {
  return useQuery({
    queryKey: ["available-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email")
        .neq("role", "driver")
        .eq("status", "approved")
        .order("full_name")

      if (error) throw error
      return data as Customer[]
    },
    staleTime: 60 * 1000,
  })
}

function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
  })
}

export function PoolCustomersTab({
  pools,
  canManage,
}: {
  pools: Pool[]
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [poolFilter, setPoolFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<string>("")
  const [selectedPools, setSelectedPools] = useState<Set<string>>(new Set())
  const [editingAccess, setEditingAccess] = useState<CustomerPool | null>(null)
  const [editPoolId, setEditPoolId] = useState<string>("")

  const { data: customerPools, isLoading } = useCustomerPoolsData(poolFilter)
  const { data: availableCustomers } = useAvailableCustomers()
  const { data: currentUser } = useCurrentUser()

  const restrictedPools = pools.filter((p) => p.access_type === "restricted" && p.is_active)

  const addMutation = useMutation({
    mutationFn: async ({ customerId, poolIds }: { customerId: string; poolIds: string[] }) => {
      const inserts = poolIds.map((poolId) => ({
        customer_id: customerId,
        pool_id: poolId,
        granted_by: currentUser?.id,
        granted_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from("customer_pools").upsert(inserts, {
        onConflict: "customer_id,pool_id",
        ignoreDuplicates: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsAddOpen(false)
      setSelectedCustomer("")
      setSelectedPools(new Set())
      toast.success("Customer granted pool access")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to grant access")
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_pools").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      toast.success("Customer access revoked")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke access")
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, newPoolId }: { id: string; newPoolId: string }) => {
      const { error } = await supabase
        .from("customer_pools")
        .update({
          pool_id: newPoolId,
          granted_by: currentUser?.id,
          granted_at: new Date().toISOString(),
        })
        .eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsEditOpen(false)
      setEditingAccess(null)
      setEditPoolId("")
      toast.success("Pool access updated")
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Customer already has access to this pool")
      } else {
        toast.error(error.message || "Failed to update access")
      }
    },
  })

  const openEditDialog = (cp: CustomerPool) => {
    setEditingAccess(cp)
    setEditPoolId(cp.pool_id)
    setIsEditOpen(true)
  }

  const openGrantMoreDialog = (customerId: string) => {
    setSelectedCustomer(customerId)
    setSelectedPools(new Set())
    setIsAddOpen(true)
  }

  // Group customer pools by customer
  const groupedByCustomer = (customerPools || []).reduce((acc, cp) => {
    const customerId = cp.customer_id
    if (!acc[customerId]) {
      acc[customerId] = {
        customer_id: customerId,
        customer: cp.customer,
        pools: [],
        earliest_date: cp.granted_at || cp.created_at,
        granter: cp.granter,
      }
    }
    acc[customerId].pools.push({
      id: cp.id,
      pool_id: cp.pool_id,
      pool: cp.pool,
      granted_at: cp.granted_at,
      created_at: cp.created_at,
      granter: cp.granter
    })
    return acc
  }, {} as Record<string, {
    customer_id: string
    customer: CustomerPool["customer"]
    pools: { id: string; pool_id: string; pool: CustomerPool["pool"]; granted_at: string; created_at: string; granter: CustomerPool["granter"] }[]
    earliest_date: string
    granter: CustomerPool["granter"]
  }>)

  const filteredCustomers = Object.values(groupedByCustomer).filter((group) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      group.customer.full_name.toLowerCase().includes(searchLower) ||
      group.customer.phone.includes(search) ||
      group.customer.email.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={poolFilter} onValueChange={setPoolFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by pool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pools</SelectItem>
              {restrictedPools.map((pool) => (
                <SelectItem key={pool.id} value={pool.id}>
                  {pool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button onClick={() => setIsAddOpen(true)} disabled={restrictedPools.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Grant Access
          </Button>
        )}
      </div>

      {restrictedPools.length === 0 && (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No restricted pools exist.</p>
            <p className="text-sm">Customer access management only applies to restricted pools.</p>
          </div>
        </Card>
      )}

      {restrictedPools.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Pools</TableHead>
                <TableHead>Granted At</TableHead>
                {canManage && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8">
                    <p className="text-muted-foreground">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8">
                    <p className="text-muted-foreground">No customer access grants found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((group) => (
                  <TableRow key={group.customer_id}>
                    <TableCell className="font-medium">{group.customer.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatPhone(group.customer.phone)}</TableCell>
                    <TableCell className="text-muted-foreground">{group.customer.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.pools.map((p) => (
                          <Badge
                            key={p.id}
                            variant="outline"
                            className="group/badge pr-1 border-yellow-500/50 text-yellow-500"
                          >
                            <Lock className="h-3 w-3 mr-1" />
                            {p.pool.name}
                            {canManage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeMutation.mutate(p.id)
                                }}
                                disabled={removeMutation.isPending}
                                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(group.earliest_date).toLocaleDateString("en-US", { timeZone: "Indian/Maldives", month: "short", day: "numeric", year: "numeric" })}
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
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openGrantMoreDialog(group.customer_id)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Grant More Access
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
      )}

      {/* Grant Access Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Pool Access</DialogTitle>
            <DialogDescription>
              Grant a customer access to one or more restricted pools
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <ComboboxInput
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                options={(availableCustomers || []).map((customer) => ({
                  value: customer.id,
                  label: `${customer.full_name}${customer.phone ? ` (${formatPhone(customer.phone)})` : ""}`,
                }))}
                placeholder="Search customer..."
                allowCustom={false}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Restricted Pools</label>
              {(() => {
                const customerExistingPools = selectedCustomer
                  ? (customerPools || [])
                      .filter((cp) => cp.customer_id === selectedCustomer)
                      .map((cp) => cp.pool_id)
                  : []
                return restrictedPools.length === 0 ? (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground">
                    <Lock className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No restricted pools available</p>
                  </div>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {restrictedPools.map((pool) => {
                      const alreadyHasAccess = customerExistingPools.includes(pool.id)
                      return (
                        <div
                          key={pool.id}
                          className={`flex items-center gap-3 p-2 rounded ${
                            alreadyHasAccess
                              ? "bg-green-500/10 cursor-default"
                              : "hover:bg-muted/50 cursor-pointer"
                          }`}
                          onClick={() => {
                            if (alreadyHasAccess) return
                            const newSelected = new Set(selectedPools)
                            if (newSelected.has(pool.id)) {
                              newSelected.delete(pool.id)
                            } else {
                              newSelected.add(pool.id)
                            }
                            setSelectedPools(newSelected)
                          }}
                        >
                          <Checkbox
                            checked={alreadyHasAccess || selectedPools.has(pool.id)}
                            disabled={alreadyHasAccess}
                            onCheckedChange={(checked) => {
                              if (alreadyHasAccess) return
                              const newSelected = new Set(selectedPools)
                              if (checked) {
                                newSelected.add(pool.id)
                              } else {
                                newSelected.delete(pool.id)
                              }
                              setSelectedPools(newSelected)
                            }}
                          />
                          <div className="flex items-center gap-2 flex-1">
                            <Lock className={`h-4 w-4 ${alreadyHasAccess ? "text-green-500" : "text-yellow-500"}`} />
                            <span className="font-medium">{pool.name}</span>
                          </div>
                          {alreadyHasAccess && (
                            <span className="text-xs text-green-500 font-medium">Already granted</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {selectedPools.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedPools.size} new pool{selectedPools.size > 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                addMutation.mutate({ customerId: selectedCustomer, poolIds: Array.from(selectedPools) })
              }
              disabled={!selectedCustomer || selectedPools.size === 0 || addMutation.isPending}
            >
              {addMutation.isPending ? "Granting..." : `Grant Access to ${selectedPools.size} Pool${selectedPools.size > 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pool Access Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Pool Access</DialogTitle>
            <DialogDescription>
              Change which pool {editingAccess?.customer.full_name} has access to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <div className="p-3 border rounded-lg bg-muted/50">
                <p className="font-medium">{editingAccess?.customer.full_name}</p>
                <p className="text-sm text-muted-foreground">{editingAccess?.customer.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Pool</label>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                <Lock className="h-4 w-4 text-yellow-500" />
                <span>{editingAccess?.pool.name}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Pool</label>
              <Select value={editPoolId} onValueChange={setEditPoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pool" />
                </SelectTrigger>
                <SelectContent>
                  {restrictedPools.map((pool) => (
                    <SelectItem key={pool.id} value={pool.id}>
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-yellow-500" />
                        {pool.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editingAccess && editMutation.mutate({ id: editingAccess.id, newPoolId: editPoolId })
              }
              disabled={!editPoolId || editPoolId === editingAccess?.pool_id || editMutation.isPending}
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
