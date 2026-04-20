import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { TicketTable } from '@/components/tickets/TicketTable'
import { TICKET_LIST_SELECT } from '@/services/ticketQueries'

export const dynamic = 'force-dynamic'

export default async function TriagePage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    redirect('/dashboard')
  }

  const supabase = createSupabaseServiceClient()

  const [triageResult, locationResult] = await Promise.all([
    supabase
      .from('tickets')
      .select(TICKET_LIST_SELECT, { count: 'exact' })
      .eq('organization_id', user.organization_id)
      .eq('needs_triage', true)
      .order('critical_flag', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('tickets')
      .select(TICKET_LIST_SELECT)
      .eq('organization_id', user.organization_id)
      .eq('needs_location_validation_flag', true)
      .neq('stage', 'closed')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const triageTickets = triageResult.data ?? []
  const triageCount = triageResult.count ?? 0
  const locationTickets = locationResult.data ?? []

  const criticalCount = triageTickets.filter((t: any) => t.critical_flag).length

  return (
    <div>
      <PageHeader
        title="Triage Queue"
        subtitle={`${triageCount} ticket${triageCount !== 1 ? 's' : ''} awaiting review`}
      />

      <div className="p-6 sm:p-8 space-y-6 max-w-[1400px] mx-auto">

        {/* Critical alert banner */}
        {criticalCount > 0 && (
          <div
            className="card p-4 flex items-start gap-3"
            style={{
              background: 'var(--alert-danger-bg)',
              borderLeft: '3px solid var(--alert-danger-border)',
            }}
          >
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--alert-danger-text)', flexShrink: 0, marginTop: 2 }}
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--alert-danger-text)' }}>
                {criticalCount} critical ticket{criticalCount !== 1 ? 's' : ''} in queue
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--alert-danger-text)', opacity: 0.85 }}>
                High-severity items require immediate triage.
              </p>
            </div>
          </div>
        )}

        {/* Needs Triage */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              Needs Triage
            </h2>
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums"
              style={{ background: 'var(--slate-100)', color: 'var(--canvas-text-dim)' }}
            >
              {triageCount}
            </span>
          </div>
          <TicketTable
            tickets={triageTickets}
            showTriageFlag={false}
            emptyMessage="No tickets need triage right now — good job."
          />
        </section>

        {/* Needs Location Validation */}
        {locationTickets.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
                Needs Location Validation
              </h2>
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums"
                style={{ background: 'var(--alert-warning-bg)', color: 'var(--alert-warning-text)' }}
              >
                {locationTickets.length}
              </span>
            </div>
            <TicketTable
              tickets={locationTickets}
              showTriageFlag={false}
            />
          </section>
        )}
      </div>
    </div>
  )
}
