'use client'
import { publicationMonth, latestPublication } from '@/lib/publicationDate'
import MediaButtonLabel from '@/components/MediaButtonLabel'
import { selectNewestArrivals, episodeNumber } from '@/lib/newArrivals'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOpenPlayer } from '@/components/player/PersistentPlayer'
import { formatMinutes } from '@/components/LibraryStoryCard'
import { ACTIVE_PLAYLIST_KEY, saveActivePlaylist, clearActivePlaylist } from '@/lib/playlistState'
import { downloadQueuedItemOffline, removeQueuedItemOffline } from '@/lib/offline/queueDownload'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  description: string | null
  narrator_voice_name?: string | null
  episodes?: Story[]
  series_id: string | null; series_number: number | null; series_name: string | null
  episode_number?: number | null
  series_total?: number | null
  published_on?: string | null
  avg_rating?: number | null; review_count?: number
}

const buttonStyle = { flex: 1, minWidth: 0, height: 58, padding: 4, borderRadius: 6, fontSize: 12, lineHeight: 1.25, fontWeight: 800, color: '#fff', cursor: 'pointer' } as const

export default function NewReleases({ onIdsLoaded }: { onIdsLoaded?: (ids: string[]) => void }) {
  const { user, session } = useAuth()
  const openPlayer = useOpenPlayer()
  const [playlist, setPlaylist] = useState<string[]>([])
  const playlistKey = user ? `et_current_playlist_${user.id}` : 'et_current_playlist'
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const loadVersion = useRef(0)

  useEffect(() => {
    load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => { loadVersion.current++; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const sync = () => {
      try { setPlaylist(JSON.parse(localStorage.getItem(playlistKey) || '[]')) } catch { setPlaylist([]) }
    }
    sync()
    window.addEventListener('et_playlist_saved', sync)
    window.addEventListener('et_playlist_cleared', sync)
    return () => {
      window.removeEventListener('et_playlist_saved', sync)
      window.removeEventListener('et_playlist_cleared', sync)
    }
  }, [playlistKey])

  function navigate(url: string) {
    if (openPlayer) openPlayer(url)
    else router.push(url)
  }

  function togglePlaylist(story: Story) {
    const key = story.series_id ? `series-${story.series_id}` : `single-${story.id}`
    const episodes = story.episodes || [story]
    const adding = !playlist.includes(key)
    const next = adding ? [...playlist, key] : playlist.filter(k => k !== key)
    let saved: any = {}
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_PLAYLIST_KEY) || '{}') } catch {}
    const items = (saved.items || saved.stories || []).filter((item: any) =>
      (item.type === 'series' ? `series-${item.series_id || item.id}` : `single-${item.id}`) !== key)
    if (adding) items.push(story.series_id ? {
      type: 'series', id: story.series_id, series_id: story.series_id,
      title: story.series_name, series_name: story.series_name, author: story.author,
      genre: story.genre, cover_url: story.cover_url, episode_count: episodes.length,
      total_mins: episodes.reduce((sum, ep) => sum + Number(ep.duration_mins || 0), 0),
      episodes: episodes.map(ep => ({ id: ep.id, episode_number: episodeNumber(ep) })),
    } : { ...story, type: 'single' })
    localStorage.setItem(playlistKey, JSON.stringify(next))
    setPlaylist(next)
    if (items.length) saveActivePlaylist({ ...saved, id: saved.id || `home-${Date.now()}`, items,
      remaining_mins: items.reduce((sum: number, item: any) => sum + Number(item.total_mins || item.duration_mins || 0), 0),
    }, next)
    else clearActivePlaylist()
    const target = story.series_id
      ? { type: 'series' as const, episodeIds: episodes.map(ep => ep.id) }
      : { type: 'single' as const, id: story.id }
    if (adding && user && session?.access_token) {
      downloadQueuedItemOffline(target, { userId: user.id, accessToken: session.access_token, firstName: (user as any)?.first_name || null }).catch(() => {})
    } else if (!adding) removeQueuedItemOffline(target, user?.id).catch(() => {})
  }

  async function load(background = false) {
    const version = ++loadVersion.current
    if (!background) setLoading(true)
    const rows: Story[] = []
    // Read complete groups; a fixed row limit can cut a recent series in half.
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from('stories')
        .select('id,title,genre,author,description,duration_mins,cover_url,narrator_voice_name,series_id,series_number,episode_number,series_name,series_total,published_on')
        .eq('status', 'published').eq('is_hidden', false)
        .order('published_on', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
        .range(start, start + 999)
      if (version !== loadVersion.current) return
      if (error || !data) { setLoading(false); onIdsLoaded?.([]); return }
      rows.push(...data as Story[])
      if (data.length < 1000) break
    }
    const result = selectNewestArrivals(rows)
    setStories(result)
    onIdsLoaded?.(result.map(story => story.id))
    setLoading(false)
  }

  if (loading) return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>NEW ARRIVALS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {[1,2].map(i => <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}><div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1/1', marginBottom: '0.5rem' }} /></div>)}
      </div>
    </section>
  )
  if (!stories.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>NEW ARRIVALS</h2>
      {/* When only 1 item qualifies, use a single full-width column so the card isn't half-width */}
      <div style={{ display: 'grid', gridTemplateColumns: stories.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map(s => {
          // Series-first: series cards open the series container, not EP1 directly.
          // Standalone stories keep existing direct-player behavior.
          const href = s.series_id ? `/series/${s.series_id}` : `/player/${s.id}?autoplay=1&playNow=1`
          const episodes = s.episodes || [s]
          const published = publicationMonth(latestPublication(episodes.map(episode => episode.published_on)))
          const total = Math.round(episodes.reduce((sum, ep) => sum + Number(ep.duration_mins || 0), 0))
          const key = s.series_id ? `series-${s.series_id}` : `single-${s.id}`
          const description = s.description || ''
          const shortDescription = description.length > 70 ? description.slice(0, 67).trimEnd() + '…' : description
          return (
            <div
              key={s.id}
              className="bg-slate-800 rounded-xl hover:bg-slate-700 transition"
              style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', color: '#fff' }}
            >
              <div onClick={() => router.push(href)} className="rounded-lg overflow-hidden cover-glow" style={{ position: 'relative' }}>
                <img src={s.cover_url || '/images/default-cover.png'} alt={s.series_name || s.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />

              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">{s.series_name ? s.series_name : s.title}</h3>
                <p style={{ color: '#fff', fontSize: '0.7rem' }}>{s.genre}{published ? ` · ${published}` : ''}</p>
                <p style={{ color: '#fff', fontSize: '0.7rem' }}>by {s.author}</p>
                <p style={{ color: '#fff', fontSize: '0.7rem' }}>Narrated By {s.narrator_voice_name || 'Not listed'}</p>
                <p style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>{episodes.length} Episode{episodes.length === 1 ? '' : 's'} · {formatMinutes(total)} total</p>
                {shortDescription && <p style={{ color: '#fff', fontSize: '0.7rem', lineHeight: 1.45, margin: '5px 0' }}>{shortDescription}</p>}
                <div style={{ display: 'flex', gap: 4, marginTop: 'auto', paddingTop: 8 }}>
                  <button onClick={() => navigate(`/player/${s.id}?autoplay=1&playNow=1`)} style={{ ...buttonStyle, background: '#f97316', color: '#000' }}><MediaButtonLabel kind="listen">Listen</MediaButtonLabel></button>
                  <button onClick={() => togglePlaylist(s)} style={{ ...buttonStyle, background: playlist.includes(key) ? '#93c5fd' : '#3b82f6', color: playlist.includes(key) ? '#1e3a8a' : '#fff' }}>{playlist.includes(key) ? 'On Playlist' : 'Add to Playlist'}</button>
                  <button onClick={() => navigate(`/player/${s.id}?openReader=1`)} style={{ ...buttonStyle, background: '#eab308', color: '#000' }}><MediaButtonLabel kind="read">Read</MediaButtonLabel></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
