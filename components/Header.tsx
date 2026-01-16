/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: Header
Location: /components/Header.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
Header component for DTT pages. Shows logo centered, avatar on right.
No back button on Home page, back button on other pages.
================================================================================
*/

'use client'

import { useRouter } from 'next/navigation'

interface HeaderProps {
  showBackButton?: boolean
  userInitial?: string
}

export default function Header({ showBackButton = false, userInitial = 'U' }: HeaderProps) {
  const router = useRouter()

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950 sticky top-0 z-50">
      {/* Left: Back button or spacer */}
      <div className="w-10">
        {showBackButton && (
          <button 
            onClick={() => router.back()}
            className="text-white flex items-center gap-1"
          >
            <span>←</span>
          </button>
        )}
      </div>
      
      {/* Center: Logo */}
      <div className="flex items-center gap-1">
        <span className="text-xl">🚗</span>
        <span className="font-bold text-white text-sm">
          Drive Time <span className="text-orange-400">Tales</span>
        </span>
      </div>
      
      {/* Right: Avatar */}
      <div className="w-10 flex justify-end">
        <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-xs">
          {userInitial.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
