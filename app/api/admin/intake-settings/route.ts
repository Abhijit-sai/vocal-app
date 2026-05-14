/**
 * /api/admin/intake-settings
 *
 *   GET  → returns { version: 'v1' | 'v2' } for the caller's org.
 *   POST → body { version: 'v1' | 'v2' }, writes via service role.
 *
 * Role-gated: super_admin only (this flips production intake behavior).
 * Writes an audit log row on every change.
 */

import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getIntakeVersion, setIntakeVersion, type IntakeVersion } from '@/services/intakeSettingsService'

export const dynamic = 'force-dynamic'

async function authorize() {
  const { userId } = await auth()
  if (!userId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const user = await getCurrentVocalUser()
  if (!user) return { error: Response.json({ error: 'User not found' }, { status: 403 }) }
  const roleName = (user as any).roles?.name
  if (roleName !== 'super_admin') {
    return { error: Response.json({ error: 'Forbidden — super_admin only' }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const a = await authorize()
  if (a.error) return a.error
  const version = await getIntakeVersion(a.user!.organization_id)
  return Response.json({ version })
}

export async function POST(req: Request) {
  const a = await authorize()
  if (a.error) return a.error

  let body: { version?: IntakeVersion }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const newVersion = body.version
  if (newVersion !== 'v1' && newVersion !== 'v2') {
    return Response.json({ error: "version must be 'v1' or 'v2'" }, { status: 400 })
  }

  const prevVersion = await getIntakeVersion(a.user!.organization_id)
  const result = await setIntakeVersion(a.user!.organization_id, newVersion)
  if (!result.ok) return Response.json({ error: result.error ?? 'Update failed' }, { status: 500 })

  // Audit
  const supabase = createSupabaseServiceClient()
  await supabase.from('audit_logs').insert({
    organization_id: a.user!.organization_id,
    event_type: 'intake_version_changed',
    entity_type: 'organization_settings',
    actor_type: 'user',
    actor_user_id: a.user!.id,
    old_value_json: { intake_conversation_version: prevVersion },
    new_value_json: { intake_conversation_version: newVersion },
  })

  return Response.json({ ok: true, version: newVersion, previous: prevVersion })
}
