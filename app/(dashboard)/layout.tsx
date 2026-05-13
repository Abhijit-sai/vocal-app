import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { AppShell } from '@/components/shell/AppShell'
import { getCurrentVocalUser } from '@/lib/supabase/server'
import { tenantApp } from '@/config/tenant.config'
import type { RoleName } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await getCurrentVocalUser()

  // If user has Clerk session but no Vocal user record yet, show pending state
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: 'var(--shell-bg)' }}>
        <div className="text-center px-6 py-10 rounded-lg max-w-sm"
             style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
               style={{ background: '#1e3a2f' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--shell-text)' }}>
            Account Pending Activation
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--shell-muted)' }}>
            Your account has been registered and is pending activation by central support.
            You will receive a notification once it is approved.
          </p>
        </div>
      </div>
    )
  }

  const roleName = (user as any).roles?.name as RoleName

  return (
    <AppShell
      userRole={roleName}
      orgName={(user as any).organizations?.name ?? tenantApp.name}
      userName={user.full_name}
    >
      {children}
    </AppShell>
  )
}
