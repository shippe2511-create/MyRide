"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { DriversTable } from "./drivers-table"
import { DocumentsTable } from "./documents-table"
import { ShiftsTable } from "./shifts-table"
import { ActivityTable } from "./activity-table"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, UserCheck, Clock, FileText, Calendar, Activity } from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { useSearchParams } from "next/navigation"
import { PermissionGate } from "@/components/permission-gate"

const supabase = createClient()

function useDriversData(search?: string, status?: string, page: number = 1) {
  return useQuery({
    queryKey: ["drivers-page", search, status, page],
    queryFn: async () => {
      const pageSize = 15
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1

      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("role", "driver")
        .order("created_at", { ascending: false })

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
      }

      if (status) {
        query = query.eq("status", status)
      }

      query = query.range(start, end)

      const [driversRes, driverRecordsRes, totalRes, activeRes, pendingRes] = await Promise.all([
        query,
        supabase.from("drivers").select("id, profile_id, vehicle_id, vehicle:vehicle_types(id, display_name, plate_no)"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "approved"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "driver").eq("status", "pending"),
      ])

      const driverRecords = driverRecordsRes.data || []
      const driversWithVehicles = (driversRes.data || []).map(profile => {
        const driverRecord = driverRecords.find(d => d.profile_id === profile.id)
        return {
          ...profile,
          driver_record: driverRecord ? {
            id: driverRecord.id,
            vehicle_id: driverRecord.vehicle_id,
            vehicle: driverRecord.vehicle
          } : null
        }
      })

      return {
        drivers: driversWithVehicles,
        totalCount: driversRes.count || 0,
        pageSize,
        stats: {
          total: totalRes.count || 0,
          active: activeRes.count || 0,
          pending: pendingRes.count || 0,
        }
      }
    },
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  })
}

export default function DriversPage() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const search = searchParams.get("search") || undefined
  const status = searchParams.get("status") || undefined
  const page = parseInt(searchParams.get("page") || "1")

  const { data, isLoading } = useDriversData(search, status, page)

  // Realtime subscription for profile updates
  useEffect(() => {
    const channel = supabase
      .channel('drivers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ["drivers-page"] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        queryClient.invalidateQueries({ queryKey: ["drivers-page"] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Only show skeleton on initial load
  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  if (!data) return null

  const { drivers, totalCount, pageSize, stats } = data

  return (
    <PermissionGate permission="drivers:view">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Drivers</h1>
          <p className="text-sm text-muted-foreground">Manage driver accounts and documents</p>
        </div>

        <div className="grid gap-3 grid-cols-3">
          <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
                <Users className="h-4 w-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight">{stats.total}</p>
                <p className="text-xs text-muted-foreground truncate">Total Drivers</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
                <UserCheck className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-green-500">{stats.active}</p>
                <p className="text-xs text-muted-foreground truncate">Active</p>
              </div>
              <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
                {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
              </span>
            </div>
          </Card>
          <Card className={`p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 ${stats.pending > 0 ? 'ring-2 ring-yellow-500/50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
                <Clock className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-yellow-500">{stats.pending}</p>
                <p className="text-xs text-muted-foreground truncate">Pending</p>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="drivers">
          <TabsList>
            <TabsTrigger value="drivers" className="gap-2">
              <Users className="h-4 w-4" />
              Drivers
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="shifts" className="gap-2">
              <Calendar className="h-4 w-4" />
              Shifts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drivers" className="mt-4">
            <DriversTable
              drivers={drivers}
              totalCount={totalCount}
              currentPage={page}
              pageSize={pageSize}
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityTable />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTable />
          </TabsContent>

          <TabsContent value="shifts" className="mt-4">
            <ShiftsTable />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  )
}
