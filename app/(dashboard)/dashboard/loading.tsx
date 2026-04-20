import { PageHeaderSkeleton, KpiRowSkeleton, CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="p-6 sm:p-8 space-y-8 max-w-[1400px] mx-auto">
        <KpiRowSkeleton count={3} />
        <CardSkeleton lines={4} />
        <TableSkeleton rows={4} />
      </div>
    </div>
  )
}
