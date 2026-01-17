/*
================================================================================
🔒 PROTECTED MODULE 06 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 06_ContinueListening
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 06_ContinueListening.protected.tsx

Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official Continue Listening module for the DTT Home Page.
Shows the user's most recently played uncompleted story with a progress bar
and allows one-tap resume playback.

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Only shows if user has an uncompleted story (completed = FALSE)
- Shows only ONE story (most recent by last_played)
- If no uncompleted story exists, this module does NOT render

CLICK BEHAVIOR:
- Entire card is clickable (cover, text, AND play button)
- Click navigates to /player/[id]/play
- Audio resumes at (progress - 5 seconds) to rewind to sentence start

DATA SOURCE:
- Table: user_library
- Query: WHERE user_id = [user] AND completed = FALSE ORDER BY last_played DESC LIMIT 1
- Join: stories table for title, genre, author, duration_mins, cover_url

================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

interface ContinueListeningStory {
  id: string
  story_id: string
  progress: number          // seconds into the story
  last_played: string
  completed: boolean
  // Joined from stories table
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ContinueListening() {
  const { user } = useAuth()
  const [story, setStory] = useState<ContinueListeningStory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchContinueListening() {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        // Query: most recent uncompleted story
        const { data, error } = await supabase
          .from('user_library')
          .select(`
            id,
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
          .eq('user_id', user.id)
          .eq('completed', false)
          .order('last_played', { ascending: false })
          .limit(1)
          .single()

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned (not an error for us)
          console.error('Error fetching continue listening:', error)
        }

        if (data && data.stories) {
          setStory({
            id: data.id,
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
        console.error('Error in fetchContinueListening:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchContinueListening()
  }, [user])

  // =============================================================================
  // DISPLAY LOGIC: Do not render if no uncompleted story
  // =============================================================================
  
  if (loading) {
    return null // Don't show loading state, just hide until ready
  }

  if (!story) {
    return null // No uncompleted story = don't render module
  }

  // =============================================================================
  // CALCULATIONS
  // =============================================================================

  const totalSeconds = story.duration_mins * 60
  const progressPercent = totalSeconds > 0 ? Math.round((story.progress / totalSeconds) * 100) : 0
  const secondsRemaining = totalSeconds - story.progress
  const minsRemaining = Math.max(1, Math.ceil(secondsRemaining / 60))

  // Resume position: rewind 5 seconds (Phase 1 sentence approximation)
  const resumePosition = Math.max(0, story.progress - 5)

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">▶️ Continue Listening</h2>
      
      {/* Entire card is clickable - navigates to play page with resume position */}
      <Link 
        href={`/player/${story.story_id}/play?resume=${resumePosition}`}
        className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
      >
        {/* Cover: w-28 h-28 with p-2 padding (matches HorizontalStoryCard template) */}
        <div className="w-28 h-28 flex-shrink-0 p-2">
          <div className="w-full h-full rounded-lg overflow-hidden cover-glow">
            <img 
              src={story.cover_url || '/images/default-cover.png'} 
              alt={story.title}
              className="w-full h-full object-cover" 
            />
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
          <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
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
        
        {/* Play button */}
        <div className="pr-3 flex items-center">
          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center hover:bg-orange-400 transition">
            <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
        </div>
      </Link>
    </section>
  )
}
