'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface LandingStory {
  id: string
  title: string
  subtitle: string | null
  cover_url: string | null
  audio_url: string | null
  duration_mins: number
  sort_order: number
  active: boolean
  created_at: string
}

const EMPTY_FORM = {
  title: '',
  subtitle: '',
  cover_url: '',
  audio_url: '',
  duration_mins: 15,
  sort_order: 0,
  active: true,
}

export default function LandingStoriesPage() {
  const router = useRouter()
  const [stories, setStories] = useState<LandingStory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'
  const ember = '#e8520a'

  useEffect(() => { fetchStories() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchStories() {
    setLoading(true)
    const { data } = await supabase
      .from('landing_stories')
      .select('*')
      .order('sort_order', { ascending: true })
    if (data) setStories(data)
    setLoading(false)
  }

  function openNew() {
    setForm({ ...EMPTY_FORM, sort_order: stories.length })
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(story: LandingStory) {
    setForm({
      title: story.title,
      subtitle: story.subtitle || '',
      cover_url: story.cover_url || '',
      audio_url: story.audio_url || '',
      duration_mins: story.duration_mins,
      sort_order: story.sort_order,
      active: story.active,
    })
    setEditingId(story.id)
    setShowForm(true)
  }

  async function saveStory() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      cover_url: form.cover_url.trim() || null,
      audio_url: form.audio_url.trim() || null,
      duration_mins: form.duration_mins,
      sort_order: form.sort_order,
      active: form.active,
    }
    if (editingId) {
      await supabase.from('landing_stories').update(payload).eq('id', editingId)
      showToast('Story updated')
    } else {
      await supabase.from('landing_stories').insert(payload)
      showToast('Story added')
    }
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaving(false)
    fetchStories()
  }

  async function toggleActive(story: LandingStory) {
    await supabase.from('landing_stories').update({ active: !story.active }).eq('id', story.id)
    setStories(s => s.map(st => st.id === story.id ? { ...st, active: !st.active } : st))
  }

  async function deleteStory(id: string) {
    await supabase.from('landing_stories').delete().eq('id', id)
    setDeleteConfirmId(null)
    showToast('Story deleted')
    fetchStories()
  }

  async function moveStory(id: string, dir: 'up' | 'down') {
    const idx = stories.findIndex(s => s.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= stories.length) return
    const a = stories[idx]
    const b = stories[swapIdx]
    await Promise.all([
      supabase.from('landing_stories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('landing_stories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    fetchStories()
  }

  function generateHTML() {
    const active = stories.filter(s => s.active)
    const html = active.map((s, idx) => {
      const coverHtml = s.cover_url
        ? `<img src="${s.cover_url}" alt="${s.title}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;background:#1a1a1a;">🎧</div>`
      return `  <div class="story-card">
    <div class="story-cover" style="position:relative;">
      ${coverHtml}
      <button class="cover-play" onclick="toggleStory(${idx})" id="playbtn${idx}">
        <span id="playbtnicon${idx}">▶</span> <span id="playbtntxt${idx}">Play Now</span>
      </button>
    </div>
    <div class="story-info">
      <div class="story-title">${s.title}</div>
      <div class="story-sub">${s.subtitle || ''}</div>
      <div class="story-meta">${s.duration_mins} min</div>
    </div>
    <div class="progress-bar"><div id="bar${idx}" style="height:100%;width:0%;background:#e8520a;border-radius:2px;transition:width .3s;"></div></div>
  </div>`
    }).join('\n')
    navigator.clipboard.writeText(html)
    showToast('HTML copied to clipboard — paste into index.html')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: `4px solid ${ember}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', backgroundColor: '#1a1a1a', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '8px', zIndex: 9999, fontSize: '14px', fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <div>
            <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Landing Page Stories</h1>
            <p style={{ color: textSecondary, fontSize: '13px', marginTop: '2px' }}>Manage the 3 sample stories shown on endless-tales.com</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={generateHTML} style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
            📋 Copy HTML
          </button>
          <button onClick={openNew} style={{ backgroundColor: ember, color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
            + Add Story
          </button>
        </div>
      </div>

      {/* Info box */}
      <div style={{ backgroundColor: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
        <strong>How to publish changes:</strong> Edit stories here → click <strong>Copy HTML</strong> → paste the copied HTML into <code>index.html</code> replacing the existing story cards → commit and push to GitHub.
      </div>

      {/* Stories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {stories.map((story, idx) => (
          <div key={story.id} style={{ backgroundColor: cardBg, borderRadius: '12px', border: `2px solid ${story.active ? border : '#e5e5e5'}`, overflow: 'hidden', opacity: story.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>

              {/* Cover preview */}
              <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {story.cover_url
                  ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '32px' }}>🎧</span>
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: textPrimary, fontWeight: 700, fontSize: '16px' }}>{story.title}</span>
                  <span style={{ backgroundColor: story.active ? '#dcfce7' : '#f5f5f5', color: story.active ? '#16a34a' : textSecondary, padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                    {story.active ? 'Active' : 'Hidden'}
                  </span>
                </div>
                <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '0.25rem' }}>{story.subtitle || '—'}</div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '12px', color: textSecondary }}>
                  <span>⏱ {story.duration_mins} min</span>
                  <span>{story.audio_url ? '🔊 Has audio' : '⚠️ No audio'}</span>
                  <span>#{story.sort_order + 1}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => moveStory(story.id, 'up')} disabled={idx === 0}
                    style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: idx === 0 ? '#ccc' : textPrimary, cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>↑</button>
                  <button onClick={() => moveStory(story.id, 'down')} disabled={idx === stories.length - 1}
                    style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: idx === stories.length - 1 ? '#ccc' : textPrimary, cursor: idx === stories.length - 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>↓</button>
                </div>
                <button onClick={() => openEdit(story)}
                  style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>✏️ Edit</button>
                <button onClick={() => toggleActive(story)}
                  style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', backgroundColor: story.active ? '#fee2e2' : '#dcfce7', color: story.active ? '#dc2626' : '#16a34a', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                  {story.active ? 'Hide' : 'Show'}
                </button>
                {deleteConfirmId === story.id ? (
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button onClick={() => deleteStory(story.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', backgroundColor: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>Confirm</button>
                    <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(story.id)}
                    style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>🗑 Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}

        {stories.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: textSecondary, backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🎧</div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>No stories yet</div>
            <div style={{ fontSize: '14px', marginTop: '0.5rem' }}>Click "+ Add Story" to get started.</div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              {editingId ? 'Edit Story' : 'Add Story'}
            </h2>

            {[
              { label: 'Title *', key: 'title', placeholder: 'e.g. When Rosie Came Home' },
              { label: 'Subtitle', key: 'subtitle', placeholder: 'e.g. DRAMA · DANIEL WREN' },
              { label: 'Cover Image URL', key: 'cover_url', placeholder: 'https://...' },
              { label: 'Audio File URL', key: 'audio_url', placeholder: 'https://...' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: '1rem' }}>
                <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>{label}</label>
                <input
                  type="text"
                  value={form[key as keyof typeof form] as string}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' }}
                />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Duration (mins)</label>
                <input type="number" min={1} value={form.duration_mins}
                  onChange={e => setForm(f => ({ ...f, duration_mins: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
              </div>
              <div>
                <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Sort Order</label>
                <input type="number" min={0} value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
              </div>
            </div>

            {/* Cover preview */}
            {form.cover_url && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: textSecondary, fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Cover Preview</label>
                <img src={form.cover_url} alt="preview" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${border}` }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <input type="checkbox" id="active-toggle" checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="active-toggle" style={{ color: textPrimary, fontSize: '14px', fontWeight: 500 }}>Show on landing page</label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => { setShowForm(false); setEditingId(null) }}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: '#f5f5f5', color: textPrimary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={saveStory} disabled={saving || !form.title.trim()}
                style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: form.title.trim() ? ember : '#e5e5e5', color: form.title.trim() ? 'white' : textSecondary, cursor: form.title.trim() ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Story'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
