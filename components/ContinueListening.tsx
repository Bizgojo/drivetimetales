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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    if (user && story) {
      await supabase
        .from('user_library')
        .delete()
        .eq('user_id', user.id)
        .eq('story_id', story.story_id)
    }
    setStory(null)
    setShowDeleteConfirm(false)
  }

  const cancelDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteConfirm(false)
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">▶️ CONTINUE LISTENING</h2>
      
      {/* Card wrapper with relative positioning for delete button */}
      <div style={{ position: 'relative' }}>
        {/* Delete button - red badge in upper right corner */}
        <button
          onClick={handleDelete}
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            backgroundColor: '#dc2626',
            border: 'none',
            color: 'white',
            fontSize: '9px',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '6px',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}
        >
          Delete
        </button>

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
      </div>

      {/* Delete confirmation popup */}
      {showDeleteConfirm && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.8)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '1rem', 
            zIndex: 50 
          }}
          onClick={cancelDelete}
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              borderRadius: '16px', 
              padding: '1.5rem', 
              maxWidth: '300px', 
              textAlign: 'center' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>🗑️</span>
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Remove from Continue Listening?</h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>This will remove "{story.title}" from your library.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                onClick={cancelDelete} 
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  borderRadius: '8px', 
                  border: 'none', 
                  backgroundColor: '#475569', 
                  color: 'white', 
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  borderRadius: '8px', 
                  border: 'none', 
                  backgroundColor: '#dc2626', 
                  color: 'white', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  fontSize: '15px'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
SECTION CONTAINER:
- px-4 pt-6 pb-4

SECTION TITLE:
- text-lg font-bold text-white mb-4
- Emoji: ▶️

CARD CONTAINER:
- flex
- bg-slate-800
- rounded-xl
- overflow-hidden
- hover:bg-slate-700 transition
- Entire card wrapped in Link (clickable)

COVER WRAPPER:
- w-28 h-28 (112px x 112px)
- flex-shrink-0
- p-2 (8px padding around cover)

COVER INNER:
- w-full h-full
- rounded-lg
- overflow-hidden
- cover-glow (box-shadow: 0 0 15px rgba(255,255,255,0.4))

INFO AREA:
- flex-1
- py-2 pr-3
- flex flex-col justify-center

TYPOGRAPHY:
- Title: text-sm font-bold text-white line-clamp-1
- Genre: text-white text-xs
- Author: text-white text-xs (prefixed with "by ")
- Duration line: text-white text-xs ("{duration} min • {remaining} min left")

PROGRESS BAR:
- Container: flex items-center gap-2 mt-1
- Track: flex-1 h-1.5 bg-slate-700 rounded-full
- Fill: h-1.5 bg-orange-500 rounded-full, width = progress %
- Percentage: text-white text-xs

PLAY BUTTON:
- Container: pr-3 flex items-center
- Button: w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center
- Hover: hover:bg-orange-400 transition
- Icon: w-5 h-5 text-black ml-0.5 (play triangle SVG)

NAVIGATION:
- Route: /player/[story_id]/play?resume=[resumePosition]
- Resume position: progress - 5 seconds (minimum 0)

DATA QUERY:
- Table: user_library JOIN stories
- Filter: user_id = current user, completed = FALSE
- Order: last_played DESC
- Limit: 1
*/


// =============================================================================
// USAGE IN HOME PAGE
// =============================================================================
/*
import ContinueListening from '@/components/ContinueListening'

export default function HomePage() {
  return (
    <div>
      <ContinueListening />
      
      <NewReleases />
      <RecommendedForYou />
    </div>
  )
}

NOTE: ContinueListening automatically hides itself if no uncompleted story exists.
No conditional rendering needed in the parent component.
*/


// =============================================================================
// PLAY PAGE MUST HANDLE RESUME PARAMETER
// =============================================================================
/*
The /player/[id]/play page must read the ?resume= query parameter and set
the audio currentTime on load:

// In /player/[id]/play/page.tsx
const searchParams = useSearchParams()
const resumeTime = parseInt(searchParams.get('resume') || '0', 10)

useEffect(() => {
  if (audioRef.current && resumeTime > 0) {
    audioRef.current.currentTime = resumeTime
  }
}, [resumeTime])
*/
