/*
================================================================================
🔒 PROTECTED MODULE 01 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 01_HorizontalStoryCard
Location: ~/DriveTimeFiles/WorkingCodeLibrary/00_SharedComponents/
File: 01_HorizontalStoryCard.protected.tsx

Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official horizontal story card template for ALL story card displays
in DTT including: Recommended For You, Library, Search Results, Browse sections.

⚠️ DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️ DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️ FETCH AND USE THIS EXACT TEMPLATE WHEN HORIZONTAL STORY CARDS ARE NEEDED
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
  rating?: number
  review_count?: number
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
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
            {rating.toFixed(1)}/5{' '}
            {renderStars(rating)}{' '}
            {review_count || 0}
            {flag && (
              <span 
                className="font-bold rounded ml-1"
                style={{ 
                  backgroundColor: flag === 'free' ? '#22c55e' : '#f97316', 
                  color: 'white', 
                  fontSize: '9px',
                  padding: '0.125rem 0.375rem'
                }}
              >
                {flag === 'free' ? 'FREE' : 
                 flag === 'editors-pick' ? "EDITOR'S PICK" :
                 flag === 'readers-choice' ? "READER'S CHOICE" : 'TRENDING'}
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  )
}

// =============================================================================
// STAR RATING HELPER
// =============================================================================

function renderStars(rating: number) {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<span key={i} className="text-yellow-400">★</span>)
    } else if (i === fullStars && hasHalf) {
      stars.push(<span key={i} className="star-half">★</span>)
    } else {
      stars.push(<span key={i} className="text-slate-600">★</span>)
    }
  }
  return stars
}

// =============================================================================
// REQUIRED CSS (add to globals.css)
// =============================================================================
/*
.cover-glow {
  box-shadow: 0 0 15px 2px rgba(255, 255, 255, 0.3);
}

.star-half {
  background: linear-gradient(90deg, #facc15 50%, #475569 50%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

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
