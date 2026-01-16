/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: HorizontalStoryCard
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: HorizontalStoryCard.protected.tsx

Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official horizontal story card template for ALL story card displays
in DTT including: Recommended For You, Library, Search Results, Browse sections.

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  FETCH AND USE THIS EXACT TEMPLATE WHEN HORIZONTAL STORY CARDS ARE NEEDED

================================================================================
*/

// =============================================================================
// REACT/TSX COMPONENT
// =============================================================================

import Link from 'next/link'

interface StoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  credits: number
  cover_url: string | null
  rating?: number        // e.g. 4.5
  review_count?: number  // e.g. 375
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

// Flag color mapping
const FLAG_STYLES: Record<string, string> = {
  'free': 'bg-green-500 text-white',
  'editors-pick': 'bg-purple-500 text-white',
  'readers-choice': 'bg-blue-500 text-white',
  'trending': 'bg-pink-500 text-white',
}

const FLAG_LABELS: Record<string, string> = {
  'free': 'Free',
  'editors-pick': "Editor's Pick",
  'readers-choice': "Reader's Choice",
  'trending': 'Trending',
}

// Star rating renderer
function renderStars(rating: number) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  
  return (
    <>
      <span className="text-yellow-400">{'★'.repeat(fullStars)}</span>
      {hasHalf && <span className="star-half">★</span>}
      {emptyStars > 0 && <span className="text-slate-600">{'★'.repeat(emptyStars)}</span>}
    </>
  )
}

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  credits,
  cover_url,
  rating,
  review_count,
  flag,
}: StoryCardProps) {
  return (
    <Link 
      href={`/player/${id}`}
      className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
    >
      {/* Cover: w-28 h-28 (112px) with p-2 padding */}
      <div className="w-28 h-28 flex-shrink-0 p-2">
        <div className="w-full h-full rounded-lg overflow-hidden cover-glow">
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            className="w-full h-full object-cover" 
          />
        </div>
      </div>
      
      {/* Info */}
      <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
        <h3 className="text-sm font-bold text-white line-clamp-1">{title}</h3>
        <p className="text-white text-xs">{genre}</p>
        <p className="text-white text-xs">by {author}</p>
        <p className="text-white text-xs">{duration_mins} min • {credits} credits</p>
        
        {/* Rating line with optional flag */}
        {rating !== undefined && (
          <p className="text-white text-xs flex items-center gap-1">
            {rating.toFixed(1)}/5 {renderStars(rating)} <span>{review_count?.toLocaleString()}</span>
            {flag && (
              <span className={`ml-1 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded ${FLAG_STYLES[flag]}`}>
                {FLAG_LABELS[flag]}
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  )
}


// =============================================================================
// REQUIRED CSS (add to globals.css or component)
// =============================================================================
/*
.cover-glow {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.4);
}

.star-half {
  background: linear-gradient(90deg, #facc15 50%, #475569 50%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
*/


// =============================================================================
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
CONTAINER:
- flex
- bg-slate-800
- rounded-xl
- overflow-hidden
- hover:bg-slate-700 transition

COVER WRAPPER:
- w-28 h-28 (112px x 112px)
- flex-shrink-0
- p-2 (8px padding around cover)

COVER INNER:
- w-full h-full
- rounded-lg
- overflow-hidden
- cover-glow (box-shadow: 0 0 15px rgba(255,255,255,0.4))

INFO AREA:
- flex-1
- py-2 pr-3
- flex flex-col justify-center

TYPOGRAPHY:
- Title: text-sm font-bold text-white line-clamp-1
- All meta lines: text-white text-xs
- Rating line: flex items-center gap-1

FLAG (optional, max 1 per card):
- Position: ml-1 after review count
- Size: px-1.5 py-0.5 text-[8px]
- Style: font-bold uppercase tracking-wide rounded
- Colors:
  - Free: bg-green-500
  - Editor's Pick: bg-purple-500
  - Reader's Choice: bg-blue-500
  - Trending: bg-pink-500

STAR RATING:
- Full star: text-yellow-400 ★
- Half star: CSS gradient (yellow|slate-600)
- Empty star: text-slate-600 ★
*/


// =============================================================================
// USAGE EXAMPLE
// =============================================================================
/*
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

<HorizontalStoryCard
  id="abc123"
  title="The Long Road Home"
  genre="Drama"
  author="Michael Torres"
  duration_mins={38}
  credits={2}
  cover_url="https://example.com/cover.jpg"
  rating={4.5}
  review_count={375}
  flag="readers-choice"
/>
*/
