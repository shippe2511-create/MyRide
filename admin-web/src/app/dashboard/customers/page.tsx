import { createClient } from "@/lib/supabase/server"
import { CustomersTable } from "./customers-table"
import { Breadcrumbs } from "@/components/breadcrumbs"
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
      <Breadcrumbs />
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">
          Manage customer profiles, ride history, and account status
        </p>
      </div>

      <div className="grid gap-3 grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 ${stats.pending > 0 ? "border-yellow-500" : ""}`}>
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
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <UserX className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-500">{stats.suspended}</p>
              <p className="text-xs text-muted-foreground">Suspended</p>
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
