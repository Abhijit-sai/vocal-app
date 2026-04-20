/**
 * Assignment service.
 *
 * Core responsibilities:
 *   - findNearestAvailableWorker: pick the closest active ground_worker in
 *     the ticket's territory who hasn't already been offered this ticket.
 *   - offerTicketToWorker: write a ticket_assignments row + ticket state
 *     change + stage history + audit log. Honors org's acceptance_sla_minutes.
 *   - expireStaleAssignments: called by the cron — flips expired offers,
 *     invokes reoffer logic up to max_assignment_attempts times, else
 *     bounces back to triage as sla_breach_escalation_queue.
 *
 * All writes use the service role client; access control is the caller's
 * job (cron has no user context).
 */

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { notifyCitizenOfTicketUpdate } from './citizenNotifier'

const GROUND_WORKER_ROLE_ID = '00000000-0000-0000-0000-000000000005'

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CandidateWorker {
  id: string
  full_name: string
  distance_km: number | null
}

/**
 * Return all eligible ground workers for a ticket, sorted by distance to the
 * ticket's coordinates (falls back to territory membership when ticket has
 * no coordinates). Excludes workers already in `excludeUserIds`.
 */
export async function listCandidateWorkers(ticketId: string): Promise<CandidateWorker[]> {
  const supabase = createSupabaseServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, territory_id, latitude, longitude, offered_worker_ids')
    .eq('id', ticketId)
    .single()
  if (!ticket) return []

  const excluded = new Set<string>((ticket.offered_worker_ids as string[] | null) ?? [])

  // Fetch all active ground workers in the org. We filter by territory in
  // memory because user_territories is a join table and PostgREST doesn't
  // let us filter parent by a child's field directly.
  const { data: workers } = await supabase
    .from('users')
    .select(`
      id, full_name,
      user_territories(
        territory_id,
        territories(id, centroid_lat, centroid_lng)
      )
    `)
    .eq('organization_id', ticket.organization_id)
    .eq('role_id', GROUND_WORKER_ROLE_ID)
    .eq('active', true)

  if (!workers) return []

  const candidates: CandidateWorker[] = []
  const hasTerritoryFilter = !!ticket.territory_id
  const hasCoords = ticket.latitude != null && ticket.longitude != null

  for (const w of workers as any[]) {
    if (excluded.has(w.id)) continue
    const territories = (w.user_territories ?? []) as Array<{
      territory_id: string
      territories: { centroid_lat: number | null; centroid_lng: number | null } | null
    }>

    if (hasTerritoryFilter && !territories.some(t => t.territory_id === ticket.territory_id)) {
      continue
    }

    let distance: number | null = null
    if (hasCoords) {
      const coords = territories
        .map(t => t.territories)
        .filter(t => t?.centroid_lat != null && t?.centroid_lng != null) as Array<{ centroid_lat: number; centroid_lng: number }>
      if (coords.length) {
        distance = Math.min(...coords.map(c =>
          haversineKm(
            { lat: ticket.latitude as number, lng: ticket.longitude as number },
            { lat: c.centroid_lat, lng: c.centroid_lng },
          )
        ))
      }
    }

    candidates.push({ id: w.id, full_name: w.full_name, distance_km: distance })
  }

  // Sort: known distance first (ascending), unknowns last.
  candidates.sort((a, b) => {
    if (a.distance_km == null && b.distance_km == null) return 0
    if (a.distance_km == null) return 1
    if (b.distance_km == null) return -1
    return a.distance_km - b.distance_km
  })

  return candidates
}

/**
 * Find the single nearest eligible worker (or null if none).
 */
export async function findNearestAvailableWorker(ticketId: string): Promise<CandidateWorker | null> {
  const list = await listCandidateWorkers(ticketId)
  return list[0] ?? null
}

/**
 * Read acceptance SLA (minutes) from organization_settings. Falls back to 2
 * for testing if no row is found.
 */
export async function getAcceptanceSlaMinutes(organizationId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('organization_settings')
    .select('acceptance_sla_minutes')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data?.acceptance_sla_minutes ?? 2
}

/**
 * Create a new "offered" assignment for this worker and update the ticket.
 * Marks any previous is_current=true assignments on this ticket as not
 * current. Does NOT change stage if the ticket is already in_progress
 * from a prior acceptance (safety guard — reoffer only happens after
 * the prior offer expired without acceptance).
 */
export async function offerTicketToWorker(args: {
  ticketId: string
  workerId: string
  assignedByUserId?: string | null
  reason?: string
}): Promise<{ ok: true; assignmentId: string; expiresAt: string } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, stage, sub_status, offered_worker_ids')
    .eq('id', args.ticketId)
    .single()
  if (!ticket) return { ok: false, error: 'ticket_not_found' }

  const slaMinutes = await getAcceptanceSlaMinutes(ticket.organization_id)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + slaMinutes * 60 * 1000).toISOString()

  // Expire any stale current offers on this ticket.
  await supabase
    .from('ticket_assignments')
    .update({ is_current: false })
    .eq('ticket_id', args.ticketId)
    .eq('is_current', true)

  const { data: assignment, error } = await supabase
    .from('ticket_assignments')
    .insert({
      ticket_id: args.ticketId,
      worker_user_id: args.workerId,
      assigned_by: args.assignedByUserId ?? null,
      status: 'offered',
      expires_at: expiresAt,
      offered_at: now.toISOString(),
      is_current: true,
    })
    .select('id')
    .single()

  if (error || !assignment) return { ok: false, error: error?.message ?? 'insert_failed' }

  const offeredList = new Set<string>(((ticket.offered_worker_ids as string[] | null) ?? []))
  offeredList.add(args.workerId)

  await supabase
    .from('tickets')
    .update({
      owner_user_id: args.workerId,
      needs_triage: false,
      stage: 'in_progress',
      sub_status: 'assigned_awaiting_acceptance',
      assignment_attempt_count: ((ticket as any).assignment_attempt_count ?? 0) + 1,
      offered_worker_ids: Array.from(offeredList),
      updated_at: now.toISOString(),
    })
    .eq('id', args.ticketId)

  await supabase.from('ticket_stage_history').insert({
    ticket_id: args.ticketId,
    from_stage: ticket.stage,
    to_stage: 'in_progress',
    from_sub_status: ticket.sub_status,
    to_sub_status: 'assigned_awaiting_acceptance',
    changed_by: args.assignedByUserId ?? null,
    change_reason: args.reason ?? `Offered to worker (${slaMinutes}m acceptance window)`,
    system_action: !args.assignedByUserId,
  })

  await supabase.from('audit_logs').insert({
    organization_id: ticket.organization_id,
    event_type: 'ticket_offered_to_worker',
    entity_type: 'ticket',
    entity_id: args.ticketId,
    actor_type: args.assignedByUserId ? 'user' : 'system',
    actor_user_id: args.assignedByUserId ?? null,
    new_value_json: {
      worker_id: args.workerId,
      assignment_id: assignment.id,
      expires_at: expiresAt,
      sla_minutes: slaMinutes,
    },
  })

  notifyCitizenOfTicketUpdate({
    ticketId: args.ticketId,
    prevSubStatus: ticket.sub_status as any,
    newSubStatus: 'assigned_awaiting_acceptance',
    newStage: 'in_progress',
    workerUserId: args.workerId,
    key: 'assigned_awaiting_acceptance',
  }).catch(() => {})

  return { ok: true, assignmentId: assignment.id, expiresAt }
}

/**
 * The cron-tick worker.
 *
 * 1. Find ticket_assignments where status='offered' AND is_current=true AND
 *    expires_at < now. For each:
 *      - mark the assignment as expired
 *      - look up max_assignment_attempts for the org
 *      - if attempts_remaining > 0, find the next nearest worker and offer
 *      - else bounce the ticket to 'sla_breach_escalation_queue' and flag
 *        the ticket as sla_breached_flag=true
 * 2. Also: find tickets with sla_first_contact_due_at < now where
 *    sla_breached_flag=false → set flag + audit log. Same for
 *    sla_resolution_due_at.
 */
export async function expireStaleAssignments(): Promise<{
  expired: number
  reoffered: number
  escalated: number
  sla_breached: number
}> {
  const supabase = createSupabaseServiceClient()
  const nowIso = new Date().toISOString()

  let expired = 0
  let reoffered = 0
  let escalated = 0
  let sla_breached = 0

  const { data: stale } = await supabase
    .from('ticket_assignments')
    .select('id, ticket_id, worker_user_id, expires_at')
    .eq('status', 'offered')
    .eq('is_current', true)
    .lt('expires_at', nowIso)

  for (const a of (stale ?? [])) {
    expired++
    await supabase
      .from('ticket_assignments')
      .update({ status: 'expired', responded_at: nowIso, is_current: false })
      .eq('id', a.id)

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, organization_id, stage, sub_status, assignment_attempt_count')
      .eq('id', a.ticket_id)
      .single()
    if (!ticket) continue

    const { data: settings } = await supabase
      .from('organization_settings')
      .select('max_assignment_attempts')
      .eq('organization_id', ticket.organization_id)
      .maybeSingle()
    const maxAttempts = settings?.max_assignment_attempts ?? 3

    if ((ticket.assignment_attempt_count ?? 0) >= maxAttempts) {
      // Bounce to escalation queue
      await supabase
        .from('tickets')
        .update({
          stage: 'on_hold',
          sub_status: 'sla_breach_escalation_queue',
          sla_breached_flag: true,
          needs_triage: true,
          updated_at: nowIso,
        })
        .eq('id', ticket.id)

      await supabase.from('ticket_stage_history').insert({
        ticket_id: ticket.id,
        from_stage: ticket.stage,
        to_stage: 'on_hold',
        from_sub_status: ticket.sub_status,
        to_sub_status: 'sla_breach_escalation_queue',
        change_reason: `Exhausted ${maxAttempts} worker offers without acceptance`,
        system_action: true,
      })

      await supabase.from('audit_logs').insert({
        organization_id: ticket.organization_id,
        event_type: 'ticket_escalated_no_acceptance',
        entity_type: 'ticket',
        entity_id: ticket.id,
        actor_type: 'system',
        metadata_json: { max_attempts: maxAttempts, last_worker: a.worker_user_id },
      })
      escalated++
      continue
    }

    const next = await findNearestAvailableWorker(ticket.id)
    if (!next) {
      await supabase
        .from('tickets')
        .update({
          stage: 'on_hold',
          sub_status: 'sla_breach_escalation_queue',
          sla_breached_flag: true,
          needs_triage: true,
          updated_at: nowIso,
        })
        .eq('id', ticket.id)
      await supabase.from('audit_logs').insert({
        organization_id: ticket.organization_id,
        event_type: 'ticket_no_candidate_worker',
        entity_type: 'ticket',
        entity_id: ticket.id,
        actor_type: 'system',
      })
      escalated++
      continue
    }

    const result = await offerTicketToWorker({
      ticketId: ticket.id,
      workerId: next.id,
      assignedByUserId: null,
      reason: 'Auto re-offer after prior offer expired',
    })
    if (result.ok) reoffered++
  }

  // SLA breach scan — first-contact + resolution.
  const { data: breaches } = await supabase
    .from('tickets')
    .select('id, organization_id, sla_first_contact_due_at, sla_resolution_due_at, first_contacted_at, closed_at')
    .eq('sla_breached_flag', false)
    .or(`sla_first_contact_due_at.lt.${nowIso},sla_resolution_due_at.lt.${nowIso}`)

  for (const t of (breaches ?? [])) {
    const firstContactBreached =
      t.sla_first_contact_due_at && new Date(t.sla_first_contact_due_at) < new Date(nowIso) && !t.first_contacted_at
    const resolutionBreached =
      t.sla_resolution_due_at && new Date(t.sla_resolution_due_at) < new Date(nowIso) && !t.closed_at
    if (!firstContactBreached && !resolutionBreached) continue

    await supabase.from('tickets').update({ sla_breached_flag: true, updated_at: nowIso }).eq('id', t.id)
    await supabase.from('audit_logs').insert({
      organization_id: t.organization_id,
      event_type: 'ticket_sla_breached',
      entity_type: 'ticket',
      entity_id: t.id,
      actor_type: 'system',
      metadata_json: { first_contact: firstContactBreached, resolution: resolutionBreached },
    })
    sla_breached++
  }

  return { expired, reoffered, escalated, sla_breached }
}
