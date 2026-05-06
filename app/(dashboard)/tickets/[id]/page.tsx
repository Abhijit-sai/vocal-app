import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { StageBadge, SeverityBadge, Badge } from '@/components/ui/Badge'
import { TicketActionsPanel } from '@/components/tickets/TicketActionsPanel'
import { formatDistanceToNow } from 'date-fns'
import type { TicketStage } from '@/types/database'
import { SUB_STATUS_LABELS as subStatusLabels } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const supabase = createSupabaseServiceClient()
  const roleName = (user as any).roles?.name
  const isPrivileged = ['super_admin', 'central_support'].includes(roleName)

  // Fetch ticket with all relations.
  // NOTE: `issue_categories` is referenced twice (category + subcategory),
  // so each embedded resource is aliased to avoid a PostgREST collision
  // that silently returned an error and triggered a 404 on every ticket.
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      *,
      territories(id, name, code),
      owner:users!tickets_owner_user_id_fkey(id, full_name, phone, email),
      category:issue_categories!tickets_category_id_fkey(id, name),
      subcategory:issue_categories!tickets_subcategory_id_fkey(id, name)
    `)
    .eq('id', id)
    .single()

  if (error || !ticket) {
    if (error) console.error('[tickets/[id]] supabase error:', error)
    notFound()
  }

  const [
    { data: notes },
    { data: history },
    { data: aiSuggestion },
    { data: assignment },
    { data: citizenIdentity },
  ] = await Promise.all([
    supabase.from('ticket_notes')
      .select('*, users(id, full_name)')
      .eq('ticket_id', id).eq('soft_deleted', false)
      .order('created_at', { ascending: false }),
    supabase.from('ticket_stage_history')
      .select('*, users(id, full_name)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('ai_ticket_suggestions')
      .select('*')
      .eq('ticket_id', id).eq('status', 'completed').eq('confirmed', false)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle(),
    supabase.from('ticket_assignments')
      .select('*, users!ticket_assignments_worker_user_id_fkey(id, full_name)')
      .eq('ticket_id', id).eq('is_current', true)
      .maybeSingle(),
    // Fetch citizen contact info — only when identity has been revealed OR user is privileged.
    ticket.citizen_id
      ? supabase.from('citizen_channel_identities')
          .select('channel, channel_user_id, username, phone')
          .eq('citizen_id', ticket.citizen_id)
          .eq('channel', 'telegram')
          .order('last_seen_at', { ascending: false })
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Workers only see citizen contact after identity is revealed; privileged users see always.
  const canSeeCitizenContact =
    isPrivileged ||
    (roleName === 'ground_worker' && !!(ticket as any).citizen_identity_revealed_at)

  const citizenPhone: string | null = canSeeCitizenContact ? (citizenIdentity?.phone ?? null) : null
  const citizenHandle: string | null = canSeeCitizenContact
    ? (citizenIdentity?.username ? `@${citizenIdentity.username}` : null)
    : null

  // Workers list for assignment (central support only)
  let workers: any[] = []
  if (['super_admin', 'central_support'].includes(roleName)) {
    const { data: w } = await supabase
      .from('users')
      .select('id, full_name, user_territories(territory_id)')
      .eq('organization_id', ticket.organization_id)
      .eq('role_id', '00000000-0000-0000-0000-000000000005') // ground_worker role
      .eq('active', true)
    workers = w ?? []
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--canvas-bg)' }}>
      {/* ============ Top header ============ */}
      <header
        className="px-6 sm:px-8 py-4 flex-shrink-0"
        style={{ background: 'var(--canvas-surface)', borderBottom: '1px solid var(--canvas-border)' }}
      >
        <div className="flex items-center gap-2 mb-1 text-xs" style={{ color: 'var(--canvas-muted)' }}>
          <Link href="/tickets" className="hover:underline">Tickets</Link>
          <span>/</span>
          <span className="font-mono">{ticket.ticket_number}</span>
        </div>
        <h1
          className="text-lg font-semibold truncate"
          style={{ color: 'var(--canvas-text)', maxWidth: '820px' }}
          title={ticket.title ?? undefined}
        >
          {ticket.title ?? ticket.original_issue_text?.substring(0, 100) ?? 'Untitled Ticket'}
        </h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <StageBadge stage={ticket.stage as TicketStage} />
          <SeverityBadge severity={ticket.severity as any} />
          {ticket.critical_flag     && <Badge variant="danger" size="sm">Critical</Badge>}
          {ticket.anonymous_flag    && <Badge variant="neutral" size="sm">Anonymous</Badge>}
          {ticket.needs_triage      && <Badge variant="warning" size="sm">Needs Triage</Badge>}
          <span className="text-[11px] ml-2" style={{ color: 'var(--canvas-muted)' }}>
            Opened {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
            {' · '}
            via <span className="capitalize">{ticket.source_channel}</span>
          </span>
        </div>
      </header>

      {/* ============ Body ============ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — constrained width for readability */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6 space-y-5">

            {/* AI Suggestion banner */}
            {aiSuggestion && isPrivileged && (
              <section
                className="rounded-lg p-4 animate-in"
                style={{
                  background: 'var(--alert-info-bg)',
                  border: '1px solid #bfdbfe',
                  borderLeft: '3px solid var(--alert-info-border)',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold mb-2" style={{ color: 'var(--alert-info-text)' }}>
                      AI suggestions pending review
                    </p>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--alert-info-text)' }}>
                      {aiSuggestion.suggested_category && (
                        <div><dt className="inline opacity-70">Category:</dt> <dd className="inline font-medium">{aiSuggestion.suggested_category}</dd></div>
                      )}
                      {aiSuggestion.suggested_severity && (
                        <div><dt className="inline opacity-70">Severity:</dt> <dd className="inline font-medium">{aiSuggestion.suggested_severity}</dd></div>
                      )}
                      {aiSuggestion.suggested_department && (
                        <div><dt className="inline opacity-70">Department:</dt> <dd className="inline font-medium">{aiSuggestion.suggested_department}</dd></div>
                      )}
                      {aiSuggestion.suggested_title && (
                        <div><dt className="inline opacity-70">Title:</dt> <dd className="inline font-medium">{aiSuggestion.suggested_title}</dd></div>
                      )}
                      {aiSuggestion.suggested_summary && (
                        <div className="col-span-2"><dt className="inline opacity-70">Summary:</dt> <dd className="inline font-medium">{aiSuggestion.suggested_summary}</dd></div>
                      )}
                    </dl>
                  </div>
                  <form action="/api/tickets/confirm-ai" method="POST" className="flex-shrink-0">
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <input type="hidden" name="suggestion_id" value={aiSuggestion.id} />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                      style={{ background: 'var(--primary)', color: 'white' }}
                    >
                      Confirm & apply
                    </button>
                  </form>
                </div>
              </section>
            )}

            {/* Issue content — visually dominant with primary left-border */}
            <section
              className="card p-5"
              style={{ borderLeft: `3px solid var(--primary)` }}
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--canvas-muted)' }}>
                Reported Issue
              </h2>
              {ticket.original_issue_text ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--canvas-text)' }}>
                  {ticket.original_issue_text}
                </p>
              ) : (
                <p className="text-sm italic" style={{ color: 'var(--canvas-muted)' }}>
                  No text provided with initial report.
                </p>
              )}
              {ticket.normalized_summary && ticket.normalized_summary !== ticket.original_issue_text && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--canvas-border)' }}>
                  <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--canvas-muted)' }}>
                    Normalized summary
                  </p>
                  <p className="text-sm" style={{ color: 'var(--canvas-text-dim)' }}>
                    {ticket.normalized_summary}
                  </p>
                </div>
              )}
            </section>

            {/* Citizen contact — shown to workers after acceptance, always to privileged roles */}
            {canSeeCitizenContact && (citizenPhone || citizenHandle) && (
              <section
                className="card p-5"
                style={{ borderLeft: '3px solid #10b981' }}
              >
                <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-3"
                    style={{ color: 'var(--canvas-muted)' }}>
                  Citizen Contact
                </h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  {citizenPhone && (
                    <a
                      href={`tel:${citizenPhone}`}
                      className="flex items-center gap-2 font-medium"
                      style={{ color: 'var(--primary)' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/>
                      </svg>
                      {citizenPhone}
                    </a>
                  )}
                  {citizenHandle && (
                    <span className="flex items-center gap-2" style={{ color: 'var(--canvas-text-dim)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
                      </svg>
                      {citizenHandle}
                    </span>
                  )}
                </div>
                {!ticket.anonymous_flag && !(ticket as any).citizen_identity_revealed_at && roleName === 'ground_worker' && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--canvas-muted)' }}>
                    Accept the ticket to reveal citizen contact details.
                  </p>
                )}
              </section>
            )}

            {/* Prompt for workers who haven't accepted yet */}
            {roleName === 'ground_worker' && !ticket.anonymous_flag && !(ticket as any).citizen_identity_revealed_at && !citizenPhone && !citizenHandle && (
              <section className="card p-4" style={{ borderLeft: '3px solid #f59e0b' }}>
                <p className="text-sm" style={{ color: 'var(--canvas-muted)' }}>
                  📞 Citizen contact details will appear here after you accept this ticket.
                </p>
              </section>
            )}

            {/* Classification grid */}
            <section className="card p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--canvas-muted)' }}>
                Classification
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <MetaRow label="Category" value={(ticket as any).category?.name ?? (ticket as any).subcategory?.name} />
                <MetaRow label="Sub-status" value={subStatusLabels[ticket.sub_status as keyof typeof subStatusLabels] ?? ticket.sub_status} />
                <MetaRow label="Territory" value={ticket.territories?.name} />
                <MetaRow
                  label="Location"
                  value={<LocationValue
                    text={ticket.location_text ?? ticket.address_text}
                    lat={ticket.latitude}
                    lng={ticket.longitude}
                  />}
                />
                <MetaRow label="Department" value={ticket.department} />
                <MetaRow label="Source" value={ticket.source_channel} className="capitalize" />
              </div>
            </section>

            {/* Notes & Activity */}
            <section className="card overflow-hidden">
              <header className="px-5 py-3 flex items-center justify-between"
                      style={{ borderBottom: '1px solid var(--canvas-border)' }}>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--canvas-muted)' }}>
                  Notes & Activity
                </h2>
                <span className="text-xs" style={{ color: 'var(--canvas-muted)' }}>
                  {notes?.length ?? 0} note{(notes?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </header>
              {(notes ?? []).length === 0 ? (
                <div className="px-5 py-10 text-sm text-center" style={{ color: 'var(--canvas-muted)' }}>
                  No notes yet. Use the action panel to add the first one.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
                  {(notes ?? []).map((note: any) => (
                    <li key={note.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
                          {note.users?.full_name ?? 'System'}
                        </span>
                        <Badge variant="neutral" size="xs">{note.note_type.replace('_', ' ')}</Badge>
                        {!note.is_internal && <Badge variant="info" size="xs">Citizen visible</Badge>}
                        <span className="text-[11px] ml-auto" style={{ color: 'var(--canvas-muted)' }}>
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--canvas-text)' }}>
                        {note.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Stage History timeline */}
            <section className="card overflow-hidden">
              <header className="px-5 py-3" style={{ borderBottom: '1px solid var(--canvas-border)' }}>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
                  Status History
                </h2>
              </header>
              <ol className="px-5 py-4 space-y-3">
                {(history ?? []).length === 0 && (
                  <li className="text-sm" style={{ color: 'var(--canvas-muted)' }}>No stage changes yet.</li>
                )}
                {(history ?? []).map((h: any) => (
                  <li key={h.id} className="flex items-start gap-3 text-xs">
                    <div className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full"
                         style={{ background: 'var(--primary)' }} />
                    <div className="min-w-0">
                      <div>
                        <span style={{ color: 'var(--canvas-text)' }}>
                          {h.system_action ? 'System' : (h.users?.full_name ?? 'Unknown')}
                        </span>
                        <span style={{ color: 'var(--canvas-muted)' }}> → </span>
                        <span className="font-medium" style={{ color: 'var(--canvas-text)' }}>
                          {subStatusLabels[h.to_sub_status as keyof typeof subStatusLabels] ?? h.to_sub_status}
                        </span>
                      </div>
                      {h.change_reason && (
                        <div style={{ color: 'var(--canvas-muted)' }}>{h.change_reason}</div>
                      )}
                      <div style={{ color: 'var(--canvas-muted)' }}>
                        {new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

          </div>
        </div>

        {/* ============ Right: actions panel ============ */}
        <aside
          className="w-80 flex-shrink-0 overflow-y-auto hidden lg:block"
          style={{ borderLeft: '1px solid var(--canvas-border)', background: 'var(--canvas-surface)' }}
        >
          <TicketActionsPanel
            ticket={ticket as any}
            currentUser={{ id: user.id, role: roleName }}
            assignment={assignment}
            workers={workers}
          />
        </aside>
      </div>
    </div>
  )
}

function LocationValue({ text, lat, lng }: { text: string | null | undefined; lat: number | null; lng: number | null }) {
  const hasCoords = lat != null && lng != null
  const href = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : text
      ? `https://www.google.com/maps?q=${encodeURIComponent(text)}`
      : null
  const label = text || (hasCoords ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : null)
  if (!label) return <>—</>
  if (!href) return <>{label}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline decoration-dotted hover:decoration-solid"
      style={{ color: 'var(--primary)' }}
      title={hasCoords ? `${lat}, ${lng}` : label}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {label}
    </a>
  )
}

function MetaRow({ label, value, className = '' }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--canvas-muted)' }}>
        {label}
      </dt>
      <dd className={`text-sm font-medium ${className}`} style={{ color: value ? 'var(--canvas-text)' : 'var(--canvas-muted)' }}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
