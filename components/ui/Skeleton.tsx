/**
 * Loading skeleton primitives.
 *
 * These render during Next.js Suspense boundaries (loading.tsx files) to
 * reserve layout space and show a shimmer while the server component
 * resolves its data.
 */

export function Skeleton({
  className = '',
  width,
  height,
}: {
  className?: string
  width?: string | number
  height?: string | number
}) {
  return (
    <span
      aria-hidden
      className={`skeleton block ${className}`}
      style={{ width, height }}
    />
  )
}

/** A header block with title + subtitle bars. */
export function PageHeaderSkeleton() {
  return (
    <div
      className="px-6 sm:px-8 py-6"
      style={{ borderBottom: '1px solid var(--canvas-border)' }}
    >
      <Skeleton width={180} height={24} className="mb-2" />
      <Skeleton width={240} height={14} />
    </div>
  )
}

/** A grid of metric cards (KPI row). */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <Skeleton width={80} height={12} className="mb-2" />
          <Skeleton width={48} height={28} />
        </div>
      ))}
    </div>
  )
}

/** A ticket-table shaped skeleton. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-2.5 flex gap-4"
        style={{ borderBottom: '1px solid var(--canvas-border)', background: 'var(--canvas-surface-alt)' }}
      >
        <Skeleton width={60} height={10} />
        <Skeleton width={60} height={10} />
        <Skeleton width={60} height={10} />
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <Skeleton width={80} height={10} className="mb-1.5" />
              <Skeleton width="60%" height={14} />
            </div>
            <Skeleton width={72} height={20} />
            <Skeleton width={56} height={20} />
            <Skeleton width={96} height={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A card with several text-line skeletons. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5 space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  )
}
