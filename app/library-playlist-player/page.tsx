'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  audio_url?: string | null
}

function LibraryPlaylistPlayerContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userInitial, setUserInitial] = useState('?')
  const [loading, setLoading] = useState(true)

  // Load playlist and user
  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        if (Array.isArray(parsed)) setPlaylist(parsed)
      } catch (e) {}
    }
    
    if (savedIndex) {
      setCurrentIndex(parseInt(savedIndex) || 0)
    }

    async function fetchUser() {
      if (user?.id) {
        const { data } = await supabase
          .from('users')
          .select('first_name, display_name')
          .eq('id', user.id)
          .single()
        if (data) {
          const name = data.display_name || data.first_name || 'Friend'
          setUserInitial(name.charAt(0).toUpperCase())
        }
      }
      setLoading(false)
    }
    fetchUser()
  }, [user])

  const currentStory = playlist[currentIndex]

  const handleContinue = () => {
    // TODO: Play audio
    console.log('Playing:', currentStory?.title)
  }

  const handleStartOver = () => {
    setCurrentIndex(0)
    localStorage.setItem('dtt_playlist_index', '0')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  if (!currentStory) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '1rem' }}>
        <p style={{ color: 'white', fontSize: '18px', marginBottom: '1rem' }}>No playlist found</p>
        <button onClick={() => router.push('/library-playlist')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
          Build a Playlist
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Header with Back | Logo | Avatar */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
          <span style={{ fontSize: '18px' }}>🚛</span>
          <span style={{ fontSize: '18px' }}>🚗</span>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
          <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
        </div>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userInitial}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Title section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '24px' }}>🎧</span>
          <span style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>Continue Your Playlist</span>
        </div>
        <p style={{ color: 'white', fontSize: '14px', marginBottom: '1.5rem' }}>
          Story {currentIndex + 1} of {playlist.length}
        </p>

        {/* Large cover image - 80% width */}
        <div style={{ width: '80%', maxWidth: '320px', aspectRatio: '1', marginBottom: '1rem' }}>
          {currentStory.cover_url ? (
            <img 
              src={currentStory.cover_url} 
              alt={currentStory.title}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover', 
                borderRadius: '12px',
                boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
              }} 
            />
          ) : (
            <div style={{ 
              width: '100%', 
              height: '100%', 
              backgroundColor: '#334155', 
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '48px' }}>🎧</span>
            </div>
          )}
        </div>

        {/* Large title */}
        <h1 style={{ 
          color: 'white', 
          fontSize: '24px', 
          fontWeight: 'bold', 
          textAlign: 'center',
          marginBottom: '2rem',
          padding: '0 1rem'
        }}>
          {currentStory.title}
        </h1>

        {/* Buttons */}
        <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={handleContinue}
            style={{
              width: '100%',
              backgroundColor: '#22c55e',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            ▶ Continue
          </button>

          <button
            onClick={handleStartOver}
            style={{
              width: '100%',
              backgroundColor: '#334155',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            ↻ Start Over
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <LibraryPlaylistPlayerContent />
    </Suspense>
  )
}
