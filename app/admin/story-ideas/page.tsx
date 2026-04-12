'use client'

import { useState, useEffect } from 'react'

interface StoryIdea {
  id: string
  user_id: string | null
  name: string
  email: string
  subject: string
  message: string
  status: 'new' | 'read' | 'answered'
  created_at: string
  // parsed from message JSON
  genre?: string
  title?: string
  idea?: string
  wordCount?: number
}

type FilterType = 'all' | 'new' | 'read' | 'answered'

function parseIdea(raw: StoryIdea): StoryIdea {
  try {
    const parsed = JSON.parse(raw.message)
    return { ...raw, genre: parsed.genre, title: parsed.title, idea: parsed.idea, wordCount: parsed.wordCount }
  } catch {
    return { ...raw, title: raw.subject.replace('[Story Idea] ', ''), idea: raw.message }
  }
}

export default function StoryIdeasPage() {
  const [ideas, setIdeas] = useState<StoryIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<StoryIdea | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => { fetchIdeas() }, [])

  async function fetchIdeas() {
    setLoading(true)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const res = await fetch(
      `${url}/rest/v1/support_messages?subject=like.*%5BStory+Idea%5D*&order=created_at.desc&select=*`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    if (res.ok) {
      const data: StoryIdea[] = await res.json()
      setIdeas(data.map(parseIdea))
    }
    setLoading(false)
  }

  async function setStatus(id: string, newStatus: 'read' | 'answered') {
    setUpdating(id)
    const res = await fetch('/api/admin/support/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    if (res.ok) {
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: newStatus } : null)
      showToast(newStatus === 'answered' ? '✅ Marked as selected' : '👁 Marked as reviewed')
    } else {
      showToast('Error updating — try again')
    }
    setUpdating(null)
  }

  async function deleteIdea(id: string) {
    if (!confirm('Delete this submission?')) return
    setUpdating(id)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const res = await fetch(
      `${url}/rest/v1/support_messages?id=eq.${id}`,
      {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
      }
    )
    if (res.ok) {
      setIdeas(prev => prev.filter(i => i.id !== id))
      if (selected?.id === id) setSelected(null)
      showToast('🗑 Submission deleted')
    } else {
      showToast('Delete failed — try again')
    }
    setUpdating(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = ideas.filter(i => filter === 'all' || i.status === filter)
  const counts = {
    all: ideas.length,
    new: ideas.filter(i => i.status === 'new').length,
    read: ideas.filter(i => i.status === 'read').length,
    answered: ideas.filter(i => i.status === 'answered').length,
  }

  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    new:      { bg: '#fef2f2', color: '#dc2626', label: 'New' },
    read:     { bg: '#fef9c3', color: '#ca8a04', label: 'Reviewed' },
    answered: { bg: '#dcfce7', color: '#16a34a', label: 'Selected' },
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f6', padding: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '0.875rem', zIndex: 1000 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', margin: 0 }}>
          💡 Story Idea Submissions
          <span style={{ display: 'inline-block', background: counts.new > 0 ? '#dc2626' : '#94a3b8', color: '#fff', borderRadius: '20px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700, marginLeft: '10px' }}>
            {counts.new} new
          </span>
        </h1>
        <p style={{ color: '#666', marginTop: '4px', fontSize: '0.9rem' }}>
          Review story ideas submitted by subscribers. Selected ideas earn the subscriber a story credit + 1 free week.
        </p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['all', 'new', 'read', 'answered'] as FilterType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              background: filter === tab ? '#f97316' : '#e2e8f0',
              color: filter === tab ? '#fff' : '#475569',
              fontWeight: filter === tab ? 700 : 400,
              fontSize: '0.85rem',
            }}
          >
            {tab === 'all' ? 'All' : tab === 'new' ? '🔴 New' : tab === 'read' ? '👁 Reviewed' : '✅ Selected'} ({counts[tab]})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Loading submissions…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
          <div>No {filter !== 'all' ? filter : ''} submissions yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* List */}
          <div style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {filtered.map(idea => {
              const sc = statusColors[idea.status]
              const isActive = selected?.id === idea.id
              return (
                <div
                  key={idea.id}
                  onClick={() => {
                    setSelected(idea)
                    if (idea.status === 'new') setStatus(idea.id, 'read')
                  }}
                  style={{
                    padding: '1rem',
                    background: isActive ? '#fff7ed' : '#fff',
                    border: `2px solid ${isActive ? '#f97316' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 700, color: '#111', fontSize: '0.9rem', flex: 1, paddingRight: '8px' }}>
                      {idea.title || 'Untitled'}
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#f97316', fontWeight: 600, marginBottom: '2px' }}>{idea.genre || '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: '#666' }}>{idea.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#999', marginTop: '4px' }}>{formatDate(idea.created_at)}</div>
                </div>
              )
            })}
          </div>

          {/* Detail */}
          <div style={{ flex: 1 }}>
            {selected ? (
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111', marginBottom: '4px' }}>{selected.title}</div>
                      <div style={{ fontSize: '0.85rem', color: '#f97316', fontWeight: 600 }}>{selected.genre}</div>
                    </div>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 700, padding: '4px 12px', borderRadius: '20px',
                      background: statusColors[selected.status].bg, color: statusColors[selected.status].color
                    }}>
                      {statusColors[selected.status].label}
                    </span>
                  </div>
                </div>

                {/* Submitter */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '2rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>From</div>
                    <div style={{ fontWeight: 600, color: '#111', fontSize: '0.9rem' }}>{selected.name}</div>
                    <div style={{ color: '#555', fontSize: '0.82rem' }}>{selected.email}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Submitted</div>
                    <div style={{ color: '#111', fontSize: '0.85rem' }}>{formatDate(selected.created_at)}</div>
                  </div>
                  {selected.wordCount && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Word Count</div>
                      <div style={{ color: '#111', fontSize: '0.85rem' }}>{selected.wordCount} words</div>
                    </div>
                  )}
                </div>

                {/* Story Idea */}
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.75rem' }}>Story Idea</div>
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
                    <p style={{ color: '#333', fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>{selected.idea}</p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {selected.status !== 'answered' && (
                    <button
                      onClick={() => setStatus(selected.id, 'answered')}
                      disabled={updating === selected.id}
                      style={{
                        padding: '10px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                        opacity: updating === selected.id ? 0.6 : 1,
                      }}
                    >
                      ✅ Mark as Selected
                    </button>
                  )}
                  {selected.status === 'answered' && (
                    <button
                      onClick={() => setStatus(selected.id, 'read')}
                      disabled={updating === selected.id}
                      style={{
                        padding: '10px 22px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer',
                        background: '#fff', color: '#555', fontWeight: 600, fontSize: '0.875rem',
                        opacity: updating === selected.id ? 0.6 : 1,
                      }}
                    >
                      ↩ Unmark Selected
                    </button>
                  )}
                  <a
                    href={`mailto:${selected.email}?subject=Your Story Idea — ${encodeURIComponent(selected.title || '')}&body=Hi ${encodeURIComponent(selected.name)},%0A%0AWe loved your story idea "${encodeURIComponent(selected.title || '')}"!`}
                    style={{
                      padding: '10px 22px', borderRadius: '8px', textDecoration: 'none',
                      background: '#f97316', color: '#000', fontWeight: 700, fontSize: '0.875rem', display: 'inline-block',
                    }}
                  >
                    📧 Email Subscriber
                  </a>
                  <button
                    onClick={() => deleteIdea(selected.id)}
                    disabled={updating === selected.id}
                    style={{
                      padding: '10px 22px', borderRadius: '8px', border: '1px solid #fca5a5', cursor: 'pointer',
                      background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: '0.875rem', marginLeft: 'auto',
                      opacity: updating === selected.id ? 0.6 : 1,
                    }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4rem', textAlign: 'center', color: '#888' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
                Select a submission to review it
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
