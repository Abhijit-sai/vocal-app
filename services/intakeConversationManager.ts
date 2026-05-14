/**
 * Intake Conversation Manager
 * ===========================
 *
 * Replaces the rigid Telegram state machine in `services/telegramFlow.ts`
 * with a Gemini-driven, multilingual, scope-aware conversation manager.
 *
 * On each inbound citizen message, calls the LLM with:
 *   - the tenant's civic-scope policy (from TENANT_CONFIG)
 *   - the language guidance (always reply in the citizen's language/script)
 *   - the conversation history so far
 *   - any preprocessed multimodal content (transcribed voice / image
 *     description) — future, not in this initial version
 *   - the new inbound message
 *
 * Returns a structured response telling the caller:
 *   - what language the citizen used
 *   - what intent the message had (civic / out of scope / status check)
 *   - what new facts to merge into the draft ticket
 *   - what's still missing
 *   - whether we're ready to file the ticket
 *   - the reply text to send back (in the citizen's language)
 *
 * This service is intentionally pure — no DB writes. The caller decides
 * what to persist. Makes it cheap to test in the admin lab without
 * polluting the channel_conversations / tickets tables.
 *
 * Fail-soft: if OpenRouter is down or returns garbage, we return an
 * `unclear` intent with a fallback reply so the citizen still gets
 * SOMETHING. The caller can decide whether to retry or fall back to the
 * old state machine.
 */

import { tenantApp, tenantParty, tenantGeography, tenantLanguage, tenantCivicScope } from '@/config/tenant.config'

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY  = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_MODEL    = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash'

// ── Types ────────────────────────────────────────────────────────────────────

/** Where the message came from in the conversation history. */
export type Role = 'user' | 'assistant'

export interface ConversationTurn {
  role: Role
  content: string
}

/** Multimodal content already preprocessed into text. */
export interface PreprocessedMedia {
  /** Transcription of a voice note (in the source language). */
  voice_transcript?: string
  /** What's in the image (English description + any extracted text). */
  image_description?: string
  /** Image URL if the model is going to look at it directly (Phase 2). */
  image_url?: string
}

export interface IntakeRequest {
  /** Prior turns in this conversation, oldest first. */
  history: ConversationTurn[]
  /** The brand-new message from the citizen. */
  newMessage: {
    text?: string | null
    media?: PreprocessedMedia
  }
  /** Any draft facts already collected. The LLM can augment but not contradict. */
  existingDraft?: Record<string, unknown>
}

export interface IntakeResponse {
  /** Detected language of the citizen's message. */
  language: 'te' | 'en' | 'te-en-mixed' | 'unknown'
  /** What kind of message this is. */
  intent: 'civic_issue' | 'out_of_scope' | 'status_check' | 'small_talk' | 'unclear'
  /** New facts to merge into the draft. Caller decides how to persist. */
  draftUpdates: {
    issue_text?: string         // normalized English summary
    issue_text_native?: string  // citizen's own words preserved
    category?: string            // best-guess civic category
    location_text?: string       // free-text location (mandal/ward/landmark)
    severity_hint?: 'critical' | 'high' | 'medium' | 'low'
    timing?: string              // when it happened (e.g. "since 3 days")
    affected?: string            // who/what is affected
    wants_contact?: boolean      // does the citizen want a callback?
  }
  /** Fields the LLM still wants — human-readable list. */
  needsMoreInfo: string[]
  /** True when the LLM thinks we have enough to file the ticket. */
  readyToFile: boolean
  /** What to actually say back to the citizen (in their language). */
  replyText: string
  /** True when the citizen's matter is outside the civic scope. */
  outOfScope: boolean
  /** Why it was rejected — for audit + admin diagnostics. */
  outOfScopeReason?: string
  /** Raw LLM response metadata, useful for the admin lab UI. */
  _meta?: {
    model: string
    fallback: boolean
    error?: string
    raw_response?: string
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const included = tenantCivicScope.included.map(s => `  • ${s}`).join('\n')
  const excluded = tenantCivicScope.excluded.map(s => `  • ${s}`).join('\n')

  return `You are the intake assistant for ${tenantApp.name}, a civic grievance platform operated by ${tenantParty.name} in ${tenantGeography.rootName}, India.

ROLE
You help citizens file civic and government-related grievances. You guide them through a short, friendly conversation to capture enough detail to assign their issue to a field worker who can act on it.

LANGUAGES
Citizens may write in:
  - Pure Telugu (Telugu script: తెలుగు)
  - Tinglish (Telugu words written in English/Latin script, often mixed with English)
  - English

ALWAYS reply in the same language and script the citizen used in their most recent message. Match their register and tone. If they switch languages mid-conversation, you switch too. Do not translate their words back to them.

WHAT YOU HELP WITH (civic scope — IN SCOPE)
${included}

WHAT YOU DO NOT HELP WITH (OUT OF SCOPE)
${excluded}

If the citizen's matter is clearly out of scope, set intent = "out_of_scope", set outOfScope = true, give a brief outOfScopeReason in English (e.g. "family inheritance dispute"), and respond with a warm, brief polite-decline in their language. Do NOT try to file a ticket. Do NOT lecture. Suggest in one sentence that they seek appropriate legal / community help if relevant.

CONVERSATION STYLE
  - Warm but professional. Conversational, not corporate.
  - Ask ONE focused question at a time, not a checklist.
  - Never ask for something the citizen has already told you.
  - If their first message already has the issue + location + timing, don't drag out the conversation — confirm understanding and indicate you're filing the ticket.
  - Use brief, accessible language. Avoid jargon, government terminology, English bureaucratese in Telugu replies.
  - When acknowledging, mirror their words; don't paraphrase into bureaucratic register.

WHAT TO COLLECT FOR A FILEABLE TICKET
  1. A clear description of the civic issue (what's wrong)
  2. The location — mandal, ward, village, panchayat, or a clear landmark. THIS IS REQUIRED.
  3. When it happened or has been happening (best-effort)
  4. Severity hints (urgent? safety risk? affecting many people?) (best-effort)
  5. Whether the citizen wants a callback or wants to stay anonymous (best-effort)

Once description + location are in hand, you may set readyToFile = true even if optional fields are missing.

CATEGORY HINTS (use one of these if you can, otherwise leave blank)
  drainage, roads, waterlogging, garbage, streetlights, water_supply, tanker_water, electricity, traffic, public_transport, autos, land_records, land_grabbing, hydraa_demolition, illegal_construction, housing_scheme, ration_card, pension, police_inaction, women_safety, cybercrime, stray_dogs, pollution, lake_pollution, tgpsc_jobs, unemployment, accountability, corruption, other

OUTPUT FORMAT — CRITICAL
You MUST respond with a single valid JSON object in this exact shape (no markdown, no code fences, no extra text):

{
  "language": "te" | "en" | "te-en-mixed",
  "intent": "civic_issue" | "out_of_scope" | "status_check" | "small_talk" | "unclear",
  "draftUpdates": {
    "issue_text": "<one-sentence English summary of the issue OR omit>",
    "issue_text_native": "<citizen's own words, lightly cleaned OR omit>",
    "category": "<one of the categories above OR omit>",
    "location_text": "<mandal/ward/village/landmark as the citizen described it OR omit>",
    "severity_hint": "critical" | "high" | "medium" | "low" (omit if unsure),
    "timing": "<when it happened, e.g. '3 days ago' OR omit>",
    "affected": "<who/what is affected OR omit>",
    "wants_contact": true | false (omit if unsure)
  },
  "needsMoreInfo": ["<short field labels, e.g. 'location'>"],
  "readyToFile": <boolean>,
  "replyText": "<what to actually say to the citizen, in their language, 1-3 sentences>",
  "outOfScope": <boolean>,
  "outOfScopeReason": "<short English reason OR omit>"
}

Omit any field you don't have a value for. Don't fabricate.

The replyText is the ONLY thing the citizen will see. Keep it brief, warm, in their language. Don't include JSON, parentheticals, or stage directions.`
}

// ── LLM call ─────────────────────────────────────────────────────────────────

interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callOpenRouter(messages: OpenRouterChatMessage[]): Promise<{ content: string; error?: string }> {
  if (!OPENROUTER_API_KEY) {
    return { content: '', error: 'OPENROUTER_API_KEY not configured' }
  }
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': `${tenantApp.name} Intake`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return { content: '', error: `OpenRouter ${response.status}: ${body.slice(0, 400)}` }
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content ?? ''
    return { content }
  } catch (err) {
    return { content: '', error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function processInbound(req: IntakeRequest): Promise<IntakeResponse> {
  // Build the user-facing prompt — wrap the new message with any media context.
  const parts: string[] = []
  if (req.newMessage.text) {
    parts.push(req.newMessage.text)
  }
  if (req.newMessage.media?.voice_transcript) {
    parts.push(`[Voice note transcript]: ${req.newMessage.media.voice_transcript}`)
  }
  if (req.newMessage.media?.image_description) {
    parts.push(`[Image content]: ${req.newMessage.media.image_description}`)
  }
  const userContent = parts.join('\n\n') || '[Empty message]'

  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...req.history.map(t => ({
      role: t.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: t.content,
    })),
    { role: 'user', content: userContent },
  ]

  if (req.existingDraft && Object.keys(req.existingDraft).length > 0) {
    messages.push({
      role: 'system',
      content: `Already-collected facts about this issue (do not re-ask for these): ${JSON.stringify(req.existingDraft)}`,
    })
  }

  const { content, error } = await callOpenRouter(messages)

  // ── Fallback path: LLM unavailable or failed ──────────────────────────────
  if (error || !content) {
    return {
      language: 'unknown',
      intent: 'unclear',
      draftUpdates: {},
      needsMoreInfo: [],
      readyToFile: false,
      replyText:
        'క్షమించండి, ఇప్పుడు మా సిస్టమ్‌లో సమస్య ఉంది / Sorry, our system is having trouble right now. Please try again in a few minutes.',
      outOfScope: false,
      _meta: { model: OPENROUTER_MODEL, fallback: true, error },
    }
  }

  // ── Parse JSON ─────────────────────────────────────────────────────────────
  // Tolerate occasional ```json fences even though we asked for raw JSON.
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Final desperate fallback — extract the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch { parsed = null }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      language: 'unknown',
      intent: 'unclear',
      draftUpdates: {},
      needsMoreInfo: [],
      readyToFile: false,
      replyText: 'Could not understand the response. Please try again.',
      outOfScope: false,
      _meta: {
        model: OPENROUTER_MODEL,
        fallback: true,
        error: 'JSON parse failed',
        raw_response: content,
      },
    }
  }

  // ── Validate + normalize ──────────────────────────────────────────────────
  const result: IntakeResponse = {
    language: normaliseLanguage(parsed.language),
    intent: normaliseIntent(parsed.intent),
    draftUpdates: parsed.draftUpdates ?? {},
    needsMoreInfo: Array.isArray(parsed.needsMoreInfo) ? parsed.needsMoreInfo : [],
    readyToFile: Boolean(parsed.readyToFile),
    replyText: typeof parsed.replyText === 'string' ? parsed.replyText : '',
    outOfScope: Boolean(parsed.outOfScope),
    outOfScopeReason: typeof parsed.outOfScopeReason === 'string' ? parsed.outOfScopeReason : undefined,
    _meta: { model: OPENROUTER_MODEL, fallback: false },
  }
  // Belt-and-braces: if the LLM says out-of-scope but didn't supply a decline
  // message, fall back to the configured one in the citizen's detected language.
  if (result.outOfScope && !result.replyText) {
    result.replyText = result.language === 'te'
      ? tenantCivicScope.politeDecline.te
      : tenantCivicScope.politeDecline.en
  }
  return result
}

function normaliseLanguage(v: unknown): IntakeResponse['language'] {
  if (v === 'te' || v === 'en' || v === 'te-en-mixed') return v
  return 'unknown'
}
function normaliseIntent(v: unknown): IntakeResponse['intent'] {
  const allowed: IntakeResponse['intent'][] = ['civic_issue', 'out_of_scope', 'status_check', 'small_talk', 'unclear']
  return (allowed as string[]).includes(v as string) ? (v as IntakeResponse['intent']) : 'unclear'
}

// Re-exported for tests + the admin lab.
export const _internals = { buildSystemPrompt }
// Silence unused-import warning when language config isn't directly referenced.
void tenantLanguage
