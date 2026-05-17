/**
 * GET /api/admin/storage/diagnose
 *
 * Super-admin only. Reports on the storage bucket state so we can see
 * — without leaving the app — whether E1 is actually plumbed correctly
 * against the live Supabase project.
 *
 * Checks performed:
 *   1. Does the `ticket-attachments` bucket exist?
 *   2. Is TELEGRAM_BOT_TOKEN set in the runtime env?
 *   3. Are there any rows in ticket_attachments with the legacy
 *      `telegram:<file_id>` storage_path (i.e. uploads that failed)?
 *   4. Try a dummy upload (1×1 PNG) + delete to verify write perms.
 *
 * No DB writes (other than the dummy upload + delete in the bucket).
 */

import { auth } from '@clerk/nextjs/server'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { BUCKET_NAME } from '@/services/attachmentService'

export const dynamic = 'force-dynamic'

// A 1×1 transparent PNG, base64-encoded — used for the round-trip upload test.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentVocalUser()
  if (!user) return Response.json({ error: 'User not found' }, { status: 403 })
  if ((user as any).roles?.name !== 'super_admin') {
    return Response.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
  }

  const supabase = createSupabaseServiceClient()
  const out: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    org_id: (user as any).organization_id,
  }

  // ── 1. Bucket existence ─────────────────────────────────────────────────
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    if (error) {
      out.bucket = { ok: false, error: error.message }
    } else {
      const found = buckets?.find(b => b.name === BUCKET_NAME)
      out.bucket = found
        ? {
            ok: true,
            name: found.name,
            id: found.id,
            public: found.public,
            file_size_limit: found.file_size_limit,
            allowed_mime_types: found.allowed_mime_types,
            created_at: found.created_at,
          }
        : {
            ok: false,
            error: `Bucket "${BUCKET_NAME}" not found. Run \`npm run setup:storage-bucket\` against this Supabase project.`,
          }
    }
  } catch (e: any) {
    out.bucket = { ok: false, error: e?.message ?? String(e) }
  }

  // ── 2. Env-var presence ────────────────────────────────────────────────
  out.env = {
    NEXT_PUBLIC_SUPABASE_URL_present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN_present: !!process.env.TELEGRAM_BOT_TOKEN,
    WORKER_BOT_TOKEN_present: !!process.env.WORKER_BOT_TOKEN,
    supabase_host: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '').split('.')[0] ?? null,
  }

  // ── 3. Legacy pointers count ────────────────────────────────────────────
  try {
    const { count, error } = await supabase
      .from('ticket_attachments')
      .select('id', { count: 'exact', head: true })
      .like('storage_path', 'telegram:%')
    out.legacy_pointers = error ? { ok: false, error: error.message } : { ok: true, count: count ?? 0 }
  } catch (e: any) {
    out.legacy_pointers = { ok: false, error: e?.message ?? String(e) }
  }

  // ── 4. Round-trip upload test ──────────────────────────────────────────
  // Upload a tiny PNG to a scratch path, verify, then delete it.
  const scratchPath = `_diag/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  try {
    const pngBytes = Buffer.from(TINY_PNG_B64, 'base64')
    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(scratchPath, pngBytes, { contentType: 'image/png', upsert: false })
    if (upErr) {
      out.roundtrip = { ok: false, error: upErr.message, hint: explainUploadError(upErr.message) }
    } else {
      // Try to sign it (1 minute is enough for the test)
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(scratchPath, 60)
      // Clean up
      await supabase.storage.from(BUCKET_NAME).remove([scratchPath])

      out.roundtrip = signErr
        ? { ok: false, error: `upload ok but signing failed: ${signErr.message}` }
        : { ok: true, signed_url_sample: signed?.signedUrl?.slice(0, 120) + '…' }
    }
  } catch (e: any) {
    out.roundtrip = { ok: false, error: e?.message ?? String(e) }
  }

  return Response.json(out, { status: 200 })
}

function explainUploadError(msg: string): string | null {
  if (/not.*found/i.test(msg))     return 'Bucket missing — run npm run setup:storage-bucket'
  if (/policy|denied|RLS/i.test(msg)) return 'Bucket policy is blocking writes — check service-role key'
  if (/mime/i.test(msg))            return 'MIME type not in the allowlist — re-run setup script to refresh the allowlist'
  if (/size/i.test(msg))            return 'File exceeds bucket size limit'
  return null
}
