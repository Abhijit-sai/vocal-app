'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function ArchiveContactButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  const archive = async () => {
    const res = await fetch(`/api/directory/${id}`, { method: 'DELETE' })
    setConfirmOpen(false)
    if (res.ok) startTransition(() => router.refresh())
  }

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="text-[11px] font-medium"
        style={{ color: 'var(--canvas-muted)' }}
      >
        Archive
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px]" style={{ color: 'var(--canvas-text-dim)' }}>
        Archive {name}?
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={archive}
        className="text-[11px] font-medium px-2 py-0.5 rounded disabled:opacity-60"
        style={{ background: 'var(--alert-danger-border)', color: '#fff' }}
      >
        {pending ? '…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setConfirmOpen(false)}
        className="text-[11px]"
        style={{ color: 'var(--canvas-muted)' }}
      >
        Cancel
      </button>
    </div>
  )
}
