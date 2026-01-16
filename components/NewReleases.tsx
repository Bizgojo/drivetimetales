/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: NewReleases
Location: /components/NewReleases.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
New Releases section - 3 most recent stories with large covers.
Shows stories ordered by published_on date (newest first).

LAYOUT:
- 3 columns grid (grid-cols-3 gap-3)
- Large square cover images with white glow
- Text below each: Title (2 lines max), Genre, Author, Duration+Credits, Date
- All text WHITE (not gray)

DATA SOURCE:
- Table: stories
- Query: ORDER BY published_on DESC LIMIT 3
- Note: stories table does NOT have rating or created_at columns
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
  published_on: string | null
}

// Format date as "Jan 16, 2026"
function formatDate(dateString: string | null): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  } catch {
    return ''
  }
}

export default function NewReleases() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNewReleases() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, credits, cover_url, published_on')
          .order('published_on', { ascending: false, nullsFirst: false })
          .limit(3)

        if (error) {
          console.error('[NewReleases] Error:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('[NewReleases] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchNewReleases()
  }, [])

  // Loading state
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

  // Empty state
  if (stories.length === 0) {
    return null
  }

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
            <div 
              className="rounded-xl overflow-hidden"
              style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}
            >
              {story.cover_url ? (
                <img 
                  src={story.cover_url} 
                  alt={story.title}
                  className="w-full aspect-square object-cover" 
                />
              ) : (
                <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
              )}
            </div>
            
            {/* Metadata - ALL WHITE TEXT */}
            <div className="mt-2">
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                {story.title}
              </h3>
              <p className="text-white text-xs">{story.genre}</p>
              <p className="text-white text-xs">by {story.author}</p>
              <p className="text-white text-xs">
                {story.duration_mins} min • {story.credits} cr
              </p>
              {story.published_on && (
                <p className="text-white text-xs">{formatDate(story.published_on)}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
