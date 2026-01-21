/*
================================================================================
🔒 STANDARDIZED STORY CARD COMPONENT
================================================================================
File: HorizontalStoryCard.tsx
Location: ~/Projects/drivetimetales/components/

Created: January 21, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED - Use this on ALL pages with story cards

PURPOSE:
Universal story card component for DTT. Use this everywhere:
- Home page (NewReleases, RecommendedForYou, ContinueListening)
- Browse page
- Library page
- Search results
- Wishlist
- Collections

DESIGN:
- Cover: 112x112px with 8px padding and white glow
- Title: bold white, 1 line max
- Genre: dimmed (slate-400)
- Author: dimmed (slate-400)
- Duration/Credits: bold white
- Whole card links to /player/[id]

⚠️  DO NOT MODIFY WITHOUT MARC'S APPROVAL
================================================================================
*/

'use client'

import Link from 'next/link'

// =============================================================================
// TYPES
// =============================================================================

interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  credits?: number  // Optional - will calculate from duration if not provided
}

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  cover_url,
  credits
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? getCredits(duration_mins)

  return (
    <Link 
      href={`/player/${id}`}
      className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
      style={{ display: 'flex' }}
    >
      {/* Cover: 112x112px (7rem) with 8px padding */}
      <div style={{ width: '7rem', height: '7rem', flexShrink: 0, padding: '0.5rem' }}>
        <div 
          className="rounded-lg overflow-hidden cover-glow"
          style={{ width: '100%', height: '100%' }}
        >
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            className="object-cover"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
      
      {/* Info */}
      <div style={{ 
        flex: 1, 
        paddingTop: '0.5rem', 
        paddingBottom: '0.5rem', 
        paddingRight: '0.75rem', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center' 
      }}>
        <h3 className="text-sm font-bold text-white line-clamp-1">{title}</h3>
        <p className="text-slate-400 text-xs">{genre}</p>
        <p className="text-slate-400 text-xs">by {author}</p>
        <p className="text-white text-xs font-semibold">
          {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
        </p>
      </div>
    </Link>
  )
}


// =============================================================================
// REQUIRED CSS (should already be in globals.css)
// =============================================================================
/*
.cover-glow {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.4);
}
*/


// =============================================================================
// USAGE EXAMPLE
// =============================================================================
/*
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

// Single card
<HorizontalStoryCard
  id={story.id}
  title={story.title}
  genre={story.genre}
  author={story.author}
  duration_mins={story.duration_mins}
  cover_url={story.cover_url}
/>

// List of cards
<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
  {stories.map((story) => (
    <HorizontalStoryCard
      key={story.id}
      id={story.id}
      title={story.title}
      genre={story.genre}
      author={story.author}
      duration_mins={story.duration_mins}
      cover_url={story.cover_url}
    />
  ))}
</div>
*/
