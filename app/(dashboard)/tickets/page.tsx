import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { TicketTable } from '@/components/tickets/TicketTable'
import { TICKET_LIST_SELECT } from '@/services/ticketQueries'
import type { TicketStage, Severity } from '@/types/database'

export const dynamic = 'force-dynamic'

interface SearchParams {
  stage?: TicketStage
  severity?: Severity | 'any'
  sla?: 'breached'
  loc?: 'with' | 'without'
  view?: string
  search?: string
  page?: string
}

const STAGE_FILTERS: { label: string; value: TicketStage | 'all' }[] = [
  { label: 'All',         value: 'all'         },
  { label: 'To Do',       value: 'to_do'       },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'On Hold',     value: 'on_hold'     },
  { label: 'Closed',      value: 'closed'      },
]

const SEVERITY_FILTERS: { label: string; value: Severity | 'any' }[] = [
  { label: 'Any severity', value: 'any'      },
  { label: 'Critical',     value: 'critical' },
  { label: 'High',         value: 'high'     },
  { label: 'Medium',       value: 'medium'   },
  { label: 'Low',          value: 'low'      },
]

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const supabase = createSupabaseServiceClient()

  const page = parseInt(params.page ?? '1', 10)
  const limit = 50
  const offset = (page - 1) * limit

  let query = supabase
    .from('tickets')
    .select(TICKET_LIST_SELECT, { count: 'exact' })
    .eq('organization_id', user.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.stage)                                 query = query.eq('stage', params.stage)
  if (params.severity && params.severity !== 'any') query = query.eq('severity', params.severity)
  if (params.sla === 'breached')                    query = query.eq('sla_breached_flag', true)
  if (params.loc === 'with')                        query = query.not('latitude', 'is', null)
  if (params.loc === 'without')                     query = query.is('latitude', null)
  if (params.search) {
    // PostgREST .or() takes a raw filter string — sanitize so user input can't
    // break out of the filter expression. Strip metachars: , ( ) . " '
    // and escape LIKE wildcards % and _ so they're treated literally.
    const safe = params.search
      .replace(/[,()."'\\]/g, ' ')
      .replace(/[%_]/g, '\\$&')
      .trim()
      .slice(0, 100)
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,original_issue_text.ilike.%${safe}%,ticket_number.ilike.%${safe}%`
      )
    }
  }

  const { data: tickets, count } = await query

  const buildHref = (changes: Partial<SearchParams>) => {
    const qp = new URLSearchParams()
    const merged = { ...params, ...changes, page: undefined } as Record<string, string | undefined>
    Object.entries(merged).forEach(([k, v]) => { if (v) qp.set(k, v) })
    const s = qp.toString()
    return s ? `/tickets?${s}` : '/tickets'
  }

  const activeExtra = [
    params.severity && params.severity !== 'any',
    params.sla === 'breached',
    params.loc === 'with' || params.loc === 'without',
  ].filter(Boolean).length

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle={`${count ?? 0} ticket${(count ?? 0) !== 1 ? 's' : ''}${params.stage ? ` · ${params.stage.replace('_', ' ')}` : ''}${activeExtra ? ` · ${activeExtra} filter${activeExtra > 1 ? 's' : ''}` : ''}`}
      />

      <div className="p-6 sm:p-8 space-y-4 max-w-[1400px] mx-auto">

        {/* Filter bar — row 1: stages + search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg"
               style={{ background: 'var(--slate-100)' }}>
            {STAGE_FILTERS.map(f => {
              const isActive = f.value === 'all' ? !params.stage : params.stage === f.value
              return (
                <a
                  key={f.value}
                  href={buildHref({ stage: f.value === 'all' ? undefined : f.value as TicketStage })}
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

          {/* Search */}
          <form method="GET" action="/tickets" className="ml-auto relative">
            {params.stage    && <input type="hidden" name="stage"    value={params.stage} />}
            {params.severity && <input type="hidden" name="severity" value={params.severity} />}
            {params.sla      && <input type="hidden" name="sla"      value={params.sla} />}
            {params.loc      && <input type="hidden" name="loc"      value={params.loc} />}
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
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Search tickets…"
              className="text-sm pl-9 pr-3 py-1.5 rounded-md border outline-none transition-shadow focus:ring-2 w-56"
              style={{
                background: 'var(--canvas-surface)',
                borderColor: 'var(--canvas-border)',
                color: 'var(--canvas-text)',
              }}
            />
          </form>
        </div>

        {/* Filter bar — row 2: severity / SLA / location */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--slate-100)' }}>
            {SEVERITY_FILTERS.map(s => {
              const isActive = s.value === 'any'
                ? !params.severity || params.severity === 'any'
                : params.severity === s.value
              return (
                <a
                  key={s.value}
                  href={buildHref({ severity: s.value === 'any' ? undefined : s.value })}
                  className="px-2.5 py-1 rounded-md font-medium transition-colors"
                  style={{
                    background: isActive ? 'var(--canvas-surface)' : 'transparent',
                    color:      isActive ? 'var(--canvas-text)'    : 'var(--canvas-muted)',
                    boxShadow:  isActive ? 'var(--shadow-sm)'       : 'none',
                  }}
                >
                  {s.label}
                </a>
              )
            })}
          </div>

          <a
            href={buildHref({ sla: params.sla === 'breached' ? undefined : 'breached' })}
            className="px-2.5 py-1.5 rounded-md font-medium border transition-colors"
            style={{
              borderColor: params.sla === 'breached' ? 'var(--alert-danger-text)' : 'var(--canvas-border)',
              background:  params.sla === 'breached' ? 'var(--alert-danger-bg)'   : 'transparent',
              color:       params.sla === 'breached' ? 'var(--alert-danger-text)' : 'var(--canvas-text-dim)',
            }}
          >
            ⏱ SLA breached
          </a>

          <a
            href={buildHref({ loc: params.loc === 'with' ? undefined : 'with' })}
            className="px-2.5 py-1.5 rounded-md font-medium border transition-colors"
            style={{
              borderColor: params.loc === 'with' ? 'var(--primary)'  : 'var(--canvas-border)',
              background:  params.loc === 'with' ? 'var(--brand-50)' : 'transparent',
              color:       params.loc === 'with' ? 'var(--primary)'  : 'var(--canvas-text-dim)',
            }}
          >
            📍 With location
          </a>
          <a
            href={buildHref({ loc: params.loc === 'without' ? undefined : 'without' })}
            className="px-2.5 py-1.5 rounded-md font-medium border transition-colors"
            style={{
              borderColor: params.loc === 'without' ? 'var(--alert-warning-text)' : 'var(--canvas-border)',
              background:  params.loc === 'without' ? 'var(--alert-warning-bg)'   : 'transparent',
              color:       params.loc === 'without' ? 'var(--alert-warning-text)' : 'var(--canvas-text-dim)',
            }}
          >
            Missing location
          </a>

          {(params.severity || params.sla || params.loc || params.search) && (
            <a
              href={buildHref({ severity: undefined, sla: undefined, loc: undefined, search: undefined })}
              className="ml-auto px-2.5 py-1.5 rounded-md font-medium"
              style={{ color: 'var(--canvas-muted)' }}
            >
              Clear filters ×
            </a>
          )}
        </div>

        <TicketTable tickets={tickets ?? []} showTriageFlag />

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
      </div>
    </div>
  )
}
