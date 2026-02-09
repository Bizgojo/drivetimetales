'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Genre {
  id: string
  name: string
  display_order: number
  active: boolean
  created_at: string
}

interface GenreCounts {
  primary: number
  secondary: number
  third: number
  total: number
}

export default function AdminGenresPage() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [genreCounts, setGenreCounts] = useState<Record<string, GenreCounts>>({})
  const [loading, setLoading] = useState(true)
  const [newGenreName, setNewGenreName] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadGenresAndCounts()
  }, [])

  async function loadGenresAndCounts() {
    setLoading(true)

    const { data: genreData, error: genreError } = await supabase
      .from('genres')
      .select('*')
      .eq('active', true)
      .order('display_order', { ascending: true })

    if (genreError) {
      showMessage('error', 'Failed to load genres')
      setLoading(false)
      return
    }

    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('genre, genre_secondary, genre_third')

    const counts: Record<string, GenreCounts> = {}

    if (genreData) {
      for (const g of genreData) {
        counts[g.name] = { primary: 0, secondary: 0, third: 0, total: 0 }
      }
    }

    if (stories && !storiesError) {
      for (const story of stories) {
        if (story.genre && counts[story.genre]) {
          counts[story.genre].primary++
          counts[story.genre].total++
        }
        if (story.genre_secondary && counts[story.genre_secondary]) {
          counts[story.genre_secondary].secondary++
          counts[story.genre_secondary].total++
        }
        if (story.genre_third && counts[story.genre_third]) {
          counts[story.genre_third].third++
          counts[story.genre_third].total++
        }
      }
    }

    setGenres(genreData || [])
    setGenreCounts(counts)
    setLoading(false)
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  async function addGenre() {
    const name = newGenreName.trim()
    if (!name) return

    if (genres.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      showMessage('error', 'Genre already exists')
      return
    }

    setSaving(true)
    const maxOrder = genres.length > 0 ? Math.max(...genres.map(g => g.display_order)) : 0

    const { error } = await supabase
      .from('genres')
      .insert({ name, display_order: maxOrder + 1, active: true })

    if (error) {
      showMessage('error', `Failed to add genre: ${error.message}`)
    } else {
      setNewGenreName('')
      showMessage('success', `Added "${name}"`)
      await loadGenresAndCounts()
    }
    setSaving(false)
  }

  async function moveGenre(id: string, direction: 'up' | 'down') {
    const index = genres.findIndex(g => g.id === id)
    if (index === -1) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === genres.length - 1) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const current = genres[index]
    const swap = genres[swapIndex]

    const updates = [
      supabase.from('genres').update({ display_order: swap.display_order }).eq('id', current.id),
      supabase.from('genres').update({ display_order: current.display_order }).eq('id', swap.id),
    ]

    const results = await Promise.all(updates)
    if (results.some(r => r.error)) {
      showMessage('error', 'Failed to reorder')
    } else {
      await loadGenresAndCounts()
    }
  }

  async function deleteGenre(genre: Genre) {
    const counts = genreCounts[genre.name]
    if (counts && counts.primary > 0) {
      showMessage('error', `Cannot delete "${genre.name}" — ${counts.primary} ${counts.primary === 1 ? 'story uses' : 'stories use'} it as primary genre. Reassign them first.`)
      return
    }

    const warningParts = []
    if (counts && counts.secondary > 0) warningParts.push(`${counts.secondary} as secondary`)
    if (counts && counts.third > 0) warningParts.push(`${counts.third} as third`)

    let confirmMsg = `Delete "${genre.name}" permanently?`
    if (warningParts.length > 0) {
      confirmMsg += `\n\nNote: ${warningParts.join(' and ')} ${warningParts.length === 1 ? 'story still uses' : 'stories still use'} this genre. Those fields will be cleared.`
    }
    confirmMsg += '\n\nThis cannot be undone.'

    if (!confirm(confirmMsg)) return

    const { error } = await supabase
      .from('genres')
      .delete()
      .eq('id', genre.id)

    if (error) {
      showMessage('error', `Failed to delete: ${error.message}`)
    } else {
      showMessage('success', `Deleted "${genre.name}"`)
      await loadGenresAndCounts()
    }
  }

  return (
    <div style={{ padding: '2rem', color: '#000000' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#000000' }}>🎭 Genre Manager</h1>
        <p style={{ color: '#475569', fontSize: '14px', marginTop: '4px' }}>
          {genres.length} genres. Story counts update automatically.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: message.type === 'success' ? '#166534' : '#991b1b',
          fontWeight: 500,
        }}>
          {message.text}
        </div>
      )}

      {/* Add New Genre */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={newGenreName}
          onChange={(e) => setNewGenreName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGenre()}
          placeholder="New genre name..."
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            outline: 'none',
            color: '#000000',
            backgroundColor: '#ffffff',
          }}
        />
        <button
          onClick={addGenre}
          disabled={saving || !newGenreName.trim()}
          style={{
            padding: '0.6rem 1.5rem',
            borderRadius: '8px',
            backgroundColor: saving || !newGenreName.trim() ? '#9ca3af' : '#f97316',
            color: 'white',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: saving || !newGenreName.trim() ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Adding...' : '+ Add Genre'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading genres...</div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          {/* Column Headers */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0 1rem 0.75rem 1rem',
            borderBottom: '2px solid #e2e8f0',
            marginBottom: '0.5rem',
          }}>
            <span style={{ width: '24px' }}></span>
            <span style={{ width: '40px' }}></span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Genre</span>
            <span style={{ width: '70px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Primary</span>
            <span style={{ width: '70px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>2nd</span>
            <span style={{ width: '70px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>3rd</span>
            <span style={{ width: '70px', fontSize: '12px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', textAlign: 'center' }}>Total</span>
            <span style={{ width: '50px' }}></span>
          </div>

          {genres.length === 0 ? (
            <p style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem' }}>No genres yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {genres.map((genre, index) => {
                const counts = genreCounts[genre.name] || { primary: 0, secondary: 0, third: 0, total: 0 }
                const canDelete = counts.primary === 0

                return (
                  <div
                    key={genre.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.6rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: index % 2 === 0 ? '#f8fafc' : '#ffffff',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    {/* Order number */}
                    <span style={{ color: '#94a3b8', fontSize: '13px', width: '24px', textAlign: 'center' }}>
                      {index + 1}
                    </span>

                    {/* Move buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '40px', alignItems: 'center' }}>
                      <button
                        onClick={() => moveGenre(genre.id, 'up')}
                        disabled={index === 0}
                        style={{
                          background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer',
                          fontSize: '11px', opacity: index === 0 ? 0.2 : 0.7, padding: '0', lineHeight: '1',
                        }}
                      >▲</button>
                      <button
                        onClick={() => moveGenre(genre.id, 'down')}
                        disabled={index === genres.length - 1}
                        style={{
                          background: 'none', border: 'none',
                          cursor: index === genres.length - 1 ? 'default' : 'pointer',
                          fontSize: '11px', opacity: index === genres.length - 1 ? 0.2 : 0.7, padding: '0', lineHeight: '1',
                        }}
                      >▼</button>
                    </div>

                    {/* Genre Name */}
                    <span style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: '#000000' }}>
                      {genre.name}
                    </span>

                    {/* Counts */}
                    <span style={{ width: '70px', textAlign: 'center', fontSize: '14px', fontWeight: 500, color: counts.primary > 0 ? '#000000' : '#cbd5e1' }}>
                      {counts.primary}
                    </span>
                    <span style={{ width: '70px', textAlign: 'center', fontSize: '14px', fontWeight: 500, color: counts.secondary > 0 ? '#000000' : '#cbd5e1' }}>
                      {counts.secondary}
                    </span>
                    <span style={{ width: '70px', textAlign: 'center', fontSize: '14px', fontWeight: 500, color: counts.third > 0 ? '#000000' : '#cbd5e1' }}>
                      {counts.third}
                    </span>
                    <span style={{ width: '70px', textAlign: 'center', fontSize: '15px', fontWeight: 700, color: counts.total > 0 ? '#f97316' : '#cbd5e1' }}>
                      {counts.total}
                    </span>

                    {/* Delete */}
                    <button
                      onClick={() => deleteGenre(genre)}
                      disabled={!canDelete}
                      title={canDelete ? 'Delete genre' : `Cannot delete — ${counts.primary} stories use this as primary genre`}
                      style={{
                        width: '50px',
                        padding: '0.3rem',
                        borderRadius: '4px',
                        backgroundColor: canDelete ? '#fee2e2' : '#f1f5f9',
                        border: 'none',
                        cursor: canDelete ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        opacity: canDelete ? 1 : 0.3,
                        textAlign: 'center',
                      }}
                    >🗑</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        backgroundColor: '#eff6ff',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#1e40af',
      }}>
        <strong>How it works:</strong> Genres appear in DTT Library filters and ADM publish dropdowns.
        Use ▲▼ to change display order. The 🗑 button is disabled when stories use that genre as their primary.
        Assign genres to stories on the Stories tab.
      </div>
    </div>
  )
}
