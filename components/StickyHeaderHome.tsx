'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function StickyHeaderHome() {
  const { user } = useAuth()
  const userInitial = user?.first_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="w-11 h-11 flex-shrink-0" />
        <Link href="/home" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '36px', height: '36px', borderRadius: '8px', marginRight: '8px' }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'white' }}>Endless </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
        </Link>
        <Link href="/account" className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-black font-bold text-lg transition-colors flex-shrink-0">
          {userInitial}
        </Link>
      </div>
    </header>
  )
}
