'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  credited: boolean
}

export default function YourPlaylist() {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    const savedProgress = localStorage.getItem('dtt_playlist_progress')
    
    if (savedPlaylist) {
      try {
        setPlaylist(JSON.parse(savedPlaylist))
        setCurrentIndex(savedIndex ? parseInt(savedIndex) : 0)
        setProgress(savedProgress ? parseInt(savedProgress) : 0)
      } catch (e) {
        console.error('Error loading playlist:', e)
      }
    }
  }, [])

  const handleDeletePlaylist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    localStorage.removeItem('dtt_playlist')
    localStorage.removeItem('dtt_playlist_index')
    localStorage.removeItem('dtt_playlist_progress')
    setPlaylist([])
    setShowDeleteConfirm(false)
    // Force page reload to show ContinueListening if applicable
    window.location.reload()
  }

  const cancelDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteConfirm(false)
  }

  if (playlist.length === 0) return null

  const currentStory = playlist[currentIndex]
  const hasProgress = progress > 0 || currentIndex > 0
  const progressMins = Math.floor(progress / 60)
  const progressSecs = progress % 60

  // Calculate total remaining time
  const currentStoryRemaining = (currentStory?.duration_mins || 0) * 60 - progress
  const futureStoriesTime = playlist.slice(currentIndex + 1).reduce((sum, s) => sum + s.duration_mins * 60, 0)
  const totalRemainingSecs = currentStoryRemaining + futureStoriesTime
  const remainingHours = Math.floor(totalRemainingSecs / 3600)
  const remainingMins = Math.floor((totalRemainingSecs % 3600) / 60)
  const remainingText = remainingHours > 0 
    ? `${remainingHours}hr ${remainingMins}min remaining`
    : `${remainingMins} min remaining`

  return (
    <section style={{ padding: '1rem', paddingTop: '0.5rem', position: 'relative' }}>
      <Link 
        href="/library-playlist-player"
        style={{ 
          display: 'block',
          backgroundColor: '#1e3a5f',
          borderRadius: '16px',
          padding: '1rem',
          textDecoration: 'none',
          border: '2px solid #3b82f6',
          position: 'relative'
        }}
      >
        {/* Delete button - red badge in upper right corner */}
        <button
          onClick={handleDeletePlaylist}
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            backgroundColor: '#dc2626',
            border: 'none',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '8px',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}
        >
          Delete
        </button>

        {/* Header row with title and stories count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', paddingRight: '70px' }}>
          <span style={{ fontSize: '24px' }}>🎧</span>
          <span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Your Playlist</span>
          <span style={{ color: '#93c5fd', fontSize: '14px', marginLeft: 'auto' }}>{playlist.length} stories</span>
        </div>
        
        {/* Remaining time - now directly under header */}
        <p style={{ color: 'white', fontSize: '13px', fontWeight: '500', marginBottom: '0.75rem', paddingLeft: '36px' }}>{remainingText}</p>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ 
            width: '60px', 
            height: '60px', 
            borderRadius: '8px', 
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 0 10px rgba(255,255,255,0.3)'
          }}>
            {currentStory?.cover_url ? (
              <img src={currentStory.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #f97316, #c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px' }}>🎵</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            {hasProgress ? (
              <>
                <p style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '0.25rem' }}>Continue • Story {currentIndex + 1} of {playlist.length}</p>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>{currentStory?.title}</p>
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>{progressMins}:{progressSecs.toString().padStart(2, '0')} in</p>
              </>
            ) : (
              <>
                <p style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '0.25rem' }}>Ready to play</p>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>{currentStory?.title}</p>
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>Tap to start</p>
              </>
            )}
          </div>
          <div style={{ 
            backgroundColor: '#22c55e', 
            width: '44px', 
            height: '44px', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '20px' }}>▶️</span>
          </div>
        </div>
      </Link>

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
            <h3 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Delete Playlist?</h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Are you sure you want to delete your playlist? This cannot be undone.</p>
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
