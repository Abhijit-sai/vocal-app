'use client'

/**
 * WorkerQueue — the main view for a ground_worker.
 *
 * Top card: offered ticket with live countdown + Accept / Reject.
 * Below:    their active (accepted) tickets with quick-status updates.
 */

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SeverityBadge } from '@/components/ui/Badge'

// Sub-statuses a worker is allowed to set, in rough workflow order. Used
// by the server for backwards-move checks; kept here for the sort order of
// the quick-action buttons so earlier stages render first.
const WORKER_STATUSES: { value: string; label: string }[] = [
  { value: 'accepted_by_worker',             label: 'Accepted' },
  { value: 'citizen_contacted',              label: 'Citizen Contacted' },
  { value: 'field_verification_in_progress', label: 'Field Verification' },
  { value: 'action_plan_created',            label: 'Action Plan Created' },
  { value: 'escalated_to_authority',         label: 'Escalated to Authority' },
  { value: 'awaiting_citizen_response',      label: 'Awaiting Citizen Response' },
  { value: 'awaiting_documents_evidence',    label: 'Awaiting Documents' },
  { value: 'suspected_fake_spam_review',     label: 'Flagged as Spam/Fake' },
]

// Big, tappable "what did you just do?" buttons. Each maps to an allowed
// worker sub_status. Design intent: the worker should never have to think
// about status taxonomy — they pick the action they just took.
type QuickAction = {
  label: string
  sub_status: string
  tone: 'neutral' | 'primary' | 'warning' | 'danger'
  icon: string
}
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Mark First Contact Done', sub_status: 'citizen_contacted',              tone: 'primary', icon: '📞' },
  { label: 'Mark On the Way',         sub_status: 'field_verification_in_progress', tone: 'primary', icon: '🚶' },
  { label: 'Mark In Progress',        sub_status: 'action_plan_created',            tone: 'primary', icon: '🛠️' },
  { label: 'Mark as Raised',          sub_status: 'escalated_to_authority',         tone: 'primary', icon: '📣' },
  { label: 'Mark Spam / Fake',        sub_status: 'suspected_fake_spam_review',     tone: 'danger',  icon: '🚩' },
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

// ─── SLA bar ─────────────────────────────────────────────────────────────────
// Compact progress bar showing how far through the SLA window the worker is.
// Picks the *earliest* future due date (usually first-contact) while it's
// still open, then falls back to resolution. If both are past → breach.
function SlaBar({ ticket }: { ticket: ActiveTicket }) {
  const now = Date.now()
  const firstDue = ticket.sla_first_contact_due_at ? new Date(ticket.sla_first_contact_due_at).getTime() : null
  const resDue   = ticket.sla_resolution_due_at    ? new Date(ticket.sla_resolution_due_at).getTime()    : null
  const accepted = ticket.accepted_at              ? new Date(ticket.accepted_at).getTime()              : null

  // Pick the active clock: first_contact if still pending and not yet hit,
  // otherwise resolution. Label tells the worker which one they're racing.
  let due: number | null
  let label: string
  const firstContactDone = ticket.sub_status !== 'accepted_by_worker' && ticket.sub_status !== 'assigned_awaiting_acceptance'
  if (firstDue && !firstContactDone) { due = firstDue; label = 'First contact SLA' }
  else if (resDue)                   { due = resDue;   label = 'Resolution SLA'    }
  else                               { due = firstDue; label = 'SLA'               }

  if (!due || !accepted) return null

  const total     = Math.max(1, due - accepted)
  const elapsed   = Math.max(0, now - accepted)
  const pct       = Math.min(100, (elapsed / total) * 100)
  const msLeft    = due - now
  const breached  = msLeft <= 0
  const warn      = !breached && pct >= 75

  const tone = breached ? 'danger' : warn ? 'warning' : 'ok'
  const bgVar  = tone === 'danger' ? 'var(--alert-danger-text)'   : tone === 'warning' ? 'var(--alert-warning-text)' : 'var(--green-600)'
  const bedVar = tone === 'danger' ? 'var(--alert-danger-bg)'     : tone === 'warning' ? 'var(--alert-warning-bg)'   : 'rgba(16, 185, 129, 0.12)'
  const textVar= tone === 'danger' ? 'var(--alert-danger-text)'   : tone === 'warning' ? 'var(--alert-warning-text)' : 'var(--green-600)'

  const formatLeft = (ms: number) => {
    const abs = Math.abs(ms)
    const mins = Math.floor(abs / 60_000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    if (hrs < 24) return remMins ? `${hrs}h ${remMins}m` : `${hrs}h`
    const days = Math.floor(hrs / 24)
    const remHrs = hrs % 24
    return remHrs ? `${days}d ${remHrs}h` : `${days}d`
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: textVar }}>
          {breached ? `⚠ ${label} breached by ${formatLeft(msLeft)}` : `${label} — ${formatLeft(msLeft)} left`}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: bedVar }}>
        <div className="h-full rounded-full transition-all"
             style={{ width: `${breached ? 100 : pct}%`, background: bgVar }} />
      </div>
    </div>
  )
}

// ─── Active ticket card ──────────────────────────────────────────────────────
function ActiveCard({ ticket, onChanged }: { ticket: ActiveTicket; onChanged: () => void }) {
  const [status, setStatus] = useState(ticket.sub_status)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  async function updateStatus(newStatus: string) {
    if (newStatus === status) {
      setFlash('Already in this status')
      setTimeout(() => setFlash(null), 1500)
      return
    }
    setBusy(newStatus)
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
      setFlash('✓ Updated')
      setTimeout(() => setFlash(null), 1800)
      // Tell the parent to re-fetch so SLA timers and accepted_at refresh.
      onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  // An action is "already done" if its status is ≤ the current status in
  // WORKER_STATUSES order (so we can grey it out rather than hide it —
  // visual continuity matters more than pristine list length).
  const currentIdx = WORKER_STATUSES.findIndex(s => s.value === status)

  const currentLabel =
    WORKER_STATUSES.find(s => s.value === status)?.label ??
    status.replace(/_/g, ' ')

  return (
    <div className="card p-4" style={{ borderLeft: '3px solid var(--green-600)' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
              {ticket.ticket_number}
            </code>
            {ticket.severity && <SeverityBadge severity={ticket.severity as any} />}
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded capitalize"
                  style={{ background: 'var(--shell-surface-hi)', color: 'var(--canvas-text-dim)' }}>
              {currentLabel}
            </span>
          </div>
          <div className="font-medium text-sm" style={{ color: 'var(--canvas-text)' }}>
            {ticket.title ?? ticket.original_issue_text?.slice(0, 120) ?? 'Untitled'}
          </div>
          {ticket.location_text && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--canvas-muted)' }}>
              📍 {ticket.location_text}
            </div>
          )}
        </div>
      </div>

      {/* SLA progress bar */}
      <SlaBar ticket={ticket} />

      {/* Quick-action buttons — one tap per real-world action. */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_ACTIONS.map(a => {
          const actionIdx = WORKER_STATUSES.findIndex(s => s.value === a.sub_status)
          // Already-done forward actions are dimmed; Spam/Fake is always
          // enabled because it's sideways (on_hold) regardless of current.
          const alreadyDone = a.tone !== 'danger' && actionIdx >= 0 && actionIdx <= currentIdx
          const isBusy = busy === a.sub_status
          const toneStyle: React.CSSProperties =
            a.tone === 'danger'
              ? { background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)', border: '1px solid var(--alert-danger-text)' }
              : alreadyDone
                ? { background: 'var(--shell-surface-hi)', color: 'var(--canvas-muted)', border: '1px solid var(--canvas-border)' }
                : { background: 'var(--primary)', color: 'var(--primary-text)' }
          return (
            <button
              key={a.sub_status}
              type="button"
              onClick={() => updateStatus(a.sub_status)}
              disabled={!!busy || alreadyDone}
              className="text-xs font-medium rounded-md px-2.5 py-2 text-center disabled:opacity-60 transition-opacity"
              style={toneStyle}
              title={alreadyDone ? 'Already completed' : a.label}
            >
              {isBusy ? 'Saving…' : <><span className="mr-1">{a.icon}</span>{a.label}</>}
            </button>
          )
        })}
        <Link
          href={`/tickets/${ticket.id}`}
          className="text-xs font-medium rounded-md px-2.5 py-2 text-center border"
          style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}
        >
          📎 Upload Proofs
        </Link>
      </div>

      {error && (
        <div className="text-xs mt-2 px-2 py-1 rounded"
             style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)' }}>
          {error}
        </div>
      )}
      {flash && !error && (
        <div className="text-xs mt-2" style={{ color: 'var(--green-600)' }}>
          {flash}
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

// ─── New-offer alert (beep + browser notification + modal) ──────────────────
// Plays a short Web Audio beep — no asset files needed.
function playBeep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, ctx.currentTime)
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55)
    o.connect(g); g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.6)
    // Close context shortly after so we don't accumulate audio graphs.
    setTimeout(() => ctx.close().catch(() => {}), 900)
  } catch { /* audio blocked; silent fallback */ }
}

type PolledOffer = {
  assignment_id: string
  expires_at: string
  ticket: {
    id: string
    ticket_number: string
    title: string | null
    original_issue_text: string | null
    location_text: string | null
    severity: string | null
  } | null
} | null

function OfferAlertModal({ offer, onDismiss, onAccept, onReject }: {
  offer: NonNullable<PolledOffer>
  onDismiss: () => void
  onAccept: () => void
  onReject: () => void
}) {
  const t = offer.ticket
  const { display, isUrgent, expired } = useCountdown(offer.expires_at)
  if (!t) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card p-5 w-full max-w-md space-y-4"
        style={{
          background: 'var(--canvas-surface)',
          borderLeft: '4px solid var(--primary)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
              🔔 New ticket offered to you
            </div>
            <div className="text-base font-semibold mt-1" style={{ color: 'var(--canvas-text)' }}>
              {t.title ?? t.original_issue_text?.slice(0, 100) ?? 'Untitled ticket'}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <code className="text-[11px] font-mono" style={{ color: 'var(--canvas-muted)' }}>
                {t.ticket_number}
              </code>
              {t.severity && <SeverityBadge severity={t.severity as any} />}
            </div>
          </div>
          <div className="flex flex-col items-center min-w-[64px]">
            <div
              className="text-xl font-mono font-bold tabular-nums"
              style={{ color: expired || isUrgent ? 'var(--alert-danger-text)' : 'var(--primary)' }}
            >
              {expired ? '0:00' : display}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              to respond
            </div>
          </div>
        </div>

        {t.location_text && (
          <div className="text-sm" style={{ color: 'var(--canvas-text-dim)' }}>
            📍 {t.location_text}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            ✓ Accept
          </button>
          <button
            onClick={onReject}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}
          >
            ✕ Reject
          </button>
        </div>
        <button
          onClick={onDismiss}
          className="w-full text-xs underline-offset-2 hover:underline"
          style={{ color: 'var(--canvas-muted)' }}
        >
          Review in page below
        </button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function WorkerQueue({ workerId, offered, activeTickets }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(() => router.refresh())
  }, [router])

  // Polling for new offers ---------------------------------------------------
  // Only the alert modal depends on this — the server-rendered OfferedCard
  // below always reflects the authoritative state after router.refresh().
  const [polledOffer, setPolledOffer] = useState<PolledOffer>(offered
    ? { assignment_id: offered.id, expires_at: offered.expires_at, ticket: offered.ticket as any }
    : null)
  const [alertOpen, setAlertOpen] = useState(false)
  const lastAlertedIdRef = useRef<string | null>(offered?.id ?? null)

  // Ask for Notification permission once, on first interaction-ish moment.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      // Firing a request before user interaction can silently fail on some
      // browsers, but it's safe to call — worst case, nothing happens.
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch('/api/worker/current-offer', { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        const offer: PolledOffer = body?.offer ?? null
        setPolledOffer(offer)
        // Fire alert only when the *assignment id* changes to a new one —
        // not on first mount if the user already had this offer, and never
        // repeatedly for the same offer.
        if (offer && offer.assignment_id !== lastAlertedIdRef.current) {
          lastAlertedIdRef.current = offer.assignment_id
          setAlertOpen(true)
          playBeep()
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              const t = offer.ticket
              new Notification('New Vocal ticket offered to you', {
                body: t?.title ?? t?.original_issue_text?.slice(0, 120) ?? 'Tap to review',
                tag:  `offer-${offer.assignment_id}`,
              })
            }
          } catch { /* notifications blocked — ignore */ }
        } else if (!offer) {
          // Offer was withdrawn/expired server-side — clear the tracker so
          // if a *new* one comes in later, it still fires.
          if (lastAlertedIdRef.current) lastAlertedIdRef.current = null
          setAlertOpen(false)
        }
      } catch { /* network blip — next tick will retry */ }
    }
    // Run once immediately so an offer that arrived between SSR and hydrate
    // is still detected, then poll.
    tick()
    const id = setInterval(tick, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function modalAccept() {
    const ticketId = polledOffer?.ticket?.id
    if (!ticketId) return
    try {
      await fetch('/api/tickets/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId }),
      })
    } finally {
      setAlertOpen(false)
      refresh()
    }
  }

  function modalReject() {
    // Reject needs a reason — hand off to the inline OfferedCard which
    // already has the reason-picker UI. Closing the modal reveals it.
    setAlertOpen(false)
  }

  return (
    <div className="space-y-6">
      {alertOpen && polledOffer && (
        <OfferAlertModal
          offer={polledOffer}
          onDismiss={() => setAlertOpen(false)}
          onAccept={modalAccept}
          onReject={modalReject}
        />
      )}
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
            {activeTickets.map(t => <ActiveCard key={t.id} ticket={t} onChanged={refresh} />)}
          </div>
        )}
      </section>
    </div>
  )
}
