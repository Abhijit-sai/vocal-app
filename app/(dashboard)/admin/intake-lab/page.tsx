/**
 * /admin/intake-lab — Sandbox to iterate the LLM intake prompt
 *
 * Role-gated to super_admin + central_support. Pure UI — no DB writes.
 * Type a citizen message in Telugu / Tinglish / English, optionally
 * carry a multi-turn history, see what the LLM produces. Use this to
 * find weak prompts BEFORE wiring the manager into the live Telegram
 * webhook.
 */

import { redirect } from 'next/navigation'
import { getCurrentVocalUser } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { IntakeLabClient } from '@/components/admin/IntakeLabClient'

export const dynamic = 'force-dynamic'

export default async function IntakeLabPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (!['super_admin', 'central_support'].includes(roleName)) {
    redirect('/dashboard')
  }

  return (
    <div>
      <PageHeader
        title="Intake Lab"
        subtitle="Test the LLM intake conversation manager. Pure sandbox — no DB writes."
      />
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <IntakeLabClient />
      </div>
    </div>
  )
}
