/**
 * PATCH  /api/directory/[id]  — update a contact
 * DELETE /api/directory/[id]  — soft-archive a contact (sets active=false)
 *
 * Only super_admin / central_support.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

const WRITE_ROLES = ['super_admin', 'central_support']

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s.length ? s : null
}

async function authorize() {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized', status: 401 as const }
  const user = await getCurrentVocalUser()
  if (!user) return { error: 'User not found', status: 403 as const }
  const roleName = (user as any).roles?.name
  if (!WRITE_ROLES.includes(roleName)) {
    return { error: 'Insufficient role', status: 403 as const }
  }
  return { user }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authorize()
  if ('error' in a) return Response.json({ error: a.error }, { status: a.status })
  const { user } = a

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const supabase = createSupabaseServiceClient()

  // Verify ownership
  const { data: current } = await supabase
    .from('directory_contacts')
    .select('id, organization_id, contact_name, verification_status')
    .eq('id', id)
    .single()

  if (!current || current.organization_id !== user.organization_id) {
    return Response.json({ error: 'Contact not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  // Only accept known fields
  const name = clean(body.contact_name, 200)
  if (name) updates.contact_name = name
  if ('organization_name'  in body) updates.organization_name  = clean(body.organization_name, 200)
  if ('role_designation'   in body) updates.role_designation   = clean(body.role_designation, 120)
  if ('phone'              in body) updates.phone              = clean(body.phone, 40)
  if ('phone_alternate'    in body) updates.phone_alternate    = clean(body.phone_alternate, 40)
  if ('email'              in body) updates.email              = clean(body.email, 200)
  if ('availability_notes' in body) updates.availability_notes = clean(body.availability_notes, 500)
  if ('internal_notes'     in body) updates.internal_notes     = clean(body.internal_notes, 1000)

  if (typeof body.verification_status === 'string'
      && ['unverified', 'verified', 'outdated'].includes(body.verification_status)) {
    updates.verification_status = body.verification_status
  }

  const { error } = await supabase
    .from('directory_contacts')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'directory_contact_updated',
    entity_type: 'directory_contact',
    entity_id: id,
    actor_type: 'user',
    actor_user_id: user.id,
    new_value_json: updates,
  })

  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authorize()
  if ('error' in a) return Response.json({ error: a.error }, { status: a.status })
  const { user } = a

  const { id } = await params

  const supabase = createSupabaseServiceClient()

  const { data: current } = await supabase
    .from('directory_contacts')
    .select('id, organization_id, active')
    .eq('id', id)
    .single()

  if (!current || current.organization_id !== user.organization_id) {
    return Response.json({ error: 'Contact not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('directory_contacts')
    .update({
      active: false,
      archived_by: user.id,
      archived_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'directory_contact_archived',
    entity_type: 'directory_contact',
    entity_id: id,
    actor_type: 'user',
    actor_user_id: user.id,
  })

  return Response.json({ ok: true })
}
