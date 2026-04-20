import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function WorkersLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="p-6 sm:p-8 space-y-6 max-w-[1400px] mx-auto">
        <TableSkeleton rows={8} />
      </div>
    </div>
  )
}
