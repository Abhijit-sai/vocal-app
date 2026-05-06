'use client'

/**
 * WorkerAlertSubscriber
 *
 * Polls /api/worker/alert every 10s. When a new assignment is detected:
 *   1. Plays /sounds/alert.wav (a real audio file — more reliable than
 *      programmatic Web Audio in browsers that aggressively block autoplay).
 *   2. Falls back to an oscillator beep if the file fails to play.
 *   3. Shows a browser Notification if the tab is in the background.
 *
 * Browser autoplay policy means the FIRST play attempt usually fails until
 * the user has interacted with the page. We render a tiny floating
 * "🔔 Enable alert sounds" chip until the worker taps it once — that single
 * interaction unlocks audio for the rest of the session, and we persist a
 * flag in localStorage so the chip doesn't reappear on subsequent visits.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 10_000
const ALERT_SRC = '/sounds/alert.wav'
const UNLOCKED_KEY = 'myleader:alerts-unlocked'

// ── Programmatic fallback (in case the audio file 404s or codec fails) ────
function playOscillatorFallback() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
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
    beep(1100, 0, 0.22)
    beep(1500, 0.28, 0.28)
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch { /* ignore */ }
}

export function WorkerAlertSubscriber() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSeenIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const [unlocked, setUnlocked] = useState(false)
  const [hidden, setHidden] = useState(false) // hide chip after user dismisses

  // Read unlocked flag from localStorage on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem(UNLOCKED_KEY) === '1') setUnlocked(true)
    } catch { /* private mode or storage blocked */ }
  }, [])

  // Play the alert sound (file first, oscillator fallback).
  const playAlert = useCallback(async () => {
    const el = audioRef.current
    if (el) {
      try {
        el.currentTime = 0
        await el.play()
        return
      } catch {
        // Browser blocked playback — fall back to oscillator (which may also
        // fail, but at least gives a chance on browsers that allow it).
      }
    }
    playOscillatorFallback()
  }, [])

  // Polling loop.
  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/alert', { cache: 'no-store' })
      if (!res.ok) return
      const { assignment } = await res.json()

      if (!assignment) {
        lastSeenIdRef.current = null
        return
      }

      // First poll after mount — record id without alarming.
      if (!initializedRef.current) {
        lastSeenIdRef.current = assignment.id
        initializedRef.current = true
        return
      }

      if (assignment.id !== lastSeenIdRef.current) {
        lastSeenIdRef.current = assignment.id
        playAlert()
        if (
          document.visibilityState !== 'visible' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          const ticket = assignment.tickets
          new Notification('🔔 New assignment — My Leader', {
            body: ticket?.original_issue_text?.slice(0, 100) ?? 'A ticket has been assigned to you.',
            tag: `assignment-${assignment.id}`,
          })
        }
      }
    } catch { /* network blip — try again next tick */ }
  }, [playAlert])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  // ── Unlock handler — runs on user click, satisfies autoplay policy ────
  async function handleUnlock() {
    const el = audioRef.current
    if (el) {
      try {
        el.currentTime = 0
        // Play once at audible volume so the user hears confirmation.
        await el.play()
      } catch {
        playOscillatorFallback()
      }
    } else {
      playOscillatorFallback()
    }
    try { localStorage.setItem(UNLOCKED_KEY, '1') } catch { /* ignore */ }
    setUnlocked(true)
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    setHidden(true)
  }

  const showChip = !unlocked && !hidden

  return (
    <>
      {/* Hidden audio element — preloaded so first play is instant */}
      <audio ref={audioRef} src={ALERT_SRC} preload="auto" aria-hidden="true" />

      {/* One-tap unlock chip — disappears once audio is unlocked */}
      {showChip && (
        <button
          type="button"
          onClick={handleUnlock}
          className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg animate-in"
          style={{
            background: '#CC0000',
            color: 'white',
            boxShadow: '0 4px 16px rgba(204, 0, 0, 0.35)',
          }}
          aria-label="Enable alert sounds for new ticket assignments"
        >
          <span aria-hidden="true">🔔</span>
          <span>Enable alert sounds</span>
          <span
            onClick={handleDismiss}
            className="ml-1 px-1.5 py-0.5 rounded-full text-xs opacity-70 hover:opacity-100"
            style={{ background: 'rgba(0,0,0,0.2)' }}
            role="button"
            aria-label="Dismiss"
          >
            ✕
          </span>
        </button>
      )}
    </>
  )
}
