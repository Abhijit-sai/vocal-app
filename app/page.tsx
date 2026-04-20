import { redirect } from 'next/navigation'

// Root route: redirect to dashboard (Clerk middleware handles auth)
export default function RootPage() {
  redirect('/dashboard')
}
