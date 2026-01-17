/*
================================================================================
🔒 PROTECTED MODULE 09 - PRODUCTION SAFE VERSION
================================================================================
Module: 09_BottomStickyButtons
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 09_BottomStickyButtons.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026 - Added inline styles for Tailwind purge protection
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official bottom sticky button bar for the DTT Home Page.
Two side-by-side buttons fixed to the bottom of the screen.

PRODUCTION FIX:
Critical layout properties use inline styles to prevent Tailwind CSS purging.
Colors, hover states, and text remain as Tailwind classes (these don't purge).

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
    <div 
      className="bg-slate-950 border-t border-slate-800"
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        paddingLeft: '1rem', 
        paddingRight: '1rem', 
        paddingTop: '0.75rem', 
        paddingBottom: '0.75rem', 
        zIndex: 50 
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '48rem', marginLeft: 'auto', marginRight: 'auto' }}>
        
        {/* Left Button: Go to Library (Orange) */}
        <Link 
          href="/library" 
          className="hover:bg-orange-400 text-black font-semibold text-sm rounded-xl transition"
          style={{ flex: 1, paddingTop: '0.75rem', paddingBottom: '0.75rem', textAlign: 'center', backgroundColor: '#f97316' }}
        >
          📚 Go to Library
        </Link>
        
        {/* Right Button: Recommend a Friend (Teal with White Text) */}
        <Link 
          href="/refer" 
          className="hover:bg-teal-400 text-white font-semibold text-sm rounded-xl transition"
          style={{ flex: 1, paddingTop: '0.75rem', paddingBottom: '0.75rem', textAlign: 'center', lineHeight: '1.25', backgroundColor: '#14b8a6' }}
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
// INLINE STYLE CONVERSION REFERENCE
// =============================================================================
/*
TAILWIND → INLINE STYLE CONVERSIONS:

fixed       → position: 'fixed'
bottom-0    → bottom: 0
left-0      → left: 0
right-0     → right: 0
px-4        → paddingLeft: '1rem', paddingRight: '1rem'
py-3        → paddingTop: '0.75rem', paddingBottom: '0.75rem'
z-50        → zIndex: 50
flex        → display: 'flex'
gap-3       → gap: '0.75rem'
max-w-3xl   → maxWidth: '48rem'
mx-auto     → marginLeft: 'auto', marginRight: 'auto'
flex-1      → flex: 1
py-3        → paddingTop: '0.75rem', paddingBottom: '0.75rem'
text-center → textAlign: 'center'
leading-tight → lineHeight: '1.25'

KEPT AS TAILWIND (don't get purged):
- Colors: bg-slate-950, bg-orange-500, bg-teal-500, text-black, text-white
- Borders: border-t, border-slate-800, rounded-xl
- Text: font-semibold, text-sm, text-xs, font-normal
- Interactions: hover:bg-orange-400, hover:bg-teal-400, transition
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
