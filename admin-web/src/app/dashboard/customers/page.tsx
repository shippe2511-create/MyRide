import { createClient } from "@/lib/supabase/server"
import { CustomersTable } from "./customers-table"
import { Breadcrumbs } from "@/components/breadcrumbs"

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

  const { data: customers, count } = await query

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">
          Manage customer profiles, ride history, and account status
        </p>
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
