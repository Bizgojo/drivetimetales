'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function HomeHeader() {
  const { user } = useAuth()
  const userInitial = user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'
  const isFoundingMember = (user as any)?.is_founding_member

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <button onClick={() => window.history.back()} className="w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} aria-label="Go back">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link href="/home" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', gap: '4px' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '32px', height: '32px', borderRadius: '7px' }} />
            <span style={{ color: 'white' }}>Endless </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
          {isFoundingMember && (
            <span style={{ fontSize: '0.55rem', fontWeight: 700, background: '#f0a030', color: '#0a0a0f', padding: '2px 10px', borderRadius: '20px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Founding Member
            </span>
          )}
        </Link>
        <Link href="/account" className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-black font-bold text-lg transition-colors flex-shrink-0">
          {userInitial}
        </Link>
      </div>
    </header>
  )
}
