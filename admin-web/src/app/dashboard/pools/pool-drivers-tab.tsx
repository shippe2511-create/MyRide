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
import { Plus, Trash2, Car, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

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
  const [selectedDriver, setSelectedDriver] = useState<string>("")
  const [selectedPool, setSelectedPool] = useState<string>("")

  const { data: driverPools, isLoading } = useDriverPoolsData(poolFilter)
  const { data: availableDrivers } = useAvailableDrivers()

  const addMutation = useMutation({
    mutationFn: async ({ driverId, poolId }: { driverId: string; poolId: string }) => {
      const { error } = await supabase.from("driver_pools").insert({
        driver_id: driverId,
        pool_id: poolId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-pools"] })
      queryClient.invalidateQueries({ queryKey: ["pools"] })
      setIsAddOpen(false)
      setSelectedDriver("")
      setSelectedPool("")
      toast.success("Driver added to pool")
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Driver is already in this pool")
      } else {
        toast.error(error.message || "Failed to add driver to pool")
      }
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
                  <TableCell className="text-muted-foreground">{dp.driver.profile.phone}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(dp.id)}
                        disabled={removeMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <DialogTitle>Assign Driver to Pool</DialogTitle>
            <DialogDescription>Select a driver and pool to create an assignment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a driver" />
                </SelectTrigger>
                <SelectContent>
                  {(availableDrivers || []).map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.profile.full_name}
                      {driver.vehicle && ` (${driver.vehicle.vehicle_number})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pool</label>
              <Select value={selectedPool} onValueChange={setSelectedPool}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pool" />
                </SelectTrigger>
                <SelectContent>
                  {pools
                    .filter((p) => p.is_active)
                    .map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.name} ({pool.access_type})
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
                addMutation.mutate({ driverId: selectedDriver, poolId: selectedPool })
              }
              disabled={!selectedDriver || !selectedPool || addMutation.isPending}
            >
              {addMutation.isPending ? "Adding..." : "Add to Pool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
