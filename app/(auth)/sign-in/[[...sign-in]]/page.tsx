import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'var(--canvas-bg)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white text-lg"
            style={{
              background: 'linear-gradient(135deg, var(--brand-500) 0%, var(--brand-700) 100%)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            V
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--canvas-text)' }}>
              Sign in to Vocal
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--canvas-muted)' }}>
              Civic issue management platform
            </p>
          </div>
        </div>

        <SignIn />

        <p className="text-xs text-center" style={{ color: 'var(--canvas-muted)' }}>
          New organization?{' '}
          <Link href="/sign-up" className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
