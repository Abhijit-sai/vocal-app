/**
 * POST /api/tickets/status
 *
 * Updates ticket sub-status.
 *
 * Rules:
 * - Workers can only move forward (enforced by allowed sub_status list)
 * - Only central support / super admin can move backward
 * - Closure requires prior citizen_contacted and a closure note
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { notifyCitizenOfTicketUpdate } from '@/services/citizenNotifier'

// Maps sub_status to its parent stage
const SUB_STATUS_STAGE_MAP: Record<string, string> = {
  new_awaiting_triage:            'to_do',
  incomplete_information:         'to_do',
  needs_location_validation:      'to_do',
  ready_for_assignment:           'to_do',
  critical_immediate_attention:   'to_do',
  reassignment_pending:           'on_hold',
  assigned_awaiting_acceptance:   'in_progress',
  accepted_by_worker:             'in_progress',
  citizen_contacted:              'in_progress',
  field_verification_in_progress: 'in_progress',
  action_plan_created:            'in_progress',
  escalated_to_authority:         'in_progress',
  escalated_to_internal_leadership: 'in_progress',
  escalated_to_media_support:     'in_progress',
  support_required_from_specialist: 'in_progress',
  waiting_on_external_action:     'in_progress',
  awaiting_citizen_response:      'on_hold',
  awaiting_documents_evidence:    'on_hold',
  unsafe_to_intervene:            'on_hold',
  outside_jurisdiction_review:    'on_hold',
  suspected_fake_spam_review:     'on_hold',
  sla_breach_escalation_queue:    'on_hold',
  resolved_by_organization:       'closed',
  resolved_by_external_party:     'closed',
  unable_to_support:              'closed',
  duplicate_merged_manually:      'closed',
  fake_invalid:                   'closed',
  citizen_unresponsive_closed:    'closed',
  closed_by_central_support:      'closed',
  closed_with_advice_only:        'closed',
}

// Worker-accessible sub_statuses (forward movement only)
const WORKER_ALLOWED_SUB_STATUSES = new Set([
  'accepted_by_worker',
  'citizen_contacted',
  'field_verification_in_progress',
  'action_plan_created',
  'escalated_to_authority',
  'awaiting_citizen_response',
  'awaiting_documents_evidence',
])

const STAGE_ORDER: Record<string, number> = {
  to_do: 0, in_progress: 1, on_hold: 2, closed: 3
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const { ticket_id, sub_status } = await req.json()
  if (!ticket_id || !sub_status) {
    return Response.json({ error: 'ticket_id and sub_status required' }, { status: 400 })
  }

  const newStage = SUB_STATUS_STAGE_MAP[sub_status]
  if (!newStage) {
    return Response.json({ error: 'Invalid sub_status value' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const roleName = (user as any).roles?.name
  const isPrivileged = ['super_admin', 'central_support'].includes(roleName)
  const isWorker = roleName === 'ground_worker'

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, stage, sub_status, owner_user_id, first_contacted_at')
    .eq('id', ticket_id)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Ownership check for workers
  if (isWorker && ticket.owner_user_id !== user.id) {
    return Response.json({ error: 'You are not the owner of this ticket' }, { status: 403 })
  }

  // Workers can only use allowed sub_statuses
  if (isWorker && !WORKER_ALLOWED_SUB_STATUSES.has(sub_status)) {
    return Response.json({ error: 'Status not allowed for workers' }, { status: 403 })
  }

  // Backward movement check
  const currentStageOrder = STAGE_ORDER[ticket.stage] ?? 0
  const newStageOrder = STAGE_ORDER[newStage] ?? 0
  if (!isPrivileged && newStageOrder < currentStageOrder) {
    return Response.json({
      error: 'Only central support can move tickets backward in the stage flow'
    }, { status: 403 })
  }

  // Closure validation
  if (newStage === 'closed') {
    if (!isPrivileged) {
      return Response.json({ error: 'Only central support can close tickets' }, { status: 403 })
    }

    // Check citizen_contacted has occurred
    const { data: contacted } = await supabase
      .from('ticket_stage_history')
      .select('id')
      .eq('ticket_id', ticket_id)
      .eq('to_sub_status', 'citizen_contacted')
      .limit(1)
      .single()

    if (!contacted) {
      return Response.json({
        error: 'Cannot close: citizen_contacted sub-status must be reached before closure'
      }, { status: 422 })
    }

    // Check closure note exists
    const { data: closureNote } = await supabase
      .from('ticket_notes')
      .select('id')
      .eq('ticket_id', ticket_id)
      .eq('note_type', 'closure')
      .limit(1)
      .single()

    if (!closureNote) {
      return Response.json({
        error: 'Cannot close: a closure note is required before closing the ticket'
      }, { status: 422 })
    }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    stage: newStage,
    sub_status,
    last_updated_by_user_id: user.id,
    updated_at: now,
  }

  // Track first_contacted_at
  if (sub_status === 'citizen_contacted' && !ticket.first_contacted_at) {
    updates.first_contacted_at = now
  }

  // Set closed_at
  if (newStage === 'closed') {
    updates.closed_at = now
  }

  await supabase.from('tickets').update(updates).eq('id', ticket_id)

  // Stage history
  await supabase.from('ticket_stage_history').insert({
    ticket_id,
    from_stage: ticket.stage,
    to_stage: newStage,
    from_sub_status: ticket.sub_status,
    to_sub_status: sub_status,
    changed_by: user.id,
    change_reason: 'Status updated by user',
    system_action: false,
  })

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'ticket_status_changed',
    entity_type: 'ticket',
    entity_id: ticket_id,
    actor_type: 'user',
    actor_user_id: user.id,
    old_value_json: { stage: ticket.stage, sub_status: ticket.sub_status },
    new_value_json: { stage: newStage, sub_status },
  })

  // Fire-and-forget citizen notification (never throws, never blocks).
  notifyCitizenOfTicketUpdate({
    ticketId: ticket_id,
    prevSubStatus: ticket.sub_status as any,
    newSubStatus: sub_status,
    newStage,
    workerUserId: (ticket as any).owner_user_id ?? null,
  }).catch(() => {})

  return Response.json({ ok: true })
}
