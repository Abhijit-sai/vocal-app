-- =============================================================================
-- Vocal - Seed Script
-- Run this AFTER applying migrations 001 and 002.
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Insert the organization
--    Copy the returned UUID into your .env.local as ORG_ID
INSERT INTO organizations (name, slug, active)
VALUES ('Demo Organization', 'demo', true)
RETURNING id, name, slug;

-- 2. Insert territory level definitions for India deployment
--    (adjust labels for your country if needed)
INSERT INTO territory_level_definitions (organization_id, level_order, label)
SELECT id, 1, 'State'       FROM organizations WHERE slug = 'demo'
UNION ALL
SELECT id, 2, 'District'    FROM organizations WHERE slug = 'demo'
UNION ALL
SELECT id, 3, 'Constituency' FROM organizations WHERE slug = 'demo'
UNION ALL
SELECT id, 4, 'Mandal'      FROM organizations WHERE slug = 'demo'
UNION ALL
SELECT id, 5, 'Ward / Booth' FROM organizations WHERE slug = 'demo';

-- 3. Insert a sample territory tree (optional — add your real territories later)
--    First create a state-level entry
INSERT INTO territories (organization_id, name, code, level_definition_id)
SELECT
  o.id,
  'Demo State',
  'DS',
  tl.id
FROM organizations o
JOIN territory_level_definitions tl ON tl.organization_id = o.id AND tl.level_order = 1
WHERE o.slug = 'demo'
RETURNING id, name;

-- 4. Insert organization settings (with defaults)
INSERT INTO organization_settings (organization_id)
SELECT id FROM organizations WHERE slug = 'demo';

-- =============================================================================
-- AFTER RUNNING THE ABOVE:
-- 1. Copy the UUID from step 1 (the organizations.id value) into .env.local as ORG_ID
-- 2. Sign in to the Vocal app with your Clerk account
-- 3. Note the Clerk user ID from Clerk dashboard (starts with "user_...")
-- 4. Run the query below (replacing the placeholders) to create your super_admin user:
-- =============================================================================

-- 5. Create your super_admin user record (run separately after sign-in)
--    Replace: YOUR_CLERK_USER_ID, YOUR_FULL_NAME, YOUR_EMAIL
/*
INSERT INTO users (
  clerk_user_id,
  organization_id,
  full_name,
  email,
  role_id,
  active,
  approved_at
)
SELECT
  'YOUR_CLERK_USER_ID',        -- e.g. user_2abc123...
  o.id,
  'YOUR_FULL_NAME',
  'YOUR_EMAIL',
  r.id,
  true,
  now()
FROM organizations o, roles r
WHERE o.slug = 'demo'
AND r.name = 'super_admin';
*/
