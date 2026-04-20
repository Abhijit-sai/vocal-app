/**
 * POST /api/directory
 *
 * Create a new directory contact. Only super_admin / central_support.
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

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!WRITE_ROLES.includes(roleName)) {
    return Response.json({ error: 'Insufficient role' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  const contact_name = clean(body.contact_name, 200)
  if (!contact_name) {
    return Response.json({ error: 'contact_name is required' }, { status: 400 })
  }

  const verification_status = ['unverified', 'verified', 'outdated'].includes(body.verification_status)
    ? body.verification_status
    : 'unverified'

  const supabase = createSupabaseServiceClient()

  const insert = {
    organization_id:     user.organization_id,
    contact_name,
    organization_name:   clean(body.organization_name, 200),
    role_designation:    clean(body.role_designation, 120),
    phone:               clean(body.phone, 40),
    phone_alternate:     clean(body.phone_alternate, 40),
    email:               clean(body.email, 200),
    availability_notes:  clean(body.availability_notes, 500),
    internal_notes:      clean(body.internal_notes, 1000),
    verification_status,
    active:              true,
    created_by:          user.id,
  }

  const { data, error } = await supabase
    .from('directory_contacts')
    .insert(insert)
    .select('id')
    .single()

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: 'directory_contact_created',
    entity_type: 'directory_contact',
    entity_id: data.id,
    actor_type: 'user',
    actor_user_id: user.id,
    new_value_json: { contact_name, organization_name: insert.organization_name },
  })

  return Response.json({ ok: true, id: data.id })
}
