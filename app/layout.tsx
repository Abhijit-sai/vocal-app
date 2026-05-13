import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { tenantApp } from '@/config/tenant.config'
import { TenantThemeProvider } from '@/components/TenantThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: `${tenantApp.name} – Civic Issue Platform`,
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
        <body className="h-full">
          <TenantThemeProvider />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
