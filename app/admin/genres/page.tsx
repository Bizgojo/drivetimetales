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
    <div style={{ padding: '2rem', backgroundColor: '#f5f5f5', minHeight: '100vh', color: '#000000' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '0.5rem', color: '#000000' }}>🎭 Genre Manager</h1>
        <p style={{ color: '#666666', fontSize: '14px' }}>
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
            backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: message.type === 'success' ? '#065f46' : '#7f1d1d',
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
            border: '1px solid #cccccc',
            backgroundColor: '#ffffff',
            color: '#000000',
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
            backgroundColor: saving || !newGenre.trim() ? '#cccccc' : '#f97316',
            color: saving || !newGenre.trim() ? '#666666' : '#ffffff',
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
      <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #dddddd' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666666' }}>Loading genres...</div>
        ) : genres.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666666' }}>No genres yet</div>
        ) : (
          <>
            {/* Headers */}
            <div
              style={{
                display: 'flex',
                padding: '1rem',
                borderBottom: '1px solid #dddddd',
                fontWeight: 600,
                fontSize: '12px',
                color: '#333333',
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
                    borderBottom: '1px solid #eeeeee',
                    gap: '1rem',
                    color: '#000000',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: '#000000' }}>{genre.name}</div>
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#666666' }}>
                    {genreCounts.primary}
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#666666' }}>
                    {genreCounts.secondary}
                  </div>
                  <div style={{ width: '80px', textAlign: 'center', color: '#666666' }}>
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
                          color: '#ff6b6b',
                          padding: '0.5rem',
                        }}
                        title="Delete genre"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <div style={{ color: '#999999', fontSize: '12px' }} title="Cannot delete - stories use this genre">
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
