'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string; title: string; genre: string; author: string
  duration_mins: number; cover_url: string | null; published_on: string
  avg_rating?: number | null; review_count?: number
}

function getCredits(d: number) { return Math.max(1, Math.floor(d / 15)) }

function StarDisplay({ rating, count }: { rating: number; count?: number }) {
  return <span style={{ display: 'inline-flex', gap: '1px' }}>
    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= rating ? '#f59e0b' : '#334155', fontSize: '10px' }}>{i <= rating ? '★' : '☆'}</span>)}
    {count ? <span style={{ color: '#64748b', fontSize: '9px', marginLeft: '3px' }}>({count})</span> : null}
  </span>
}

export default function NewReleases({ excludeIds = [] }: { excludeIds?: string[] }) {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url, published_on, avg_rating, review_count')
        .not('cover_url', 'is', null).order('published_on', { ascending: false }).limit(20)
      if (!data) { setLoading(false); return }
      let ex = new Set(excludeIds)
      if (user?.id) {
        const { data: lib } = await supabase.from('user_library').select('story_id, progress, completed, not_for_me').eq('user_id', user.id)
        if (lib) lib.forEach((e: any) => { if (e.progress > 0 || e.completed || e.not_for_me) ex.add(e.story_id) })
      }
      setStories(data.filter((s: Story) => !ex.has(s.id)).slice(0, 2))
      setLoading(false)
    }
    fetch()
  }, [user?.id, excludeIds.join(',')])

  if (loading) return <section style={{ padding: '1.5rem 1rem 1rem' }}><h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>{[1,2].map(i => <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}><div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1/1', marginBottom: '0.5rem' }} /></div>)}</div></section>
  if (!stories.length) return null

  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map(s => (
          <Link key={s.id} href={`/player/${s.id}`} className="bg-slate-800 rounded-xl hover:bg-slate-700 transition" style={{ display: 'block', padding: '0.5rem', textDecoration: 'none' }}>
            <div className="rounded-lg overflow-hidden cover-glow">
              <img src={s.cover_url || '/images/default-cover.png'} alt={s.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">{s.title}</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{s.genre}</p>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>by {s.author}</p>
              <p style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>{s.duration_mins} min · {getCredits(s.duration_mins)} cr</p>
              {s.avg_rating != null && s.avg_rating > 0 && <StarDisplay rating={Math.round(s.avg_rating)} count={s.review_count} />}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
