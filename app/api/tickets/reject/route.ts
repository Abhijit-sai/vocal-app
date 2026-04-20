/**
 * POST /api/tickets/reject
 *
 * Worker rejects an offered ticket with a reason.
 * After rejection, the ticket is moved back to triage for next attempt.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { listCandidateWorkers, offerTicketToWorker } from '@/services/assignmentService'

const VALID_REJECTION_REASONS = [
  'too_far', 'irrelevant', 'conflict_of_interest',
  'safety_concern', 'outside_jurisdiction', 'fake_spam',
]

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const { ticket_id, reason } = await req.json()
  if (!ticket_id || !reason) {
    return Response.json({ error: 'ticket_id and reason required' }, { status: 400 })
  }

  if (!VALID_REJECTION_REASONS.includes(reason)) {
    return Response.json({ error: 'Invalid rejection reason' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: assignment } = await supabase
    .from('ticket_assignments')
    .select('id, ticket_id, worker_user_id, status')
    .eq('ticket_id', ticket_id)
    .eq('worker_user_id', user.id)
    .eq('is_current', true)
    .single()

  if (!assignment || assignment.status !== 'offered') {
    return Response.json({ error: 'No active offer found' }, { status: 404 })
  }

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, stage, sub_status, assignment_attempt_count')
    .eq('id', ticket_id)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Update assignment record
  await supabase
    .from('ticket_assignments')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      responded_at: now,
      is_current: false,
    })
    .eq('id', assignment.id)

  const newAttemptCount = (ticket.assignment_attempt_count ?? 0) + 1

  // Move ticket back to triage/reassignment
  await supabase
    .from('tickets')
    .update({
      stage: 'to_do',
      sub_status: 'reassignment_pending',
      owner_user_id: null,
      needs_triage: true,
      assignment_attempt_count: newAttemptCount,
      last_updated_by_user_id: user.id,
      updated_at: now,
    })
    .eq('id', ticket_id)

  // Stage history
  await supabase.from('ticket_stage_history').insert({
    ticket_id,
    from_stage: ticket.stage,
    to_stage: 'to_do',
    from_sub_status: ticket.sub_status,
    to_sub_status: 'reassignment_pending',
    changed_by: user.id,
    change_reason: `Worker rejected: ${reason}`,
    system_action: false,
  })

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'ticket_rejected',
    entity_type: 'ticket',
    entity_id: ticket_id,
    actor_type: 'user',
    actor_user_id: user.id,
    metadata_json: { reason, attempt_count: newAttemptCount },
  })

  // Immediate re-offer: don't wait on the cron tick. Pick the next nearest
  // eligible worker (listCandidateWorkers already excludes workers who have
  // been offered this ticket via ticket_assignments). If no one is left,
  // leave the ticket in reassignment_pending for central support to handle.
  let reoffered: { worker_id: string; assignment_id: string; expires_at: string } | null = null
  try {
    const candidates = await listCandidateWorkers(ticket_id)
    const next = candidates[0]
    if (next) {
      const offer = await offerTicketToWorker({
        ticketId: ticket_id,
        workerId: next.id,
        assignedByUserId: null,
        reason: `Auto re-offer after rejection (${reason})`,
      })
      if (offer.ok) {
        reoffered = {
          worker_id: next.id,
          assignment_id: offer.assignmentId,
          expires_at: offer.expiresAt,
        }
      }
    }
  } catch {
    // Re-offer is best-effort. The cron will pick this up on the next tick.
  }

  return Response.json({ ok: true, reoffered })
}
