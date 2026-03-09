'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Trash2 } from 'lucide-react'

interface Genre {
  id: string
  name: string
}

interface GenreCounts {
  primary: number
  secondary: number
  tertiary: number
}

export default function AdminGenresPage() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [counts, setCounts] = useState<Record<string, GenreCounts>>({})
  const [newGenre, setNewGenre] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null)

  // Load genres and count stories
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    // Fetch all genres
    const { data: genreData } = await supabase
      .from('genres')
      .select('id, name')
      .order('name', { ascending: true })

    if (genreData) {
      setGenres(genreData)
    }

    // Fetch all stories to count genre usage
    const { data: stories } = await supabase
      .from('stories')
      .select('genre, genre_secondary, genre_third')

    const newCounts: Record<string, GenreCounts> = {}

    // Initialize counts for all genres
    if (genreData) {
      genreData.forEach((g) => {
        newCounts[g.name] = { primary: 0, secondary: 0, tertiary: 0 }
      })
    }

    // Count stories
    if (stories) {
      stories.forEach((story) => {
        if (story.genre && newCounts[story.genre]) {
          newCounts[story.genre].primary++
        }
        if (story.genre_secondary && newCounts[story.genre_secondary]) {
          newCounts[story.genre_secondary].secondary++
        }
        if (story.genre_third && newCounts[story.genre_third]) {
          newCounts[story.genre_third].tertiary++
        }
      })
    }

    setCounts(newCounts)
    setLoading(false)
  }

  async function addGenre() {
    if (!newGenre.trim()) return
    if (genres.some((g) => g.name.toLowerCase() === newGenre.toLowerCase())) {
      showMessage('error', 'Genre already exists')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('genres')
      .insert([{ name: newGenre.trim() }])

    if (error) {
      showMessage('error', `Failed to add genre: ${error.message}`)
    } else {
      showMessage('success', `Added "${newGenre.trim()}"`)
      setNewGenre('')
      await loadData()
    }
    setSaving(false)
  }

  async function deleteGenre(genreName: string) {
    const count = counts[genreName]
    const total = (count?.primary || 0) + (count?.secondary || 0) + (count?.tertiary || 0)

    if (total > 0) {
      showMessage('error', `Cannot delete "${genreName}" - ${total} stories use this genre`)
      return
    }

    if (!confirm(`Delete "${genreName}" permanently?`)) return

    setSaving(true)
    const genre = genres.find((g) => g.name === genreName)
    if (!genre) return

    const { error } = await supabase.from('genres').delete().eq('id', genre.id)

    if (error) {
      showMessage('error', `Failed to delete: ${error.message}`)
    } else {
      showMessage('success', `Deleted "${genreName}"`)
      await loadData()
    }
    setSaving(false)
  }

  function showMessage(type: string, text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div style={{ padding: '2rem', backgroundColor: '#0f172a', minHeight: '100vh', color: '#ffffff' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '0.5rem' }}>🎭 Genre Manager</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Manage genres used in your library. Genres are automatically synced to Story Creation and Library filters.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '8px',
            backgroundColor: message.type === 'success' ? '#065f46' : '#7f1d1d',
            color: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            fontWeight: 500,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Add Genre Section */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '2rem',
        }}
      >
        <input
          type="text"
          value={newGenre}
          onChange={(e) => setNewGenre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGenre()}
          placeholder="Genre name..."
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            border: '1px solid #334155',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          onClick={addGenre}
          disabled={saving || !newGenre.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            backgroundColor: saving || !newGenre.trim() ? '#475569' : '#f97316',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: saving || !newGenre.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Adding...' : '+ Add Genre'}
        </button>
      </div>

      {/* Genres List */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading genres...</div>
        ) : genres.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No genres yet</div>
        ) : (
          <>
            {/* Headers */}
            <div
              style={{
                display: 'flex',
                padding: '1rem',
                borderBottom: '1px solid #334155',
                fontWeight: 600,
                fontSize: '12px',
                color: '#94a3b8',
                textTransform: 'uppercase',
              }}
            >
              <div style={{ flex: 1 }}>Genre</div>
              <div style={{ width: '80px', textAlign: 'center' }}>Primary</div>
              <div style={{ width: '80px', textAlign: 'center' }}>Secondary</div>
              <div style={{ width: '80px', textAlign: 'center' }}>Tertiary</div>
              <div style={{ width: '50px' }}></div>
            </div>

            {/* Genre Rows */}
            {genres.map((genre) => {
              const genreCounts = counts[genre.name] || { primary: 0, secondary: 0, tertiary: 0 }
              const total = genreCounts.primary + genreCounts.secondary + genreCounts.tertiary
              const canDelete = total === 0

              return (
                <div
                  key={genre.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '1rem',
                    borderBottom: '1px solid #334155',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{genre.name}</div>
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#94a3b8' }}>
                    {genreCounts.primary}
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#94a3b8' }}>
                    {genreCounts.secondary}
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#94a3b8' }}>
                    {genreCounts.tertiary}
                  </div>
                  <div style={{ width: '50px', textAlign: 'center' }}>
                    {canDelete ? (
                      <button
                        onClick={() => deleteGenre(genre.name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#f97316',
                          padding: '0.5rem',
                        }}
                        title="Delete genre"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '12px' }} title="Cannot delete - stories use this genre">
                        🔒
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
