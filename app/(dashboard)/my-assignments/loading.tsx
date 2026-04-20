import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="p-6 sm:p-8 space-y-4 max-w-3xl mx-auto">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}
