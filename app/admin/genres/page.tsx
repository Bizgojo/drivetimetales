'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Genre {
  id: string
  name: string
  slug?: string | null
  active?: boolean | null
  display_order?: number | null
  color_hex?: string | null
  description?: string | null
}

interface GenreCounts {
  primary: number
  secondary: number
  tertiary: number
  publishedPrimary?: number
}

function totalUsage(count?: GenreCounts) {
  return (count?.primary || 0) + (count?.secondary || 0) + (count?.tertiary || 0)
}

export default function AdminGenresPage() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [counts, setCounts] = useState<Record<string, GenreCounts>>({})
  const [newGenre, setNewGenre] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/genres', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load genres')
      setGenres(Array.isArray(data.genres) ? data.genres : [])
      setCounts(data.counts || {})
    } catch (err: any) {
      showMessage('error', err?.message || 'Failed to load genres')
    } finally {
      setLoading(false)
    }
  }

  async function addGenre() {
    const name = newGenre.trim()
    if (!name) return
    if (genres.some((genre) => genre.name.toLowerCase() === name.toLowerCase())) {
      showMessage('error', 'Genre already exists')
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/admin/genres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add genre')
      showMessage('success', `Added "${name}"`)
      setNewGenre('')
      await loadData()
    } catch (err: any) {
      showMessage('error', err?.message || 'Failed to add genre')
    } finally {
      setSaving(false)
    }
  }

  async function updateGenre(id: string, patch: Partial<Genre>, successMessage: string) {
    try {
      setSaving(true)
      const res = await fetch('/api/admin/genres', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update genre')
      showMessage('success', successMessage)
      await loadData()
    } catch (err: any) {
      showMessage('error', err?.message || 'Failed to update genre')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(genre: Genre) {
    const nextActive = genre.active === false
    await updateGenre(
      genre.id,
      { active: nextActive },
      `${nextActive ? 'Activated' : 'Deactivated'} "${genre.name}"`
    )
  }

  async function moveGenre(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= genres.length) return

    const current = genres[index]
    const target = genres[targetIndex]
    const currentOrder = Number(current.display_order ?? index + 1)
    const targetOrder = Number(target.display_order ?? targetIndex + 1)

    try {
      setSaving(true)
      const updates = [
        fetch('/api/admin/genres', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: current.id, display_order: targetOrder }),
        }),
        fetch('/api/admin/genres', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target.id, display_order: currentOrder }),
        }),
      ]

      const results = await Promise.all(updates)
      const failed = results.find((res) => !res.ok)
      if (failed) throw new Error(await failed.text())
      await loadData()
    } catch (err: any) {
      showMessage('error', err?.message || 'Failed to reorder genres')
    } finally {
      setSaving(false)
    }
  }

  async function deleteOrDeactivateGenre(genre: Genre) {
    const genreCounts = counts[genre.name]
    const publishedPrimary = genreCounts?.publishedPrimary || 0
    if (publishedPrimary > 0) {
      showMessage('error', `"${genre.name}" is locked because it is the primary genre for ${publishedPrimary} published stories.`)
      return
    }

    const total = totalUsage(genreCounts)
    const action = total > 0 ? 'deactivate' : 'delete'
    const prompt = total > 0
      ? `"${genre.name}" is used by ${total} stories. Deactivate it instead of deleting?`
      : `Delete "${genre.name}" permanently?`

    if (!confirm(prompt)) return

    try {
      setSaving(true)
      const res = await fetch(`/api/admin/genres?id=${encodeURIComponent(genre.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || `Failed to ${action} genre`)
      showMessage('success', data.deactivated ? `Deactivated "${genre.name}"` : `Deleted "${genre.name}"`)
      await loadData()
    } catch (err: any) {
      showMessage('error', err?.message || `Failed to ${action} genre`)
    } finally {
      setSaving(false)
    }
  }

  function showMessage(type: string, text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f5f5f5', minHeight: '100vh', color: '#000000' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '0.5rem', color: '#000000' }}>Genre Manager</h1>
        <p style={{ color: '#666666', fontSize: '14px' }}>
          Canonical genre source for admin production tools. Active genres will be used by Story Queue and Story Production V2 in later cycles.
        </p>
      </div>

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

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
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
          {saving ? 'Saving...' : '+ Add Genre'}
        </button>
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #dddddd' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666666' }}>Loading genres...</div>
        ) : genres.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666666' }}>No genres yet</div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1.4fr 1fr 80px 80px 80px 110px 100px',
                padding: '1rem',
                borderBottom: '1px solid #dddddd',
                fontWeight: 600,
                fontSize: '12px',
                color: '#333333',
                textTransform: 'uppercase',
                gap: '0.75rem',
              }}
            >
              <div>Order</div>
              <div>Genre</div>
              <div>Slug</div>
              <div style={{ textAlign: 'center' }}>Primary</div>
              <div style={{ textAlign: 'center' }}>Secondary</div>
              <div style={{ textAlign: 'center' }}>Tertiary</div>
              <div>Status</div>
              <div></div>
            </div>

            {genres.map((genre, index) => {
              const genreCounts = counts[genre.name] || { primary: 0, secondary: 0, tertiary: 0 }
              const total = totalUsage(genreCounts)
              const publishedPrimary = genreCounts.publishedPrimary || 0
              const active = genre.active !== false

              return (
                <div
                  key={genre.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1.4fr 1fr 80px 80px 80px 110px 100px',
                    alignItems: 'center',
                    padding: '1rem',
                    borderBottom: '1px solid #eeeeee',
                    gap: '0.75rem',
                    color: active ? '#000000' : '#777777',
                    backgroundColor: active ? '#ffffff' : '#f9fafb',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button disabled={saving || index === 0} onClick={() => moveGenre(index, -1)} style={{ padding: '0.25rem 0.4rem' }}>Up</button>
                    <button disabled={saving || index === genres.length - 1} onClick={() => moveGenre(index, 1)} style={{ padding: '0.25rem 0.4rem' }}>Dn</button>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{genre.name}</div>
                    <div style={{ color: '#777777', fontSize: '12px' }}>display_order: {Number(genre.display_order ?? 0)}</div>
                  </div>
                  <div style={{ color: '#666666', fontSize: '13px' }}>{genre.slug || 'pending migration'}</div>
                  <div style={{ textAlign: 'center', color: '#666666' }}>{genreCounts.primary}</div>
                  <div style={{ textAlign: 'center', color: '#666666' }}>{genreCounts.secondary}</div>
                  <div style={{ textAlign: 'center', color: '#666666' }}>{genreCounts.tertiary}</div>
                  <div>
                    <button
                      onClick={() => toggleActive(genre)}
                      disabled={saving}
                      style={{
                        border: 'none',
                        borderRadius: '999px',
                        padding: '0.35rem 0.75rem',
                        backgroundColor: active ? '#dcfce7' : '#fee2e2',
                        color: active ? '#166534' : '#991b1b',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {publishedPrimary > 0 ? (
                      <div
                        style={{ color: '#777777', fontSize: '12px', fontWeight: 600 }}
                        title={`Locked: primary genre for ${publishedPrimary} published stories`}
                      >
                        Locked
                      </div>
                    ) : (
                      <button
                        onClick={() => deleteOrDeactivateGenre(genre)}
                        disabled={saving}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          color: total > 0 ? '#f97316' : '#ff6b6b',
                          padding: '0.5rem',
                        }}
                        title={total > 0 ? 'Deactivate used genre' : 'Delete unused genre'}
                      >
                        <Trash2 size={18} />
                      </button>
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
