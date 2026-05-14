/**
 * /admin/intake-settings — SuperAdmin-only toggle for the intake engine.
 *
 * V1 = rigid state machine (telegramFlow.ts): asks issue → media →
 *      location → confirm → file. Predictable, no LLM dependency.
 * V2 = LLM-driven manager (intakeConversationManager.ts): Telugu /
 *      Tinglish / English fluent, civic-scope filter, multimodal-aware.
 *
 * Setting is per-organization, persisted to organization_settings.
 * Telegram webhook reads it on every inbound message.
 */

import { redirect } from 'next/navigation'
import { getCurrentVocalUser } from '@/lib/supabase/server'
import { getIntakeVersion } from '@/services/intakeSettingsService'
import { PageHeader } from '@/components/ui/PageHeader'
import { IntakeSettingsClient } from '@/components/admin/IntakeSettingsClient'

export const dynamic = 'force-dynamic'

export default async function IntakeSettingsPage() {
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')

  const roleName = (user as any).roles?.name
  if (roleName !== 'super_admin') redirect('/dashboard')

  const currentVersion = await getIntakeVersion((user as any).organization_id)

  return (
    <div>
      <PageHeader
        title="Intake Settings"
        subtitle="Choose which engine powers the citizen Telegram conversation."
      />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <IntakeSettingsClient currentVersion={currentVersion} />
      </div>
    </div>
  )
}
