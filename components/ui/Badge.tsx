'use client'

import type { TicketStage, Severity } from '@/types/database'

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  size?: 'xs' | 'sm' | 'md'
  dot?: boolean
}

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; dot: string }> = {
  neutral: { bg: 'var(--slate-100)',  text: 'var(--slate-700)',  dot: 'var(--slate-500)'  },
  primary: { bg: 'var(--primary-soft-bg)', text: 'var(--primary-soft-text)', dot: 'var(--primary)' },
  success: { bg: 'var(--green-50)',   text: 'var(--green-700)',  dot: 'var(--green-500)'  },
  warning: { bg: 'var(--amber-50)',   text: 'var(--amber-700)',  dot: 'var(--amber-500)'  },
  danger:  { bg: 'var(--red-50)',     text: 'var(--red-700)',    dot: 'var(--red-500)'    },
  info:    { bg: '#eff6ff',           text: '#1d4ed8',           dot: 'var(--brand-500)'  },
}

export function Badge({ children, variant = 'neutral', size = 'sm', dot = false }: BadgeProps) {
  const sizeClass =
    size === 'xs' ? 'text-[10px] px-1.5 py-0.5 leading-none' :
    size === 'sm' ? 'text-xs px-2 py-0.5' :
                    'text-sm px-2.5 py-1'
  const s = VARIANT_STYLES[variant]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${sizeClass}`}
      style={{ background: s.bg, color: s.text }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />}
      {children}
    </span>
  )
}

export function StageBadge({ stage, showDot = true }: { stage: TicketStage; showDot?: boolean }) {
  const map: Record<TicketStage, { label: string; variant: Variant }> = {
    to_do:       { label: 'To Do',       variant: 'neutral' },
    in_progress: { label: 'In Progress', variant: 'info' },
    on_hold:     { label: 'On Hold',     variant: 'warning' },
    closed:      { label: 'Closed',      variant: 'success' },
  }
  const { label, variant } = map[stage] ?? { label: stage, variant: 'neutral' }
  return <Badge variant={variant} dot={showDot}>{label}</Badge>
}

export function SeverityBadge({ severity }: { severity: Severity | null }) {
  if (!severity) return <Badge variant="neutral">—</Badge>
  const map: Record<Severity, { label: string; variant: Variant }> = {
    critical: { label: 'Critical', variant: 'danger'  },
    high:     { label: 'High',     variant: 'warning' },
    medium:   { label: 'Medium',   variant: 'warning' },
    low:      { label: 'Low',      variant: 'neutral' },
  }
  const { label, variant } = map[severity]
  return <Badge variant={variant} dot>{label}</Badge>
}
