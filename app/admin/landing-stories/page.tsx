'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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
  active: boolean
  slot?: number | null
  added_at?: string
}

interface MainStory {
  id: string
  title: string
  genre?: string
  author?: string
  duration_mins?: number
  cover_url?: string
  audio_url?: string
}

type DragSource =
  | { kind: 'slot'; story: LandingStory }
  | { kind: 'library'; story: LandingStory }
  | { kind: 'db'; story: MainStory }

export default function LandingStoriesPage() {
  const [slots, setSlots] = useState<(LandingStory | null)[]>([null, null, null])
  const [library, setLibrary] = useState<LandingStory[]>([])
  const [mainStories, setMainStories] = useState<MainStory[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Drag state
  const dragging = useRef<DragSource | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null) // 'slot-1' | 'slot-2' | 'slot-3' | 'library'
  const libraryRef = useRef<HTMLDivElement>(null)

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/landing/slots')
      const data = await res.json()
      if (data.success) {
        const slotArr: (LandingStory | null)[] = [null, null, null]
        for (const s of data.slots) {
          if (s.slot >= 1 && s.slot <= 3) slotArr[s.slot - 1] = s
        }
        setSlots(slotArr)
        setLibrary(data.library)
      }
    } catch {
      flash('Failed to load landing stories', false)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMainStories = async () => {
    try {
      const res = await fetch('/api/landing/stories')
      const data = await res.json()
      if (data.stories) setMainStories(data.stories)
    } catch {
      flash('Could not load story library', false)
    }
  }

  useEffect(() => { load() }, [load])

  // ── API helpers ──────────────────────────────────────────────

  const assignToSlot = async (libraryId: string, slot: number) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId, slot }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`✅ Story placed in Slot ${slot}`)
        await load()
      } else {
        flash(`❌ ${data.error}`, false)
      }
    } catch {
      flash('❌ Assignment failed', false)
    } finally {
      setWorking(false)
    }
  }

  const moveToLibrary = async (story: LandingStory) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveToLibrary: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`📦 "${story.title}" moved to library`)
        await load()
      } else {
        flash(`❌ ${data.error}`, false)
      }
    } catch {
      flash('❌ Move failed', false)
    } finally {
      setWorking(false)
    }
  }

  const addToLibrary = async (story: MainStory) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`✅ "${story.title}" added to library`)
        await load()
      } else {
        flash(`❌ ${data.error}`, false)
      }
    } catch {
      flash('❌ Failed to add story', false)
    } finally {
      setWorking(false)
    }
  }

  const removeFromLibrary = async (story: LandingStory) => {
    if (!confirm(`Remove "${story.title}" from the library?`)) return
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`🗑️ Removed "${story.title}"`)
        await load()
      } else {
        flash(`❌ ${data.error}`, false)
      }
    } catch {
      flash('❌ Remove failed', false)
    } finally {
      setWorking(false)
    }
  }

  // ── Drag handlers ────────────────────────────────────────────

  const onDragStart = (source: DragSource) => (e: React.DragEvent) => {
    dragging.current = source
    e.dataTransfer.effectAllowed = 'move'
    // ghost image styling via opacity handled by dragOver state
  }

  const onDragEnd = () => {
    dragging.current = null
    setDragOver(null)
  }

  const onDragOverSlot = (slotNum: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(`slot-${slotNum}`)
  }

  const onDragOverLibrary = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver('library')
  }

  const onDropSlot = (slotNum: number) => async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const src = dragging.current
    if (!src) return

    if (src.kind === 'db') {
      // DB panel → Slot: add to library first, then assign
      setWorking(true)
      try {
        const res = await fetch('/api/landing/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: src.story.id }),
        })
        const data = await res.json()
        if (!data.success) { flash(`❌ ${data.error}`, false); return }
        // Fetch the new library entry id
        const slotsRes = await fetch('/api/landing/slots')
        const slotsData = await slotsRes.json()
        const newEntry = slotsData.library?.find((s: LandingStory) => s.story_id === src.story.id)
        if (newEntry) await assignToSlot(newEntry.id, slotNum)
        else { flash(`✅ Added to library — now drag to slot`, true); await load() }
      } catch { flash('❌ Failed', false) } finally { setWorking(false) }
    } else if (src.kind === 'library') {
      // Library → Slot: assign
      await assignToSlot(src.story.id, slotNum)
    } else if (src.kind === 'slot' && src.story.slot !== slotNum) {
      // Slot → different Slot: swap (first move to library, then assign)
      setWorking(true)
      try {
        // Move source story to library temporarily
        await fetch('/api/landing/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moveToLibrary: src.story.id }),
        })
        // Now assign it to the target slot (will bump any existing story there)
        await fetch('/api/landing/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: src.story.id, slot: slotNum }),
        })
        flash(`✅ Moved "${src.story.title}" to Slot ${slotNum}`)
        await load()
      } catch {
        flash('❌ Slot swap failed', false)
      } finally {
        setWorking(false)
      }
    }
    dragging.current = null
  }

  const onDropLibrary = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const src = dragging.current
    if (!src) return

    if (src.kind === 'slot') {
      await moveToLibrary(src.story)
    } else if (src.kind === 'db') {
      await addToLibrary(src.story)
    }
    // library → library: no-op
    dragging.current = null
  }

  const onDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the actual drop zone container (not a child element)
    const related = e.relatedTarget as Node | null
    if (e.currentTarget.contains(related)) return
    setDragOver(null)
  }

  // ── Styles ───────────────────────────────────────────────────

  const inLibraryIds = new Set([
    ...library.map(s => s.story_id).filter(Boolean),
    ...slots.filter(Boolean).map(s => s!.story_id).filter(Boolean),
  ])

  const slotDropStyle = (slotNum: number): React.CSSProperties => ({
    background: '#fff',
    border: dragOver === `slot-${slotNum}` ? '2px dashed #f97316' : '1px solid #ddd',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'border 0.15s, box-shadow 0.15s',
    boxShadow: dragOver === `slot-${slotNum}` ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
  })

  const libraryDropStyle: React.CSSProperties = {
    border: dragOver === 'library' ? '2px dashed #f97316' : '2px dashed #e5e7eb',
    borderRadius: '12px',
    padding: '1rem',
    background: dragOver === 'library' ? 'rgba(249,115,22,0.05)' : '#fafafa',
    transition: 'all 0.15s',
    minHeight: '120px',
  }

  const btnOrange: React.CSSProperties = { background: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
  const btnGray: React.CSSProperties = { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
  const btnRed: React.CSSProperties = { background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }

  const coverBox = (story: LandingStory | MainStory, size = '100%'): React.JSX.Element => (
    <div style={{ aspectRatio: '1', background: '#1a1a1a', width: size, flexShrink: 0 }}>
      {story.cover_url
        ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>🎧</div>
      }
    </div>
  )

  return (
    <div style={{ padding: '2rem', background: '#f5f5f5', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#000', marginBottom: '0.25rem' }}>🎧 Landing Page Stories</h1>
          <p style={{ color: '#555', fontSize: '14px' }}>
            <strong>Drag</strong> a story from a slot → library, or from library → a slot. Changes go live instantly.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button style={btnGray} onClick={() => { setShowAddPanel(!showAddPanel); if (!showAddPanel) loadMainStories() }}>
            {showAddPanel ? '✕ Close' : '＋ Add to Library'}
          </button>
          <button style={btnOrange} onClick={load} disabled={loading || working}>
            {loading ? '⏳' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Flash */}
      {msg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#065f46' : '#b91c1c', fontSize: '14px', fontWeight: 500 }}>
          {msg.text}
        </div>
      )}

      {/* ── 3 Slots ── */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '0.75rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        Live Slots — endless-tales.com
        <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>Drag a library story onto a slot to assign it</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        {[1, 2, 3].map(slotNum => {
          const story = slots[slotNum - 1]
          return (
            <div
              key={slotNum}
              style={slotDropStyle(slotNum)}
              onDragOver={onDragOverSlot(slotNum)}
              onDragLeave={onDragLeave}
              onDrop={onDropSlot(slotNum)}
            >
              {/* Slot label */}
              <div style={{ padding: '0.6rem 1rem', background: '#f8f8f8', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>Slot {slotNum}</span>
                {dragOver === `slot-${slotNum}` && <span style={{ fontSize: '12px', color: '#f97316', fontWeight: 600 }}>Drop here</span>}
              </div>

              {story ? (
                <div
                  draggable
                  onDragStart={onDragStart({ kind: 'slot', story })}
                  onDragEnd={onDragEnd}
                  style={{ cursor: 'grab' }}
                >
                  {coverBox(story)}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#000', fontSize: '14px', marginBottom: '2px' }}>{story.title}</div>
                    <div style={{ color: '#666', fontSize: '12px', marginBottom: '2px' }}>{story.genre} · {story.author}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginBottom: '0.75rem' }}>{story.duration_mins} min</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={{ ...btnGray, fontSize: '12px', padding: '4px 10px' }} disabled={working} onClick={() => moveToLibrary(story)}>
                        📦 To Library
                      </button>
                    </div>
                    <div style={{ color: '#bbb', fontSize: '11px', marginTop: '6px' }}>↕ drag to move</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: dragOver === `slot-${slotNum}` ? '#f97316' : '#aaa' }}>
                  <div style={{ fontSize: '36px', marginBottom: '0.5rem' }}>
                    {dragOver === `slot-${slotNum}` ? '⬇️' : '＋'}
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    {dragOver === `slot-${slotNum}` ? 'Drop to assign' : 'Empty — drag a story here'}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Secret Library ── */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '0.75rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        Secret Library
        <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>
          {library.length} {library.length === 1 ? 'story' : 'stories'} — drag onto a slot to publish, or drag a slot story here to archive it
        </span>
      </div>

      <div
        ref={libraryRef}
        style={libraryDropStyle}
        onDragOver={onDragOverLibrary}
        onDragLeave={onDragLeave}
        onDrop={onDropLibrary}
      >
        {library.length === 0 ? (
          <div style={{ textAlign: 'center', color: dragOver === 'library' ? '#f97316' : '#bbb', padding: '1.5rem', fontSize: '14px' }}>
            {dragOver === 'library' ? '⬇️ Drop here to archive' : 'Library is empty — add stories using the button above, or drag a slot story here'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            {library.map(story => (
              <div
                key={story.id}
                draggable
                onDragStart={onDragStart({ kind: 'library', story })}
                onDragEnd={onDragEnd}
                style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '10px', overflow: 'hidden', cursor: 'grab', transition: 'box-shadow 0.15s' }}
              >
                {coverBox(story)}
                <div style={{ padding: '0.65rem 0.75rem' }}>
                  <div style={{ fontWeight: 700, color: '#000', fontSize: '13px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
                  <div style={{ color: '#777', fontSize: '11px', marginBottom: '6px' }}>{story.genre} · {story.duration_mins}m</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 1)} title="Assign to Slot 1">S1</button>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 2)} title="Assign to Slot 2">S2</button>
                    <button style={{ ...btnOrange, flex: 1, fontSize: '11px', padding: '3px 6px' }} disabled={working} onClick={() => assignToSlot(story.id, 3)} title="Assign to Slot 3">S3</button>
                    <button style={btnRed} disabled={working} onClick={() => removeFromLibrary(story)} title="Remove">🗑</button>
                  </div>
                  <div style={{ color: '#bbb', fontSize: '10px', marginTop: '4px' }}>↕ drag to slot</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Stories Panel ── */}
      {showAddPanel && (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '1rem' }}>
            ＋ Add Stories from Database
            <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>Drag to library or a slot — or click Add</span>
          </div>
          {mainStories.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '14px' }}>Loading stories...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {mainStories.filter(s => !inLibraryIds.has(s.id)).map(story => (
                <div
                  key={story.id}
                  draggable
                  onDragStart={onDragStart({ kind: 'db', story })}
                  onDragEnd={onDragEnd}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f8f8f8', borderRadius: '8px', border: '1px solid #eee', cursor: 'grab' }}
                >
                  {story.cover_url
                    ? <img src={story.cover_url} alt={story.title} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    : <div style={{ width: '44px', height: '44px', background: '#1a1a1a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎧</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#000', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
                    <div style={{ color: '#888', fontSize: '11px' }}>{story.genre} · {story.duration_mins}m</div>
                  </div>
                  <button style={{ ...btnOrange, padding: '4px 10px', fontSize: '12px', flexShrink: 0 }} disabled={working} onClick={() => addToLibrary(story)}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
