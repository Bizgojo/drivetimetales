/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: BottomStickyButtons
Location: /components/BottomStickyButtons.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
Bottom sticky button bar for the DTT Home Page.
Two side-by-side buttons fixed to the bottom of the screen.

BUTTONS:
- Left: "📚 Go to Library" (Orange) → /library
- Right: "💌 Recommend a Friend / It's a Win Win" (Teal) → /refer
================================================================================
*/

'use client'

import Link from 'next/link'

export default function BottomStickyButtons() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 py-2 z-50">
      <div className="flex gap-2">
        
        {/* Left Button: Go to Library (Orange) */}
        <Link 
          href="/library" 
          className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm rounded-xl text-center transition"
        >
          📚 Go to Library
        </Link>
        
        {/* Right Button: Recommend a Friend (Teal with White Text) */}
        <Link 
          href="/refer" 
          className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm rounded-xl text-center transition"
        >
          💌 Recommend a Friend
        </Link>
        
      </div>
    </div>
  )
}
