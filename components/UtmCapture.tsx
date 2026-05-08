'use client'

// components/UtmCapture.tsx
// Mounts once at the root of the app. On every URL change, calls
// captureUtmFromUrl() which reads ?utm_source=...&utm_medium=...&utm_campaign=...
// from the current URL and stashes to localStorage if present.
// This component renders nothing.

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { captureUtmFromUrl } from '@/lib/utm'

export default function UtmCapture() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    captureUtmFromUrl()
    // Re-run on every navigation that changes pathname or query so that
    // a UTM that arrives mid-session (e.g. user clicks an ad after
    // already browsing) is captured.
  }, [pathname, searchParams])

  return null
}
