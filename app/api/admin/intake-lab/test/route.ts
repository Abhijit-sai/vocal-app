/**
 * POST /api/admin/intake-lab/test
 *
 * Sandbox endpoint for iterating the LLM intake prompt. Takes a
 * conversation history + a new message + an optional draft state and
 * returns the IntakeResponse without writing anything to the database.
 *
 * Role-gated to super_admin + central_support.
 *
 * This is the iteration loop for W2 — try Telugu/Tinglish examples,
 * civic + out-of-scope cases, multi-turn flows. Once the prompt feels
 * right, we swap the same `processInbound()` into the live Telegram
 * webhook behind a feature flag.
 */

import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser } from '@/lib/supabase/server'
import { processInbound, type IntakeRequest } from '@/services/intakeConversationManager'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: IntakeRequest
  try {
    body = await req.json() as IntakeRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Body must be an IntakeRequest' }, { status: 400 })
  }
  if (!body.newMessage) {
    return Response.json({ error: 'newMessage is required' }, { status: 400 })
  }
  if (!Array.isArray(body.history)) body.history = []

  // ── Run intake ─────────────────────────────────────────────────────────
  const result = await processInbound(body)
  return Response.json(result)
}
