'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function AppHeader() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const router = useRouter()
  const pathname = usePathname()
  const { user, session, loading } = useAuth()
  const accountUser = user || session?.user || null
  const nameValue = (accountUser && 'first_name' in accountUser ? accountUser.first_name : '') || accountUser?.user_metadata?.first_name || accountUser?.user_metadata?.full_name || accountUser?.user_metadata?.name
  const firstName = typeof nameValue === 'string' ? nameValue.trim().split(/\s+/)[0] : ''
  const showGreeting = pathname === '/home' && !loading && !!firstName

  if (pathname?.startsWith('/admin')) return null

  const goBack = () => {
    if (pathname === '/playlist') {
      const requested = new URLSearchParams(window.location.search).get('returnTo')
      const allowed = (value: string | null) => value === '/home' || value === '/library'
      let source: string | null = null
      try {
        const referrer = new URL(document.referrer)
        if (referrer.origin === window.location.origin) source = referrer.pathname
      } catch {}
      window.location.assign(allowed(requested) ? requested! : allowed(source) ? source! : '/home')
      return
    }
    // Account can follow an OAuth redirect: browser history may point to Google.
    // Primary app screens must return to an app destination, never auth history.
    if (pathname === '/account' || pathname === '/library') {
      // Use a document navigation here: the route transition must work even if
      // the persistent audio host has left Next client navigation in a bad state.
      window.location.assign('/home')
      return
    }
    if (pathname?.startsWith('/account/')) {
      window.location.assign('/account')
      return
    }
    // APP-HEADER-PLAYER-001: on the player screen router.back() returns users
    // to /go (ad teaser) when they arrived via the onboarding funnel.
    // Redirect to /home explicitly instead.
    if (pathname?.startsWith('/player/')) {
      // Never return into Google OAuth history after signing in to a story.
      window.location.assign('/home')
      return
    }
    if (pathname === '/' || window.history.length <= 1) {
      router.push('/')
      return
    }
    router.back()
  }

  const header = (
    <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 60 }} className="fixed left-0 right-0 top-0 z-50 h-14 w-full border-b border-slate-800 bg-slate-950 px-4">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        {/* APP-HEADER-HOME-001: hide back button on /home — no meaningful back destination
             from the home screen (router.back() returns to /go ad teaser for funnel users). */}
        {pathname !== '/home' ? (
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
        ) : (
          <Link
            href="/library"
            className="inline-flex h-11 flex-shrink-0 items-center justify-center rounded-md bg-orange-500 px-2 text-sm font-bold text-slate-950 transition-colors hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            Library
          </Link>
        )}

        <button
          type="button"
          // WALK-BUG-0713 #8 (Marc, 2026-07-13): logo → /home directly for
          // signed-in users (was '/' + signed-in bounce — one hop fewer, and
          // never depends on the root redirect). Signed-out keeps '/'.
          onClick={() => window.location.assign(accountUser || loading ? '/home' : '/')}
          className={`absolute left-1/2 flex -translate-x-1/2 items-center border-0 bg-transparent p-0 ${showGreeting ? 'flex-col gap-0.5' : 'gap-2'}`}
          aria-label="Go to Endless Tales home"
        >
          <span className={`flex items-center ${pathname === '/home' ? 'gap-1 min-[380px]:gap-2' : 'gap-2'}`}>
          <Image
            src="/images/et-logo.png"
            alt=""
            width={32}
            height={32}
            className={pathname === '/home' ? 'h-6 w-6 object-contain min-[380px]:h-8 min-[380px]:w-8' : 'h-8 w-8 object-contain'}
            priority
          />
          <span className={`whitespace-nowrap font-bold leading-none ${pathname === '/home' ? 'text-base min-[380px]:text-xl' : 'text-xl'}`}>
            <span className="text-white">Endless </span>
            <span style={{ color: '#f97316' }}>Tales</span>
          </span>
          </span>
          {showGreeting && <span className="block max-w-[190px] truncate text-xs font-semibold leading-tight text-white" title={`Hi ${firstName}`}>Hi {firstName}</span>}
        </button>

        <div className="flex items-center">
          {/* QUEUE-OFFLINE-001 (Marc, 2026-10-04): header "My Downloads" button removed —
              downloads are now managed from the "My Downloads" button on the Your Playlist
              card / Story List page (components/YourPlaylist.tsx, app/playlist/page.tsx). */}
          <button
            type="button"
            onClick={() => window.location.assign('/account')}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white transition-colors hover:bg-orange-400"
            disabled={loading}
            aria-busy={loading}
            aria-label={loading ? 'Loading account' : accountUser ? 'Go to account' : 'Sign in or view account'}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500">
              {accountUser?.user_metadata?.et_photo ? <img src={`/api/user/photo?v=${encodeURIComponent(accountUser.user_metadata.et_photo)}`} alt="" className="h-full w-full rounded-full object-cover" style={{ border: '2px solid #f97316', boxSizing: 'border-box' }} /> : !loading && accountUser && firstName ? <span aria-hidden="true" className="text-xl font-bold text-white">{Array.from(firstName)[0].toLocaleUpperCase()}</span> : !loading ? <User className="h-6 w-6" aria-hidden="true" /> : null}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
  return mounted ? createPortal(header, document.body) : header
}
