import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

/**
 * Server-side Supabase client — cookie-backed, uses anon key.
 * Kept for SSR flows that need cookie auth.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Server Component — read-only context */ }
        },
      },
    }
  )
}

/**
 * RLS-enforced Supabase client authenticated as the current Clerk user.
 *
 * Prereq: enable Clerk as a third-party auth provider in your Supabase project
 * (Dashboard → Authentication → Third-Party Auth → Clerk). Once enabled,
 * Supabase will validate Clerk session tokens and resolve auth.uid() to the
 * Clerk user id — matching the `auth.uid()::text = clerk_user_id` pattern
 * used in migration 002_rls_policies.sql.
 *
 * Use this in server components / route handlers for all reads and non-admin
 * writes. Falls back to unauthenticated anon requests if no session.
 */
export function createSupabaseUserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      async accessToken() {
        const { getToken } = await auth()
        // Clerk's native session token works with Supabase third-party auth.
        // If that integration isn't configured yet, pass template: 'supabase'.
        return (await getToken()) ?? null
      },
    }
  )
}

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Reserved for:
 * - Telegram webhook handler (no user session)
 * - Privileged admin writes that must bypass RLS by design
 * - Audit log inserts (no client insert policy)
 *
 * NEVER import this in Client Components or expose the service key to the browser.
 * Prefer createSupabaseUserClient() for anything that can run under the calling user.
 */
export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Get the current authenticated user's internal Vocal user record.
 * Uses service client so this works regardless of RLS/JWT setup — this
 * bootstrap query feeds org-scoping into every other query.
 */
export async function getCurrentVocalUser() {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('*, roles(*), organizations(name)')
    .eq('clerk_user_id', userId)
    .eq('active', true)
    .single()

  if (error || !data) return null
  return data
}
