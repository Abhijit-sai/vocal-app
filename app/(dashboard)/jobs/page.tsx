import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { JobsRunner } from '@/components/jobs/JobsRunner'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['super_admin', 'central_support']

export default async function JobsPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (!ALLOWED_ROLES.includes(roleName)) redirect('/dashboard')

  const supabase = createSupabaseServiceClient()

  // Last 50 runs, newest first. Joined to users so we can show who ran it.
  const { data: rows } = await supabase
    .from('audit_logs')
    .select('id, created_at, actor_user_id, new_value_json, users:actor_user_id(full_name)')
    .eq('organization_id', user.organization_id)
    .eq('event_type', 'job_expire_assignments_run')
    .order('created_at', { ascending: false })
    .limit(50)

  const runs = (rows ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at as string,
    actor_name: r.users?.full_name ?? '—',
    payload: r.new_value_json as Record<string, any> | null,
  }))

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Manually run scheduled jobs while Vercel cron is disabled"
      />
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <JobsRunner initialRuns={runs} />
      </div>
    </div>
  )
}
