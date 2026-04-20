import { redirect } from 'next/navigation'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { WorkerQueue } from '@/components/workers/WorkerQueue'

export const dynamic = 'force-dynamic'

export default async function MyAssignmentsPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (roleName !== 'ground_worker') redirect('/dashboard')

  const supabase = createSupabaseServiceClient()

  // Current offered assignment (if any). Exclude expired offers — the cron
  // sweeps them minute-by-minute but we don't want workers tapping a stale
  // "Accept" in the gap between expiry and the cron run.
  const nowISO = new Date().toISOString()
  const { data: offeredRaw } = await supabase
    .from('ticket_assignments')
    .select(`
      id, expires_at, offered_at,
      tickets(
        id, ticket_number, title, original_issue_text,
        location_text, latitude, longitude,
        severity, stage, sub_status
      )
    `)
    .eq('worker_user_id', user.id)
    .eq('is_current', true)
    .eq('status', 'offered')
    .gt('expires_at', nowISO)
    .maybeSingle()

  // Active accepted tickets owned by this worker
  const { data: activeRaw } = await supabase
    .from('tickets')
    .select(`
      id, ticket_number, title, original_issue_text,
      location_text, severity, stage, sub_status,
      accepted_at, sla_first_contact_due_at, sla_resolution_due_at
    `)
    .eq('owner_user_id', user.id)
    .eq('stage', 'in_progress')
    .neq('sub_status', 'assigned_awaiting_acceptance')
    .order('accepted_at', { ascending: true })

  // Normalise Supabase join shapes (can be array or object)
  const offered = offeredRaw
    ? {
        id: offeredRaw.id,
        expires_at: offeredRaw.expires_at as string,
        ticket: Array.isArray(offeredRaw.tickets)
          ? offeredRaw.tickets[0]
          : offeredRaw.tickets as any,
      }
    : null

  return (
    <div>
      <PageHeader
        title="My Assignments"
        subtitle={offered ? '⏳ You have a pending offer — respond before it expires' : 'No pending offer right now'}
      />
      <div className="p-6 sm:p-8 max-w-3xl mx-auto">
        <WorkerQueue
          workerId={user.id}
          offered={offered}
          activeTickets={activeRaw ?? []}
        />
      </div>
    </div>
  )
}
