/*
================================================================================
🔒 PROTECTED MODULE W4 - RECOMMENDED FOR YOU (WELCOME PAGE)
================================================================================
Module: W4_RecommendedForYou
Location: ~/DriveTimeFiles/WorkingCodeLibrary/01_WelcomePage/
File: W4_RecommendedForYou.protected.tsx

Created: January 18, 2026
Updated: January 18, 2026 - Added insufficient credits popup
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
Recommended For You section for Welcome page. Shows stories costing 1-3 credits.
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
}

interface W4RecommendedForYouProps {
  credits: number
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

export default function W4RecommendedForYou({ credits }: W4RecommendedForYouProps) {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showPopup, setShowPopup] = useState(false)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Fetch stories costing 1-3 credits (duration < 60 mins)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .not('cover_url', 'is', null)
          .lt('duration_mins', 60)
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
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>⭐ RECOMMENDED FOR YOU</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>More stories you can enjoy with your free credits</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {stories.map((story) => (
            <button
              key={story.id}
              onClick={() => handleStoryClick(story)}
              className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition text-left"
              style={{ display: 'flex', border: 'none', cursor: 'pointer' }}
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
                <p className="text-white text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {story.duration_mins} min • {getCredits(story.duration_mins)} credits
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
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
