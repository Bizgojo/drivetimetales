'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function StickyHeaderFull() {
  const router = useRouter()
  const { user } = useAuth()
  
  // Get user initial from email or name
  const userInitial = user?.email?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo - Links to Home */}
        <Link href="/home" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
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
