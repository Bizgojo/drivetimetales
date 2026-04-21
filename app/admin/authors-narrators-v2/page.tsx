'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Author = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  narrative_voice?: string | null
  style_reference?: string | null
  style_description?: string | null
  narrator_name?: string | null
  sort_order?: number | null
}

export default function AuthorsNarratorsV2Page() {
  const [grouped, setGrouped] = useState<Record<string, Author[]>>({})
  const [genres, setGenres] = useState<string[]>([])
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const res = await fetch('/api/admin/featured-authors')
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load featured authors')
        if (!ignore) {
          setGrouped(data.grouped || {})
          setGenres(data.genres || [])
        }
      } catch (e: any) {
        if (!ignore) setError(e.message || 'Unknown error')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  const visibleGenres = useMemo(() => {
    if (selectedGenre === 'All') return genres
    return genres.filter((g) => g === selectedGenre)
  }, [genres, selectedGenre])

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6', padding: '32px 28px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <Link href="/admin" style={{ textDecoration: 'none', background: '#e5e7eb', color: '#111827', padding: '10px 16px', borderRadius: 12, fontWeight: 700 }}>
            ← Back
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#111827' }}>Authors & Narrators V2</h1>
            <div style={{ color: '#6b7280', marginTop: 6 }}>{genres.length} genres · curated trios</div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              background: 'white',
              color: '#111827',
              fontSize: 14,
              minWidth: 220,
            }}
          >
            <option value="All">All</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ color: '#374151' }}>Loading featured authors…</div>
        ) : error ? (
          <div style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedAuthor ? '1.3fr 0.9fr' : '1fr', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {visibleGenres.map((genre) => (
                <div key={genre}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    {genre}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {(grouped[genre] || []).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAuthor(a)}
                        style={{
                          textAlign: 'left',
                          background: 'white',
                          border: selectedAuthor?.id === a.id ? '2px solid #f97316' : '1px solid #d1d5db',
                          borderRadius: 16,
                          padding: 16,
                          cursor: 'pointer',
                          boxShadow: selectedAuthor?.id === a.id ? '0 10px 24px rgba(249,115,22,0.14)' : 'none',
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 18, color: '#111827', marginBottom: 6 }}>{a.name}</div>
                        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
                          {(a.primary_genre || 'Unknown')}{a.secondary_genre ? ` · ${a.secondary_genre}` : ''}
                        </div>
                        <div style={{ color: '#374151', fontSize: 13, marginBottom: 8 }}>✍️ {a.style_reference || 'Not set'}</div>
                        <div style={{ color: '#f97316', fontSize: 13, fontWeight: 700 }}>🎙 {a.narrator_name || 'Not assigned'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedAuthor ? (
              <div style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 18, padding: 24, alignSelf: 'start' }}>
                <div style={{ fontWeight: 900, fontSize: 24, color: '#111827', marginBottom: 8 }}>{selectedAuthor.name}</div>
                <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 18 }}>
                  {(selectedAuthor.primary_genre || 'Unknown')}{selectedAuthor.secondary_genre ? ` · ${selectedAuthor.secondary_genre}` : ''}
                </div>

                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Real Author Style
                  </div>
                  <div style={{ color: '#111827', fontWeight: 800 }}>{selectedAuthor.style_reference || 'Not set'}</div>
                </div>

                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Style Description
                  </div>
                  <div style={{ color: '#111827', lineHeight: 1.6 }}>
                    {selectedAuthor.style_description || 'No style description yet.'}
                  </div>
                </div>

                <div style={{ background: '#fff7ed', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ color: '#9a3412', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Paired Narrator
                  </div>
                  <div style={{ color: '#c2410c', fontWeight: 800 }}>{selectedAuthor.narrator_name || 'Not assigned'}</div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
