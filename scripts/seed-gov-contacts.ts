/**
 * scripts/seed-gov-contacts.ts
 *
 * Seeds the directory_contacts table with important AP & Telangana government
 * helplines and department contacts. Idempotent — skips rows where
 * (organization_id, phone) already exist.
 *
 * Usage:
 *   cd vocal-app
 *   npx tsx scripts/seed-gov-contacts.ts
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ORG_ID
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ORG_ID = process.env.ORG_ID!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ORG_ID) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface Contact {
  contact_name: string
  organization_name: string
  role_designation: string
  phone: string
  phone_alternate?: string
  email?: string
  availability_notes?: string
  internal_notes?: string
}

const CONTACTS: Contact[] = [
  // ── Emergency & National Helplines ─────────────────────────────────────────
  {
    contact_name: 'Emergency Response',
    organization_name: 'Police / Fire / Ambulance',
    role_designation: 'Emergency Helpline',
    phone: '112',
    availability_notes: '24/7 — All emergencies (police, fire, ambulance)',
  },
  {
    contact_name: 'Ambulance Service',
    organization_name: 'EMRI (Emergency Management and Research Institute)',
    role_designation: 'Ambulance Helpline',
    phone: '108',
    availability_notes: '24/7 — Free ambulance service across AP & Telangana',
  },
  {
    contact_name: 'Fire & Rescue Services',
    organization_name: 'State Fire Department',
    role_designation: 'Fire Helpline',
    phone: '101',
    availability_notes: '24/7',
  },
  {
    contact_name: 'Police Control Room',
    organization_name: 'State Police',
    role_designation: 'Police Helpline',
    phone: '100',
    availability_notes: '24/7',
  },
  {
    contact_name: 'Mobile Health Van / Arogya Raksha',
    organization_name: 'State Health Department',
    role_designation: 'Health Helpline',
    phone: '104',
    availability_notes: '24/7 — Health advice, mobile health units',
  },
  {
    contact_name: 'Women Helpline',
    organization_name: 'Ministry of Women & Child Development',
    role_designation: 'Women Safety Helpline',
    phone: '181',
    availability_notes: '24/7 — Domestic violence, harassment, safety',
  },
  {
    contact_name: 'Child Helpline (Childline India)',
    organization_name: 'Ministry of Women & Child Development',
    role_designation: 'Child Protection Helpline',
    phone: '1098',
    availability_notes: '24/7 — Child abuse, missing children, rescue',
  },
  {
    contact_name: 'Cyber Crime Helpline',
    organization_name: 'Ministry of Home Affairs — I4C',
    role_designation: 'Cyber Crime Helpline',
    phone: '1930',
    availability_notes: '24/7 — Online fraud, cyber crime reporting',
  },
  {
    contact_name: 'NALSA Legal Aid',
    organization_name: 'National Legal Services Authority',
    role_designation: 'Legal Aid Helpline',
    phone: '15100',
    availability_notes: 'Free legal aid for citizens',
  },
  {
    contact_name: 'Senior Citizens Helpline',
    organization_name: 'Ministry of Social Justice & Empowerment',
    role_designation: 'Elder Care Helpline',
    phone: '14567',
    availability_notes: 'Support for elderly citizens',
  },
  {
    contact_name: 'Kisan Call Centre',
    organization_name: 'Ministry of Agriculture & Farmers Welfare',
    role_designation: 'Farmer Helpline',
    phone: '1800-180-1551',
    availability_notes: 'Mon–Sat 6 AM–10 PM — Agricultural advice for farmers',
  },

  // ── Andhra Pradesh — Chief Minister's Office ─────────────────────────────
  {
    contact_name: "CM's Grievance Cell",
    organization_name: "Chief Minister's Office — Andhra Pradesh",
    role_designation: "CM's Spandana Helpline",
    phone: '1902',
    availability_notes: 'Mon–Sat 9 AM–5 PM — Public grievance redressal',
    internal_notes: 'Primary public grievance channel for AP citizens',
  },
  {
    contact_name: "AP Government Secretariat",
    organization_name: "Government of Andhra Pradesh",
    role_designation: "General Enquiry",
    phone: '0863-2340320',
    availability_notes: 'Mon–Fri 10 AM–5 PM',
  },

  // ── Telangana — Chief Minister's Office ───────────────────────────────────
  {
    contact_name: "CM's Helpline — Telangana",
    organization_name: "Chief Minister's Office — Telangana",
    role_designation: "CM Helpline",
    phone: '1100',
    availability_notes: '24/7 — Public grievances for Telangana',
    internal_notes: 'Primary public grievance channel for Telangana citizens',
  },
  {
    contact_name: "Telangana Secretariat",
    organization_name: "Government of Telangana",
    role_designation: "General Enquiry",
    phone: '040-23450985',
    availability_notes: 'Mon–Fri 10 AM–5 PM',
  },

  // ── Electricity ────────────────────────────────────────────────────────────
  {
    contact_name: 'APSPDCL Complaint Centre',
    organization_name: 'AP Southern Power Distribution Company Ltd',
    role_designation: 'Power Complaints (South AP)',
    phone: '1912',
    availability_notes: '24/7 — Power failures, billing queries',
    internal_notes: 'Covers Kurnool, Kadapa, Anantapur, Chittoor, Nellore districts',
  },
  {
    contact_name: 'APEPDCL Complaint Centre',
    organization_name: 'AP Eastern Power Distribution Company Ltd',
    role_designation: 'Power Complaints (North AP)',
    phone: '1912',
    availability_notes: '24/7 — Power failures, billing queries',
    internal_notes: 'Covers Visakhapatnam, Vijayawada, East & West Godavari',
  },
  {
    contact_name: 'TSSPDCL Complaint Centre',
    organization_name: 'Telangana State Southern Power Distribution Company Ltd',
    role_designation: 'Power Complaints (South Telangana)',
    phone: '1912',
    availability_notes: '24/7 — Power failures, billing',
    internal_notes: 'Covers Hyderabad, Rangareddy, Mahbubnagar, Nalgonda, Medak',
  },
  {
    contact_name: 'TSNPDCL Complaint Centre',
    organization_name: 'Telangana State Northern Power Distribution Company Ltd',
    role_designation: 'Power Complaints (North Telangana)',
    phone: '1912',
    availability_notes: '24/7 — Power failures, billing',
    internal_notes: 'Covers Warangal, Karimnagar, Nizamabad, Adilabad, Khammam',
  },

  // ── Water Supply ───────────────────────────────────────────────────────────
  {
    contact_name: 'HMWSSB Customer Care',
    organization_name: 'Hyderabad Metropolitan Water Supply & Sewerage Board',
    role_designation: 'Water Supply Complaints — Hyderabad',
    phone: '155313',
    phone_alternate: '040-23301111',
    availability_notes: '24/7 — Water supply, sewerage, billing',
  },
  {
    contact_name: 'AP Water Supply Helpline',
    organization_name: 'AP Water Resources Department',
    role_designation: 'Water Supply Helpline — AP',
    phone: '1916',
    availability_notes: 'Water supply issues across Andhra Pradesh',
  },

  // ── Anti-Corruption ────────────────────────────────────────────────────────
  {
    contact_name: 'AP Anti-Corruption Bureau',
    organization_name: 'Anti-Corruption Bureau — Andhra Pradesh',
    role_designation: 'Corruption Complaints',
    phone: '14400',
    phone_alternate: '0863-2341599',
    availability_notes: '24/7 — Report bribery and corruption by government officials',
  },
  {
    contact_name: 'Telangana ACB Helpline',
    organization_name: 'Anti-Corruption Bureau — Telangana',
    role_designation: 'Corruption Complaints',
    phone: '1064',
    availability_notes: '24/7 — Report corruption by government officials in Telangana',
  },

  // ── Civil Supplies / PDS ───────────────────────────────────────────────────
  {
    contact_name: 'Civil Supplies Helpline',
    organization_name: 'Civil Supplies Department',
    role_designation: 'PDS / Ration Card Helpline',
    phone: '1967',
    availability_notes: 'Ration card issues, PDS complaints, food distribution',
  },

  // ── Transport ──────────────────────────────────────────────────────────────
  {
    contact_name: 'APSRTC Customer Care',
    organization_name: 'AP State Road Transport Corporation',
    role_designation: 'Bus Services Helpline',
    phone: '0866-2570005',
    phone_alternate: '1800-200-9898',
    availability_notes: '6 AM–10 PM — Bus schedules, complaints, lost property',
  },
  {
    contact_name: 'TGSRTC Customer Care',
    organization_name: 'Telangana State Road Transport Corporation',
    role_designation: 'Bus Services Helpline',
    phone: '040-69440000',
    phone_alternate: '1800-200-9898',
    availability_notes: '6 AM–10 PM — Bus schedules, complaints, Hyderabad city buses',
  },

  // ── Municipal / Urban Local Bodies ────────────────────────────────────────
  {
    contact_name: 'GHMC Complaints',
    organization_name: 'Greater Hyderabad Municipal Corporation',
    role_designation: 'Civic Complaints — Hyderabad',
    phone: '040-21111111',
    phone_alternate: '1800-425-0011',
    availability_notes: '24/7 — Roads, garbage, drainage, street lights',
    internal_notes: 'Also accessible via GHMC app and Mee Seva portal',
  },
  {
    contact_name: 'GVMC Customer Care',
    organization_name: 'Greater Visakhapatnam Municipal Corporation',
    role_designation: 'Civic Complaints — Vizag',
    phone: '0891-2518888',
    availability_notes: 'Mon–Sat 9 AM–5 PM — Roads, sanitation, drainage',
  },
  {
    contact_name: 'VMC — Vijayawada',
    organization_name: 'Vijayawada Municipal Corporation',
    role_designation: 'Civic Complaints — Vijayawada',
    phone: '0866-2578888',
    availability_notes: 'Mon–Sat 9 AM–5 PM',
  },

  // ── Disaster Management ────────────────────────────────────────────────────
  {
    contact_name: 'AP Disaster Management (APSDMA)',
    organization_name: 'AP State Disaster Management Authority',
    role_designation: 'Disaster Helpline — AP',
    phone: '1070',
    phone_alternate: '0866-2410000',
    availability_notes: '24/7 — Floods, cyclones, natural disasters',
  },
  {
    contact_name: 'Telangana Disaster Management (TSDMA)',
    organization_name: 'Telangana State Disaster Management Authority',
    role_designation: 'Disaster Helpline — Telangana',
    phone: '1077',
    phone_alternate: '040-23456777',
    availability_notes: '24/7 — Floods, natural disasters, emergency relief',
  },

  // ── Health ─────────────────────────────────────────────────────────────────
  {
    contact_name: 'AP Health Complaints',
    organization_name: 'Directorate of Health — Andhra Pradesh',
    role_designation: 'Health Grievance Helpline',
    phone: '104',
    availability_notes: '24/7 — Health advice, ASHA workers, hospital queries',
    internal_notes: 'Same number as the national health helpline, routed state-wise',
  },
  {
    contact_name: 'Telangana Health Helpline',
    organization_name: 'Directorate of Health — Telangana',
    role_designation: 'Health Grievance Helpline',
    phone: '104',
    availability_notes: '24/7 — Hospital queries, ambulance, health schemes',
  },
  {
    contact_name: 'AAROGYASRI Helpline',
    organization_name: 'Aarogyasri Health Care Trust — AP',
    role_designation: 'Health Insurance Helpline',
    phone: '1800-425-1661',
    availability_notes: 'Free health insurance scheme — pre-auth, claims, hospital empanelment',
    internal_notes: 'Covers BPL families across Andhra Pradesh',
  },
  {
    contact_name: 'Aarogya Lakshmi / KCR Kit Helpline',
    organization_name: 'Directorate of Women Development & Child Welfare — Telangana',
    role_designation: 'Maternal Health Scheme',
    phone: '040-23390228',
    availability_notes: 'Nutrition kits and maternal health support for pregnant women',
  },

  // ── Revenue & Land Records ─────────────────────────────────────────────────
  {
    contact_name: 'Mee Seva / MeeSeva Help Desk',
    organization_name: 'AP e-Governance Authority',
    role_designation: 'e-Government Services Portal',
    phone: '1100',
    phone_alternate: '0866-2410123',
    availability_notes: 'Certificates, land records, Aadhaar linkage, government services',
    internal_notes: 'One-stop shop for all AP government certificates and services',
  },
  {
    contact_name: 'TS Dharani Helpline',
    organization_name: 'Revenue Department — Telangana',
    role_designation: 'Land Records Portal — Telangana',
    phone: '1800-599-4788',
    availability_notes: 'Land registration, mutation, Pattadar Passbooks (Telangana)',
  },

  // ── Panchayat Raj & Rural Development ─────────────────────────────────────
  {
    contact_name: 'AP Panchayat Raj Help Desk',
    organization_name: 'Panchayat Raj Department — AP',
    role_designation: 'Rural Grievances',
    phone: '1800-425-2977',
    availability_notes: 'Village-level grievances, NREGA, rural roads, Gram Panchayat issues',
  },
  {
    contact_name: 'TS Panchayat Raj Help Desk',
    organization_name: 'Panchayat Raj Department — Telangana',
    role_designation: 'Rural Grievances',
    phone: '040-23392959',
    availability_notes: 'Village-level grievances, rural development issues (Telangana)',
  },

  // ── Social Welfare ─────────────────────────────────────────────────────────
  {
    contact_name: 'AP Tribal Welfare Helpline',
    organization_name: 'Tribal Welfare Department — AP',
    role_designation: 'Tribal / Scheduled Tribe Welfare',
    phone: '1800-599-4411',
    availability_notes: 'Scholarships, welfare schemes, Girijan issues',
  },
  {
    contact_name: 'TS SC/ST Welfare Helpline',
    organization_name: 'SC/ST Welfare Department — Telangana',
    role_designation: 'SC/ST Welfare Schemes',
    phone: '040-23392018',
    availability_notes: 'Scholarships, Dalit Bandhu, reservation issues (Telangana)',
  },
]

async function main() {
  console.log(`Seeding ${CONTACTS.length} government contacts for org: ${ORG_ID}`)

  // Fetch existing phones to skip duplicates
  const { data: existing } = await supabase
    .from('directory_contacts')
    .select('phone')
    .eq('organization_id', ORG_ID)

  const existingPhones = new Set((existing ?? []).map(r => r.phone))

  // Need a valid user ID for created_by — use the first active org member
  const { data: firstUser } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', ORG_ID)
    .eq('active', true)
    .limit(1)
    .single()

  if (!firstUser) {
    console.error('No active users found in org — cannot set created_by.')
    process.exit(1)
  }

  const toInsert = CONTACTS
    .filter(c => !existingPhones.has(c.phone))
    .map(c => ({
      organization_id: ORG_ID,
      created_by: firstUser.id,
      contact_name: c.contact_name,
      organization_name: c.organization_name,
      role_designation: c.role_designation,
      phone: c.phone,
      phone_alternate: c.phone_alternate ?? null,
      email: c.email ?? null,
      availability_notes: c.availability_notes ?? null,
      internal_notes: c.internal_notes ?? null,
      verification_status: 'verified',
    }))

  if (toInsert.length === 0) {
    console.log('All contacts already exist — nothing to insert.')
    return
  }

  const { error } = await supabase.from('directory_contacts').insert(toInsert)
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }

  console.log(`✓ Inserted ${toInsert.length} contacts (${CONTACTS.length - toInsert.length} already existed).`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
