# My Leader — Backlog

**Last updated:** 2026-05-16
**Maintenance rule:** updated at the end of every session. Newly identified work
goes in. Completed work moves to `PROJECT_SUMMARY.md` §14+ as a session log and
is removed from this file.

This is the canonical upcoming-work backlog. The Linear-importable CSVs in this
folder are dated snapshots — pick the latest, OR import the per-session delta
(`linear-import-2026-05-16.csv` adds only the items new since the 2026-05-14
import).

---

## Epic structure

```
EPIC                                 status     priority    rough effort
────────────────────────────────────────────────────────────────────────
E1.  Image attachments               SHIPPED + VERIFIED 2026-05-17 (E1-S6 retention deferred)
E1b. Worker note-with-image          SHIPPED 2026-05-17 (added per user request)
     ↳ Late-day MIME bug fix: 570c9e9 (Telegram photo struct has no
       mime_type → was falling back to octet-stream → bucket rejected.
       Now pickMedia hard-codes image/jpeg + inferMime safety net.)
E2.  Amplify from notes & attachments Active    High        ~2 days
E3.  W2-D3 — V2 webhook wiring       PAUSED     High        ~1.5 days (rethink conv quality first)
E4.  W3 — JTG production launch      Next       Urgent      ~5 days
E5.  Geographic data completion      Next       Medium      Incremental
E6.  Post-launch hardening           Backlog    Medium      ~2 weeks
E7.  Multimodal intake (parked)      Parked     Low         ~5 days
E8.  Infrastructure migration to AWS Parked     Medium      ~3-5 days
E9.  WhatsApp channel (NEW)          Backlog    Medium      ~2 weeks
E10. Citizen-facing app (NEW)        Discovery  Low         ~6-8 weeks
E11. Karyakarta-as-reporter (NEW)    Backlog    Medium      ~3-5 days
E12. Configurable SLAs (NEW)         Backlog    High        ~3-5 days
```

---

## E1 — Image attachments (Active · High · ~3 days)

**Why:** PRD §17.2. Citizens send photos via Telegram; we currently store only an opaque `telegram:<file_id>` pointer. Workers and central support can't open them. We need actual file storage so images appear inline in the ticket detail. Multimodal LLM understanding (E7) is parked separately.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E1-S1 | Provision Supabase Storage bucket + RLS policies               | Done     | 1        | `scripts/setup-storage-bucket.ts`. Bucket `ticket-attachments` (private), 25 MB max, MIME allowlist. `npm run setup:storage-bucket`. User to execute against Supabase. |
| E1-S2 | Telegram → Supabase storage download/upload pipeline           | Done     | 3        | `services/attachmentService.ts`. `downloadFromTelegramAndStore()` + `signedUrlFor()` + `signedUrlsFor()`. Fail-soft. |
| E1-S3 | Persist canonical path + metadata in `ticket_attachments`      | Done     | 1        | `services/telegramFlow.ts` now calls the pipeline before inserting. Legacy `telegram:<file_id>` falls back if upload fails. |
| E1-S4 | Inline image preview in ticket detail page                     | Done     | 2        | New Attachments section. Thumbnails for images; download links for others. Visibility-gated: privileged always; ground_worker only after `citizen_identity_revealed_at`. |
| E1-S5 | Backfill existing `telegram:` pointers (background job)        | Done     | 2        | `scripts/backfill-telegram-attachments.ts`. Idempotent. `npm run backfill:telegram-attachments`. User to run when ready. |
| E1-S6 | Retention policy + cleanup cron                                | Backlog  | 2        | Default 24 months, configurable per org. Defer until post-launch if tight. |

---

## E1b — Worker note-with-image upload (Shipped 2026-05-17)

**Why:** User feedback during E1 testing: workers had no way to upload photos from the field — only citizens (via Telegram) could attach images. Workers should be able to attach an image to any note they add.

| ID     | Story                                                          | Status   | Estimate | Notes |
|--------|----------------------------------------------------------------|----------|----------|-------|
| E1b-S1 | Extend `/api/tickets/notes` to accept multipart/form-data      | Done     | 2        | Accepts JSON (existing) or multipart with optional `image` File. JSON path untouched. |
| E1b-S2 | `uploadWorkerAttachment()` in attachmentService                | Done     | 1        | Sibling of `downloadFromTelegramAndStore()`. Reuses the same bucket + path convention. Sets `ticket_attachments.uploaded_by` to the worker. |
| E1b-S3 | "Attach photo" picker in the Add Note form                     | Done     | 2        | Dashed-border CTA. Image preview + Remove button. Submit button becomes "Add Note + Photo" when an image is attached. |
| E1b-S4 | `/api/admin/storage/diagnose` for super_admin diagnostics      | Done     | 2        | Bucket existence, env var presence, legacy-pointer count, round-trip upload-and-delete test. |
| E1b-S5 | Improved logging in attachmentService                          | Done     | 1        | console.error every stage transition with `file_id, ticket_id, ...` payload. Surfaces in Vercel function logs. |

---

## E2 — Amplify from notes & attachments (Active · High · ~2 days)

**Why:** PRD §17.3. Central support wants to amplify cases using the worker's field notes and the citizen-uploaded photos, not just the raw complaint text. Currently Amplify only sees `complaint_text` and `normalized_summary`.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E2-S1 | Extend Amplify source schema to include `note_ids[]`           | Todo     | 1        | Migration or use existing `metadata_json` on `amplify_sessions`. |
| E2-S2 | Extend Amplify source schema to include `attachment_ids[]`     | Todo     | 1        | Same channel as S1. |
| E2-S3 | AmplifyEditor UI — note checklist on the left pane             | Todo     | 2        | Pulls non-deleted notes from the ticket. Show author + timestamp + first 80 chars. |
| E2-S4 | AmplifyEditor UI — attachment thumbnail picker                 | Todo     | 2        | Pulls image attachments. Click to select; selected count shown. |
| E2-S5 | Prompt builder — embed selected note text into context         | Todo     | 1        | Cap total note length to ~3 K chars to keep prompts reasonable. |
| E2-S6 | Prompt builder — pass image URLs as references in prompt       | Todo     | 1        | Even though LLM is text-only for now, the URLs land in the generated draft as `[Image: <url>]` placeholders central support can re-arrange. |
| E2-S7 | Audit log — record selected note + attachment IDs              | Todo     | 1        | Extend `amplify_content_generated` event payload. |

---

## E3 — W2-D3 · Wire V2 into Telegram webhook (Paused · High · ~1.5 days)

**STATUS UPDATE 2026-05-17:** User feedback after first hands-on test of the V2 manager in `/admin/intake-lab`: conversation quality is **"not up to the mark"**. Wiring V2 into the live webhook is **paused** until we rethink the conversation design. Specific concerns we need to dig into next time we resume:
- Tone / personality may still feel transactional despite the empathy rework
- Follow-up question selection feels off (asks the wrong thing or skips important details)
- Out-of-scope handling vs needs-review may need clearer thresholds
- Possibly a model issue — try GPT-4o-mini or Claude 3.5 Sonnet via OpenRouter as A/B

For the JTG soft-launch, **V1 (the rigid state machine) remains the production path.** No risk to soft-launch.

**Why (original):** The toggle exists (`/admin/intake-settings`), the engine exists (`intakeConversationManager`), but the webhook doesn't read the setting yet.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E3-S1 | Read `intake_conversation_version` per inbound message         | Todo     | 1        | One DB call cached per org per 30s in-memory. |
| E3-S2 | V2 dispatch path in `app/api/webhooks/telegram/route.ts`       | Todo     | 3        | If V2: call `processInbound()`, send `replyText`, persist conversation history in `channel_conversations.metadata_json.history[]`. |
| E3-S3 | Persist `draftUpdates` cumulatively per conversation           | Todo     | 2        | Merge into `metadata_json.draft`. Pass to next `processInbound()` as `existingDraft`. |
| E3-S4 | File the ticket when `readyToFile` true (in_scope path)        | Todo     | 2        | Reuse existing `ticketService.createTicket` flow. |
| E3-S5 | File needs-review ticket flagged for human review              | Todo     | 2        | Same path as S4 + set `needs_triage = true` and add an audit-log row. |
| E3-S6 | Per-chat allowlist for staged V2 rollout                       | Todo     | 1        | Env var `V2_INTAKE_ALLOWLIST=chat_id1,chat_id2`. Falls back to V1 for everyone else even if org setting is V2. Drop once stable. |

---

## E4 — W3 · JTG production launch (Next · Urgent · ~5 days)

**Why:** End-state of the 3-week sprint. After this, JTG / Sircilla is live with real citizens.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E4-S1 | Provision new Supabase project                                 | Todo     | 1        | Path A (Cloud), migration to AWS deferred. |
| E4-S2 | Provision new Vercel project                                   | Todo     | 1        | Connect to the same GitHub repo, new branch or new project pointing at `main`. |
| E4-S3 | Provision new Clerk app                                        | Todo     | 1        | Or sub-environment within existing Clerk account. |
| E4-S4 | Register `@JTG_citizen_bot` via @BotFather                     | Todo     | 1        | Get token + webhook secret. |
| E4-S5 | Register `@JTG_worker_bot` via @BotFather                      | Todo     | 1        | Same as S4. |
| E4-S6 | Set env vars in Vercel + register webhooks                     | Todo     | 1        | 12 vars; webhook URLs against JTG Vercel host. |
| E4-S7 | Apply migrations 001-006 to JTG Supabase                       | Todo     | 1        | Via dashboard SQL editor or Supabase CLI. |
| E4-S8 | Run `seed:telangana-tier-a` against JTG DB                     | Todo     | 1        | Will create 165 rows: 1 state + 33 districts + 119 ACs + 13 mandals. |
| E4-S9 | Run Sircilla village seed (Tier B — already in JSON)           | Todo     | 1        | ~117 villages. |
| E4-S10| Seed Sircilla-specific local gov contacts                      | Todo     | 2        | MLA office, MROs, tehsildars, ward members, police inspectors. User to source list. |
| E4-S11| Bootstrap super_admin user                                     | Todo     | 1        | Clerk + matching `users` row + map to org. |
| E4-S12| Bootstrap central_support team (2-3 users)                     | Todo     | 1        | Same as S11. |
| E4-S13| Bootstrap initial ground_workers (5-10)                        | Todo     | 2        | Each worker mapped to their wards via `user_territories`. |
| E4-S14| Smoke-test end-to-end on Telegram                              | Todo     | 2        | Real citizen account → bot → ticket → worker accepts on Telegram → resolves. |
| E4-S15| Soft-launch with limited initial cohort                        | Todo     | 2        | First 24 hrs: only seeded test citizens. Then open to ~50 real users. |
| E4-S16| Operational runbook + worker training material                 | Todo     | 3        | One-pager for central support; short video for workers. |

---

## E5 — Geographic data completion (Next · Medium · Incremental)

**Why:** Tier A seeds 33 districts + 119 ACs + 1 district's mandals. Other districts' mandals and most villages remain. Useful for future expansion to other constituencies and for accurate routing in Hyderabad-heavy cases.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E5-S1 | Mandal data for the other 32 districts                         | Backlog  | 8        | Per-district JSON files. Source from Wikipedia + Telangana revenue. Drop into `scripts/data/telangana/mandals/`. |
| E5-S2 | GHMC ward-level data for Hyderabad                             | Backlog  | 3        | 150 wards. Important for civic complaint volume. |
| E5-S3 | Village-level data for non-Sircilla mandals                    | Backlog  | 13       | Long tail. Add only when a new constituency client signs. |
| E5-S4 | CSV import pipeline for non-developer onboarders               | Backlog  | 3        | Lets central support drop a CSV and run the seed without code changes. |

---

## E6 — Post-launch hardening (Backlog · Medium · ~2 weeks)

**Why:** Production maturity. None of these are blocking soft-launch but all are needed for steady-state ops.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E6-S1 | Clerk → Supabase JWT integration + flip pages to RLS           | Backlog  | 5        | Currently service-client everywhere bypasses RLS. Migrate page-by-page. |
| E6-S2 | Territory Admin UI                                             | Backlog  | 5        | Tree view, create/edit/delete nodes, set centroids. Replaces CSV/JSON workflow. |
| E6-S3 | External cron (cron-job.org / Upstash) for expire-assignments  | Backlog  | 2        | Replace `/jobs` manual button. Hit `/api/cron/expire-assignments` every minute. |
| E6-S4 | External cron for worker daily reminders                       | Backlog  | 1        | Same pattern. |
| E6-S5 | Sentry / error tracking                                        | Backlog  | 2        | Client + server SDKs. Sample rate 10%. |
| E6-S6 | Reports CSV / XLSX export                                      | Backlog  | 3        | All report views downloadable. Audit-logged. |
| E6-S7 | Worker leaderboards on /reports                                | Backlog  | 3        | Resolution count, avg time-to-resolution, acceptance ratio. |
| E6-S8 | Mobile-responsive tables (/tickets, /triage, /workers)         | Backlog  | 3        | Card-view at <md breakpoint. |
| E6-S9 | Apply migration 006 + verify V1↔V2 switch in production        | Todo     | 1        | User action: paste 006 SQL into Supabase SQL editor. (Was E6-S10; renumbered after WhatsApp moved to E9.) |

---

## E7 — Multimodal intake (Parked · Low · ~5 days)

**Why parked:** PRD §17.1. Complexity is high; value lands after launch. Schema in `intakeConversationManager.IntakeRequest.newMessage.media` already accommodates it — no future schema change needed when we resume.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E7-S1 | Voice transcription preprocessing via Gemini multimodal        | Parked   | 3        | Bot downloads voice note → Gemini → text into `media.voice_transcript`. |
| E7-S2 | Image vision description via Gemini multimodal                 | Parked   | 3        | Bot pipes image URL → Gemini Vision → description + extracted text into `media.image_description`. |
| E7-S3 | Wire media preprocessing into the webhook V2 path              | Parked   | 2        | Runs BEFORE `processInbound()` so the LLM sees the enriched context. |
| E7-S4 | Sarvam AI fallback for Telugu/Tinglish voice (quality boost)   | Parked   | 2        | Optional. Re-evaluate after first real-world data on Gemini's Telugu transcription quality. |

---

## E8 — Infrastructure migration to AWS (Parked · Medium · ~3-5 days)

**Why parked:** Locked as Path A on 2026-05-14. Supabase Cloud + Vercel for soft-launch. AWS migration is post-launch.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E8-S1 | Stand up AWS RDS Postgres for JTG production                   | Parked   | 3        | Multi-AZ, daily backups, parameter group tuned for the workload. |
| E8-S2 | Self-host Supabase OSS stack on ECS or EC2                     | Parked   | 5        | Docker Compose: PostgREST + Studio + GoTrue (disable) + Storage. Zero application code change. |
| E8-S3 | Migrate JTG data via pg_dump / pg_restore                      | Parked   | 2        | One-shot cutover. ~30 min downtime expected. |
| E8-S4 | Move Next.js app from Vercel to ECS/EC2                        | Parked   | 3        | `next start` on AWS App Runner or ECS. EventBridge for cron. |
| E8-S5 | Wire CloudWatch + alerts                                       | Parked   | 2        | Replace whatever observability Vercel was giving us. |

---

## E9 — WhatsApp channel (Backlog · Medium · ~2 weeks)

**Why:** PRD §17.5.1. We want citizens to reach the system on the channel they already use most. Twilio is the preferred BSP for speed (hours to set up, mature SDK) — Wati / Gupshup if India-billing or business-verification handholding matters more. The new `intakeConversationManager` is channel-agnostic by design, so the adapter is mostly Telegram-shaped plumbing.

| ID    | Story                                                          | Status   | Estimate | Notes |
|-------|----------------------------------------------------------------|----------|----------|-------|
| E9-S1 | Procure WhatsApp Business number (Twilio preferred, Wati alt)  | Todo     | 2        | Sandbox phone-number first for demo; production number requires Meta business verification (1-2 weeks). Decision: Twilio for speed, switch later if needed. |
| E9-S2 | WhatsApp adapter — webhook + send-message helpers              | Backlog  | 5        | `services/whatsappService.ts` mirroring `telegramService.ts` (sendMessage, downloadMedia, secret validation). New `app/api/webhooks/whatsapp/route.ts`. |
| E9-S3 | Plug adapter into `intakeConversationManager`                  | Backlog  | 3        | Reuse V2 pipeline. Channel = 'whatsapp' on `channel_conversations.channel`. Same `metadata_json.history[]` shape. |
| E9-S4 | Message template approvals (Meta-mandatory)                    | Backlog  | 2        | Approved templates for: ticket-created, ticket-accepted, citizen-contacted, resolved, awaiting-response. Templates submitted via Twilio dashboard. |
| E9-S5 | Initial demo testing on real WhatsApp numbers                  | Backlog  | 2        | Internal team uses the demo number to file test tickets end-to-end. |
| E9-S6 | Production cutover decision                                    | Backlog  | 1        | Run WhatsApp + Telegram in parallel? WhatsApp-only? Capture in PRD §17 update once tested. |

---

## E10 — Citizen-facing app (Discovery · Low · ~6-8 weeks)

**Why:** PRD §17.5.2. Originally Phase 3 in §6.4. Brought forward into the backlog so we can begin discovery. NOT in pre-launch scope. Telegram + WhatsApp keep being primary intake for a long time before an app makes sense — but having structured backlog gives us a discovery north star.

| ID     | Story                                                          | Status   | Estimate | Notes |
|--------|----------------------------------------------------------------|----------|----------|-------|
| E10-S1 | Product discovery — MVP scope definition                       | Discovery| 3        | What does the citizen app DO that Telegram can't? Photo capture? Offline draft? Status notifications? Map view? Pin actual address? Discovery output: 1-page brief. |
| E10-S2 | Tech-stack decision (React Native / Flutter / PWA)             | Backlog  | 2        | React Native is the safe bet (cross-platform, shares JS with our Next.js team). Flutter is a fresh codebase. PWA is no app stores but worse push-notifications. |
| E10-S3 | Citizen auth — phone OTP                                       | Backlog  | 5        | Currently citizens are chat-identity-only (no app login). App needs proper auth. Clerk supports phone OTP. Bind to the same `citizens` table. |
| E10-S4 | API surface for citizen actions                                | Backlog  | 5        | New `/api/citizen/*` routes (auth via citizen JWT, NOT staff Clerk): file ticket, attach media, check status, list past tickets, get notifications. |
| E10-S5 | MVP build — issue reporting + status check                     | Backlog  | 13       | Two screens: New Issue (form + photo + voice + location), My Tickets (list + status). Polished but minimal. |
| E10-S6 | App store + Play store submission                              | Backlog  | 5        | Privacy policy, store listing, screenshots, review cycles. 1-2 weeks elapsed for first approval. |
| E10-S7 | Initial cohort rollout                                         | Backlog  | 3        | Same staged-rollout pattern as the Telegram bot: 50 users → 500 → general. |

---

## E11 — Karyakarta-as-reporter (Backlog · Medium · ~3-5 days)

**Why:** PRD §17.5.3. Currently workers only ACCEPT and RESOLVE issues that come from citizens via Telegram. Ground-truth says workers see issues every day that citizens don't bother reporting (broken streetlight on a side road, a stalled welfare claim a worker visited). They need to be able to file these themselves. Routing logic differs from citizen-filed tickets — worker-filed go to triage (not auto-assigned to the same worker, which would be a conflict of interest).

| ID     | Story                                                          | Status   | Estimate | Notes |
|--------|----------------------------------------------------------------|----------|----------|-------|
| E11-S1 | "Report an issue" CTA on the worker dashboard                  | Todo     | 1        | Floating action button on `/my-assignments`. Opens a new-issue modal. |
| E11-S2 | New-issue form — title / description / location / category / photos | Todo     | 3   | Reuse the existing ticket creation service. Distinction: `source_channel = 'worker_report'` on the ticket. |
| E11-S3 | API: `POST /api/tickets/worker-report`                         | Todo     | 2        | Role-gated to ground_worker (any role can use it actually — but worker is the canonical case). Sets `created_by` to the worker. Sets `needs_triage = true` (do NOT auto-assign back to the reporter). |
| E11-S4 | Triage queue distinction — worker-reported badge               | Todo     | 1        | Small "Worker report" badge in `/triage` so central support can prioritise these (often higher-trust signal). |
| E11-S5 | Audit + access-control — worker can't self-assign their report | Todo     | 1        | Enforce at API layer + UI. Reporter shouldn't appear in the assignment dropdown for their own ticket. |
| E11-S6 | Reporting / dashboard: worker-sourced vs citizen-sourced split | Backlog  | 2        | KPI on `/reports`: % of tickets sourced from workers vs citizens. Insight into ground-team proactivity. |

---

## E12 — Configurable SLAs (Backlog · High · ~3-5 days)

**Why:** PRD §17.5.4. Currently SLAs are hard-coded in `organization_settings` (acceptance, first-contact, resolution). They need to be:
1. Editable from a SuperAdmin UI without a redeploy.
2. Expanded — a new "meeting/visit" SLA between first-contact and resolution. Some tickets need a physical visit to verify.
3. Validated — acceptance <= first_contact <= meeting <= resolution.

| ID     | Story                                                          | Status   | Estimate | Notes |
|--------|----------------------------------------------------------------|----------|----------|-------|
| E12-S1 | Migration 007 — add `sla_meeting_hours` to organization_settings | Todo   | 1        | Default 12h. Same shape as the other SLA columns. Plus `sla_breach_alerts_enabled` boolean. |
| E12-S2 | Plumb the new column through ticket-acceptance + reports        | Todo    | 2        | When a worker accepts, compute `sla_meeting_due_at` alongside the other SLA timestamps. Worker UI shows the meeting countdown. |
| E12-S3 | SuperAdmin SLA-settings UI page                                 | Todo    | 3        | `/admin/sla-settings` — number inputs for each SLA + Save. Validation (each step must be >= the previous). Audit log on every change. |
| E12-S4 | Per-category SLA overrides (optional, Phase 2)                  | Backlog | 5        | `Critical` severity gets tighter SLAs. JSON column or a separate table. Defer until we have data on which category-SLA mismatches actually matter. |
| E12-S5 | SLA breach behaviour config — escalation + alert recipients     | Backlog | 3        | Currently breach just sets `sla_breached_flag`. Extend to also notify a configurable list (state_leader, district_leader, escalation channel). |

---

## Issues / risks tracking

- **alert.wav on prod was 404** at last manual check (2026-05-13). Vercel deploys since then should have refreshed; verify on next session start. If still missing, inline as a base64 data URL in the React component.
- **Migration 006** is shipped as code but the user needs to apply it manually against Supabase. Until then, the `/admin/intake-settings` Save button errors with column-not-found.
- **Stray `images/` folder** at repo root contains April screenshots — untracked, never committed. Delete locally when convenient.

---

## Scope reference — what kinds of issues this platform addresses

Confirmed 2026-05-16: the platform's civic-scope already covers the issue
themes the org cares about, including opposition-angle topics. No code
change needed; this note exists so future Claude sessions know not to
narrow scope.

The included categories in `TENANT_CONFIG.civicScope.included` and the
LLM intake prompt support:

- **General civic** — drainage, potholes, waterlogging, garbage, streetlights, traffic, public transport, drinking water, electricity, ration cards, pensions, housing schemes, FIR refusal, women safety, cybercrime, stray dogs, lake pollution, jobs/TGPSC delays
- **Opposition-angle / governance accountability** — welfare funds not reaching beneficiaries, government hospital service gaps, environmental/nature degradation, land grabbing and *kabja* (encroachment), municipality negligence (GHMC complaints), HYDRAA demolitions, contractor accountability, corruption / bribery by public officials

The Amplify campaign tones (`activist`, `opposition`, `public_shame` from
migration 005) already produce post-ready draft content for the
opposition-framing use cases.

---

## How to update this file

At the end of each session:
1. Move completed stories out of the table they live in.
2. Add the per-session story commit hash next to its row in the session log inside `vocal-app/PROJECT_SUMMARY.md`.
3. Add any newly identified work as new rows (with status `Todo` or `Backlog`).
4. Regenerate the Linear CSV by running through this file and producing the same rows in the CSV.
5. Commit `backlog.md` + the new dated CSV together.

---

## Convention

- **Status** values map to Linear workflow states: `Todo`, `In Progress`, `In Review`, `Done`, `Backlog`, `Canceled`, plus `Parked` (custom — treat as low-priority Backlog in Linear).
- **Estimate** is story points (Fibonacci): 1 trivial, 2 small, 3 medium, 5 large, 8 X-large, 13 means split it.
- **Priority** maps to Linear: `Urgent`, `High`, `Medium`, `Low`, `No priority`.
