'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
}

const STORAGE_KEY = 'dtt_active_playlist'

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState([])
  const [playlist, setPlaylist] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Genres')
  const [selectedType, setSelectedType] = useState('Singles & Series')

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_library')
      .select('story_id, stories(id, title, author, genre, duration_mins, cover_url)')
      .eq('user_id', user.id)
      .eq('completed', false)
      .order('last_played', { ascending: false })
      .limit(50)

    const libraryStories = []
    for (const row of (data || [])) {
      const s = row.stories
      if (s && s.id) libraryStories.push({ id: s.id, title: s.title, author: s.author, genre: s.genre, duration_mins: s.duration_mins, cover_url: s.cover_url })
    }

    let existingPlaylist = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        existingPlaylist = Array.isArray(parsed) ? parsed : (parsed.stories || [])
      }
    } catch {}

    setPlaylist(existingPlaylist)
    const ids = new Set(existingPlaylist.map(s => s.id))
    setStories(libraryStories.filter(s => !ids.has(s.id)))
    setLoading(false)
  }

  const addToPlaylist = (story) => {
    setPlaylist(prev => [...prev, story])
    setStories(prev => prev.filter(s => s.id !== story.id))
  }

  const removeFromPlaylist = (storyId) => {
    const removed = playlist.find(s => s.id === storyId)
    if (removed) {
      setPlaylist(prev => prev.filter(s => s.id !== storyId))
      setStories(prev => [removed, ...prev])
    }
  }

  const moveUp = (i) => {
    if (i === 0) return
    const n = [...playlist];
    [n[i-1], n[i]] = [n[i], n[i-1]];
    setPlaylist(n)
  }

  const moveDown = (i) => {
    if (i === playlist.length - 1) return
    const n = [...playlist];
    [n[i], n[i+1]] = [n[i+1], n[i]];
    setPlaylist(n)
  }

  const persist = () => ({
    id: 'user-playlist-' + Date.now(),
    stories: playlist,
    completed: 0,
    remaining_mins: playlist.reduce((s, x) => s + (x.duration_mins || 0), 0),
    last_played: new Date().toISOString(),
  })

  const saveForLater = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist()))
    router.push('/home')
  }

  const playNow = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist()))
    router.push('/player/' + playlist[0].id + '?resume=0')
  }

  const filteredStories = stories.filter(story => {
    if (selectedDuration === '~15 min' && story.duration_mins > 20) return false
    if (selectedDuration === '~30 min' && (story.duration_mins <= 20 || story.duration_mins > 45)) return false
    if (selectedDuration === '~1 hr' && story.duration_mins <= 45) return false
    if (selectedGenre !== 'All Genres') {
      const g = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !g.includes('mystery')) return false
      if (selectedGenre === 'Romance' && !g.includes('romance')) return false
      if (selectedGenre === 'Horror' && !g.includes('horror')) return false
      if (selectedGenre === 'Thriller' && !g.includes('thriller')) return false
      if (selectedGenre === 'Sci-Fi' && !g.includes('sci')) return false
      if (selectedGenre === 'Western' && !g.includes('western')) return false
      if (selectedGenre === 'Drama' && !g.includes('drama')) return false
    }
    return true
  })

  if (loading) (
    <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%' }} />
    </div>
  )

  return (
    <div style={{ background: '#020617', minHeight: '100vh', paddingBottom: playlist.length > 0 ? 100 : 20 }}>
      <StickyHeaderFull />
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>Build Your Playlist</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Tap a story to add it to your queue.</p>
      </div>
      <LibraryFiltersV2
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#020617', padding: '8px 16px', marginLeft: '-16px', marginRight: '-16px', textAlign: 'center', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: playlist.length > 0 ? '#f97316' : '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {playlist.length > 0
            ? `Your Playlist · ${playlist.length} ${playlist.length === 1 ? 'story' : 'stories'} · ${playlist.reduce((s, x) => s + (x.duration_mins || 0), 0)} min`
            : 'Your Playlist · 0 Stories — tap below to add'}
        </div>
      </div>

      {playlist.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {playlist.map((story, i) => (
              <div key={story.id} style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid rgba(249,115,22,0.25)' }}>
                <div style={{ color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0, width: 18, textAlign: 'center' }}>{i + 1}</div>
                <img src={story.cover_url || '/images/et-logo.png'} alt={story.title} style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{story.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{story.duration_mins} min · {story.author}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {i > 0 && <button onClick={() => moveUp(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>}
                  {i < playlist.length - 1 && <button onClick={() => moveDown(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>}
                  <button onClick={() => removeFromPlaylist(story.id)} style={{ background: 'rgba(220,38,38,0.15)', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredStories.map(story => (
            <div key={story.id} onClick={() => addToPlaylist(story)}
              style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid rgba(148,163,184,0.06)', cursor: 'pointer' }}>
              <img src={story.cover_url || '/images/et-logo.png'} alt={story.title} style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>{story.genre}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{story.duration_mins} min · {story.author}</div>
              </div>
              <div style={{ flexShrink: 0, background: '#22c55e', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#042013' }}>+ Add</div>
            </div>
          ))}
        </div>
      </div>

      {playlist.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid #334155', zIndex: 40 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={playNow} style={{ flex: 1, padding: '14px', background: '#22c55e', color: '#042013', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>▶ Play Now</button>
            <button onClick={saveForLater} style={{ flex: 1, padding: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>💾 Save for Later</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={<div style={{ background: '#020617', minHeight: '100vh' }} />}>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
