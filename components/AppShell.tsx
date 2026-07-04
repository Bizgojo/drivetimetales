'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname?.startsWith('/admin')) {
    return <>{children}</>
  }

  return (
    <>
      <AppHeader />
      <main className="pt-14">{children}</main>
    </>
  )
}
