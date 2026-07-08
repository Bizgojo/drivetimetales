'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'

// Routes that render their own full-screen UI with an internal header.
// AppShell must not inject AppHeader or pt-14 padding on these paths.
const HEADERLESS_PREFIXES = ['/admin', '/player']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (HEADERLESS_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) {
    return <>{children}</>
  }

  return (
    <>
      <AppHeader />
      <main className="pt-14">{children}</main>
    </>
  )
}
