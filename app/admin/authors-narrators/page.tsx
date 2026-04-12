'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const bg = '#FAF9F6'
const card = '#fff'
const border = '#e5e7eb'
const text = '#111'
const muted = '#6b7280'
const orange = '#f97316'

const VOICE_OPTIONS = [
  { value: 'first_person', label: 'First Person', desc: '"I pulled the door open..."' },
  { value: 'third_limited', label: 'Third Limited', desc: '"She pulled the door open..."' },
  { value: 'third_omniscient', label: 'Third Omniscient', desc: 'All-knowing narrator' },
  { value: 'second_person', label: 'Second Person', desc: '"You pull the door open..."' },
]

const PACING_OPTIONS = ['fast', 'medium', 'steady', 'slow-burn', 'methodical', 'punchy']
const GENRE_OPTIONS = ['Thriller', 'Horror', 'Mystery', 'Adventure', 'Drama', 'Sci-Fi', 'Western', 'Historical Drama', 'Supernatural', 'Family', 'Crime', 'Action', 'Speculative', 'Dark Mystery', 'Western Thriller']

export default function AuthorsNarratorsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'authors' | 'narrators'>('authors')
  const [authors, setAuthors] = useState<any[]>([])
  const [narrators, setNarrators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAuthor, setSelectedAuthor] = useState<any | null>(null)
  const [selectedNarrator, setSelectedNarrator] = useState<any | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [msg, setMsg] = useState('')

  // Add author form
  const [showAddAuthor, setShowAddAuthor] = useState(false)
  const [newAuthor, setNewAuthor] = useState({
    name: '', primary_genre: '', secondary_genre: '', narrative_voice: 'third_limited',
    tone: '', pacing: 'medium', signature: '', example_line: '', narrator_voice_id: ''
  })

  // Add narrator form
  const [showAddNarrator, setShowAddNarrator] = useState(false)
  const [newNarrator, setNewNarrator] = useState({
    name: '', elevenlabs_voice_id: '', gender: 'male', accent: 'american',
    tone: '', bio: '', best_genres: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: a }, { data: n }] = await Promise.all([
      supabase.from('authors').select('*, narrator_voices(id, name, elevenlabs_voice_id, tone, accent, gender)').eq('is_active', true).order('name'),
      supabase.from('narrator_voices').select('*').eq('is_active', true).order('name'),
    ])
    setAuthors(a || [])
    setNarrators(n || [])
    setLoading(false)
  }

  // Generate EL preview for narrator in author's style
  async function previewVoice(narrator: any, author: any | null) {
    if (!narrator?.elevenlabs_voice_id) { setMsg('No ElevenLabs voice ID for this narrator'); return }

    const text = author?.example_line ||
      "The road stretched ahead like a question nobody wanted to answer. She drove anyway."

    setPreviewLoading(true)
    setPreviewText(text)
    setMsg('')

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${narrator.elevenlabs_voice_id}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.NEXT_PUBLIC_EL_API_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      })

      if (!res.ok) throw new Error('EL API error')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = url
        audioRef.current.play()
        setIsPlaying(true)
        audioRef.current.onended = () => setIsPlaying(false)
      } else {
        const audio = new Audio(url)
        audioRef.current = audio
        audio.play()
        setIsPlaying(true)
        audio.onended = () => setIsPlaying(false)
      }
    } catch (e) {
      setMsg('Preview failed — check EL API key in Vercel env vars')
    }
    setPreviewLoading(false)
  }

  function stopPreview() {
    audioRef.current?.pause()
    setIsPlaying(false)
  }

  // Pair narrator to author
  async function pairNarrator(authorId: string, narratorId: string) {
    const { error } = await supabase.from('authors').update({ narrator_voice_id: narratorId }).eq('id', authorId)
    if (error) { setMsg('Failed to pair narrator'); return }
    setMsg('Narrator paired successfully')
    load()
  }

  // Add new author
  async function addAuthor() {
    if (!newAuthor.name.trim()) { setMsg('Author name required'); return }
    const { error } = await supabase.from('authors').insert({
      name: newAuthor.name,
      primary_genre: newAuthor.primary_genre || null,
      secondary_genre: newAuthor.secondary_genre || null,
      narrative_voice: newAuthor.narrative_voice,
      tone: newAuthor.tone || null,
      pacing: newAuthor.pacing || null,
      signature: newAuthor.signature || null,
      example_line: newAuthor.example_line || null,
      narrator_voice_id: newAuthor.narrator_voice_id || null,
      is_active: true,
    })
    if (error) { setMsg('Failed to add author: ' + error.message); return }
    setMsg('Author added')
    setShowAddAuthor(false)
    setNewAuthor({ name: '', primary_genre: '', secondary_genre: '', narrative_voice: 'third_limited', tone: '', pacing: 'medium', signature: '', example_line: '', narrator_voice_id: '' })
    load()
  }

  // Add new narrator
  async function addNarrator() {
    if (!newNarrator.name.trim() || !newNarrator.elevenlabs_voice_id.trim()) {
      setMsg('Name and EL Voice ID required'); return
    }
    const { error } = await supabase.from('narrator_voices').insert({
      name: newNarrator.name,
      elevenlabs_voice_id: newNarrator.elevenlabs_voice_id,
      gender: newNarrator.gender,
      accent: newNarrator.accent,
      tone: newNarrator.tone || null,
      bio: newNarrator.bio || null,
      best_genres: newNarrator.best_genres ? newNarrator.best_genres.split(',').map((g: string) => g.trim()) : [],
      is_active: true,
    })
    if (error) { setMsg('Failed to add narrator: ' + error.message); return }
    setMsg('Narrator added')
    setShowAddNarrator(false)
    setNewNarrator({ name: '', elevenlabs_voice_id: '', gender: 'male', accent: 'american', tone: '', bio: '', best_genres: '' })
    load()
  }

  // Delete author (soft delete)
  async function deleteAuthor(id: string) {
    if (!confirm('Delete this author? Their stories will remain.')) return
    await supabase.from('authors').update({ is_active: false }).eq('id', id)
    setSelectedAuthor(null)
    load()
  }

  // Delete narrator (soft delete)
  async function deleteNarrator(id: string) {
    if (!confirm('Delete this narrator? Authors paired to them will be unpaired.')) return
    await supabase.from('narrator_voices').update({ is_active: false }).eq('id', id)
    setSelectedNarrator(null)
    load()
  }

  const voiceColor: Record<string, string> = {
    first_person: '#dc2626',
    third_limited: '#2563eb',
    third_omniscient: '#16a34a',
    second_person: '#9333ea',
  }

  const inp = { width: '100%', padding: '8px 12px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 14, color: text, background: '#fff', outline: 'none', boxSizing: 'border-box' as const }
  const sel = { ...inp, appearance: 'none' as const }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: `4px solid ${orange}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: 24, fontFamily: '-apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={() => router.push('/admin')} style={{ background: '#e5e7eb', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, color: text }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: text }}>Authors & Narrators</h1>
          <p style={{ margin: 0, color: muted, fontSize: 13 }}>{authors.length} authors · {narrators.length} narrators</p>
        </div>
      </div>

      {/* Message */}
      {msg && <div style={{ background: msg.includes('fail') || msg.includes('required') ? '#fee2e2' : '#d1fae5', border: `1px solid ${msg.includes('fail') || msg.includes('required') ? '#fca5a5' : '#6ee7b7'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: msg.includes('fail') || msg.includes('required') ? '#dc2626' : '#065f46', fontSize: 14 }}>{msg}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['authors', 'narrators'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: tab === t ? orange : '#e5e7eb', color: tab === t ? 'white' : text, fontWeight: 700, cursor: 'pointer', fontSize: 14, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {/* ── AUTHORS TAB ── */}
      {tab === 'authors' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>

          {/* Author list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: text, fontSize: 15 }}>Authors ({authors.length})</div>
              <button onClick={() => setShowAddAuthor(!showAddAuthor)} style={{ background: orange, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ Add</button>
            </div>

            {/* Add author form */}
            {showAddAuthor && (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: text, marginBottom: 12 }}>New Author</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={inp} placeholder="Author name *" value={newAuthor.name} onChange={e => setNewAuthor(p => ({ ...p, name: e.target.value }))} />
                  <select style={sel} value={newAuthor.primary_genre} onChange={e => setNewAuthor(p => ({ ...p, primary_genre: e.target.value }))}>
                    <option value="">Primary genre</option>
                    {GENRE_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                  <select style={sel} value={newAuthor.secondary_genre} onChange={e => setNewAuthor(p => ({ ...p, secondary_genre: e.target.value }))}>
                    <option value="">Secondary genre (optional)</option>
                    {GENRE_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                  <select style={sel} value={newAuthor.narrative_voice} onChange={e => setNewAuthor(p => ({ ...p, narrative_voice: e.target.value }))}>
                    {VOICE_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                  <input style={inp} placeholder="Tone (e.g. tense, intimate)" value={newAuthor.tone} onChange={e => setNewAuthor(p => ({ ...p, tone: e.target.value }))} />
                  <select style={sel} value={newAuthor.pacing} onChange={e => setNewAuthor(p => ({ ...p, pacing: e.target.value }))}>
                    {PACING_OPTIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                  <input style={inp} placeholder="Signature style" value={newAuthor.signature} onChange={e => setNewAuthor(p => ({ ...p, signature: e.target.value }))} />
                  <textarea style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="Example line in their voice" value={newAuthor.example_line} onChange={e => setNewAuthor(p => ({ ...p, example_line: e.target.value }))} />
                  <select style={sel} value={newAuthor.narrator_voice_id} onChange={e => setNewAuthor(p => ({ ...p, narrator_voice_id: e.target.value }))}>
                    <option value="">Assign narrator (optional)</option>
                    {narrators.map(n => <option key={n.id} value={n.id}>{n.name} — {n.accent} {n.gender}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={addAuthor} style={{ flex: 1, background: orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 700 }}>Save Author</button>
                    <button onClick={() => setShowAddAuthor(false)} style={{ flex: 1, background: '#e5e7eb', color: text, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Author cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {authors.map(a => (
                <div key={a.id} onClick={() => setSelectedAuthor(a)} style={{ background: selectedAuthor?.id === a.id ? '#fff8f3' : card, border: `2px solid ${selectedAuthor?.id === a.id ? orange : border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, color: text, fontSize: 15 }}>{a.name}</div>
                    <span style={{ background: (voiceColor[a.narrative_voice] || '#9ca3af') + '20', color: voiceColor[a.narrative_voice] || '#9ca3af', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                      {VOICE_OPTIONS.find(v => v.value === a.narrative_voice)?.label || a.narrative_voice}
                    </span>
                  </div>
                  <div style={{ color: muted, fontSize: 12, marginTop: 2 }}>{a.primary_genre}{a.secondary_genre ? ` · ${a.secondary_genre}` : ''}</div>
                  {a.narrator_voices && <div style={{ color: orange, fontSize: 11, fontWeight: 600, marginTop: 4 }}>🎙️ {a.narrator_voices.name}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Author detail panel */}
          <div>
            {selectedAuthor ? (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: text }}>{selectedAuthor.name}</h2>
                    <div style={{ color: muted, fontSize: 13, marginTop: 4 }}>{selectedAuthor.primary_genre}{selectedAuthor.secondary_genre ? ` · ${selectedAuthor.secondary_genre}` : ''}</div>
                  </div>
                  <button onClick={() => deleteAuthor(selectedAuthor.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Delete</button>
                </div>

                {/* Voice profile */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Narrative Voice', value: VOICE_OPTIONS.find(v => v.value === selectedAuthor.narrative_voice)?.label },
                    { label: 'Tone', value: selectedAuthor.tone },
                    { label: 'Pacing', value: selectedAuthor.pacing },
                  ].map(f => (
                    <div key={f.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ color: text, fontWeight: 700, fontSize: 14 }}>{f.value || '—'}</div>
                    </div>
                  ))}
                </div>

                {selectedAuthor.signature && (
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                    <div style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Signature Style</div>
                    <div style={{ color: text, fontSize: 14 }}>{selectedAuthor.signature}</div>
                  </div>
                )}

                {selectedAuthor.example_line && (
                  <div style={{ background: '#fff8f3', border: `1px solid rgba(249,115,22,0.2)`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                    <div style={{ color: orange, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Example Line</div>
                    <div style={{ color: text, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>"{selectedAuthor.example_line}"</div>
                  </div>
                )}

                {/* Narrator assignment */}
                <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20, marginTop: 4 }}>
                  <div style={{ fontWeight: 800, color: text, fontSize: 15, marginBottom: 12 }}>🎙️ Paired Narrator</div>

                  {selectedAuthor.narrator_voices ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: text }}>{selectedAuthor.narrator_voices.name}</div>
                          <div style={{ color: muted, fontSize: 12 }}>{selectedAuthor.narrator_voices.accent} · {selectedAuthor.narrator_voices.gender} · {selectedAuthor.narrator_voices.tone}</div>
                        </div>
                        <button
                          onClick={() => previewVoice(selectedAuthor.narrator_voices, selectedAuthor)}
                          disabled={previewLoading}
                          style={{ background: isPlaying ? '#dc2626' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                        >
                          {previewLoading ? 'Loading...' : isPlaying ? '⏹ Stop' : '▶ Preview'}
                        </button>
                      </div>
                      {previewText && <div style={{ color: muted, fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>Playing: "{previewText}"</div>}
                    </div>
                  ) : (
                    <div style={{ color: muted, fontSize: 13, marginBottom: 12 }}>No narrator assigned yet.</div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      style={{ ...sel, flex: 1 }}
                      onChange={e => { if (e.target.value) pairNarrator(selectedAuthor.id, e.target.value) }}
                      defaultValue=""
                    >
                      <option value="">Change narrator...</option>
                      {narrators.map(n => (
                        <option key={n.id} value={n.id}>{n.name} — {n.accent} {n.gender}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✍️</div>
                <div style={{ fontWeight: 700, color: text, fontSize: 16 }}>Select an author</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Click an author on the left to see their profile and paired narrator</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NARRATORS TAB ── */}
      {tab === 'narrators' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>

          {/* Narrator list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: text, fontSize: 15 }}>Narrators ({narrators.length})</div>
              <button onClick={() => setShowAddNarrator(!showAddNarrator)} style={{ background: orange, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ Add</button>
            </div>

            {/* Add narrator form */}
            {showAddNarrator && (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: text, marginBottom: 12 }}>New Narrator</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={inp} placeholder="Narrator name *" value={newNarrator.name} onChange={e => setNewNarrator(p => ({ ...p, name: e.target.value }))} />
                  <input style={inp} placeholder="ElevenLabs Voice ID *" value={newNarrator.elevenlabs_voice_id} onChange={e => setNewNarrator(p => ({ ...p, elevenlabs_voice_id: e.target.value }))} />
                  <select style={sel} value={newNarrator.gender} onChange={e => setNewNarrator(p => ({ ...p, gender: e.target.value }))}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="neutral">Neutral</option>
                  </select>
                  <select style={sel} value={newNarrator.accent} onChange={e => setNewNarrator(p => ({ ...p, accent: e.target.value }))}>
                    {['american', 'british', 'australian', 'southern', 'neutral'].map(a => <option key={a}>{a}</option>)}
                  </select>
                  <input style={inp} placeholder="Tone (e.g. warm, resonant)" value={newNarrator.tone} onChange={e => setNewNarrator(p => ({ ...p, tone: e.target.value }))} />
                  <input style={inp} placeholder="Best genres (comma separated)" value={newNarrator.best_genres} onChange={e => setNewNarrator(p => ({ ...p, best_genres: e.target.value }))} />
                  <textarea style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="Bio" value={newNarrator.bio} onChange={e => setNewNarrator(p => ({ ...p, bio: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={addNarrator} style={{ flex: 1, background: orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 700 }}>Save Narrator</button>
                    <button onClick={() => setShowAddNarrator(false)} style={{ flex: 1, background: '#e5e7eb', color: text, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Narrator cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {narrators.map(n => {
                const pairedAuthors = authors.filter(a => a.narrator_voice_id === n.id)
                return (
                  <div key={n.id} onClick={() => setSelectedNarrator(n)} style={{ background: selectedNarrator?.id === n.id ? '#fff8f3' : card, border: `2px solid ${selectedNarrator?.id === n.id ? orange : border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 700, color: text, fontSize: 15 }}>{n.name}</div>
                      <span style={{ background: '#f3f4f6', color: muted, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{n.accent} {n.gender}</span>
                    </div>
                    <div style={{ color: muted, fontSize: 12, marginTop: 2 }}>{n.tone}</div>
                    {pairedAuthors.length > 0 && (
                      <div style={{ color: orange, fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                        ✍️ {pairedAuthors.map(a => a.name).join(', ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Narrator detail panel */}
          <div>
            {selectedNarrator ? (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: text }}>{selectedNarrator.name}</h2>
                    <div style={{ color: muted, fontSize: 13, marginTop: 4 }}>{selectedNarrator.accent} · {selectedNarrator.gender} · {selectedNarrator.tone}</div>
                  </div>
                  <button onClick={() => deleteNarrator(selectedNarrator.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Delete</button>
                </div>

                {/* Voice info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'EL Voice ID', value: selectedNarrator.elevenlabs_voice_id },
                    { label: 'Best Genres', value: Array.isArray(selectedNarrator.best_genres) ? selectedNarrator.best_genres.join(', ') : selectedNarrator.best_genres },
                  ].map(f => (
                    <div key={f.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ color: text, fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{f.value || '—'}</div>
                    </div>
                  ))}
                </div>

                {selectedNarrator.bio && (
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                    <div style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Bio</div>
                    <div style={{ color: text, fontSize: 14, lineHeight: 1.6 }}>{selectedNarrator.bio}</div>
                  </div>
                )}

                {/* Preview */}
                <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 800, color: text, fontSize: 15, marginBottom: 12 }}>Voice Preview</div>
                  <textarea
                    style={{ ...inp, height: 80, resize: 'vertical', marginBottom: 12 }}
                    placeholder="Type custom preview text, or leave blank to use a default sample..."
                    onChange={e => setPreviewText(e.target.value)}
                  />
                  <button
                    onClick={() => isPlaying ? stopPreview() : previewVoice(selectedNarrator, null)}
                    disabled={previewLoading}
                    style={{ background: isPlaying ? '#dc2626' : '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
                  >
                    {previewLoading ? 'Generating...' : isPlaying ? '⏹ Stop Preview' : '▶ Preview Voice'}
                  </button>
                </div>

                {/* Paired authors */}
                <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20 }}>
                  <div style={{ fontWeight: 800, color: text, fontSize: 15, marginBottom: 12 }}>Paired Authors</div>
                  {authors.filter(a => a.narrator_voice_id === selectedNarrator.id).length === 0 ? (
                    <div style={{ color: muted, fontSize: 13 }}>No authors paired to this narrator yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {authors.filter(a => a.narrator_voice_id === selectedNarrator.id).map(a => (
                        <div key={a.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{a.name}</div>
                            <div style={{ color: muted, fontSize: 12 }}>{a.primary_genre} · {VOICE_OPTIONS.find(v => v.value === a.narrative_voice)?.label}</div>
                          </div>
                          <button onClick={() => previewVoice(selectedNarrator, a)} style={{ background: orange, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                            Preview as {a.name}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
                <div style={{ fontWeight: 700, color: text, fontSize: 16 }}>Select a narrator</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Click a narrator on the left to preview their voice and see paired authors</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
