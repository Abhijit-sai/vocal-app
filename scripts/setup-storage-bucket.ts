/**
 * scripts/setup-storage-bucket.ts
 * ==============================
 *
 * Idempotently provisions the `ticket-attachments` Supabase Storage bucket
 * used by E1 (image attachments). Safe to re-run.
 *
 * The bucket is PRIVATE — reads go through application-level signed URLs
 * generated in `services/attachmentService.ts`. Writes go through the
 * service-role client which bypasses storage RLS.
 *
 * Run:
 *   cd vocal-app
 *   npx tsx scripts/setup-storage-bucket.ts
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

export const BUCKET_NAME = 'ticket-attachments'
// 25 MB max file size — matches PRD §17.2 spec.
const FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'application/pdf',
]

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\nProvisioning Supabase Storage bucket "${BUCKET_NAME}"`)
  console.log('=================================================')

  // Check whether the bucket exists.
  const { data: existing, error: listErr } = await sb.storage.listBuckets()
  if (listErr) {
    console.error('Failed to list buckets:', listErr.message)
    process.exit(1)
  }
  const found = existing?.find(b => b.name === BUCKET_NAME)

  if (found) {
    console.log(`✓ Bucket already exists (id=${found.id}, public=${found.public})`)
    // Update the limits / MIME list if they drift from this script.
    const { error: updateErr } = await sb.storage.updateBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    })
    if (updateErr) {
      console.warn('⚠ Failed to update bucket policy:', updateErr.message)
    } else {
      console.log('✓ Bucket policy updated (private, 25 MB, MIME allowlist)')
    }
  } else {
    const { error: createErr } = await sb.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    })
    if (createErr) {
      console.error('❌ Failed to create bucket:', createErr.message)
      process.exit(1)
    }
    console.log(`✓ Bucket created`)
  }

  console.log('\nDone.')
  console.log('\nNotes:')
  console.log('  • Bucket is PRIVATE. Reads use server-generated signed URLs.')
  console.log(`  • Path convention: org/<org_id>/ticket/<ticket_id>/<uuid>.<ext>`)
  console.log('  • Service role bypasses storage RLS — no policies needed.')
}

main().catch(err => {
  console.error('\n❌', err.message ?? err)
  process.exit(1)
})
