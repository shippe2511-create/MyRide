"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { CustomersTable } from "./customers-table"
import { Card } from "@/components/ui/card"
import { Users, UserCheck, Clock, UserX } from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { useSearchParams } from "next/navigation"
import { PermissionGate } from "@/components/permission-gate"

const supabase = createClient()

function useCustomersData(search?: string, status?: string, page: number = 1) {
  return useQuery({
    queryKey: ["customers-page", search, status, page],
    queryFn: async () => {
      const pageSize = 10
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1

      let query = supabase
        .from("profiles")
        .select("*, org_department:departments(id, name)", { count: "exact" })
        .eq("role", "customer")
        .order("full_name", { ascending: true })

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
      }

      if (status) {
        query = query.eq("status", status)
      }

      query = query.range(start, end)

      const [{ data: customers, count }, totalRes, approvedRes, pendingRes, suspendedRes] = await Promise.all([
        query,
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "approved"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "suspended"),
      ])

      return {
        customers: customers || [],
        totalCount: count || 0,
        pageSize,
        stats: {
          total: totalRes.count || 0,
          approved: approvedRes.count || 0,
          pending: pendingRes.count || 0,
          suspended: suspendedRes.count || 0,
        }
      }
    },
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  })
}

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const search = searchParams.get("search") || undefined
  const status = searchParams.get("status") || undefined
  const page = parseInt(searchParams.get("page") || "1")

  const { data, isLoading, isFetching } = useCustomersData(search, status, page)

  // Realtime subscription for profile updates
  useEffect(() => {
    const channel = supabase
      .channel('customers_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        // Invalidate all queries starting with "customers-page" regardless of filters
        queryClient.invalidateQueries({ queryKey: ["customers-page"], exact: false })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Only show skeleton on initial load, not on page changes
  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-32 h-8 bg-muted rounded animate-pulse" />
          <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  if (!data) return null

  const { customers, totalCount, pageSize, stats } = data

  return (
    <PermissionGate permission="customers:view">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage customer profiles, ride history, and account status
          </p>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
                <Users className="h-4 w-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight">{stats.total}</p>
                <p className="text-xs text-muted-foreground truncate">Total</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
                <UserCheck className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-green-500">{stats.approved}</p>
                <p className="text-xs text-muted-foreground truncate">Approved</p>
              </div>
              <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
                {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
              </span>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border border-yellow-500/20">
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
          <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
                <UserX className="h-4 w-4 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight text-red-500">{stats.suspended}</p>
                <p className="text-xs text-muted-foreground truncate">Suspended</p>
              </div>
            </div>
          </Card>
        </div>

        <CustomersTable
          customers={customers}
          totalCount={totalCount}
          currentPage={page}
          pageSize={pageSize}
        />
      </div>
    </PermissionGate>
  )
}
