'use client'

// components/ReferralCapture.tsx — REFERRAL-SIGNUP-001
// Mounts once in the root layout (next to UtmCapture). Renders nothing.
//  1. On every pathname change: stash ?ref=CODE (localStorage + cookie) so it
//     survives /welcome redirects and the Google/magic-link round-trip.
//  2. Whenever a session exists and a code is stored (except on /signup,
//     which claims after the Stripe handoff starts): claim it via
//     /api/referral/claim (process_referral). Retryable failures (users row
//     not created yet, network) keep the code and retry with backoff.
// Same pattern/rationale as UtmCapture: usePathname + window.location, no
// useSearchParams (which would force Suspense on every page).

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { captureReferralFromUrl, claimStoredReferral, readStoredReferral } from '@/lib/referral'

const RETRY_DELAYS_MS = [2000, 5000, 15000]

export default function ReferralCapture() {
  const pathname = usePathname()
  const { session } = useAuth()
  const accessToken = session?.access_token

  useEffect(() => {
    captureReferralFromUrl()
  }, [pathname])

  useEffect(() => {
    // /signup owns claim timing: it claims only after Stripe checkout starts,
    // because a failed checkout rolls the new account back (user/delete).
    if (pathname === '/signup') return
    if (!accessToken || !readStoredReferral()) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async (n: number) => {
      const result = await claimStoredReferral(accessToken)
      if (cancelled || result.done || n >= RETRY_DELAYS_MS.length) return
      timer = setTimeout(() => attempt(n + 1), RETRY_DELAYS_MS[n])
    }
    attempt(0)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [accessToken, pathname])

  return null
}
