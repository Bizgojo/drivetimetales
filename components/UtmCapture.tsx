'use client'

// components/UtmCapture.tsx
// Mounts once at the root of the app. On every pathname change, calls
// captureUtmFromUrl() which reads ?utm_source=...&utm_medium=...&utm_campaign=...
// from window.location.search and stashes to localStorage if present.
// This component renders nothing.
//
// Note: we use usePathname() (no Suspense required) and read the query string
// directly from window.location inside the effect. We intentionally avoid
// useSearchParams() because that would force every page in the app to be
// wrapped in <Suspense>, breaking static prerendering.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureUtmFromUrl } from '@/lib/utm'

export default function UtmCapture() {
  const pathname = usePathname()

  useEffect(() => {
    captureUtmFromUrl()
  }, [pathname])

  return null
}
