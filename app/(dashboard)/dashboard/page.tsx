import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { StageBadge, SeverityBadge, Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { TicketStage } from '@/types/database'

async function getDashboardStats(orgId: string, supabase: ReturnType<typeof createSupabaseServiceClient>) {
  // --- time windows (all in UTC ISO strings) ----------------------------------
  const now = new Date()
  const thirtyDaysAgoISO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // Week boundaries: treat "this week" as the rolling 7-day window ending now,
  // and "last week" as the 7 days before that. Simpler + more intuitive than
  // Sunday/Monday-based weeks across time zones.
  const sevenDaysAgoISO     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgoISO  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [
    totalRes, stageRes, criticalRes, triageRes, slaRes, recentRes,
    firstContactRes, closedThisWeekRes, closedLastWeekRes,
    activeWorkerTicketsRes, totalWorkersRes, pendingOffersRes,
  ] = await Promise.all([
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('tickets').select('stage').eq('organization_id', orgId),
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('critical_flag', true).neq('stage', 'closed'),
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('needs_triage', true),
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('sub_status', 'sla_breach_escalation_queue'),
    supabase.from('tickets')
      .select('id, ticket_number, title, original_issue_text, stage, severity, critical_flag, created_at, sub_status, source_channel')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(6),
    // Avg time-to-first-contact: tickets accepted in the last 30 days.
    supabase.from('tickets').select('created_at, accepted_at')
      .eq('organization_id', orgId)
      .not('accepted_at', 'is', null)
      .gte('created_at', thirtyDaysAgoISO),
    // Closed in the last 7 days.
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('stage', 'closed')
      .gte('updated_at', sevenDaysAgoISO),
    // Closed in the 7 days before that.
    supabase.from('tickets').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('stage', 'closed')
      .gte('updated_at', fourteenDaysAgoISO)
      .lt('updated_at', sevenDaysAgoISO),
    // Active workers = distinct owner_user_id on non-closed tickets.
    supabase.from('tickets').select('owner_user_id')
      .eq('organization_id', orgId)
      .neq('stage', 'closed')
      .not('owner_user_id', 'is', null),
    // Total active ground workers in org.
    supabase.from('users').select('id, roles!inner(name)', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('active', true)
      .eq('roles.name', 'ground_worker'),
    // Pending offers (assignments awaiting worker response).
    supabase.from('ticket_assignments').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'offered')
      .eq('is_current', true),
  ])

  const stageCounts: Record<TicketStage, number> = {
    to_do: 0, in_progress: 0, on_hold: 0, closed: 0,
  }
  for (const row of stageRes.data ?? []) {
    const s = row.stage as TicketStage
    if (s in stageCounts) stageCounts[s]++
  }

  // Avg first-contact latency in minutes (only over rows we could compute).
  let firstContactMinutes: number | null = null
  const fcRows = firstContactRes.data ?? []
  if (fcRows.length > 0) {
    let sum = 0
    let n = 0
    for (const r of fcRows) {
      if (!r.created_at || !r.accepted_at) continue
      const diffMs = new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()
      if (diffMs >= 0) { sum += diffMs; n++ }
    }
    firstContactMinutes = n > 0 ? Math.round(sum / n / 60000) : null
  }

  // Distinct active workers (have at least one non-closed ticket assigned).
  const activeWorkerIds = new Set<string>()
  for (const row of activeWorkerTicketsRes.data ?? []) {
    if (row.owner_user_id) activeWorkerIds.add(row.owner_user_id as string)
  }

  return {
    total: totalRes.count ?? 0,
    stageCounts,
    critical: criticalRes.count ?? 0,
    triage: triageRes.count ?? 0,
    slaBreach: slaRes.count ?? 0,
    recent: recentRes.data ?? [],
    firstContactMinutes,
    closedThisWeek: closedThisWeekRes.count ?? 0,
    closedLastWeek: closedLastWeekRes.count ?? 0,
    activeWorkers:  activeWorkerIds.size,
    totalWorkers:   totalWorkersRes.count ?? 0,
    pendingOffers:  pendingOffersRes.count ?? 0,
  }
}

// Format a minute count as "2h 15m", "45m", or "—" when null.
function formatMinutes(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Percentage delta vs prior period. Returns { label, tone } or null if no prior data.
function weekOverWeek(current: number, prior: number): { label: string; tone: 'up' | 'down' | 'flat' } {
  if (prior === 0 && current === 0) return { label: 'no change', tone: 'flat' }
  if (prior === 0)                  return { label: 'new',       tone: 'up'   }
  const pct = Math.round(((current - prior) / prior) * 100)
  if (pct === 0)  return { label: 'no change',      tone: 'flat' }
  if (pct > 0)    return { label: `▲ ${pct}% WoW`,  tone: 'up'   }
  return { label: `▼ ${Math.abs(pct)}% WoW`, tone: 'down' }
}

export default async function DashboardPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  // Dashboard is the org-wide health view — only useful to roles with
  // org-wide visibility. Scope everyone else to their own workbench so they
  // don't see stats they can't act on (and don't accidentally leak cross-
  // territory counts to a district leader).
  const roleName = (user as any).roles?.name
  if (roleName === 'ground_worker') redirect('/my-assignments')
  if (roleName === 'district_leader') redirect('/tickets')

  const supabase = createSupabaseServiceClient()
  const stats = await getDashboardStats(user.organization_id, supabase)
  const userName = (user as any).full_name ?? 'there'

  const now = new Date()
  const greeting =
    now.getHours() < 12 ? 'Good morning' :
    now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  const actionRequired = [
    {
      label: 'Awaiting Triage',
      value: stats.triage,
      variant: 'warning' as const,
      href: '/triage',
      hint: 'Needs category, severity, or location review',
    },
    {
      label: 'Critical Open',
      value: stats.critical,
      variant: 'danger' as const,
      href: '/tickets?severity=critical',
      hint: 'High-severity unresolved issues',
    },
    {
      label: 'SLA Breaches',
      value: stats.slaBreach,
      variant: 'danger' as const,
      href: '/tickets?stage=on_hold',
      hint: 'Escalation queue items',
    },
  ]

  const overview = [
    { label: 'Total',       value: stats.total,                   dot: 'var(--slate-400)' },
    { label: 'In Progress', value: stats.stageCounts.in_progress, dot: 'var(--stage-in-progress-dot)' },
    { label: 'On Hold',     value: stats.stageCounts.on_hold,     dot: 'var(--stage-on-hold-dot)' },
    { label: 'Closed',      value: stats.stageCounts.closed,      dot: 'var(--stage-closed-dot)' },
  ]

  const totalNonClosed = stats.total - stats.stageCounts.closed

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${userName.split(' ')[0]}`}
        subtitle={now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      />

      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto">

        {/* ======================= ACTION REQUIRED ======================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              Action Required
            </h2>
            <Link href="/triage" className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              Open triage →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {actionRequired.map(card => {
              const bg =
                card.variant === 'danger'  ? 'var(--alert-danger-bg)' :
                card.variant === 'warning' ? 'var(--alert-warning-bg)' : 'var(--canvas-surface)'
              const borderColor =
                card.variant === 'danger'  ? 'var(--alert-danger-border)' :
                card.variant === 'warning' ? 'var(--alert-warning-border)' : 'var(--canvas-border)'
              const textColor =
                card.variant === 'danger'  ? 'var(--alert-danger-text)' :
                card.variant === 'warning' ? 'var(--alert-warning-text)' : 'var(--canvas-text)'
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="card card-hover relative p-4 block group"
                  style={{ background: bg, borderLeft: `3px solid ${borderColor}` }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: textColor, opacity: 0.85 }}>
                      {card.label}
                    </span>
                    <span
                      className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: textColor }}
                    >
                      View →
                    </span>
                  </div>
                  <div className="text-3xl font-bold mt-1 tabular-nums" style={{ color: textColor }}>
                    {card.value}
                  </div>
                  <div className="text-xs mt-1 leading-tight" style={{ color: textColor, opacity: 0.7 }}>
                    {card.hint}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        {/* ======================= PIPELINE OVERVIEW ======================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              Pipeline
            </h2>
            <Link href="/tickets" className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              View all tickets →
            </Link>
          </div>
          <div className="card p-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {overview.map(o => (
                <div key={o.label} className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: o.dot }} />
                  <div>
                    <div className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--canvas-text)' }}>
                      {o.value}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--canvas-muted)' }}>
                      {o.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stacked progress bar */}
            <div className="space-y-2">
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: 'var(--canvas-muted)' }}
              >
                <span>Stage distribution</span>
                <span className="tabular-nums">
                  {totalNonClosed} active · {stats.stageCounts.closed} closed
                </span>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--slate-100)' }}>
                {([
                  { stage: 'to_do'       as TicketStage, color: 'var(--stage-to-do-dot)' },
                  { stage: 'in_progress' as TicketStage, color: 'var(--stage-in-progress-dot)' },
                  { stage: 'on_hold'     as TicketStage, color: 'var(--stage-on-hold-dot)' },
                  { stage: 'closed'      as TicketStage, color: 'var(--stage-closed-dot)' },
                ]).map(({ stage, color }) => {
                  const count = stats.stageCounts[stage]
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
                  if (pct === 0) return null
                  return (
                    <div
                      key={stage}
                      title={`${stage.replace('_', ' ')}: ${count}`}
                      className="h-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  )
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs" style={{ color: 'var(--canvas-muted)' }}>
                {([
                  { stage: 'to_do' as TicketStage,       label: 'To Do',       color: 'var(--stage-to-do-dot)' },
                  { stage: 'in_progress' as TicketStage, label: 'In Progress', color: 'var(--stage-in-progress-dot)' },
                  { stage: 'on_hold' as TicketStage,     label: 'On Hold',     color: 'var(--stage-on-hold-dot)' },
                  { stage: 'closed' as TicketStage,      label: 'Closed',      color: 'var(--stage-closed-dot)' },
                ]).map(({ stage, label, color }) => (
                  <Link key={stage} href={`/tickets?stage=${stage}`} className="flex items-center gap-1.5 hover:underline">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span>{label}</span>
                    <span className="tabular-nums font-medium" style={{ color: 'var(--canvas-text)' }}>
                      {stats.stageCounts[stage]}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ======================= OPERATIONAL HEALTH ======================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              Operational Health
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
              Last 30 days · rolling windows
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Avg time to first contact */}
            <div className="card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--canvas-muted)' }}>
                Avg 1st contact
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--canvas-text)' }}>
                {formatMinutes(stats.firstContactMinutes)}
              </div>
              <div className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--canvas-muted)' }}>
                From file → worker accept, 30-day avg
              </div>
            </div>

            {/* Closed this week + WoW delta */}
            {(() => {
              const wow = weekOverWeek(stats.closedThisWeek, stats.closedLastWeek)
              const toneColor =
                wow.tone === 'up'   ? 'var(--alert-success-text, #16a34a)' :
                wow.tone === 'down' ? 'var(--alert-danger-text)' :
                                      'var(--canvas-muted)'
              return (
                <div className="card p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--canvas-muted)' }}>
                    Closed this week
                  </div>
                  <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--canvas-text)' }}>
                    {stats.closedThisWeek}
                  </div>
                  <div className="text-[11px] mt-1 leading-tight tabular-nums" style={{ color: toneColor }}>
                    {wow.label} · prev {stats.closedLastWeek}
                  </div>
                </div>
              )
            })()}

            {/* Active workers */}
            <div className="card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--canvas-muted)' }}>
                Active workers
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--canvas-text)' }}>
                {stats.activeWorkers}
                <span className="text-sm font-medium ml-1" style={{ color: 'var(--canvas-muted)' }}>
                  / {stats.totalWorkers}
                </span>
              </div>
              <div className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--canvas-muted)' }}>
                Workers with at least one open ticket
              </div>
            </div>

            {/* Pending offers */}
            <Link
              href="/tickets?stage=in_progress"
              className="card card-hover p-4 block group"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--canvas-muted)' }}>
                  Pending offers
                </span>
                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--canvas-muted)' }}>
                  View →
                </span>
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--canvas-text)' }}>
                {stats.pendingOffers}
              </div>
              <div className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--canvas-muted)' }}>
                Awaiting worker accept / reject
              </div>
            </Link>
          </div>
        </section>

        {/* ======================= RECENT ACTIVITY ======================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              Recent Tickets
            </h2>
            <Link href="/tickets" className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              View all →
            </Link>
          </div>
          <div className="card overflow-hidden">
            {stats.recent.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="text-4xl mb-2">📭</div>
                <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
                  No tickets yet
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
                  Issues reported via Telegram will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
                {stats.recent.map((t: any) => (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
                            {t.ticket_number}
                          </code>
                          {t.critical_flag && <Badge variant="danger" size="xs">Critical</Badge>}
                          <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>·</span>
                          <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
                            {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--canvas-text)' }}>
                          {t.title ?? t.original_issue_text?.substring(0, 80) ?? 'Untitled ticket'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <SeverityBadge severity={t.severity} />
                        <StageBadge stage={t.stage} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
