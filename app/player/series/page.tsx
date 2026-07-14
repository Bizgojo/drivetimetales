'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CanonicalPlayer from '@/components/player/CanonicalPlayer'

interface LegacySeriesEpisode {
  id?: string
}

function SeriesPlayerContent() {
  const router = useRouter()
  const [storyId, setStoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('dtt_series_playlist')
    const savedIndex = localStorage.getItem('dtt_series_index')

    if (!savedPlaylist) {
      setLoading(false)
      return
    }

    try {
      const playlist = JSON.parse(savedPlaylist) as LegacySeriesEpisode[]
      const parsedIndex = savedIndex ? Number.parseInt(savedIndex, 10) : 0
      const launchIndex = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0
      const episode = Array.isArray(playlist) ? playlist[launchIndex] || playlist[0] : null

      setStoryId(episode?.id || null)
    } catch (error) {
      console.error('Failed to parse series launch data:', error)
      setStoryId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!storyId) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📺</div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>No Series Selected</h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Go to the library and select a series to play.</p>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#f97316', color: 'black', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Go to Library</button>
        </div>
      </div>
    )
  }

  return <CanonicalPlayer storyId={storyId} mode="series" />
}

export default function SeriesPlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SeriesPlayerContent />
    </Suspense>
  )
}
