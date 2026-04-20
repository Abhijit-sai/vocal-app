/**
 * Telegram low-level helpers.
 *
 * - Sends messages via Telegram Bot API.
 * - Holds the canned message templates the bot uses. The bot is a GUIDED
 *   INTAKE assistant only — it must never give advice, answer general
 *   questions, or discuss anything outside the intake flow. All user-facing
 *   copy lives here so it's reviewable in one place.
 *
 * Message parse mode is Markdown V1 ("Markdown"): * = bold, _ = italic,
 * ` = code. Keep templates simple.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  opts: { markdown?: boolean } = {},
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.markdown === false ? undefined : 'Markdown',
        disable_web_page_preview: true,
      }),
    })
  } catch {
    // Never throw from send — webhook must always return 200.
  }
}

// ============================================================================
// Canned messages. Keep each one tight; the bot's voice is calm + helpful.
// No hype, no advice. Square brackets = slot-fills.
// ============================================================================

export const BOT = {
  welcome: () =>
`👋 *Hi, I'm Vocal's assistant.*
I help you report civic issues to your local organization.

What would you like to do?
• Type *report* — to file a new issue
• Type *status* — to check a ticket you've already filed
• Type *help* — to learn more

You can type /cancel at any time to stop.`,

  help: () =>
`*About Vocal*
Vocal collects civic issues from citizens and routes them to people who can help.

I can help you with just two things:
1. Filing a new issue — I'll ask a few quick questions.
2. Checking the status of a ticket you've already filed.

I won't give advice or discuss other topics — our team does that once your ticket is filed.

Type *report* to start.`,

  unclear: () =>
`Sorry, I didn't follow.
Type *report* to file a new issue, *status* to check one you've filed, or *help* to learn what I can do.`,

  startIssue: () =>
`Got it. Please describe the issue in your own words — *what happened*, *where*, and *when* if you know.

You can also send a voice note instead of typing.
Type /cancel to stop.`,

  askMedia: () =>
`Thanks. If you have *photos or videos* that show the issue, send them now (one by one is fine).

When you're done, type *done*.
If you have no media, type *skip*.`,

  mediaAdded: (count: number) =>
`Got it — ${count} attachment${count === 1 ? '' : 's'} so far. Send more, or type *done* when finished. Type *skip* to skip.`,

  askLocation: () =>
`Last step — *where is this happening?*

Easiest: tap the 📎 attachment button and share your *Location* pin.
Or just type the address, landmark, or area in a message.`,

  locationNeedsText: () =>
`I need something for the location. Please *share a location pin* or *type the address* in text.`,

  confirm: (args: { issue: string; mediaCount: number; location: string }) =>
`*Please confirm*

📝 *Issue*
${args.issue}

📎 *Attachments:* ${args.mediaCount}
📍 *Location:* ${args.location}

Reply *confirm* to file this, *edit* to change something, or /cancel to stop.`,

  editMenu: () =>
`What would you like to change?
• Type *1* — issue description
• Type *2* — attachments
• Type *3* — location
Or *confirm* to file as-is.`,

  cancelled: () =>
`Got it — cancelled. Type *report* whenever you're ready to start again.`,

  filed: (ticketNumber: string) =>
`✅ *Filed as \`${ticketNumber}\`*

Our team will review this and someone from the organization will reach out to you. Thanks for reporting.

You can type *status ${ticketNumber}* anytime to check progress, or *report* to file another issue.`,

  failed: () =>
`Something went wrong while filing this. Please type *confirm* again to retry, or /cancel to stop.`,

  statusNotFound: () =>
`I couldn't find that ticket. Please check the number (e.g. *status VOC-DEMO-0001*), or type *status* by itself to check your most recent ticket.`,

  statusNoRecent: () =>
`You don't have a ticket on record yet. Type *report* to file one.`,

  statusReply: (args: {
    ticketNumber: string
    stage: string
    lastUpdate: string
    latestNote?: string | null
  }) =>
`📋 *\`${args.ticketNumber}\`*
Stage: ${args.stage}
Last update: ${args.lastUpdate}${args.latestNote ? `\n\nLatest note:\n${args.latestNote}` : ''}`,

  postTicketIdle: () =>
`Type *report* to file another issue, or *status* to check an existing one.`,
} as const

// ============================================================================
// Stage label — citizen-friendly wording.
// ============================================================================
const STAGE_LABELS: Record<string, string> = {
  to_do:       'Registered — awaiting review',
  in_progress: 'In progress',
  on_hold:     'On hold',
  closed:      'Closed',
}
export function citizenStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

// ============================================================================
// Simple command / yes-no detection (locale-aware but small).
// Everything is case-insensitive and trimmed.
// ============================================================================
export function normalize(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase()
}

export function isCommand(text: string, cmd: string): boolean {
  const t = normalize(text)
  return t === cmd || t.startsWith(cmd + ' ') || t.startsWith(cmd + '@')
}

const YES_WORDS     = new Set(['yes', 'y', 'confirm', 'ok', 'okay', 'ha', 'haan', 'sahi', 'done', 'submit', 'file'])
const NO_WORDS      = new Set(['no', 'n', 'nope', 'cancel', 'stop'])
const SKIP_WORDS    = new Set(['skip', 'none', 'no media', 'nothing', 'pass'])
const DONE_WORDS    = new Set(['done', 'finished', 'that\'s all', 'thats all', 'no more'])
const EDIT_WORDS    = new Set(['edit', 'change', 'fix', 'update'])
const REPORT_WORDS  = new Set(['report', 'file', 'new', 'issue', 'complaint', 'problem'])
const STATUS_WORDS  = new Set(['status', 'track', 'check'])
const HELP_WORDS    = new Set(['help', 'info', '?'])

export const words = {
  isYes:    (t: string) => YES_WORDS.has(normalize(t)),
  isNo:     (t: string) => NO_WORDS.has(normalize(t)),
  isSkip:   (t: string) => SKIP_WORDS.has(normalize(t)),
  isDone:   (t: string) => DONE_WORDS.has(normalize(t)),
  isEdit:   (t: string) => EDIT_WORDS.has(normalize(t)),
  isReport: (t: string) => REPORT_WORDS.has(normalize(t)),
  isStatus: (t: string) => STATUS_WORDS.has(normalize(t)),
  isHelp:   (t: string) => HELP_WORDS.has(normalize(t)),
}

// Extract a ticket number from a string like "status VOC-DEMO-0001" or "VOC-DEMO-0001"
export function extractTicketNumber(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2,}[-_][A-Z0-9]+[-_]\d{2,})\b/)
  return m ? m[1].replace(/_/g, '-') : null
}
