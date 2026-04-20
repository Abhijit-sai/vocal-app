/**
 * POST /api/workers/activation/[id]
 * body: { action: 'approve' | 'reject', note?: string }
 *
 * Approve or reject a pending worker_activation_request.
 * Allowed roles: super_admin, central_support, district_leader.
 *
 * NOTE: Approval here just marks the request approved and records reviewer
 * metadata. The actual users row is bootstrapped on first Clerk sign-in of
 * the worker (the approved request becomes the signal that they should be
 * activated). Creating the users row here would require a clerk_user_id we
 * don't have yet.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['super_admin', 'central_support', 'district_leader']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) {
    return Response.json({ error: 'Insufficient role' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action

  if (action !== 'approve' && action !== 'reject') {
    return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
  if (action === 'reject' && !note) {
    return Response.json({ error: 'A reason is required to reject' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: request } = await supabase
    .from('worker_activation_requests')
    .select('id, organization_id, status, full_name, phone, email, territory_id')
    .eq('id', id)
    .single()

  if (!request || request.organization_id !== user.organization_id) {
    return Response.json({ error: 'Request not found' }, { status: 404 })
  }

  if (request.status !== 'pending') {
    return Response.json({ error: `Request already ${request.status}` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error } = await supabase
    .from('worker_activation_requests')
    .update({
      status:       newStatus,
      reviewed_by:  user.id,
      review_note:  note,
      reviewed_at:  now,
    })
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .eq('status', 'pending')    // concurrency guard

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    organization_id: user.organization_id,
    event_type: action === 'approve' ? 'worker_activation_approved' : 'worker_activation_rejected',
    entity_type: 'worker_activation_request',
    entity_id: id,
    actor_type: 'user',
    actor_user_id: user.id,
    new_value_json: {
      status: newStatus,
      full_name: request.full_name,
      review_note: note,
    },
  })

  return Response.json({ ok: true })
}
