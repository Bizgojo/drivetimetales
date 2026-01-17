'use client'

import Link from 'next/link'

interface StickyLogo1Props {
  userName?: string
}

export default function StickyLogo1({ userName = '' }: StickyLogo1Props) {
  const userInitial = userName?.charAt(0)?.toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-50 flex items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
      <div className="flex-1 flex justify-center">
        <Link href="/home" className="flex items-center gap-2">
          <span className="text-3xl">🚛</span>
          <span className="text-3xl">🚗</span>
          <span className="font-bold text-white text-lg whitespace-nowrap">
            Drive Time <span className="text-orange-400">Tales</span>
          </span>
        </Link>
      </div>
      <Link 
        href="/account"
        className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-lg hover:bg-orange-400 transition flex-shrink-0"
      >
        {userInitial}
      </Link>
    </header>
  )
}
