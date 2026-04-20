/**
 * POST /api/amplify/sessions/[id]/generate
 * body: { platform, tone, source_ids?: string[], extra_context?: string }
 *
 * Generates a draft for the requested platform/tone using the session's
 * currently-included sources (or a filtered subset if source_ids provided).
 * Persists the result to amplify_generated_outputs and returns it.
 *
 * Access: super_admin, central_support.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { generateAmplifyContent, PLATFORMS, type AmplifyPlatform, type AmplifyTone } from '@/services/amplifyService'

const ALLOWED_ROLES = ['super_admin', 'central_support']
const PLATFORM_KEYS = new Set(PLATFORMS.map(p => p.key))
const TONES: AmplifyTone[] = ['informative', 'urgent', 'formal', 'empathetic', 'neutral']

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })
  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) {
    return Response.json({ error: 'Insufficient role' }, { status: 403 })
  }

  const { id: sessionId } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const platform = body?.platform as AmplifyPlatform
  const tone = (body?.tone as AmplifyTone) ?? 'informative'
  if (!PLATFORM_KEYS.has(platform)) {
    return Response.json({ error: 'Invalid platform' }, { status: 400 })
  }
  if (!TONES.includes(tone)) {
    return Response.json({ error: 'Invalid tone' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: session } = await supabase
    .from('amplify_sessions')
    .select('id, organization_id, ticket_id')
    .eq('id', sessionId)
    .single()
  if (!session || session.organization_id !== user.organization_id) {
    return Response.json({ error: 'Session not found' }, { status: 404 })
  }

  // Load included source selections for this session (or explicit subset).
  let sourcesQuery = supabase
    .from('amplify_source_selections')
    .select('id, source_type, source_content, included')
    .eq('session_id', sessionId)
    .eq('included', true)

  if (Array.isArray(body?.source_ids) && body.source_ids.length > 0) {
    sourcesQuery = sourcesQuery.in('id', body.source_ids)
  }

  const { data: sources } = await sourcesQuery

  // Enrich with ticket meta so the draft is grounded even when the session
  // hasn't yet denormalized it.
  const { data: ticket } = await supabase
    .from('tickets')
    .select('ticket_number, title, original_issue_text, normalized_summary, location_text, latitude, longitude, severity')
    .eq('id', session.ticket_id)
    .single()

  const labeledSources = (sources ?? []).map(s => ({
    label: s.source_type,
    content: s.source_content ?? '',
  }))
  if (ticket) {
    labeledSources.push({
      label: 'ticket_meta',
      content: [
        `ticket: ${ticket.ticket_number}${ticket.title ? ` (${ticket.title})` : ''}`,
        ticket.location_text ? `location: ${ticket.location_text}` : null,
        ticket.severity ? `severity: ${ticket.severity}` : null,
      ].filter(Boolean).join('\n'),
    })
  }

  const result = await generateAmplifyContent({
    platform,
    tone,
    sources: labeledSources,
    extraContext: typeof body?.extra_context === 'string' ? body.extra_context : undefined,
  })

  const { data: output, error } = await supabase
    .from('amplify_generated_outputs')
    .insert({
      session_id: sessionId,
      output_format: platform,
      content: result.content,
      tone,
      model_used: result.model,
      generated_by: user.id,
      metadata_json: {
        fallback: result.fallback,
        error: result.error ?? null,
        source_count: labeledSources.length,
      },
    })
    .select('id, output_format, tone, content, model_used, generated_at, metadata_json')
    .single()

  if (error || !output) {
    return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'amplify_content_generated',
    entity_type: 'amplify_session',
    entity_id: sessionId,
    actor_type: 'user',
    actor_user_id: user.id,
    metadata_json: { platform, tone, fallback: result.fallback },
  })

  return Response.json({ ok: true, output })
}
