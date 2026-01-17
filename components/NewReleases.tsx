/*
================================================================================
🔒 PROTECTED MODULE 07 - PRODUCTION SAFE VERSION
================================================================================
Module: 07_NewReleases
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 07_NewReleases.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026 - Added inline styles for Tailwind purge protection
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
This is the official New Releases module for the DTT Home Page.
Shows the 2 most recently published stories in a 2-column grid with gray background.

PRODUCTION FIX:
Critical layout properties use inline styles to prevent Tailwind CSS purging.
Colors, hover states, and text remain as Tailwind classes (these don't purge).

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Shows exactly 2 stories (most recent by published_on)
- 2-column grid layout
- Each card has bg-slate-800 background with p-2 padding
- No flags on New Releases cards
- Entire card is clickable → /player/[id]

DATA SOURCE:
- Table: stories
- Query: ORDER BY published_on DESC LIMIT 2

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
  published_on: string
}

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// HELPER: Format date
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function NewReleases() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNewReleases() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, published_on')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })
          .limit(2)

        if (error) {
          console.error('Error fetching new releases:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchNewReleases:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchNewReleases()
  }, [])

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (loading) {
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 New Releases</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}>
              <div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1 / 1', marginBottom: '0.5rem' }} />
              <div className="bg-slate-700 rounded" style={{ height: '0.75rem', marginBottom: '0.25rem' }} />
              <div className="bg-slate-700 rounded" style={{ height: '0.5rem', width: '66%' }} />
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
    return null // Don't render section if no stories
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 New Releases</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map((story) => (
          <Link 
            key={story.id} 
            href={`/player/${story.id}`}
            className="bg-slate-800 rounded-xl hover:bg-slate-700 transition"
            style={{ display: 'block', padding: '0.5rem' }}
          >
            {/* Cover with glow */}
            <div className="rounded-lg overflow-hidden cover-glow">
              <img 
                src={story.cover_url || '/images/default-cover.png'} 
                alt={story.title}
                className="object-cover"
                style={{ width: '100%', aspectRatio: '1 / 1' }}
              />
            </div>
            
            {/* Metadata */}
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                {story.title}
              </h3>
              <p className="text-white text-xs">{story.genre}</p>
              <p className="text-white text-xs">by {story.author}</p>
              <p className="text-white text-xs">
                {story.duration_mins} min • {getCredits(story.duration_mins)} cr
              </p>
              <p className="text-slate-400 text-xs">{formatDate(story.published_on)}</p>
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
grid        → display: 'grid'
grid-cols-2 → gridTemplateColumns: 'repeat(2, 1fr)'
gap-3       → gap: '0.75rem'
block       → display: 'block'
p-2         → padding: '0.5rem'
w-full      → width: '100%'
aspect-square → aspectRatio: '1 / 1'
mt-2        → marginTop: '0.5rem'
mb-2        → marginBottom: '0.5rem'
h-3         → height: '0.75rem'
h-2         → height: '0.5rem'
mb-1        → marginBottom: '0.25rem'
w-2/3       → width: '66%'

KEPT AS TAILWIND (don't get purged):
- Colors: bg-slate-800, bg-slate-700, bg-slate-400, text-white, text-slate-400
- Borders: rounded-xl, rounded-lg, rounded
- Text: text-lg, text-xs, font-bold, line-clamp-2, leading-tight
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
- Emoji: 🆕

GRID:
- grid grid-cols-2 gap-3

CARD:
- block bg-slate-800 rounded-xl p-2
- hover:bg-slate-700 transition
- Entire card wrapped in Link (clickable)
- Route: /player/[story.id]

COVER:
- rounded-lg overflow-hidden cover-glow
- img: w-full aspect-square object-cover

METADATA CONTAINER:
- mt-2

TITLE:
- text-xs font-bold text-white line-clamp-2 leading-tight

GENRE:
- text-white text-xs

AUTHOR:
- text-white text-xs (prefixed with "by ")

DURATION + CREDITS:
- text-white text-xs
- Format: "{duration} min • {credits} cr"
- Credits = max(1, floor(duration_mins / 15))

PUBLISHED DATE:
- text-slate-400 text-xs
- Format: "Jan 15, 2026"

DATA QUERY:
- Table: stories
- Select: id, title, genre, author, duration_mins, cover_url, published_on
- Order: published_on DESC
- Limit: 2

NO FLAGS ON NEW RELEASES CARDS
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
