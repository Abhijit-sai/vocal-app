/**
 * scripts/backfill-telegram-attachments.ts
 * ========================================
 *
 * Walks `ticket_attachments` rows where `storage_path LIKE 'telegram:%'`
 * (legacy pointers from before E1) and tries to download them from
 * Telegram + upload to our Supabase Storage bucket, rewriting the
 * storage_path.
 *
 * Idempotent. Safe to re-run. Skips rows that can't be resolved (e.g.
 * Telegram's file_id has aged out — Bot API retains them for ~1 year)
 * with a warning, leaving the legacy pointer intact so a future tool
 * can decide what to do.
 *
 * Run:
 *   cd vocal-app
 *   npx tsx scripts/backfill-telegram-attachments.ts
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TELEGRAM_BOT_TOKEN
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { downloadFromTelegramAndStore } from '../services/attachmentService'

const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN — required to resolve legacy file_id pointers')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('\nBackfilling legacy `telegram:` attachments → Supabase Storage')
  console.log('============================================================')

  const { data: rows, error } = await sb
    .from('ticket_attachments')
    .select('id, ticket_id, file_name, storage_path, mime_type, tickets!inner(organization_id)')
    .like('storage_path', 'telegram:%')

  if (error) {
    console.error('Failed to query:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('✓ No legacy pointers found. Nothing to do.')
    return
  }

  console.log(`Found ${rows.length} legacy pointer(s). Resolving…\n`)

  let migrated = 0
  let skipped  = 0
  let failed   = 0

  for (const r of rows) {
    const fileId = r.storage_path.replace(/^telegram:/, '')
    const ticketId = r.ticket_id
    const orgId = (r.tickets as any)?.organization_id
    if (!orgId) {
      console.warn(`  ⚠ ${r.id} — no org_id resolved from joined ticket; skipping`)
      skipped++
      continue
    }

    process.stdout.write(`  • ${r.id.slice(0, 8)}… `)
    const stored = await downloadFromTelegramAndStore({
      file_id: fileId,
      org_id: orgId,
      ticket_id: ticketId,
      mime_hint: r.mime_type ?? null,
    })

    if (!stored) {
      console.log(`failed (file_id may have expired)`)
      failed++
      continue
    }

    const { error: updErr } = await sb
      .from('ticket_attachments')
      .update({
        storage_path: stored.storage_path,
        mime_type: stored.mime_type,
        file_size_bytes: stored.size_bytes,
        attachment_type: stored.attachment_type,
      })
      .eq('id', r.id)

    if (updErr) {
      console.log(`db update failed: ${updErr.message}`)
      failed++
      continue
    }

    console.log(`migrated → ${stored.storage_path.slice(-32)}`)
    migrated++
  }

  console.log('\n────────── Summary ──────────')
  console.log(`Migrated: ${migrated}`)
  console.log(`Skipped:  ${skipped}`)
  console.log(`Failed:   ${failed}`)
  if (failed > 0) {
    console.log('\nFailed rows kept their `telegram:` pointer — re-run later or')
    console.log('inspect the file_id manually. Telegram retains file_ids for ~1 year.')
  }
}

main().catch(err => {
  console.error('\n❌', err.message ?? err)
  process.exit(1)
})
