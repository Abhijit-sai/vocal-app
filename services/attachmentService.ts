/**
 * Attachment Service
 * ==================
 *
 * Owns the lifecycle of ticket_attachments in our Supabase Storage bucket.
 * Replaces the old `telegram:<file_id>` pointer pattern with real,
 * fetchable storage paths.
 *
 * Two public flows:
 *   • downloadFromTelegramAndStore() — called from the citizen webhook
 *     when a ticket gets filed. Pulls the file from Telegram (24-hour
 *     URL via getFile API), uploads to our private bucket, returns the
 *     canonical storage path.
 *   • signedUrlFor() — called from the ticket detail page to render
 *     inline previews. Generates a short-lived signed URL the browser
 *     can fetch.
 *
 * Path convention:
 *   org/<org_id>/ticket/<ticket_id>/<uuid>.<ext>
 *
 * Fail-soft: callers should treat upload failures as soft (log it,
 * fall back to keeping the telegram: pointer so the audit row still
 * exists, and let the backfill script try again later).
 */

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const TELEGRAM_API_BASE  = 'https://api.telegram.org'

export const BUCKET_NAME = 'ticket-attachments'

// Per Telegram Bot API: a downloaded file URL is valid for ~60 minutes,
// then the bot must call getFile again. We don't cache these — every
// download call re-resolves.
const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 20_000

// Signed URL TTL for ticket previews. 1 hour is a good balance — long
// enough for the user to scroll the page, short enough that leaked
// URLs expire quickly.
const SIGNED_URL_TTL_SECONDS = 60 * 60

export interface StoredAttachment {
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  attachment_type: 'image' | 'video' | 'audio' | 'document' | 'other'
  /** The original Telegram file_id for audit / re-download. */
  telegram_file_id: string
}

// ─── Path + MIME helpers ─────────────────────────────────────────────────────

function attachmentTypeFromMime(mime: string | null | undefined): StoredAttachment['attachment_type'] {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || mime.startsWith('application/')) return 'document'
  return 'other'
}

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return 'bin'
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif':  'gif',
    'video/mp4':  'mp4',
    'video/quicktime': 'mov',
    'audio/ogg':  'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4':  'm4a',
    'application/pdf': 'pdf',
  }
  return map[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 6) ?? 'bin'
}

function buildPath(args: { org_id: string; ticket_id: string; mime: string | null | undefined }): string {
  const uuid = crypto.randomUUID()
  return `org/${args.org_id}/ticket/${args.ticket_id}/${uuid}.${extFromMime(args.mime)}`
}

// ─── Telegram → Supabase ─────────────────────────────────────────────────────

interface TelegramGetFileResult {
  ok: boolean
  result?: { file_path?: string; file_size?: number; file_unique_id?: string }
  description?: string
}

/**
 * Pulls a file from Telegram and uploads it to our private bucket. Returns
 * the canonical storage path and metadata, or null if anything goes wrong.
 * Never throws — the citizen webhook calls this fire-and-forget style.
 */
export async function downloadFromTelegramAndStore(args: {
  file_id: string
  org_id: string
  ticket_id: string
  mime_hint?: string | null
}): Promise<StoredAttachment | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[attachmentService] TELEGRAM_BOT_TOKEN missing; cannot resolve file_id')
    return null
  }

  try {
    // 1. Resolve file_id → file_path via Telegram getFile.
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), TELEGRAM_DOWNLOAD_TIMEOUT_MS)
    const metaResp = await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(args.file_id)}`,
      { signal: ctrl.signal },
    )
    clearTimeout(timeout)
    if (!metaResp.ok) {
      console.warn('[attachmentService] getFile failed:', metaResp.status)
      return null
    }
    const metaJson = await metaResp.json() as TelegramGetFileResult
    if (!metaJson.ok || !metaJson.result?.file_path) {
      console.warn('[attachmentService] getFile not ok:', metaJson.description)
      return null
    }
    const filePath = metaJson.result.file_path
    const declaredSize = metaJson.result.file_size ?? null

    // 2. Download the bytes.
    const ctrl2 = new AbortController()
    const timeout2 = setTimeout(() => ctrl2.abort(), TELEGRAM_DOWNLOAD_TIMEOUT_MS)
    const fileResp = await fetch(
      `${TELEGRAM_API_BASE}/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`,
      { signal: ctrl2.signal },
    )
    clearTimeout(timeout2)
    if (!fileResp.ok) {
      console.warn('[attachmentService] file download failed:', fileResp.status)
      return null
    }
    const buffer = Buffer.from(await fileResp.arrayBuffer())
    const mime = args.mime_hint ?? fileResp.headers.get('content-type') ?? 'application/octet-stream'

    // 3. Upload to Supabase Storage.
    const supabase = createSupabaseServiceClient()
    const storagePath = buildPath({ org_id: args.org_id, ticket_id: args.ticket_id, mime })
    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: false,
      })
    if (upErr) {
      console.warn('[attachmentService] upload failed:', upErr.message)
      return null
    }

    return {
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: declaredSize ?? buffer.length,
      attachment_type: attachmentTypeFromMime(mime),
      telegram_file_id: args.file_id,
    }
  } catch (err) {
    console.warn('[attachmentService] unexpected error:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Signed URL for previews ─────────────────────────────────────────────────

/**
 * Generates a short-lived signed URL for reading an attachment. Used by
 * the ticket detail page to render inline image previews.
 *
 * If `storage_path` still looks like an old `telegram:<file_id>` pointer
 * (pre-E1 migration), returns null so the caller can render a placeholder.
 */
export async function signedUrlFor(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null
  if (storagePath.startsWith('telegram:')) return null

  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      console.warn('[attachmentService] signed URL failed for', storagePath, error?.message)
      return null
    }
    return data.signedUrl
  } catch (err) {
    console.warn('[attachmentService] signed URL exception:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Batched version — generates signed URLs for many storage paths in one
 * pass. Useful for the ticket detail page rendering N attachments.
 */
export async function signedUrlsFor(storagePaths: Array<string | null | undefined>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    storagePaths.map(async p => {
      if (!p) return
      const url = await signedUrlFor(p)
      if (url) out[p] = url
    }),
  )
  return out
}
