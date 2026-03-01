'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function PlaylistButton() {
  const [hasPlaylist, setHasPlaylist] = useState(false)
  const [storyCount, setStoryCount] = useState(0)

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_active_playlist')
    if (savedPlaylist) {
      try {
        const parsed = JSON.parse(savedPlaylist)
        const arr = Array.isArray(parsed) ? parsed : (parsed.stories || []); if (arr.length > 0) {
          setHasPlaylist(true)
          setStoryCount(arr.length)
        }
      } catch (e) {
        setHasPlaylist(false)
      }
    }
  }, [])

  return (
    <Link 
      href="/library-playlist"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        backgroundColor: '#3b82f6',
        color: 'white',
        padding: '0.5rem 1rem',
        borderRadius: '10px',
        fontSize: '18px',
        fontWeight: 700,
        textDecoration: 'none',
        flex: 1
      }}
    >
      {hasPlaylist ? (
        <>
          <span>🎧</span>
          <span>View/Edit Playlist ({storyCount})</span>
        </>
      ) : (
        <>
          <img src="/images/et-logo.png" alt="" style={{ width: "28px", height: "28px", objectFit: "contain", flexShrink: 0 }} />
          <span>Create a Playlist</span>
        </>
      )}
    </Link>
  )
}
