/*
================================================================================
🔒 PROTECTED MODULE 08 - PRODUCTION SAFE VERSION
================================================================================
Module: 08_RecommendedForYou
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 08_RecommendedForYou.protected.tsx

Created: January 15, 2026
Updated: January 17, 2026 - Added inline styles for Tailwind purge protection
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
This is the official Recommended For You module for the DTT Home Page.
Shows 3 randomly selected stories using HorizontalStoryCard format (Module 01).

PRODUCTION FIX:
Critical layout properties use inline styles to prevent Tailwind CSS purging.
Colors, hover states, and text remain as Tailwind classes (these don't purge).

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Shows exactly 3 stories (random selection, must have cover_url)
- Uses HorizontalStoryCard layout (Module 01)
- Includes star ratings, review counts, and optional flags
- Entire card is clickable → /player/[id]

DATA SOURCE:
- Table: stories
- Query: WHERE cover_url IS NOT NULL, Random selection, LIMIT 3

================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  rating?: number
  review_count?: number
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// FLAG STYLES (matches Module 01 HorizontalStoryCard)
// =============================================================================

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

// =============================================================================
// STAR RATING RENDERER (matches Module 01 HorizontalStoryCard)
// =============================================================================

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

// =============================================================================
// COMPONENT
// =============================================================================

export default function RecommendedForYou() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Fetch random stories for recommendations (only with covers)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, rating, review_count, flag')
          .not('cover_url', 'is', null)
          .limit(3)

        if (error) {
          console.error('Error fetching recommendations:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchRecommendations:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendations()
  }, [])

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (loading) {
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ Recommended For You</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl overflow-hidden animate-pulse" style={{ display: 'flex' }}>
              <div style={{ width: '7rem', height: '7rem', flexShrink: 0, padding: '0.5rem' }}>
                <div className="rounded-lg bg-slate-700" style={{ width: '100%', height: '100%' }} />
              </div>
              <div style={{ flex: 1, paddingTop: '0.5rem', paddingBottom: '0.5rem', paddingRight: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <div className="bg-slate-700 rounded" style={{ height: '1rem', width: '75%' }} />
                <div className="bg-slate-700 rounded" style={{ height: '0.75rem', width: '50%' }} />
                <div className="bg-slate-700 rounded" style={{ height: '0.75rem', width: '66%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // =============================================================================
  // EMPTY STATE
  // =============================================================================

  if (stories.length === 0) {
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ Recommended For You</h2>
        <p className="text-white text-sm">No recommendations yet.</p>
      </section>
    )
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ Recommended For You</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {stories.map((story) => (
          <Link 
            key={story.id}
            href={`/player/${story.id}`}
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
                  src={story.cover_url || '/images/default-cover.png'} 
                  alt={story.title}
                  className="object-cover"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>
            
            {/* Info */}
            <div style={{ flex: 1, paddingTop: '0.5rem', paddingBottom: '0.5rem', paddingRight: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
              <p className="text-white text-xs">{story.genre}</p>
              <p className="text-white text-xs">by {story.author}</p>
              <p className="text-white text-xs">{story.duration_mins} min • {getCredits(story.duration_mins)} credits</p>
              
              {/* Rating line with optional flag */}
              {story.rating !== undefined && (
                <p className="text-white text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {story.rating.toFixed(1)}/5 {renderStars(story.rating)} <span>{story.review_count?.toLocaleString()}</span>
                  {story.flag && (
                    <span 
                      className={`font-bold uppercase tracking-wide rounded ${FLAG_STYLES[story.flag]}`}
                      style={{ marginLeft: '0.25rem', paddingLeft: '0.375rem', paddingRight: '0.375rem', paddingTop: '0.125rem', paddingBottom: '0.125rem', fontSize: '8px' }}
                    >
                      {FLAG_LABELS[story.flag]}
                    </span>
                  )}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}


// =============================================================================
// REQUIRED CSS (add to globals.css)
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
// INLINE STYLE CONVERSION REFERENCE
// =============================================================================
/*
TAILWIND → INLINE STYLE CONVERSIONS:

px-4        → paddingLeft: '1rem', paddingRight: '1rem'
pt-6        → paddingTop: '1.5rem'
pb-4        → paddingBottom: '1rem'
mb-4        → marginBottom: '1rem'
space-y-3   → display: 'flex', flexDirection: 'column', gap: '0.75rem'
flex        → display: 'flex'
w-28        → width: '7rem' (112px)
h-28        → height: '7rem' (112px)
flex-shrink-0 → flexShrink: 0
p-2         → padding: '0.5rem'
w-full      → width: '100%'
h-full      → height: '100%'
flex-1      → flex: 1
py-2        → paddingTop: '0.5rem', paddingBottom: '0.5rem'
pr-3        → paddingRight: '0.75rem'
flex-col    → flexDirection: 'column'
justify-center → justifyContent: 'center'
items-center → alignItems: 'center'
gap-1       → gap: '0.25rem'
gap-2       → gap: '0.5rem'
ml-1        → marginLeft: '0.25rem'
px-1.5      → paddingLeft: '0.375rem', paddingRight: '0.375rem'
py-0.5      → paddingTop: '0.125rem', paddingBottom: '0.125rem'
text-[8px]  → fontSize: '8px'
h-4         → height: '1rem'
h-3         → height: '0.75rem'
w-3/4       → width: '75%'
w-1/2       → width: '50%'
w-2/3       → width: '66%'

KEPT AS TAILWIND (don't get purged):
- Colors: bg-slate-800, bg-slate-700, bg-slate-600, bg-green-500, bg-purple-500, bg-blue-500, bg-pink-500, text-white, text-yellow-400
- Borders: rounded-xl, rounded-lg, rounded
- Text: text-lg, text-sm, text-xs, font-bold, line-clamp-1, uppercase, tracking-wide
- Interactions: hover:bg-slate-700, transition
- Overflow: overflow-hidden
- Object fit: object-cover
- Animation: animate-pulse
*/


// =============================================================================
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
SECTION CONTAINER:
- px-4 pt-6 pb-4

SECTION TITLE:
- text-lg font-bold text-white mb-4
- Emoji: ⭐

CARD LIST:
- space-y-3 (vertical stack with gap)

CARD (uses HorizontalStoryCard format from Module 01):
- flex bg-slate-800 rounded-xl overflow-hidden
- hover:bg-slate-700 transition
- Entire card wrapped in Link (clickable)
- Route: /player/[story.id]

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
- Genre: text-white text-xs
- Author: text-white text-xs (prefixed with "by ")
- Duration: text-white text-xs ("{duration} min • {credits} credits")
- Rating line: text-white text-xs flex items-center gap-1

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

DATA QUERY:
- Table: stories
- Select: id, title, genre, author, duration_mins, cover_url, rating, review_count, flag
- Filter: cover_url IS NOT NULL
- Limit: 3
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
