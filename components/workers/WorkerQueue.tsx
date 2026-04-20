'use client'

/**
 * WorkerQueue — the main view for a ground_worker.
 *
 * Top card: offered ticket with live countdown + Accept / Reject.
 * Below:    their active (accepted) tickets with quick-status updates.
 */

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SeverityBadge } from '@/components/ui/Badge'

// Sub-statuses a worker is allowed to set, in workflow order
const WORKER_STATUSES: { value: string; label: string }[] = [
  { value: 'accepted_by_worker',             label: 'Accepted' },
  { value: 'citizen_contacted',              label: 'Citizen Contacted' },
  { value: 'field_verification_in_progress', label: 'Field Verification' },
  { value: 'action_plan_created',            label: 'Action Plan Created' },
  { value: 'escalated_to_authority',         label: 'Escalated to Authority' },
  { value: 'awaiting_citizen_response',      label: 'Awaiting Citizen Response' },
  { value: 'awaiting_documents_evidence',    label: 'Awaiting Documents' },
]

const REJECTION_REASONS: { value: string; label: string }[] = [
  { value: 'too_far',               label: 'Too far away' },
  { value: 'irrelevant',            label: 'Not relevant to me' },
  { value: 'conflict_of_interest',  label: 'Conflict of interest' },
  { value: 'safety_concern',        label: 'Safety concern' },
  { value: 'outside_jurisdiction',  label: 'Outside my area' },
]

interface OfferedTicket {
  id: string
  expires_at: string
  ticket: {
    id: string
    ticket_number: string
    title: string | null
    original_issue_text: string | null
    location_text: string | null
    severity: string | null
    stage: string
    sub_status: string
  } | null
}

interface ActiveTicket {
  id: string
  ticket_number: string
  title: string | null
  original_issue_text: string | null
  location_text: string | null
  severity: string | null
  stage: string
  sub_status: string
  accepted_at: string | null
  sla_first_contact_due_at: string | null
  sla_resolution_due_at: string | null
}

interface Props {
  workerId: string
  offered: OfferedTicket | null
  activeTickets: ActiveTicket[]
}

// ─── Countdown ───────────────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (!expiresAt) return 0
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const display = `${mins}:${String(secs).padStart(2, '0')}`
  const isUrgent = secondsLeft < 30
  const expired = secondsLeft === 0

  return { secondsLeft, display, isUrgent, expired }
}

// ─── Offered ticket card ─────────────────────────────────────────────────────
function OfferedCard({ offered, onDone }: { offered: OfferedTicket; onDone: () => void }) {
  const { display, isUrgent, expired } = useCountdown(offered.expires_at)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('too_far')
  const [error, setError] = useState<string | null>(null)
  const ticket = offered.ticket

  async function accept() {
    if (!ticket) return
    setBusy('accept')
    setError(null)
    try {
      const res = await fetch('/api/tickets/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? 'Failed to accept')
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function reject() {
    if (!ticket) return
    setBusy('reject')
    setError(null)
    try {
      const res = await fetch('/api/tickets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, reason: rejectReason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? 'Failed to reject')
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="card p-5 space-y-4"
      style={{
        borderLeft: `3px solid ${isUrgent || expired ? 'var(--alert-danger-text)' : 'var(--primary)'}`,
        background: expired ? 'var(--alert-danger-bg)' : 'var(--canvas-surface)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: 'var(--canvas-muted)' }}>
            New ticket offer
          </div>
          <div className="text-base font-semibold" style={{ color: 'var(--canvas-text)' }}>
            {ticket?.title ?? ticket?.original_issue_text?.slice(0, 100) ?? 'Untitled ticket'}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
              {ticket?.ticket_number}
            </code>
            {ticket?.severity && <SeverityBadge severity={ticket.severity as any} />}
            {ticket?.location_text && (
              <span className="text-xs" style={{ color: 'var(--canvas-muted)' }}>
                📍 {ticket.location_text}
              </span>
            )}
          </div>
        </div>

        {/* Countdown */}
        <div className="flex flex-col items-center min-w-[72px]">
          <div
            className="text-2xl font-mono font-bold tabular-nums"
            style={{ color: expired ? 'var(--alert-danger-text)' : isUrgent ? 'var(--alert-danger-text)' : 'var(--primary)' }}
          >
            {expired ? '0:00' : display}
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
            {expired ? 'Expired' : 'to respond'}
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded-md"
             style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)' }}>
          {error}
        </div>
      )}

      {expired ? (
        <p className="text-sm" style={{ color: 'var(--alert-danger-text)' }}>
          This offer has expired. It will be reassigned automatically.
        </p>
      ) : (
        <>
          {!showReject ? (
            <div className="flex items-center gap-3">
              <button
                onClick={accept}
                disabled={!!busy}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 transition-opacity"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {busy === 'accept' ? 'Accepting…' : '✓ Accept'}
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={!!busy}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-60 transition-opacity"
                style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}
              >
                ✕ Reject
              </button>
              <Link
                href={`/tickets/${ticket?.id}`}
                className="text-xs underline-offset-2 hover:underline flex-shrink-0"
                style={{ color: 'var(--primary)' }}
              >
                View details
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="w-full border rounded-md text-sm px-3 py-2"
                style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
              >
                {REJECTION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  onClick={reject}
                  disabled={busy === 'reject'}
                  className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)', border: '1px solid var(--alert-danger-text)' }}
                >
                  {busy === 'reject' ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ color: 'var(--canvas-text-dim)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Active ticket card ──────────────────────────────────────────────────────
function ActiveCard({ ticket }: { ticket: ActiveTicket }) {
  const [status, setStatus] = useState(ticket.sub_status)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentIdx = WORKER_STATUSES.findIndex(s => s.value === status)
  // Workers can only move forward from their current state
  const allowedStatuses = WORKER_STATUSES.filter((_, i) => i >= currentIdx)

  async function updateStatus(newStatus: string) {
    if (newStatus === status) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/tickets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, sub_status: newStatus }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? 'Failed to update')
      setStatus(newStatus)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // SLA due-date warning
  const now = Date.now()
  const nextDue = [ticket.sla_first_contact_due_at, ticket.sla_resolution_due_at]
    .filter(Boolean)
    .map(d => new Date(d!).getTime())
    .filter(t => t > now)
    .sort()[0]
  const minutesToDue = nextDue ? Math.floor((nextDue - now) / 60_000) : null

  return (
    <div className="card p-4" style={{ borderLeft: '3px solid var(--green-600)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
              {ticket.ticket_number}
            </code>
            {ticket.severity && <SeverityBadge severity={ticket.severity as any} />}
            {minutesToDue != null && minutesToDue < 30 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--alert-warning-bg)', color: 'var(--alert-warning-text)' }}>
                ⏱ Due in {minutesToDue}m
              </span>
            )}
          </div>
          <div className="font-medium text-sm truncate" style={{ color: 'var(--canvas-text)' }}>
            {ticket.title ?? ticket.original_issue_text?.slice(0, 80) ?? 'Untitled'}
          </div>
          {ticket.location_text && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--canvas-muted)' }}>
              📍 {ticket.location_text}
            </div>
          )}
        </div>

        {/* Quick status update */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={status}
            onChange={e => updateStatus(e.target.value)}
            disabled={busy}
            className="text-xs border rounded-md px-2 py-1.5 disabled:opacity-60"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
          >
            {allowedStatuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {saved && <span className="text-xs" style={{ color: 'var(--green-600)' }}>✓ Saved</span>}
          {busy && <span className="text-xs" style={{ color: 'var(--canvas-muted)' }}>Saving…</span>}
        </div>
      </div>

      {error && (
        <div className="text-xs mt-2 px-2 py-1 rounded"
             style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)' }}>
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
          Accepted {ticket.accepted_at ? new Date(ticket.accepted_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        </span>
        <Link href={`/tickets/${ticket.id}`}
              className="text-xs font-medium hover:underline underline-offset-2"
              style={{ color: 'var(--primary)' }}>
          Full details →
        </Link>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function WorkerQueue({ workerId, offered, activeTickets }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function refresh() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-6">
      {/* Offered ticket */}
      {offered && offered.ticket ? (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--canvas-muted)' }}>
            Pending Offer
          </h2>
          <OfferedCard offered={offered} onDone={refresh} />
        </section>
      ) : (
        <div className="card p-6 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
            No pending offer
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
            You'll be notified on Telegram when a ticket is assigned to you.
          </p>
        </div>
      )}

      {/* Active tickets */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--canvas-muted)' }}>
          My Active Tickets{activeTickets.length > 0 ? ` (${activeTickets.length})` : ''}
        </h2>
        {activeTickets.length === 0 ? (
          <div className="card py-10 text-center">
            <p className="text-sm" style={{ color: 'var(--canvas-muted)' }}>
              No active tickets. Accepted tickets will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTickets.map(t => <ActiveCard key={t.id} ticket={t} />)}
          </div>
        )}
      </section>
    </div>
  )
}
