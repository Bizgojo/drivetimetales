'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DEFAULT_SERIES_ID = 'a3b08896-4a31-4ca7-bcaf-4ae86b1e8db5'

type Episode = {
  id: string
  title: string | null
  series_name: string | null
  episode_number: number | null
  series_number: number | null
  audio_url: string | null
  story_audio_url: string | null
  status: string | null
  is_hidden: boolean | null
}

export default function ListenSeriesPage() {
  const searchParams = useSearchParams()
  const seriesId = searchParams.get('seriesId') || DEFAULT_SERIES_ID
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadEpisodes() {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('stories')
        .select('id,title,series_name,episode_number,series_number,audio_url,story_audio_url,status,is_hidden')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true })

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
        setEpisodes([])
      } else {
        setEpisodes((data || []) as Episode[])
      }

      setLoading(false)
    }

    loadEpisodes()

    return () => {
      cancelled = true
    }
  }, [seriesId])

  const seriesTitle = useMemo(() => {
    return episodes.find((episode) => episode.series_name)?.series_name || 'Series'
  }, [episodes])

  return (
    <main style={{ minHeight: '100vh', background: '#FAF9F6', color: '#111827', padding: '24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <a href="/admin/asc" style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none' }}>
          Back to ASC
        </a>

        <header style={{ marginTop: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Private admin listening page</div>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15 }}>{seriesTitle}</h1>
          <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280', wordBreak: 'break-all' }}>
            Series ID: {seriesId}
          </div>
        </header>

        {loading ? (
          <div style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: 16 }}>
            Loading episodes...
          </div>
        ) : error ? (
          <div style={{ border: '1px solid #dc2626', background: '#fef2f2', color: '#991b1b', borderRadius: 8, padding: 16 }}>
            {error}
          </div>
        ) : episodes.length === 0 ? (
          <div style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: 16 }}>
            No episodes found for this series.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {episodes.map((episode) => {
              const audioUrl = episode.audio_url || episode.story_audio_url || ''
              const episodeNumber = episode.episode_number || episode.series_number || '?'

              return (
                <section key={episode.id} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>Episode {episodeNumber}</div>
                      <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>{episode.title || 'Untitled episode'}</h2>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {episode.status || 'unknown'} · {episode.is_hidden ? 'hidden' : 'visible'}
                    </div>
                  </div>

                  {audioUrl ? (
                    <audio controls preload="metadata" src={audioUrl} style={{ width: '100%', marginTop: 14 }} />
                  ) : (
                    <div style={{ marginTop: 14, color: '#991b1b', fontSize: 14 }}>
                      No audio URL is available for this episode.
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
