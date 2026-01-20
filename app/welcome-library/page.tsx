'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DTTLogo from '@/components/DTTLogo'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
}

interface UserLibraryItem {
  story_id: string
  progress: number
  completed: boolean
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function WelcomeLibraryContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<UserLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  
  // Filters
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('Both')
  const [selectedGenre, setSelectedGenre] = useState('All')
  
  // Modals
  const [showModal, setShowModal] = useState(false)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [showSubscribePopup, setShowSubscribePopup] = useState(false)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits !== null) {
      setFreeCredits(parseInt(storedCredits, 10))
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })

      if (storiesData) setStories(storiesData)

      const userId = localStorage.getItem('dtt_user_id')
      if (userId) {
        const { data: libraryData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', userId)
        
        if (libraryData) setUserLibrary(libraryData)
      }

      setLoading(false)
    }
    fetchData()
  }, [])

  const getPlayStatus = (storyId: string): string | null => {
    const item = userLibrary.find(lib => lib.story_id === storyId)
    if (!item) return null
    if (item.completed) return 'played'
    if (item.progress > 0) return 'continue'
    return null
  }

  const filteredStories = stories.filter(story => {
    // Duration filter
    if (selectedDuration !== 'All') {
      const mins = story.duration_mins
      if (selectedDuration === '15m' && mins > 20) return false
      if (selectedDuration === '30m' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '1hr' && mins < 40) return false
    }
    // Genre filter
    if (selectedGenre !== 'All') {
      const g = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !g.includes('mystery') && !g.includes('thriller')) return false
      if (selectedGenre === 'Romance' && !g.includes('romance')) return false
      if (selectedGenre === 'Sci-Fi' && !g.includes('sci-fi') && !g.includes('scifi')) return false
      if (selectedGenre === 'Horror' && !g.includes('horror')) return false
      if (selectedGenre === 'Comedy' && !g.includes('comedy')) return false
      if (selectedGenre === 'Learn' && !g.includes('learn') && !g.includes('education')) return false
    }
    // Type filter
    if (selectedType === 'Singles' && story.series_number && story.series_total) return false
    if (selectedType === 'Series' && (!story.series_number || !story.series_total)) return false
    return true
  })

  const handleStoryClick = (story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    const canAfford = freeCredits >= storyCost
    
    if (canAfford) {
      localStorage.setItem('dtt_return_path', '/welcome-library')
      router.push('/player/' + story.id)
    } else {
      setSelectedStory(story)
      setShowModal(true)
    }
  }

  const handleCreatePlaylist = () => {
    setShowSubscribePopup(true)
  }

  // Button style helper
  const btnStyle = (active: boolean) => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.4rem 0.65rem',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer'
  })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Sticky Header */}
      <header 
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #334155',
          padding: '0.75rem 1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
          <button 
            onClick={() => router.push('/welcome')}
            style={{ 
              backgroundColor: '#475569',
              color: 'white',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          
          <DTTLogo size="md" />
          
          <div style={{ color: 'white', fontSize: '0.875rem', textAlign: 'right' }}>
            You Have<br />{freeCredits} Credits
          </div>
        </div>
      </header>
      
      {/* Sticky Filters + Playlist */}
      <div style={{ 
        position: 'sticky', 
        top: '57px', 
        zIndex: 40, 
        backgroundColor: '#0f172a',
        padding: '0.75rem'
      }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
          {/* Duration & Type Row */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => (
              <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>
            ))}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
            {['Both', 'Singles', 'Series'].map(t => (
              <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>
            ))}
          </div>
          
          {/* Genre Row */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
              <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
              </button>
            ))}
          </div>

          {/* Playlist Button */}
          <button 
            onClick={handleCreatePlaylist} 
            style={{ 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              padding: '0.6rem 1rem', 
              borderRadius: '8px', 
              fontSize: '15px', 
              fontWeight: 500, 
              border: 'none', 
              cursor: 'pointer', 
              width: '100%', 
              marginTop: '0.35rem' 
            }}
          >
            ➕ Create a Playlist
          </button>
        </div>
      </div>

      {/* Story Cards */}
      <div style={{ padding: '0 0.75rem 5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.length === 0 ? (
          <div style={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '12px', 
            padding: '2rem', 
            textAlign: 'center' 
          }}>
            <p style={{ color: '#e2e8f0', fontSize: '18px', marginBottom: '0.75rem' }}>
              No stories match your filters.
            </p>
            <p style={{ color: '#e2e8f0', fontSize: '16px' }}>
              Try adjusting your selection.
            </p>
          </div>
        ) : (
          filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost
            
            return (
              <div 
                key={story.id}
                onClick={() => handleStoryClick(story)}
                style={{ cursor: 'pointer' }}
              >
                <HorizontalStoryCard
                  id={story.id}
                  title={story.title}
                  genre={story.genre}
                  author={story.author || 'Drive Time Tales'}
                  duration_mins={story.duration_mins}
                  credits={storyCost}
                  cover_url={story.cover_url}
                  flag={canAfford ? 'free' : null}
                  series_number={story.series_number}
                  series_total={story.series_total}
                  play_status={getPlayStatus(story.id)}
                />
              </div>
            )
          })
        )}
      </div>

      {/* Insufficient Credits Modal */}
      {showModal && selectedStory && (
        <div 
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
            zIndex: 100,
            padding: '1rem'
          }}
          onClick={() => setShowModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>
              Not Enough Credits
            </h2>
            <p style={{ color: '#e2e8f0', fontSize: '16px', marginBottom: '0.5rem' }}>
              <strong>{selectedStory.title}</strong> requires {getCredits(selectedStory.duration_mins)} credits.
            </p>
            <p style={{ color: '#e2e8f0', fontSize: '16px', marginBottom: '1.5rem' }}>
              You have {freeCredits} credits remaining.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => { setShowModal(false); router.push('/subscribe') }}
                style={{
                  backgroundColor: '#f97316',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Get More Credits
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  backgroundColor: '#475569',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Choose Another Story
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscribe Popup (for playlist feature) */}
      {showSubscribePopup && (
        <div 
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
            zIndex: 100, 
            padding: '1rem' 
          }} 
          onClick={() => setShowSubscribePopup(false)}
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              borderRadius: '12px', 
              padding: '1.5rem', 
              maxWidth: '400px', 
              width: '100%' 
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>
              Playlists for Subscribers
            </h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1.5rem' }}>
              Create custom playlists for your drive! This feature is available for subscribers. Subscribe now to build your perfect driving playlist!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                onClick={() => { setShowSubscribePopup(false); router.push('/subscribe') }} 
                style={{ 
                  backgroundColor: '#f97316', 
                  color: 'white', 
                  padding: '0.75rem 1rem', 
                  borderRadius: '8px', 
                  fontSize: '16px', 
                  fontWeight: 500, 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Subscribe Now
              </button>
              <button 
                onClick={() => setShowSubscribePopup(false)} 
                style={{ 
                  backgroundColor: '#475569', 
                  color: 'white', 
                  padding: '0.75rem 1rem', 
                  borderRadius: '8px', 
                  fontSize: '16px', 
                  fontWeight: 500, 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Bottom Sticky Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.75rem',
          backgroundColor: '#0f172a',
          borderTop: '1px solid #334155',
          zIndex: 50
        }}
      >
        <button
          onClick={() => router.push('/subscribe')}
          style={{
            width: '100%',
            padding: '0.75rem',
            textAlign: 'center',
            backgroundColor: '#22c55e',
            color: 'black',
            fontSize: '1.125rem',
            fontWeight: 600,
            borderRadius: '0.75rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Subscribe or buy more credits
        </button>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default function WelcomeLibraryPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <WelcomeLibraryContent />
    </Suspense>
  )
}
