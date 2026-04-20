/**
 * POST /api/tickets/confirm-ai
 *
 * Confirms AI-generated suggestions for a ticket and applies them.
 * Accepts both JSON and form-encoded bodies so it can be used from
 * a simple <form method="POST"> as well as fetch().
 *
 * Access: central_support and super_admin only.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

async function readBody(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return await req.json()
  }
  // form-encoded or multipart
  const form = await req.formData()
  const body: Record<string, string> = {}
  form.forEach((v, k) => { body[k] = String(v) })
  return body
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Only central support may confirm AI suggestions' }, { status: 403 })
  }

  const body = await readBody(req)
  const ticketId = body.ticket_id
  const suggestionId = body.suggestion_id
  if (!ticketId || !suggestionId) {
    return Response.json({ error: 'ticket_id and suggestion_id required' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Load suggestion + ticket and verify org match
  const { data: suggestion } = await supabase
    .from('ai_ticket_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('ticket_id', ticketId)
    .single()

  if (!suggestion) {
    return Response.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, organization_id, title, normalized_summary, severity, department')
    .eq('id', ticketId)
    .single()

  if (!ticket || ticket.organization_id !== user.organization_id) {
    return Response.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Apply suggestions (only overwrite fields that are currently empty on the ticket)
  const updates: Record<string, unknown> = { updated_at: now }
  if (!ticket.title && suggestion.suggested_title) updates.title = suggestion.suggested_title
  if (!ticket.normalized_summary && suggestion.suggested_summary) updates.normalized_summary = suggestion.suggested_summary
  if (!ticket.severity && suggestion.suggested_severity)         updates.severity = suggestion.suggested_severity
  if (!ticket.department && suggestion.suggested_department)     updates.department = suggestion.suggested_department

  // Optionally resolve category by name (best-effort)
  if (suggestion.suggested_category) {
    const { data: cat } = await supabase
      .from('issue_categories')
      .select('id')
      .eq('organization_id', user.organization_id)
      .ilike('name', suggestion.suggested_category)
      .limit(1)
      .single()
    if (cat?.id) updates.category_id = cat.id
  }

  // Lift the triage flag since a human has reviewed the AI output
  updates.needs_triage = false

  await supabase.from('tickets').update(updates).eq('id', ticketId)

  // Mark suggestion confirmed
  await supabase.from('ai_ticket_suggestions').update({
    confirmed: true,
    confirmed_by_user_id: user.id,
    confirmed_at: now,
  }).eq('id', suggestionId)

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'ai_suggestions_confirmed',
    entity_type: 'ticket',
    entity_id: ticketId,
    actor_type: 'user',
    actor_user_id: user.id,
    new_value_json: updates,
    metadata_json: { suggestion_id: suggestionId },
  })

  // If this came from a form POST, redirect back to the ticket page.
  // If from fetch(), return JSON.
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return Response.json({ ok: true, applied: updates })
  }
  return Response.redirect(new URL(`/tickets/${ticketId}`, req.url), 303)
}
