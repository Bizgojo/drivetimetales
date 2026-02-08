'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function StickyHeaderGuest() {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Back Button - Blue #3b82f6 */}
        <button
          onClick={() => router.back()}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          style={{ backgroundColor: '#3b82f6' }}
          aria-label="Go back"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo - Links to Welcome page for guests */}
        <Link href="/welcome" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-0.5">
            <span className="text-xl">🚗</span>
            <span className="text-2xl">🚛</span>
          </div>
          <span className="text-xl font-bold italic tracking-tight whitespace-nowrap">
            <span className="text-white">Drive Time </span>
            <span className="text-orange-400">Tales</span>
          </span>
        </Link>

        {/* Spacer for balance */}
        <div className="w-11 h-11 flex-shrink-0" />
      </div>
    </header>
  )
}
