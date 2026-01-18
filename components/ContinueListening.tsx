/*
================================================================================
🔒 PROTECTED MODULE 06 - PRODUCTION SAFE VERSION
================================================================================
Module: 06_ContinueListening
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 06_ContinueListening.production.tsx

Created: January 16, 2026
Updated: January 17, 2026 - Added inline styles for Tailwind purge protection
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official CONTINUE LISTENING module for the DTT Home Page.
Shows the user's most recently played uncompleted story with a progress bar
and allows one-tap resume playback.

PRODUCTION FIX:
Critical layout properties use inline styles to prevent Tailwind CSS purging.
Colors, hover states, and text remain as Tailwind classes (these don't purge).

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

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
  // RENDER - WITH INLINE STYLES FOR PRODUCTION SAFETY
  // =============================================================================

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>▶️ CONTINUE LISTENING</h2>
      
      {/* Entire card is clickable - navigates to play page with resume position */}
      <Link 
        href={`/player/${story.story_id}/play?resume=${resumePosition}`}
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
          <p className="text-white text-xs">{story.duration_mins} min • {minsRemaining} min left</p>
          
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <div className="bg-slate-700 rounded-full" style={{ flex: 1, height: '0.375rem' }}>
              <div 
                className="bg-orange-500 rounded-full" 
                style={{ height: '0.375rem', width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-white text-xs">{progressPercent}%</span>
          </div>
        </div>
        
        {/* Play button */}
        <div style={{ paddingRight: '0.75rem', display: 'flex', alignItems: 'center' }}>
          <div 
            className="bg-orange-500 rounded-full hover:bg-orange-400 transition"
            style={{ width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg 
              className="text-black" 
              fill="currentColor" 
              viewBox="0 0 20 20"
              style={{ width: '1.25rem', height: '1.25rem', marginLeft: '0.125rem' }}
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
        </div>
      </Link>
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
// INLINE STYLE CONVERSION REFERENCE
// =============================================================================
/*
TAILWIND → INLINE STYLE CONVERSIONS:

px-4        → paddingLeft: '1rem', paddingRight: '1rem'
pt-6        → paddingTop: '1.5rem'
pb-4        → paddingBottom: '1rem'
mb-4        → marginBottom: '1rem'
flex        → display: 'flex'
w-28        → width: '7rem' (112px)
h-28        → height: '7rem' (112px)
flex-shrink-0 → flexShrink: 0
p-2         → padding: '0.5rem'
w-full      → width: '100%'
h-full      → height: '100%'
flex-1      → flex: 1
py-2        → paddingTop: '0.5rem', paddingBottom: '0.5rem'
pr-3        → paddingRight: '0.75rem'
flex-col    → flexDirection: 'column'
justify-center → justifyContent: 'center'
items-center → alignItems: 'center'
gap-2       → gap: '0.5rem'
mt-1        → marginTop: '0.25rem'
h-1.5       → height: '0.375rem'
w-10        → width: '2.5rem' (40px)
h-10        → height: '2.5rem' (40px)
w-5         → width: '1.25rem' (20px)
h-5         → height: '1.25rem' (20px)
ml-0.5      → marginLeft: '0.125rem'

KEPT AS TAILWIND (don't get purged):
- Colors: bg-slate-800, bg-slate-700, bg-orange-500, text-white, text-black
- Borders: rounded-xl, rounded-lg, rounded-full
- Text: text-lg, text-sm, text-xs, font-bold, line-clamp-1
- Interactions: hover:bg-slate-700, hover:bg-orange-400, transition
- Overflow: overflow-hidden
- Object fit: object-cover
*/
