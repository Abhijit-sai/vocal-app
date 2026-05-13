'use client'

/**
 * AppShell — the responsive chrome around every dashboard page.
 *
 * Behaviour:
 *   - ≥ md (desktop): sidebar is always mounted. A collapse toggle shrinks it
 *     to an icon rail; state persists in localStorage so it's sticky per
 *     browser.
 *   - < md (mobile):  sidebar is hidden behind a drawer. A hamburger button
 *     in the top bar opens it over a dimmed backdrop. Tapping a link or the
 *     backdrop closes it.
 *
 * The server layout renders `<AppShell>` with the sidebar props so nothing
 * client-only leaks into layout.tsx.
 */

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { WorkerAlertSubscriber } from './WorkerAlertSubscriber'
import { tenantApp } from '@/config/tenant.config'
import type { RoleName } from '@/types/database'

const LS_KEY = 'vocal:sidebar-collapsed'

interface Props {
  userRole: RoleName
  orgName: string
  userName: string
  children: React.ReactNode
}

export function AppShell({ userRole, orgName, userName, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Collapsed defaults to false; we hydrate from localStorage after mount so
  // SSR output is stable and Tailwind's md: classes don't fight with JS.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_KEY)
      if (saved === '1') setCollapsed(true)
    } catch { /* ignore */ }
  }, [])

  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v
      try { window.localStorage.setItem(LS_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  // Close the mobile drawer on Escape for accessibility.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Alert sound subscriber — only for ground workers */}
      {userRole === 'ground_worker' && <WorkerAlertSubscriber />}

      {/* Desktop sidebar — always mounted ≥ md; hidden < md. */}
      <div className="hidden md:flex h-full">
        <Sidebar
          userRole={userRole}
          orgName={orgName}
          userName={userName}
          collapsed={collapsed}
        />
      </div>

      {/* Mobile drawer (< md). Backdrop + slide-in sidebar. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <Sidebar
          userRole={userRole}
          orgName={orgName}
          userName={userName}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      {/* Main column: top bar + scrollable content */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          orgName={orgName}
          collapsed={collapsed}
          onMobileOpen={() => setMobileOpen(true)}
          onDesktopToggle={toggleCollapsed}
        />
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--canvas-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

function TopBar({
  orgName, collapsed, onMobileOpen, onDesktopToggle,
}: {
  orgName: string
  collapsed: boolean
  onMobileOpen: () => void
  onDesktopToggle: () => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 sm:px-4 h-12 flex-shrink-0"
      style={{ background: 'var(--shell-bg)', borderBottom: '1px solid var(--shell-border)' }}
    >
      {/* Mobile: hamburger + brand */}
      <button
        type="button"
        onClick={onMobileOpen}
        className="md:hidden p-2 -ml-2 rounded-md"
        style={{ color: 'var(--shell-text)' }}
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Desktop: collapse/expand toggle */}
      <button
        type="button"
        onClick={onDesktopToggle}
        className="hidden md:inline-flex p-2 -ml-2 rounded-md"
        style={{ color: 'var(--shell-text-dim)' }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 6 9 12 15 18"/>
          </svg>
        )}
      </button>

      {/* Mobile brand (hidden on desktop — sidebar already shows it) */}
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-[11px] text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--brand-500) 0%, var(--brand-700) 100%)' }}
        >
          {tenantApp.shortName}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--shell-text)' }}>
            {tenantApp.name}
          </div>
          <div className="text-[10px] truncate -mt-0.5" style={{ color: 'var(--shell-muted)' }}>
            {orgName}
          </div>
        </div>
      </div>
    </div>
  )
}
