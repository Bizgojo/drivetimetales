'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type V2Status =
  | 'brief_complete'
  | 'script_drafted'
  | 'validator_failed'
  | 'validator_passed'
  | 'ready_for_production'
  | 'audio_produced'
  | 'ready_to_publish'
  | 'published'
  | 'production_failed'
  | 'archived'

type AuthorOption = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  narrative_voice?: string | null
  tone?: string | null
  pacing?: string | null
  signature?: string | null
  style_reference?: string | null
  style_description?: string | null
  style_book_type?: string | null
  style_signature_trait?: string | null
  style_author_living?: boolean | null
  style_author_death_year?: number | null
  narrator_name?: string | null
}

type StepState = 'locked' | 'waiting' | 'running' | 'complete' | 'failed'

const GENRES = [
  'Thriller',
  'Horror',
  'Dark Mystery',
  'Mystery/Crime',
  'Adventure',
  'Drama',
  'Sci-Fi',
  'Western',
  'Historical Drama',
  'Supernatural',
  'Family/Heartwarming',
  'Comedy',
  'Romance',
  'Adventure/Survival',
  'Literary',
]

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-black animate-spin" />
      <span>{label}</span>
    </div>
  )
}

function StepPill({ label, state }: { label: string; state: StepState }) {
  const styles: Record<StepState, string> = {
    locked: 'bg-gray-200 text-gray-500 border-gray-300',
    waiting: 'bg-gray-100 text-gray-700 border-gray-300',
    running: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    complete: 'bg-green-100 text-green-800 border-green-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
  }
  return <div className={`px-3 py-2 rounded-full border text-sm font-medium ${styles[state]}`}>{label}</div>
}

export default function StoryProductionV2Page() {
  const [storyId, setStoryId] = useState('')
  const [status, setStatus] = useState<V2Status | ''>('')
  const [loading, setLoading] = useState(false)
  const [workingMessage, setWorkingMessage] = useState('')
  const [report, setReport] = useState('')
  const [script, setScript] = useState('')
  const [title, setTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewTotal, setReviewTotal] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState<'brief' | 'script' | 'score' | 'validate' | ''>('')
  const [stepMessage, setStepMessage] = useState('')
  const [authors, setAuthors] = useState<AuthorOption[]>([])
  const [authorsLoading, setAuthorsLoading] = useState(true)
  const [selectedAuthorMeta, setSelectedAuthorMeta] = useState<AuthorOption | null>(null)

  const scriptRef = useRef<HTMLTextAreaElement | null>(null)
  const reviewRef = useRef<HTMLPreElement | null>(null)
  const validateRef = useRef<HTMLPreElement | null>(null)

  const [form, setForm] = useState({
    title: '',
    type: 'standalone',
    author: '',
    author_style: '',
    genre: '',
    narrative_voice: '',
    premise: '',
    setting: '',
    runtime: '15 min',
    series_name: '',
    series_episode_number: '',
    series_total_episodes: '',
    series_is_finale: 'false',
  })

  useEffect(() => {
    let ignore = false
    async function loadAuthors() {
      try {
        setAuthorsLoading(true)
        const res = await fetch('/api/v2/author-options')
        const data = await res.json()
        if (!ignore && res.ok && data.success) setAuthors(data.authors || [])
      } finally {
        if (!ignore) setAuthorsLoading(false)
      }
    }
    loadAuthors()
    return () => {
      ignore = true
    }
  }, [])

  const filteredAuthors = useMemo(() => {
    if (!form.genre) return []
    const g = form.genre.toLowerCase()
    return authors.filter((a) =>
      [a.primary_genre, a.secondary_genre].filter(Boolean).some((v) => String(v).toLowerCase() === g)
    )
  }, [authors, form.genre])

  useEffect(() => {
    setSelectedAuthorMeta(authors.find((a) => a.name === form.author) || null)
  }, [authors, form.author])

  const canGenerate = !!storyId && status === 'brief_complete'
  const canScore = !!storyId && status === 'script_drafted'
  const canValidate = !!storyId && status === 'script_drafted'

  function pickAuthor(author: AuthorOption) {
    setForm((prev) => ({
      ...prev,
      author: author.name,
      author_style: author.style_reference || prev.author_style,
      narrative_voice: prev.narrative_voice || author.narrative_voice || '',
    }))
  }

  function getStepState(step: 'brief' | 'script' | 'score' | 'validate'): StepState {
    if (activeStep === step && loading) return 'running'
    if (step === 'brief') {
      if (['brief_complete', 'script_drafted', 'validator_passed', 'validator_failed'].includes(status)) return 'complete'
      return 'waiting'
    }
    if (step === 'script') {
      if (!storyId) return 'locked'
      if (['script_drafted', 'validator_passed', 'validator_failed'].includes(status)) return 'complete'
      return canGenerate ? 'waiting' : 'locked'
    }
    if (step === 'score') {
      if (!storyId) return 'locked'
      if (reviewText) return 'complete'
      return canScore ? 'waiting' : 'locked'
    }
    if (step === 'validate') {
      if (!storyId) return 'locked'
      if (status === 'validator_passed') return 'complete'
      if (status === 'validator_failed') return 'failed'
      return canValidate ? 'waiting' : 'locked'
    }
    return 'locked'
  }

  async function saveBrief() {
    setLoading(true)
    setActiveStep('brief')
    setWorkingMessage('Saving brief...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/story-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          storyId: storyId || undefined,
          series_episode_number: form.series_episode_number ? Number(form.series_episode_number) : null,
          series_total_episodes: form.series_total_episodes ? Number(form.series_total_episodes) : null,
          series_is_finale: form.type === 'series' ? form.series_is_finale === 'true' : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save brief')
      setStoryId(data.story.id)
      setStatus(data.story.status)
      setTitle(data.story.title || '')
      setReport('✓ Brief saved')
      setStepMessage('Ready for Generate Script')
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Brief failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function generateScript() {
    setLoading(true)
    setActiveStep('script')
    setWorkingMessage('Generating script...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate script')
      setStatus(data.story.status)
      setTitle(data.story.title || '')
      setScript(data.story.script || '')
      setReport('✓ Script generated')
      setStepMessage('Ready for Score Script')
      setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Script generation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function scoreScript() {
    setLoading(true)
    setActiveStep('score')
    setWorkingMessage('Scoring script...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/score-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to score script')
      setReviewText(data.reviewText || '')
      setReviewTotal(typeof data.total === 'number' ? data.total : null)
      setReport(`✓ Script scored${typeof data.total === 'number' ? `: ${data.total}/25` : ''}`)
      setStepMessage('Ready for Validate Script')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Script scoring failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function validateScript() {
    setLoading(true)
    setActiveStep('validate')
    setWorkingMessage('Validating script...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/validate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to validate script')
      setStatus(data.story.status)
      setReport(data.story.validator_report || '')
      setStepMessage(data.story.status === 'validator_passed' ? 'Ready for Produce Audio' : 'Validation failed, revise script')
      setTimeout(() => validateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Validation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-black px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Story Production V2</h1>
          <p className="text-gray-700 mt-2">Bible-first workflow: Brief → Script → Score → Validate → Produce → Grade → Publish</p>
        </div>

        <div className="bg-white border border-black rounded-lg p-4">
          <div className="flex flex-wrap gap-2">
            <StepPill label="1. Brief" state={getStepState('brief')} />
            <StepPill label="2. Script" state={getStepState('script')} />
            <StepPill label="3. Score" state={getStepState('score')} />
            <StepPill label="4. Validate" state={getStepState('validate')} />
            <StepPill label="5. Produce Audio" state="locked" />
            <StepPill label="6. Final Grade" state="locked" />
            <StepPill label="7. Publish" state="locked" />
          </div>
          {stepMessage ? <div className="mt-3 text-sm font-medium text-green-700">{stepMessage}</div> : null}
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Title (optional, Claude can choose)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <select className="border rounded p-2" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="standalone">Standalone</option>
              <option value="series">Series</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <select className="border rounded p-2" value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value, author: '', author_style: '', narrative_voice: '' })}>
              <option value="">Choose genre first</option>
              {GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
            <input className="border rounded p-2" placeholder="Narrative voice (optional)" value={form.narrative_voice} onChange={e => setForm({ ...form, narrative_voice: e.target.value })} />
          </div>

          {authorsLoading ? (
            <Spinner label="Loading authors..." />
          ) : form.genre ? (
            <div className="border rounded p-3 bg-gray-50">
              <div className="font-semibold mb-2">Suggested authors for {form.genre}</div>
              {filteredAuthors.length === 0 ? (
                <div className="text-sm text-gray-600">No authors found for this genre yet.</div>
              ) : (
                <div className="space-y-2">
                  {filteredAuthors.map((author) => (
                    <button
                      key={author.id}
                      type="button"
                      onClick={() => pickAuthor(author)}
                      className={`w-full text-left border rounded p-3 ${form.author === author.name ? 'border-black bg-white' : 'border-gray-300 bg-white'}`}
                    >
                      <div className="font-semibold">{author.name}</div>
                      <div className="text-sm text-gray-700">Real author: {author.style_reference || 'Not set'}</div>
                      <div className="text-sm text-gray-700">{author.style_description || 'No style description available.'}</div>
                      <div className="text-sm text-gray-600 mt-1">Narrator: {author.narrator_name || 'Not assigned'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Author pen name" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            <input className="border rounded p-2" placeholder="Author style" value={form.author_style} onChange={e => setForm({ ...form, author_style: e.target.value })} />
          </div>

          {selectedAuthorMeta ? (
            <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
              <div><strong>Real author:</strong> {selectedAuthorMeta.style_reference || 'Not set'}</div>
              <div><strong>Style description:</strong> {selectedAuthorMeta.style_description || 'No style description available.'}</div>
              <div><strong>Type of books:</strong> {selectedAuthorMeta.style_book_type || 'Not set'}</div>
              <div><strong>What stands out:</strong> {selectedAuthorMeta.style_signature_trait || 'Not set'}</div>
              <div><strong>Living or dead:</strong> {selectedAuthorMeta.style_author_living === false ? 'Dead' : 'Living'}</div>
              <div><strong>Year of death:</strong> {selectedAuthorMeta.style_author_death_year ?? '—'}</div>
              <div><strong>Assigned narrator:</strong> {selectedAuthorMeta.narrator_name || 'Not assigned'}</div>
            </div>
          ) : null}

          <textarea className="border rounded p-2 w-full" rows={4} placeholder="Premise" value={form.premise} onChange={e => setForm({ ...form, premise: e.target.value })} />
          <input className="border rounded p-2 w-full" placeholder="Setting" value={form.setting} onChange={e => setForm({ ...form, setting: e.target.value })} />
          <input className="border rounded p-2 w-full" placeholder="Runtime" value={form.runtime} onChange={e => setForm({ ...form, runtime: e.target.value })} />

          <div className="flex items-center gap-4">
            <button disabled={loading} className="bg-orange-500 text-white px-4 py-2 rounded disabled:opacity-50" onClick={saveBrief}>
              {activeStep === 'brief' && loading ? 'Saving Brief...' : 'Save Brief'}
            </button>
            {loading && workingMessage ? <Spinner label={workingMessage} /> : null}
          </div>
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-3">
          <div><strong>Story ID:</strong> {storyId || 'Not created yet'}</div>
          <div><strong>Status:</strong> {status || '—'}</div>
          <div><strong>Title:</strong> {title || '—'}</div>
          <div><strong>Script Score:</strong> {reviewTotal != null ? `${reviewTotal}/25` : '—'}</div>

          <div className="flex gap-3 flex-wrap">
            <button disabled={!canGenerate || loading} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50" onClick={generateScript}>
              {activeStep === 'script' && loading ? 'Generating Script...' : 'Generate Script'}
            </button>
            <button disabled={!canScore || loading} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50" onClick={scoreScript}>
              {activeStep === 'score' && loading ? 'Scoring Script...' : 'Score Script'}
            </button>
            <button disabled={!canValidate || loading} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50" onClick={validateScript}>
              {activeStep === 'validate' && loading ? 'Validating Script...' : 'Validate Script'}
            </button>
            <button disabled className="bg-gray-400 text-white px-4 py-2 rounded disabled:opacity-50">Produce Audio (Phase 2)</button>
          </div>
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-2">
          <div className="font-semibold">Generated Script</div>
          {!!script ? (
            <textarea ref={scriptRef} className="border rounded p-2 w-full h-80" value={script} readOnly />
          ) : (
            <div className="text-sm text-gray-500">No script generated yet.</div>
          )}
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-2">
          <div className="font-semibold">Script Review</div>
          {!!reviewText ? (
            <pre ref={reviewRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{reviewText}</pre>
          ) : (
            <div className="text-sm text-gray-500">No script review yet.</div>
          )}
        </div>

        <div className="bg-white border border-black rounded-lg p-4 space-y-2">
          <div className="font-semibold">Validation Report</div>
          {!!report ? (
            <pre ref={validateRef} className="border rounded p-3 bg-gray-50 whitespace-pre-wrap text-sm">{report}</pre>
          ) : (
            <div className="text-sm text-gray-500">No validation output yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
