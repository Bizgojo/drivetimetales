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

interface PlaylistEntry {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url?: string | null
}

interface PlaylistItem {
  type: 'single' | 'series'
  // single fields
  id?: string
  title?: string
  author?: string
  genre?: string
  duration_mins?: number
  cover_url?: string | null
  audio_url?: string | null
  // series fields
  series_name?: string
  series_id?: string
  total_mins?: number
  episode_count?: number
  episodes?: PlaylistEntry[]
}

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
  episodes: PlaylistEntry[]
  genre: string
}
type LibraryCard = SingleCard | SeriesCard

const STORAGE_KEY = 'dtt_active_playlist'
const OFFLINE_KEY  = 'dtt_offline_ready'

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Download helpers ──────────────────────────────────────────────────────────

async function resolvePersonalizedAudioUrl(storyId: string, preferredName: string): Promise<string | null> {
  try {
    const res = await fetch('/api/asc3/render-personalized-final-mix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, preferredName }),
    })
    const json = await res.json().catch(() => ({}))
    return res.ok && json?.finalMixUrl ? String(json.finalMixUrl) : null
  } catch {
    return null
  }
}

async function resolveStoryAudioUrl(entry: PlaylistEntry, preferredName: string): Promise<PlaylistEntry> {
  if (preferredName) {
    const personalizedUrl = await resolvePersonalizedAudioUrl(entry.id, preferredName)
    if (personalizedUrl) return { ...entry, audio_url: personalizedUrl }
  }
  if (entry.audio_url) return entry
  try {
    const { data } = await supabase
      .from('stories')
      .select('audio_url')
      .eq('id', entry.id)
      .single()
    return { ...entry, audio_url: data?.audio_url || null }
  } catch {
    return entry
  }
}

async function resolveAudioUrls(entries: PlaylistItem[], preferredName: string): Promise<PlaylistItem[]> {
  return Promise.all(entries.map(async entry => {
    if (entry.type === 'series') {
      const episodes = await Promise.all((entry.episodes || []).map(episode => resolveStoryAudioUrl(episode, preferredName)))
      return { ...entry, episodes }
    }
    try {
      const resolved = await resolveStoryAudioUrl(entry as PlaylistEntry, preferredName)
      return { ...entry, audio_url: resolved.audio_url || null }
    } catch {
      return entry
    }
  }))
}

function playlistAudioUrls(items: PlaylistItem[]) {
  return items.flatMap(item => (
    item.type === 'series'
      ? (item.episodes || []).map(episode => episode.audio_url).filter(Boolean)
      : [item.audio_url].filter(Boolean)
  )) as string[]
}

function playlistTitleForUrl(items: PlaylistItem[], url: string) {
  for (const item of items) {
    if (item.type === 'series') {
      const episode = (item.episodes || []).find(ep => ep.audio_url === url)
      if (episode) return episode.title
    } else if (item.audio_url === url) {
      return item.title || 'story'
    }
  }
  return 'story'
}

async function cacheAudioFile(url: string): Promise<boolean> {
  try {
    const cache = await caches.open('et-audio-v1')
    const existing = await cache.match(url)
    if (existing) return true // already cached
    const response = await fetch(url, { cache: 'no-store' })
    if (response.ok) {
      await cache.put(url, response)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ── Main component ────────────────────────────────────────────────────────────

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [cards, setCards] = useState<LibraryCard[]>([])
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(() => {
    try {
      const raw = localStorage.getItem('dtt_playlist') || localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : (parsed.stories || [])
      }
    } catch {}
    return []
  })
  const [loading, setLoading] = useState(true)
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')
  const [selectedGroup, setSelectedGroup] = useState('')

  // Download state
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0) // 0-100
  const [downloadTotal, setDownloadTotal] = useState(0)
  const [downloadDone, setDownloadDone] = useState(false)
  const [downloadLabel, setDownloadLabel] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    loadData()
  }, [user, authLoading])

  const loadData = async () => {
    setLoading(true)
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

    const seriesEpisodesMap: Record<string, StoryItem[]> = {}
    for (const s of libraryStories) {
      if (!s.series_name) continue
      if (!seriesEpisodesMap[s.series_name]) seriesEpisodesMap[s.series_name] = []
      seriesEpisodesMap[s.series_name].push(s)
    }
    for (const name of Object.keys(seriesEpisodesMap)) {
      seriesEpisodesMap[name].sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
    }

    let existingPlaylist: PlaylistEntry[] = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        existingPlaylist = Array.isArray(parsed) ? parsed : (parsed.stories || [])
      }
    } catch {}
    setPlaylist(existingPlaylist)

    const inPlaylistIds = new Set(existingPlaylist.map(s => s.id))
    const inPlaylistSeriesNames = new Set(
      existingPlaylist.map(s => (s as any).series_name).filter(Boolean)
    )

    const builtCards: LibraryCard[] = []
    const seenSeries = new Set<string>()

    for (const story of libraryStories) {
      if (story.series_name) {
        if (seenSeries.has(story.series_name)) continue
        seenSeries.add(story.series_name)
        if (inPlaylistSeriesNames.has(story.series_name)) continue
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
            series_name: story.series_name,
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
      const seriesItem: PlaylistItem = {
        type: 'series',
        series_name: card.series_name,
        series_id: card.episodes[0]?.id,
        cover_url: card.cover_url,
        author: card.author,
        genre: card.genre,
        total_mins: card.total_mins,
        episode_count: card.episode_count,
        episodes: card.episodes,
      }
      setPlaylist(prev => [...prev, seriesItem])
      setCards(prev => prev.filter(c => !(c.kind === 'series' && c.series_name === card.series_name)))
    } else {
      const singleItem: PlaylistItem = {
        type: 'single',
        id: card.story.id,
        title: card.story.title,
        author: card.story.author,
        genre: card.story.genre,
        duration_mins: card.story.duration_mins,
        cover_url: card.story.cover_url,
      }
      setPlaylist(prev => [...prev, singleItem])
      setCards(prev => prev.filter(c => !(c.kind === 'single' && c.story.id === card.story.id)))
    }
    setDownloadDone(false)
    setDownloadProgress(0)
  }

  const removeFromPlaylist = (index: number) => {
    const item = playlist[index]
    setPlaylist(prev => prev.filter((_, i) => i !== index))
    if (item.type === 'series') {
      const seriesCard: SeriesCard = {
        kind: 'series',
        series_name: item.series_name!,
        author: item.author!,
        cover_url: item.cover_url || null,
        total_mins: item.total_mins!,
        episode_count: item.episode_count!,
        episodes: item.episodes!,
        genre: item.genre!,
      }
      setCards(prev => [seriesCard, ...prev])
    } else {
      const singleCard: SingleCard = {
        kind: 'single',
        story: { id: item.id!, title: item.title!, author: item.author!, genre: item.genre!, duration_mins: item.duration_mins!, cover_url: item.cover_url || null }
      }
      setCards(prev => [singleCard, ...prev])
    }
    setDownloadDone(false)
    setDownloadProgress(0)
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    const n = [...playlist];[n[i-1], n[i]] = [n[i], n[i-1]]; setPlaylist(n)
  }
  const moveDown = (i: number) => {
    if (i === playlist.length - 1) return
    const n = [...playlist];[n[i], n[i+1]] = [n[i+1], n[i]]; setPlaylist(n)
  }

  const persist = (items: PlaylistItem[]) => ({
    id: 'user-playlist-' + Date.now(),
    items,
    completed: 0,
    remaining_mins: items.reduce((s, x) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0),
    last_played: new Date().toISOString(),
    offline_ready: downloadDone,
  })

  // ── Save for Later: resolve URLs → cache all audio → save → go home ──────
  const saveForLater = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadLabel('Resolving stories...')

    // Step 1: resolve all audio URLs
    const preferredName = String((user as any)?.first_name || '').trim()
    const resolved = await resolveAudioUrls(playlist, preferredName)
    const audioUrls = playlistAudioUrls(resolved)
    setDownloadTotal(audioUrls.length)

    if (audioUrls.length === 0) {
      // No audio URLs found — just save and go
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persist(resolved)))
      router.push('/home')
      return
    }

    // Step 2: cache each audio file showing progress
    let cached = 0
    for (const url of audioUrls) {
      const title = playlistTitleForUrl(resolved, url)
      setDownloadLabel(`Downloading "${title}"...`)
      await cacheAudioFile(url)
      cached++
      setDownloadProgress(Math.round((cached / audioUrls.length) * 100))
    }

    // Step 3: save playlist with resolved URLs and offline_ready flag
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist(resolved)))
    localStorage.setItem(OFFLINE_KEY, 'true')

    setDownloadDone(true)
    setDownloading(false)
    setDownloadLabel(`✓ ${audioUrls.length} stories saved for offline`)

    // Brief pause to show completion, then navigate
    setTimeout(() => router.push('/home'), 1200)
  }

  const playNow = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist(playlist)))
    router.push('/player/playlist?autoplay=1&playlist=1')
  }

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
    if (selectedGenre !== 'All Categories') {
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

  const totalPlaylistMins = playlist.reduce((s, x) => s + (x.type === 'series' ? (x.total_mins || 0) : (x.duration_mins || 0)), 0)

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
        <p style={{ color: '#ffffff', fontSize: 13, margin: '4px 0 0' }}>Tap a story or series to add it to your queue.</p>
      </div>

      <div style={{ position: 'sticky', top: '60px', zIndex: 50, background: '#020617' }}>
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
        <div style={{ background: '#020617', padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(249,115,22,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: playlist.length > 0 ? '#f97316' : '#ffffff', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            {playlist.length > 0
              ? `Your Playlist · ${playlist.length} ${playlist.length === 1 ? 'story' : 'stories'} · ${formatDuration(totalPlaylistMins)}`
              : 'Your Playlist · 0 Stories — tap below to add'}
          </div>
        </div>
      </div>

      {/* ── Download progress overlay ── */}
      {downloading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2,6,23,0.92)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 24 }}>📥</div>
          <div style={{ color: 'white', fontSize: 20, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Saving for Offline</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>{downloadLabel}</div>
          <div style={{ width: '100%', maxWidth: 300, background: '#1e293b', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', background: '#f97316', borderRadius: 8, width: `${downloadProgress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{downloadProgress}% — {Math.round(downloadTotal * downloadProgress / 100)} of {downloadTotal} stories</div>
          <div style={{ marginTop: 20, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>Keep this screen open while downloading</div>
        </div>
      )}

      {/* ── Playlist queue ── */}
      {playlist.length > 0 && (
        <div style={{ padding: '8px 16px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {playlist.map((item, i) => (
              <div key={`${item.type === 'series' ? item.series_name : item.id}-${i}`} style={{ background: '#253347', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 0', border: '2px solid rgba(249,115,22,0.4)', overflow: 'hidden' }}>
                <div style={{ position: 'relative', flexShrink: 0, width: 72, alignSelf: 'stretch', minHeight: 72 }}>
                  <img src={item.cover_url || '/images/et-logo.png'} alt={item.type === 'series' ? item.series_name : item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.75)', color: 'white', fontSize: 15, fontWeight: 900, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                  {item.type === 'series' && (
                    <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(249,115,22,0.9)', borderRadius: 3, padding: '1px 4px', fontSize: 8, fontWeight: 800, color: 'white', textTransform: 'uppercase' }}>Series</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.type === 'series' ? item.series_name : item.title}
                  </div>
                  <div style={{ color: '#ffffff', fontSize: 12 }}>
                    {item.type === 'series'
                      ? `${item.episode_count} episodes · ${formatDuration(item.total_mins || 0)} · ${item.author}`
                      : `${formatDuration(item.duration_mins || 0)} · ${item.author}`}
                  </div>
                  {item.type === 'series' && (
                    <div style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>▶ Continues where you left off</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {i > 0 && <button onClick={() => moveUp(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>}
                  {i === 0 && playlist.length > 1 && <button onClick={() => moveDown(i)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>}
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
          <div style={{ color: '#ffffff', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
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
                    <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(249,115,22,0.9)', borderRadius: 4, padding: '2px 5px', fontSize: 9, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Series
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.series_name}</div>
                    <div style={{ color: '#ffffff', fontSize: 12 }}>{card.genre}</div>
                    <div style={{ color: '#ffffff', fontSize: 12 }}>{card.episode_count} episodes · {formatDuration(card.total_mins)} total · {card.author}</div>
                  </div>
                  <div style={{ flexShrink: 0, background: '#f97316', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'white' }}>+ Add All</div>
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
                    <div style={{ color: '#ffffff', fontSize: 12 }}>{card.story.genre}</div>
                    <div style={{ color: '#ffffff', fontSize: 12 }}>{formatDuration(card.story.duration_mins)} · {card.story.author}</div>
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
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid #334155', zIndex: 100 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={playNow} style={{ flex: 1, padding: '14px', background: '#22c55e', color: '#042013', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>▶ Play Now</button>
            <button
              onClick={saveForLater}
              disabled={downloading}
              style={{ flex: 1, padding: '14px', background: downloadDone ? '#16a34a' : '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.8 : 1 }}
            >
              {downloadDone ? '✓ Saved Offline' : downloading ? 'Saving...' : '📥 Save for Later'}
            </button>
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
