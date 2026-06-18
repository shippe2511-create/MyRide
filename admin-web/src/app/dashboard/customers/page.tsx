import { createClient } from "@/lib/supabase/server"
import { CustomersTable } from "./customers-table"
import { Card } from "@/components/ui/card"
import { Users, UserCheck, Clock, UserX } from "lucide-react"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .in("role", ["customer", "super-admin", "admin", "operator", "support", "viewer"])
    .order("created_at", { ascending: false })

  if (params.search) {
    query = query.or(`full_name.ilike.%${params.search}%,phone.ilike.%${params.search}%,email.ilike.%${params.search}%`)
  }

  if (params.status) {
    query = query.eq("status", params.status)
  }

  const page = parseInt(params.page || "1")
  const pageSize = 10
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  query = query.range(start, end)

  const [{ data: customers, count }, totalRes, approvedRes, pendingRes, suspendedRes] = await Promise.all([
    query,
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "approved"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "pending"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer").eq("status", "suspended"),
  ])

  const stats = {
    total: totalRes.count || 0,
    approved: approvedRes.count || 0,
    pending: pendingRes.count || 0,
    suspended: suspendedRes.count || 0,
  }

  return (
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
        customers={customers || []}
        totalCount={count || 0}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  )
}
