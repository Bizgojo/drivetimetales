/*
================================================================================
🔒 PROTECTED MODULE 07 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 07_NewReleases
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 07_NewReleases.protected.tsx

Created: January 16, 2026
Updated: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
This is the official New Releases module for the DTT Home Page.
Shows the 2 most recently published stories in a 2-column grid with gray background.

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

CHANGE LOG:
- 2026-01-16: Initial version (3 stories, 3-column, no background)
- 2026-01-17: Changed to 2 stories, 2-column grid, added bg-slate-800 background

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
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">🆕 New Releases</h2>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-slate-800 rounded-xl p-2">
              <div className="rounded-lg bg-slate-700 aspect-square mb-2" />
              <div className="h-3 bg-slate-700 rounded mb-1" />
              <div className="h-2 bg-slate-700 rounded w-2/3" />
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
      
      <div className="grid grid-cols-2 gap-3">
        {stories.map((story) => (
          <Link 
            key={story.id} 
            href={`/player/${story.id}`}
            className="block bg-slate-800 rounded-xl p-2 hover:bg-slate-700 transition"
          >
            {/* Cover with glow */}
            <div className="rounded-lg overflow-hidden cover-glow">
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
