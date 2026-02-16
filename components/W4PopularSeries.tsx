/*
================================================================================
📺 POPULAR SERIES - Welcome Page
Location: components/W4PopularSeries.tsx
Created: February 15, 2026

PURPOSE:
Shows popular series on the Welcome page to hook new visitors.
Fetches series-based stories (15-20 min episodes) from Supabase.
Replaces W4RecommendedForYou — no "Recommended for You" since we don't 
know who the visitor is yet.
================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_name: string | null
}

interface W4PopularSeriesProps {
  credits: number
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

export default function W4PopularSeries({ credits }: W4PopularSeriesProps) {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showPopup, setShowPopup] = useState(false)

  useEffect(() => {
    async function fetchPopularSeries() {
      try {
        // Fetch stories that are part of a series, 15-25 min episodes, with covers
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, series_name')
          .not('cover_url', 'is', null)
          .not('series_name', 'is', null)
          .gte('duration_mins', 12)
          .lte('duration_mins', 25)
          .order('published_on', { ascending: false })
          .limit(6)

        if (error) {
          console.error('Error fetching popular series:', error)
        } else if (data) {
          // Deduplicate by series_name — show one episode per series
          const seen = new Set<string>()
          const unique: Story[] = []
          for (const story of data) {
            const key = story.series_name || story.id
            if (!seen.has(key)) {
              seen.add(key)
              unique.push(story)
            }
          }
          setStories(unique)
        }
      } catch (err) {
        console.error('Error in fetchPopularSeries:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPopularSeries()
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPopup(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const handleCardClick = (e: React.MouseEvent, story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    if (credits < storyCost) {
      e.preventDefault()
      e.stopPropagation()
      setShowPopup(true)
    }
  }

  // Loading state
  if (loading) {
    return (
      <section style={{ paddingLeft: '0.5rem', paddingRight: '0.5rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>🔥 POPULAR SERIES</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Start a series — each episode is about 20 minutes</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl overflow-hidden animate-pulse" style={{ display: 'flex' }}>
              <div style={{ width: '155px', height: '155px', flexShrink: 0, padding: '0.5rem' }}>
                <div className="rounded-lg bg-slate-700" style={{ width: '100%', height: '100%' }} />
              </div>
              <div style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <div className="bg-slate-700 rounded" style={{ height: '1.25rem', width: '75%' }} />
                <div className="bg-slate-700 rounded" style={{ height: '1rem', width: '50%' }} />
                <div className="bg-slate-700 rounded" style={{ height: '1rem', width: '66%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (stories.length === 0) {
    return null
  }

  return (
    <>
      {/* Insufficient Credits Popup */}
      {showPopup && (
        <div 
          onClick={() => setShowPopup(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1e293b', borderRadius: '1rem',
              padding: '1.5rem', maxWidth: '20rem', width: '90%',
              position: 'relative', textAlign: 'center'
            }}
          >
            <button
              onClick={() => setShowPopup(false)}
              className="text-white hover:text-orange-400 transition"
              style={{
                position: 'absolute', top: '0.75rem', right: '0.75rem',
                background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer'
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
                display: 'inline-block', padding: '0.75rem 1.5rem',
                backgroundColor: '#f97316', color: 'white', fontSize: '1rem'
              }}
            >
              Get More Credits
            </Link>
          </div>
        </div>
      )}

      <section style={{ paddingLeft: '0.5rem', paddingRight: '0.5rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '0.25rem' }}>🔥 POPULAR SERIES</h2>
        <p className="text-white text-xs" style={{ marginBottom: '1rem' }}>Start a series — each episode is about 20 minutes</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {stories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = credits >= storyCost
            
            return (
              <div 
                key={story.id}
                onClickCapture={(e) => handleCardClick(e, story)}
              >
                <HorizontalStoryCard
                  id={story.id}
                  title={story.title}
                  genre={story.genre}
                  author={story.author}
                  duration_mins={story.duration_mins}
                  credits={storyCost}
                  cover_url={story.cover_url}
                  flag={canAfford ? 'free' : null}
                />
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
