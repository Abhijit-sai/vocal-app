/**
 * POST/GET /api/cron/expire-assignments
 *
 * Cron tick for the assignment state machine. Call this every minute
 * (Vercel cron: `* * * * *`). Idempotent — runs fast when nothing is stale.
 *
 * Auth:
 *   - Vercel cron includes `x-vercel-cron` header; we accept that.
 *   - Otherwise, CRON_SECRET header must match env CRON_SECRET.
 *   - Otherwise 401.
 *
 * Returns a small JSON summary of what it did. During local dev, you can
 * trigger it manually from the dashboard's "Force expiry tick" button
 * (added to triage page).
 */

import { NextRequest } from 'next/server'
import { expireStaleAssignments } from '@/services/assignmentService'

export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // If no secret is configured, allow only in non-production so dev unblocks.
    return process.env.NODE_ENV !== 'production'
  }
  return req.headers.get('x-cron-secret') === expected
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await expireStaleAssignments()
    return Response.json({ ok: true, ran_at: new Date().toISOString(), ...summary })
  } catch (err) {
    console.error('[cron/expire-assignments]', err)
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}

export const GET  = handle
export const POST = handle
