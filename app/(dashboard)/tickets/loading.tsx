import { PageHeaderSkeleton, TableSkeleton, Skeleton } from '@/components/ui/Skeleton'

export default function TicketsLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="p-6 sm:p-8 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <Skeleton width={280} height={32} />
          <div className="ml-auto">
            <Skeleton width={224} height={32} />
          </div>
        </div>
        <TableSkeleton rows={8} />
      </div>
    </div>
  )
}
