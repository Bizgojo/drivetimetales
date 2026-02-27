/*
================================================================================
🔒 PROTECTED MODULE - RECOMMENDED FOR YOU
================================================================================
File: RecommendedForYou.tsx
Location: ~/Projects/drivetimetales/components/

Updated: February 14, 2026 - Groups series episodes into single SeriesCard
Owner: Marc (Wonder Books Press / Drive Time Tales)

PURPOSE:
Shows recommended stories with series grouped into a single card (like Library).
Singles show as HorizontalStoryCard, series show as SeriesCard.

⚠️  DO NOT MODIFY WITHOUT MARC'S APPROVAL
================================================================================
*/

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'

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
  series_id: string | null
  series_name: string | null
  series_number: number | null
  created_at: string
}

interface SeriesGroup {
  id: string
  series_name: string
  genre: string
  episode_count: number
  total_duration_mins: number
  cover_url: string | null
  description: string | null
  earliest_created_at: string
}

type DisplayItem =
  | { type: 'single'; story: Story; sortDate: string }
  | { type: 'series'; group: SeriesGroup; sortDate: string }

// =============================================================================
// COMPONENT
// =============================================================================

export default function RecommendedForYou() {
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Fetch all stories with series info
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, created_at')
          .not('cover_url', 'is', null)

        if (error) {
          console.error('Error fetching recommendations:', error)
          return
        }
        if (!data || data.length === 0) return

        // Fetch series table for covers and descriptions
        const { data: seriesRows } = await supabase
          .from('series')
          .select('title, cover_image, description')
        const seriesLookup: Record<string, { cover_image: string | null; description: string | null }> = {}
        if (seriesRows) {
          seriesRows.forEach((s: any) => { seriesLookup[s.title] = { cover_image: s.cover_image, description: s.description } })
        }

        // Group series episodes
        const seriesMap = new Map<string, SeriesGroup>()
        const singles: Story[] = []

        data.forEach((story: Story) => {
          if (story.series_name) {
            const existing = seriesMap.get(story.series_name)
            if (existing) {
              existing.episode_count++
              existing.total_duration_mins += story.duration_mins || 0
              if (story.created_at < existing.earliest_created_at) {
                existing.earliest_created_at = story.created_at
              }
            } else {
              const seriesInfo = seriesLookup[story.series_name]
              seriesMap.set(story.series_name, {
                id: story.series_id || story.id,
                series_name: story.series_name,
                genre: story.genre,
                episode_count: 1,
                total_duration_mins: story.duration_mins || 0,
                cover_url: seriesInfo?.cover_image || story.cover_url,
                description: seriesInfo?.description || null,
                earliest_created_at: story.created_at,
              })
            }
          } else {
            singles.push(story)
          }
        })

        // Build mixed display items
        const items: DisplayItem[] = []
        seriesMap.forEach(group => {
          items.push({ type: 'series', group, sortDate: group.earliest_created_at })
        })
        singles.forEach(story => {
          items.push({ type: 'single', story, sortDate: story.created_at })
        })

        // Sort by date descending (newest first), limit to 5
        items.sort((a, b) => b.sortDate.localeCompare(a.sortDate))
        setDisplayItems(items.slice(0, 5))
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

  if (displayItems.length === 0) {
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
        {displayItems.map(item => {
          if (item.type === 'series') {
            return (
              <HorizontalStoryCard
                key={`series-${item.group.series_name}`}
                id={item.group.id}
                title={item.group.series_name}
                genre={item.group.genre}
                author=""
                duration_mins={item.group.total_duration_mins}
                cover_url={item.group.cover_url}
                description={item.group.description}
                series_number={undefined}
              />
            )
          } else {
            return (
              <HorizontalStoryCard
                key={item.story.id}
                id={item.story.id}
                title={item.story.title}
                genre={item.story.genre}
                author={item.story.author}
                duration_mins={item.story.duration_mins}
                cover_url={item.story.cover_url}
              />
            )
          }
        })}
      </div>
    </section>
  )
}
