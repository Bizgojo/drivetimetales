/*
================================================================================
🔒 PROTECTED MODULE W3 - NEW RELEASES (WELCOME PAGE)
================================================================================
Module: W3_NewReleases
Location: ~/DriveTimeFiles/WorkingCodeLibrary/01_WelcomePage/
File: W3_NewReleases.protected.tsx

Created: January 18, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
New Releases section for Welcome page. Shows stories that cost 1-2 credits only,
so free users (who start with 2 credits) can afford them.

KEY DIFFERENCE FROM MODULE 07:
- Filters to only show stories where credits <= 2
- Credits formula: max(1, floor(duration_mins / 15))
- So: duration_mins < 45 = 1-2 credits

LAYOUT (same as Module 07):
- 2-column grid
- bg-slate-800 cards with cover-glow
- Entire card clickable → /player/[id]

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
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

export default function W3NewReleases() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNewReleases() {
      try {
        // Fetch stories that cost 1-2 credits (duration < 45 mins)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, published_on')
          .not('cover_url', 'is', null)
          .lt('duration_mins', 45)  // Only stories with 1-2 credits
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
        <p className="text-white text-xs" style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>Stories you can enjoy with your free credits</p>
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
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>🆕 New Releases</h2>
      <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Stories you can enjoy with your free credits</p>
      
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
              <p className="text-white text-xs">{formatDate(story.published_on)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
