"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { DriversTable } from "./drivers-table"
import { DocumentsTable } from "./documents-table"
import { ShiftsTable } from "./shifts-table"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, UserCheck, Clock, FileText, Loader2, Calendar } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"

export default function DriversPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [drivers, setDrivers] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage] = useState(1)
  const pageSize = 20

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pending: 0,
  })

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel('drivers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadData(false))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const [driversRes, driverRecordsRes, totalRes, activeRes, pendingRes] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact" }).eq("role", "driver").order("created_at", { ascending: false }).range(0, pageSize - 1),
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

    setDrivers(driversWithVehicles)
    setTotalCount(driversRes.count || 0)
    setStats({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      pending: pendingRes.count || 0,
    })

    if (showLoading) setLoading(false)
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
      <Breadcrumbs />
      <div>
        <h1 className="text-2xl font-bold">Drivers</h1>
        <p className="text-sm text-muted-foreground">Manage driver accounts and documents</p>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Drivers</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
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
            currentPage={currentPage}
            pageSize={pageSize}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTable />
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <ShiftsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
