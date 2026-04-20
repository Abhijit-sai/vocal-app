import { PageHeaderSkeleton, CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function AmplifyLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="p-6 sm:p-8 space-y-6 max-w-[1400px] mx-auto">
        <CardSkeleton lines={3} />
        <TableSkeleton rows={5} />
      </div>
    </div>
  )
}
