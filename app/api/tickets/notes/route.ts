/**
 * POST /api/tickets/notes
 *
 * Appends a note to a ticket. Enforces:
 * - User must be authenticated and active
 * - Only owner or privileged roles can add notes to a ticket
 * - Notes are immutable after creation (append-only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { addTicketNote } from '@/services/ticketService'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const body = await req.json()
  const { ticket_id, content, note_type = 'general', is_internal = true } = body

  if (!ticket_id || !content?.trim()) {
    return Response.json({ error: 'ticket_id and content are required' }, { status: 400 })
  }

  // Verify the ticket belongs to user's org and user has access
  const supabase = createSupabaseServiceClient()
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, owner_user_id')
    .eq('id', ticket_id)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const roleName = (user as any).roles?.name
  const isPrivileged = ['super_admin', 'central_support'].includes(roleName)
  const isOwner = ticket.owner_user_id === user.id
  const isWorker = roleName === 'ground_worker'

  if (!isPrivileged && !(isWorker && isOwner)) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }

  // Validate note_type
  const allowedTypes = ['general', 'worker_update', 'escalation', 'system', 'closure']
  if (!allowedTypes.includes(note_type)) {
    return Response.json({ error: 'Invalid note_type' }, { status: 400 })
  }

  // Closure note requires prior citizen_contacted
  if (note_type === 'closure') {
    const { data: history } = await supabase
      .from('ticket_stage_history')
      .select('id')
      .eq('ticket_id', ticket_id)
      .eq('to_sub_status', 'citizen_contacted')
      .limit(1)
      .single()

    if (!history) {
      return Response.json({
        error: 'Cannot close ticket: citizen_contacted sub-status has not been reached'
      }, { status: 422 })
    }
  }

  const result = await addTicketNote(
    ticket_id,
    user.id,
    content.trim(),
    note_type,
    is_internal,
  )

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json({ ok: true, note_id: result.noteId })
}
