'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname?.startsWith('/admin')) {
    return <>{children}</>
  }

  // SUS/ATL-LANDING-001: /go is a single-CTA ad landing page — no global
  // header (back/account buttons are nav links, which the spec forbids there).
  // ORION-FUNNEL-POLISH-001 (Marc, 2026-07-12): same rule for /signup — the
  // whole paid-funnel path renders chrome-free; every exit is leakage.
  if (pathname === '/go' || pathname === '/signup') {
    return <>{children}</>
  }

  return (
    <>
      <AppHeader />
      <main className="pt-14">{children}</main>
    </>
  )
}
