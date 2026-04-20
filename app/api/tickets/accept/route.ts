/**
 * POST /api/tickets/accept
 *
 * Worker accepts an offered ticket.
 * Rules:
 * - Only the offered worker can accept
 * - Assignment must be current and in 'offered' state
 * - Writes citizen identity reveal event if ticket is not anonymous
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { notifyCitizenOfTicketUpdate } from '@/services/citizenNotifier'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const { ticket_id } = await req.json()
  if (!ticket_id) return Response.json({ error: 'ticket_id required' }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  // Verify assignment exists and is offered to this worker
  const { data: assignment } = await supabase
    .from('ticket_assignments')
    .select('id, ticket_id, worker_user_id, status, expires_at')
    .eq('ticket_id', ticket_id)
    .eq('worker_user_id', user.id)
    .eq('is_current', true)
    .single()

  if (!assignment) {
    return Response.json({ error: 'No active assignment found for this ticket' }, { status: 404 })
  }

  if (assignment.status !== 'offered') {
    return Response.json({ error: 'Assignment is not in offered state' }, { status: 422 })
  }

  // Check expiry
  if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
    return Response.json({ error: 'Assignment offer has expired' }, { status: 422 })
  }

  // Verify ticket org matches user org
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, stage, sub_status, anonymous_flag, citizen_id')
    .eq('id', ticket_id)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Pull org SLA policy — first_contact and resolution windows are in hours.
  // Default to (1h, 24h) if no settings row exists (matches migration 001).
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('first_contact_sla_hours, resolution_plan_sla_hours')
    .eq('organization_id', user.organization_id)
    .maybeSingle()
  const firstContactHours = orgSettings?.first_contact_sla_hours ?? 1
  const resolutionHours   = orgSettings?.resolution_plan_sla_hours ?? 24
  const slaFirstContactDueAt = new Date(Date.now() + firstContactHours * 60 * 60 * 1000).toISOString()
  const slaResolutionDueAt   = new Date(Date.now() + resolutionHours   * 60 * 60 * 1000).toISOString()

  // Update assignment to accepted
  await supabase
    .from('ticket_assignments')
    .update({ status: 'accepted', responded_at: now })
    .eq('id', assignment.id)

  // Update ticket. Acceptance starts the downstream SLA clocks
  // (first-contact + resolution). Clear sla_breached_flag in case the
  // ticket was previously bounced for an expired offer.
  await supabase
    .from('tickets')
    .update({
      stage: 'in_progress',
      sub_status: 'accepted_by_worker',
      accepted_at: now,
      sla_first_contact_due_at: slaFirstContactDueAt,
      sla_resolution_due_at:    slaResolutionDueAt,
      sla_breached_flag:        false,
      last_updated_by_user_id:  user.id,
      updated_at:               now,
    })
    .eq('id', ticket_id)

  // Stage history
  await supabase.from('ticket_stage_history').insert({
    ticket_id,
    from_stage: ticket.stage,
    to_stage: 'in_progress',
    from_sub_status: ticket.sub_status,
    to_sub_status: 'accepted_by_worker',
    changed_by: user.id,
    change_reason: 'Worker accepted ticket',
    system_action: false,
  })

  // Identity reveal event for non-anonymous tickets
  if (!ticket.anonymous_flag && ticket.citizen_id) {
    await supabase
      .from('tickets')
      .update({ citizen_identity_revealed_at: now, citizen_identity_revealed_by: user.id })
      .eq('id', ticket_id)

    await supabase.from('audit_logs').insert({
      organization_id: user.organization_id,
      event_type: 'citizen_identity_revealed',
      entity_type: 'ticket',
      entity_id: ticket_id,
      actor_type: 'user',
      actor_user_id: user.id,
      metadata_json: { reason: 'worker_accepted', citizen_id: ticket.citizen_id },
    })
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'ticket_accepted',
    entity_type: 'ticket',
    entity_id: ticket_id,
    actor_type: 'user',
    actor_user_id: user.id,
  })

  notifyCitizenOfTicketUpdate({
    ticketId: ticket_id,
    newSubStatus: 'accepted_by_worker',
    newStage: 'in_progress',
    workerUserId: user.id,
    key: 'accepted_by_worker',
  }).catch(() => {})

  return Response.json({ ok: true })
}
