'use client'

import { useEffect, useRef, useCallback } from 'react'

const POLL_INTERVAL_MS = 10_000

function playAlertSound() {
  try {
    const ctx = new AudioContext()

    function beep(freq: number, delay: number, duration: number) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.45, t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
      osc.start(t0)
      osc.stop(t0 + duration)
    }

    beep(880, 0, 0.22)
    beep(1100, 0.28, 0.28)
    beep(880, 0.60, 0.18)
  } catch {
    // AudioContext blocked (e.g. no user gesture yet) — silent fail
  }
}

export function WorkerAlertSubscriber() {
  const lastSeenIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/alert', { cache: 'no-store' })
      if (!res.ok) return
      const { assignment } = await res.json()

      if (!assignment) {
        lastSeenIdRef.current = null
        return
      }

      // On first load just record the current assignment — don't alarm.
      if (!initializedRef.current) {
        lastSeenIdRef.current = assignment.id
        initializedRef.current = true
        return
      }

      // New assignment arrived since last poll.
      if (assignment.id !== lastSeenIdRef.current) {
        lastSeenIdRef.current = assignment.id
        playAlertSound()

        // Show browser notification if tab is not focused.
        if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
          const ticket = assignment.tickets
          new Notification('New assignment — My Leader', {
            body: ticket?.original_issue_text?.slice(0, 100) ?? 'A ticket has been assigned to you.',
            tag: `assignment-${assignment.id}`,
          })
        }
      }
    } catch { /* network error — skip silently */ }
  }, [])

  useEffect(() => {
    // Request notification permission once.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  return null
}
