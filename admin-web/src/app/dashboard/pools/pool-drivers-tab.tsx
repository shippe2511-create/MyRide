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
import { Plus, Trash2, Car, Search, MoreHorizontal, Lock, Globe, Pencil, UserPlus } from "lucide-react"
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
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

interface DriverPool {
  id: string
  driver_id: string
  pool_id: string
  created_at: string
  driver: {
    id: string
    profile: {
      full_name: string
      phone: string
    }
    vehicle?: {
      vehicle_number: string
      vehicle_model: string
    } | null
  }
  pool: {
    name: string
    access_type: string
  }
}

interface Driver {
  id: string
  profile_id: string
  profile: {
    full_name: string
    phone: string
  }
  vehicle?: {
    vehicle_number: string
  } | null
}

function useDriverPoolsData(poolFilter?: string) {
  return useQuery({
    queryKey: ["driver-pools", poolFilter],
    queryFn: async () => {
      let query = supabase
        .from("driver_pools")
        .select(`
          id,
          driver_id,
          pool_id,
          created_at,
          driver:drivers!inner(
            id,
            profile:profiles!drivers_profile_id_fkey(full_name, phone),
            vehicle:vehicles(vehicle_number, vehicle_model)
          ),
          pool:pools!inner(name, access_type)
        `)
        .order("created_at", { ascending: false })

      if (poolFilter && poolFilter !== "all") {
        query = query.eq("pool_id", poolFilter)
      }

      const { data, error } = await query

      if (error) throw error
      return data as unknown as DriverPool[]
    },
    staleTime: 30 * 1000,
  })
}

function useAvailableDrivers() {
  return useQuery({
    queryKey: ["available-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          id,
          profile_id,
          profile:profiles!drivers_profile_id_fkey(full_name, phone),
          vehicle:vehicles(vehicle_number)
        `)
        .order("profile(full_name)")

      if (error) throw error
      return data as unknown as Driver[]
    },
    staleTime: 60 * 1000,
  })
}

export function PoolDriversTab({
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
  const [selectedDriver, setSelectedDriver] = useState<string>("")
  const [selectedPools, setSelectedPools] = useState<Set<string>>(new Set())
  const [editingAssignment, setEditingAssignment] = useState<DriverPool | null>(null)
  const [editPoolId, setEditPoolId] = useState<string>("")

  const { data: driverPools, isLoading } = useDriverPoolsData(poolFilter)
  const { data: availableDrivers } = useAvailableDrivers()

  const addMutation = useMutation({
    mutationFn: async ({ driverId, poolIds }: { driverId: string; poolIds: string[] }) => {
      const inserts = poolIds.map((poolId) => ({
        driver_id: driverId,
        pool_id: poolId,
      }))
      const { error } = await supabase.from("driver_pools").upsert(inserts, {
        onConflict: "driver_id,pool_id",
        ignoreDuplicates: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsAddOpen(false)
      setSelectedDriver("")
      setSelectedPools(new Set())
      toast.success("Driver assigned to pools")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to assign driver to pools")
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("driver_pools").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      toast.success("Driver removed from pool")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove driver from pool")
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, newPoolId }: { id: string; newPoolId: string }) => {
      const { error } = await supabase
        .from("driver_pools")
        .update({ pool_id: newPoolId })
        .eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsEditOpen(false)
      setEditingAssignment(null)
      setEditPoolId("")
      toast.success("Pool assignment updated")
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Driver is already assigned to this pool")
      } else {
        toast.error(error.message || "Failed to update assignment")
      }
    },
  })

  const openEditDialog = (dp: DriverPool) => {
    setEditingAssignment(dp)
    setEditPoolId(dp.pool_id)
    setIsEditOpen(true)
  }

  const openAssignMoreDialog = (driverId: string) => {
    setSelectedDriver(driverId)
    setSelectedPools(new Set())
    setIsAddOpen(true)
  }

  const filteredDriverPools = (driverPools || []).filter((dp) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      dp.driver.profile.full_name.toLowerCase().includes(searchLower) ||
      dp.driver.profile.phone.includes(search) ||
      dp.driver.vehicle?.vehicle_number?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
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
              {pools.map((pool) => (
                <SelectItem key={pool.id} value={pool.id}>
                  {pool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Assign Driver
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Pool</TableHead>
              <TableHead>Added</TableHead>
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
            ) : filteredDriverPools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8">
                  <p className="text-muted-foreground">No driver assignments found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredDriverPools.map((dp) => (
                <TableRow key={dp.id}>
                  <TableCell className="font-medium">{dp.driver.profile.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatPhone(dp.driver.profile.phone)}</TableCell>
                  <TableCell>
                    {dp.driver.vehicle ? (
                      <div className="flex items-center gap-1">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span>{dp.driver.vehicle.vehicle_number}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        dp.pool.access_type === "open"
                          ? "border-green-500/50 text-green-500"
                          : "border-yellow-500/50 text-yellow-500"
                      }
                    >
                      {dp.pool.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(dp.created_at).toLocaleDateString()}
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
                          <DropdownMenuItem onClick={() => openEditDialog(dp)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Change Pool
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAssignMoreDialog(dp.driver_id)}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Assign More Pools
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => removeMutation.mutate(dp.id)}
                            disabled={removeMutation.isPending}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Pool
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

      {/* Add Driver to Pool Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Driver to Pools</DialogTitle>
            <DialogDescription>Select a driver and one or more pools</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <ComboboxInput
                value={selectedDriver}
                onChange={setSelectedDriver}
                options={(availableDrivers || []).map((driver) => ({
                  value: driver.id,
                  label: `${driver.profile.full_name}${driver.vehicle ? ` (${driver.vehicle.vehicle_number})` : ""}`,
                }))}
                placeholder="Search driver..."
                allowCustom={false}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pools</label>
              {(() => {
                const driverExistingPools = selectedDriver
                  ? (driverPools || [])
                      .filter((dp) => dp.driver_id === selectedDriver)
                      .map((dp) => dp.pool_id)
                  : []
                return (
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {pools
                      .filter((p) => p.is_active)
                      .map((pool) => {
                        const alreadyAssigned = driverExistingPools.includes(pool.id)
                        return (
                          <div
                            key={pool.id}
                            className={`flex items-center gap-3 p-2 rounded ${
                              alreadyAssigned
                                ? "bg-green-500/10 cursor-default"
                                : "hover:bg-muted/50 cursor-pointer"
                            }`}
                            onClick={() => {
                              if (alreadyAssigned) return
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
                              checked={alreadyAssigned || selectedPools.has(pool.id)}
                              disabled={alreadyAssigned}
                              onCheckedChange={(checked) => {
                                if (alreadyAssigned) return
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
                              {pool.access_type === "open" ? (
                                <Globe className={`h-4 w-4 ${alreadyAssigned ? "text-green-500" : "text-green-500"}`} />
                              ) : (
                                <Lock className={`h-4 w-4 ${alreadyAssigned ? "text-green-500" : "text-yellow-500"}`} />
                              )}
                              <span className="font-medium">{pool.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {pool.access_type}
                              </Badge>
                            </div>
                            {alreadyAssigned && (
                              <span className="text-xs text-green-500 font-medium">Already assigned</span>
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
                addMutation.mutate({ driverId: selectedDriver, poolIds: Array.from(selectedPools) })
              }
              disabled={!selectedDriver || selectedPools.size === 0 || addMutation.isPending}
            >
              {addMutation.isPending ? "Assigning..." : `Assign to ${selectedPools.size} Pool${selectedPools.size > 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pool Assignment Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Pool Assignment</DialogTitle>
            <DialogDescription>
              Change which pool {editingAssignment?.driver.profile.full_name} is assigned to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <div className="p-3 border rounded-lg bg-muted/50">
                <p className="font-medium">{editingAssignment?.driver.profile.full_name}</p>
                {editingAssignment?.driver.vehicle && (
                  <p className="text-sm text-muted-foreground">{editingAssignment.driver.vehicle.vehicle_number}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Pool</label>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                {editingAssignment?.pool.access_type === "open" ? (
                  <Globe className="h-4 w-4 text-green-500" />
                ) : (
                  <Lock className="h-4 w-4 text-yellow-500" />
                )}
                <span>{editingAssignment?.pool.name}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Pool</label>
              <Select value={editPoolId} onValueChange={setEditPoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pool" />
                </SelectTrigger>
                <SelectContent>
                  {pools
                    .filter((p) => p.is_active)
                    .map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        <div className="flex items-center gap-2">
                          {pool.access_type === "open" ? (
                            <Globe className="h-4 w-4 text-green-500" />
                          ) : (
                            <Lock className="h-4 w-4 text-yellow-500" />
                          )}
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
                editingAssignment && editMutation.mutate({ id: editingAssignment.id, newPoolId: editPoolId })
              }
              disabled={!editPoolId || editPoolId === editingAssignment?.pool_id || editMutation.isPending}
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
