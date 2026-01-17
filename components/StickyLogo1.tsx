/*
================================================================================
🔒 PROTECTED MODULE 02 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 02_StickyLogo1
Location: ~/DriveTimeFiles/WorkingCodeLibrary/00_SharedComponents/
File: 02_StickyLogo1.protected.tsx

Created: January 17, 2026
Updated: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
Sticky header for HOME PAGE ONLY
- Logo centered between left edge and avatar
- 🚛 🚗 Drive Time Tales (Tales in orange)
- Avatar on right side with user's first initial

CHANGE LOG:
- 2026-01-17: Revised to center logo between left edge and avatar (not full width)

================================================================================
*/

'use client'

import Link from 'next/link'

interface StickyLogo1Props {
  userName?: string
}

export default function StickyLogo1({ userName = '' }: StickyLogo1Props) {
  
  const userInitial = userName?.charAt(0)?.toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-50 flex items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
      
      {/* Logo container - takes remaining space, centers logo within it */}
      <div className="flex-1 flex justify-center">
        <Link href="/home" className="flex items-center gap-2">
          <span className="text-3xl">🚛</span>
          <span className="text-3xl">🚗</span>
          <span className="font-bold text-white text-lg whitespace-nowrap">
            Drive Time <span className="text-orange-400">Tales</span>
          </span>
        </Link>
      </div>

      {/* Right - Circle Avatar */}
      <Link 
        href="/account"
        className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-lg hover:bg-orange-400 transition flex-shrink-0"
      >
        {userInitial}
      </Link>
    </header>
  )
}
