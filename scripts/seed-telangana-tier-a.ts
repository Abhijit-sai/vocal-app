/**
 * scripts/seed-telangana-tier-a.ts
 * ================================
 *
 * Seeds the Telangana geographic tree (Tier A) into the `territories` table
 * and the `territory_level_definitions` table for a given organization.
 *
 * Tier A scope:
 *   • 1  state         (Telangana)
 *   • 33 districts
 *   • 119 assembly constituencies (per ECI 2023 delimitation)
 *   • 13 mandals for Rajanna Sircilla district (where Sircilla AC launches)
 *   • Mandals for the other 32 districts: deferred — add via CSV or a
 *     per-district seed file once authoritative data is on hand.
 *
 * Idempotent — re-runs skip rows that already exist (matched by
 * organization_id + parent_territory_id + name).
 *
 * Usage:
 *   cd vocal-app
 *   npm run seed:telangana-tier-a
 *   # or with a custom org:
 *   ORG_ID=<uuid> npx tsx scripts/seed-telangana-tier-a.ts
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ORG_ID
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { tenantGeography } from '../config/tenant.config'

// ── env bootstrap (no dotenv dependency) ────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ORG_ID = process.env.ORG_ID!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ORG_ID) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── data loading ────────────────────────────────────────────────────────────
const dataDir = path.resolve(__dirname, 'data', 'telangana')

interface DistrictRow {
  name: string
  headquarters: string
  mandals_count: number
  centroid_lat: number
  centroid_lng: number
}

interface ConstituencyRow {
  number: number
  name: string
  district: string
  reservation: 'GEN' | 'SC' | 'ST'
}

interface MandalRow {
  name: string
  revenue_division?: string
  constituency?: string
  centroid_lat?: number
  centroid_lng?: number
}

interface MandalFile {
  district: string
  source?: string
  verified_at?: string
  note?: string
  mandals: MandalRow[]
}

function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, rel), 'utf8')) as T
}

const districts      = loadJson<DistrictRow[]>('districts.json')
const constituencies = loadJson<ConstituencyRow[]>('constituencies.json')

// Each mandal file covers one district; we glob the mandals/ folder.
const mandalFiles = fs.readdirSync(path.join(dataDir, 'mandals'))
  .filter(f => f.endsWith('.json'))
  .map(f => loadJson<MandalFile>(`mandals/${f}`))

// ── level definitions ───────────────────────────────────────────────────────
// Match the labels defined in TENANT_CONFIG.geography.levels.
const LEVELS = tenantGeography.levels // ['state','district','constituency','mandal','ward']

async function upsertLevelDefinitions(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  for (let i = 0; i < LEVELS.length; i++) {
    const label = LEVELS[i]
    const order = i + 1

    // Check if it already exists
    const { data: existing } = await sb
      .from('territory_level_definitions')
      .select('id, label')
      .eq('organization_id', ORG_ID)
      .eq('level_order', order)
      .maybeSingle()

    if (existing) {
      map[label] = existing.id
      continue
    }

    const { data: created, error } = await sb
      .from('territory_level_definitions')
      .insert({
        organization_id: ORG_ID,
        level_order: order,
        label: capitalize(label),
        active: true,
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(`Failed to insert level ${label}: ${error?.message}`)
    map[label] = created.id
  }
  return map
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── territory upsert helper ────────────────────────────────────────────────
async function upsertTerritory(args: {
  name: string
  code?: string | null
  levelDefId: string
  parentId: string | null
  centroidLat?: number | null
  centroidLng?: number | null
  metadata?: Record<string, unknown>
}): Promise<{ id: string; created: boolean }> {
  // Match on (organization_id, parent_territory_id, name) — uniqueness key.
  let query = sb
    .from('territories')
    .select('id')
    .eq('organization_id', ORG_ID)
    .eq('name', args.name)
    .eq('level_definition_id', args.levelDefId)
  query = args.parentId
    ? query.eq('parent_territory_id', args.parentId)
    : query.is('parent_territory_id', null)

  const { data: existing } = await query.maybeSingle()
  if (existing) return { id: existing.id, created: false }

  const { data: created, error } = await sb
    .from('territories')
    .insert({
      organization_id: ORG_ID,
      name: args.name,
      code: args.code ?? null,
      level_definition_id: args.levelDefId,
      parent_territory_id: args.parentId,
      centroid_lat: args.centroidLat ?? null,
      centroid_lng: args.centroidLng ?? null,
      metadata_json: args.metadata ?? null,
      active: true,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`Insert failed for ${args.name}: ${error?.message}`)
  return { id: created.id, created: true }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding Telangana Tier A → org ${ORG_ID}`)
  console.log('=========================================')

  const levelIds = await upsertLevelDefinitions()
  console.log('✓ Level definitions:', Object.keys(levelIds).join(' → '))

  // 1. State
  const state = await upsertTerritory({
    name: tenantGeography.rootName, // "Telangana"
    code: 'TG',
    levelDefId: levelIds[LEVELS[0]],
    parentId: null,
    centroidLat: tenantGeography.rootCentroid.lat,
    centroidLng: tenantGeography.rootCentroid.lng,
    metadata: { country: tenantGeography.country },
  })
  console.log(`✓ State: ${tenantGeography.rootName} (${state.created ? 'created' : 'exists'})`)

  // 2. Districts
  const districtIds: Record<string, string> = {}
  let districtsCreated = 0
  for (const d of districts) {
    const { id, created } = await upsertTerritory({
      name: d.name,
      levelDefId: levelIds[LEVELS[1]],
      parentId: state.id,
      centroidLat: d.centroid_lat,
      centroidLng: d.centroid_lng,
      metadata: {
        headquarters: d.headquarters,
        mandals_count_official: d.mandals_count,
      },
    })
    districtIds[d.name] = id
    if (created) districtsCreated++
  }
  console.log(`✓ Districts: ${districtsCreated} created / ${districts.length - districtsCreated} existing`)

  // 3. Constituencies
  let acsCreated = 0
  let acsSkipped = 0
  for (const ac of constituencies) {
    const parentId = districtIds[ac.district]
    if (!parentId) {
      console.warn(`  ⚠ AC '${ac.name}' references unknown district '${ac.district}' — skipping`)
      acsSkipped++
      continue
    }
    const { created } = await upsertTerritory({
      name: ac.name,
      code: String(ac.number),
      levelDefId: levelIds[LEVELS[2]],
      parentId,
      metadata: {
        ac_number: ac.number,
        reservation: ac.reservation,
      },
    })
    if (created) acsCreated++
  }
  console.log(`✓ Constituencies: ${acsCreated} created / ${constituencies.length - acsCreated - acsSkipped} existing / ${acsSkipped} skipped`)

  // 4. Mandals (only for districts with data files)
  let mandalsCreated = 0
  let mandalsSkipped = 0
  for (const file of mandalFiles) {
    const parentDistrictId = districtIds[file.district]
    if (!parentDistrictId) {
      console.warn(`  ⚠ Mandal file references unknown district '${file.district}' — skipping`)
      continue
    }
    for (const m of file.mandals) {
      // Resolve the constituency parent if specified — falls back to district
      // if no AC mapping exists.
      let parentId = parentDistrictId
      if (m.constituency) {
        const { data: ac } = await sb
          .from('territories')
          .select('id')
          .eq('organization_id', ORG_ID)
          .eq('name', m.constituency)
          .eq('level_definition_id', levelIds[LEVELS[2]])
          .maybeSingle()
        if (ac) parentId = ac.id
      }
      const { created } = await upsertTerritory({
        name: m.name,
        levelDefId: levelIds[LEVELS[3]],
        parentId,
        centroidLat: m.centroid_lat ?? null,
        centroidLng: m.centroid_lng ?? null,
        metadata: {
          revenue_division: m.revenue_division,
          constituency: m.constituency,
          district: file.district,
        },
      })
      if (created) mandalsCreated++
      else mandalsSkipped++
    }
  }
  console.log(`✓ Mandals: ${mandalsCreated} created / ${mandalsSkipped} existing  (${mandalFiles.length} district file(s) processed)`)

  // Summary
  console.log('\n────────── Summary ──────────')
  console.log(`State:           1`)
  console.log(`Districts:       ${districts.length}`)
  console.log(`Constituencies:  ${constituencies.length - acsSkipped}`)
  console.log(`Mandals:         ${mandalsCreated + mandalsSkipped}`)
  console.log(`\nDistricts with mandals seeded:`)
  for (const f of mandalFiles) console.log(`  • ${f.district} (${f.mandals.length} mandals)`)
  console.log(`\nDistricts WITHOUT mandals (load via CSV when ready):`)
  for (const d of districts) {
    if (!mandalFiles.find(f => f.district === d.name)) {
      console.log(`  • ${d.name} (${d.mandals_count} mandals official)`)
    }
  }
  console.log('\n✅ Done.')
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message ?? err)
  process.exit(1)
})
