'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CanonicalPlayer from '@/components/player/CanonicalPlayer'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface LegacyEpisodeEntry {
  id?: string
}

interface LegacyPlaylistItem {
  type?: 'single' | 'series'
  id?: string
  episodes?: LegacyEpisodeEntry[]
}

function extractStoryIdFromItem(item: LegacyPlaylistItem | null | undefined) {
  if (!item) return null
  if (item.type === 'series') return item.episodes?.find((episode) => episode?.id)?.id || null
  return item.id || null
}

function PlaylistPlayerContent() {
  const router = useRouter()
  const [storyId, setStoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem('dtt_active_playlist') || localStorage.getItem('dtt_playlist')
    const savedIndex = localStorage.getItem('dtt_playlist_index')

    if (!raw) {
      setLoading(false)
      return
    }

    try {
      const parsed = JSON.parse(raw)
      const items: LegacyPlaylistItem[] = parsed.items
        ? parsed.items
        : Array.isArray(parsed)
          ? parsed.map((item: LegacyPlaylistItem) => ({ type: 'single', ...item }))
          : (parsed.stories || []).map((item: LegacyPlaylistItem) => ({ type: 'single', ...item }))
      const parsedIndex = savedIndex ? Number.parseInt(savedIndex, 10) : 0
      const launchIndex = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0
      const item = Array.isArray(items) ? items[launchIndex] || items[0] : null

      setStoryId(extractStoryIdFromItem(item))
    } catch (error) {
      console.error('Failed to parse playlist launch data:', error)
      setStoryId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!storyId) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <StickyHeaderFull />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎧</div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>No Playlist Selected</h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Go to the library and choose something to play.</p>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#f97316', color: 'black', padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Go to Library</button>
        </div>
      </div>
    )
  }

  return <CanonicalPlayer storyId={storyId} mode="playlist" />
}

export default function PlaylistPlayerPage() {
  return (
    <Suspense fallback={<div style={{ height: '100dvh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
      <PlaylistPlayerContent />
    </Suspense>
  )
}
