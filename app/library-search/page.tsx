'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null
  avg_rating?: number | null; review_count?: number
}

function SearchContent() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Story[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); setSearched(false); return }
    setLoading(true); setSearched(true)
    const { data } = await supabase
      .from('story_analytics')
      .select('id, title, genre, author, duration_mins, cover_url, avg_rating, review_count')
      .or(`title.ilike.%${q}%,author.ilike.%${q}%`)
      .limit(20)
    setResults(data || [])
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div style={{ minHeight: '100dvh', background: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(148,163,184,0.06)', flexShrink: 0 }}>
        <button onClick={() => router.back()} style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#3b82f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title or author…"
            style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '10px', padding: '10px 14px 10px 36px', color: 'white', fontSize: '15px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
          {query && <button onClick={() => setQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1,2,3].map(i => <div key={i} style={{ height: '150px', background: '#1e293b', borderRadius: '14px', animation: 'pulse 1.5s infinite' }} />)}
          </div>
        )}
        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
            <p style={{ color: '#94a3b8', fontSize: '15px' }}>No stories found for "<strong>{query}</strong>"</p>
          </div>
        )}
        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ color: '#475569', fontSize: '12px', margin: '0 0 4px 2px' }}>{results.length} result{results.length !== 1 ? 's' : ''}</p>
            {results.map(story => (
              <HorizontalStoryCard
                key={story.id} id={story.id} title={story.title}
                genre={story.genre} author={story.author}
                duration_mins={story.duration_mins} cover_url={story.cover_url}
                avg_rating={story.avg_rating} review_count={story.review_count}
              />
            ))}
          </div>
        )}
        {!loading && !searched && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎧</div>
            <p style={{ color: '#475569', fontSize: '14px' }}>Search for a story or author</p>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}

export default function SearchPage() {
  return <Suspense fallback={<div style={{ height:'100dvh', background:'#020617' }} />}><SearchContent /></Suspense>
}
