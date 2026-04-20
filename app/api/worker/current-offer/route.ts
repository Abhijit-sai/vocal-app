/**
 * GET /api/worker/current-offer
 *
 * Returns the current (non-expired) offered assignment for the authenticated
 * worker, or `{ offer: null }` if nothing is pending. Used by the dashboard
 * client to poll for new offers and pop the alert modal + beep + Web
 * Notification without a page reload.
 *
 * Kept deliberately tiny — polled ~every 15s. Returns only the assignment id,
 * ticket id, ticket number, title, severity, location, and expires_at so
 * the client can decide whether this is a *new* offer (different id than the
 * one already rendered).
 */

import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (roleName !== 'ground_worker') {
    return Response.json({ offer: null })
  }

  const supabase = createSupabaseServiceClient()
  const nowISO = new Date().toISOString()

  const { data } = await supabase
    .from('ticket_assignments')
    .select(`
      id, expires_at,
      tickets(
        id, ticket_number, title, original_issue_text,
        location_text, severity
      )
    `)
    .eq('worker_user_id', user.id)
    .eq('is_current', true)
    .eq('status', 'offered')
    .gt('expires_at', nowISO)
    .maybeSingle()

  if (!data) return Response.json({ offer: null })

  const ticket: any = Array.isArray((data as any).tickets) ? (data as any).tickets[0] : (data as any).tickets
  return Response.json({
    offer: {
      assignment_id: (data as any).id,
      expires_at:    (data as any).expires_at,
      ticket: ticket ? {
        id:                ticket.id,
        ticket_number:     ticket.ticket_number,
        title:             ticket.title,
        original_issue_text: ticket.original_issue_text,
        location_text:     ticket.location_text,
        severity:          ticket.severity,
      } : null,
    },
  })
}
