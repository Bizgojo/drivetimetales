/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: ContinueListening
Location: /components/ContinueListening.tsx
Created: January 16, 2026
Updated: January 16, 2026 - Fixed layout to horizontal card
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
Shows the user's most recently played uncompleted story with a progress bar
and allows one-tap resume playback.

LAYOUT:
- Horizontal card with cover on LEFT (112px x 112px)
- Info on RIGHT (title, genre, author, duration, progress bar)
- Play button on far right

DATA SOURCE:
- Table: user_library (NOT play_history!)
================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface ContinueListeningStory {
  story_id: string
  progress: number
  last_played: string
  completed: boolean
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
}

export default function ContinueListening() {
  const [story, setStory] = useState<ContinueListeningStory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchContinueListening() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('user_library')
          .select(`
            story_id,
            progress,
            last_played,
            completed,
            stories (
              title,
              genre,
              author,
              duration_mins,
              cover_url
            )
          `)
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress', 0)
          .order('last_played', { ascending: false })
          .limit(1)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('[ContinueListening] Error:', error)
        }

        if (data && data.stories) {
          setStory({
            story_id: data.story_id,
            progress: data.progress || 0,
            last_played: data.last_played,
            completed: data.completed,
            title: (data.stories as any).title,
            genre: (data.stories as any).genre,
            author: (data.stories as any).author,
            duration_mins: (data.stories as any).duration_mins,
            cover_url: (data.stories as any).cover_url,
          })
        }
      } catch (err) {
        console.error('[ContinueListening] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchContinueListening()
  }, [])

  if (loading || !story) {
    return null
  }

  const totalSeconds = story.duration_mins * 60
  const progressPercent = totalSeconds > 0 ? Math.round((story.progress / totalSeconds) * 100) : 0
  const secondsRemaining = totalSeconds - story.progress
  const minsRemaining = Math.max(1, Math.ceil(secondsRemaining / 60))
  const resumePosition = Math.max(0, story.progress - 5)

  return (
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">▶️ Continue Listening</h2>
      
      {/* HORIZONTAL CARD - flex row layout */}
      <Link 
        href={`/player/${story.story_id}?resume=${resumePosition}`}
        className="flex flex-row items-center bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
        style={{ height: '112px' }}
      >
        {/* LEFT: Cover - fixed 96x96 with padding */}
        <div className="flex-shrink-0 p-2" style={{ width: '112px', height: '112px' }}>
          <div 
            className="w-full h-full rounded-lg overflow-hidden"
            style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}
          >
            {story.cover_url ? (
              <img 
                src={story.cover_url} 
                alt={story.title}
                className="w-full h-full object-cover"
                style={{ width: '96px', height: '96px' }}
              />
            ) : (
              <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
            )}
          </div>
        </div>
        
        {/* MIDDLE: Info */}
        <div className="flex-1 py-2 pr-2 flex flex-col justify-center min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{story.title}</h3>
          <p className="text-white text-xs">{story.genre}</p>
          <p className="text-white text-xs">by {story.author}</p>
          <p className="text-white text-xs">{story.duration_mins} min • {minsRemaining} min left</p>
          
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full">
              <div 
                className="h-1.5 bg-orange-500 rounded-full" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-white text-xs">{progressPercent}%</span>
          </div>
        </div>
        
        {/* RIGHT: Play button */}
        <div className="flex-shrink-0 pr-3 flex items-center">
          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
        </div>
      </Link>
    </section>
  )
}
