import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentVocalUser, createSupabaseServiceClient } from '@/lib/supabase/server'
import { AmplifyEditor } from '@/components/amplify/AmplifyEditor'
import { PLATFORMS } from '@/services/amplifyService'

export const dynamic = 'force-dynamic'

const ALLOWED = ['super_admin', 'central_support']

export default async function AmplifySessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentVocalUser()
  if (!user) redirect('/sign-in')
  const roleName = (user as any).roles?.name
  if (!ALLOWED.includes(roleName)) redirect('/dashboard')

  const supabase = createSupabaseServiceClient()

  const { data: session } = await supabase
    .from('amplify_sessions')
    .select(`
      id, status, created_at, ticket_id, organization_id,
      tickets(
        id, ticket_number, title,
        original_issue_text, normalized_summary,
        location_text, latitude, longitude, severity
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!session || session.organization_id !== user.organization_id) notFound()

  const [{ data: sources }, { data: outputs }] = await Promise.all([
    supabase
      .from('amplify_source_selections')
      .select('id, source_type, source_content, included')
      .eq('session_id', id),
    supabase
      .from('amplify_generated_outputs')
      .select('id, output_format, tone, content, model_used, generated_at, metadata_json')
      .eq('session_id', id)
      .order('generated_at', { ascending: false }),
  ])

  // One "latest draft per platform" map for the editor's tabbed view.
  const latestByPlatform = new Map<string, any>()
  for (const o of outputs ?? []) {
    if (!latestByPlatform.has(o.output_format)) latestByPlatform.set(o.output_format, o)
  }

  const ticket = Array.isArray(session.tickets) ? session.tickets[0] : session.tickets as any

  return (
    <div className="min-h-full" style={{ background: 'var(--canvas-bg)' }}>
      <header
        className="px-6 sm:px-8 py-4"
        style={{ background: 'var(--canvas-surface)', borderBottom: '1px solid var(--canvas-border)' }}
      >
        <div className="flex items-center gap-2 mb-1 text-xs" style={{ color: 'var(--canvas-muted)' }}>
          <Link href="/amplify" className="hover:underline">Amplify</Link>
          <span>/</span>
          <span className="font-mono">{ticket?.ticket_number ?? id.slice(0, 8)}</span>
        </div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--canvas-text)' }}>
          Amplify editor
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--canvas-muted)' }}>
          Generate shareable content from the ticket record. Drafts only — review before publishing.
        </p>
      </header>

      <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">
        <AmplifyEditor
          sessionId={id}
          ticket={ticket}
          initialSources={sources ?? []}
          initialOutputs={Array.from(latestByPlatform.values())}
          platforms={PLATFORMS}
        />
      </div>
    </div>
  )
}
