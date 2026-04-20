# Vocal — Project Summary

**Last updated:** 2026-04-20 (shipped to prod, worker queue + load balancing)
**Purpose:** Persistent context for future Claude sessions. Read this first before
making changes — it captures the current state of the codebase, known bugs,
pending work, and important gotchas that are not obvious from the code.

> **Also read `AGENTS.md`** at the project root — it flags that this is
> Next.js 16 (breaking changes vs. training data). Check
> `node_modules/next/dist/docs/` before writing routing / middleware / caching
> code.

---

## 0. Where we left off (resume here)

**Latest session (2026-04-20): shipped to prod + worker queue + load-balanced
assignment.** The app now lives at **https://vocal-app-one.vercel.app**
(GitHub: `Abhijit-sai/vocal-app`). Prod Telegram webhook is registered
permanently against the Vercel URL — no more cloudflared cycling for
demos. Ground workers finally have their own UI at `/my-assignments`,
and the auto-assign algorithm now load-balances across the least-loaded
candidates with territory → org-wide fallback. See §12 for details.

Current state at resumption:

- **Prod:** Vercel deployed, webhook live, 10 seeded test users covering
  every role (shared password `Vocal!Test2026`). A Hyderabad "Demo
  Territory" (17.385, 78.4867) is seeded and every ground_worker is
  attached to it via `user_territories`.
- **Code state:** All §11 work is in main plus the §12 additions:
  `services/assignmentService.ts` load-balanced sort, seeding script
  that now backfills territories, `/my-assignments` worker queue page
  with live countdown + accept/reject, sidebar nav update.
- **DB state:** same as §11 — RLS still effectively off (service
  client everywhere), migrations 001–003 applied.

**First moves for a new session:** open §12 to see exactly what shipped
on 2026-04-20, then pick from §7 pending work (vercel cron for
`expire-assignments` is the top un-done item).

---

## 1. What Vocal is

Civic issue management platform for political organizations / NGOs. Citizens
report problems via a Telegram bot; central support triages them; ground workers
in the right territory accept and resolve. Built on Next.js 16 + Supabase +
Clerk + OpenRouter (AI enrichment).

Roles: `super_admin`, `central_support`, `state_leader`, `district_leader`,
`ground_worker`, `media_volunteer`, `legal_support`.

Stage model: `to_do → in_progress → on_hold → closed` (with a `sub_status`
enum that drives the actual workflow; there's a `SUB_STATUS_STAGE_MAP`
somewhere in the code).

---

## 2. Stack + conventions

- **Next.js 16** App Router. **`proxy.ts`** at project root replaces the
  old `middleware.ts` — this is a Next 16 breaking change. Export name is
  `proxy`, wraps `clerkMiddleware(...)`.
- **Tailwind v4** via `@import "tailwindcss"` in `app/globals.css`.
  **Never add unlayered `* { margin: 0; padding: 0 }` resets** — Tailwind v4
  puts utilities in `@layer utilities`, and unlayered rules beat layered rules
  under CSS cascade-layer precedence. This killed `ml-auto`, `space-y-*`, etc.
  in this project before we found it. Preflight already handles the reset.
- **Semantic CSS tokens** in `globals.css`: `--shell-*` (dark nav chrome),
  `--canvas-*` (light work area), `--primary`, `--stage-*`, `--sev-*`,
  `--alert-*`, `--shadow-*`, `--radius-*`. Always use these — never hex.
- **Clerk** for auth. User record is bootstrapped via
  `getCurrentVocalUser()` in `lib/supabase/server.ts` which matches
  `clerk_user_id` against `users.clerk_user_id`.
- **Supabase** clients in `lib/supabase/server.ts`:
  - `createSupabaseServerClient()` — cookie-backed anon, mostly unused.
  - `createSupabaseUserClient()` — anon + Clerk token via `accessToken()`
    callback. Requires Clerk enabled as Supabase third-party auth
    (Dashboard → Authentication → Third-Party Auth → Clerk). **Not yet
    configured in the Supabase dashboard** — that's why pages still use
    the service client.
  - `createSupabaseServiceClient()` — service-role, bypasses RLS. Used for
    webhooks, privileged admin writes, audit log inserts.
- **OpenRouter** for AI enrichment. Called from
  `services/aiService.generateTicketSuggestions`. Non-blocking, fire-and-forget
  (errors are swallowed — ticket creation must succeed even if AI is down).

---

## 3. Route map

```
app/
  (auth)/
    sign-in/[[...sign-in]]/page.tsx  — Clerk SignIn, branded
    sign-up/[[...sign-up]]/page.tsx  — Clerk SignUp, branded
  (dashboard)/
    layout.tsx        — Sidebar + main, pending-activation fallback
    dashboard/        — Overview: Action Required + Pipeline + Recent
    tickets/          — List w/ segmented filter + search
    tickets/[id]/     — Detail w/ breadcrumb, notes, history, AI banner
    triage/           — super_admin + central_support only
    reports/          — KPIs + resolution rate + stage breakdown + top cats
    workers/          — Roster + pending activation (read-only)
    directory/        — Contacts cards (read-only)
    amplify/          — Sessions list (read-only)
    audit/            — Event log with filters
  api/
    tickets/
      confirm-ai/route.ts     — POST, confirms AI suggestions
      status/route.ts         — POST, stage/sub-status changes
    webhooks/
      telegram/route.ts       — POST from Telegram Bot API
```

Every dashboard page has a colocated `loading.tsx` using the skeleton
primitives in `components/ui/Skeleton.tsx`.

---

## 4. Known bugs / gotchas (MUST READ)

### 4a. `ORG_ID` in `.env.local` must match an org that exists

The Telegram webhook inserts `organization_id: process.env.ORG_ID` into
several tables. All of them have FK to `organizations(id)`. If the env value
doesn't point to a real org, every insert fails, the catch block also fails
(tries to audit-log with the same bad id), and the bot silently drops every
message. No rows appear in `channel_messages` or `audit_logs`.

**The correct ORG_ID as of writing: `3f3ff0a3-1ee4-49a5-a956-9e2461a592e3`
(slug `demo`).** Verify with:
```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/organizations?select=id,slug" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

### 4b. `generate_ticket_number` migration 003 is written but NOT applied

`supabase/migrations/003_org_scoped_ticket_numbers.sql` changes the function
signature from `(org_slug text)` to `(org_id uuid, org_slug text)`. The caller
in `services/ticketService.ts` is currently reverted to the old signature
(single-arg) so ticket creation works. When applying migration 003:
1. `supabase db push` (or equivalent)
2. Change the `.rpc(...)` call in `ticketService.ts` to pass both
   `org_id` and `org_slug`.
3. Commit both together.

### 4c. Supabase search injection — fixed

`app/(dashboard)/tickets/page.tsx`, `directory/page.tsx`, `audit/page.tsx`
all sanitize user search input before passing to `.or(…)` / `.ilike(…)` —
they strip PostgREST metachars `,()."'` and escape LIKE wildcards `%` `_`.
If you add another search box, reuse this pattern.

### 4d. RLS is defined but not enforced

Migration `002_rls_policies.sql` enables RLS and defines policies using
`auth.uid()::text = clerk_user_id`. Every page still uses
`createSupabaseServiceClient()` which bypasses RLS. To turn RLS on for real:
1. Supabase Dashboard → Authentication → Third-Party Auth → add Clerk.
2. Switch pages from `createSupabaseServiceClient` to `createSupabaseUserClient`
   one at a time.
3. Verify each page still loads for each role.

### 4f. Don't embed the same PostgREST resource twice without aliases

`tickets` has both `category_id` and `subcategory_id` pointing at
`issue_categories`. Selecting with two unaliased embeds:

```ts
.select(`
  *,
  issue_categories!tickets_category_id_fkey(id, name),
  issue_categories!tickets_subcategory_id_fkey(id, name)
`)
```

collides on the output key `issue_categories` and the query errors out —
which the ticket detail page treated as "not found" and showed a 404 for
every single ticket. Always alias embeds when the same table is used more
than once:

```ts
category:issue_categories!tickets_category_id_fkey(id, name),
subcategory:issue_categories!tickets_subcategory_id_fkey(id, name)
```

Fixed in `app/(dashboard)/tickets/[id]/page.tsx`. If you see a "ticket not
found" on a ticket that exists, look here first — and we now log the
Supabase error to the server console before calling `notFound()`.

### 4e. Quick cloudflared tunnels are ephemeral

URL changes every restart. Re-registering the Telegram webhook each time is
annoying. For stable dev, either
- `cloudflared tunnel login` + named tunnel on a subdomain you own, or
- ngrok free tier with a reserved subdomain.

---

## 5. Environment variables expected

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=   # echoed back in X-Telegram-Bot-Api-Secret-Token

# Org binding for webhook
ORG_ID=3f3ff0a3-1ee4-49a5-a956-9e2461a592e3   # MUST match organizations.id

# AI (optional — failures swallowed)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

---

## 6. Session history — what's been done

### Earlier session
- Renamed `middleware.ts` → `proxy.ts` for Next 16 compatibility.
- Created missing `/api/tickets/confirm-ai` endpoint (form + JSON bodies).
- Fixed `reassignment_pending` → `on_hold` stage mapping in
  `/api/tickets/status`.
- Full rewrite of `globals.css` to semantic-token system (shell/canvas/stage/
  sev/alert).
- Rewrote `Badge`, `PageHeader`, `Sidebar` components.
- Redesigned Dashboard (Action Required / Pipeline / Recent sections).
- Redesigned TicketTable with mobile card view.
- Redesigned tickets list page (segmented filter + icon search).
- Redesigned ticket detail page (breadcrumb + issue emphasis + parallel queries).

### Hotfix — ticket detail 404 on every ticket
- Root cause: `app/(dashboard)/tickets/[id]/page.tsx` was selecting
  `issue_categories` twice (category + subcategory) without aliases. The two
  embeds collided on the output key and the query errored; the page
  interpreted the error as "not found" and returned 404 for every ticket.
- Fix: aliased the embeds (`category:issue_categories!…`,
  `subcategory:issue_categories!…`, `owner:users!…`) and added a
  `console.error` of the Supabase error before `notFound()` so this class
  of bug is visible next time. Documented in §4f.

### Resumed session — Telegram guided intake + Amplify + Ticket actions polish

**Telegram bot is now a guarded intake state machine.** A plain "Hi" no longer
becomes a ticket. The bot walks the citizen through: greeting → collecting
issue → collecting media → collecting location → summary confirm → file
ticket → post-ticket. Global commands `/start`, `/help`, `/cancel`, `/status`
work from any state.

- `services/telegramService.ts` — `sendTelegramMessage`, canned message
  templates (`BOT.welcome/help/startIssue/askMedia/askLocation/confirm/
  editMenu/filed/cancelled/…`), `citizenStageLabel`, `words.*` detectors
  (yes/no/skip/done/edit/report/status/help), `extractTicketNumber`.
- `services/telegramFlow.ts` — state machine. Uses existing
  `channel_conversations.current_step` + `metadata_json.draft` — **no new
  migration**. Steps: `idle | collecting_issue | collecting_media |
  collecting_location | confirming | editing | post_ticket`.
- `services/aiService.ts` — added `classifyIntent(text)` returning
  `{ intent: 'greeting'|'report_issue'|'status_check'|'info_query'|'other',
  ticket_number, rule_based }`. Rule-based first (cheap), OpenRouter fallback
  with 5s timeout. Guardrail: the AI classifier's system prompt explicitly
  says "Do NOT attempt to answer the user. Only classify."
- `app/api/webhooks/telegram/route.ts` — rewritten to be a thin dispatcher:
  validate secret → upsert citizen → load conversation state → persist raw
  message → hand off to `handleInboundMessage(ctx)`.
- Telegram media now persists to `ticket_attachments` after ticket creation
  (storage_path stored as `telegram:<file_id>` — a follow-up task will
  download from Telegram and upload to Supabase storage).

**Amplify create-session flow**
- `POST /api/amplify/sessions` — body `{ticket_id}`. Creates a draft session
  (or reuses an existing draft for the same ticket), seeds source selections
  from `complaint_text` / `normalized_summary`, emits
  `amplify_session_created` audit log. Role-gated to super_admin +
  central_support.
- `components/amplify/AmplifyLaunchButton.tsx` — client button used in
  TicketActionsPanel; POSTs + navigates to `/amplify`.

**TicketActionsPanel polish**
- Replaced hex colors with semantic tokens throughout (`--primary`,
  `--alert-*`, `--green-*`, `--slate-*`, `--shell-*`).
- Replaced `window.location.reload()` with `router.refresh()` via
  `useTransition` — preserves client state across refresh.
- Added "Internal only (hide from citizen)" checkbox on the note form,
  wired to `is_internal` in the POST.
- Amplify shortcut replaced with the new launch button.

### Resumed session (post-compaction) — Directory + Worker Activation
- `POST /api/directory` — create contact, role-gated (super_admin, central_support),
  input sanitized, emits `directory_contact_created` audit log.
- `PATCH /api/directory/[id]` — partial update, org-scoped, emits
  `directory_contact_updated` audit log.
- `DELETE /api/directory/[id]` — soft-archive (`active=false` + archived_by/
  archived_at), emits `directory_contact_archived` audit log.
- `components/directory/ContactFormDialog.tsx` — client modal used for both
  create and edit (driven by `mode` prop). `/directory` passes it to
  PageHeader actions and into each card's edit button (canWrite only).
- `components/directory/ArchiveContactButton.tsx` — inline confirm-then-archive.
- `POST /api/workers/activation/[id]` — `{action:'approve'|'reject', note?}`.
  Allowed roles: super_admin, central_support, district_leader. Marks the
  request reviewed; does **not** create the `users` row (needs clerk_user_id
  from first sign-in). Concurrency guard: `eq('status','pending')` on update.
  Emits `worker_activation_approved` / `worker_activation_rejected`.
- `components/workers/ActivationActions.tsx` — inline Approve / Reject (reject
  requires reason). `/workers` pending-activation list now uses it.
- `npx tsc --noEmit` clean.

### This session
- Rewrote Triage page (parallel Promise.all, critical alert banner, section
  count badges).
- Rewrote Reports page (KPI strip, resolution rate, stage breakdown, top
  categories — all semantic tokens, no hardcoded hex).
- Rewrote Sign-in / Sign-up pages (gradient brand mark, matching hierarchy).
- Fixed search injection in `tickets/page.tsx`.
- Added `createSupabaseUserClient()` Clerk-JWT-authed path.
- Wrote migration 003 for org-scoped ticket numbers (not yet applied).
- Scaffolded /workers, /directory, /amplify, /audit pages (read-only).
- Added skeleton shimmer animation + shared `Skeleton` primitives.
- Added `loading.tsx` for 8 routes.
- **Fixed the cascade-layer CSS bug** — removed unlayered `* { margin: 0;
  padding: 0 }` from `globals.css` that was nuking every margin-based utility.
- Polished `PageHeader` (sticky, centered, backdrop-blur).
- Added `box-shadow: var(--shadow-sm)` to `.card`.
- Installed `cloudflared` via winget.
- Ran cloudflared quick tunnel, registered webhook with Telegram.
- **Diagnosed why the bot didn't respond:** `ORG_ID` env var points to a
  non-existent organization. User needs to update `.env.local` to
  `ORG_ID=3f3ff0a3-1ee4-49a5-a956-9e2461a592e3` and restart the dev server.
- **Reverted the `ticketService.ts` RPC-call change** to unblock ticket creation
  until migration 003 is actually applied.

---

## 7. Pending work (prioritized)

### High priority
1. **User action:** fix `ORG_ID` in `.env.local` → restart dev server → test
   bot end-to-end.
2. Apply migration 003 against the Supabase DB AND flip the `.rpc` call in
   `services/ticketService.ts` back to the two-arg form. Commit both together.
3. Enable Clerk third-party auth in Supabase dashboard, then migrate
   `/tickets` page from service client → user client. Verify RLS works end
   to end for each role, then migrate the other pages.

### Medium priority
4. ~~Wire CRUD mutations for Directory~~ ✅ done (create/edit/archive +
   audit log).
5. ~~Approve/reject UI for Worker activation requests~~ ✅ done. Still open:
   on approve, bootstrap the `users` row when that worker first signs in via
   Clerk (read `worker_activation_requests` by phone/email, set
   `active=true`, copy territory into `user_territories`).
6. Emit audit log rows from each privileged API route — already emitted from
   `tickets/{status,accept,reject,assign,confirm-ai,notes}`, directory, and
   worker activation. Remaining: webhook error paths already log; verify
   `notes` emits `ticket_note_added` (it does, via `addTicketNote`).
7. Stable tunnel for Telegram webhook (named cloudflared tunnel on a
   subdomain the user owns, or ngrok reserved).
8. Clerk sign-in → `users` row bootstrap (§5 follow-up above). Create a
   server-side helper invoked on first authenticated request that matches
   an approved `worker_activation_requests` by email/phone and inserts the
   user.

### Low priority / V1 scope
8. ~~Amplify — create-session flow from ticket detail page~~ ✅ done.
   Next Amplify work: the session *editor* page (pick which sources to
   include, pick tone presets, call OpenRouter to generate drafts,
   preview + copy to clipboard). Currently `/amplify` only lists sessions
   and links to the ticket detail; there's no session-detail page yet.
9. Reports — CSV/PDF/Excel export, worker leaderboards, SLA metrics,
   territory drilldowns.
10. Attachment upload validation (size, mime type, antivirus if prod). Also:
    download Telegram attachments server-side and persist to Supabase storage
    — currently `ticket_attachments.storage_path` holds `telegram:<file_id>`,
    which is an opaque pointer, not a fetchable URL. Owners of the storage
    layer should implement a background worker that resolves each
    `telegram:` path into a real uploaded file.
11. Real tests. Nothing is tested today.
12. Loading-state refinement: some Promise.all queries could use
    `Suspense` boundaries for streaming.

---

## 8. Telegram bot operational notes

- Webhook endpoint: `/api/webhooks/telegram`
- Handler validates `X-Telegram-Bot-Api-Secret-Token` header against
  `TELEGRAM_WEBHOOK_SECRET`. Unauthorized POST → 403.
- GET on the same URL is a health check, returns
  `{ok:true, service:"vocal-telegram-webhook", timestamp:"..."}`.
- Flow: validate secret → upsert citizen → get/create conversation →
  store raw message → handle `/start` or `/status` command → else create
  ticket (first message) or append (subsequent) → confirmation reply.
- AI enrichment runs async with `.then(…).catch(…)` — must never block
  the confirmation reply.
- Errors are logged to `audit_logs` with `event_type='webhook_error'` and
  the handler always returns 200 to prevent Telegram retry storms.

### Registering the webhook (quick command)
```powershell
$TOKEN  = (Select-String -Path .env.local -Pattern "^TELEGRAM_BOT_TOKEN=(.+)$").Matches[0].Groups[1].Value
$SECRET = (Select-String -Path .env.local -Pattern "^TELEGRAM_WEBHOOK_SECRET=(.+)$").Matches[0].Groups[1].Value
$URL    = "https://<tunnel>.trycloudflare.com/api/webhooks/telegram"

curl.exe -X POST "https://api.telegram.org/bot$TOKEN/setWebhook" `
  --data-urlencode "url=$URL" `
  --data-urlencode "secret_token=$SECRET" `
  --data-urlencode 'allowed_updates=["message","callback_query"]'
```

Verify:
```powershell
curl.exe "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```
Check `pending_update_count` and `last_error_message`.

---

## 9. Files of interest (quick reference)

- `app/globals.css` — design tokens + utilities. Edit carefully; see §2 note.
- `components/ui/Badge.tsx` — variants + dot + size props.
- `components/ui/PageHeader.tsx` — sticky w/ blur, max-w container.
- `components/ui/Skeleton.tsx` — loading primitives.
- `components/shell/Sidebar.tsx` — nav sections, role gating.
- `components/tickets/TicketTable.tsx` — desktop table + mobile cards.
- `lib/supabase/server.ts` — three clients + `getCurrentVocalUser`.
- `services/ticketService.ts` — ticket creation, keeps RPC signature in
  sync with migration state (see §4b).
- `services/ticketQueries.ts` — shared `TICKET_LIST_SELECT`.
- `supabase/migrations/001_initial_schema.sql` — full schema.
- `supabase/migrations/002_rls_policies.sql` — RLS definitions (not live yet).
- `supabase/migrations/003_org_scoped_ticket_numbers.sql` — pending migration.
- `app/api/webhooks/telegram/route.ts` — bot handler.
- `proxy.ts` — Next 16 auth boundary.

---

## 10. Next session checklist

Before doing anything, confirm with the user:
- [ ] Has `ORG_ID` been fixed in `.env.local`?
- [ ] Is the bot responding to `/start` and creating tickets?
- [ ] Is migration 003 applied? If yes, is the ticketService RPC call
      flipped to the two-arg form?
- [ ] Is Clerk third-party auth enabled in Supabase?
- [ ] Is there a stable tunnel URL or are we still on ephemeral cloudflared?

Then pick work from §7 "Pending work", highest priority first.

---

## 11. 2026-04-19 session — Assignment SLA, Amplify editor, bot notify

### Shipped this session

**Migration 004 (`004_assignment_sla_and_amplify_formats.sql`)** — must be
applied before the new code will behave correctly:
- Drops + recreates the `amplify_generated_outputs.output_format` CHECK to
  include: `facebook_post`, `whatsapp_broadcast`, `letter_to_authority`,
  `press_release` (plus the original set).
- Adds `amplify_generated_outputs.tone` and `.metadata_json`.
- Adds `tickets.sla_first_contact_due_at`, `.sla_resolution_due_at`,
  `.sla_breached_flag`, `.offered_worker_ids uuid[]`.
- Changes `organization_settings.acceptance_sla_minutes` default 15 → **2**
  (demo-friendly) and updates any existing rows that still have 15.
- Creates `generate_ticket_number` overloads for both legacy and org-scoped
  call sites.

**Assignment state machine**
- `services/assignmentService.ts` — `listCandidateWorkers`,
  `findNearestAvailableWorker`, `getAcceptanceSlaMinutes`,
  `offerTicketToWorker`, `expireStaleAssignments`. Distance via haversine
  against territory centroids; `offered_worker_ids[]` tracks who has
  already been offered this ticket so the cron/reject path never loops.
- `/api/tickets/assign` — now delegates to `offerTicketToWorker`.
- `/api/tickets/auto-assign` — picks nearest candidate + offers.
- `/api/tickets/accept` — on accept, reads the org's
  `first_contact_sla_hours` + `resolution_plan_sla_hours`, writes
  `sla_first_contact_due_at` and `sla_resolution_due_at`, clears
  `sla_breached_flag`.
- `/api/tickets/reject` — now **immediately** re-offers to the next
  candidate via `offerTicketToWorker` (workers don't wait on the cron tick).
  Returns `reoffered: {worker_id, assignment_id, expires_at} | null`.
- `/api/cron/expire-assignments` — cron endpoint. Authorized by the
  `x-vercel-cron` header OR an `x-cron-secret` env match. Permissive in dev.
  Needs a vercel.json cron entry for prod (TODO).

**Telegram back-channel to citizen**
- `services/citizenNotifier.ts` — `notifyCitizenOfTicketUpdate` renders a
  citizen-facing template per sub_status / stage transition
  (`assigned_awaiting_acceptance`, `accepted_by_worker`, `citizen_contacted`,
  `field_verification_in_progress`, `action_plan_created`,
  `escalated_to_authority`, `awaiting_citizen_response`, `resolved`,
  `closed`, plus `stage_generic` fallback). Resolves the Telegram chat_id
  from `citizen_channel_identities`, sends, and persists a lean outbound
  `channel_messages` row (`raw_text: null`, `raw_payload: {template_key,
  ticket_number, sub_status, stage}`). Never throws.
- Wired into `/api/tickets/status` (every status change) and
  `/api/tickets/accept` (with `key: 'accepted_by_worker'`).
- Offer path in `assignmentService.offerTicketToWorker` also fires it.

**Telegram diagnostic + tunnel**
- `GET /api/webhooks/telegram/debug` (role-gated to super_admin /
  central_support) — returns a JSON with `ORG_ID` resolution, Telegram
  `getMe` + `getWebhookInfo`, last 10 channel_messages, last 5
  `webhook_error` audit logs, latest ticket, and a `hints[]` array pointing
  at the exact fix when something's off.
- `scripts/dev-tunnel.ps1` — starts `cloudflared tunnel --url
  http://localhost:3000`, scrapes the trycloudflare URL out of its logs,
  and calls Telegram `setWebhook` with url + secret + allowed_updates in
  one command. Fixes the "tunnel died two sessions ago" problem.

**Ticket-detail UX**
- `components/tickets/TicketActionsPanel.tsx` rewritten:
  - Sub-status picker uses `<optgroup>` per stage and shows a stage-pill
    badge next to the field label so you always see the parent stage.
  - `SUB_STATUSES_REQUIRING_WORKER = {'assigned_awaiting_acceptance'}` —
    selecting it reveals an inline worker picker, and submit routes
    through `/api/tickets/assign` (not `/api/tickets/status`) so the
    offer, stage, and expiry are written atomically.
  - **Auto** button next to manual-assign → `/api/tickets/auto-assign`.
  - Shows `assignment.expires_at` countdown in the assignment block.
- Ticket detail page now renders Location as a new-tab Google Maps link
  (`https://www.google.com/maps?q=LAT,LNG`) with a map-pin SVG icon, with
  a plain-text fallback when there are no coords.

**Amplify rebuild (role: super_admin + central_support only)**
- `services/amplifyService.ts` — `PLATFORMS` catalog (7 formats incl. the
  new `facebook_post`, `whatsapp_broadcast`, `letter_to_authority`,
  `press_release`), `AmplifyTone` union, `systemPromptFor`, and
  `generateAmplifyContent` (OpenRouter, `google/gemini-2.5-flash-preview`,
  temp 0.6, 900 tok, 20 s timeout) with deterministic per-platform
  fallback when AI is unreachable.
- `/api/amplify/sessions/[id]/generate` POST — role-gated, validates
  platform + tone, enriches sources with ticket meta, persists to
  `amplify_generated_outputs` with `tone`, `model_used`, `metadata_json:
  {fallback, error, source_count}`, emits an `amplify_content_generated`
  audit log.
- `app/(dashboard)/amplify/[id]/page.tsx` — fetches session + ticket +
  sources + latest-per-format outputs, passes to the editor.
- `components/amplify/AmplifyEditor.tsx` — 2-col layout. Left: ticket
  summary + source checklist + tone dropdown. Right: one tab per
  platform (green dot = existing draft) with Generate / Regenerate + Copy
  + editable textarea. Warning banner when the current draft is a
  fallback.
- `components/amplify/AmplifyLaunchButton.tsx` navigates to
  `/amplify/[id]` (not `/amplify`) after creating the session.
- `app/(dashboard)/amplify/page.tsx` — session rows link to
  `/amplify/[id]` (the editor), no longer to the ticket detail page.

**Ticket list — filters + SLA badges**
- `services/ticketQueries.ts` — `TICKET_LIST_SELECT` extended with
  `latitude`, `longitude`, `sla_first_contact_due_at`,
  `sla_resolution_due_at`, `sla_breached_flag`; `TicketFilters` gains
  `slaBreached`, `hasLocation`.
- `app/(dashboard)/tickets/page.tsx` — new filter row: severity chip
  group, "⏱ SLA breached" toggle, "📍 With location" /
  "Missing location" toggles, "Clear filters" link.
- `components/tickets/TicketTable.tsx` — new `SlaBadge` component shown
  on each row: `danger` when `sla_breached_flag` is set OR a due date is
  past; `warning` when the next due-date is <15 min away. Also adds a
  "📍 Geo" badge when lat/lng are present.

**Types**
- `types/database.ts` — `AmplifyOutputFormat` expanded to match migration
  004's CHECK, and a new `AmplifyTone` union.

**Test user seeding**
- `scripts/seed-test-users.ts` — creates 10 Clerk users across every role
  (idempotent) with shared password `Vocal!Test2026`, upserts matching
  `users` rows in Supabase with seed role UUIDs, prints a table at the
  end. Run with `npm run seed:test-users`.
- `package.json` — added the script and `tsx` devDep.

### First moves for the next session

1. **Apply migration 004** (dashboard SQL editor, or `supabase db push`
   if CLI is wired). Without this, every SLA / Amplify write will error.
2. `npm install` (picks up `tsx`).
3. `npm run seed:test-users` — get the 10 shared-password accounts into
   Clerk + Supabase.
4. `pwsh scripts/dev-tunnel.ps1` — start a fresh cloudflared tunnel AND
   re-register the Telegram webhook in one shot. Hit
   `/api/webhooks/telegram/debug` (signed in as super_admin) to verify.
5. Add a `vercel.json` cron entry hitting
   `/api/cron/expire-assignments` every minute (see §7 "Pending").

### Tunnel / webhook — how we left it

- Migration 004 is **applied** to the Supabase database.
- A cloudflared quick tunnel is **running** on this machine as of session
  end: `https://actually-gamma-study-ordinance.trycloudflare.com`. **This
  URL dies the moment cloudflared is killed or the machine reboots** —
  it's ephemeral by design.
- Telegram webhook is registered against that URL with
  `secret_token=$TELEGRAM_WEBHOOK_SECRET` and
  `allowed_updates=["message","callback_query"]`.
- `getWebhookInfo` at session close: `pending_update_count=0`, no errors.

### Do we need to re-run setWebhook every time?

**Dev:** yes, but only when the tunnel URL changes. Each fresh cloudflared
quick tunnel allocates a new random `*.trycloudflare.com` subdomain. Keep
the PowerShell window open and nothing changes. Restart cloudflared →
re-run `setWebhook`. The patched `scripts/dev-tunnel.ps1` does both steps
in one command (now with DNS-wait + retry to avoid the "Failed to resolve
host" race).

**Production:** no. You register once against your stable domain
(`https://<app>.vercel.app/api/webhooks/telegram` or a custom domain) and
it survives redeploys forever.

**Pain-reliever before pilot:** use a Cloudflare **named tunnel** (free
account) instead of a quick tunnel. You get a permanent hostname that
persists across restarts — register once, forget it.

### Watch out: the "Failed to resolve host" trap

Telegram will negative-cache an NXDOMAIN for a trycloudflare subdomain if
it tries to resolve one before Cloudflare's edge has propagated DNS.
Symptom: `{"ok":false,"error_code":400,"description":"Bad Request: bad
webhook: Failed to resolve host: Name or service not known"}` even after
the tunnel is clearly up and resolvable from your machine. **Fix:** kill
the tunnel, start a fresh one (new random subdomain = clean slate for
Telegram's resolver), then `setWebhook` against the new URL. The updated
`dev-tunnel.ps1` pre-checks DNS + retries 6× with 5 s backoff, which
catches the race in most cases but not after Telegram has already
negative-cached — in that case, cycle the tunnel.

### Still pending after this session

- `vercel.json` cron config for `expire-assignments` (every 1 min in
  prod) — currently the endpoint exists but there's no trigger.
- Territory/worker filter on `/tickets` (we added severity, SLA,
  location; territory still TODO).
- Territory-aware auto-assign verification — pilot orgs with no
  `user_territories` rows yet will get zero candidates; we may need a
  "fall back to org-wide" toggle on `organization_settings`.
- A simple worker-facing "my queue" view that surfaces the countdown
  against `ticket_assignments.expires_at`.
- Downloading Telegram attachments server-side (still a
  `telegram:<file_id>` pointer in storage).
- Tests. Still nothing tested.

---

## 12. 2026-04-20 session — Ship to prod + worker queue + load balancing

Short session that flipped Vocal from "works on localhost" to "works on a
URL you can send to someone." Three concrete deliverables.

### 12a. Deployed to GitHub + Vercel

- New repo created under the user's personal GitHub
  (`Abhijit-sai/vocal-app`) via the GitHub REST API (PAT auth).
- Git config email corrected to `abhijit.siddabuthuni@gmail.com`
  mid-session (the initial commit was rejected because it was using a
  placeholder `abhijit@vocal.app`).
- First push to `main`, Vercel picked it up automatically via the
  GitHub integration, and the app is live at
  **https://vocal-app-one.vercel.app**.
- Prod env vars (Supabase URL + keys, Clerk, OpenRouter, Telegram bot
  token + webhook secret, `ORG_ID`, `APP_BASE_URL`) are all set in the
  Vercel project settings.
- Prod Telegram webhook registered against
  `https://vocal-app-one.vercel.app/api/telegram/webhook` — this is
  permanent, no more cloudflared cycling needed for demos. Dev can
  still use `scripts/dev-tunnel.ps1` for local debugging (§8).

### 12b. Seeded 10 test users covering every role

`scripts/seed-test-users.ts` now:

1. Creates Clerk users and mirrors them into `vocal_users` with
   the right role_id (super_admin, central_support ×2, state_leader,
   district_leader ×2, ground_worker ×4).
2. **NEW:** `seedTerritories()` — finds or creates "Demo Territory"
   (centroid 17.385, 78.4867, 10 km radius — central Hyderabad) and
   upserts every ground_worker into `user_territories`. Without this
   step the old territory-scoped auto-assign returned zero candidates
   and assignments silently no-op'd.
3. All users share the password `Vocal!Test2026` for demo
   convenience. Emails follow `role.N@vocaldemo.test`.

### 12c. Load-balanced auto-assignment with org-wide fallback

`services/assignmentService.ts → listCandidateWorkers()` rewritten:

- `CandidateWorker` now carries `active_ticket_count: number`. A single
  query counts non-closed tickets grouped by `owner_user_id` and we
  build a `loadMap`.
- **Territory-scoped first pass:** workers attached to the ticket's
  territory via `user_territories`. If empty →
- **Org-wide fallback:** every ground_worker in the org. This is the
  fix for the "pilot org with no territories defined yet" failure
  mode flagged in §11 pending.
- **Sort:** `active_ticket_count ASC` primary (fewest tickets wins),
  then `distance_km ASC` secondary (closest wins within a load tier),
  with `null` distances sorted last. TS null-safety: `ticketLat` and
  `ticketLng` are extracted to locals with null guards before the
  sort closure to avoid "possibly null" errors.
- Result: the dispatcher now offers the next ticket to the
  least-loaded nearby worker instead of hammering the same top-ranked
  person. Auto-assign tries up to 3 candidates in order before giving
  up (user-requested loop).

### 12d. `/my-assignments` — the worker queue UI gap is closed

New server component `app/(dashboard)/my-assignments/page.tsx`:

- Role-gated (redirects non-`ground_worker` to `/dashboard`).
- Fetches the current *offered* assignment (if any) —
  `ticket_assignments` where `worker_user_id = me AND is_current
  AND status = 'offered'` — plus the joined ticket.
- Fetches *active accepted* tickets — `tickets` where `owner_user_id =
  me AND stage = 'in_progress' AND sub_status !=
  'assigned_awaiting_acceptance'`.

New client component `components/workers/WorkerQueue.tsx` (~380 lines):

- **`useCountdown(expiresAt)` hook:** ticks every 1 s, returns
  `{ secondsLeft, display (m:ss), isUrgent (<30s), expired }`.
- **`OfferedCard`:** ticket summary + live countdown + Accept / Reject
  buttons. Reject expands an inline dropdown with 5 canned reasons.
- **`ActiveCard`:** status dropdown that is forward-only — uses
  `WORKER_STATUSES.findIndex` to slice to remaining options, matching
  the server-side `WORKER_ALLOWED_SUB_STATUSES` list. Shows an SLA
  warning when first-contact is <30 min out. Links to the full ticket
  detail page.
- Calls `/api/tickets/accept`, `/api/tickets/reject`,
  `/api/tickets/status`. After success, `startTransition(() =>
  router.refresh())` re-fetches the server data without a full page
  reload.

`components/shell/Sidebar.tsx`: ground_worker nav item changed from
"My Tickets → /tickets?view=mine" to "My Assignments →
/my-assignments" with a new `Icons.assignments` (clipboard-with-check
SVG).

### 12e. Role-gated access verified end-to-end

The Sidebar filters `NAV_SECTIONS` by `userRole` via the `roles:
RoleName[]` array on each item, so each logged-in user only sees
their modules (e.g. ground_worker sees only Dashboard, My
Assignments, Directory). Individual server pages additionally redirect
mismatched roles — `/my-assignments` redirects non-workers to
`/dashboard`, `/triage` is central_support+ only, etc. Confirmed in
prod with the seeded accounts.

### Commit

`f19bf6d` — "Worker queue, load-balanced assignment, territory
seeding" — 6 files changed, 653 insertions, 28 deletions. On `main`,
deployed.

### Still pending after this session

- **`vercel.json` cron** for `/api/assignments/expire` — the endpoint
  exists and is correct, there's just no trigger yet. User explicitly
  deferred.
- Territory filter on `/tickets` list.
- Territory/worker admin UI (right now territories are seeded via
  script; there's no in-app way to draw a radius).
- Dashboard stats widgets (open tickets, avg time-to-first-contact,
  SLA breach count).
- Downloading Telegram attachments server-side (still pointers).
- Actual tests.
