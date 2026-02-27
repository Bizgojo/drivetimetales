'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function StickyHeaderGuest() {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <button onClick={() => router.back()} className="w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} aria-label="Go back">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link href="/welcome" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/icons/icon-192x192.png" alt="Endless Tales" style={{ width: '36px', height: '36px', borderRadius: '8px', marginRight: '8px' }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'white' }}>Endless </span>
            <span style={{ color: '#fb923c' }}>Tales</span>
          </span>
        </Link>
        <div className="w-11 h-11 flex-shrink-0" />
      </div>
    </header>
  )
}
