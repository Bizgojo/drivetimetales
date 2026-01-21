/*
================================================================================
🔒 STANDARDIZED STORY CARD COMPONENT
================================================================================
File: HorizontalStoryCard.tsx
Location: ~/Projects/drivetimetales/components/

Created: January 21, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED - Use this on ALL pages with story cards

DESIGN:
- Cover: 112x112px with 8px padding and white glow
- Title: bold white, 1 line max
- Genre: dimmed gray (#94a3b8)
- Author: dimmed gray (#94a3b8)
- Duration/Credits: BOLD WHITE (fontWeight 600)
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
  credits?: number
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
        {/* Title - bold white */}
        <h3 className="text-sm font-bold text-white line-clamp-1">{title}</h3>
        
        {/* Genre - dimmed gray */}
        <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{genre}</p>
        
        {/* Author - dimmed gray */}
        <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>by {author}</p>
        
        {/* Duration/Credits - BOLD WHITE */}
        <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600 }}>
          {duration_mins} min • {displayCredits} credit{displayCredits !== 1 ? 's' : ''}
        </p>
      </div>
    </Link>
  )
}
