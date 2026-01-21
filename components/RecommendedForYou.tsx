/*
================================================================================
🔒 PROTECTED MODULE - RECOMMENDED FOR YOU
================================================================================
File: RecommendedForYou.tsx
Location: ~/Projects/drivetimetales/components/

Updated: January 21, 2026 - Now uses standardized HorizontalStoryCard
Owner: Marc (Wonder Books Press / Drive Time Tales)

PURPOSE:
Shows 5 randomly selected stories using the standardized HorizontalStoryCard.

⚠️  DO NOT MODIFY WITHOUT MARC'S APPROVAL
================================================================================
*/

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

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
// COMPONENT
// =============================================================================

export default function RecommendedForYou() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .not('cover_url', 'is', null)
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
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ RECOMMENDED FOR YOU</h2>
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
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ RECOMMENDED FOR YOU</h2>
        <p className="text-white text-sm">No recommendations yet.</p>
      </section>
    )
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>⭐ RECOMMENDED FOR YOU</h2>
      
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
    </section>
  )
}
