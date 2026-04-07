'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────
type StoryStatus = 'generating' | 'ready' | 'approved' | 'rejected'

type AIScore = {
  opening_hook: { score: number; feedback: string }
  overall_listenability: { score: number; feedback: string }
  dialogue_quality: { score: number; feedback: string }
  structure_and_pacing: { score: number; feedback: string }
  audio_suitability: { score: number; feedback: string }
  policy_compliance: { pass: boolean; feedback: string }
  composite_score: number
  recommendation: string
  top_fixes: string[]
  evaluator_summary: string
}

type Story = {
  id: string
  title: string
  author: string
  narrator: string
  genre: string
  runtime: string
  status: StoryStatus
  script: string
  ai_score: AIScore | null
  created_at: string
  notes: string
}

type Author = {
  id: string
  name: string
  primary_genre: string
  secondary_genre: string
  tone: string
  narrative_voice: string
  narrator_id: string
}

type Narrator = {
  id: string
  name: string
  elevenlabs_voice_id: string
}

const GENRES = [
  'Thriller', 'Horror', 'Dark Mystery', 'Mystery/Crime',
  'Adventure', 'Drama', 'Sci-Fi', 'Western',
  'Historical Drama', 'Supernatural', 'Family/Heartwarming', 'Comedy',
]

const RUNTIMES = ['10 min', '15 min', '20 min', '25 min']

function scoreColor(score: number, max: number) {
  const p = score / max
  if (p >= 0.88) return '#2e7d32'
  if (p >= 0.72) return '#e65100'
  return '#c62828'
}

const STATUS_CONFIG: Record<StoryStatus, { bg: string; color: string; label: string }> = {
  generating: { bg: '#e8f5e9', color: '#2e7d32', label: 'Generating...' },
  ready:      { bg: '#e8eaf6', color: '#3949ab', label: 'Ready for Review' },
  approved:   { bg: '#e0f2f1', color: '#00695c', label: 'Approved' },
  rejected:   { bg: '#ffebee', color: '#c62828', label: 'Rejected' },
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoryProductionPage() {
  const [tab, setTab] = useState<'write' | 'queue'>('write')
  const [stories, setStories] = useState<Story[]>([])
  const [selected, setSelected] = useState<Story | null>(null)
  const [authors, setAuthors] = useState<Author[]>([])
  const [narrators, setNarrators] = useState<Narrator[]>([])
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')

  // Form — just 5 fields
  const [genre, setGenre] = useState('')
  const [premise, setPremise] = useState('')
  const [runtime, setRuntime] = useState('20 min')
  const [requirements, setRequirements] = useState('')

  // Derived — auto-picked author based on genre
  const [pickedAuthor, setPickedAuthor] = useState<Author | null>(null)
  const [pickedNarrator, setPickedNarrator] = useState<Narrator | null>(null)
  const [showAuthorList, setShowAuthorList] = useState(false)
  const [matchingAuthors, setMatchingAuthors] = useState<Author[]>([])

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (genre && authors.length > 0) autoPickAuthor(genre)
    else { setPickedAuthor(null); setPickedNarrator(null) }
  }, [genre, authors])

  async function loadData() {
    const { data: aData } = await supabase
      .from('authors')
      .select('id, name, primary_genre, secondary_genre, tone, narrative_voice, narrator_id')
      .order('name')
    if (aData) setAuthors(aData as Author[])

    const { data: nData } = await supabase
      .from('narrator_voices')
      .select('id, name, elevenlabs_voice_id')
    if (nData) setNarrators(nData as Narrator[])

    const stored = localStorage.getItem('et_stories_v2')
    if (stored) {
      try { setStories(JSON.parse(stored)) } catch {}
    }
  }

  function saveStories(updated: Story[]) {
    setStories(updated)
    localStorage.setItem('et_stories_v2', JSON.stringify(updated))
  }

  function autoPickAuthor(selectedGenre: string) {
    const g = selectedGenre.toLowerCase()
    const genreMap: Record<string, string[]> = {
      'thriller': ['thriller', 'espionage', 'psychological', 'legal'],
      'horror': ['horror', 'supernatural'],
      'dark mystery': ['mystery', 'dark', 'supernatural', 'noir'],
      'mystery/crime': ['mystery', 'crime', 'noir', 'true crime'],
      'adventure': ['adventure', 'action', 'survival'],
      'drama': ['drama', 'literary', 'family'],
      'sci-fi': ['sci-fi', 'speculative', 'non-fiction'],
      'western': ['western', 'frontier'],
      'historical drama': ['historical', 'literary'],
      'supernatural': ['supernatural', 'horror'],
      'family/heartwarming': ['family', 'drama', 'comedy'],
      'comedy': ['comedy', 'drama'],
    }
    const terms = genreMap[g] || [g]

    const matches = authors.filter(a => {
      const p = (a.primary_genre || '').toLowerCase()
      const s = (a.secondary_genre || '').toLowerCase()
      return terms.some(t => p.includes(t) || s.includes(t))
    })

    setMatchingAuthors(matches)
    if (matches.length === 0) return

    const pool = matches
    const author = pool[Math.floor(Math.random() * pool.length)]
    setPickedAuthor(author)
    setShowAuthorList(false)

    if (author.narrator_id) {
      const narrator = narrators.find(n => n.id === author.narrator_id)
      setPickedNarrator(narrator || null)
    }
  }

  function pickSpecificAuthor(author: Author) {
    setPickedAuthor(author)
    setShowAuthorList(false)
    if (author.narrator_id) {
      const narrator = narrators.find(n => n.id === author.narrator_id)
      setPickedNarrator(narrator || null)
    }
  }

  function refreshAuthor() {
    if (genre) autoPickAuthor(genre)
  }

  async function generate() {
    if (!genre || !premise || !runtime ) {
      alert('Please fill in Genre, Premise, Runtime, and Music Energy.')
      return
    }
    if (!pickedAuthor) {
      alert('No author available for this genre. Try a different genre.')
      return
    }

    setGenerating(true)
    setStatus('Writing your story...')

    const storyId = `story_${Date.now()}`
    const newStory: Story = {
      id: storyId,
      title: 'Generating...',
      author: pickedAuthor.name,
      narrator: pickedNarrator?.name || 'TBD',
      genre,
      runtime,
      status: 'generating',
      script: '',
      ai_score: null,
      created_at: new Date().toISOString(),
      notes: '',
    }

    const updated = [newStory, ...stories]
    saveStories(updated)

    try {
      const prompt = `You are the Endless Tales script writer. Write a complete professional audio drama script.

AUTHOR: ${pickedAuthor.name}
AUTHOR TONE: ${pickedAuthor.tone}
AUTHOR VOICE: ${pickedAuthor.narrative_voice}
GENRE: ${genre}
RUNTIME: ${runtime}
NARRATOR: ${pickedNarrator?.name || 'Assigned narrator'}

PREMISE:
${premise}

MUSIC ENERGY: Choose the most fitting music for this genre and premise. Write a specific 2-3 sentence SUNO PROMPT describing: music genre, instrumentation, tempo, and emotional mood. Make it cinematic and specific to this story's tone.

${requirements ? `REQUIREMENTS:\n${requirements}` : ''}

FORMAT RULES:
- Start with: BELLE B INTRO\n---\nBELLE B: [single intro line with [LISTENER_NAME] and story title in quotes]\n---
- Then header: AUTHOR, GENRE, DESCRIPTION (24 words max), NARRATOR, ANNOUNCER: Belle B, NARRATIVE_VOICE, NARRATOR_IS_CHARACTER: false, SUNO PROMPT
- Then CHARACTER GUIDE with name, age, gender, accent, personality for each character
- Then [START AUDIO DRAMA SCRIPT]
- ALL CAPS CHARACTER NAME: dialogue — no parentheticals ever
- [SFX: description] on its own line
- [BEAT] and [PAUSE:X] on their own lines
- End with: BELLE B: That was "[Title]" — an Endless Tales original. Written by ${pickedAuthor.name}.

Write at ${runtime === '10 min' ? '1,300' : runtime === '15 min' ? '1,950' : runtime === '20 min' ? '2,600' : '3,250'} words of dialogue and narration (130 wpm). Output ONLY the script.`

      const resp = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 12000,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      const data = await resp.json()
      const script = data.content?.[0]?.text || ''

      // Extract title
      const titleMatch = script.match(/"([^"]{5,60})"/)
      const title = titleMatch?.[1] || `${genre} Story`

      setStatus('Grading your story...')
      const aiScore = await gradeScript(script, pickedAuthor.name, genre)

      const finished: Story = {
        ...newStory,
        title,
        status: 'ready',
        script,
        ai_score: aiScore,
      }

      const finalUpdated = updated.map(s => s.id === storyId ? finished : s)
      saveStories(finalUpdated)
      setSelected(finished)
      setTab('queue')
      setStatus('')

    } catch (err) {
      const errUpdated = updated.map(s =>
        s.id === storyId ? { ...s, status: 'rejected' as StoryStatus, notes: `Error: ${err}` } : s
      )
      saveStories(errUpdated)
      setStatus(`Failed: ${err}`)
    } finally {
      setGenerating(false)
    }
  }

  async function gradeScript(script: string, author: string, g: string): Promise<AIScore | null> {
    try {
      const resp = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Grade this Endless Tales audio drama script for commuters/truckers who cannot look at a screen. Be brutally honest.

Return ONLY valid JSON (no markdown):
{"opening_hook":{"score":0,"feedback":""},"overall_listenability":{"score":0,"feedback":""},"dialogue_quality":{"score":0,"feedback":""},"structure_and_pacing":{"score":0,"feedback":""},"audio_suitability":{"score":0,"feedback":""},"policy_compliance":{"pass":true,"feedback":""},"composite_score":0,"recommendation":"Proceed","top_fixes":[],"evaluator_summary":""}

Scores 1-10. Weights: opening_hook 25%, overall_listenability 25%, dialogue_quality 20%, structure_and_pacing 15%, audio_suitability 15%. Policy fail = auto Rejected.

Author: ${author} | Genre: ${g}

SCRIPT:
${script.slice(0, 5000)}`
          }]
        })
      })
      const data = await resp.json()
      const raw = data.content?.[0]?.text?.replace(/```json|```/g, '').trim()
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function approve() {
    if (!selected) return
    const updated = stories.map(s => s.id === selected.id ? { ...s, status: 'approved' as StoryStatus } : s)
    saveStories(updated)
    setSelected({ ...selected, status: 'approved' })
  }

  function reject(reason: string) {
    if (!selected) return
    const updated = stories.map(s => s.id === selected.id ? { ...s, status: 'rejected' as StoryStatus, notes: reason } : s)
    saveStories(updated)
    setSelected({ ...selected, status: 'rejected', notes: reason })
  }

  const approvedStories = stories.filter(s => s.status === 'approved')
  const pendingStories = stories.filter(s => s.status === 'ready' || s.status === 'generating')

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Georgia, serif', color: '#111' }}>

      {/* Status bar */}
      {status && (
        <div style={{ background: '#e8f5e9', borderBottom: '1px solid #c8e6c9', padding: '12px 32px', color: '#2e7d32', fontSize: 15 }}>
          ● {status}
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid #e0e0e0', padding: '0 32px', display: 'flex', gap: 0 }}>
        {(['write', 'queue'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #111' : '2px solid transparent',
            marginBottom: -2, padding: '16px 24px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 16, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#111' : '#888', textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {t === 'write' ? 'Write a Story' : `Queue (${approvedStories.length} approved)`}
          </button>
        ))}
      </div>

      {/* ── WRITE TAB ── */}
      {tab === 'write' && (
        <div style={{ padding: '36px 40px', maxWidth: 800 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold', color: '#111' }}>
            New Story
          </h1>
          <p style={{ margin: '0 0 36px', fontSize: 16, color: '#666' }}>
            Fill in the essentials. Claude picks the author and narrator automatically.
          </p>

          {/* Field 1: Genre */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Genre <span style={{ color: '#c62828' }}>*</span></label>
            <select value={genre} onChange={e => setGenre(e.target.value)} style={inputStyle}>
              <option value="">Select a genre...</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Auto-picked author card */}
          {pickedAuthor && (
            <div style={{
              marginBottom: 28, padding: '16px 20px',
              background: '#f8f8f8', border: '1px solid #e0e0e0',
              borderLeft: '4px solid #111', borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Claude selected this author for {genre}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 6 }}>
                    {pickedAuthor.name}
                  </div>
                  <div style={{ fontSize: 15, color: '#444', marginBottom: 4 }}>
                    {pickedAuthor.primary_genre}
                    {pickedAuthor.secondary_genre ? ` · ${pickedAuthor.secondary_genre}` : ''}
                    {' · '}{(pickedAuthor.narrative_voice || '').replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 14, color: '#666', fontStyle: 'italic' }}>
                    {pickedAuthor.tone}
                  </div>
                  {pickedNarrator && (
                    <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                      🎙 Narrator: <strong>{pickedNarrator.name}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => setShowAuthorList(!showAuthorList)} style={{
                    background: 'none', border: '1px solid #ccc', borderRadius: 6,
                    padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                    color: '#555', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                    {showAuthorList ? '▲ Hide list' : '↻ Different author'}
                  </button>
                  <button onClick={refreshAuthor} style={{
                    background: 'none', border: '1px solid #ccc', borderRadius: 6,
                    padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                    color: '#555', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                    🎲 Random pick
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Author list */}
          {showAuthorList && matchingAuthors.length > 0 && (
            <div style={{ marginBottom: 28, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: '#f5f5f5', borderBottom: '1px solid #e0e0e0', fontSize: 13, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                {matchingAuthors.length} authors match "{genre}" — click to select
              </div>
              {matchingAuthors.map(a => {
                const n = narrators.find(nr => nr.id === a.narrator_id)
                const isSel = pickedAuthor?.id === a.id
                return (
                  <div key={a.id} onClick={() => pickSpecificAuthor(a)} style={{
                    padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    background: isSel ? '#f0f4ff' : '#fff',
                    borderLeft: isSel ? '4px solid #111' : '4px solid transparent',
                  }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>
                          {a.name} {isSel && <span style={{ fontSize: 12, color: '#3949ab', marginLeft: 8 }}>✓ Selected</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>
                          {a.primary_genre}{a.secondary_genre ? ` · ${a.secondary_genre}` : ''} · {(a.narrative_voice || '').replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>{a.tone}</div>
                      </div>
                      {n && <div style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap', marginLeft: 16 }}>🎙 {n.name}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Field 2: Premise */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>
              Premise <span style={{ color: '#c62828' }}>*</span>
              <span style={{ color: '#888', fontSize: 14, fontWeight: 'normal', marginLeft: 8 }}>
                — Who is the protagonist? What do they want? What's at stake?
              </span>
            </label>
            <textarea
              value={premise}
              onChange={e => setPremise(e.target.value)}
              rows={5}
              placeholder="A retired crab fisherman takes one final voyage to save his daughter's boat from repossession before dawn..."
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Field 3: Runtime */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Runtime <span style={{ color: '#c62828' }}>*</span></label>
            <div style={{ display: 'flex', gap: 12 }}>
              {RUNTIMES.map(r => (
                <button key={r} onClick={() => setRuntime(r)} style={{
                  flex: 1, padding: '14px 0', border: `2px solid ${runtime === r ? '#111' : '#e0e0e0'}`,
                  background: runtime === r ? '#111' : '#fff',
                  color: runtime === r ? '#fff' : '#444',
                  borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 16, fontWeight: runtime === r ? 700 : 400,
                }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Field 4: Requirements (optional) */}
          <div style={{ marginBottom: 36 }}>
            <label style={labelStyle}>
              Special Requirements
              <span style={{ color: '#888', fontSize: 14, fontWeight: 'normal', marginLeft: 8 }}>
                — Optional. Anything Claude must include, avoid, or handle carefully.
              </span>
            </label>
            <textarea
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
              rows={3}
              placeholder="Resolved ending. No supernatural elements. Write in the style of Raymond Chandler..."
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating || !genre || !premise }
            style={{
              background: generating || !genre || !premise  ? '#ccc' : '#111',
              color: generating || !genre || !premise  ? '#888' : '#fff',
              border: 'none', borderRadius: 8, padding: '18px 48px',
              cursor: generating || !genre || !premise  ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 18, fontWeight: 700,
              letterSpacing: 1, textTransform: 'uppercase',
            }}
          >
            {generating ? 'Writing Story...' : 'Generate Story'}
          </button>

          {generating && (
            <p style={{ marginTop: 16, fontSize: 15, color: '#666' }}>
              This takes about 60–90 seconds. Claude is writing and grading your story.
            </p>
          )}

          {/* Pending stories notice */}
          {pendingStories.length > 0 && (
            <div style={{ marginTop: 32, padding: '16px 20px', background: '#e8eaf6', borderRadius: 8 }}>
              <span style={{ fontSize: 15, color: '#3949ab' }}>
                {pendingStories.length} {pendingStories.length === 1 ? 'story' : 'stories'} ready for review →{' '}
              </span>
              <button onClick={() => setTab('queue')} style={{
                background: 'none', border: 'none', color: '#3949ab', fontWeight: 700,
                cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', textDecoration: 'underline',
              }}>
                Go to Queue
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── QUEUE TAB ── */}
      {tab === 'queue' && (
        <div style={{ padding: '36px 40px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold', color: '#111' }}>
            Story Queue
          </h1>
          <p style={{ margin: '0 0 32px', fontSize: 16, color: '#666' }}>
            {approvedStories.length} approved and ready to batch send to Hal.
            {pendingStories.length > 0 && ` ${pendingStories.length} waiting for your review.`}
          </p>

          {/* Send to Hal button */}
          {approvedStories.length > 0 && (
            <div style={{
              marginBottom: 28, padding: '16px 20px',
              background: '#e0f2f1', border: '1px solid #b2dfdb',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#00695c' }}>
                  {approvedStories.length} {approvedStories.length === 1 ? 'story' : 'stories'} approved
                </div>
                <div style={{ fontSize: 14, color: '#00695c', marginTop: 4 }}>
                  Send these to Hal via Telegram when ready to produce
                </div>
              </div>
              <button
                onClick={() => {
                  const titles = approvedStories.map(s => `• ${s.title} (${s.author}, ${s.runtime})`).join('\n')
                  navigator.clipboard.writeText(`HAL — Please produce these stories:\n\n${titles}\n\nScripts are in the Story Production queue. Run the full ASC pipeline on each. Set is_hidden = true. Send UUIDs when done.`)
                  alert('Hal instruction copied to clipboard — paste into Telegram')
                }}
                style={{
                  background: '#00695c', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '12px 20px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                }}
              >
                Copy Hal Instruction
              </button>
            </div>
          )}

          {stories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
              <p style={{ fontSize: 16 }}>No stories yet. Go to Write a Story to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {stories.map(s => {
                const st = STATUS_CONFIG[s.status]
                const ai = s.ai_score?.composite_score
                const aiOf25 = ai ? (ai * 2.5).toFixed(1) : null
                const isSelected = selected?.id === s.id

                return (
                  <div
                    key={s.id}
                    onClick={() => setSelected(isSelected ? null : s)}
                    style={{
                      background: '#fff', border: `2px solid ${isSelected ? '#111' : '#e0e0e0'}`,
                      borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                    }}
                  >
                    {/* Story header */}
                    <div style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4 }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: 14, color: '#666' }}>
                          {s.author} · {s.genre} · {s.runtime}
                          {s.narrator && ` · Narrator: ${s.narrator}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {aiOf25 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(parseFloat(aiOf25), 25) }}>
                              {aiOf25}
                            </div>
                            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>/ 25</div>
                          </div>
                        )}
                        <span style={{
                          background: st.bg, color: st.color,
                          padding: '4px 14px', borderRadius: 20,
                          fontSize: 13, fontWeight: 700,
                        }}>
                          {st.label}
                        </span>
                        <span style={{ color: '#aaa', fontSize: 20 }}>{isSelected ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded view */}
                    {isSelected && (
                      <div style={{ borderTop: '1px solid #e0e0e0' }}>

                        {/* Action buttons */}
                        {s.status === 'ready' && (
                          <div style={{ padding: '16px 24px', background: '#f8f8f8', display: 'flex', gap: 12, borderBottom: '1px solid #e0e0e0' }}>
                            <button onClick={e => { e.stopPropagation(); approve() }} style={{
                              background: '#2e7d32', color: '#fff', border: 'none',
                              borderRadius: 6, padding: '12px 24px', cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                            }}>
                              ✓ Approve for Hal
                            </button>
                            <button onClick={e => {
                              e.stopPropagation()
                              const reason = prompt('Reason for rejection?')
                              if (reason !== null) reject(reason)
                            }} style={{
                              background: '#fff', color: '#c62828',
                              border: '1px solid #c62828', borderRadius: 6,
                              padding: '12px 24px', cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                            }}>
                              Reject
                            </button>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0 }}>

                          {/* Script */}
                          <div style={{ borderRight: '1px solid #e0e0e0' }}>
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e0e0e0', fontSize: 12, color: '#888', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
                              Script
                            </div>
                            <pre style={{
                              margin: 0, padding: 20, fontSize: 13, lineHeight: 1.7,
                              color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              maxHeight: 500, overflowY: 'auto',
                              fontFamily: 'Courier New, monospace',
                            }}>
                              {s.script.split('\n').map((line, i) => {
                                if (line.match(/^\[SFX:|^\[MUSIC:|^\[BEAT\]|^\[PAUSE/))
                                  return <span key={i} style={{ color: '#3949ab' }}>{line}{'\n'}</span>
                                if (line.match(/^[A-Z][A-Z\s]+:/))
                                  return <span key={i} style={{ color: '#e65100', fontWeight: 700 }}>{line}{'\n'}</span>
                                return <span key={i}>{line}{'\n'}</span>
                              })}
                            </pre>
                          </div>

                          {/* AI Score */}
                          <div style={{ padding: 20 }}>
                            <div style={{ fontSize: 12, color: '#888', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>
                              AI Script Grade
                            </div>

                            {s.ai_score ? (
                              <>
                                <div style={{
                                  background: s.ai_score.recommendation === 'Proceed' ? '#e8f5e9' : s.ai_score.recommendation === 'Revise and Resubmit' ? '#fff3e0' : '#ffebee',
                                  color: s.ai_score.recommendation === 'Proceed' ? '#2e7d32' : s.ai_score.recommendation === 'Revise and Resubmit' ? '#e65100' : '#c62828',
                                  padding: '8px 14px', borderRadius: 6,
                                  fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 16,
                                }}>
                                  {s.ai_score.recommendation}
                                </div>

                                {([
                                  { key: 'opening_hook', label: 'Hook', weight: '25%' },
                                  { key: 'overall_listenability', label: 'Listenability', weight: '25%' },
                                  { key: 'dialogue_quality', label: 'Dialogue', weight: '20%' },
                                  { key: 'structure_and_pacing', label: 'Pacing', weight: '15%' },
                                  { key: 'audio_suitability', label: 'Audio', weight: '15%' },
                                ] as const).map(({ key, label, weight }) => {
                                  const dim = s.ai_score![key] as { score: number; feedback: string }
                                  if (!dim) return null
                                  return (
                                    <div key={key} style={{ marginBottom: 12 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 13, color: '#555' }}>{label} <span style={{ color: '#aaa', fontSize: 11 }}>({weight})</span></span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(dim.score, 10) }}>{dim.score}/10</span>
                                      </div>
                                      <div style={{ height: 4, background: '#eee', borderRadius: 2 }}>
                                        <div style={{ height: '100%', width: `${dim.score * 10}%`, background: scoreColor(dim.score, 10), borderRadius: 2 }} />
                                      </div>
                                      <div style={{ marginTop: 3, fontSize: 12, color: '#888', lineHeight: 1.4 }}>{dim.feedback}</div>
                                    </div>
                                  )
                                })}

                                <div style={{ background: s.ai_score.policy_compliance.pass ? '#e8f5e9' : '#ffebee', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: s.ai_score.policy_compliance.pass ? '#2e7d32' : '#c62828' }}>
                                    {s.ai_score.policy_compliance.pass ? '✓ Policy Pass' : '✗ Policy FAIL'}
                                  </span>
                                </div>

                                {s.ai_score.top_fixes?.length > 0 && (
                                  <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 12, color: '#888', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Top Fixes</div>
                                    {s.ai_score.top_fixes.map((fix, i) => (
                                      <div key={i} style={{ fontSize: 13, color: '#e65100', marginBottom: 4 }}>{i + 1}. {fix}</div>
                                    ))}
                                  </div>
                                )}

                                <div style={{ marginTop: 12, fontSize: 13, color: '#666', fontStyle: 'italic', lineHeight: 1.5, borderTop: '1px solid #eee', paddingTop: 12 }}>
                                  {s.ai_score.evaluator_summary}
                                </div>
                              </>
                            ) : (
                              <div style={{ color: '#aaa', fontSize: 14 }}>No grade available.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 17, fontWeight: 700,
  color: '#111', marginBottom: 10,
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff',
  border: '1px solid #ccc', borderRadius: 8,
  padding: '12px 16px', color: '#111',
  fontSize: 16, fontFamily: 'Georgia, serif',
  outline: 'none', boxSizing: 'border-box',
}
