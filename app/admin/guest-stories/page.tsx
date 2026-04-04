'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  series_name: string | null
  episode_number: number | null
  duration_mins: number
  cover_url: string | null
  description: string | null
  is_free: boolean
  is_hidden: boolean
  audio_url: string | null
}

type FilterType = 'all' | 'featured' | 'series_ep1' | 'standalone'
type SortType = 'title' | 'duration' | 'genre' | 'series'

export default function GuestStoriesPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortType>('series')
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { fetchStories() }, [])
  useEffect(() => { return () => { audioRef.current?.pause() } }, [])

  async function fetchStories() {
    setLoading(true)
    const { data } = await supabase
      .from('stories')
      .select('id, title, author, genre, series_name, episode_number, duration_mins, cover_url, description, is_free, is_hidden, audio_url')
      .eq('is_hidden', false)
      .order('series_name', { ascending: true })
    if (data) setStories(data)
    setLoading(false)
  }

  async function toggleFeatured(story: Story) {
    setSaving(story.id)
    const newVal = !story.is_free
    const { error } = await supabase.from('stories').update({ is_free: newVal }).eq('id', story.id)
    if (!error) {
      setStories(prev => prev.map(s => s.id === story.id ? { ...s, is_free: newVal } : s))
      showToast(newVal ? `✅ "${story.title}" added to guest page` : `❌ "${story.title}" removed from guest page`)
    } else {
      showToast('Error saving — try again')
    }
    setSaving(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handlePlay(story: Story) {
    if (playingId === story.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    if (!story.audio_url) { showToast('No audio URL for this story'); return }
    const audio = new Audio(story.audio_url)
    audio.play().catch(() => showToast('Could not play audio'))
    audio.onended = () => setPlayingId(null)
    audioRef.current = audio
    setPlayingId(story.id)
  }

  const featuredCount = stories.filter(s => s.is_free).length

  const filtered = stories.filter(s => {
    if (filter === 'featured') return s.is_free
    if (filter === 'series_ep1') return s.series_name && s.series_name !== 'None' && s.episode_number === 1
    if (filter === 'standalone') return !s.series_name || s.series_name === 'None'
    return true
  }).filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.title.toLowerCase().includes(q) || (s.author || '').toLowerCase().includes(q) || (s.genre || '').toLowerCase().includes(q) || (s.series_name || '').toLowerCase().includes(q)
  }).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'duration') return a.duration_mins - b.duration_mins
    if (sort === 'genre') return (a.genre || '').localeCompare(b.genre || '')
    const sa = a.series_name || 'zzz', sb = b.series_name || 'zzz'
    if (sa !== sb) return sa.localeCompare(sb)
    return (a.episode_number || 0) - (b.episode_number || 0)
  })

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f6', padding: '2rem' }}>
      {toast && <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '0.875rem', zIndex: 1000 }}>{toast}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', margin: 0 }}>
          Guest Story Picker
          <span style={{ display: 'inline-block', background: '#f0a030', color: '#fff', borderRadius: '20px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700, marginLeft: '10px' }}>{featuredCount} featured</span>
        </h1>
        <p style={{ color: '#666', marginTop: '4px', fontSize: '0.9rem' }}>
          Toggle which stories appear on the guest page. Use the listen button to preview before featuring. Series Episode 1s make the best hooks.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.875rem', background: '#fff', color: '#111', width: '220px' }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.875rem', background: '#fff', color: '#111', cursor: 'pointer' }} value={sort} onChange={e => setSort(e.target.value as SortType)}>
          <option value="series">Sort: Series</option>
          <option value="title">Sort: Title</option>
          <option value="genre">Sort: Genre</option>
          <option value="duration">Sort: Duration</option>
        </select>
        {(['all', 'featured', 'series_ep1', 'standalone'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '20px', border: filter === f ? '1px solid #f0a030' : '1px solid #ddd', background: filter === f ? '#f0a030' : '#fff', color: filter === f ? '#fff' : '#555', fontSize: '0.8rem', fontWeight: filter === f ? 700 : 400, cursor: 'pointer' }}>
            {f === 'all' ? 'All' : f === 'featured' ? '⭐ Featured' : f === 'series_ep1' ? 'Series Ep 1' : 'Standalone'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Loading stories...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <thead>
            <tr>
              {['', 'Story', 'Series / Episode', 'Genre', 'Min', 'Listen', 'Guest Page'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #eee', background: '#fafafa' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No stories match</td></tr>
            ) : filtered.map(story => (
              <tr key={story.id} style={{ background: story.is_free ? '#f0fdf4' : '#fff' }}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  {story.cover_url ? <img src={story.cover_url} alt="" style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} /> : <div style={{ width: '44px', height: '44px', borderRadius: '6px', background: '#e5e7eb' }} />}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontWeight: 600, color: '#111', fontSize: '0.875rem' }}>{story.title}</div>
                  <div style={{ color: '#888', fontSize: '0.775rem' }}>{story.author}</div>
                  {story.description && <div style={{ color: '#999', fontSize: '0.72rem', marginTop: '2px', maxWidth: '320px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{story.description}</div>}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  {story.series_name && story.series_name !== 'None' ? (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#444' }}>{story.series_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#888' }}>
                        Ep {story.episode_number || '?'}
                        {story.episode_number === 1 && <span style={{ marginLeft: '6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600 }}>Hook</span>}
                      </div>
                    </div>
                  ) : <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Standalone</span>}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '0.8rem', color: '#555' }}>{story.genre || '—'}</td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '0.8rem', color: '#555' }}>{story.duration_mins}</td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  <button onClick={() => handlePlay(story)} style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: playingId === story.id ? '#ef4444' : '#1a1a2e', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}>
                    {playingId === story.id ? '■' : '▶'}
                  </button>
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                  <button onClick={() => toggleFeatured(story)} disabled={saving === story.id} style={{ padding: '6px 16px', borderRadius: '20px', border: 'none', background: story.is_free ? '#16a34a' : '#e5e7eb', color: story.is_free ? '#fff' : '#555', fontSize: '0.8rem', fontWeight: 600, cursor: saving === story.id ? 'not-allowed' : 'pointer', opacity: saving === story.id ? 0.6 : 1, minWidth: '100px' }}>
                    {saving === story.id ? 'Saving...' : story.is_free ? '✓ Featured' : '+ Feature'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
