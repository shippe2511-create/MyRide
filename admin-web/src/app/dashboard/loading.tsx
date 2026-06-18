import { SkeletonCard, SkeletonChart, SkeletonTable } from "@/components/ui/skeleton-card"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="w-40 h-9 bg-muted rounded animate-pulse" />
        <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkeletonTable rows={5} />
        </div>
        <SkeletonCard />
      </div>
    </div>
  )
}
