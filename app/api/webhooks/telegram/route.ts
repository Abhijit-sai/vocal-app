/**
 * Telegram Webhook Handler.
 *
 * Receives Telegram Bot API updates and hands them off to the conversation
 * state machine in services/telegramFlow.ts. This file is intentionally
 * thin — it validates the secret, normalizes the update into a canonical
 * IncomingMessage, persists the raw payload, and invokes the flow.
 *
 * Security:
 *   - Validates X-Telegram-Bot-Api-Secret-Token.
 *   - Uses service role for all writes.
 *   - Always returns 200 (with { ok: true }) to prevent Telegram retry storms.
 */

import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { upsertCitizenFromTelegram, getOrCreateConversation } from '@/services/citizenService'
import { handleInboundMessage, type IncomingMessage, type Step, type Draft } from '@/services/telegramFlow'
import { answerCallbackQuery, clearInlineKeyboard, callbackToSyntheticText } from '@/services/telegramService'

const ORG_ID = process.env.ORG_ID!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!

type TelegramMessage = {
  message_id: number
  from?: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
    phone_number?: string
  }
  chat: { id: number; type: string }
  date: number
  text?: string
  voice?:    { file_id: string; duration: number; mime_type?: string; file_size?: number }
  photo?:    Array<{ file_id: string; width: number; height: number; file_size?: number }>
  video?:    { file_id: string; duration: number; mime_type?: string; file_size?: number }
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number }
  location?: { latitude: number; longitude: number }
  caption?:  string
}

type TelegramCallbackQuery = {
  id: string
  from: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
  }
  message?: TelegramMessage
  data?: string
}

type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

function detectMessageType(msg: TelegramMessage): 'text' | 'voice' | 'image' | 'video' | 'document' | 'location' {
  if (msg.voice)    return 'voice'
  if (msg.photo)    return 'image'
  if (msg.video)    return 'video'
  if (msg.document) return 'document'
  if (msg.location) return 'location'
  return 'text'
}

function pickMedia(msg: TelegramMessage): IncomingMessage['media'] {
  if (msg.voice) {
    return { file_id: msg.voice.file_id, type: 'voice', mime_type: msg.voice.mime_type ?? null, caption: msg.caption ?? null }
  }
  if (msg.photo && msg.photo.length) {
    // Use the largest photo size (last element).
    // Telegram's photo struct has no mime_type field on the message — but
    // Telegram converts every uploaded photo to JPEG server-side, so we
    // can safely hint that. Without this hint the Storage bucket rejects
    // the upload with 'mime type application/octet-stream not supported'.
    return {
      file_id: msg.photo[msg.photo.length - 1].file_id,
      type: 'image',
      mime_type: 'image/jpeg',
      caption: msg.caption ?? null,
    }
  }
  if (msg.video) {
    return { file_id: msg.video.file_id, type: 'video', mime_type: msg.video.mime_type ?? null, caption: msg.caption ?? null }
  }
  if (msg.document) {
    return { file_id: msg.document.file_id, type: 'document', mime_type: msg.document.mime_type ?? null, caption: msg.caption ?? null }
  }
  return null
}

export async function POST(req: NextRequest) {
  // Validate webhook secret.
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')
  if (WEBHOOK_SECRET && secretHeader !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Invalid secret' }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // Callback query branch (inline keyboard taps). We translate the callback
  // back to its equivalent text command and synthesise a TelegramMessage so
  // the rest of the pipeline is unchanged.
  // -------------------------------------------------------------------------
  let msg: TelegramMessage | undefined = update.message ?? update.edited_message
  let callbackMessageIdOverride: string | null = null

  if (!msg && update.callback_query) {
    const cb = update.callback_query
    const syntheticText = cb.data ? callbackToSyntheticText(cb.data) : null
    // Always ack so the spinner stops even if we don't recognise the data.
    void answerCallbackQuery(cb.id)
    // Strip the keyboard off the originating message so it can't be tapped twice.
    if (cb.message) void clearInlineKeyboard(cb.message.chat.id, cb.message.message_id)
    if (!syntheticText || !cb.message || !cb.from) {
      return Response.json({ ok: true })
    }
    msg = {
      message_id: cb.message.message_id,
      from: cb.from,
      chat: cb.message.chat,
      date: cb.message.date,
      text: syntheticText,
    }
    // Distinguish callback-tap audit rows from regular inbound messages
    // (and keep each tap's row unique).
    callbackMessageIdOverride = `cb:${cb.id}`
  }

  if (!msg || !msg.from) {
    return Response.json({ ok: true })
  }

  const supabase = createSupabaseServiceClient()
  const telegramUserId = String(msg.from.id)
  const messageType = detectMessageType(msg)
  const rawText = msg.text ?? msg.caption ?? null

  try {
    // 1. Upsert citizen.
    const displayName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || undefined
    const { citizenId } = await upsertCitizenFromTelegram(
      ORG_ID, telegramUserId, msg.from.username, displayName, msg.from.phone_number,
    )

    // 2. Load (or create) conversation.
    const { conversationId } = await getOrCreateConversation(
      ORG_ID, 'telegram', telegramUserId, citizenId,
    )

    // 3. Fetch current flow state from the conversation row.
    const { data: conv } = await supabase
      .from('channel_conversations')
      .select('id, state, current_step, metadata_json')
      .eq('id', conversationId)
      .single()

    const currentStep: Step = (conv?.current_step as Step) || 'idle'
    const draft: Draft = (conv?.metadata_json as { draft?: Draft } | null)?.draft ?? {}

    // 4. Persist the raw inbound message (for audit / replay).
    await supabase.from('channel_messages').insert({
      conversation_id: conversationId,
      organization_id: ORG_ID,
      channel: 'telegram',
      channel_message_id: callbackMessageIdOverride ?? String(msg.message_id),
      direction: 'inbound',
      message_type: messageType,
      raw_text: rawText,
      raw_payload: update as any,
      attachment_url: pickMedia(msg)?.file_id ?? null,
      attachment_mime: pickMedia(msg)?.mime_type ?? null,
      latitude:  msg.location?.latitude  ?? null,
      longitude: msg.location?.longitude ?? null,
      processed: false,
    })

    // 5. Hand off to the state machine.
    const incoming: IncomingMessage = {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: rawText,
      media: pickMedia(msg),
      location: msg.location ?? null,
    }

    await handleInboundMessage({
      supabase,
      organizationId: ORG_ID,
      conversationId,
      citizenId,
      currentStep,
      draft,
      msg: incoming,
    })
  } catch (err) {
    console.error('[Telegram webhook error]', err)
    // Best-effort audit log; ignore its own failure.
    await supabase.from('audit_logs').insert({
      organization_id: ORG_ID,
      event_type: 'webhook_error',
      actor_type: 'webhook',
      metadata_json: {
        error: err instanceof Error ? err.message : String(err),
        update_id: update.update_id,
        telegram_user_id: msg.from?.id,
      },
    }).then(() => {}, () => {})
  }

  return Response.json({ ok: true })
}

export async function GET() {
  return Response.json({
    ok: true,
    service: 'vocal-telegram-webhook',
    timestamp: new Date().toISOString(),
  })
}
