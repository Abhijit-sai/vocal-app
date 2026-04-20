import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vocal – Civic Issue Platform',
  description: 'Intake, track, assign, and resolve citizen issues.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="en" className="h-full">
        <body className="h-full">{children}</body>
      </html>
    </ClerkProvider>
  )
}
