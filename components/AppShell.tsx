'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import { isAdFunnelArrival } from '@/lib/subscribeFunnel'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // ORION-SUB-CHROME-001 (Marc, 2026-07-12): /subscribe is chrome-free for
  // ad-funnel arrivals (promo/code/utm_* in the query) but keeps the header
  // for organic in-app visitors. window.location.search is read in an effect
  // (not useSearchParams) so the root layout never CSR-bails; /subscribe
  // renders header-less first and the header appears only once we know the
  // visitor is organic — an ad-funnel visitor never sees chrome flash in.
  const [subscribeOrganic, setSubscribeOrganic] = useState(false)
  useEffect(() => {
    if (pathname === '/subscribe') {
      setSubscribeOrganic(!isAdFunnelArrival(window.location.search))
    }
  }, [pathname])

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

  if (pathname === '/subscribe' && !subscribeOrganic) {
    return <>{children}</>
  }

  return (
    <>
      <AppHeader />
      <main className="pt-14">{children}</main>
    </>
  )
}
