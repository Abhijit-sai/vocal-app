/**
 * Amplify generation service.
 *
 * Given an amplify_session (which has source selections already attached),
 * produce draft public-facing content in a target format + tone. Persists
 * each draft as an amplify_generated_outputs row and returns the generated
 * content to the caller.
 *
 * Fail-soft: if OpenRouter is unavailable or misconfigured, we fall back
 * to a deterministic template-only draft so the UI still has something to
 * show. The fallback is clearly marked in metadata_json.
 */

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash-preview'

export type AmplifyPlatform =
  | 'tweet'                  // X/Twitter — single tweet or short thread
  | 'instagram_caption'      // IG caption w/ hashtags
  | 'facebook_post'          // FB post — slightly longer, narrative tone
  | 'whatsapp_broadcast'     // WhatsApp broadcast text, plain, forwardable
  | 'news_article'           // Press-style news article pitch
  | 'letter_to_authority'    // Formal letter to concerned authority
  | 'press_release'          // PR-style release

export type AmplifyTone = 'informative' | 'urgent' | 'formal' | 'empathetic' | 'neutral'

export interface PlatformMeta {
  key: AmplifyPlatform
  label: string
  short_hint: string
  char_hint?: number
}

export const PLATFORMS: PlatformMeta[] = [
  { key: 'tweet',              label: 'Twitter / X',         short_hint: 'Single post, 280 chars, 2–3 hashtags.', char_hint: 280 },
  { key: 'instagram_caption',  label: 'Instagram',           short_hint: 'Caption with line breaks, emoji, hashtags at the end.' },
  { key: 'facebook_post',      label: 'Facebook',            short_hint: 'Short narrative post, 2–4 paragraphs, clear call to action.' },
  { key: 'whatsapp_broadcast', label: 'WhatsApp Broadcast',  short_hint: 'Plain text, forward-friendly. No markdown, use *bold* sparingly.' },
  { key: 'news_article',       label: 'News Article Pitch',  short_hint: 'Headline + 4–6 para body, inverted pyramid.' },
  { key: 'letter_to_authority',label: 'Letter to Authority', short_hint: 'Formal letter to named official. Subject, salutation, body, sign-off.' },
  { key: 'press_release',      label: 'Press Release',       short_hint: 'FOR IMMEDIATE RELEASE header, dateline, body, boilerplate.' },
]

function systemPromptFor(platform: AmplifyPlatform, tone: AmplifyTone): string {
  const base = `You are drafting public-facing civic-advocacy content for a legitimate citizen-grievance organization. Be factual, non-inflammatory, and never invent details. Output plain text only — no JSON, no preamble, no markdown fences. Never use the word "Disclaimer:".`
  const toneLine = `Tone: ${tone}.`
  switch (platform) {
    case 'tweet':
      return `${base}\n${toneLine}\nWrite ONE tweet under 280 characters. Include 2–3 relevant hashtags at the end. No @-mentions unless supplied in the source. No links.`
    case 'instagram_caption':
      return `${base}\n${toneLine}\nWrite an Instagram caption: a hook line, 2–4 short paragraphs, then a block of 6–10 hashtags. Emojis allowed but sparing.`
    case 'facebook_post':
      return `${base}\n${toneLine}\nWrite a Facebook post. Narrative voice, 2–4 short paragraphs. End with a clear ask of the reader (share, sign, report, etc).`
    case 'whatsapp_broadcast':
      return `${base}\n${toneLine}\nWrite a WhatsApp broadcast message. Plain text that reads well when forwarded. Short paragraphs. No hashtags. Use *word* for bold only where it clarifies the ask.`
    case 'news_article':
      return `${base}\n${toneLine}\nWrite a news-article pitch in inverted-pyramid style: a one-line headline, a 25-word lede, then 4–6 short paragraphs with verified details and quotes only if present in the source.`
    case 'letter_to_authority':
      return `${base}\n${toneLine}\nDraft a formal letter to the concerned authority. Include: date placeholder [Date], recipient placeholder [Authority Name & Designation], subject line, salutation, 3–5 paragraphs of factual grievance + request for action, closing, sign-off placeholder [Name & Contact]. Use formal English throughout.`
    case 'press_release':
      return `${base}\n${toneLine}\nWrite a press release: "FOR IMMEDIATE RELEASE" line, a dateline ([City, Date] —), a strong lead paragraph, 3–4 body paragraphs, a short quote placeholder, and a one-line boilerplate about the organization.`
  }
}

export interface GenerateArgs {
  platform: AmplifyPlatform
  tone: AmplifyTone
  sources: Array<{ label: string; content: string }>
  extraContext?: string
}

export interface GenerateResult {
  content: string
  fallback: boolean
  model: string
  error?: string
}

export async function generateAmplifyContent(args: GenerateArgs): Promise<GenerateResult> {
  const sourceBlock = args.sources
    .filter(s => s.content?.trim())
    .map(s => `### ${s.label}\n${s.content.trim()}`)
    .join('\n\n') || '(no sources selected — write from context only)'

  const userPrompt = `Source material for the grievance:\n\n${sourceBlock}${
    args.extraContext ? `\n\nAdditional context: ${args.extraContext}` : ''
  }\n\nDraft the requested content now.`

  if (!OPENROUTER_API_KEY) {
    return {
      content: fallbackDraft(args, sourceBlock),
      fallback: true,
      model: 'fallback-template',
      error: 'OPENROUTER_API_KEY not configured',
    }
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://vocal-app.vercel.app',
        'X-Title': 'Vocal Amplify',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPromptFor(args.platform, args.tone) },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const data = await res.json()
    const content = (data.choices?.[0]?.message?.content ?? '').trim()
    if (!content) throw new Error('Empty AI response')
    return { content, fallback: false, model: OPENROUTER_MODEL }
  } catch (err) {
    return {
      content: fallbackDraft(args, sourceBlock),
      fallback: true,
      model: 'fallback-template',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function fallbackDraft(args: GenerateArgs, sources: string): string {
  const tag = `[Auto-generated fallback — AI unavailable. Please edit before publishing.]`
  const summary = sources.slice(0, 500)
  switch (args.platform) {
    case 'tweet':
      return `${tag}\n\nCitizens are raising a serious concern that needs urgent attention. Read below and share.\n#Accountability #Vocal`
    case 'instagram_caption':
    case 'facebook_post':
      return `${tag}\n\nA citizen has reported an issue requiring attention:\n\n${summary}\n\nWe've filed this and are tracking progress. Please share to amplify.`
    case 'whatsapp_broadcast':
      return `${tag}\n\n*Citizen grievance filed*\n\n${summary}\n\nForward to anyone who can help escalate.`
    case 'news_article':
      return `${tag}\n\nHEADLINE: Citizen grievance awaits action\n\nLEDE: A citizen has filed a grievance requiring official attention. Details below.\n\n${summary}`
    case 'letter_to_authority':
      return `${tag}\n\n[Date]\n\nTo,\n[Authority Name & Designation]\n\nSubject: Citizen grievance requiring immediate action\n\nDear Sir/Madam,\n\n${summary}\n\nWe request your prompt intervention.\n\nSincerely,\n[Name & Contact]`
    case 'press_release':
      return `${tag}\n\nFOR IMMEDIATE RELEASE\n\n[City, Date] — Vocal has today surfaced a citizen grievance requiring official attention.\n\n${summary}`
  }
}
