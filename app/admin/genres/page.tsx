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

export default function AdminGenresPage() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [newGenreName, setNewGenreName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadGenres()
  }, [])

  async function loadGenres() {
    setLoading(true)
    const { data, error } = await supabase
      .from('genres')
      .select('*')
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error loading genres:', error)
      showMessage('error', 'Failed to load genres')
    } else {
      setGenres(data || [])
    }
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
      console.error('Error adding genre:', error)
      showMessage('error', `Failed to add genre: ${error.message}`)
    } else {
      setNewGenreName('')
      showMessage('success', `Added "${name}"`)
      await loadGenres()
    }
    setSaving(false)
  }

  async function toggleActive(genre: Genre) {
    const { error } = await supabase
      .from('genres')
      .update({ active: !genre.active })
      .eq('id', genre.id)

    if (error) {
      showMessage('error', 'Failed to update genre')
    } else {
      showMessage('success', `${genre.name} ${genre.active ? 'deactivated' : 'activated'}`)
      await loadGenres()
    }
  }

  async function saveEdit(id: string) {
    const name = editName.trim()
    if (!name) return

    if (genres.some(g => g.name.toLowerCase() === name.toLowerCase() && g.id !== id)) {
      showMessage('error', 'Genre name already exists')
      return
    }

    const { error } = await supabase
      .from('genres')
      .update({ name })
      .eq('id', id)

    if (error) {
      showMessage('error', 'Failed to rename genre')
    } else {
      setEditingId(null)
      showMessage('success', `Renamed to "${name}"`)
      await loadGenres()
    }
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
    const hasError = results.some(r => r.error)

    if (hasError) {
      showMessage('error', 'Failed to reorder')
    } else {
      await loadGenres()
    }
  }

  async function deleteGenre(genre: Genre) {
    if (!confirm(`Delete "${genre.name}" permanently?\n\nThis cannot be undone. Stories using this genre will need to be updated.`)) {
      return
    }

    const { error } = await supabase
      .from('genres')
      .delete()
      .eq('id', genre.id)

    if (error) {
      showMessage('error', `Failed to delete: ${error.message}`)
    } else {
      showMessage('success', `Deleted "${genre.name}"`)
      await loadGenres()
    }
  }

  const activeGenres = genres.filter(g => g.active)
  const inactiveGenres = genres.filter(g => !g.active)

  return (
    <div style={{ padding: '2rem', color: '#1e293b' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>🎭 Genre Manager</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Manage genres for DTT Library and ADM publishing. {activeGenres.length} active, {inactiveGenres.length} inactive.
          </p>
        </div>
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
        <>
          {/* Active Genres */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>
              Active Genres ({activeGenres.length})
            </h2>

            {activeGenres.length === 0 ? (
              <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No active genres</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activeGenres.map((genre, index) => (
                  <div
                    key={genre.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {/* Order number */}
                    <span style={{ color: '#94a3b8', fontSize: '13px', width: '24px', textAlign: 'center' }}>
                      {index + 1}
                    </span>

                    {/* Move buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        onClick={() => moveGenre(genre.id, 'up')}
                        disabled={index === 0}
                        style={{
                          background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer',
                          fontSize: '12px', opacity: index === 0 ? 0.3 : 1, padding: '0',
                        }}
                      >▲</button>
                      <button
                        onClick={() => moveGenre(genre.id, 'down')}
                        disabled={index === activeGenres.length - 1}
                        style={{
                          background: 'none', border: 'none',
                          cursor: index === activeGenres.length - 1 ? 'default' : 'pointer',
                          fontSize: '12px', opacity: index === activeGenres.length - 1 ? 0.3 : 1, padding: '0',
                        }}
                      >▼</button>
                    </div>

                    {/* Name (editable) */}
                    <div style={{ flex: 1 }}>
                      {editingId === genre.id ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(genre.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            style={{
                              flex: 1, padding: '0.3rem 0.6rem', borderRadius: '4px',
                              border: '1px solid #f97316', fontSize: '14px', outline: 'none',
                            }}
                          />
                          <button onClick={() => saveEdit(genre.id)} style={{
                            padding: '0.3rem 0.75rem', borderRadius: '4px', backgroundColor: '#22c55e',
                            color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px',
                          }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{
                            padding: '0.3rem 0.75rem', borderRadius: '4px', backgroundColor: '#e2e8f0',
                            border: 'none', cursor: 'pointer', fontSize: '13px',
                          }}>Cancel</button>
                        </div>
                      ) : (
                        <span
                          style={{ fontSize: '16px', fontWeight: 600, color: '#000000', cursor: 'pointer' }}
                          onDoubleClick={() => { setEditingId(genre.id); setEditName(genre.name) }}
                          title="Double-click to rename"
                        >
                          {genre.name}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <button
                      onClick={() => { setEditingId(genre.id); setEditName(genre.name) }}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: '4px', backgroundColor: '#e2e8f0',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                      }}
                    >✏️ Rename</button>

                    <button
                      onClick={() => toggleActive(genre)}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: '4px', backgroundColor: '#fef3c7',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                      }}
                    >⏸ Deactivate</button>

                    <button
                      onClick={() => deleteGenre(genre)}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: '4px', backgroundColor: '#fee2e2',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                      }}
                    >🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive Genres */}
          {inactiveGenres.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#64748b', marginBottom: '1rem' }}>
                Inactive Genres ({inactiveGenres.length})
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {inactiveGenres.map((genre) => (
                  <div
                    key={genre.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: '#f1f5f9',
                      border: '1px dashed #cbd5e1',
                      opacity: 0.7,
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '14px', color: '#64748b', textDecoration: 'line-through' }}>
                      {genre.name}
                    </span>

                    <button
                      onClick={() => toggleActive(genre)}
                      style={{
                        padding: '0.3rem 0.75rem', borderRadius: '4px', backgroundColor: '#dcfce7',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                      }}
                    >▶ Reactivate</button>

                    <button
                      onClick={() => deleteGenre(genre)}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: '4px', backgroundColor: '#fee2e2',
                        border: 'none', cursor: 'pointer', fontSize: '12px',
                      }}
                    >🗑</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
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
        <strong>How it works:</strong> Active genres appear in the DTT Library filter and ADM publish dropdowns.
        Deactivated genres are hidden but preserved. Stories already tagged with a deactivated genre keep their tag.
        Double-click a name to rename it. Use ▲▼ to change display order.
      </div>
    </div>
  )
}
