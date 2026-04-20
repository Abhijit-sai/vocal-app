/**
 * scripts/seed-test-users.ts
 *
 * Creates 10 test users in Clerk AND matching `users` rows in Supabase so
 * you can log into the dashboard as every role. Idempotent — re-running will
 * skip accounts that already exist (by email) but keep their passwords.
 *
 * Usage:
 *   cd vocal-app
 *   npx tsx scripts/seed-test-users.ts
 *
 * Requires env:
 *   CLERK_SECRET_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ORG_ID            (the organizations.id this test org maps to)
 *
 * Output: a table of { email, password, role, full_name } — shared password
 * is 'Vocal!Test2026'. Keep it out of screenshots.
 */

import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (no dotenv dependency) so the script runs with
// just `npx tsx` and zero setup.
import fs from 'node:fs'
import path from 'node:path'
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG_ID = process.env.ORG_ID

if (!CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY missing')
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase env missing')
if (!ORG_ID) throw new Error('ORG_ID missing')

const SHARED_PASSWORD = 'Vocal!Test2026'

// Role UUIDs from seed data in migration 001.
const ROLE = {
  super_admin:     '00000000-0000-0000-0000-000000000001',
  central_support: '00000000-0000-0000-0000-000000000002',
  state_leader:    '00000000-0000-0000-0000-000000000003',
  district_leader: '00000000-0000-0000-0000-000000000004',
  ground_worker:   '00000000-0000-0000-0000-000000000005',
  media_volunteer: '00000000-0000-0000-0000-000000000006',
  legal_support:   '00000000-0000-0000-0000-000000000007',
} as const

type TestUser = {
  email: string
  firstName: string
  lastName: string
  role: keyof typeof ROLE
}

const USERS: TestUser[] = [
  { email: 'vocal-test-super@example.com',    firstName: 'Avi',   lastName: 'Kumar',  role: 'super_admin' },
  { email: 'vocal-test-cs1@example.com',      firstName: 'Nisha', lastName: 'Rao',    role: 'central_support' },
  { email: 'vocal-test-cs2@example.com',      firstName: 'Rahul', lastName: 'Singh',  role: 'central_support' },
  { email: 'vocal-test-state@example.com',    firstName: 'Meera', lastName: 'Iyer',   role: 'state_leader' },
  { email: 'vocal-test-district@example.com', firstName: 'Vikram',lastName: 'Patel',  role: 'district_leader' },
  { email: 'vocal-test-worker1@example.com',  firstName: 'Sanjay',lastName: 'Gupta',  role: 'ground_worker' },
  { email: 'vocal-test-worker2@example.com',  firstName: 'Priya', lastName: 'Desai',  role: 'ground_worker' },
  { email: 'vocal-test-worker3@example.com',  firstName: 'Arjun', lastName: 'Nair',   role: 'ground_worker' },
  { email: 'vocal-test-media@example.com',    firstName: 'Kavya', lastName: 'Joshi',  role: 'media_volunteer' },
  { email: 'vocal-test-legal@example.com',    firstName: 'Rohan', lastName: 'Shah',   role: 'legal_support' },
]

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function clerkFetch(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.errors?.[0]?.message ?? res.statusText
    throw new Error(`Clerk ${init.method ?? 'GET'} ${pathname} → ${res.status}: ${msg}`)
  }
  return body
}

async function findClerkUserByEmail(email: string): Promise<string | null> {
  const list = await clerkFetch(`/users?email_address=${encodeURIComponent(email)}`)
  if (Array.isArray(list) && list.length > 0) return list[0].id
  return null
}

async function createClerkUser(u: TestUser): Promise<string> {
  const existing = await findClerkUserByEmail(u.email)
  if (existing) return existing
  const body = await clerkFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [u.email],
      password: SHARED_PASSWORD,
      first_name: u.firstName,
      last_name:  u.lastName,
      skip_password_checks: true,
      skip_password_requirement: false,
    }),
  })
  return body.id
}

async function upsertSupabaseUser(u: TestUser, clerkUserId: string) {
  const fullName = `${u.firstName} ${u.lastName}`
  const roleId = ROLE[u.role]

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()

  if (existing) {
    await supabase.from('users').update({
      full_name: fullName, email: u.email, role_id: roleId, active: true,
    }).eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      clerk_user_id: clerkUserId,
      organization_id: ORG_ID,
      full_name: fullName,
      email: u.email,
      role_id: roleId,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id
}

async function seedTerritories(workerIds: string[]) {
  // Find or create a territory for this org so auto-assign has something to
  // route against. We upsert a single "Demo Territory" with a centroid in
  // Hyderabad so haversine distance sorting works during demos.
  const { data: existing } = await supabase
    .from('territories')
    .select('id')
    .eq('organization_id', ORG_ID!)
    .limit(1)
    .maybeSingle()

  let territoryId: string

  if (existing?.id) {
    territoryId = existing.id
    // Ensure centroid is set so distance sorting works
    await supabase
      .from('territories')
      .update({ centroid_lat: 17.385, centroid_lng: 78.4867 })
      .eq('id', territoryId)
    console.log(`  ↳ Using existing territory ${territoryId}`)
  } else {
    // Find a level definition to attach the territory to
    const { data: levelDef } = await supabase
      .from('territory_level_definitions')
      .select('id')
      .eq('organization_id', ORG_ID!)
      .order('level_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: newTerr, error } = await supabase
      .from('territories')
      .insert({
        organization_id: ORG_ID!,
        name: 'Demo Territory',
        code: 'DEMO',
        level_definition_id: levelDef?.id ?? null,
        centroid_lat: 17.385,   // Hyderabad
        centroid_lng: 78.4867,
        active: true,
      })
      .select('id')
      .single()
    if (error || !newTerr) { console.error('  ✗ Failed to create territory:', error?.message); return }
    territoryId = newTerr.id
    console.log(`  ↳ Created territory ${territoryId} (Demo Territory, Hyderabad centroid)`)
  }

  // Upsert user_territories for every ground_worker
  for (const workerId of workerIds) {
    const { error } = await supabase
      .from('user_territories')
      .upsert(
        { user_id: workerId, territory_id: territoryId, is_primary: true },
        { onConflict: 'user_id,territory_id', ignoreDuplicates: true }
      )
    if (error) console.error(`  ✗ user_territories for ${workerId}:`, error.message)
  }
  console.log(`  ↳ Assigned ${workerIds.length} workers to territory ${territoryId}`)
}

async function main() {
  console.log(`Seeding ${USERS.length} users into org ${ORG_ID} ...`)
  const rows: Array<{ email: string; role: string; password: string; full_name: string; supabase_id: string }> = []
  const workerSupabaseIds: string[] = []

  for (const u of USERS) {
    try {
      const clerkId = await createClerkUser(u)
      const supaId  = await upsertSupabaseUser(u, clerkId)
      rows.push({
        email: u.email,
        role: u.role,
        password: SHARED_PASSWORD,
        full_name: `${u.firstName} ${u.lastName}`,
        supabase_id: supaId,
      })
      if (u.role === 'ground_worker') workerSupabaseIds.push(supaId)
      console.log(`  ✓ ${u.email}  (${u.role})`)
    } catch (err) {
      console.error(`  ✗ ${u.email}:`, err instanceof Error ? err.message : err)
    }
  }

  // Seed user_territories so auto-assign can find workers
  if (workerSupabaseIds.length > 0) {
    console.log(`\nSeeding territories for ${workerSupabaseIds.length} ground workers ...`)
    await seedTerritories(workerSupabaseIds)
  }

  console.log('\nTest credentials (all users share the same password):\n')
  console.table(rows)
  console.log(`\nSign in at /sign-in with any of the above. Shared password: ${SHARED_PASSWORD}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
