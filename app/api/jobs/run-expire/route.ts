/**
 * POST /api/jobs/run-expire
 *
 * Manual trigger for the "expire stale assignments" sweep. Stands in for
 * the Vercel cron while we're on Hobby tier. Restricted to super_admin +
 * central_support.
 *
 * Writes an audit_logs row so the /jobs page can render a run history.
 */

import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { expireStaleAssignments } from '@/services/assignmentService'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const startedAt = new Date()
  try {
    const summary = await expireStaleAssignments()

    const supabase = createSupabaseServiceClient()
    await supabase.from('audit_logs').insert({
      organization_id: user.organization_id,
      event_type: 'job_expire_assignments_run',
      entity_type: 'job',
      entity_id: null,
      actor_type: 'user',
      actor_user_id: user.id,
      new_value_json: {
        ...summary,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        ok: true,
      },
    })

    return Response.json({ ok: true, ran_at: startedAt.toISOString(), ...summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const supabase = createSupabaseServiceClient()
    await supabase.from('audit_logs').insert({
      organization_id: user.organization_id,
      event_type: 'job_expire_assignments_run',
      entity_type: 'job',
      entity_id: null,
      actor_type: 'user',
      actor_user_id: user.id,
      new_value_json: {
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        ok: false,
        error: message,
      },
    })
    console.error('[jobs/run-expire]', err)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
