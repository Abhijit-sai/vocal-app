import { PageHeaderSkeleton, CardSkeleton, Skeleton } from '@/components/ui/Skeleton'

export default function DirectoryLoading() {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      </div>
    </div>
  )
}
