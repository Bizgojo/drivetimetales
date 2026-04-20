'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import NewStoryCard from '@/components/NewStoryCard'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  description?: string | null; series_name?: string | null
  series_total?: number | null; series_number?: number | null
  episode_title?: string | null; avg_rating?: number | null
  review_count?: number
}
interface LibEntry { story_id: string; progress?: number; completed?: boolean }

const GENRES = ['Thriller','Horror','Dark Mystery','Mystery/Crime','Adventure','Drama','Sci-Fi','Western','Historical Drama','Supernatural','Family/Heartwarming','Comedy','Romance']

function LibraryNewContent() {
  const { user } = useAuth()
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [libMap, setLibMap] = useState<Record<string, LibEntry>>({})
  const [loading, setLoading] = useState(true)
  const [genre, setGenre] = useState('')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [playlist, setPlaylist] = useState<Story[]>([])
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('story_analytics')
        .select('id,title,genre,author,duration_mins,cover_url,description,series_name,series_total,series_number,episode_title,avg_rating,review_count')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(50)
      setStories(data || [])
      if (user?.id) {
        const { data: lib } = await supabase
          .from('user_library')
          .select('story_id,progress,completed')
          .eq('user_id', user.id)
        const map: Record<string, LibEntry> = {}
        for (const e of lib || []) map[e.story_id] = e
        setLibMap(map)
      }
      setLoading(false)
    }
    load()
  }, [user])

  const filtered = stories.filter(s => {
    if (genre && s.genre !== genre) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.author.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const inPlaylist = (id: string) => playlist.some(s => s.id === id)
  const addToPlaylist = (s: Story) => setPlaylist(p => inPlaylist(s.id) ? p : [...p, s])
  const removeFromPlaylist = (id: string) => setPlaylist(p => p.filter(s => s.id !== id))
  const totalMins = playlist.reduce((a, s) => a + s.duration_mins, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: '-apple-system,sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0f1117', padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e3a5f', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'white', fontSize: 17, fontWeight: 700 }}>Endless <span style={{ color: '#f97316' }}>Tales</span></span>
          <span style={{ background: '#f97316', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>NEW UI</span>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700 }}>M</div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '10px 12px 6px' }}>
        <div onClick={() => setShowSearch(true)} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'text' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/><path d="M10.5 10.5l2.5 2.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>{search || 'Search stories, authors, genres...'}</span>
          {search && <button onClick={e => { e.stopPropagation(); setSearch('') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>×</button>}
        </div>
      </div>

      {/* Genre filters */}
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {['All', ...GENRES.slice(0,6)].map(g => (
          <button key={g} onClick={() => setGenre(g === 'All' ? '' : g)} style={{ background: (g === 'All' ? !genre : genre === g) ? '#f97316' : 'rgba(255,255,255,0.08)', color: 'white', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>{g}</button>
        ))}
        <button style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>More ▼</button>
      </div>

      {/* Story list */}
      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: playlist.length > 0 ? 130 : 80 }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading stories...</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No stories found</div>}
        {filtered.map(story => {
          const lib = libMap[story.id]
          const progress = lib?.progress || 0
          const completed = lib?.completed || false
          const hasReviewed = reviewed.has(story.id)
          return (
            <NewStoryCard
              key={story.id}
              id={story.id}
              title={story.title}
              genre={story.genre}
              author={story.author}
              duration_mins={story.duration_mins}
              cover_url={story.cover_url}
              description={story.description}
              progress_percent={progress}
              is_completed={completed}
              has_reviewed={hasReviewed}
              avg_rating={story.avg_rating}
              review_count={story.review_count}
              series_name={story.series_name}
              series_total={story.series_total}
              series_number={story.series_number}
              episode_title={story.episode_title}
              inPlaylist={inPlaylist(story.id)}
              onAddToPlaylist={() => addToPlaylist(story)}
              onRemoveFromPlaylist={() => removeFromPlaylist(story.id)}
              onRateClick={() => setReviewed(prev => { const s = new Set(prev); s.add(story.id); return s })}
            />
          )
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1a1d26', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', zIndex: 50 }}>
        {playlist.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '7px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Tap Add to Playlist to build your queue
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{playlist.length} {playlist.length === 1 ? 'story' : 'stories'} · {totalMins} min</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playlist.map(s => s.title).join(' → ')}</div>
              </div>
              <button onClick={() => setPlaylist([])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}>Clear all</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1, background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Save to Home</button>
              <button style={{ flex: 1, background: '#f97316', color: 'white', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Play Now</button>
            </div>
          </div>
        )}
      </div>

      {/* Search overlay */}
      {showSearch && (
        <div onClick={() => setShowSearch(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#f2ede8', borderRadius: 16, width: '90%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: 12, position: 'relative' }}>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or author..." style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '10px 36px', color: '#1c1917', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#a8a29e', cursor: 'pointer', fontSize: 20 }}>×</button>}
            </div>
            <button onClick={() => setShowSearch(false)} style={{ display: 'block', width: '100%', padding: 12, background: 'none', border: 'none', color: '#a8a29e', fontSize: 13, cursor: 'pointer', textAlign: 'center' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LibraryNewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 40, height: 40, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}>
      <LibraryNewContent />
    </Suspense>
  )
}
