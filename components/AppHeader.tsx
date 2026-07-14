'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

function getInitial(user: ReturnType<typeof useAuth>['user']) {
  const firstName = user?.first_name || user?.user_metadata?.first_name || user?.user_metadata?.name
  const fallback = user?.email
  return (firstName || fallback || '').trim().charAt(0).toUpperCase()
}

export default function AppHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const initial = getInitial(user)

  if (pathname?.startsWith('/admin')) return null

  const goBack = () => {
    if (pathname === '/' || window.history.length <= 1) {
      router.push('/')
      return
    }
    router.back()
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-14 w-full border-b border-slate-800 bg-slate-950 px-4">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-400"
          aria-label="Go back"
        >
          <span className="text-3xl font-bold leading-none" aria-hidden="true">
            ‹
          </span>
        </button>

        <button
          type="button"
          // WALK-BUG-0713 #8 (Marc, 2026-07-13): logo → /home directly for
          // signed-in users (was '/' + signed-in bounce — one hop fewer, and
          // never depends on the root redirect). Signed-out keeps '/'.
          onClick={() => router.push(user ? '/home' : '/')}
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 border-0 bg-transparent p-0"
          aria-label="Go to Endless Tales home"
        >
          <Image
            src="/images/et-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
          <span className="whitespace-nowrap text-xl font-bold leading-none">
            <span className="text-white">Endless </span>
            <span style={{ color: '#f97316' }}>Tales</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => router.push('/account')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white transition-colors hover:bg-orange-400"
          aria-label={user ? 'Go to account' : 'Sign in or view account'}
        >
          {initial ? initial : <User className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}
