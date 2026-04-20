'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
  name: string
}

type Mode = 'idle' | 'rejecting' | 'error'

export function ActivationActions({ id, name }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const post = async (body: { action: 'approve' | 'reject'; note?: string }) => {
    setError(null)
    const res = await fetch(`/api/workers/activation/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b?.error ?? 'Request failed')
      setMode('error')
      return
    }
    setMode('idle')
    setReason('')
    startTransition(() => router.refresh())
  }

  if (mode === 'rejecting') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          maxLength={500}
          className="text-xs px-2 py-1 rounded-md border outline-none focus:ring-2 w-48"
          style={{
            background: 'var(--canvas-surface)',
            borderColor: 'var(--canvas-border)',
            color: 'var(--canvas-text)',
          }}
        />
        <button
          type="button"
          disabled={pending || !reason.trim()}
          onClick={() => post({ action: 'reject', note: reason.trim() })}
          className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-50"
          style={{ background: 'var(--alert-danger-border)', color: '#fff' }}
        >
          Confirm reject
        </button>
        <button
          type="button"
          onClick={() => { setMode('idle'); setReason('') }}
          className="text-[11px]"
          style={{ color: 'var(--canvas-muted)' }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--alert-danger-text)' }}>
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => post({ action: 'approve' })}
        className="text-[11px] font-medium px-2.5 py-1 rounded-md disabled:opacity-50"
        style={{ background: 'var(--green-600)', color: '#fff' }}
        aria-label={`Approve ${name}`}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setMode('rejecting')}
        className="text-[11px] font-medium px-2.5 py-1 rounded-md disabled:opacity-50"
        style={{
          background: 'transparent',
          color: 'var(--alert-danger-text)',
          border: '1px solid var(--alert-danger-border)',
        }}
        aria-label={`Reject ${name}`}
      >
        Reject
      </button>
    </div>
  )
}
