/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: RecommendedForYou
Location: /components/RecommendedForYou.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
Recommended For You section showing 4 horizontal story cards.
Uses the HorizontalStoryCard template with w-28 h-28 covers.

LAYOUT:
- Vertical stack of horizontal cards (space-y-3)
- Each card: cover on left (w-28 h-28 with p-2), info on right
- All text WHITE (not gray)

DATA SOURCE:
- Table: stories
- Query: ORDER BY published_on DESC, skip first 3, LIMIT 4
================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  credits: number
  cover_url: string | null
}

export default function RecommendedForYou() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommended() {
      try {
        // Fetch stories with cover images only
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, credits, cover_url')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false, nullsFirst: false })
          .range(3, 6)  // Skip first 3, get next 4

        if (error) {
          console.error('[RecommendedForYou] Error:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('[RecommendedForYou] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecommended()
  }, [])

  // Loading state
  if (loading) {
    return (
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex bg-slate-800 rounded-xl h-28 animate-pulse">
              <div className="w-28 h-28 bg-slate-700 rounded-l-xl" />
              <div className="flex-1 p-3">
                <div className="h-4 bg-slate-700 rounded mb-2 w-3/4" />
                <div className="h-3 bg-slate-700 rounded mb-1 w-1/2" />
                <div className="h-3 bg-slate-700 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // Empty state
  if (stories.length === 0) {
    return null
  }

  return (
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
      
      <div className="space-y-3">
        {stories.map((story) => (
          <Link 
            key={story.id} 
            href={`/player/${story.id}`}
            className="flex flex-row items-center bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
            style={{ height: '96px' }}
          >
            {/* Cover: fixed 80x80 with padding */}
            <div className="flex-shrink-0 p-2" style={{ width: '96px', height: '96px' }}>
              <div 
                className="w-full h-full rounded-lg overflow-hidden"
                style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}
              >
                {story.cover_url ? (
                  <img 
                    src={story.cover_url} 
                    alt={story.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                )}
              </div>
            </div>
            
            {/* Info - ALL WHITE TEXT */}
            <div className="flex-1 py-2 pr-3 flex flex-col justify-center min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{story.title}</h3>
              <p className="text-white text-xs">{story.genre}</p>
              <p className="text-white text-xs">by {story.author}</p>
              <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credits</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
