import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseServiceClient, getCurrentVocalUser } from '@/lib/supabase/server'

/**
 * GET /api/worker/alert
 * Returns the most recent "offered" assignment for the current ground worker.
 * Called by the WorkerAlertSubscriber to detect new assignments.
 */
export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ assignment: null }, { status: 401 })

  const user = await getCurrentVocalUser()
  if (!user) return NextResponse.json({ assignment: null }, { status: 401 })

  const roleName = (user as any).roles?.name
  if (roleName !== 'ground_worker') return NextResponse.json({ assignment: null })

  const supabase = createSupabaseServiceClient()

  const { data } = await supabase
    .from('ticket_assignments')
    .select('id, ticket_id, offered_at, tickets(ticket_number, original_issue_text, location_text)')
    .eq('worker_user_id', user.id)
    .eq('status', 'offered')
    .eq('is_current', true)
    .order('offered_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ assignment: data ?? null })
}
