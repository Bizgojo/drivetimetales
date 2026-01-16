/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: NewReleases
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: NewReleases.protected.tsx

Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official New Releases module for the DTT Home Page.
Shows the 3 most recently published stories in a vertical card grid.

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Shows exactly 3 stories (most recent by published_on)
- No flags on New Releases cards
- Entire card is clickable → /player/[id]

DATA SOURCE:
- Table: stories
- Query: ORDER BY published_on DESC LIMIT 3

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
          .order('published_on', { ascending: false })
          .limit(3)

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
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">🆕 New Releases</h2>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="rounded-xl bg-slate-800 aspect-square mb-2" />
              <div className="h-3 bg-slate-800 rounded mb-1" />
              <div className="h-2 bg-slate-800 rounded w-2/3" />
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
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">🆕 New Releases</h2>
      
      <div className="grid grid-cols-3 gap-3">
        {stories.map((story) => (
          <Link 
            key={story.id} 
            href={`/player/${story.id}`}
            className="block"
          >
            {/* Cover with glow */}
            <div className="rounded-xl overflow-hidden cover-glow">
              <img 
                src={story.cover_url || '/images/default-cover.png'} 
                alt={story.title}
                className="w-full aspect-square object-cover" 
              />
            </div>
            
            {/* Metadata */}
            <div className="mt-2">
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
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
SECTION CONTAINER:
- px-4 pt-6 pb-4

SECTION TITLE:
- text-lg font-bold text-white mb-4
- Emoji: 🆕

GRID:
- grid grid-cols-3 gap-3

CARD:
- Entire card wrapped in Link (clickable)
- Route: /player/[story.id]

COVER:
- rounded-xl overflow-hidden cover-glow
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
- Limit: 3

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
