'use client'

import Link from 'next/link'
import { StageBadge, SeverityBadge, Badge } from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'

interface TicketRow {
  id: string
  ticket_number: string
  title: string | null
  original_issue_text: string | null
  stage: string
  sub_status: string
  severity: string | null
  critical_flag: boolean
  needs_triage: boolean
  anonymous_flag: boolean
  location_text: string | null
  latitude?: number | null
  longitude?: number | null
  sla_first_contact_due_at?: string | null
  sla_resolution_due_at?: string | null
  sla_breached_flag?: boolean
  created_at: string
  updated_at: string
  // Supabase joins can return arrays or objects for to-one relations
  territories: Array<{ id: string; name: string }> | { id: string; name: string } | null
  users: Array<{ id: string; full_name: string }> | { id: string; full_name: string } | null
  issue_categories: Array<{ id: string; name: string }> | { id: string; name: string } | null
}

function first<T>(val: T[] | T | null | undefined): T | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0] ?? null
  return val
}

interface TicketTableProps {
  tickets: TicketRow[]
  showTriageFlag?: boolean
  emptyMessage?: string
}

/**
 * Return the most relevant SLA state for a ticket, if any:
 *   - 'breached'  → sla_breached_flag true OR a due-date has passed
 *   - 'due_soon'  → next due-date is within 30% of its window (or <15 min)
 *   - null        → no visible SLA state
 */
function slaState(t: TicketRow): { kind: 'breached' | 'due_soon'; label: string } | null {
  if (t.sla_breached_flag) return { kind: 'breached', label: 'SLA breach' }
  const now = Date.now()
  const candidates: Array<{ at: string; label: string }> = []
  if (t.sla_first_contact_due_at) candidates.push({ at: t.sla_first_contact_due_at, label: 'First contact' })
  if (t.sla_resolution_due_at)    candidates.push({ at: t.sla_resolution_due_at,    label: 'Resolution' })
  for (const c of candidates) {
    const due = new Date(c.at).getTime()
    if (isNaN(due)) continue
    if (due < now) return { kind: 'breached', label: `${c.label} overdue` }
  }
  for (const c of candidates) {
    const due = new Date(c.at).getTime()
    if (isNaN(due)) continue
    const minutesLeft = (due - now) / 60_000
    if (minutesLeft < 15) return { kind: 'due_soon', label: `${c.label} in <15m` }
  }
  return null
}

function SlaBadge({ ticket }: { ticket: TicketRow }) {
  const state = slaState(ticket)
  if (!state) return null
  return (
    <Badge variant={state.kind === 'breached' ? 'danger' : 'warning'} size="xs">
      ⏱ {state.label}
    </Badge>
  )
}

function ticketSubtitle(t: TicketRow): string {
  const cat = first(t.issue_categories)?.name
  const terr = first(t.territories)?.name ?? (t.location_text ? 'Has location' : null)
  const assignee = first(t.users)?.full_name
  return [cat, terr, assignee && `→ ${assignee}`].filter(Boolean).join(' · ')
}

export function TicketTable({ tickets, showTriageFlag = false, emptyMessage }: TicketTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="card py-16 text-center">
        <div className="text-4xl mb-2">📋</div>
        <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
          No tickets found
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
          {emptyMessage ?? 'Try adjusting filters or wait for new reports.'}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* ====== DESKTOP TABLE (md and up) ====== */}
      <div className="card overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--canvas-border)', background: 'var(--canvas-surface-alt)' }}>
              <Th>Issue</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-24">Severity</Th>
              <Th className="w-32">Assigned</Th>
              <Th className="w-28">Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
            {tickets.map(ticket => (
              <tr key={ticket.id} className="group transition-colors hover:bg-slate-50">
                {/* Primary: title + code + subtitle */}
                <td className="px-4 py-3 align-middle">
                  <Link href={`/tickets/${ticket.id}`} className="block">
                    <div className="flex items-center gap-2 mb-0.5">
                      <code
                        className="text-[11px] font-mono tabular-nums"
                        style={{ color: 'var(--canvas-muted)' }}
                      >
                        {ticket.ticket_number}
                      </code>
                      {ticket.critical_flag && <Badge variant="danger" size="xs">Critical</Badge>}
                      {ticket.anonymous_flag && <Badge variant="neutral" size="xs">Anon</Badge>}
                      {showTriageFlag && ticket.needs_triage && <Badge variant="warning" size="xs">Triage</Badge>}
                      <SlaBadge ticket={ticket} />
                      {ticket.latitude != null && ticket.longitude != null && (
                        <Badge variant="info" size="xs">📍 Geo</Badge>
                      )}
                    </div>
                    <div
                      className="font-medium truncate group-hover:underline"
                      style={{ color: 'var(--canvas-text)', maxWidth: '520px' }}
                    >
                      {ticket.title ?? ticket.original_issue_text?.substring(0, 100) ?? 'Untitled'}
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--canvas-muted)', maxWidth: '520px' }}>
                      {ticketSubtitle(ticket) || '—'}
                    </div>
                  </Link>
                </td>

                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <StageBadge stage={ticket.stage as any} />
                </td>

                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <SeverityBadge severity={ticket.severity as any} />
                </td>

                <td className="px-4 py-3 align-middle">
                  <span className="text-xs truncate block" style={{ color: 'var(--canvas-text-dim)', maxWidth: '140px' }}>
                    {first(ticket.users)?.full_name ?? <span style={{ color: 'var(--canvas-muted)' }}>Unassigned</span>}
                  </span>
                </td>

                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <span
                    className="text-xs"
                    style={{ color: 'var(--canvas-muted)' }}
                    title={new Date(ticket.created_at).toLocaleString()}
                  >
                    {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ====== MOBILE CARDS (below md) ====== */}
      <div className="space-y-2 md:hidden">
        {tickets.map(ticket => (
          <Link
            key={ticket.id}
            href={`/tickets/${ticket.id}`}
            className="card card-hover p-4 block"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
                {ticket.ticket_number}
              </code>
              {ticket.critical_flag && <Badge variant="danger" size="xs">Critical</Badge>}
              {ticket.anonymous_flag && <Badge variant="neutral" size="xs">Anon</Badge>}
              {showTriageFlag && ticket.needs_triage && <Badge variant="warning" size="xs">Triage</Badge>}
              <SlaBadge ticket={ticket} />
            </div>
            <div className="font-medium mb-1" style={{ color: 'var(--canvas-text)' }}>
              {ticket.title ?? ticket.original_issue_text?.substring(0, 100) ?? 'Untitled'}
            </div>
            <div className="text-xs mb-3" style={{ color: 'var(--canvas-muted)' }}>
              {ticketSubtitle(ticket) || '—'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StageBadge stage={ticket.stage as any} />
              <SeverityBadge severity={ticket.severity as any} />
              <span className="ml-auto text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider ${className}`}
      style={{ color: 'var(--canvas-muted)' }}
    >
      {children}
    </th>
  )
}
