/**
 * POST /api/amplify/sessions
 * body: { ticket_id: string }
 *
 * Creates a draft Amplify session for a ticket and seeds the default source
 * selections (complaint_text, normalized_summary if present). Returns the
 * new session id.
 *
 * Allowed roles: super_admin, central_support.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['super_admin', 'central_support']

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) {
    return Response.json({ error: 'Insufficient role' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ticketId = typeof body?.ticket_id === 'string' ? body.ticket_id : ''
  if (!ticketId) {
    return Response.json({ error: 'ticket_id is required' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Verify ticket is in-org.
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, original_issue_text, normalized_summary, stage')
    .eq('id', ticketId)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Reuse an existing draft session if one already exists (avoid duplicates).
  const { data: existing } = await supabase
    .from('amplify_sessions')
    .select('id')
    .eq('ticket_id', ticketId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return Response.json({ ok: true, id: existing.id, reused: true })
  }

  // Create a new draft session.
  const { data: session, error } = await supabase
    .from('amplify_sessions')
    .insert({
      ticket_id: ticketId,
      organization_id: user.organization_id,
      created_by: user.id,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !session) {
    return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Seed default source selections.
  const seeds: Array<{ source_type: string; source_content: string | null }> = []
  if (ticket.original_issue_text) {
    seeds.push({ source_type: 'complaint_text', source_content: ticket.original_issue_text })
  }
  if (ticket.normalized_summary) {
    seeds.push({ source_type: 'normalized_summary', source_content: ticket.normalized_summary })
  }

  if (seeds.length) {
    await supabase.from('amplify_source_selections').insert(
      seeds.map(s => ({
        session_id: session.id,
        source_type: s.source_type,
        source_content: s.source_content,
        included: true,
      }))
    )
  }

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'amplify_session_created',
    entity_type: 'amplify_session',
    entity_id: session.id,
    actor_type: 'user',
    actor_user_id: user.id,
    new_value_json: { ticket_id: ticketId },
  })

  return Response.json({ ok: true, id: session.id, reused: false })
}
