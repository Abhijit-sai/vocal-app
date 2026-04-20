/**
 * POST /api/tickets/assign
 *
 * Manually assign a ticket to a specific worker.
 * Restricted to: super_admin, central_support.
 *
 * Delegates to services/assignmentService.offerTicketToWorker so the
 * single-ticket assignment path and the cron re-offer path behave identically
 * (same offered_worker_ids tracking, same org-configured acceptance SLA,
 * same audit events).
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { offerTicketToWorker } from '@/services/assignmentService'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Only central support can manually assign tickets' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ticketId = typeof body?.ticket_id === 'string' ? body.ticket_id : ''
  const workerId = typeof body?.worker_id === 'string' ? body.worker_id : ''
  // Optional sub_status override from UI when the user explicitly picks
  // "assigned_to_ground_staff" — kept for forward compat; offerTicketToWorker
  // already sets the appropriate status.
  if (!ticketId || !workerId) {
    return Response.json({ error: 'ticket_id and worker_id required' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Org scoping on both sides.
  const [{ data: ticket }, { data: worker }] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, organization_id')
      .eq('id', ticketId)
      .single(),
    supabase
      .from('users')
      .select('id, organization_id, role_id, active')
      .eq('id', workerId)
      .eq('organization_id', user.organization_id)
      .eq('active', true)
      .single(),
  ])

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }
  if (!worker) {
    return Response.json({ error: 'Worker not found or inactive' }, { status: 404 })
  }

  const result = await offerTicketToWorker({
    ticketId,
    workerId,
    assignedByUserId: user.id,
    reason: 'Manual assignment by central support',
  })

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json({
    ok: true,
    assignment_id: result.assignmentId,
    expires_at: result.expiresAt,
  })
}
