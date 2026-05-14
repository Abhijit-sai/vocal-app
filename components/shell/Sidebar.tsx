'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { tenantApp } from '@/config/tenant.config'
import type { RoleName } from '@/types/database'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: RoleName[]
  badge?: number
}

interface NavSection {
  title?: string
  items: NavItem[]
}

interface SidebarProps {
  userRole: RoleName
  orgName: string
  userName: string
  /** When true, render as an icon-only rail (desktop collapsed mode). */
  collapsed?: boolean
  /** Called when the user taps a nav link — used to close the mobile drawer. */
  onNavigate?: () => void
}

// Simple inline SVG icons to avoid adding an icon library dependency
const Icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>
      <rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>
    </svg>
  ),
  inbox: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
    </svg>
  ),
  triage: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  tickets: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v3a2 2 0 100 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 100-4V7z"/>
      <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 2"/>
    </svg>
  ),
  workers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/>
      <polyline points="7 14 11 10 15 14 21 8"/>
    </svg>
  ),
  directory: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z"/>
      <path d="M9 4v16M4 9h5M4 15h5"/>
    </svg>
  ),
  amplify: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11h3l4-8v18l-4-8H3v-2z"/>
      <path d="M15 8a5 5 0 010 8"/>
      <path d="M18 5a9 9 0 010 14"/>
    </svg>
  ),
  audit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  ),
  assignments: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1"/>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  jobs: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      // Dashboard is for central support + org-wide leaders only; workers land
      // on /my-assignments, district leaders on /tickets.
      { label: 'Dashboard', href: '/dashboard', icon: Icons.dashboard,
        roles: ['super_admin', 'central_support', 'state_leader'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      // Triage is handled by central support + leaders (state/district scope
      // their triage to their own territories — enforced server-side).
      { label: 'Triage Queue', href: '/triage', icon: Icons.triage,
        roles: ['super_admin', 'central_support', 'state_leader', 'district_leader'] },
      { label: 'All Tickets', href: '/tickets', icon: Icons.tickets,
        roles: ['super_admin', 'central_support', 'state_leader', 'district_leader'] },
      { label: 'My Assignments', href: '/my-assignments', icon: Icons.assignments,
        roles: ['ground_worker'] },
      { label: 'Workers', href: '/workers', icon: Icons.workers,
        roles: ['super_admin', 'central_support', 'district_leader'] },
    ],
  },
  {
    title: 'Insight',
    items: [
      { label: 'Reports', href: '/reports', icon: Icons.reports,
        roles: ['super_admin', 'central_support', 'state_leader', 'district_leader'] },
      { label: 'Directory', href: '/directory', icon: Icons.directory,
        roles: ['super_admin', 'central_support', 'state_leader', 'district_leader', 'ground_worker'] },
      { label: 'Amplify', href: '/amplify', icon: Icons.amplify,
        roles: ['super_admin', 'central_support'] },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Audit Log', href: '/audit', icon: Icons.audit,
        roles: ['super_admin', 'central_support'] },
      // Manual job runner — stands in for the Vercel cron while we're on
      // Hobby. Central support taps it to sweep expired offers.
      { label: 'Jobs', href: '/jobs', icon: Icons.jobs,
        roles: ['super_admin', 'central_support'] },
      // LLM intake sandbox — pure prompt iteration, no DB writes.
      { label: 'Intake Lab', href: '/admin/intake-lab', icon: Icons.amplify,
        roles: ['super_admin', 'central_support'] },
      // Switch the live citizen Telegram bot between V1 (state machine)
      // and V2 (LLM conversation manager). super_admin only.
      { label: 'Intake Settings', href: '/admin/intake-settings', icon: Icons.amplify,
        roles: ['super_admin'] },
    ],
  },
]

function NavLink({ item, isActive, collapsed, onNavigate }: {
  item: NavItem; isActive: boolean; collapsed?: boolean; onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-md text-[13px] transition-colors ${
        collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-1.5'
      }`}
      style={{
        color: isActive ? 'var(--shell-text)' : 'var(--shell-text-dim)',
        background: isActive ? 'var(--shell-surface-hi)' : 'transparent',
      }}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
          style={{ background: 'var(--primary)' }}
        />
      )}
      <span
        className="flex-shrink-0 transition-colors"
        style={{ color: isActive ? 'var(--primary)' : 'var(--shell-muted)' }}
      >
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span
          className="ml-auto text-[10px] px-1.5 rounded-full font-medium min-w-[18px] text-center"
          style={{ background: 'var(--primary)', color: 'white' }}
        >
          {item.badge}
        </span>
      )}
    </Link>
  )
}

export function Sidebar({ userRole, orgName, userName, collapsed = false, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={`flex flex-col flex-shrink-0 shell-scroll h-full ${collapsed ? 'w-14' : 'w-60'}`}
      style={{ background: 'var(--shell-bg)', borderRight: '1px solid var(--shell-border)' }}
    >
      {/* Brand */}
      <div
        className={`flex items-center py-4 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}
        style={{ borderBottom: '1px solid var(--shell-border)' }}
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--brand-500) 0%, var(--brand-700) 100%)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          {tenantApp.shortName}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-[13px] truncate" style={{ color: 'var(--shell-text)' }}>
              {tenantApp.name}
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--shell-muted)' }}>
              {orgName}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 overflow-y-auto ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {NAV_SECTIONS.map((section, sIdx) => {
          const visibleItems = section.items.filter(i => i.roles.includes(userRole))
          if (visibleItems.length === 0) return null
          return (
            <div key={sIdx} className={sIdx === 0 ? '' : 'mt-5'}>
              {section.title && !collapsed && (
                <div
                  className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--shell-muted)' }}
                >
                  {section.title}
                </div>
              )}
              {section.title && collapsed && sIdx > 0 && (
                <div className="mx-1.5 my-2 border-t" style={{ borderColor: 'var(--shell-border)' }} />
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const itemPath = item.href.split('?')[0]
                  const isActive =
                    pathname === itemPath ||
                    (itemPath !== '/' && itemPath !== '/dashboard' && pathname.startsWith(itemPath))
                  return (
                    <NavLink
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div
        className={`py-3 flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'}`}
        style={{ borderTop: '1px solid var(--shell-border)' }}
      >
        <UserButton />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate" style={{ color: 'var(--shell-text)' }}>
              {userName}
            </div>
            <div className="text-[11px] capitalize truncate" style={{ color: 'var(--shell-muted)' }}>
              {userRole.replace(/_/g, ' ')}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
