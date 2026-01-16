/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: BottomStickyButtons
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: BottomStickyButtons.protected.tsx

Created: January 16, 2026
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
- Right: "💌 Recommend a Friend / It's a Win Win" (Teal) → /refer (page TBD)

================================================================================
*/

'use client'

import Link from 'next/link'

// =============================================================================
// COMPONENT
// =============================================================================

export default function BottomStickyButtons() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 py-3 z-50">
      <div className="flex gap-3 max-w-3xl mx-auto">
        
        {/* Left Button: Go to Library (Orange) */}
        <Link 
          href="/library" 
          className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm rounded-xl text-center transition"
        >
          📚 Go to Library
        </Link>
        
        {/* Right Button: Recommend a Friend (Teal with White Text) */}
        <Link 
          href="/refer" 
          className="flex-1 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm rounded-xl text-center transition leading-tight"
        >
          💌 Recommend a Friend<br />
          <span className="text-xs font-normal">It's a Win Win</span>
        </Link>
        
      </div>
    </div>
  )
}


// =============================================================================
// REQUIRED: Add bottom padding to page content
// =============================================================================
/*
The Home Page must have padding at the bottom to prevent content from being
hidden behind the sticky buttons. Add this to the main content wrapper:

<div className="pb-24">
  {/* Page content *\/}
</div>

The pb-24 (96px) provides enough space for the sticky bar (~60px) plus breathing room.
*/


// =============================================================================
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
CONTAINER:
- fixed bottom-0 left-0 right-0
- bg-slate-950
- border-t border-slate-800
- px-4 py-3
- z-50

BUTTON WRAPPER:
- flex gap-3
- max-w-3xl mx-auto (centers on larger screens)

LEFT BUTTON (Library):
- flex-1
- py-3
- bg-orange-500 hover:bg-orange-400
- text-black
- font-semibold text-sm
- rounded-xl
- text-center
- transition
- Route: /library
- Text: "📚 Go to Library"

RIGHT BUTTON (Recommend):
- flex-1
- py-3
- bg-teal-500 hover:bg-teal-400
- text-white
- font-semibold text-sm
- rounded-xl
- text-center
- transition
- leading-tight (for two-line text)
- Route: /refer (page to be designed)
- Text Line 1: "💌 Recommend a Friend"
- Text Line 2: "It's a Win Win" (text-xs font-normal)
*/


// =============================================================================
// USAGE IN HOME PAGE
// =============================================================================
/*
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      
      <main className="pb-24">
        <ContinueListening />
        <NewReleases />
        <RecommendedForYou />
      </main>
      
      <BottomStickyButtons />
    </div>
  )
}
*/
