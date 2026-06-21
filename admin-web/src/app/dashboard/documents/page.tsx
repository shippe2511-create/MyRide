import { createClient } from "@/lib/supabase/server"
import { DocumentsTable } from "./documents-table"
import { Card } from "@/components/ui/card"
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; type?: string; page?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("documents")
    .select(`
      *,
      driver:drivers!inner(
        id,
        profile:profiles(
          full_name,
          avatar_url,
          phone,
          employee_id
        )
      )
    `, { count: "exact" })
    .order("uploaded_at", { ascending: false })

  if (params.search) {
    query = query.or(`document_type.ilike.%${params.search}%`)
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status)
  }

  if (params.type && params.type !== "all") {
    query = query.eq("document_type", params.type)
  }

  const page = parseInt(params.page || "1")
  const pageSize = 10
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  query = query.range(start, end)

  const [{ data: documents, count }, totalRes, pendingRes, verifiedRes, rejectedRes] = await Promise.all([
    query,
    supabase.from("documents").select("*", { count: "exact", head: true }),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "verified"),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ])

  // Count expiring soon (within 30 days)
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const { count: expiringCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .lt("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
    .gt("expiry_date", new Date().toISOString().split("T")[0])

  const stats = {
    total: totalRes.count || 0,
    pending: pendingRes.count || 0,
    verified: verifiedRes.count || 0,
    rejected: rejectedRes.count || 0,
    expiring: expiringCount || 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Documents
        </h1>
        <p className="text-sm text-muted-foreground">
          Review and verify uploaded driver documents
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.total}</p>
              <p className="text-xs text-muted-foreground truncate">Total</p>
            </div>
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
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.verified}</p>
              <p className="text-xs text-muted-foreground truncate">Approved</p>
            </div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">
              {stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}%
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-red-500">{stats.rejected}</p>
              <p className="text-xs text-muted-foreground truncate">Rejected</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 ${stats.expiring > 0 ? 'ring-2 ring-orange-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20 shrink-0">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-orange-500">{stats.expiring}</p>
              <p className="text-xs text-muted-foreground truncate">Expiring</p>
            </div>
          </div>
        </Card>
      </div>

      <DocumentsTable
        documents={documents || []}
        totalCount={count || 0}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  )
}
