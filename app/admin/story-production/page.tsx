'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ───────────────────────────────────────────────────────────────────

type StoryStatus = 'draft' | 'generating' | 'scored' | 'accepted' | 'rejected' | 'in_production' | 'published'

type AIScore = {
  opening_hook: { score: number; feedback: string; issues: string[] }
  overall_listenability: { score: number; feedback: string; issues: string[] }
  dialogue_quality: { score: number; feedback: string; issues: string[] }
  structure_and_pacing: { score: number; feedback: string; issues: string[] }
  audio_suitability: { score: number; feedback: string; issues: string[] }
  policy_compliance: { pass: boolean; flags: string[]; feedback: string }
  composite_score: number
  recommendation: 'Proceed' | 'Revise and Resubmit' | 'Rejected'
  top_fixes: string[]
  evaluator_summary: string
}

type HumanScore = {
  hook: number
  clarity: number
  pacing: number
  audio_quality: number
  landing: number
}

type StoryRecord = {
  id: string
  title: string
  author: string
  genre: string
  runtime: string
  status: StoryStatus
  script: string
  brief: Record<string, string>
  ai_score: AIScore | null
  human_score: HumanScore | null
  story_uuid: string | null
  created_at: string
  notes: string
}

type Author = {
  id: string
  name: string
  primary_genre: string
  tone: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GENRES = [
  'Thriller', 'Horror', 'Dark Mystery', 'Mystery/Crime',
  'Adventure', 'Drama', 'Sci-Fi', 'Western',
  'Historical Drama', 'Supernatural', 'Family/Heartwarming'
]

const RUNTIMES = ['10 min', '15 min', '20 min', '25 min']

const MUSIC_ENERGY_EXAMPLES = [
  'Slow-burn dread — sparse, minimal, tension underneath everything',
  'Driving and kinetic — pulse-based, forward momentum, no vocals',
  'Warm and melancholic — acoustic, unhurried, bittersweet',
  'Atmospheric and expansive — cinematic, wide, documentary feel',
  'Tense procedural — low strings, clock-like rhythm, urban cold',
  'Mournful and atmospheric — church organ undertones, something sacred gone wrong',
]

const STATUS_COLORS: Record<StoryStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: '#2a2a2a', text: '#888', label: 'Draft' },
  generating: { bg: '#1a2a1a', text: '#4caf50', label: 'Generating...' },
  scored: { bg: '#1a1a2a', text: '#7c9ef5', label: 'Scored' },
  accepted: { bg: '#1a2a1a', text: '#66bb6a', label: 'Accepted' },
  rejected: { bg: '#2a1a1a', text: '#ef5350', label: 'Rejected' },
  in_production: { bg: '#2a1f1a', text: '#ffa726', label: 'In Production' },
  published: { bg: '#1a2a24', text: '#26a69a', label: 'Published' },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StoryProductionPage() {
  const [view, setView] = useState<'queue' | 'brief' | 'review'>('queue')
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(null)
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // Brief form state
  const [brief, setBrief] = useState({
    title: '',
    type: 'standalone',
    series_name: '',
    episode_number: '',
    series_total: '',
    is_finale: 'false',
    author: '',
    genre: '',
    narrative_voice: '',
    premise: '',
    setting: '',
    runtime: '20 min',
    characters: '',
    requirements: '',
    previous_episode: '',
    next_episode: '',
    music_energy: '',
    music_reference: '',
    music_moments: '',
    sfx_density: 'standard',
    sfx_environments: '',
    audio_notes: '',
    belle_b_intro: '',
    listener_gender_skew: 'neutral',
    description: '',
  })

  useEffect(() => {
    loadAuthors()
    loadStories()
  }, [])

  async function loadAuthors() {
    const { data } = await supabase
      .from('authors')
      .select('id, name, primary_genre, tone')
      .order('name')
    if (data) setAuthors(data)
  }

  async function loadStories() {
    // Load from localStorage for now — in production this would be a Supabase table
    const stored = localStorage.getItem('et_story_production')
    if (stored) {
      try { setStories(JSON.parse(stored)) } catch {}
    }
  }

  function saveStories(updated: StoryRecord[]) {
    setStories(updated)
    localStorage.setItem('et_story_production', JSON.stringify(updated))
  }

  // ─── Brief → Script string ───────────────────────────────────────────────

  function buildBriefText(): string {
    const b = brief
    return `TITLE: ${b.title || '(Claude suggests)'}
TYPE: ${b.type}
${b.type === 'series' ? `SERIES_NAME: ${b.series_name}
EPISODE_NUMBER: ${b.episode_number}
SERIES_TOTAL_EPISODES: ${b.series_total}
IS_FINALE: ${b.is_finale}` : ''}

AUTHOR: ${b.author}
GENRE: ${b.genre}
${b.narrative_voice ? `NARRATIVE_VOICE: ${b.narrative_voice}` : ''}
RUNTIME: ${b.runtime}

PREMISE:
${b.premise}

SETTING:
${b.setting}

CHARACTERS:
${b.characters || '(Claude creates from premise)'}

REQUIREMENTS:
${b.requirements || '(none)'}

${b.type === 'series' && b.previous_episode ? `PREVIOUS_EPISODE:\n${b.previous_episode}\n` : ''}
${b.type === 'series' && b.next_episode ? `NEXT_EPISODE:\n${b.next_episode}\n` : ''}

MUSIC_ENERGY: ${b.music_energy}
MUSIC_REFERENCE: ${b.music_reference || '(none)'}
MUSIC_MOMENTS:
${b.music_moments || '(Claude determines from premise)'}

SFX_DENSITY: ${b.sfx_density}
SFX_ENVIRONMENTS:
${b.sfx_environments || '(Claude determines from setting)'}

AUDIO_NOTES:
${b.audio_notes || '(none)'}

BELLE_B_INTRO: ${b.belle_b_intro || '(Claude writes from premise and genre)'}
LISTENER_GENDER_SKEW: ${b.listener_gender_skew}
DESCRIPTION: ${b.description || '(Claude writes — 24 words max)'}`
  }

  // ─── Generate Script ─────────────────────────────────────────────────────

  async function generateScript() {
    if (!brief.author || !brief.genre || !brief.premise || !brief.setting || !brief.runtime || !brief.music_energy) {
      alert('Please fill in all required fields: Author, Genre, Premise, Setting, Runtime, and Music Energy.')
      return
    }

    setGenerating(true)
    setStatusMsg('Sending brief to Claude...')

    const storyId = `story_${Date.now()}`
    const newStory: StoryRecord = {
      id: storyId,
      title: brief.title || 'Untitled',
      author: brief.author,
      genre: brief.genre,
      runtime: brief.runtime,
      status: 'generating',
      script: '',
      brief: { ...brief },
      ai_score: null,
      human_score: null,
      story_uuid: null,
      created_at: new Date().toISOString(),
      notes: '',
    }

    const updated = [newStory, ...stories]
    saveStories(updated)

    try {
      // Fetch the Stage 2 prompt
      const stage2Response = await fetch('/api/docs/stage2-prompt')
      const stage2Text = stage2Response.ok ? await stage2Response.text() : FALLBACK_STAGE2_PROMPT

      const briefText = buildBriefText()

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: stage2Text,
          messages: [
            {
              role: 'user',
              content: `Here is the completed Story Brief. Write the script.\n\n${briefText}`
            }
          ]
        })
      })

      const data = await response.json()
      const script = data.content?.[0]?.text || ''

      setStatusMsg('Script generated. Running quality evaluation...')
      setScoring(true)

      // Run AI quality evaluation
      const aiScore = await evaluateScript(script, brief.author, brief.genre)

      // Extract title from script if not provided
      const titleMatch = script.match(/EPISODE_TITLE:\s*(.+)/) || script.match(/"([^"]+)"/)
      const extractedTitle = brief.title || titleMatch?.[1] || 'Untitled'

      const finalStory: StoryRecord = {
        ...newStory,
        title: extractedTitle,
        status: 'scored',
        script,
        ai_score: aiScore,
      }

      const finalUpdated = updated.map(s => s.id === storyId ? finalStory : s)
      saveStories(finalUpdated)
      setSelectedStory(finalStory)
      setView('review')
      setStatusMsg('')

    } catch (err) {
      console.error('Generation error:', err)
      const errUpdated = updated.map(s =>
        s.id === storyId ? { ...s, status: 'draft' as StoryStatus, notes: `Error: ${err}` } : s
      )
      saveStories(errUpdated)
      setStatusMsg('Generation failed. Check console.')
    } finally {
      setGenerating(false)
      setScoring(false)
    }
  }

  // ─── AI Quality Evaluation ───────────────────────────────────────────────

  async function evaluateScript(script: string, author: string, genre: string): Promise<AIScore | null> {
    try {
      const evalPrompt = `You are a brutally honest script editor evaluating an Endless Tales audio drama script before it goes into production. These stories are for commuters and long-haul truckers driving on highways. They cannot look at a screen. If a story confuses, bores, or requires visual context it will be switched off within 60 seconds.

Evaluate this script across these dimensions and return ONLY valid JSON — no other text, no markdown fences:

{
  "opening_hook": { "score": <1-10>, "feedback": "<specific feedback>", "issues": [] },
  "overall_listenability": { "score": <1-10>, "feedback": "<specific feedback>", "issues": [] },
  "dialogue_quality": { "score": <1-10>, "feedback": "<specific feedback>", "issues": [] },
  "structure_and_pacing": { "score": <1-10>, "feedback": "<specific feedback>", "issues": [] },
  "audio_suitability": { "score": <1-10>, "feedback": "<specific feedback>", "issues": [] },
  "policy_compliance": { "pass": true/false, "flags": [], "feedback": "<notes>" },
  "composite_score": <weighted average: hook 25% + listenability 25% + dialogue 20% + structure 15% + audio 15%>,
  "recommendation": "<Proceed|Revise and Resubmit|Rejected>",
  "top_fixes": ["<fix 1>", "<fix 2>"],
  "evaluator_summary": "<2-3 sentence honest overall assessment>"
}

Author: ${author}
Genre: ${genre}

SCRIPT:
${script.slice(0, 6000)}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: evalPrompt }]
        })
      })

      const data = await response.json()
      const raw = data.content?.[0]?.text?.replace(/```json|```/g, '').trim()
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  // ─── Accept / Reject / Modify ────────────────────────────────────────────

  function acceptStory() {
    if (!selectedStory) return
    const updated = stories.map(s =>
      s.id === selectedStory.id ? { ...s, status: 'accepted' as StoryStatus } : s
    )
    saveStories(updated)
    setSelectedStory({ ...selectedStory, status: 'accepted' })
    setStatusMsg('✅ Accepted. Send script to Hal via Telegram to begin production.')
  }

  function rejectStory(reason: string) {
    if (!selectedStory) return
    const updated = stories.map(s =>
      s.id === selectedStory.id ? { ...s, status: 'rejected' as StoryStatus, notes: reason } : s
    )
    saveStories(updated)
    setSelectedStory({ ...selectedStory, status: 'rejected', notes: reason })
  }

  async function modifyStory(notes: string) {
    if (!selectedStory) return
    setGenerating(true)
    setStatusMsg('Requesting revision from Claude...')

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          messages: [
            { role: 'user', content: `Here is the original story brief:\n\n${buildBriefText()}\n\nHere is the current script:\n\n${selectedStory.script}\n\nPlease revise the script based on these notes:\n\n${notes}\n\nOutput only the complete revised script with no preamble.` }
          ]
        })
      })

      const data = await response.json()
      const revisedScript = data.content?.[0]?.text || ''

      setStatusMsg('Revision complete. Re-evaluating...')
      const aiScore = await evaluateScript(revisedScript, selectedStory.author, selectedStory.genre)

      const revised: StoryRecord = {
        ...selectedStory,
        script: revisedScript,
        ai_score: aiScore,
        status: 'scored',
        notes,
      }

      const updated = stories.map(s => s.id === selectedStory.id ? revised : s)
      saveStories(updated)
      setSelectedStory(revised)
      setStatusMsg('')
    } catch (err) {
      setStatusMsg(`Revision failed: ${err}`)
    } finally {
      setGenerating(false)
    }
  }

  function saveHumanScore(score: HumanScore) {
    if (!selectedStory) return
    const updated = stories.map(s =>
      s.id === selectedStory.id ? { ...s, human_score: score } : s
    )
    saveStories(updated)
    setSelectedStory({ ...selectedStory, human_score: score })
  }

  function setStoryUUID(uuid: string) {
    if (!selectedStory) return
    const updated = stories.map(s =>
      s.id === selectedStory.id ? { ...s, story_uuid: uuid, status: 'in_production' as StoryStatus } : s
    )
    saveStories(updated)
    setSelectedStory({ ...selectedStory, story_uuid: uuid, status: 'in_production' })
  }

  function publishStory() {
    if (!selectedStory) return
    const updated = stories.map(s =>
      s.id === selectedStory.id ? { ...s, status: 'published' as StoryStatus } : s
    )
    saveStories(updated)
    setSelectedStory({ ...selectedStory, status: 'published' })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      color: '#e8e8e8',
      fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      {/* Header */}
      <div style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', letterSpacing: 1 }}>
            ENDLESS TALES
          </span>
          <span style={{ color: '#444', fontSize: 14 }}>/ Story Production</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['queue', 'brief'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? '#000' : '#888',
                border: '1px solid ' + (view === v ? '#fff' : '#333'),
                borderRadius: 6,
                padding: '6px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {v === 'queue' ? 'Story Queue' : 'New Story'}
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      {statusMsg && (
        <div style={{
          background: '#1a2a1a',
          borderBottom: '1px solid #2a3a2a',
          padding: '10px 32px',
          color: '#66bb6a',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ animation: 'pulse 1s infinite' }}>●</span>
          {statusMsg}
        </div>
      )}

      {/* Views */}
      {view === 'queue' && (
        <QueueView
          stories={stories}
          onSelect={(s) => { setSelectedStory(s); setView('review') }}
          onNew={() => setView('brief')}
        />
      )}

      {view === 'brief' && (
        <BriefForm
          brief={brief}
          setBrief={setBrief}
          authors={authors}
          onGenerate={generateScript}
          generating={generating}
          buildBriefText={buildBriefText}
        />
      )}

      {view === 'review' && selectedStory && (
        <ReviewView
          story={selectedStory}
          onAccept={acceptStory}
          onReject={rejectStory}
          onModify={modifyStory}
          onSaveHumanScore={saveHumanScore}
          onSetUUID={setStoryUUID}
          onPublish={publishStory}
          onBack={() => setView('queue')}
          generating={generating}
          statusMsg={statusMsg}
        />
      )}
    </div>
  )
}

// ─── Queue View ───────────────────────────────────────────────────────────────

function QueueView({ stories, onSelect, onNew }: {
  stories: StoryRecord[]
  onSelect: (s: StoryRecord) => void
  onNew: () => void
}) {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 'normal', color: '#fff' }}>
          Story Queue
          <span style={{ color: '#555', fontSize: 14, marginLeft: 12 }}>
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </span>
        </h1>
        <button
          onClick={onNew}
          style={{
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 'bold',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          + New Story
        </button>
      </div>

      {stories.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 32px',
          color: '#444',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📖</div>
          <p style={{ fontSize: 16, margin: 0 }}>No stories yet. Start with a new brief.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                {['Title', 'Author', 'Genre', 'Runtime', 'AI Score', 'Human Score', 'Status', 'Date'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '8px 16px',
                    color: '#555',
                    fontSize: 11,
                    fontWeight: 'normal',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stories.map(story => {
                const sc = STATUS_COLORS[story.status]
                const aiComposite = story.ai_score?.composite_score
                const aiDisplay = aiComposite ? `${(aiComposite * 2.5).toFixed(1)}/25` : '—'
                const humanTotal = story.human_score
                  ? Object.values(story.human_score).reduce((a, b) => a + b, 0)
                  : null
                const humanDisplay = humanTotal !== null ? `${humanTotal}/25` : '—'

                return (
                  <tr
                    key={story.id}
                    onClick={() => onSelect(story)}
                    style={{
                      borderBottom: '1px solid #1a1a1a',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px', color: '#fff', fontWeight: 'bold' }}>
                      {story.title}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#aaa' }}>{story.author}</td>
                    <td style={{ padding: '14px 16px', color: '#aaa' }}>{story.genre}</td>
                    <td style={{ padding: '14px 16px', color: '#aaa' }}>{story.runtime}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        color: aiComposite
                          ? aiComposite >= 7.5 ? '#66bb6a' : aiComposite >= 5 ? '#ffa726' : '#ef5350'
                          : '#555',
                        fontWeight: 'bold',
                      }}>{aiDisplay}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        color: humanTotal !== null
                          ? humanTotal >= 22 ? '#66bb6a' : humanTotal >= 18 ? '#ffa726' : '#ef5350'
                          : '#555',
                        fontWeight: 'bold',
                      }}>{humanDisplay}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        background: sc.bg,
                        color: sc.text,
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontFamily: 'monospace',
                      }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#555', fontSize: 12 }}>
                      {new Date(story.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Brief Form ───────────────────────────────────────────────────────────────

function BriefForm({ brief, setBrief, authors, onGenerate, generating, buildBriefText }: {
  brief: Record<string, string>
  setBrief: (b: Record<string, string>) => void
  authors: Author[]
  onGenerate: () => void
  generating: boolean
  buildBriefText: () => string
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setBrief({ ...brief, [key]: e.target.value })

  const selectedAuthor = authors.find(a => a.name === brief.author)

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 32px', fontSize: 22, fontWeight: 'normal', color: '#fff' }}>
        New Story Brief
      </h1>

      {/* Part 1: Story Identity */}
      <Section title="PART 1 — STORY IDENTITY">
        <Row>
          <Field label="Title" hint="Leave blank — Claude will suggest one">
            <Input value={brief.title} onChange={set('title')} placeholder="Working title or leave blank" />
          </Field>
          <Field label="Type" required>
            <Select value={brief.type} onChange={set('type')}>
              <option value="standalone">Standalone</option>
              <option value="series">Series</option>
            </Select>
          </Field>
        </Row>
        {brief.type === 'series' && (
          <Row>
            <Field label="Series Name" required>
              <Input value={brief.series_name} onChange={set('series_name')} />
            </Field>
            <Field label="Episode #" required>
              <Input value={brief.episode_number} onChange={set('episode_number')} placeholder="1" />
            </Field>
            <Field label="Total Episodes" required>
              <Input value={brief.series_total} onChange={set('series_total')} placeholder="6" />
            </Field>
            <Field label="Is Finale?">
              <Select value={brief.is_finale} onChange={set('is_finale')}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </Field>
          </Row>
        )}
      </Section>

      {/* Part 2: Author & Genre */}
      <Section title="PART 2 — AUTHOR & GENRE">
        <Row>
          <Field label="Author" required>
            <Select value={brief.author} onChange={set('author')}>
              <option value="">Select author...</option>
              {authors.filter(a => !['Agatha Christie', 'Stephen King', 'Neil Gaiman', 'O. Henry',
                'Ray Bradbury', 'Raymond Chandler', 'Richard Matheson', 'Roald Dahl',
                'Rod Serling', 'Shirley Jackson', 'Arthur Conan Doyle', 'Elmore Leonard', 'Edgar Allan Poe'
              ].includes(a.name)).map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </Select>
            {selectedAuthor && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                {selectedAuthor.primary_genre} · {selectedAuthor.tone}
              </div>
            )}
          </Field>
          <Field label="Genre" required>
            <Select value={brief.genre} onChange={set('genre')}>
              <option value="">Select genre...</option>
              {['Thriller', 'Horror', 'Dark Mystery', 'Mystery/Crime', 'Adventure', 'Drama',
                'Sci-Fi', 'Western', 'Historical Drama', 'Supernatural', 'Family/Heartwarming'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Narrative Voice" hint="Leave blank to use author default">
            <Select value={brief.narrative_voice} onChange={set('narrative_voice')}>
              <option value="">Author default</option>
              <option value="first_person">First Person</option>
              <option value="third_limited">Third Limited</option>
              <option value="third_omniscient">Third Omniscient</option>
            </Select>
          </Field>
        </Row>
      </Section>

      {/* Part 3: Story Content */}
      <Section title="PART 3 — STORY CONTENT">
        <Field label="Premise" required hint="2–5 sentences. Who is the protagonist? What do they want? What's at stake?">
          <Textarea value={brief.premise} onChange={set('premise')} rows={5}
            placeholder="A parish priest is found strangled in the confessional..." />
        </Field>
        <Field label="Setting" required hint="Time period, location, and specific environmental details">
          <Textarea value={brief.setting} onChange={set('setting')} rows={3}
            placeholder="South Boston, present day. Winter. Cold that gets into the bones..." />
        </Field>
        <Row>
          <Field label="Runtime" required>
            <Select value={brief.runtime} onChange={set('runtime')}>
              {['10 min', '15 min', '20 min', '25 min'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </Row>
        <Field label="Characters" hint="Leave blank — Claude creates from premise">
          <Textarea value={brief.characters} onChange={set('characters')} rows={3}
            placeholder="Name, role, key traits. Or leave blank." />
        </Field>
        <Field label="Requirements" hint="Plot points, themes, exclusions, style references">
          <Textarea value={brief.requirements} onChange={set('requirements')} rows={3}
            placeholder="Resolved ending. No supernatural elements. Write in the style of Raymond Chandler..." />
        </Field>
        {brief.type === 'series' && (
          <>
            <Field label="Previous Episode Summary" required={brief.episode_number !== '1'}>
              <Textarea value={brief.previous_episode} onChange={set('previous_episode')} rows={3}
                placeholder="What happened? What was the cliffhanger?" />
            </Field>
            <Field label="Next Episode Setup" hint="Optional — helps Claude write a specific outro tease">
              <Textarea value={brief.next_episode} onChange={set('next_episode')} rows={2}
                placeholder="What happens in the next episode?" />
            </Field>
          </>
        )}
      </Section>

      {/* Part 4: Audio & Music */}
      <Section title="PART 4 — AUDIO & MUSIC DIRECTION">
        <Field label="Music Energy" required hint="Describe the dominant emotional tone of the music">
          <Textarea value={brief.music_energy} onChange={set('music_energy')} rows={2}
            placeholder="Mournful and atmospheric — church organ undertones, something sacred gone wrong" />
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              'Slow-burn dread — sparse, minimal, tension underneath everything',
              'Driving and kinetic — pulse-based, forward momentum, no vocals',
              'Warm and melancholic — acoustic, unhurried, bittersweet',
              'Tense procedural — low strings, clock-like rhythm, urban cold',
            ].map(example => (
              <button
                key={example}
                onClick={() => setBrief({ ...brief, music_energy: example })}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  padding: '4px 10px',
                  color: '#777',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                {example.slice(0, 40)}...
              </button>
            ))}
          </div>
        </Field>
        <Field label="Music Reference" hint="Film, TV show, or composer whose score captures the sound">
          <Input value={brief.music_reference} onChange={set('music_reference')}
            placeholder="True Detective Season 1 / Prisoners" />
        </Field>
        <Field label="Music Moments" hint="2–4 moments where the music energy needs to change significantly">
          <Textarea value={brief.music_moments} onChange={set('music_moments')} rows={4}
            placeholder="- Opening — low organ drone, almost subsonic&#10;- When the body is discovered — music drops out completely&#10;- Final confrontation — sparse, tense, no resolution" />
        </Field>
        <Row>
          <Field label="SFX Density">
            <Select value={brief.sfx_density} onChange={set('sfx_density')}>
              <option value="minimal">Minimal — sparse, atmospheric only</option>
              <option value="standard">Standard — one cue per 60–90 sec</option>
              <option value="rich">Rich — frequent, immersive, cinematic</option>
            </Select>
          </Field>
        </Row>
        <Field label="SFX Environments" hint="Key locations — Claude writes specific grounded cues for these">
          <Textarea value={brief.sfx_environments} onChange={set('sfx_environments')} rows={3}
            placeholder="- Old church interior (echo, candles, pew creak)&#10;- Confessional booth (close, airless, whispered acoustics)&#10;- South Boston winter street" />
        </Field>
        <Field label="Audio Notes" hint="Silences that matter, moments where SFX should dominate">
          <Textarea value={brief.audio_notes} onChange={set('audio_notes')} rows={2}
            placeholder="The confessional scenes should feel acoustically tight — like the listener is inside the booth." />
        </Field>
      </Section>

      {/* Part 5: Belle B & Publishing */}
      <Section title="PART 5 — BELLE B & PUBLISHING">
        <Field label="Belle B Intro Line" hint="Leave blank — Claude writes from premise and genre">
          <Textarea value={brief.belle_b_intro} onChange={set('belle_b_intro')} rows={2}
            placeholder="[LISTENER_NAME], I've been holding this one — 'The Confession Booth.'..." />
        </Field>
        <Row>
          <Field label="Listener Gender Skew" hint="Affects Belle B's word choice only — one audio file generated either way">
            <Select value={brief.listener_gender_skew} onChange={set('listener_gender_skew')}>
              <option value="neutral">Neutral (default)</option>
              <option value="female">Skews female</option>
              <option value="male">Skews male</option>
            </Select>
          </Field>
        </Row>
        <Field label="Story Description" hint="24 words max — punchy present-tense hook for the app card. Leave blank for Claude.">
          <Input value={brief.description} onChange={set('description')}
            placeholder="A priest dead in his own confessional. A killer who came to confess. And the one detail Marsh can't unhear." />
          {brief.description && (
            <div style={{ marginTop: 4, fontSize: 11, color: brief.description.split(' ').length > 24 ? '#ef5350' : '#555' }}>
              {brief.description.split(' ').length} / 24 words
            </div>
          )}
        </Field>
      </Section>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 32, alignItems: 'center' }}>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            background: generating ? '#333' : '#fff',
            color: generating ? '#666' : '#000',
            border: 'none',
            borderRadius: 6,
            padding: '14px 32px',
            cursor: generating ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 'bold',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {generating ? 'Generating...' : 'Generate Script'}
        </button>
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          style={{
            background: 'transparent',
            color: '#666',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '14px 20px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        >
          {previewOpen ? 'Hide Brief Preview' : 'Preview Brief'}
        </button>
      </div>

      {previewOpen && (
        <pre style={{
          marginTop: 24,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          padding: 20,
          fontSize: 12,
          color: '#aaa',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {buildBriefText()}
        </pre>
      )}
    </div>
  )
}

// ─── Review View ──────────────────────────────────────────────────────────────

function ReviewView({ story, onAccept, onReject, onModify, onSaveHumanScore, onSetUUID, onPublish, onBack, generating, statusMsg }: {
  story: StoryRecord
  onAccept: () => void
  onReject: (reason: string) => void
  onModify: (notes: string) => void
  onSaveHumanScore: (score: HumanScore) => void
  onSetUUID: (uuid: string) => void
  onPublish: () => void
  onBack: () => void
  generating: boolean
  statusMsg: string
}) {
  const [modifyNotes, setModifyNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showModify, setShowModify] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [storyUUID, setStoryUUID] = useState(story.story_uuid || '')
  const [humanScore, setHumanScore] = useState<HumanScore>(
    story.human_score || { hook: 0, clarity: 0, pacing: 0, audio_quality: 0, landing: 0 }
  )

  const ai = story.ai_score
  const aiComposite = ai?.composite_score || 0
  const aiDisplay = aiComposite ? (aiComposite * 2.5).toFixed(1) : '—'
  const humanTotal = Object.values(humanScore).reduce((a, b) => a + b, 0)

  const scoreColor = (score: number, max: number) => {
    const pct = score / max
    if (pct >= 0.88) return '#66bb6a'
    if (pct >= 0.72) return '#ffa726'
    return '#ef5350'
  }

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 8 }}>
            ← Back to Queue
          </button>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 'normal', color: '#fff' }}>
            {story.title}
          </h1>
          <div style={{ marginTop: 6, color: '#666', fontSize: 13 }}>
            {story.author} · {story.genre} · {story.runtime}
            <span style={{
              marginLeft: 12,
              background: STATUS_COLORS[story.status].bg,
              color: STATUS_COLORS[story.status].text,
              padding: '2px 10px',
              borderRadius: 20,
              fontSize: 11,
            }}>
              {STATUS_COLORS[story.status].label}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {story.status === 'scored' && (
            <>
              <button onClick={() => setShowModify(!showModify)} style={btnStyle('#1a1a2a', '#7c9ef5')}>
                Modify
              </button>
              <button onClick={() => setShowReject(!showReject)} style={btnStyle('#2a1a1a', '#ef5350')}>
                Reject
              </button>
              <button onClick={onAccept} style={btnStyle('#1a2a1a', '#66bb6a')}>
                ✓ Accept
              </button>
            </>
          )}
          {story.status === 'accepted' && (
            <div style={{ color: '#66bb6a', fontSize: 13 }}>
              ✅ Accepted — send script to Hal in Telegram
            </div>
          )}
          {story.status === 'in_production' && (
            <button onClick={onPublish} style={btnStyle('#1a2a24', '#26a69a')}>
              Mark Published
            </button>
          )}
        </div>
      </div>

      {/* Modify panel */}
      {showModify && (
        <div style={{ background: '#1a1a2a', border: '1px solid #2a2a3a', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 13 }}>
            Describe what needs to change. Claude will revise and re-evaluate.
          </p>
          <textarea
            value={modifyNotes}
            onChange={e => setModifyNotes(e.target.value)}
            placeholder="The opening is too slow. Move the body discovery to the first 30 seconds..."
            style={textareaStyle}
            rows={4}
          />
          <button
            onClick={() => { onModify(modifyNotes); setShowModify(false) }}
            disabled={generating || !modifyNotes}
            style={{ ...btnStyle('#fff', '#000'), marginTop: 12 }}
          >
            {generating ? 'Revising...' : 'Request Revision'}
          </button>
        </div>
      )}

      {/* Reject panel */}
      {showReject && (
        <div style={{ background: '#2a1a1a', border: '1px solid #3a2a2a', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            style={textareaStyle}
            rows={2}
          />
          <button
            onClick={() => { onReject(rejectReason); setShowReject(false) }}
            style={{ ...btnStyle('#2a1a1a', '#ef5350'), marginTop: 12 }}
          >
            Confirm Reject
          </button>
        </div>
      )}

      {/* Main content — two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

        {/* Script panel */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #2a2a2a', color: '#888', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
            Script
          </div>
          <pre style={{
            margin: 0,
            padding: 20,
            fontSize: 12,
            lineHeight: 1.7,
            color: '#ccc',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '70vh',
            overflowY: 'auto',
            fontFamily: "'Courier New', monospace",
          }}>
            {story.script
              .replace(/(\[SFX:[^\]]+\])/g, '\x1b$1\x1b')
              .replace(/(\[BEAT\]|\[PAUSE[^\]]*\])/g, '\x1b$1\x1b')
              .replace(/(\[MUSIC:[^\]]+\])/g, '\x1b$1\x1b')
              .split('\x1b')
              .map((part, i) => {
                if (part.match(/^\[(SFX|BEAT|PAUSE|MUSIC)/)) {
                  return <span key={i} style={{ color: '#7c9ef5' }}>{part}</span>
                }
                if (part.match(/^[A-Z][A-Z\s]+:/)) {
                  return <span key={i} style={{ color: '#ffa726' }}>{part}</span>
                }
                return <span key={i}>{part}</span>
              })
            }
          </pre>
        </div>

        {/* Right panel — scores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* AI Score Card */}
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#888', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>AI Script Score</span>
              <span style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: scoreColor(parseFloat(aiDisplay), 25),
              }}>{aiDisplay} / 25</span>
            </div>

            {ai ? (
              <div style={{ padding: 16 }}>
                {/* Recommendation badge */}
                <div style={{
                  background: ai.recommendation === 'Proceed' ? '#1a2a1a' : ai.recommendation === 'Revise and Resubmit' ? '#2a2a1a' : '#2a1a1a',
                  color: ai.recommendation === 'Proceed' ? '#66bb6a' : ai.recommendation === 'Revise and Resubmit' ? '#ffa726' : '#ef5350',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 'bold',
                  marginBottom: 16,
                  textAlign: 'center',
                  letterSpacing: 1,
                }}>
                  {ai.recommendation}
                </div>

                {/* Dimension scores */}
                {[
                  { key: 'opening_hook', label: 'Opening Hook', weight: '25%' },
                  { key: 'overall_listenability', label: 'Listenability', weight: '25%' },
                  { key: 'dialogue_quality', label: 'Dialogue', weight: '20%' },
                  { key: 'structure_and_pacing', label: 'Structure & Pacing', weight: '15%' },
                  { key: 'audio_suitability', label: 'Audio Suitability', weight: '15%' },
                ].map(({ key, label, weight }) => {
                  const dim = ai[key as keyof AIScore] as { score: number; feedback: string; issues: string[] }
                  if (!dim || typeof dim.score !== 'number') return null
                  return (
                    <div key={key} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#888' }}>{label} <span style={{ color: '#555' }}>({weight})</span></span>
                        <span style={{ fontSize: 13, fontWeight: 'bold', color: scoreColor(dim.score, 10) }}>{dim.score}/10</span>
                      </div>
                      <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${dim.score * 10}%`, background: scoreColor(dim.score, 10), borderRadius: 2 }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#666', lineHeight: 1.5 }}>{dim.feedback}</div>
                      {dim.issues?.length > 0 && dim.issues.map((issue, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#ef5350', marginTop: 2 }}>⚠ {issue}</div>
                      ))}
                    </div>
                  )
                })}

                {/* Policy */}
                <div style={{
                  background: ai.policy_compliance.pass ? '#1a2a1a' : '#2a1a1a',
                  border: `1px solid ${ai.policy_compliance.pass ? '#2a3a2a' : '#3a2a2a'}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 12,
                }}>
                  <span style={{ fontSize: 12, color: ai.policy_compliance.pass ? '#66bb6a' : '#ef5350' }}>
                    {ai.policy_compliance.pass ? '✓ Policy: Pass' : '✗ Policy: FAIL'}
                  </span>
                  {ai.policy_compliance.flags?.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#ef5350' }}>
                      {ai.policy_compliance.flags.join(', ')}
                    </div>
                  )}
                </div>

                {/* Top fixes */}
                {ai.top_fixes?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                      Top Fixes
                    </div>
                    {ai.top_fixes.map((fix, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#ffa726', marginBottom: 4 }}>
                        {i + 1}. {fix}
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                <div style={{ fontSize: 12, color: '#777', lineHeight: 1.6, fontStyle: 'italic', borderTop: '1px solid #2a2a2a', paddingTop: 12 }}>
                  {ai.evaluator_summary}
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, color: '#555', fontSize: 13 }}>
                No AI evaluation available.
              </div>
            )}
          </div>

          {/* Human Score Card */}
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#888', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Your Score (After Listening)</span>
              <span style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: humanTotal > 0 ? scoreColor(humanTotal, 25) : '#444',
              }}>{humanTotal > 0 ? `${humanTotal}/25` : '—/25'}</span>
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#555' }}>
                Listen to the finished mix in the app, then score each dimension 1–5.
              </p>
              {([
                { key: 'hook', label: 'Hook', desc: 'Did it grab you in the first 90 seconds?' },
                { key: 'clarity', label: 'Clarity', desc: 'Could you follow it while driving?' },
                { key: 'pacing', label: 'Pacing', desc: 'Right speed — no dead spots, no rushing?' },
                { key: 'audio_quality', label: 'Audio Quality', desc: 'Music, SFX, voice mix — professional?' },
                { key: 'landing', label: 'Landing', desc: 'Did the ending satisfy and leave something?' },
              ] as const).map(({ key, label, desc }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
                      <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>{desc}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 'bold', color: humanScore[key] > 0 ? scoreColor(humanScore[key], 5) : '#444' }}>
                      {humanScore[key] || '—'}/5
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setHumanScore({ ...humanScore, [key]: n })}
                        style={{
                          flex: 1,
                          height: 32,
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 13,
                          fontWeight: 'bold',
                          background: humanScore[key] === n
                            ? scoreColor(n, 5)
                            : humanScore[key] >= n ? `${scoreColor(n, 5)}44` : '#2a2a2a',
                          color: humanScore[key] >= n ? '#fff' : '#555',
                          transition: 'all 0.15s',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {humanTotal > 0 && (
                <>
                  <div style={{
                    background: humanTotal >= 22 ? '#1a2a1a' : humanTotal >= 18 ? '#2a2a1a' : humanTotal >= 14 ? '#2a2000' : '#2a1a1a',
                    color: humanTotal >= 22 ? '#66bb6a' : humanTotal >= 18 ? '#ffa726' : humanTotal >= 14 ? '#ffcc02' : '#ef5350',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: 12,
                  }}>
                    {humanTotal >= 22 ? '✅ Publish' : humanTotal >= 18 ? '✅ Publish — log weak dimensions' : humanTotal >= 14 ? '⚠️ Fix first' : '❌ Diagnose before rework'}
                  </div>
                  <button
                    onClick={() => onSaveHumanScore(humanScore)}
                    style={{ ...btnStyle('#fff', '#000'), width: '100%' }}
                  >
                    Save Score
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Production panel */}
          {(story.status === 'accepted' || story.status === 'in_production' || story.status === 'published') && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Production
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                Story UUID (from Hal)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={storyUUID}
                  onChange={e => setStoryUUID(e.target.value)}
                  placeholder="Paste UUID from Hal..."
                  style={{ ...textareaStyle, flex: 1, height: 36, padding: '0 12px', fontFamily: 'monospace', fontSize: 12 }}
                />
                <button
                  onClick={() => onSetUUID(storyUUID)}
                  disabled={!storyUUID}
                  style={btnStyle('#1a2a24', '#26a69a')}
                >
                  Set
                </button>
              </div>
              {story.story_uuid && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#26a69a', fontFamily: 'monospace' }}>
                  UUID: {story.story_uuid}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helper Components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #1a1a1a' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>{children}</div>
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, letterSpacing: 0.5 }}>
        {label} {required && <span style={{ color: '#ef5350' }}>*</span>}
        {hint && <span style={{ color: '#555', marginLeft: 6, fontStyle: 'italic' }}>— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
        color: '#e8e8e8',
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        boxSizing: 'border-box',
        ...props.style,
      }}
    />
  )
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
        color: '#e8e8e8',
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </select>
  )
}

function Textarea({ rows = 4, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      {...props}
      style={{
        width: '100%',
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
        color: '#e8e8e8',
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        resize: 'vertical',
        boxSizing: 'border-box',
        lineHeight: 1.6,
        ...props.style,
      }}
    />
  )
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f0f0f',
  border: '1px solid #2a2a2a',
  borderRadius: 6,
  padding: '10px 14px',
  color: '#e8e8e8',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 'bold',
    whiteSpace: 'nowrap' as const,
  }
}

// Fallback Stage 2 prompt in case the API route isn't available
const FALLBACK_STAGE2_PROMPT = `You are the Endless Tales script writer. Write a complete, professional audio drama script from the Story Brief provided. The script goes directly into audio production. Write it right the first time.

Output ONLY the formatted script. Begin with the Belle B intro block. No preamble. No commentary.

FORMAT:
BELLE B INTRO
---
BELLE B: [single intro line with [LISTENER_NAME]]
---

SERIES: 
EPISODE: 
AUTHOR: [author]
GENRE: [genre]
DESCRIPTION: [24 words max]
NARRATOR: [narrator from ET roster]
ANNOUNCER: Belle B
NARRATIVE_VOICE: [first_person|third_limited|third_omniscient]
NARRATOR_IS_CHARACTER: false
SUNO PROMPT: [music brief]

CHARACTER GUIDE
---
[characters]

[START AUDIO DRAMA SCRIPT]

[full script]

BELLE B: [outro line]`
