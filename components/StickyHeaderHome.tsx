'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function StickyHeaderHome() {
  const { user } = useAuth()
  
  // Get user initial from email or name
  const userInitial = user?.first_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Spacer for balance */}
        <div className="w-11 h-11 flex-shrink-0" />

        {/* Logo - Links to Home (current page, but keeps consistent) */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-0.5">
            <span className="text-xl">🚗</span>
            <span className="text-2xl">🚛</span>
          </div>
          <span className="text-xl font-bold italic tracking-tight whitespace-nowrap">
            <span className="text-white">Drive Time </span>
            <span className="text-orange-400">Tales</span>
          </span>
        </Link>

        {/* Avatar - Links to Account */}
        <Link
          href="/account"
          className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-black font-bold text-lg transition-colors flex-shrink-0"
        >
          {userInitial}
        </Link>
      </div>
    </header>
  )
}
