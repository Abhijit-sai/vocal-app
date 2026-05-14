'use client'

/**
 * IntakeLabClient — sandbox UI for the LLM intake manager.
 *
 * Left:  chat-style conversation (citizen + assistant bubbles).
 * Right: structured JSON of the latest LLM response — language, intent,
 *        draft updates, needsMoreInfo, readyToFile, outOfScope, etc.
 *
 * Send a message → server calls processInbound() → updates both panes.
 * Reset button clears history. Quick-example chips fill the input with
 * common Telugu/Tinglish test cases.
 */

import { useState, useRef, useEffect } from 'react'

type Role = 'user' | 'assistant'

interface Turn {
  role: Role
  content: string
  // Only populated for assistant turns — the full structured response.
  response?: IntakeResponse
}

interface IntakeResponse {
  language: string
  intent: string
  draftUpdates: Record<string, unknown>
  needsMoreInfo: string[]
  readyToFile: boolean
  replyText: string
  outOfScope: boolean
  outOfScopeReason?: string
  _meta?: { model: string; fallback: boolean; error?: string; raw_response?: string }
}

// Curated examples covering civic / out-of-scope / mixed-language cases.
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Telugu — drainage',  text: 'మా ఊరిలో డ్రైనేజీ నీరు రోడ్డుపైకి వస్తోంది, ఎవరూ పట్టించుకోవడం లేదు.' },
  { label: 'Tinglish — power',   text: 'Maa colony lo current 3 days nundi cut chesthunnaru, evaru cheppadam ledu.' },
  { label: 'English — pothole',  text: 'There is a huge pothole on the main road near my house and someone could get hurt.' },
  { label: 'Telugu — ration',    text: 'రేషన్ కార్డ్ కోసం దరఖాస్తు చేసాను, మూడు నెలలు అయింది, ఇంకా రాలేదు.' },
  { label: 'OOS — family',       text: 'Maa annayyatho aasti panchina daani gurinchi sahaayam kaavaali.' },
  { label: 'OOS — marriage',     text: 'My husband is harassing me and I want a divorce. Can you help?' },
  { label: 'Drift — civic→OOS',  text: 'మా రోడ్డు బాగు లేదు. మరియు మా అన్నయ్యతో నాకు గొడవ ఉంది.' },
]

export function IntakeLabClient() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the conversation pane on new turn.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns])

  const latestResponse = [...turns].reverse().find(t => t.response)?.response

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const userTurn: Turn = { role: 'user', content: text }
    const nextTurns = [...turns, userTurn]
    setTurns(nextTurns)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intake-lab/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: turns.map(t => ({ role: t.role, content: t.role === 'assistant' ? (t.response?.replyText ?? t.content) : t.content })),
          newMessage: { text },
          existingDraft: draft,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      const r: IntakeResponse = body
      setTurns([...nextTurns, { role: 'assistant', content: r.replyText, response: r }])
      // Merge draft updates (don't overwrite existing keys with undefined)
      setDraft(prev => ({ ...prev, ...Object.fromEntries(Object.entries(r.draftUpdates ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')) }))
    } catch (e: any) {
      setError(e?.message ?? 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setTurns([])
    setDraft({})
    setInput('')
    setError(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ─── Conversation pane (2/3) ────────────────────────────────────── */}
      <section className="lg:col-span-2 card flex flex-col" style={{ minHeight: '70vh' }}>
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--canvas-border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--canvas-text)' }}>Conversation</h2>
            <p className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>{turns.length} turns · draft has {Object.keys(draft).length} field(s)</p>
          </div>
          <button onClick={reset} disabled={busy || turns.length === 0}
            className="text-xs px-2 py-1 rounded-md border disabled:opacity-40"
            style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}>
            Reset
          </button>
        </header>

        {/* Turns */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {turns.length === 0 && (
            <div className="text-center text-sm py-12" style={{ color: 'var(--canvas-muted)' }}>
              Pick an example below, or type a message to start.
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                style={t.role === 'user'
                  ? { background: 'var(--primary-soft-bg)', color: 'var(--primary-soft-text)' }
                  : { background: 'var(--canvas-surface-alt)', color: 'var(--canvas-text)', border: '1px solid var(--canvas-border)' }}
              >
                <div className="text-[10px] uppercase tracking-wider mb-1"
                  style={{ color: t.role === 'user' ? 'var(--primary-soft-text)' : 'var(--canvas-muted)', opacity: 0.85 }}>
                  {t.role === 'user' ? 'Citizen' : `Assistant${t.response?._meta?.fallback ? ' (fallback)' : ''}`}
                </div>
                {t.content}
                {t.response?.outOfScope && (
                  <div className="text-[10px] mt-1 px-1.5 py-0.5 inline-block rounded"
                    style={{ background: 'var(--alert-warning-bg)', color: 'var(--alert-warning-text)' }}>
                    Out of scope: {t.response.outOfScopeReason ?? 'n/a'}
                  </div>
                )}
                {t.response?.readyToFile && (
                  <div className="text-[10px] mt-1 px-1.5 py-0.5 inline-block rounded"
                    style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green-600)' }}>
                    Ready to file
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs italic" style={{ color: 'var(--canvas-muted)' }}>Thinking…</div>}
          {error && (
            <div className="text-xs px-3 py-2 rounded-md"
              style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)' }}>
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t p-3 space-y-2" style={{ borderColor: 'var(--canvas-border)' }}>
          {/* Quick examples */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                onClick={() => setInput(ex.text)}
                className="text-[11px] px-2 py-1 rounded-md border hover:bg-gray-50"
                style={{ borderColor: 'var(--canvas-border)', color: 'var(--canvas-text-dim)' }}
                title={ex.text}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type in Telugu / Tinglish / English. Cmd/Ctrl+Enter to send."
              rows={2}
              disabled={busy}
              className="flex-1 text-sm rounded-md border px-3 py-2 resize-none"
              style={{ borderColor: 'var(--canvas-border)', background: 'white' }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {busy ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </section>

      {/* ─── Inspector pane (1/3) ──────────────────────────────────────── */}
      <aside className="card p-4 space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--canvas-text)' }}>Latest response</h3>
          {!latestResponse ? (
            <p className="text-xs italic" style={{ color: 'var(--canvas-muted)' }}>No response yet</p>
          ) : (
            <dl className="text-xs space-y-2">
              <Field label="Language" value={latestResponse.language} />
              <Field label="Intent" value={latestResponse.intent} />
              <Field label="Ready to file" value={String(latestResponse.readyToFile)} />
              <Field label="Out of scope" value={String(latestResponse.outOfScope)} />
              {latestResponse.outOfScopeReason && <Field label="OOS reason" value={latestResponse.outOfScopeReason} />}
              {latestResponse.needsMoreInfo.length > 0 && (
                <Field label="Needs more" value={latestResponse.needsMoreInfo.join(', ')} />
              )}
              {latestResponse._meta?.fallback && (
                <Field label="⚠ Fallback" value={latestResponse._meta.error ?? 'unknown'} />
              )}
            </dl>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--canvas-text)' }}>Accumulated draft</h3>
          {Object.keys(draft).length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--canvas-muted)' }}>(empty)</p>
          ) : (
            <pre className="text-[11px] p-2 rounded-md overflow-x-auto whitespace-pre-wrap break-words"
              style={{ background: 'var(--canvas-surface-alt)', color: 'var(--canvas-text)', border: '1px solid var(--canvas-border)' }}>
              {JSON.stringify(draft, null, 2)}
            </pre>
          )}
        </div>

        {latestResponse && (
          <details>
            <summary className="text-xs font-medium cursor-pointer" style={{ color: 'var(--canvas-text-dim)' }}>
              Raw JSON response
            </summary>
            <pre className="text-[10px] p-2 mt-2 rounded-md overflow-x-auto whitespace-pre-wrap break-words"
              style={{ background: 'var(--canvas-surface-alt)', color: 'var(--canvas-text)', border: '1px solid var(--canvas-border)' }}>
              {JSON.stringify(latestResponse, null, 2)}
            </pre>
          </details>
        )}
      </aside>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium flex-shrink-0" style={{ color: 'var(--canvas-text-dim)' }}>{label}:</dt>
      <dd style={{ color: 'var(--canvas-text)' }}>{value}</dd>
    </div>
  )
}
