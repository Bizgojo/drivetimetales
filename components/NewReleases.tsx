'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  published_on: string
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

export default function NewReleases() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNewReleases() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, published_on')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })
          .limit(2)

        if (error) {
          console.error('Error fetching new releases:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchNewReleases:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchNewReleases()
  }, [])

  if (loading) {
    return (
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-slate-800 rounded-xl" style={{ padding: '0.5rem' }}>
              <div className="rounded-lg bg-slate-700" style={{ aspectRatio: '1 / 1', marginBottom: '0.5rem' }} />
              <div className="bg-slate-700 rounded" style={{ height: '0.75rem', marginBottom: '0.25rem' }} />
              <div className="bg-slate-700 rounded" style={{ height: '0.5rem', width: '66%' }} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (stories.length === 0) {
    return null
  }

  return (
    <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>🆕 NEW RELEASES</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {stories.map((story) => (
          <Link 
            key={story.id} 
            href={`/player/${story.id}`}
            className="bg-slate-800 rounded-xl hover:bg-slate-700 transition"
            style={{ display: 'block', padding: '0.5rem' }}
          >
            <div className="rounded-lg overflow-hidden cover-glow">
              <img 
                src={story.cover_url || '/images/default-cover.png'} 
                alt={story.title}
                className="object-cover"
                style={{ width: '100%', aspectRatio: '1 / 1' }}
              />
            </div>
            
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                {story.title}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{story.genre}</p>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>by {story.author}</p>
              <p style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 600 }}>
                {story.duration_mins} min • {getCredits(story.duration_mins)} cr
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{formatDate(story.published_on)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
