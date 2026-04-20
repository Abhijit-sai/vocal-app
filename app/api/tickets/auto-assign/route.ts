/**
 * POST /api/tickets/auto-assign
 * body: { ticket_id }
 *
 * Find the nearest eligible ground worker and create an "offered" assignment
 * with the org's configured acceptance SLA (default 2 minutes). Used by
 * central support when they confirm triage but don't want to pick a worker
 * by hand.
 *
 * Restricted to: super_admin, central_support.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { findNearestAvailableWorker, listCandidateWorkers, offerTicketToWorker } from '@/services/assignmentService'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })
  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Insufficient role' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ticketId = typeof body?.ticket_id === 'string' ? body.ticket_id : ''
  if (!ticketId) return Response.json({ error: 'ticket_id required' }, { status: 400 })

  const supabase = createSupabaseServiceClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id')
    .eq('id', ticketId)
    .single()
  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const candidates = await listCandidateWorkers(ticketId)
  const nearest = candidates[0] ?? null

  if (!nearest) {
    return Response.json({
      error: 'No eligible workers in this ticket\'s territory.',
      candidates_considered: 0,
    }, { status: 409 })
  }

  const result = await offerTicketToWorker({
    ticketId,
    workerId: nearest.id,
    assignedByUserId: user.id,
    reason: 'Auto-assigned to nearest available worker',
  })
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 })

  return Response.json({
    ok: true,
    worker: nearest,
    remaining_candidates: candidates.length - 1,
    assignment_id: result.assignmentId,
    expires_at: result.expiresAt,
  })
}
