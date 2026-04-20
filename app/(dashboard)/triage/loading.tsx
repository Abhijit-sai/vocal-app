import { PageHeaderSkeleton, TableSkeleton, Skeleton } from '@/components/ui/Skeleton'

export default function TriageLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="p-6 sm:p-8 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton width={140} height={16} className="mb-2" />
        <TableSkeleton rows={6} />
      </div>
    </div>
  )
}
