'use client'

/**
 * Button that creates (or reuses) a draft Amplify session for a ticket and
 * navigates to the amplify list page. Used inside TicketActionsPanel.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function AmplifyLaunchButton({ ticketId }: { ticketId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const launch = async () => {
    setError(null)
    const res = await fetch('/api/amplify/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body?.error ?? 'Failed to create session')
      return
    }
    startTransition(() => router.push(`/amplify/${body.id}`))
  }

  return (
    <div className="pt-2" style={{ borderTop: '1px solid var(--canvas-border)' }}>
      <button
        type="button"
        disabled={pending}
        onClick={launch}
        className="block w-full text-center py-2 rounded-md text-xs font-medium disabled:opacity-60"
        style={{ background: 'var(--shell-surface)', color: 'var(--shell-text-dim)' }}
      >
        {pending ? 'Launching…' : '⚡ Launch Amplify session'}
      </button>
      {error && (
        <div
          className="text-[11px] mt-1.5 px-2 py-1 rounded"
          style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger-text)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
