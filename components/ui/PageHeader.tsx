interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  /** Optional breadcrumbs element rendered above the title */
  breadcrumbs?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        borderBottom: '1px solid var(--canvas-border)',
        background: 'var(--canvas-surface)',
        backdropFilter: 'saturate(180%) blur(8px)',
      }}
    >
      <div className="px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 max-w-[1400px] mx-auto">
        <div className="min-w-0">
          {breadcrumbs && (
            <div
              className="mb-1.5 text-xs"
              style={{ color: 'var(--canvas-muted)' }}
            >
              {breadcrumbs}
            </div>
          )}
          <h1
            className="text-xl font-semibold tracking-tight leading-tight"
            style={{ color: 'var(--canvas-text)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--canvas-muted)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}
