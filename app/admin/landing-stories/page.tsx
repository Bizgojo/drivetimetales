'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────

interface LandingStory {
  id: string
  story_id?: string
  title: string
  subtitle?: string
  genre?: string
  author?: string
  description?: string
  duration_mins?: number
  cover_url?: string
  audio_url?: string
  intro_text?: string
  outro_text?: string
  intro_audio_url?: string
  outro_audio_url?: string
  active: boolean
  slot?: number | null
  added_at?: string
}

interface AppStory {
  id: string
  title: string
  genre?: string
  author?: string
  duration_mins?: number
  cover_url?: string
}

type DragSource =
  | { kind: 'slot'; story: LandingStory }
  | { kind: 'library'; story: LandingStory }

// ── Styles ────────────────────────────────────────────────────

const btn = (color: string, textColor = '#fff'): React.CSSProperties => ({
  background: color, color: textColor, border: 'none', borderRadius: '6px',
  padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
})
const btnOrange = btn('#f97316')
const btnGray = btn('#e5e7eb', '#333')
const btnGreen = btn('#16a34a')
const btnBlue = btn('#2563eb')
const btnRed: React.CSSProperties = { ...btn('#fee2e2', '#b91c1c') }

// ── Copy from App Library Modal ───────────────────────────────

function CopyFromAppModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [appStories, setAppStories] = useState<AppStory[]>([])
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [loading, setLoading] = useState(true)

  // Step state: 'browse' | 'edit'
  const [step, setStep] = useState<'browse' | 'edit'>('browse')
  const [selected, setSelected] = useState<AppStory | null>(null)
  const [landingId, setLandingId] = useState<string | null>(null)

  // Intro/outro editor
  const [introText, setIntroText] = useState('')
  const [outroText, setOutroText] = useState('')
  const [introAudioUrl, setIntroAudioUrl] = useState<string | null>(null)
  const [outroAudioUrl, setOutroAudioUrl] = useState<string | null>(null)
  const [regenIntro, setRegenIntro] = useState(false)
  const [regenOutro, setRegenOutro] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderDone, setRenderDone] = useState(false)
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    // Use the same App Library endpoint as the admin Stories page
    fetch('/api/asc3/list-stories?status=all')
      .then(r => r.json())
      .then(d => {
        if (d.stories) {
          setAppStories(d.stories.map((s: any) => ({
            id: s.id,
            title: s.title,
            author: s.authorName || s.author,
            genre: s.primaryGenre || s.genre,
            duration_mins: s.wordCount ? Math.ceil(s.wordCount / 150) : s.duration_mins,
            cover_url: s.coverImageUrl || s.cover_url,
          })))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const genres = Array.from(new Set(appStories.map(s => s.genre).filter(Boolean))) as string[]

  const filtered = appStories.filter(s => {
    const q = search.toLowerCase()
    const matchQ = !q || s.title.toLowerCase().includes(q) || (s.author || '').toLowerCase().includes(q) || (s.genre || '').toLowerCase().includes(q)
    const matchG = !genreFilter || s.genre === genreFilter
    return matchQ && matchG
  })

  const handleSelect = async (story: AppStory) => {
    setSelected(story)
    setMsg('⏳ Copying story...')
    try {
      const res = await fetch('/api/landing/copy-from-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      const d = await res.json()
      if (!d.success) { setMsg(`❌ ${d.error}`); return }
      setLandingId(d.landingStoryId)
      setIntroText(d.introText)
      setOutroText(d.outroText)
      setMsg('')
      setStep('edit')
    } catch { setMsg('❌ Error copying story') }
  }

  const handleRegenAnnouncer = async (type: 'intro' | 'outro') => {
    if (!landingId) return
    const text = type === 'intro' ? introText : outroText
    if (!text.trim()) { setMsg('Add text first'); return }
    if (type === 'intro') setRegenIntro(true); else setRegenOutro(true)
    setMsg(`⏳ Generating ${type} audio with Belle B...`)
    try {
      const res = await fetch('/api/landing/regenerate-announcer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingStoryId: landingId, type, text }),
      })
      const d = await res.json()
      if (d.success) {
        if (type === 'intro') setIntroAudioUrl(d.audioUrl)
        else setOutroAudioUrl(d.audioUrl)
        setMsg(`✅ ${type === 'intro' ? 'Intro' : 'Outro'} audio ready`)
      } else setMsg(`❌ ${d.error}`)
    } catch { setMsg(`❌ Error regenerating ${type}`) }
    finally { if (type === 'intro') setRegenIntro(false); else setRegenOutro(false) }
  }

  const handleRenderMix = async () => {
    if (!landingId) return
    if (!introAudioUrl || !outroAudioUrl) {
      setMsg('❌ Generate both intro and outro audio first')
      return
    }
    setRendering(true)
    setMsg('⏳ Rendering final mix (this takes 1–2 min)...')
    try {
      const res = await fetch('/api/landing/render-mix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingStoryId: landingId }),
      })
      const d = await res.json()
      if (d.success) {
        setFinalAudioUrl(d.audioUrl)
        setRenderDone(true)
        setMsg('✅ Final mix ready!')
      } else setMsg(`❌ ${d.error}`)
    } catch { setMsg('❌ Render error') }
    finally { setRendering(false) }
  }

  const handleFinish = () => {
    onAdded()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#000' }}>
              {step === 'browse' ? '📚 Copy Story from App Library' : `✏️ Customize for Landing Page — "${selected?.title}"`}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              {step === 'browse'
                ? 'Pick a story. Its dialogue stays the same — you\'ll customize the intro/outro for the landing page.'
                : 'Edit the intro and outro, regenerate the audio, then render the landing page mix.'}
            </div>
          </div>
          <button style={btnGray} onClick={onClose}>✕ Cancel</button>
        </div>

        <div style={{ padding: '1.5rem', flex: 1 }}>

          {/* ── STEP 1: Browse ── */}
          {step === 'browse' && (
            <>
              {/* Filters */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search title, author, genre..."
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', color: '#000', background: '#fff' }}
                />
                <select
                  value={genreFilter}
                  onChange={e => setGenreFilter(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', color: '#000', background: '#fff' }}
                >
                  <option value="">All Genres</option>
                  {genres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {msg && <div style={{ marginBottom: '1rem', color: msg.startsWith('❌') ? '#b91c1c' : '#065f46', fontWeight: 500, fontSize: '14px' }}>{msg}</div>}

              {loading ? (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Loading App Library...</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>No stories found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(story => (
                    <div
                      key={story.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: '#f9f9f9', borderRadius: '10px', border: '1px solid #eee' }}
                    >
                      {story.cover_url
                        ? <img src={story.cover_url} alt={story.title} style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                        : <div style={{ width: '52px', height: '52px', background: '#222', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>🎧</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>{story.title}</div>
                        <div style={{ color: '#666', fontSize: '12px' }}>{story.author} · {story.genre} · {story.duration_mins} min</div>
                      </div>
                      <button style={btnOrange} onClick={() => handleSelect(story)}>
                        Copy for Landing Page →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Edit Intro/Outro ── */}
          {step === 'edit' && selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {msg && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: msg.startsWith('✅') ? '#d1fae5' : msg.startsWith('⏳') ? '#eff6ff' : '#fee2e2', color: msg.startsWith('✅') ? '#065f46' : msg.startsWith('⏳') ? '#1d4ed8' : '#b91c1c', fontSize: '14px', fontWeight: 500 }}>
                  {msg}
                </div>
              )}

              {/* Story preview */}
              <div style={{ display: 'flex', gap: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '10px', alignItems: 'center' }}>
                {selected.cover_url && <img src={selected.cover_url} alt={selected.title} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px' }} />}
                <div>
                  <div style={{ fontWeight: 700, color: '#000' }}>{selected.title}</div>
                  <div style={{ color: '#666', fontSize: '13px' }}>{selected.author} · {selected.genre} · {selected.duration_mins} min</div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>✅ Dialogue audio shared from App Library — only intro/outro changes</div>
                </div>
              </div>

              {/* Intro */}
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>🎙️ Intro Script</div>
                  <button
                    style={{ ...btnBlue, opacity: regenIntro ? 0.5 : 1 }}
                    disabled={regenIntro}
                    onClick={() => handleRegenAnnouncer('intro')}
                  >
                    {regenIntro ? '⏳ Generating...' : '🎙️ Generate Intro Audio'}
                  </button>
                </div>
                <textarea
                  value={introText}
                  onChange={e => setIntroText(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', color: '#000', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Welcome to Endless Tales. Today's story: ..."
                />
                {introAudioUrl && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '4px', fontWeight: 500 }}>✅ Intro audio ready</div>
                    <audio controls src={introAudioUrl} style={{ width: '100%', height: '36px' }} />
                  </div>
                )}
              </div>

              {/* Outro */}
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>🎙️ Outro Script (Landing Page CTA)</div>
                  <button
                    style={{ ...btnBlue, opacity: regenOutro ? 0.5 : 1 }}
                    disabled={regenOutro}
                    onClick={() => handleRegenAnnouncer('outro')}
                  >
                    {regenOutro ? '⏳ Generating...' : '🎙️ Generate Outro Audio'}
                  </button>
                </div>
                <textarea
                  value={outroText}
                  onChange={e => setOutroText(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', color: '#000', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="That was ... If this story had you holding your breath, your fourteen-day trial is above..."
                />
                {outroAudioUrl && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '4px', fontWeight: 500 }}>✅ Outro audio ready</div>
                    <audio controls src={outroAudioUrl} style={{ width: '100%', height: '36px' }} />
                  </div>
                )}
              </div>

              {/* Render Mix */}
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#000', fontSize: '14px', marginBottom: '0.5rem' }}>🎬 Render Landing Mix</div>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '0.75rem' }}>
                  Combines intro + story dialogue + outro with background music into one publishable MP3.
                  Generate both intro and outro audio first.
                </div>
                <button
                  style={{ ...btnGreen, opacity: (rendering || !introAudioUrl || !outroAudioUrl) ? 0.5 : 1, width: '100%', padding: '10px', fontSize: '14px' }}
                  disabled={rendering || !introAudioUrl || !outroAudioUrl}
                  onClick={handleRenderMix}
                >
                  {rendering ? '⏳ Rendering (1-2 min)...' : '🎬 Render Final Mix'}
                </button>
                {finalAudioUrl && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '4px', fontWeight: 600 }}>✅ Final mix ready — story added to library!</div>
                    <audio controls src={finalAudioUrl} style={{ width: '100%' }} />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button style={btnGray} onClick={() => setStep('browse')}>← Back to Library</button>
                <button
                  style={{ ...btnOrange, opacity: !landingId ? 0.5 : 1 }}
                  disabled={!landingId}
                  onClick={handleFinish}
                >
                  {renderDone ? '✅ Done — Added to Library' : 'Add to Library (render later)'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function LandingStoriesPage() {
  const [slots, setSlots] = useState<(LandingStory | null)[]>([null, null, null])
  const [library, setLibrary] = useState<LandingStory[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const dragging = useRef<DragSource | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/landing/slots?t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      const slotArr: (LandingStory | null)[] = [null, null, null]
      for (const s of (data.slots || [])) {
        if (s.slot >= 1 && s.slot <= 3) slotArr[s.slot - 1] = s
      }
      setSlots(slotArr)
      setLibrary(data.library || [])
    } catch (e) {
      flash('Failed to load: ' + String(e), false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const assignToSlot = async (libraryId: string, slot: number) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId, slot }),
      })
      const data = await res.json()
      if (data.success) { flash(`✅ Story placed in Slot ${slot}`); await load() }
      else flash(`❌ ${data.error}`, false)
    } catch { flash('❌ Assignment failed', false) }
    finally { setWorking(false) }
  }

  const moveToLibrary = async (story: LandingStory) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveToLibrary: story.id }),
      })
      const data = await res.json()
      if (data.success) { flash(`📦 "${story.title}" moved to library`); await load() }
      else flash(`❌ ${data.error}`, false)
    } catch { flash('❌ Move failed', false) }
    finally { setWorking(false) }
  }

  const removeFromLibrary = async (story: LandingStory) => {
    if (!confirm(`Remove "${story.title}" from the library?`)) return
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: story.id }),
      })
      const data = await res.json()
      if (data.success) { flash(`🗑️ Removed "${story.title}"`); await load() }
      else flash(`❌ ${data.error}`, false)
    } catch { flash('❌ Remove failed', false) }
    finally { setWorking(false) }
  }

  const onDragStart = (source: DragSource) => (e: React.DragEvent) => {
    dragging.current = source
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragEnd = () => { dragging.current = null; setDragOver(null) }
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(null)
  }

  const onDropSlot = (slotNum: number) => async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null)
    const src = dragging.current; if (!src) return
    if (src.kind === 'library') await assignToSlot(src.story.id, slotNum)
    else if (src.kind === 'slot' && src.story.slot !== slotNum) {
      setWorking(true)
      try {
        await fetch('/api/landing/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveToLibrary: src.story.id }) })
        await fetch('/api/landing/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ libraryId: src.story.id, slot: slotNum }) })
        flash(`✅ Moved to Slot ${slotNum}`); await load()
      } catch { flash('❌ Swap failed', false) }
      finally { setWorking(false) }
    }
    dragging.current = null
  }

  const onDropLibrary = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null)
    const src = dragging.current; if (!src) return
    if (src.kind === 'slot') await moveToLibrary(src.story)
    dragging.current = null
  }

  const slotStyle = (n: number): React.CSSProperties => ({
    background: '#fff', border: dragOver === `slot-${n}` ? '2px dashed #f97316' : '1px solid #ddd',
    borderRadius: '12px', overflow: 'hidden', transition: 'border 0.15s, box-shadow 0.15s',
    boxShadow: dragOver === `slot-${n}` ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
  })

  return (
    <div style={{ padding: '2rem', background: '#f5f5f5', minHeight: '100vh' }}>
      {showCopyModal && (
        <CopyFromAppModal
          onClose={() => setShowCopyModal(false)}
          onAdded={() => { load(); flash('✅ Story added to landing library!') }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#000', marginBottom: '0.25rem' }}>🎧 Landing Page Stories</h1>
          <p style={{ color: '#555', fontSize: '14px' }}>Drag stories between slots and library. Use <strong>Copy from App Library</strong> to add new stories with custom landing page intros/outros.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button style={btnOrange} onClick={() => setShowCopyModal(true)}>
            ＋ Copy from App Library
          </button>
          <button style={btnGray} onClick={load} disabled={loading || working}>
            {loading ? '⏳' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#065f46' : '#b91c1c', fontSize: '14px', fontWeight: 500 }}>
          {msg.text}
        </div>
      )}

      {/* 3 Live Slots */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '0.75rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        Live Slots — endless-tales.com
        <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>Drag from library to publish · drag to library to archive</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        {[1, 2, 3].map(n => {
          const story = slots[n - 1]
          return (
            <div key={n} style={slotStyle(n)} onDragOver={e => { e.preventDefault(); setDragOver(`slot-${n}`) }} onDragLeave={onDragLeave} onDrop={onDropSlot(n)}>
              <div style={{ padding: '0.6rem 1rem', background: '#f8f8f8', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>Slot {n}</span>
                {dragOver === `slot-${n}` && <span style={{ fontSize: '12px', color: '#f97316', fontWeight: 600 }}>Drop here</span>}
              </div>
              {story ? (
                <div draggable onDragStart={onDragStart({ kind: 'slot', story })} onDragEnd={onDragEnd} style={{ cursor: 'grab' }}>
                  <div style={{ aspectRatio: '1', background: '#1a1a1a' }}>
                    {story.cover_url ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>🎧</div>}
                  </div>
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#000', fontSize: '14px', marginBottom: '2px' }}>{story.title}</div>
                    <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>{story.genre} · {story.author}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginBottom: '0.75rem' }}>{story.duration_mins} min{story.audio_url ? ' · ✅ mix ready' : ' · ⚠️ no mix'}</div>
                    <button style={{ ...btnGray, fontSize: '12px', padding: '4px 10px' }} disabled={working} onClick={() => moveToLibrary(story)}>📦 Archive</button>
                    <div style={{ color: '#bbb', fontSize: '11px', marginTop: '6px' }}>↕ drag to move</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: dragOver === `slot-${n}` ? '#f97316' : '#aaa' }}>
                  <div style={{ fontSize: '36px', marginBottom: '0.5rem' }}>{dragOver === `slot-${n}` ? '⬇️' : '＋'}</div>
                  <div style={{ fontSize: '13px' }}>{dragOver === `slot-${n}` ? 'Drop to assign' : 'Empty — drag a story here'}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Secret Library */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '0.75rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        Landing Page Library
        <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>
          {library.length} {library.length === 1 ? 'story' : 'stories'} — landing page versions with custom CTAs
        </span>
      </div>

      <div
        style={{ border: dragOver === 'library' ? '2px dashed #f97316' : '2px dashed #e5e7eb', borderRadius: '12px', padding: '1rem', background: dragOver === 'library' ? 'rgba(249,115,22,0.05)' : '#fafafa', transition: 'all 0.15s', minHeight: '120px' }}
        onDragOver={e => { e.preventDefault(); setDragOver('library') }}
        onDragLeave={onDragLeave}
        onDrop={onDropLibrary}
      >
        {library.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#bbb', padding: '1.5rem', fontSize: '14px' }}>
            Use <strong>Copy from App Library</strong> to add stories here with custom landing page intros/outros
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            {library.map(story => (
              <div key={story.id} draggable onDragStart={onDragStart({ kind: 'library', story })} onDragEnd={onDragEnd}
                style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '10px', overflow: 'hidden', cursor: 'grab' }}>
                <div style={{ aspectRatio: '1', background: '#1a1a1a' }}>
                  {story.cover_url ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🎧</div>}
                </div>
                <div style={{ padding: '0.65rem 0.75rem' }}>
                  <div style={{ fontWeight: 700, color: '#000', fontSize: '13px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
                  <div style={{ color: '#777', fontSize: '11px', marginBottom: '2px' }}>{story.genre} · {story.duration_mins}m</div>
                  <div style={{ fontSize: '11px', color: story.audio_url ? '#16a34a' : '#d97706', marginBottom: '6px' }}>{story.audio_url ? '✅ mix ready' : '⚠️ needs mix'}</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 1)}>S1</button>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 2)}>S2</button>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 3)}>S3</button>
                    <button style={btnRed} disabled={working} onClick={() => removeFromLibrary(story)}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
