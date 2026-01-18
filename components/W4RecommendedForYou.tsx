/*
================================================================================
🔒 PROTECTED MODULE W4 - RECOMMENDED FOR YOU (WELCOME PAGE)
================================================================================
Module: W4_RecommendedForYou
Location: ~/DriveTimeFiles/WorkingCodeLibrary/01_WelcomePage/
File: W4_RecommendedForYou.protected.tsx

Created: January 18, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
RECOMMENDED FOR YOU section for Welcome page. Shows stories that cost 1-2 credits only,
so free users (who start with 2 credits) can afford them.

KEY DIFFERENCE FROM MODULE 08:
- Filters to only show stories where credits <= 2
- Credits formula: max(1, floor(duration_mins / 15))
- So: duration_mins < 45 = 1-2 credits

LAYOUT (same as Module 08):
- Horizontal cards (HorizontalStoryCard format)
- 3 stories in vertical stack
- Cover on left, info on right
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

export default function W4RecommendedForYou() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Fetch stories that cost 1-2 credits (duration < 45 mins)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .not('cover_url', 'is', null)
          .lt('duration_mins', 45)  // Only stories with 1-2 credits
          .limit(5)

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
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>⭐ RECOMMENDED FOR YOU</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>More stories you can enjoy with your free credits</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((i) => (
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
    return null // Don't render section if no stories
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>⭐ RECOMMENDED FOR YOU</h2>
      <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>More stories you can enjoy with your free credits</p>
      
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
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
