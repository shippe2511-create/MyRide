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
import { Plus, Trash2, Search, Lock, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

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
        .in("role", ["customer", "admin", "super-admin"])
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
  const [selectedCustomer, setSelectedCustomer] = useState<string>("")
  const [selectedPool, setSelectedPool] = useState<string>("")

  const { data: customerPools, isLoading } = useCustomerPoolsData(poolFilter)
  const { data: availableCustomers } = useAvailableCustomers()
  const { data: currentUser } = useCurrentUser()

  const restrictedPools = pools.filter((p) => p.access_type === "restricted" && p.is_active)

  const addMutation = useMutation({
    mutationFn: async ({ customerId, poolId }: { customerId: string; poolId: string }) => {
      const { error } = await supabase.from("customer_pools").insert({
        customer_id: customerId,
        pool_id: poolId,
        granted_by: currentUser?.id,
        granted_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsAddOpen(false)
      setSelectedCustomer("")
      setSelectedPool("")
      toast.success("Customer granted pool access")
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Customer already has access to this pool")
      } else {
        toast.error(error.message || "Failed to grant access")
      }
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

  const filteredCustomerPools = (customerPools || []).filter((cp) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      cp.customer.full_name.toLowerCase().includes(searchLower) ||
      cp.customer.phone.includes(search) ||
      cp.customer.email.toLowerCase().includes(searchLower)
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
                <TableHead>Pool</TableHead>
                <TableHead>Granted By</TableHead>
                <TableHead>Granted At</TableHead>
                {canManage && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center py-8">
                    <p className="text-muted-foreground">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : filteredCustomerPools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center py-8">
                    <p className="text-muted-foreground">No customer access grants found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomerPools.map((cp) => (
                  <TableRow key={cp.id}>
                    <TableCell className="font-medium">{cp.customer.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{cp.customer.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{cp.customer.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="border-yellow-500/50 text-yellow-500"
                      >
                        <Lock className="h-3 w-3 mr-1" />
                        {cp.pool.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cp.granter?.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cp.granted_at
                        ? new Date(cp.granted_at).toLocaleDateString()
                        : new Date(cp.created_at).toLocaleDateString()}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => removeMutation.mutate(cp.id)}
                              disabled={removeMutation.isPending}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Revoke Access
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
              Grant a customer access to a restricted pool
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {(availableCustomers || []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.full_name} ({customer.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Restricted Pool</label>
              <Select value={selectedPool} onValueChange={setSelectedPool}>
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
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                addMutation.mutate({ customerId: selectedCustomer, poolId: selectedPool })
              }
              disabled={!selectedCustomer || !selectedPool || addMutation.isPending}
            >
              {addMutation.isPending ? "Granting..." : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
