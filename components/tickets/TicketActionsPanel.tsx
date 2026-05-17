'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Ticket } from '@/types/database'
import { AmplifyLaunchButton } from '@/components/amplify/AmplifyLaunchButton'

interface CurrentUser {
  id: string
  role: string
}

interface TicketActionsPanelProps {
  ticket: Ticket & {
    territories: { id: string; name: string } | null
    users: { id: string; full_name: string; phone: string | null; email: string | null } | null
  }
  currentUser: CurrentUser
  assignment: {
    id: string
    status: string
    worker_user_id: string
    users: { id: string; full_name: string } | null
    expires_at?: string | null
  } | null
  workers: Array<{ id: string; full_name: string }>
}

// ---------------------------------------------------------------------------
// Sub-status catalog — grouped by parent stage for clearer UI.
// Keep in sync with SUB_STATUS_STAGE_MAP in /api/tickets/status/route.ts
// ---------------------------------------------------------------------------
type SubStatusOption = { value: string; label: string }
type StageGroup = { stage: 'to_do' | 'in_progress' | 'on_hold' | 'closed'; label: string; options: SubStatusOption[] }

const STAGE_GROUPS: StageGroup[] = [
  {
    stage: 'to_do',
    label: 'To Do',
    options: [
      { value: 'new_awaiting_triage',         label: 'New – Awaiting Triage' },
      { value: 'incomplete_information',      label: 'Incomplete Information' },
      { value: 'needs_location_validation',   label: 'Needs Location Validation' },
      { value: 'ready_for_assignment',        label: 'Ready for Assignment' },
      { value: 'critical_immediate_attention',label: 'Critical – Immediate Attention' },
    ],
  },
  {
    stage: 'in_progress',
    label: 'In Progress',
    options: [
      { value: 'assigned_awaiting_acceptance', label: 'Assigned to Ground Staff (awaiting acceptance)' },
      { value: 'accepted_by_worker',           label: 'Accepted by Worker' },
      { value: 'citizen_contacted',            label: 'Citizen Contacted' },
      { value: 'field_verification_in_progress', label: 'Field Verification in Progress' },
      { value: 'action_plan_created',          label: 'Action Plan Created' },
      { value: 'escalated_to_authority',       label: 'Escalated to Authority' },
      { value: 'escalated_to_internal_leadership', label: 'Escalated to Internal Leadership' },
      { value: 'escalated_to_media_support',   label: 'Escalated to Media Support' },
      { value: 'waiting_on_external_action',   label: 'Waiting on External Action' },
    ],
  },
  {
    stage: 'on_hold',
    label: 'On Hold',
    options: [
      { value: 'awaiting_citizen_response',   label: 'Awaiting Citizen Response' },
      { value: 'awaiting_documents_evidence', label: 'Awaiting Documents / Evidence' },
      { value: 'unsafe_to_intervene',         label: 'Unsafe to Intervene' },
      { value: 'outside_jurisdiction_review', label: 'Outside Jurisdiction Review' },
      { value: 'suspected_fake_spam_review',  label: 'Suspected Fake / Spam Review' },
      { value: 'reassignment_pending',        label: 'Reassignment Pending' },
      { value: 'sla_breach_escalation_queue', label: 'SLA Breach – Escalation Queue' },
    ],
  },
  {
    stage: 'closed',
    label: 'Closed',
    options: [
      { value: 'resolved_by_organization',   label: 'Resolved by Organization' },
      { value: 'resolved_by_external_party', label: 'Resolved by External Party' },
      { value: 'unable_to_support',          label: 'Unable to Support' },
      { value: 'duplicate_merged_manually',  label: 'Duplicate / Merged Manually' },
      { value: 'fake_invalid',               label: 'Fake / Invalid' },
      { value: 'citizen_unresponsive_closed',label: 'Citizen Unresponsive – Closed' },
      { value: 'closed_by_central_support',  label: 'Closed by Central Support' },
      { value: 'closed_with_advice_only',    label: 'Closed with Advice Only' },
    ],
  },
]

const WORKER_ALLOWED = new Set([
  'accepted_by_worker', 'citizen_contacted', 'field_verification_in_progress',
  'action_plan_created', 'escalated_to_authority', 'awaiting_citizen_response',
  'awaiting_documents_evidence',
])

/** Sub-statuses that require picking a specific worker when chosen. */
const SUB_STATUSES_REQUIRING_WORKER = new Set(['assigned_awaiting_acceptance'])

function findStageForSubStatus(sub: string): StageGroup['stage'] | null {
  for (const g of STAGE_GROUPS) {
    if (g.options.some(o => o.value === sub)) return g.stage
  }
  return null
}

// ---------------------------------------------------------------------------

export function TicketActionsPanel({
  ticket,
  currentUser,
  assignment,
  workers,
}: TicketActionsPanelProps) {
  const [noteContent, setNoteContent] = useState('')
  const [noteImage, setNoteImage] = useState<File | null>(null)
  const [noteImagePreview, setNoteImagePreview] = useState<string | null>(null)
  const [submittingNote, setSubmittingNote] = useState(false)
  const [noteType, setNoteType] = useState<'general' | 'worker_update' | 'escalation' | 'closure'>('general')
  const [noteIsInternal, setNoteIsInternal] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [newSubStatus, setNewSubStatus] = useState(ticket.sub_status)
  // Worker picked for a status-change that requires one (e.g. assigned_awaiting_acceptance)
  const [statusWorker, setStatusWorker] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function refreshAfter(_msg?: string) {
    setTimeout(() => {
      setSuccess(null)
      startTransition(() => router.refresh())
    }, 600)
  }

  const isPrivileged = ['super_admin', 'central_support'].includes(currentUser.role)
  const isWorker = currentUser.role === 'ground_worker'
  const isOwner = ticket.owner_user_id === currentUser.id

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteContent.trim()) return
    setSubmittingNote(true)
    setError(null)
    try {
      let res: Response
      if (noteImage) {
        // Use multipart/form-data so the image piggybacks on the same request.
        const fd = new FormData()
        fd.set('ticket_id', ticket.id)
        fd.set('content', noteContent.trim())
        fd.set('note_type', noteType)
        fd.set('is_internal', String(noteIsInternal))
        fd.set('image', noteImage)
        res = await fetch('/api/tickets/notes', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/tickets/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_id: ticket.id,
            content: noteContent.trim(),
            note_type: noteType,
            is_internal: noteIsInternal,
          }),
        })
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed')
      setNoteContent('')
      clearNoteImage()
      // If the image had an upload problem but the note saved, surface it.
      if (body.attachment && body.attachment.ok === false) {
        setSuccess(`Note added — but: ${body.attachment.error}`)
      } else {
        setSuccess(noteImage ? 'Note added with image' : 'Note added')
      }
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingNote(false)
    }
  }

  function onPickNoteImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setNoteImage(f)
    if (noteImagePreview) URL.revokeObjectURL(noteImagePreview)
    setNoteImagePreview(f ? URL.createObjectURL(f) : null)
  }
  function clearNoteImage() {
    if (noteImagePreview) URL.revokeObjectURL(noteImagePreview)
    setNoteImage(null)
    setNoteImagePreview(null)
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedWorker) return
    setAssigning(true)
    setError(null)
    try {
      const res = await fetch('/api/tickets/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, worker_id: selectedWorker }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setSuccess('Assigned')
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAssigning(false)
    }
  }

  async function handleAutoAssign() {
    setAutoAssigning(true)
    setError(null)
    try {
      const res = await fetch('/api/tickets/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed')
      setSuccess(`Offered to ${body.worker?.full_name ?? 'nearest worker'}`)
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAutoAssigning(false)
    }
  }

  async function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // If the new sub-status requires a worker selection, route through
    // /api/tickets/assign which sets both ownership + sub_status atomically.
    if (SUB_STATUSES_REQUIRING_WORKER.has(newSubStatus)) {
      if (!statusWorker) {
        setError('Pick a worker to assign this ticket to.')
        return
      }
      setUpdatingStatus(true)
      try {
        const res = await fetch('/api/tickets/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id: ticket.id, worker_id: statusWorker }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
        setSuccess('Assigned & status updated')
        refreshAfter('done')
      } catch (err: any) {
        setError(err.message)
      } finally {
        setUpdatingStatus(false)
      }
      return
    }

    setUpdatingStatus(true)
    try {
      const res = await fetch('/api/tickets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, sub_status: newSubStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setSuccess('Status updated')
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleAccept() {
    setError(null)
    try {
      const res = await fetch('/api/tickets/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setSuccess('Accepted')
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleReject(reason: string) {
    setError(null)
    try {
      const res = await fetch('/api/tickets/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, reason }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setSuccess('Rejected')
      refreshAfter('done')
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Build the status dropdown — grouped by stage. Workers only see allowed
  // forward-transition options; privileged users see everything.
  const visibleGroups: StageGroup[] = isPrivileged
    ? STAGE_GROUPS
    : STAGE_GROUPS.map(g => ({
        ...g,
        options: g.options.filter(o => WORKER_ALLOWED.has(o.value)),
      })).filter(g => g.options.length > 0)

  const newSubStage = findStageForSubStatus(newSubStatus)
  const requiresWorker = SUB_STATUSES_REQUIRING_WORKER.has(newSubStatus)

  return (
    <div className="p-4 space-y-5">
      {error && (
        <div
          className="text-xs p-2 rounded-md"
          style={{
            background: 'var(--alert-danger-bg)',
            color: 'var(--alert-danger-text)',
            borderLeft: '3px solid var(--alert-danger-border)',
          }}
        >{error}</div>
      )}
      {success && (
        <div
          className="text-xs p-2 rounded-md"
          style={{
            background: 'var(--alert-success-bg)',
            color: 'var(--alert-success-text)',
            borderLeft: '3px solid var(--alert-success-border)',
          }}
        >✓ {success}</div>
      )}

      {/* Assignment info */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: 'var(--canvas-muted)' }}>
          Assignment
        </h3>
        {assignment ? (
          <div className="text-sm" style={{ color: 'var(--canvas-text)' }}>
            <div className="font-medium">{assignment.users?.full_name ?? 'Unknown'}</div>
            <div className="text-xs capitalize mt-0.5" style={{ color: 'var(--canvas-muted)' }}>
              {assignment.status.replace('_', ' ')}
              {assignment.status === 'offered' && assignment.expires_at && (
                <> — expires {new Date(assignment.expires_at).toLocaleTimeString('en-IN')}</>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--canvas-muted)' }}>Unassigned</div>
        )}
      </div>

      {/* Worker accept/reject (only when this ticket is offered to me) */}
      {isWorker && assignment && assignment.worker_user_id === currentUser.id && assignment.status === 'offered' && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--canvas-muted)' }}>Assignment Offer</h3>
          <button
            onClick={handleAccept}
            className="w-full py-2 rounded-md text-sm font-medium"
            style={{ background: 'var(--green-600)', color: '#fff' }}
          >Accept Ticket</button>
          <select
            onChange={e => e.target.value && handleReject(e.target.value)}
            defaultValue=""
            className="w-full py-2 px-3 rounded text-xs border"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-muted)' }}
          >
            <option value="" disabled>Reject (select reason)...</option>
            <option value="too_far">Too far</option>
            <option value="irrelevant">Irrelevant</option>
            <option value="conflict_of_interest">Conflict of interest</option>
            <option value="safety_concern">Safety concern</option>
            <option value="outside_jurisdiction">Outside jurisdiction</option>
            <option value="fake_spam">Fake / Spam</option>
          </select>
        </div>
      )}

      {/* Manual assignment (central support) */}
      {isPrivileged && workers.length > 0 && (
        <form onSubmit={handleAssign} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--canvas-muted)' }}>Assign Worker</h3>
          <select
            value={selectedWorker}
            onChange={e => setSelectedWorker(e.target.value)}
            className="w-full py-2 px-3 rounded text-xs border"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
          >
            <option value="">Select worker...</option>
            {workers.map(w => (<option key={w.id} value={w.id}>{w.full_name}</option>))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!selectedWorker || assigning}
              className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >{assigning ? 'Assigning…' : 'Assign'}</button>
            <button
              type="button"
              onClick={handleAutoAssign}
              disabled={autoAssigning}
              title="Pick the nearest available worker automatically"
              className="py-2 px-3 rounded-md text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--slate-100)', color: 'var(--canvas-text)', border: '1px solid var(--canvas-border)' }}
            >{autoAssigning ? '…' : 'Auto'}</button>
          </div>
        </form>
      )}

      {/* Status update — grouped by parent stage */}
      {(isPrivileged || (isWorker && isOwner)) && (
        <form onSubmit={handleStatusUpdate} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--canvas-muted)' }}>Update Status</h3>
            {newSubStage && (
              <span
                className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: 'var(--slate-100)', color: 'var(--canvas-text-dim)' }}
                title="This sub-status falls under this parent stage"
              >{newSubStage.replace('_', ' ')}</span>
            )}
          </div>
          <select
            value={newSubStatus}
            onChange={e => setNewSubStatus(e.target.value as any)}
            className="w-full py-2 px-3 rounded text-xs border"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
          >
            {visibleGroups.map(g => (
              <optgroup key={g.stage} label={g.label}>
                {g.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* If this sub-status requires a worker, show a picker inline */}
          {requiresWorker && isPrivileged && (
            <div className="space-y-1">
              <label className="text-[11px]" style={{ color: 'var(--canvas-text-dim)' }}>
                Pick a worker to offer this ticket to:
              </label>
              <select
                value={statusWorker}
                onChange={e => setStatusWorker(e.target.value)}
                className="w-full py-2 px-3 rounded text-xs border"
                style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
              >
                <option value="">Select worker...</option>
                {workers.map(w => (<option key={w.id} value={w.id}>{w.full_name}</option>))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={
              updatingStatus ||
              (newSubStatus === ticket.sub_status && !requiresWorker) ||
              (requiresWorker && !statusWorker)
            }
            className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--slate-700)', color: '#fff' }}
          >{updatingStatus ? 'Saving…' : requiresWorker ? 'Assign & Update' : 'Update Status'}</button>
        </form>
      )}

      {/* Add note */}
      {(isPrivileged || (isWorker && isOwner)) && (
        <form onSubmit={handleAddNote} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--canvas-muted)' }}>Add Note</h3>
          <select
            value={noteType}
            onChange={e => setNoteType(e.target.value as any)}
            className="w-full py-1.5 px-3 rounded text-xs border"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
          >
            <option value="general">General Note</option>
            <option value="worker_update">Worker Update</option>
            <option value="escalation">Escalation Note</option>
            {isPrivileged && <option value="closure">Closure Note</option>}
          </select>
          <textarea
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            placeholder="Add a note..."
            rows={4}
            className="w-full py-2 px-3 rounded text-xs border resize-none outline-none focus:ring-1 focus:ring-blue-400"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text)', background: 'white' }}
          />
          <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--canvas-text-dim)' }}>
            <input type="checkbox" checked={noteIsInternal} onChange={e => setNoteIsInternal(e.target.checked)} />
            Internal only (hide from citizen)
          </label>

          {/* Image attachment (optional) */}
          <div className="space-y-1.5">
            {!noteImage ? (
              <label className="flex items-center gap-2 text-[11px] cursor-pointer px-3 py-2 rounded border border-dashed hover:bg-gray-50"
                style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Attach photo (optional)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
                  className="hidden"
                  onChange={onPickNoteImage}
                />
              </label>
            ) : (
              <div className="flex items-start gap-2 p-2 rounded border" style={{ borderColor: 'var(--canvas-border)' }}>
                {noteImagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={noteImagePreview} alt="" className="w-16 h-16 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] truncate" style={{ color: 'var(--canvas-text)' }}>{noteImage.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--canvas-muted)' }}>
                    {(noteImage.size / 1024).toFixed(0)} KB
                  </div>
                  <button
                    type="button"
                    onClick={clearNoteImage}
                    className="text-[11px] mt-1 underline-offset-2 hover:underline"
                    style={{ color: 'var(--alert-danger-text)' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!noteContent.trim() || submittingNote}
            className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--shell-bg)', color: '#fff' }}
          >{submittingNote ? 'Adding…' : (noteImage ? 'Add Note + Photo' : 'Add Note')}</button>
        </form>
      )}

      {isPrivileged && <AmplifyLaunchButton ticketId={ticket.id} />}
    </div>
  )
}
