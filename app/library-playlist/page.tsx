'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

interface StoryItem {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
  series_name?: string | null
  episode_number?: number | null
}

// What gets added to the actual playlist queue (always individual episodes)
interface PlaylistEntry {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
}

// Display item: either a single story or a whole series collapsed into one card
interface SingleCard {
  kind: 'single'
  story: StoryItem
}
interface SeriesCard {
  kind: 'series'
  series_name: string
  author: string
  cover_url: string | null
  total_mins: number
  episode_count: number
  episodes: PlaylistEntry[]   // ordered ep1→epN
  genre: string
}
type LibraryCard = SingleCard | SeriesCard

const STORAGE_KEY = 'dtt_active_playlist'

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [cards, setCards] = useState<LibraryCard[]>([])
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Genres')
  const [selectedType, setSelectedType] = useState('Singles & Series')
  const [selectedGroup, setSelectedGroup] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    loadData()
  }, [user, authLoading])

  const loadData = async () => {
    setLoading(true)

    // Fetch ALL published stories (not just user library — so all content is available for playlists)
    const { data } = await supabase
      .from('stories')
      .select('id, title, author, genre, duration_mins, cover_url, series_name, episode_number')
      .not('status', 'eq', 'archived')
      .order('title', { ascending: true })
      .limit(500)

    const libraryStories: StoryItem[] = (data || []).map((s: any) => ({
      id: s.id, title: s.title, author: s.author, genre: s.genre,
      duration_mins: s.duration_mins, cover_url: s.cover_url,
      series_name: s.series_name, episode_number: s.episode_number,
    }))

    // Group series episodes (already fetched above)
    const seriesEpisodesMap: Record<string, StoryItem[]> = {}
    for (const s of libraryStories) {
      if (!s.series_name) continue
      if (!seriesEpisodesMap[s.series_name]) seriesEpisodesMap[s.series_name] = []
      seriesEpisodesMap[s.series_name].push(s)
    }
    // Sort episodes within each series
    for (const name of Object.keys(seriesEpisodesMap)) {
      seriesEpisodesMap[name].sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
    }

    // Restore existing playlist from localStorage
    let existingPlaylist: PlaylistEntry[] = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        existingPlaylist = Array.isArray(parsed) ? parsed : (parsed.stories || [])
      }
    } catch {}
    setPlaylist(existingPlaylist)

    // IDs already in playlist (don't show in available list)
    const inPlaylistIds = new Set(existingPlaylist.map(s => s.id))
    // Series already (partially or fully) added — hide the whole series card
    const inPlaylistSeriesNames = new Set(
      existingPlaylist.map(s => (s as any).series_name).filter(Boolean)
    )

    // Build display cards
    const builtCards: LibraryCard[] = []
    const seenSeries = new Set<string>()

    for (const story of libraryStories) {
      if (story.series_name) {
        if (seenSeries.has(story.series_name)) continue  // already added card for this series
        seenSeries.add(story.series_name)
        if (inPlaylistSeriesNames.has(story.series_name)) continue  // already in playlist

        const eps = (seriesEpisodesMap[story.series_name] || [story])
          .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))

        const ep1 = eps[0]
        builtCards.push({
          kind: 'series',
          series_name: story.series_name,
          author: ep1?.author || story.author,
          cover_url: ep1?.cover_url || story.cover_url,
          total_mins: eps.reduce((sum, e) => sum + (e.duration_mins || 0), 0),
          episode_count: eps.length,
          genre: ep1?.genre || story.genre,
          episodes: eps.map(e => ({
            id: e.id, title: e.title, author: e.author, genre: e.genre,
            duration_mins: e.duration_mins, cover_url: e.cover_url,
            series_name: story.series_name,  // kept for "already in playlist" dedup
          } as any)),
        })
      } else {
        if (inPlaylistIds.has(story.id)) continue
        builtCards.push({ kind: 'single', story })
      }
    }

    setCards(builtCards)
    setLoading(false)
  }

  const addToPlaylist = (card: LibraryCard) => {
    if (card.kind === 'series') {
      setPlaylist(prev => [...prev, ...card.episodes])
      setCards(prev => prev.filter(c => !(c.kind === 'series' && c.series_name === card.series_name)))
    } else {
      setPlaylist(prev => [...prev, card.story])
      setCards(prev => prev.filter(c => !(c.kind === 'single' && c.story.id === card.story.id)))
    }
  }

  const removeFromPlaylist = (index: number) => {
    const entry = playlist[index]
    setPlaylist(prev => prev.filter((_, i) => i !== index))
    // Re-add back as single card
    setCards(prev => [{ kind: 'single', story: entry as any }, ...prev])
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    const n = [...playlist];[n[i-1], n[i]] = [n[i], n[i-1]]; setPlaylist(n)
  }
  const moveDown = (i: number) => {
    if (i === playlist.length - 1) return
    const n = [...playlist];[n[i], n[i+1]] = [n[i+1], n[i]]; setPlaylist(n)
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
    router.push('/player/playlist')
  }

  // Sort available cards shortest → longest (series by total, singles by duration)
  const sortedCards = [...cards].sort((a, b) => {
    const aDur = a.kind === 'series' ? a.total_mins : (a.story.duration_mins || 0)
    const bDur = b.kind === 'series' ? b.total_mins : (b.story.duration_mins || 0)
    return aDur - bDur
  })

  const filteredCards = sortedCards.filter(card => {
    const genre  = card.kind === 'series' ? card.genre : card.story.genre
    const durMin = card.kind === 'series' ? card.total_mins : card.story.duration_mins
    if (selectedDuration === '~15 min' && durMin > 20) return false
    if (selectedDuration === '~30 min' && (durMin <= 20 || durMin > 45)) return false
    if (selectedDuration === '~1 hr' && durMin <= 45) return false
    if (selectedGenre !== 'All Genres') {
      const g = genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery'  && !g.includes('mystery'))  return false
      if (selectedGenre === 'Romance'  && !g.includes('romance'))  return false
      if (selectedGenre === 'Horror'   && !g.includes('horror'))   return false
      if (selectedGenre === 'Thriller' && !g.includes('thriller')) return false
      if (selectedGenre === 'Sci-Fi'   && !g.includes('sci'))      return false
      if (selectedGenre === 'Western'  && !g.includes('western'))  return false
      if (selectedGenre === 'Drama'    && !g.includes('drama'))    return false
    }
    if (selectedType === 'Singles Only'  && card.kind === 'series') return false
    if (selectedType === 'Series Only'   && card.kind === 'single') return false
    return true
  })

  const totalPlaylistMins = playlist.reduce((s, x) => s + (x.duration_mins || 0), 0)

  if (loading) return (
    <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ background: '#020617', minHeight: '100vh', paddingBottom: 120 }}>
      <StickyHeaderFull />

      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>Build Your Playlist</h1>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Tap a story or series to add it to your queue.</p>
      </div>

      <div style={{ position: 'sticky', top: '60px', zIndex: 40, background: '#020617' }}>
        <LibraryFiltersV2
          selectedDuration={selectedDuration}
          setSelectedDuration={setSelectedDuration}
          selectedGenre={selectedGenre}
          setSelectedGenre={setSelectedGenre}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          selectedGroup={selectedGroup}
          setSelectedGroup={setSelectedGroup}
        />
        <div style={{ background: '#020617', padding: '8px 16px', textAlign: 'center', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: playlist.length > 0 ? '#f97316' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {playlist.length > 0
              ? `Your Playlist · ${playlist.length} ${playlist.length === 1 ? 'story' : 'stories'} · ${formatDuration(totalPlaylistMins)}`
              : 'Your Playlist · 0 Stories — tap below to add'}
          </div>
        </div>
      </div>

      {/* ── Playlist queue ── */}
      {playlist.length > 0 && (
        <div style={{ padding: '8px 16px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {playlist.map((entry, i) => (
              <div key={`${entry.id}-${i}`} style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid rgba(249,115,22,0.25)' }}>
                <div style={{ color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0, width: 18, textAlign: 'center' }}>{i + 1}</div>
                <img src={entry.cover_url || '/images/et-logo.png'} alt={entry.title} style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{formatDuration(entry.duration_mins)} · {entry.author}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {i > 0 && <button onClick={() => moveUp(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>}
                  {i < playlist.length - 1 && <button onClick={() => moveDown(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>}
                  <button onClick={() => removeFromPlaylist(i)} style={{ background: 'rgba(220,38,38,0.15)', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Available library cards ── */}
      <div style={{ padding: '0 16px' }}>
        {filteredCards.length === 0 && (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
            {cards.length === 0 ? 'Your library is empty — browse stories to add them.' : 'No matches for current filters.'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredCards.map((card, idx) => {
            if (card.kind === 'series') {
              return (
                <div key={card.series_name} onClick={() => addToPlaylist(card)}
                  style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid rgba(148,163,184,0.06)', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img src={card.cover_url || '/images/et-logo.png'} alt={card.series_name}
                      style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover' }} />
                    {/* Series badge */}
                    <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(249,115,22,0.9)', borderRadius: 4, padding: '2px 5px', fontSize: 9, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Series
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.series_name}</div>
                    <div style={{ color: '#cbd5e1', fontSize: 12 }}>{card.genre}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{card.episode_count} episodes · {formatDuration(card.total_mins)} total · {card.author}</div>
                  </div>
                  <div style={{ flexShrink: 0, background: '#22c55e', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#042013' }}>+ Add All</div>
                </div>
              )
            } else {
              return (
                <div key={card.story.id} onClick={() => addToPlaylist(card)}
                  style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid rgba(148,163,184,0.06)', cursor: 'pointer' }}>
                  <img src={card.story.cover_url || '/images/et-logo.png'} alt={card.story.title}
                    style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.story.title}</div>
                    <div style={{ color: '#cbd5e1', fontSize: 12 }}>{card.story.genre}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{formatDuration(card.story.duration_mins)} · {card.story.author}</div>
                  </div>
                  <div style={{ flexShrink: 0, background: '#22c55e', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#042013' }}>+ Add</div>
                </div>
              )
            }
          })}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
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
    <Suspense fallback={<div style={{ background: '#020617', minHeight: '100vh' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
