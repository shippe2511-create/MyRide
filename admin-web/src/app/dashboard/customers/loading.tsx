import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="w-32 h-8 bg-muted rounded animate-pulse" />
        <div className="w-64 h-4 bg-muted rounded animate-pulse mt-2" />
      </div>
      <div className="grid gap-4 grid-cols-4">
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={8} />
    </div>
  )
}
