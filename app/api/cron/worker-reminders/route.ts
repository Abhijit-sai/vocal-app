/**
 * POST /api/cron/worker-reminders
 *
 * Sends daily Telegram reminders to all linked ground workers who have
 * open tickets. Intended to be called by a scheduled cron at a fixed time
 * each morning (e.g. 8:00 AM IST).
 *
 * Protected by CRON_SECRET header (same pattern as expire-assignments).
 */

import { NextRequest } from 'next/server'
import { sendWorkerDailyReminders } from '@/services/workerNotifier'

const ORG_ID = process.env.ORG_ID!
const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await sendWorkerDailyReminders(ORG_ID)
  return Response.json({ ok: true, ...result })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
