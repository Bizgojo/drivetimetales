/*
================================================================================
WELCOME LIBRARY PAGE
================================================================================
Location: app/welcome-library/page.tsx
Created: January 18, 2026

PURPOSE:
Library page for non-logged-in users. Shows all stories with:
- [FREE] flag for stories user can afford
- Insufficient credits popup for stories they can't afford
- Header without avatar (back button + logo only)
- Genre filters

================================================================================
*/

'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
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

// =============================================================================
// GENRE OPTIONS
// =============================================================================

const genreOptions = [
  { name: 'All', icon: '📚' },
  { name: 'Mystery', icon: '🔍' },
  { name: 'Drama', icon: '🎭' },
  { name: 'Sci-Fi', icon: '🚀' },
  { name: 'Horror', icon: '👻' },
  { name: 'Thriller', icon: '😱' },
  { name: 'Non-Fiction', icon: '📖' },
  { name: 'Children', icon: '👶' },
  { name: 'Comedy', icon: '😂' },
  { name: 'Romance', icon: '💕' },
]

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// MAIN CONTENT COMPONENT
// =============================================================================

function WelcomeLibraryContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [freeCredits, setFreeCredits] = useState(2)
  const [showPopup, setShowPopup] = useState(false)

  // Load free credits from localStorage
  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits !== null) {
      setFreeCredits(parseInt(storedCredits, 10))
    }
  }, [])

  // Fetch stories
  useEffect(() => {
    async function fetchStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })

        if (error) {
          console.error('Error fetching stories:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchStories:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStories()
  }, [])

  // Close popup on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPopup(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  // Filter stories by genre
  const filteredStories = stories.filter(story => {
    if (selectedGenre === 'All') return true
    const storyGenre = story.genre?.toLowerCase() || ''
    return storyGenre.includes(selectedGenre.toLowerCase())
  })

  // Handle story click
  const handleStoryClick = (story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    if (freeCredits >= storyCost) {
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      
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

      {/* Header - Like Module 03 but without avatar */}
      <header 
        className="bg-slate-950 border-b border-slate-800"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '0.75rem 1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Back Button */}
          <Link 
            href="/welcome"
            className="text-white hover:text-orange-400 transition"
            style={{ fontSize: '1.5rem' }}
          >
            ←
          </Link>
          
          {/* Logo */}
          <h1 className="text-orange-500 font-bold" style={{ fontSize: '1.25rem' }}>
            Drive Time Tales
          </h1>
          
          {/* Credits Display */}
          <div className="text-white text-sm">
            {freeCredits} credits
          </div>
        </div>
      </header>

      {/* Page Title */}
      <div style={{ padding: '1rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
        <h2 className="text-xl font-bold text-white">STORY LIBRARY</h2>
        <p className="text-white text-sm">Browse all available stories</p>
      </div>

      {/* Genre Filter */}
      <div style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingBottom: '1rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {genreOptions.map((genre) => (
            <button
              key={genre.name}
              onClick={() => setSelectedGenre(genre.name)}
              className={`rounded-full transition whitespace-nowrap ${
                selectedGenre === genre.name 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}
            >
              {genre.icon} {genre.name}
            </button>
          ))}
        </div>
      </div>

      {/* Story List */}
      <div style={{ padding: '0 1rem 6rem 1rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost

            return (
              <button
                key={story.id}
                onClick={() => handleStoryClick(story)}
                className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition text-left"
                style={{ display: 'flex', border: 'none', cursor: 'pointer' }}
              >
                {/* Cover */}
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
                  <p className="text-white text-xs">by {story.author || 'Drive Time Tales'}</p>
                  <p className="text-white text-xs" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {story.duration_mins} min • {storyCost} credit{storyCost > 1 ? 's' : ''}
                    {canAfford && (
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
            )
          })}

          {filteredStories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <p className="text-white">No stories found</p>
              <p className="text-white text-sm" style={{ marginTop: '0.5rem' }}>Try a different filter</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Buttons */}
      <div
        className="bg-slate-950 border-t border-slate-800"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.75rem 1rem',
          zIndex: 50
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
          <Link
            href="/welcome"
            className="hover:bg-orange-400 font-semibold rounded-xl transition"
            style={{
              flex: 1,
              padding: '1rem',
              textAlign: 'center',
              backgroundColor: '#f97316',
              color: 'white',
              fontSize: '1rem'
            }}
          >
            ← Back to Home
          </Link>
          <Link
            href="/subscribe"
            className="hover:bg-green-400 font-semibold rounded-xl transition"
            style={{
              flex: 1,
              padding: '1rem',
              textAlign: 'center',
              backgroundColor: '#22c55e',
              color: 'black',
              fontSize: '1rem'
            }}
          >
            Subscribe<br />or buy credits
          </Link>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// PAGE EXPORT WITH SUSPENSE
// =============================================================================

export default function WelcomeLibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <WelcomeLibraryContent />
    </Suspense>
  )
}
