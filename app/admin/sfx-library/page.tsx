'use client'
/**
 * SFX-REVIEW-001 (Marc 2026-10-30): hear every sound in our effects library
 * and keep or remove it. Only kept sounds are ever used in stories.
 * Large text and large buttons (Marc reads on his phone).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Entry = {
  id: string
  name: string
  durationSec: number | null
  source: string | null
  category: string
  status: 'approved' | 'rejected' | null
  url: string
}

const CATEGORY_ORDER = ['Guns', 'Fights & hits', 'Vehicles', 'Doors', 'Footsteps', 'Phones', 'Glass & breaking', 'Sirens', 'Weather', 'City & crowds', 'Other']
type Filter = 'todo' | 'kept' | 'removed' | 'all'

export default function SfxLibraryReviewPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState<Filter>('todo')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/sfx-library', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`)
      setEntries(json.entries || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const play = (entry: Entry) => {
    const audio = audioRef.current
    if (!audio) return
    if (playingId === entry.id && !audio.paused) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.src = entry.url
    audio.currentTime = 0
    audio.play().then(() => setPlayingId(entry.id)).catch(() => setPlayingId(null))
  }

  // Saves run one at a time so quick taps never overwrite each other.
  const setStatus = (entry: Entry, status: Entry['status']) => {
    const next = entry.status === status ? null : status
    setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, status: next } : e)))
    setSaving((n) => n + 1)
    queueRef.current = queueRef.current.then(async () => {
      try {
        const res = await fetch('/api/admin/sfx-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: [{ id: entry.id, status: next }] }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Save failed (${res.status})`)
      } catch (e) {
        setError(`Not saved: ${entry.name}. ${e instanceof Error ? e.message : String(e)}`)
        setEntries((list) => list.map((x) => (x.id === entry.id ? { ...x, status: entry.status } : x)))
      } finally {
        setSaving((n) => n - 1)
      }
    })
  }

  const counts = useMemo(() => ({
    all: entries.length,
    kept: entries.filter((e) => e.status === 'approved').length,
    removed: entries.filter((e) => e.status === 'rejected').length,
    todo: entries.filter((e) => !e.status).length,
  }), [entries])

  const visible = entries.filter(e=>category==='all'||e.category===category).filter((e) =>
    filter === 'all' ? true : filter === 'kept' ? e.status === 'approved' : filter === 'removed' ? e.status === 'rejected' : !e.status)
  const groups = Array.from(new Set([...CATEGORY_ORDER,...entries.map(e=>e.category)]))
    .map((cat) => ({ cat, items: visible.filter((e) => e.category === cat).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length)

  return (
    <div className="sfx"><label>Sound type <select aria-label="Filter sound effects by type" value={category} onChange={e=>setCategory(e.target.value)} style={{minHeight:48,padding:10,marginBottom:16}}><option value="all">All sound types</option>{Array.from(new Set([...CATEGORY_ORDER,...entries.map(e=>e.category)])).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <style>{`
        .sfx { --ink:#14181f; --muted:#5a6472; --line:#d9dee5; --card:#ffffff; --bg:#f3f5f8; --keep:#1d7a46; --keep-bg:#e3f4ea; --drop:#b4232c; --drop-bg:#fbe6e7; --accent:#1f4fd1;
          font-size:20px; line-height:1.45; color:var(--ink); background:var(--bg); padding:16px; max-width:900px; margin:0 auto; }
        @media (prefers-color-scheme: dark) { .sfx { --ink:#eef1f5; --muted:#a7b0bd; --line:#2c333d; --card:#191e25; --bg:#0f1318; --keep:#5fd38f; --keep-bg:#13321f; --drop:#ff8a91; --drop-bg:#3a1619; --accent:#8fb0ff; } }
        .sfx h1 { font-size:30px; margin:0 0 6px; }
        .sfx .lead { color:var(--muted); margin:0 0 16px; }
        .sfx .tabs { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 18px; }
        .sfx .tab { font-size:20px; padding:12px 16px; border-radius:12px; border:2px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
        .sfx .tab[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); font-weight:700; }
        .sfx h2 { font-size:24px; margin:26px 0 10px; }
        .sfx .row { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:center; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:10px; }
        .sfx .row.approved { border-color:var(--keep); }
        .sfx .row.rejected { border-color:var(--drop); opacity:.75; }
        .sfx .play { width:64px; height:64px; border-radius:50%; border:2px solid var(--accent); background:transparent; color:var(--accent); font-size:26px; cursor:pointer; }
        .sfx .name { font-weight:600; overflow-wrap:anywhere; min-width:0; }
        .sfx .meta { color:var(--muted); font-size:17px; }
        .sfx .actions { grid-column:1 / -1; display:flex; gap:10px; }
        .sfx .act { flex:1; font-size:20px; font-weight:700; padding:14px; border-radius:12px; border:2px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
        .sfx .act.keep[aria-pressed="true"] { background:var(--keep-bg); border-color:var(--keep); color:var(--keep); }
        .sfx .act.drop[aria-pressed="true"] { background:var(--drop-bg); border-color:var(--drop); color:var(--drop); }
        .sfx .msg { padding:14px; border-radius:12px; background:var(--drop-bg); color:var(--drop); margin-bottom:14px; }
        .sfx button:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
      `}</style>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} preload="none" />
      <h1>Sound Effects Library</h1>
      <p className="lead">
        {counts.all} sounds. Tap ▶ to hear one, then <b>Keep</b> or <b>Remove</b>. Only kept sounds are used in stories.
        {saving > 0 ? ' Saving…' : ''}
      </p>
      {error && <div className="msg" role="alert">{error}</div>}
      <div className="tabs" role="group" aria-label="Show">
        {([['todo', `To review (${counts.todo})`], ['kept', `Kept (${counts.kept})`], ['removed', `Removed (${counts.removed})`], ['all', `All (${counts.all})`]] as Array<[Filter, string]>).map(([f, label]) => (
          <button key={f} className="tab" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>
      {loading && <p>Loading sounds…</p>}
      {!loading && !visible.length && !error && <p>No sounds in this list.</p>}
      {groups.map((g) => (
        <section key={g.cat}>
          <h2>{g.cat} ({g.items.length})</h2>
          {g.items.map((e) => (
            <div key={e.id} className={`row ${e.status || ''}`}>
              <button className="play" aria-label={`${playingId === e.id ? 'Stop' : 'Play'} ${e.name}`} onClick={() => play(e)}>
                {playingId === e.id ? '■' : '▶'}
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="name">{e.name}</div>
                <div className="meta">{e.durationSec ? `${e.durationSec.toFixed(1)} sec` : ''}{e.source ? ` · ${e.source}` : ''}</div>
              </div>
              <div className="actions">
                <button className="act keep" aria-pressed={e.status === 'approved'} onClick={() => setStatus(e, 'approved')}>✓ Keep</button>
                <button className="act drop" aria-pressed={e.status === 'rejected'} onClick={() => setStatus(e, 'rejected')}>✕ Remove</button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
