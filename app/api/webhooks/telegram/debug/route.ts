/**
 * GET /api/webhooks/telegram/debug
 *
 * Dev/ops diagnostic for the Telegram bot. Restricted to super_admin +
 * central_support. Surfaces the three most common silent-failure modes in
 * one response:
 *
 *   1. Does ORG_ID resolve to a real organizations row?
 *   2. Is TELEGRAM_BOT_TOKEN set and valid (getMe + getWebhookInfo)?
 *   3. Are recent inbound updates actually landing in channel_messages, and
 *      are any webhook_error rows piling up in audit_logs?
 *
 * If something is wrong, this endpoint explains what — and how to fix it —
 * instead of the bot just going dark.
 */

import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseServiceClient()
  const ORG_ID = process.env.ORG_ID ?? null
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

  // --- 1. Check ORG_ID resolves -------------------------------------------
  let org: { id: string; slug: string; name: string } | null = null
  let orgProblem: string | null = null
  if (!ORG_ID) {
    orgProblem = 'ORG_ID is not set in .env.local'
  } else {
    const { data } = await supabase
      .from('organizations')
      .select('id, slug, name')
      .eq('id', ORG_ID)
      .maybeSingle()
    if (!data) {
      orgProblem = `ORG_ID=${ORG_ID} does not match any organizations row. Every webhook insert will FK-violate.`
    } else {
      org = data
    }
  }

  // --- 2. Telegram bot health --------------------------------------------
  let getMe: any = null
  let webhookInfo: any = null
  let botProblem: string | null = null
  if (!TELEGRAM_BOT_TOKEN) {
    botProblem = 'TELEGRAM_BOT_TOKEN is not set'
  } else {
    try {
      const [meRes, whRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`),
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
      ])
      getMe = await meRes.json()
      webhookInfo = await whRes.json()
      if (!getMe?.ok) botProblem = 'getMe failed — token is probably invalid'
    } catch (e) {
      botProblem = `Telegram API unreachable: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // --- 3. Recent inbound traffic + webhook errors ------------------------
  const [{ data: lastMessages }, { data: webhookErrors }, { data: lastTicket }] = await Promise.all([
    supabase
      .from('channel_messages')
      .select('id, channel, direction, message_type, raw_text, created_at')
      .eq('organization_id', ORG_ID ?? '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('audit_logs')
      .select('id, event_type, metadata_json, created_at')
      .eq('event_type', 'webhook_error')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tickets')
      .select('id, ticket_number, source_channel, created_at')
      .eq('organization_id', ORG_ID ?? '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const hints: string[] = []
  if (orgProblem) hints.push(`Fix: ${orgProblem}`)
  if (botProblem) hints.push(`Fix: ${botProblem}`)
  if (!TELEGRAM_WEBHOOK_SECRET) hints.push('TELEGRAM_WEBHOOK_SECRET is empty — any request will be accepted. Set it and re-register the webhook.')
  if (webhookInfo?.result?.last_error_message) {
    hints.push(`Telegram reports last_error_message: "${webhookInfo.result.last_error_message}". Usually means the tunnel URL is dead — re-run scripts/dev-tunnel.ps1.`)
  }
  if (webhookInfo?.result && !webhookInfo.result.url) {
    hints.push('No webhook URL registered with Telegram. Run scripts/dev-tunnel.ps1 or call setWebhook manually.')
  }
  if ((lastMessages?.length ?? 0) === 0) {
    hints.push('No channel_messages rows at all — webhook is not reaching the handler, or ORG_ID is wrong.')
  }

  return Response.json({
    ok: hints.length === 0,
    checked_at: new Date().toISOString(),
    env: {
      ORG_ID,
      ORG_ID_resolves: !!org,
      TELEGRAM_BOT_TOKEN_set: !!TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET_set: !!TELEGRAM_WEBHOOK_SECRET,
    },
    org,
    bot: getMe?.result ?? null,
    webhook_info: webhookInfo?.result ?? null,
    last_inbound_messages: lastMessages ?? [],
    recent_webhook_errors: webhookErrors ?? [],
    last_ticket: lastTicket ?? null,
    hints,
  })
}
