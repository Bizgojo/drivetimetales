'use client'

import { useState, useEffect, useCallback } from 'react'

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
  status?: string
}

export default function LandingStoriesPage() {
  const [slots, setSlots] = useState<(LandingStory | null)[]>([null, null, null])
  const [library, setLibrary] = useState<LandingStory[]>([])
  const [mainStories, setMainStories] = useState<MainStory[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [assigningTo, setAssigningTo] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

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
        // Map slot numbers to array indices
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
      const res = await fetch('/api/asc3/list-stories')
      const data = await res.json()
      if (data.stories) setMainStories(data.stories)
    } catch {
      flash('Could not load story library', false)
    }
  }

  useEffect(() => { load() }, [load])

  const handleAssign = async (libraryId: string, slot: number) => {
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
      setAssigningTo(null)
    }
  }

  const handleMoveToLibrary = async (story: LandingStory) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Trick: assign a non-existent id to slot — this will bump the existing one
        // Instead, use a dedicated move route via assign with empty libraryId
        // Actually: call remove slot directly
        body: JSON.stringify({ removeSlot: story.slot }),
      })
      // Use update-story to deactivate
      const res2 = await fetch('/api/landing/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveToLibrary: story.id }),
      })
      const data = await res2.json()
      if (data.success) {
        flash(`📦 Moved "${story.title}" to library`)
        await load()
      } else {
        // Fallback: just reload
        await load()
      }
    } catch {
      flash('❌ Move failed', false)
    } finally {
      setWorking(false)
    }
  }

  const handleAddToLibrary = async (story: MainStory) => {
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`✅ "${story.title}" added to landing library`)
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

  const handleRemoveFromLibrary = async (story: LandingStory) => {
    if (!confirm(`Remove "${story.title}" from the landing library?`)) return
    setWorking(true)
    try {
      const res = await fetch('/api/landing/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        flash(`🗑️ Removed "${story.title}" from library`)
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

  // Already-in-library story IDs for filtering the add panel
  const inLibraryIds = new Set([
    ...library.map(s => s.story_id).filter(Boolean),
    ...slots.filter(Boolean).map(s => s!.story_id).filter(Boolean),
  ])

  const pageStyle: React.CSSProperties = { padding: '2rem', background: '#f5f5f5', minHeight: '100vh' }
  const headStyle: React.CSSProperties = { fontSize: '22px', fontWeight: 700, color: '#000', marginBottom: '0.25rem' }
  const subStyle: React.CSSProperties = { color: '#555', fontSize: '14px', marginBottom: '2rem' }
  const sectionHead: React.CSSProperties = { fontSize: '16px', fontWeight: 700, color: '#000', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }
  const cardBase: React.CSSProperties = { background: '#fff', border: '1px solid #ddd', borderRadius: '12px', overflow: 'hidden' }
  const btnOrange: React.CSSProperties = { background: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
  const btnGray: React.CSSProperties = { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
  const btnRed: React.CSSProperties = { background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={headStyle}>🎧 Landing Page Stories</h1>
          <p style={subStyle}>Manage the 3 story slots on endless-tales.com. Swapped stories go to the library.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            style={btnGray}
            onClick={() => { setShowAddPanel(!showAddPanel); if (!showAddPanel) loadMainStories() }}
          >
            {showAddPanel ? '✕ Close' : '＋ Add Stories to Library'}
          </button>
          <button style={btnOrange} onClick={load} disabled={loading || working}>
            {loading ? '⏳' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: msg.ok ? '#d1fae5' : '#fee2e2',
          color: msg.ok ? '#065f46' : '#b91c1c',
          fontSize: '14px', fontWeight: 500
        }}>
          {msg.text}
        </div>
      )}

      {/* 3 Slot Cards */}
      <div style={sectionHead}>Active Slots — endless-tales.com</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        {[1, 2, 3].map(slotNum => {
          const story = slots[slotNum - 1]
          return (
            <div key={slotNum} style={{ ...cardBase, border: assigningTo === slotNum ? '2px solid #f97316' : '1px solid #ddd' }}>
              {/* Slot label */}
              <div style={{ padding: '0.75rem 1rem', background: '#f8f8f8', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: '#000', fontSize: '14px' }}>Slot {slotNum}</span>
                {assigningTo === slotNum && (
                  <span style={{ fontSize: '12px', color: '#f97316', fontWeight: 600 }}>← Pick from library below</span>
                )}
              </div>

              {story ? (
                <>
                  {/* Cover */}
                  <div style={{ aspectRatio: '1', background: '#1a1a1a', position: 'relative' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>🎧</div>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#000', fontSize: '14px', marginBottom: '2px' }}>{story.title}</div>
                    <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>{story.genre} · {story.author}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginBottom: '0.75rem' }}>{story.duration_mins} min</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        style={btnOrange}
                        disabled={working}
                        onClick={() => setAssigningTo(assigningTo === slotNum ? null : slotNum)}
                      >
                        🔄 Swap
                      </button>
                      <button
                        style={btnGray}
                        disabled={working}
                        onClick={() => handleMoveToLibrary(story)}
                      >
                        📦 To Library
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>
                  <div style={{ fontSize: '36px', marginBottom: '0.5rem' }}>＋</div>
                  <div style={{ fontSize: '13px', marginBottom: '1rem' }}>Empty slot</div>
                  <button
                    style={btnOrange}
                    onClick={() => setAssigningTo(assigningTo === slotNum ? null : slotNum)}
                  >
                    Assign Story
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Library */}
      <div style={sectionHead}>
        Secret Library
        <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>
          {library.length} {library.length === 1 ? 'story' : 'stories'} — click Assign to place in a slot
        </span>
      </div>

      {library.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: '14px', padding: '2rem', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px dashed #ddd' }}>
          Library is empty. Add stories using the button above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
          {library.map(story => (
            <div key={story.id} style={{ ...cardBase, outline: assigningTo ? '2px solid transparent' : 'none' }}>
              {/* Cover */}
              <div style={{ aspectRatio: '1', background: '#1a1a1a', position: 'relative' }}>
                {story.cover_url ? (
                  <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>🎧</div>
                )}
              </div>
              <div style={{ padding: '0.75rem' }}>
                <div style={{ fontWeight: 700, color: '#000', fontSize: '13px', marginBottom: '2px' }}>{story.title}</div>
                <div style={{ color: '#666', fontSize: '11px', marginBottom: '0.5rem' }}>{story.genre} · {story.duration_mins} min</div>

                {assigningTo ? (
                  <button
                    style={{ ...btnOrange, width: '100%' }}
                    disabled={working}
                    onClick={() => handleAssign(story.id, assigningTo)}
                  >
                    → Put in Slot {assigningTo}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{ ...btnOrange, flex: 1 }}
                      disabled={working}
                      onClick={() => setAssigningTo(1)}
                      title="Choose a slot above first, then click the story"
                    >
                      Assign
                    </button>
                    <button
                      style={btnRed}
                      disabled={working}
                      onClick={() => handleRemoveFromLibrary(story)}
                      title="Remove from library"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Stories Panel */}
      {showAddPanel && (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#000', marginBottom: '1rem' }}>
            ＋ Add Stories from Story Database
            <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>
              Stories already in slots or library are hidden
            </span>
          </div>
          {mainStories.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '14px' }}>Loading stories...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {mainStories
                .filter(s => !inLibraryIds.has(s.id))
                .map(story => (
                  <div key={story.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f8f8f8', borderRadius: '8px', border: '1px solid #eee' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '44px', height: '44px', background: '#1a1a1a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎧</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#000', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
                      <div style={{ color: '#888', fontSize: '11px' }}>{story.genre} · {story.duration_mins}m</div>
                    </div>
                    <button
                      style={{ ...btnOrange, padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}
                      disabled={working}
                      onClick={() => handleAddToLibrary(story)}
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Cancel assign mode */}
      {assigningTo && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: '#1e293b', color: '#fff', padding: '1rem 1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <span style={{ fontSize: '14px' }}>Assigning to <strong>Slot {assigningTo}</strong> — pick a story from the library</span>
          <button style={{ ...btnGray, padding: '4px 12px' }} onClick={() => setAssigningTo(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
