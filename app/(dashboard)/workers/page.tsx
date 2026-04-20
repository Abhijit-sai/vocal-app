import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'
import { ActivationActions } from '@/components/workers/ActivationActions'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['super_admin', 'central_support', 'district_leader']

export default async function WorkersPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) redirect('/dashboard')

  const supabase = createSupabaseServiceClient()
  const orgId = user.organization_id

  const [workersRes, pendingRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, phone, email, active, last_login_at, created_at, roles(name, display_name)')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true })
      .limit(200),
    supabase
      .from('worker_activation_requests')
      .select('id, full_name, phone, email, status, created_at, territories(name)')
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const workers = workersRes.data ?? []
  const pending = pendingRes.data ?? []

  const activeCount = workers.filter((w: any) => w.active).length
  const inactiveCount = workers.length - activeCount

  return (
    <div>
      <PageHeader
        title="Workers"
        subtitle={`${workers.length} team member${workers.length !== 1 ? 's' : ''} · ${activeCount} active`}
      />

      <div className="p-6 sm:p-8 space-y-6 max-w-[1400px] mx-auto">

        {/* Pending activation requests */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
                Pending Activation
              </h2>
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums"
                style={{ background: 'var(--alert-warning-bg)', color: 'var(--alert-warning-text)' }}
              >
                {pending.length}
              </span>
            </div>
            <div className="card overflow-hidden">
              <ul className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
                {pending.map((p: any) => (
                  <li key={p.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--canvas-text)' }}>
                        {p.full_name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--canvas-muted)' }}>
                        {[p.phone, p.email, p.territories?.name].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--canvas-muted)' }}>
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </span>
                    <ActivationActions id={p.id} name={p.full_name} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Worker list */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>
              All Workers
            </h2>
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums"
              style={{ background: 'var(--slate-100)', color: 'var(--canvas-text-dim)' }}
            >
              {workers.length}
            </span>
            {inactiveCount > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--canvas-muted)' }}>
                · {inactiveCount} inactive
              </span>
            )}
          </div>
          {workers.length === 0 ? (
            <div className="card py-16 text-center">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
                No workers yet
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
                Users with org access will appear here after activation.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--canvas-border)', background: 'var(--canvas-surface-alt)' }}>
                    <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--canvas-muted)' }}>Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-40" style={{ color: 'var(--canvas-muted)' }}>Role</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-48" style={{ color: 'var(--canvas-muted)' }}>Contact</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-24" style={{ color: 'var(--canvas-muted)' }}>Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-32" style={{ color: 'var(--canvas-muted)' }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--canvas-border)' }}>
                  {workers.map((w: any) => (
                    <tr key={w.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--canvas-text)' }}>
                        {w.full_name}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--canvas-text-dim)' }}>
                        {w.roles?.display_name ?? w.roles?.name?.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--canvas-muted)' }}>
                        {[w.phone, w.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {w.active
                          ? <Badge variant="success" size="xs" dot>Active</Badge>
                          : <Badge variant="neutral" size="xs">Inactive</Badge>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--canvas-muted)' }}>
                        {w.last_login_at
                          ? formatDistanceToNow(new Date(w.last_login_at), { addSuffix: true })
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile list */}
          {workers.length > 0 && (
            <div className="space-y-2 md:hidden">
              {workers.map((w: any) => (
                <div key={w.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--canvas-text)' }}>
                      {w.full_name}
                    </span>
                    {w.active
                      ? <Badge variant="success" size="xs" dot>Active</Badge>
                      : <Badge variant="neutral" size="xs">Inactive</Badge>}
                  </div>
                  <div className="text-xs capitalize" style={{ color: 'var(--canvas-text-dim)' }}>
                    {w.roles?.display_name ?? w.roles?.name?.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
                    {[w.phone, w.email].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="card p-4 text-xs" style={{ color: 'var(--canvas-muted)' }}>
          <strong style={{ color: 'var(--canvas-text-dim)' }}>Coming in V1:</strong>{' '}
          reassign territories, view per-worker ticket counts and accept/reject rates, deactivate users.
        </div>
      </div>
    </div>
  )
}
