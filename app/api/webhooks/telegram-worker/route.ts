/**
 * Worker Telegram Webhook Handler
 *
 * Handles updates for the dedicated internal/worker bot (WORKER_BOT_TOKEN).
 * This is separate from the citizen bot webhook so the two flows never
 * interfere with each other.
 *
 * Supported flows:
 *  - /start link_<workerId>  — link worker's Telegram account
 *  - waccept:<ticketId>      — worker accepts an offered ticket
 *  - wreject:<ticketId>      — worker rejects an offered ticket
 *  - wupdate:<ticketId>      — nudge worker to update status (redirect to app)
 *
 * Always returns 200 to prevent Telegram retry storms.
 */

import { NextRequest } from 'next/server'
import {
  answerWorkerCallbackQuery,
  clearWorkerInlineKeyboard,
  sendWorkerMessage,
  WORKER_WEBHOOK_SECRET,
} from '@/services/workerTelegramService'
import { linkWorkerTelegram, workerAcceptViaBot, workerRejectViaBot } from '@/services/workerNotifier'

type TelegramMessage = {
  message_id: number
  from?: { id: number; username?: string; first_name?: string; last_name?: string }
  chat: { id: number; type: string }
  date: number
  text?: string
}

type TelegramCallbackQuery = {
  id: string
  from: { id: number; username?: string; first_name?: string; last_name?: string }
  message?: TelegramMessage
  data?: string
}

type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export async function POST(req: NextRequest) {
  // Validate secret.
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (WORKER_WEBHOOK_SECRET && secret !== WORKER_WEBHOOK_SECRET) {
    return Response.json({ error: 'Invalid secret' }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // ── Callback query (button tap) ─────────────────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query
      const data = cb.data ?? ''

      void answerWorkerCallbackQuery(cb.id)
      if (cb.message) void clearWorkerInlineKeyboard(cb.message.chat.id, cb.message.message_id)

      const chatId = cb.message?.chat.id ?? cb.from.id
      const colonIdx = data.indexOf(':')
      const prefix   = colonIdx >= 0 ? data.slice(0, colonIdx) : data
      const ticketId = colonIdx >= 0 ? data.slice(colonIdx + 1) : ''

      if (prefix === 'waccept' && ticketId) {
        await workerAcceptViaBot(ticketId, chatId)
      } else if (prefix === 'wreject' && ticketId) {
        await workerRejectViaBot(ticketId, chatId)
      } else if (prefix === 'wupdate' && ticketId) {
        await sendWorkerMessage(chatId,
          `📝 Open the *My Leader* app → My Assignments to update your ticket status.\n\nTicket ref: \`${ticketId.slice(0, 8)}…\``)
      }

      return Response.json({ ok: true })
    }

    // ── Text message ────────────────────────────────────────────────────────
    const msg = update.message
    if (!msg?.from) return Response.json({ ok: true })

    const chatId = msg.chat.id
    const text   = msg.text ?? ''

    // Deep-link: /start link_<workerId>
    if (text.startsWith('/start link_')) {
      const workerId = text.replace('/start link_', '').trim()
      if (workerId) {
        await linkWorkerTelegram(workerId, chatId)
      } else {
        await sendWorkerMessage(chatId,
          '⚠️ Invalid linking code. Open the *My Leader* app → My Assignments to get your link.')
      }
      return Response.json({ ok: true })
    }

    // Plain /start with no payload
    if (text === '/start') {
      await sendWorkerMessage(chatId,
        `👋 *My Leader — Worker Bot*\n\nThis bot is for My Leader team members only.\n\nTo link your account, go to *My Assignments* in the app and tap *Link Telegram*.`)
      return Response.json({ ok: true })
    }

    // Any other message
    await sendWorkerMessage(chatId,
      `ℹ️ Use the *My Leader* app to manage your assignments. This bot sends you alerts and reminders only.`)
  } catch (err) {
    console.error('[Worker webhook error]', err)
  }

  return Response.json({ ok: true })
}

export async function GET() {
  return Response.json({ ok: true, service: 'my-leader-worker-webhook' })
}
