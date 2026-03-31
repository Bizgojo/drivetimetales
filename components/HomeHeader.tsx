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
        <Link href="/home" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textDecoration: 'none', gap: '3px' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '32px', height: '32px', borderRadius: '7px' }} />
            <span style={{ color: 'white' }}>Endless </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
          {isFoundingMember && (
            <span style={{ fontSize: '0.55rem', fontWeight: 700, background: '#f0a030', color: '#0a0a0f', padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: '40px' }}>
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
