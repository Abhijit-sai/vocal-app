import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from "@/lib/supabase/server"
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { ContactFormDialog } from '@/components/directory/ContactFormDialog'
import { ArchiveContactButton } from '@/components/directory/ArchiveContactButton'

const WRITE_ROLES = ['super_admin', 'central_support']

export const dynamic = 'force-dynamic'

interface SearchParams {
  search?: string
  status?: 'verified' | 'unverified' | 'outdated' | 'all'
}

const STATUS_FILTERS: { label: string; value: 'all' | 'verified' | 'unverified' | 'outdated' }[] = [
  { label: 'All',         value: 'all'         },
  { label: 'Verified',    value: 'verified'    },
  { label: 'Unverified',  value: 'unverified'  },
  { label: 'Outdated',    value: 'outdated'    },
]

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const supabase = createSupabaseServiceClient()
  const roleName = (user as any).roles?.name
  const canWrite = WRITE_ROLES.includes(roleName)

  let query = supabase
    .from('directory_contacts')
    .select('id, contact_name, organization_name, role_designation, phone, phone_alternate, email, availability_notes, internal_notes, verification_status, active', { count: 'exact' })
    .eq('organization_id', user.organization_id)
    .eq('active', true)
    .order('contact_name', { ascending: true })
    .limit(200)

  if (params.status && params.status !== 'all') {
    query = query.eq('verification_status', params.status)
  }

  if (params.search) {
    const safe = params.search
      .replace(/[,()."'\\]/g, ' ')
      .replace(/[%_]/g, '\\$&')
      .trim()
      .slice(0, 100)
    if (safe) {
      query = query.or(
        `contact_name.ilike.%${safe}%,organization_name.ilike.%${safe}%,role_designation.ilike.%${safe}%`
      )
    }
  }

  const { data: contacts, count } = await query

  const buildHref = (changes: Partial<SearchParams>) => {
    const qp = new URLSearchParams()
    const merged = { ...params, ...changes } as Record<string, string | undefined>
    Object.entries(merged).forEach(([k, v]) => { if (v) qp.set(k, v) })
    const s = qp.toString()
    return s ? `/directory?${s}` : '/directory'
  }

  const verificationVariant = (status: string) => {
    if (status === 'verified')  return 'success' as const
    if (status === 'outdated')  return 'danger' as const
    return 'neutral' as const
  }

  return (
    <div>
      <PageHeader
        title="Directory"
        subtitle={`${count ?? 0} contact${(count ?? 0) !== 1 ? 's' : ''} · officials, vendors, partners`}
        actions={canWrite ? <ContactFormDialog mode="create" triggerLabel="+ New contact" /> : undefined}
      />

      <div className="p-6 sm:p-8 space-y-4 max-w-[1400px] mx-auto">

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--slate-100)' }}>
            {STATUS_FILTERS.map(f => {
              const isActive = f.value === 'all' ? !params.status : params.status === f.value
              return (
                <a
                  key={f.value}
                  href={buildHref({ status: f.value === 'all' ? undefined : f.value })}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                  style={{
                    background: isActive ? 'var(--canvas-surface)' : 'transparent',
                    color:      isActive ? 'var(--canvas-text)'    : 'var(--canvas-muted)',
                    boxShadow:  isActive ? 'var(--shadow-sm)'       : 'none',
                  }}
                >
                  {f.label}
                </a>
              )
            })}
          </div>

          <form method="GET" action="/directory" className="ml-auto relative">
            {params.status && <input type="hidden" name="status" value={params.status} />}
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ color: 'var(--canvas-muted)' }}
            >
              <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Search contacts…"
              className="text-sm pl-9 pr-3 py-1.5 rounded-md border outline-none transition-shadow focus:ring-2 w-56"
              style={{
                background: 'var(--canvas-surface)',
                borderColor: 'var(--canvas-border)',
                color: 'var(--canvas-text)',
              }}
            />
          </form>
        </div>

        {(contacts ?? []).length === 0 ? (
          <div className="card py-16 text-center">
            <div className="text-4xl mb-2">📇</div>
            <p className="text-sm font-medium" style={{ color: 'var(--canvas-text)' }}>
              No contacts found
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--canvas-muted)' }}>
              Add officials, vendors, and partners here so workers can reach them from a ticket.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(contacts ?? []).map((c: any) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm" style={{ color: 'var(--canvas-text)' }}>
                    {c.contact_name}
                  </span>
                  <Badge variant={verificationVariant(c.verification_status)} size="xs">
                    {c.verification_status}
                  </Badge>
                </div>
                {(c.organization_name || c.role_designation) && (
                  <div className="text-xs mb-2" style={{ color: 'var(--canvas-text-dim)' }}>
                    {[c.role_designation, c.organization_name].filter(Boolean).join(' · ')}
                  </div>
                )}
                <dl className="space-y-1 text-xs" style={{ color: 'var(--canvas-muted)' }}>
                  {c.phone && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0">Phone</dt>
                      <dd style={{ color: 'var(--canvas-text-dim)' }}>{c.phone}</dd>
                    </div>
                  )}
                  {c.phone_alternate && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0">Alt</dt>
                      <dd style={{ color: 'var(--canvas-text-dim)' }}>{c.phone_alternate}</dd>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex gap-2">
                      <dt className="w-12 flex-shrink-0">Email</dt>
                      <dd style={{ color: 'var(--canvas-text-dim)' }} className="truncate">{c.email}</dd>
                    </div>
                  )}
                  {c.availability_notes && (
                    <div className="flex gap-2 pt-1">
                      <dt className="w-12 flex-shrink-0">Avail</dt>
                      <dd style={{ color: 'var(--canvas-text-dim)' }}>{c.availability_notes}</dd>
                    </div>
                  )}
                </dl>

                {canWrite && (
                  <div
                    className="flex items-center justify-between gap-2 mt-3 pt-2"
                    style={{ borderTop: '1px solid var(--canvas-border)' }}
                  >
                    <ContactFormDialog
                      mode="edit"
                      initial={c}
                      triggerLabel="Edit"
                      triggerClassName="text-[11px] font-medium"
                    />
                    <ArchiveContactButton id={c.id} name={c.contact_name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!canWrite && (
          <div className="card p-4 text-xs" style={{ color: 'var(--canvas-muted)' }}>
            Only central support can add or edit contacts.
          </div>
        )}
      </div>
    </div>
  )
}
