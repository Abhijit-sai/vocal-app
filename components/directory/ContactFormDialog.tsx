'use client'

/**
 * Contact add/edit dialog for /directory.
 * Client component — posts to /api/directory (create) or PATCHes /api/directory/[id].
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface ContactFormInitial {
  id?: string
  contact_name?: string | null
  organization_name?: string | null
  role_designation?: string | null
  phone?: string | null
  phone_alternate?: string | null
  email?: string | null
  availability_notes?: string | null
  internal_notes?: string | null
  verification_status?: 'unverified' | 'verified' | 'outdated'
}

interface Props {
  mode: 'create' | 'edit'
  initial?: ContactFormInitial
  triggerLabel: string
  triggerClassName?: string
}

export function ContactFormDialog({ mode, initial, triggerLabel, triggerClassName }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const firstInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 40)
  }, [open])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const payload: Record<string, string> = {}
    for (const [k, v] of form.entries()) {
      payload[k] = typeof v === 'string' ? v : ''
    }

    const url = mode === 'create' ? '/api/directory' : `/api/directory/${initial?.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Save failed')
      return
    }

    setOpen(false)
    startTransition(() => router.refresh())
  }

  const inputStyle = {
    background: 'var(--canvas-surface)',
    borderColor: 'var(--canvas-border)',
    color: 'var(--canvas-text)',
  } as const

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'text-xs font-medium px-3 py-1.5 rounded-md'}
        style={triggerClassName ? { color: 'var(--primary)' } : {
          background: 'var(--primary)',
          color: 'var(--primary-text)',
        }}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-in"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-lg max-h-[92vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-form-title"
          >
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h2
                  id="contact-form-title"
                  className="text-base font-semibold"
                  style={{ color: 'var(--canvas-text)' }}
                >
                  {mode === 'create' ? 'New Contact' : 'Edit Contact'}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs"
                  style={{ color: 'var(--canvas-muted)' }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <Field label="Name" required>
                <input
                  ref={firstInputRef}
                  name="contact_name"
                  required
                  maxLength={200}
                  defaultValue={initial?.contact_name ?? ''}
                  className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                  style={inputStyle}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Organization">
                  <input
                    name="organization_name"
                    maxLength={200}
                    defaultValue={initial?.organization_name ?? ''}
                    className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Role / Designation">
                  <input
                    name="role_designation"
                    maxLength={120}
                    defaultValue={initial?.role_designation ?? ''}
                    className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input
                    name="phone"
                    maxLength={40}
                    defaultValue={initial?.phone ?? ''}
                    className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Alt Phone">
                  <input
                    name="phone_alternate"
                    maxLength={40}
                    defaultValue={initial?.phone_alternate ?? ''}
                    className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  maxLength={200}
                  defaultValue={initial?.email ?? ''}
                  className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                  style={inputStyle}
                />
              </Field>

              <Field label="Availability notes">
                <input
                  name="availability_notes"
                  maxLength={500}
                  defaultValue={initial?.availability_notes ?? ''}
                  placeholder="e.g. Mon–Fri 10am–5pm"
                  className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                  style={inputStyle}
                />
              </Field>

              <Field label="Internal notes">
                <textarea
                  name="internal_notes"
                  maxLength={1000}
                  rows={2}
                  defaultValue={initial?.internal_notes ?? ''}
                  className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2 resize-none"
                  style={inputStyle}
                />
              </Field>

              <Field label="Verification status">
                <select
                  name="verification_status"
                  defaultValue={initial?.verification_status ?? 'unverified'}
                  className="w-full text-sm px-3 py-2 rounded-md border outline-none focus:ring-2"
                  style={inputStyle}
                >
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="outdated">Outdated</option>
                </select>
              </Field>

              {error && (
                <div
                  className="text-xs px-3 py-2 rounded-md"
                  style={{
                    background: 'var(--alert-danger-bg)',
                    color: 'var(--alert-danger-text)',
                    borderLeft: '3px solid var(--alert-danger-border)',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md"
                  style={{ color: 'var(--canvas-text-dim)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-60"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  {pending ? 'Saving…' : mode === 'create' ? 'Create contact' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[11px] font-medium uppercase tracking-wider mb-1"
        style={{ color: 'var(--canvas-muted)' }}
      >
        {label}{required && <span style={{ color: 'var(--sev-critical)' }}> *</span>}
      </span>
      {children}
    </label>
  )
}
