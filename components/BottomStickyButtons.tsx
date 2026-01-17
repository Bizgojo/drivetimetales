/*
================================================================================
🔒 PROTECTED MODULE 09 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 09_BottomStickyButtons
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 09_BottomStickyButtons.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official bottom sticky button bar for the DTT Home Page.
Two side-by-side buttons fixed to the bottom of the screen.

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

BUTTONS:
- Left: "📚 Go to Library" (Orange) → /library
- Right: "💌 Recommend a Friend / It's a Win Win" (Teal) → /refer (page TBD - shows "Page Pending" popup)

================================================================================
*/

'use client'

import Link from 'next/link'
import { useState } from 'react'

// =============================================================================
// COMPONENT
// =============================================================================

export default function BottomStickyButtons() {
  const [showPendingPopup, setShowPendingPopup] = useState(false)

  return (
    <>
      {/* Bottom Sticky Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 py-3 z-50">
        <div className="flex gap-3 max-w-3xl mx-auto">
          
          {/* Left Button: Go to Library (Orange) */}
          <Link 
            href="/library" 
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm rounded-xl text-center transition"
          >
            📚 Go to Library
          </Link>
          
          {/* Right Button: Recommend a Friend (Teal with White Text) - Shows popup since page is pending */}
          <button 
            onClick={() => setShowPendingPopup(true)}
            className="flex-1 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm rounded-xl text-center transition leading-tight"
          >
            💌 Recommend a Friend<br />
            <span className="text-xs font-normal">It's a Win Win</span>
          </button>
          
        </div>
      </div>

      {/* Page Pending Popup */}
      {showPendingPopup && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
          onClick={() => setShowPendingPopup(false)}
        >
          <div 
            className="bg-slate-800 rounded-2xl p-6 mx-4 max-w-sm text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-3">🚧</div>
            <h3 className="text-xl font-bold text-white mb-2">Page Pending</h3>
            <p className="text-slate-300 text-sm mb-4">
              This feature is coming soon! We're working hard to bring you the referral program.
            </p>
            <button
              onClick={() => setShowPendingPopup(false)}
              className="bg-orange-500 hover:bg-orange-400 text-black font-semibold px-6 py-2 rounded-lg transition"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  )
}
