import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'

export const dynamic = 'force-dynamic'

interface SearchParams {
  event?: string
  actor?: 'user' | 'system' | 'webhook' | 'all'
  page?: string
}

const ACTOR_FILTERS: { label: string; value: 'all' | 'user' | 'system' | 'webhook' }[] = [
  { label: 'All',     value: 'all'     },
  { label: 'User',    value: 'user'    },
  { label: 'System',  value: 'system'  },
  { label: 'Webhook', value: 'webhook' },
]

const ALLOWED_ROLES = ['super_admin', 'central_support']

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) redirect('/dashboard')

  const supabase = createSupabaseServiceClient()

  const page = parseInt(params.page ?? '1', 10)
  const limit = 50
  const offset = (page - 1) * limit

  let query = supabase
    .from('audit_logs')
    .select(
      `
      id, event_type, entity_type, entity_id, actor_type, created_at,
      source_ip, metadata_json,
      users!audit_logs_actor_user_id_fkey(full_name)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', user.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.actor && params.actor !== 'all') {
    query = query.eq('actor_type', params.actor)
  }

  if (params.event) {
    const safe = params.event.replace(/[,()."'\\%_]/g, '').slice(0, 80)
    if (safe) query = query.ilike('event_type', `%${safe}%`)
  }

  const { data: events, count } = await query

  const buildHref = (changes: Partial<SearchParams>) => {
    const qp = new URLSearchParams()
    const merged = { ...params, ...changes, page: undefined } as Record<string, string | undefined>
    Object.entries(merged).forEach(([k, v]) => { if (v) qp.set(k, v) })
    const s = qp.toString()
    return s ? `/audit?${s}` : '/audit'
  }

  const actorVariant = (t: string) => {
    if (t === 'user')    return 'primary' as const
    if (t === 'webhook') return 'warning' as const
    return 'neutral' as const
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle={`${count ?? 0} event${(count ?? 0) !== 1 ? 's' : ''}`}
      />

      <div className="p-6 sm:p-8 space-y-4 max-w-[1400px] mx-auto">

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--slate-100)' }}>
            {ACTOR_FILTERS.map(f => {
              const isActive = f.value === 'all' ? !params.actor : params.actor === f.value
              return (
                <a
                  key={f.value}
                  href={buildHref({ actor: f.value === 'all' ? undefined : f.value })}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                  style={{
                    background: isActive ? 'var(--canvas-surface)' : 'transparent',
                    color:      isActive ? 'var(--canvas-text)'    : 'var(--canvas-muted)',
                    boxShadow:  isActive ? 'var(--shadow-sm)'       : 'none',
                  }}
                >
                  {f.label}
                </a>
              )
            })}
          </div>

          <form method="GET" action="/audit" className="ml-auto relative">
            {params.actor && <input type="hidden" name="actor" value={params.actor} />}
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ color: 'var(--canvas-muted)' }}
            >
              <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              name="event"
              defaultValue={params.event ?? ''}
              placeholder="Filter by event type…"
              className="text-sm pl-9 pr-3 py-1.5 rounded-md border outline-none transition-shadow focus:ring-2 w-56"
              style={{
                background: 'var(--canvas-surface)',
                borderColor: 'var(--canvas-border)',
                color: 'var(--canvas-text)',
              }}
            />
          </form>
        </div>

        {(events ?? []).length === 0 ? (
          <div className="card py-16 text-center">
            <div className="text-4xl mb-2">🗒️</div>
            <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
              No audit events match
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
              All privileged actions are logged here.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--canvas-border)', background: 'var(--canvas-surface-alt)' }}>
                  <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>Event</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-44" style={{ color: 'var(--canvas-muted)' }}>Entity</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-40" style={{ color: 'var(--canvas-muted)' }}>Actor</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-32" style={{ color: 'var(--canvas-muted)' }}>When</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
                {(events ?? []).map((e: any) => {
                  const actor = Array.isArray(e.users) ? e.users[0] : e.users
                  return (
                    <tr key={e.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-medium" style={{ color: 'var(--canvas-text)' }}>
                          {e.event_type}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--canvas-text-dim)' }}>
                        {e.entity_type
                          ? <>
                              <span className="font-medium">{e.entity_type}</span>
                              {e.entity_id && (
                                <span className="font-mono" style={{ color: 'var(--canvas-muted)' }}>
                                  {' '}· {String(e.entity_id).slice(0, 8)}
                                </span>
                              )}
                            </>
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={actorVariant(e.actor_type)} size="xs">
                            {e.actor_type}
                          </Badge>
                          {actor?.full_name && (
                            <span className="text-xs truncate" style={{ color: 'var(--canvas-text-dim)' }}>
                              {actor.full_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--canvas-muted)' }}
                          title={new Date(e.created_at).toLocaleString()}>
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(count ?? 0) > limit && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: 'var(--canvas-muted)' }}>
              Showing {offset + 1}–{Math.min(offset + limit, count ?? 0)} of {count}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`${buildHref({})}${buildHref({}).includes('?') ? '&' : '?'}page=${page - 1}`}
                   className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:bg-slate-50"
                   style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}>
                  ← Prev
                </a>
              )}
              {offset + limit < (count ?? 0) && (
                <a href={`${buildHref({})}${buildHref({}).includes('?') ? '&' : '?'}page=${page + 1}`}
                   className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:bg-slate-50"
                   style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}>
                  Next →
                </a>
              )}
            </div>
          </div>
        )}

        <div className="card p-4 text-xs" style={{ color: 'var(--canvas-muted)' }}>
          <strong style={{ color: 'var(--canvas-text-dim)' }}>Coming in V1:</strong>{' '}
          expandable rows with before/after diffs, CSV export, and a date-range filter.
        </div>
      </div>
    </div>
  )
}
