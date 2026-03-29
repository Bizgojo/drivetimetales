'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function StickyHeaderFull() {
  const router = useRouter()
  const { user } = useAuth()
  const userInitial = user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'
  const isAdmin = user?.email === 'm.postlewaite@gmail.com'

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <button onClick={() => router.back()} className="w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} aria-label="Go back">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '36px', height: '36px', borderRadius: '8px', marginRight: '8px' }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'white' }}>Endless </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
          {user?.is_founding_member && (
            <span style={{ fontSize: '0.6rem', fontWeight: 700, background: '#f0a030', color: '#0a0a0f', padding: '2px 7px', borderRadius: '20px', marginLeft: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Founding Member</span>
          )}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && (
            <Link href="/admin" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f97316', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '20px', padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Admin
            </Link>
          )}
          <Link href="/account" className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-black font-bold text-lg transition-colors flex-shrink-0">
            {userInitial}
          </Link>
        </div>
      </div>
    </header>
  )
}
