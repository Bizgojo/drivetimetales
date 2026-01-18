/*
================================================================================
🔒 PROTECTED MODULE W3 - NEW RELEASES (WELCOME PAGE)
================================================================================
Module: W3_NewReleases
Location: ~/DriveTimeFiles/WorkingCodeLibrary/01_WelcomePage/
File: W3_NewReleases.protected.tsx

Created: January 18, 2026
Updated: January 18, 2026 - Added insufficient credits popup
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
New Releases section for Welcome page. Shows stories costing 1-3 credits.
If user doesn't have enough credits, shows popup with option to subscribe.

BEHAVIOR:
- Shows stories costing 1-3 credits (duration < 60 min)
- If user clicks story they can afford → navigates to /player/[id]
- If user clicks story they can't afford → shows popup
- Popup has [Get More Credits] button → /subscribe
- Popup closes on X, outside click, or escape key

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

interface W3NewReleasesProps {
  credits: number
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

export default function W3NewReleases({ credits }: W3NewReleasesProps) {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showPopup, setShowPopup] = useState(false)

  useEffect(() => {
    async function fetchNewReleases() {
      try {
        // Fetch stories costing 1-3 credits (duration < 60 mins)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, published_on')
          .not('cover_url', 'is', null)
          .lt('duration_mins', 60)
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

  // Close popup on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPopup(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const handleStoryClick = (story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    if (credits >= storyCost) {
      router.push(`/player/${story.id}`)
    } else {
      setShowPopup(true)
    }
  }

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (loading) {
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>🆕 NEW RELEASES</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Stories you can enjoy with your free credits</p>
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
    return null
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <>
      {/* Insufficient Credits Popup */}
      {showPopup && (
        <div 
          onClick={() => setShowPopup(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '1rem',
              padding: '1.5rem',
              maxWidth: '20rem',
              width: '90%',
              position: 'relative',
              textAlign: 'center'
            }}
          >
            {/* X Close Button */}
            <button
              onClick={() => setShowPopup(false)}
              className="text-white hover:text-orange-400 transition"
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <p className="text-white font-semibold" style={{ fontSize: '1rem', marginBottom: '1rem', marginTop: '0.5rem' }}>
              Sorry, you do not have enough credits for this story
            </p>

            <Link
              href="/subscribe"
              className="hover:bg-orange-400 font-semibold rounded-xl transition"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f97316',
                color: 'white',
                fontSize: '1rem'
              }}
            >
              Get More Credits
            </Link>
          </div>
        </div>
      )}

      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>🆕 NEW RELEASES</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Stories you can enjoy with your free credits</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {stories.map((story) => (
            <button
              key={story.id}
              onClick={() => handleStoryClick(story)}
              className="bg-slate-800 rounded-xl hover:bg-slate-700 transition text-left"
              style={{ display: 'block', padding: '0.5rem', border: 'none', cursor: 'pointer' }}
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
                <p className="text-white text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {story.duration_mins} min • {getCredits(story.duration_mins)} cr
                  {credits >= getCredits(story.duration_mins) && (
                    <span 
                      className="font-bold rounded"
                      style={{ 
                        backgroundColor: '#22c55e', 
                        color: 'white', 
                        fontSize: '9px',
                        paddingLeft: '0.375rem',
                        paddingRight: '0.375rem',
                        paddingTop: '0.125rem',
                        paddingBottom: '0.125rem'
                      }}
                    >
                      FREE
                    </span>
                  )}
                </p>
                <p className="text-white text-xs">{formatDate(story.published_on)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
