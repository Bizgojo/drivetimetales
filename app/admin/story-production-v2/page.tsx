'use client'


function parseTopFixes(reviewText: string): string[] {
  if (!reviewText) return []

  const shortVerdictIndex = reviewText.indexOf('SHORT VERDICT:')
  const relevant = shortVerdictIndex >= 0 ? reviewText.slice(0, shortVerdictIndex) : reviewText

  const lines = relevant.split('\n')
  const fixes: string[] = []
  let collecting = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.toUpperCase() === 'TOP FIXES:') {
      collecting = true
      continue
    }

    if (!collecting) continue

    const m = line.match(/^\d+\.\s+(.*)$/)
    if (m) fixes.push(m[1].trim())
  }

  return fixes
}

function readSavedSeriesId(): string {
  if (typeof window === 'undefined') return ''

  const savedSeriesId = localStorage.getItem('et_last_series_id_v2')
  if (savedSeriesId) return savedSeriesId

  try {
    const rawPackageHandoff = localStorage.getItem('et_asc_package_handoff_v1')
    const packageHandoff = rawPackageHandoff ? JSON.parse(rawPackageHandoff) : null
    return packageHandoff?.seriesId || ''
  } catch {
    return ''
  }
}


import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type V2Status =
  | 'brief_complete'
  | 'script_drafted'
  | 'validator_failed'
  | 'validator_passed'
  | 'audio_pending'
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

type QueueStatus = 'queued' | 'in_v2' | 'ready_for_asc' | 'published'

type QueueItem = {
  id: string
  title: string
  premise: string
  setting: string
  primaryGenre: string
  secondaryGenre: string
  tertiaryGenre: string
  duration: string
  authorTarget: string
  notes: string
  status: QueueStatus
  createdAt: string
  updatedAt: string
}

type SeriesEpisodePlan = {
  id: string
  title: string
  status: string
  script?: string | null
  script_json?: {
    pre_audio_review?: {
      reviewed_at?: string
      total?: number | null
      review_text?: string
    }
    series_generation?: {
      generated_at?: string
      episode_number?: number
      summary?: {
        description?: string
      }
    }
    series_score_validate?: {
      scored_at?: string
      validated_at?: string
      score_total?: number | null
      validator_result?: string
    }
  } | null
  validator_result?: string | null
  validator_report?: string | null
  validator_passed_at?: string | null
  episode_number?: number | null
  series_episode_number?: number | null
  brief_json?: {
    premise?: string | null
    setting?: string | null
    description?: string | null
    continuity_notes?: string | null
    cliffhanger_or_resolution?: string | null
  } | null
}

type SeriesPackage = {
  series: {
    id: string
    title: string
    description?: string | null
    total_episodes?: number | null
  }
  episodes: SeriesEpisodePlan[]
}


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

const SERIES_EPISODE_COUNTS = [3, 5, 7, 13]

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const queueId = searchParams.get('queueId')

  const [storyId, setStoryId] = useState('')
  const [status, setStatus] = useState<V2Status | ''>('')
  const [loading, setLoading] = useState(false)
  const [workingMessage, setWorkingMessage] = useState('')
  const [scriptDirty, setScriptDirty] = useState(false)
  const [selectedTopFixes, setSelectedTopFixes] = useState<number[]>([])
  const [report, setReport] = useState('')
  const [script, setScript] = useState('')
  const [title, setTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewTotal, setReviewTotal] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState<'brief' | 'script' | 'score' | 'validate' | 'produce' | ''>('')
  const [stepMessage, setStepMessage] = useState('')
  const [authors, setAuthors] = useState<AuthorOption[]>([])
  const [authorsLoading, setAuthorsLoading] = useState(true)
  const [selectedAuthorMeta, setSelectedAuthorMeta] = useState<AuthorOption | null>(null)
  const [seriesPackage, setSeriesPackage] = useState<SeriesPackage | null>(null)

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
    series_arc_plan: '',
  })

  useEffect(() => {
    const savedSeriesId = readSavedSeriesId()
    const effectiveQueueId =
      queueId ||
      (!savedSeriesId && typeof window !== 'undefined' ? localStorage.getItem('et_last_queue_id_v2') : '')

    if (!effectiveQueueId) return

    let ignore = false

    async function loadQueueItemIntoBrief() {
      try {
        setWorkingMessage('Loading queued story...')
        setStepMessage('')

        const res = await fetch(`/api/admin/story-queue?id=${encodeURIComponent(effectiveQueueId)}`, { cache: 'no-store' })
        const data = await res.json()
        const queued = data?.item

        if (!res.ok || !queued) {
          throw new Error(data?.error || 'Failed to load queue item')
        }
        if (ignore) return

        let loadedSavedStory = false

        if (queued.storyId) {
          try {
            const savedRes = await fetch(`/api/v2/load-story?storyId=${encodeURIComponent(queued.storyId)}`)
            const savedData = await savedRes.json()

            if (savedRes.ok && savedData?.success && savedData?.story) {
              if (ignore) return

              setStoryId(savedData.story.id || '')
              setTitle(savedData.story.title || queued.title || '')
              setStatus(savedData.story.status || '')
              setScript(savedData.story.script || '')
              setReport(savedData.story.validator_report || '')
              setForm(prev => ({
                ...prev,
                title: savedData.story.title || queued.title || prev.title,
                type: savedData.story.type || prev.type,
                author: savedData.story.author || queued.authorTarget || prev.author,
                author_style: savedData.story.author_style || prev.author_style,
                genre: savedData.story.genre || queued.primaryGenre || prev.genre,
                narrative_voice: savedData.story.narrative_voice || prev.narrative_voice,
                premise: savedData.story.premise || queued.premise || prev.premise,
                setting: savedData.story.setting || queued.setting || prev.setting,
                runtime: savedData.story.runtime || queued.duration || prev.runtime,
                series_name: savedData.story.series_name || prev.series_name,
                series_episode_number: savedData.story.series_episode_number != null ? String(savedData.story.series_episode_number) : prev.series_episode_number,
                series_total_episodes: savedData.story.series_total_episodes != null ? String(savedData.story.series_total_episodes) : prev.series_total_episodes,
                series_is_finale: savedData.story.series_is_finale != null ? String(savedData.story.series_is_finale) : prev.series_is_finale,
                series_arc_plan: savedData.story.series_arc_plan || prev.series_arc_plan,
              }))
              try {
                const briefRes = await fetch(`/api/v2/story-brief?storyId=${encodeURIComponent(savedData.story.id)}`)
                const briefData = await briefRes.json()
                if (!ignore && briefRes.ok && briefData?.success && briefData?.story?.series_arc_plan) {
                  setForm(prev => ({ ...prev, series_arc_plan: briefData.story.series_arc_plan }))
                }
              } catch (err) {
                console.error('series brief detail load failed', err)
              }
              setStepMessage('Reloaded saved story from queue')
              loadedSavedStory = true
            }
          } catch (err) {
            console.error('load-story failed, falling back to queue data', err)
          }
        }

        if (!loadedSavedStory) {
          setStoryId(queued.storyId || '')
          setTitle(queued.title || '')
          setForm(prev => ({
            ...prev,
            title: queued.title || prev.title,
            genre: queued.primaryGenre || prev.genre,
            premise: queued.premise || prev.premise,
            setting: queued.setting || prev.setting,
            runtime: queued.duration || prev.runtime,
            author: queued.authorTarget || prev.author,
          }))
          setStepMessage(queued.storyId ? 'Loaded queued story draft' : 'Loaded queued story idea')
        }

        await fetch('/api/admin/story-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: effectiveQueueId, status: 'in_v2' }),
        })
      } catch (e) {
        if (!ignore) {
          console.error('Failed to preload queue item into V2', e)
          setStepMessage('Queue preload failed')
        }
      } finally {
        if (!ignore) {
          setWorkingMessage('')
        }
      }
    }

    loadQueueItemIntoBrief()
    return () => {
      ignore = true
    }
  }, [queueId])


  useEffect(() => {
    const requestedStoryId = searchParams.get('storyId')
    const requestedSeriesId = searchParams.get('seriesId')

    if (requestedSeriesId) return
    if (!requestedStoryId) return

    let ignore = false

    async function loadSavedStory() {
      try {
        setLoading(true)
        setWorkingMessage('Loading saved story...')
        setStepMessage('')

        const res = await fetch(`/api/v2/load-story?storyId=${encodeURIComponent(requestedStoryId)}`)
        const data = await res.json()

        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load saved story')
        if (ignore) return

        if (data.story?.series_id) {
          const packageRes = await fetch(`/api/v2/series-package/score-validate?seriesId=${encodeURIComponent(data.story.series_id)}`)
          const packageData = await packageRes.json()

          if (!packageRes.ok || !packageData.success) {
            throw new Error(packageData.error || 'Failed to load series package')
          }
          if (ignore) return

          const pkg = packageData.package as SeriesPackage
          const firstEpisode = pkg.episodes?.[0]
          const firstBrief = firstEpisode?.brief_json || {}

          setSeriesPackage(pkg)
          setStoryId(firstEpisode?.id || '')
          setTitle(pkg.series?.title || '')
          setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
          setScript('')
          setReport('')
          setReviewText('')
          setReviewTotal(null)
          setForm(prev => ({
            ...prev,
            title: pkg.series?.title || prev.title,
            type: 'series',
            series_name: pkg.series?.title || prev.series_name,
            series_total_episodes: String(pkg.series?.total_episodes || pkg.episodes?.length || prev.series_total_episodes || ''),
            series_episode_number: '1',
            series_is_finale: 'false',
            series_arc_plan: pkg.series?.description || prev.series_arc_plan,
            premise: firstBrief?.premise || prev.premise,
            setting: firstBrief?.setting || prev.setting,
          }))

          router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(data.story.series_id)}`, { scroll: false })

          setStepMessage('Loaded series package')
          return
        }

        setSeriesPackage(null)
        setStoryId(data.story.id || '')
        setTitle(data.story.title || '')
        setStatus(data.story.status || '')
        setScript(data.story.script || '')
        setReport(data.story.validator_report || '')
        setReviewText(data.story.grade_notes || '')
        setReviewTotal(data.story.grade_total != null ? Number(data.story.grade_total) : null)
        setForm(prev => ({
          ...prev,
          title: data.story.title || prev.title,
          type: data.story.type || prev.type,
          author: data.story.author || prev.author,
          author_style: data.story.author_style || prev.author_style,
          genre: data.story.genre || prev.genre,
          narrative_voice: data.story.narrative_voice || prev.narrative_voice,
          premise: data.story.premise || prev.premise,
          setting: data.story.setting || prev.setting,
          runtime: data.story.runtime || prev.runtime,
          series_name: data.story.series_name || prev.series_name,
          series_episode_number: data.story.series_episode_number != null ? String(data.story.series_episode_number) : prev.series_episode_number,
          series_total_episodes: data.story.series_total_episodes != null ? String(data.story.series_total_episodes) : prev.series_total_episodes,
          series_is_finale: data.story.series_is_finale != null ? String(data.story.series_is_finale) : prev.series_is_finale,
          series_arc_plan: data.story.series_arc_plan || prev.series_arc_plan,
        }))

        try {
          const briefRes = await fetch(`/api/v2/story-brief?storyId=${encodeURIComponent(data.story.id)}`)
          const briefData = await briefRes.json()
          if (!ignore && briefRes.ok && briefData?.success && briefData?.story?.series_arc_plan) {
            setForm(prev => ({ ...prev, series_arc_plan: briefData.story.series_arc_plan }))
          }
        } catch (err) {
          console.error('series brief detail load failed', err)
        }

        try {
          if (typeof window !== 'undefined' && data?.story?.id) {
            localStorage.setItem('et_last_story_id_v2', data.story.id)
          }
        } catch (err) {
          console.error('Failed to refresh last active V2 story', err)
        }

        setStepMessage('Loaded saved story')
      } catch (e) {
        if (!ignore) {
          setReport(e instanceof Error ? e.message : 'Unknown error')
          setStepMessage('Load saved story failed')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
          setWorkingMessage('')
        }
      }
    }

    loadSavedStory()
    return () => {
      ignore = true
    }
  }, [router, searchParams])

  useEffect(() => {
    const requestedStoryId = searchParams.get('storyId')
    const requestedSeriesId = searchParams.get('seriesId')

    if (requestedStoryId || requestedSeriesId || queueId) return
    if (typeof window === 'undefined') return

    const savedSeriesId = readSavedSeriesId()

    if (savedSeriesId) {
      router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(savedSeriesId)}`, { scroll: false })
    }
  }, [queueId, router, searchParams])

  useEffect(() => {
    const requestedSeriesId = searchParams.get('seriesId')

    if (!requestedSeriesId) return

    let ignore = false

    async function loadSeriesPackage() {
      try {
        setLoading(true)
        setWorkingMessage('Loading series package...')
        setStepMessage('')

        const res = await fetch(`/api/v2/series-package/score-validate?seriesId=${encodeURIComponent(requestedSeriesId)}`)
        const data = await res.json()

        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load series package')
        if (ignore) return

        const pkg = data.package as SeriesPackage
        const firstEpisode = pkg.episodes?.[0]
        const firstBrief = firstEpisode?.brief_json || {}

        setSeriesPackage(pkg)
        try {
          if (typeof window !== 'undefined' && pkg.series?.id) {
            localStorage.setItem('et_last_series_id_v2', pkg.series.id)
          }
        } catch (err) {
          console.error('Failed to persist active V2 series package', err)
        }
        setStoryId(firstEpisode?.id || '')
        setTitle(pkg.series?.title || '')
        setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
        setScript('')
        setReport('')
        setReviewText('')
        setReviewTotal(null)
        setForm(prev => ({
          ...prev,
          title: pkg.series?.title || prev.title,
          type: 'series',
          series_name: pkg.series?.title || prev.series_name,
          series_total_episodes: String(pkg.series?.total_episodes || pkg.episodes?.length || prev.series_total_episodes || ''),
          series_episode_number: '1',
          series_is_finale: 'false',
          series_arc_plan: pkg.series?.description || prev.series_arc_plan,
          premise: firstBrief?.premise || prev.premise,
          setting: firstBrief?.setting || prev.setting,
        }))

        setStepMessage('Loaded series package')
      } catch (e) {
        if (!ignore) {
          setReport(e instanceof Error ? e.message : 'Unknown error')
          setStepMessage('Load series package failed')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
          setWorkingMessage('')
        }
      }
    }

    loadSeriesPackage()
    return () => {
      ignore = true
    }
  }, [searchParams])

  useEffect(() => {
    if (!storyId || typeof window === 'undefined') return
    const savedSeriesId = readSavedSeriesId()
    const url = new URL(window.location.href)
    if (url.searchParams.get('seriesId')) return
    if (seriesPackage?.series?.id || savedSeriesId) {
      router.replace(`/admin/story-production-v2?seriesId=${encodeURIComponent(seriesPackage?.series?.id || savedSeriesId)}`, { scroll: false })
      return
    }
    url.searchParams.set('storyId', storyId)
    window.history.replaceState({}, '', url.toString())
  }, [router, storyId, seriesPackage?.series?.id])

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
  const packageScriptsReady = !!seriesPackage && seriesPackage.episodes.length > 0 && seriesPackage.episodes.every((episode) => !!episode.script)
  const isPackageMode = !!seriesPackage?.series?.id
  const packageEpisodeCount = seriesPackage?.episodes.length || 0
  const packageExists = !!seriesPackage?.series?.id
  const packageAllScriptsPresent = packageEpisodeCount > 0 && seriesPackage!.episodes.every((episode) => !!episode.script)
  const packageAllValidationsPass = packageEpisodeCount > 0 && seriesPackage!.episodes.every((episode) => {
    const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
    return episode.status === 'validator_passed' || validation === 'PASS'
  })
  const packageReadyForAsc = !!seriesPackage
    && seriesPackage.episodes.length > 0
    && seriesPackage.episodes.every((episode) => {
      const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
      return !!episode.script && (episode.status === 'validator_passed' || validation === 'PASS')
    })
  const canScore = seriesPackage ? packageScriptsReady && !loading : !!storyId && !!script && !loading
  const canValidate = seriesPackage ? packageScriptsReady && !loading : !!storyId && !!script && !loading
  const canProduce = seriesPackage ? packageReadyForAsc && !loading : !!storyId && !!script && status === 'validator_passed'
  const baseActionClass = 'px-4 py-2 rounded disabled:opacity-50'
  const completedActionClass = `${baseActionClass} bg-gray-200 text-gray-800 border border-gray-300`
  const primaryActionClass = `${baseActionClass} bg-green-600 text-white`
  const blockedActionClass = `${baseActionClass} bg-red-600 text-white`
  const neutralActionClass = `${baseActionClass} bg-black text-white`
  const generateActionClass = seriesPackage
    ? packageAllScriptsPresent
      ? completedActionClass
      : primaryActionClass
    : neutralActionClass
  const scoreActionClass = seriesPackage
    ? packageAllValidationsPass
      ? completedActionClass
      : packageAllScriptsPresent
        ? primaryActionClass
        : blockedActionClass
    : neutralActionClass
  const produceActionClass = seriesPackage
    ? packageReadyForAsc
      ? primaryActionClass
      : blockedActionClass
    : neutralActionClass

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
      if (seriesPackage) {
        if (seriesPackage.episodes.every((episode) => !!episode.script_json?.pre_audio_review)) return 'complete'
        return canScore ? 'waiting' : 'locked'
      }
      if (reviewText) return 'complete'
      return canScore ? 'waiting' : 'locked'
    }
    if (step === 'validate') {
      if (!storyId) return 'locked'
      if (seriesPackage) {
        if (seriesPackage.episodes.some((episode) => episode.status === 'validator_failed')) return 'failed'
        if (seriesPackage.episodes.length > 0 && seriesPackage.episodes.every((episode) => episode.status === 'validator_passed')) return 'complete'
        return canValidate ? 'waiting' : 'locked'
      }
      if (status === 'validator_passed') return 'complete'
      if (status === 'validator_failed') return 'failed'
      return canValidate ? 'waiting' : 'locked'
    }
    return 'locked'
  }

  async function saveBrief() {
    setTitle(form.title || '')
    if (form.type === 'series') {
      if (!SERIES_EPISODE_COUNTS.includes(Number(form.series_total_episodes))) {
        setReport('Episode Count is required for series briefs and must be 3, 5, 7, or 13')
        setStepMessage('Brief failed')
        return
      }
      await saveSeriesPackage()
      return
    }
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
          storyId: storyId && String(storyId).trim() ? storyId : undefined,
          series_episode_number: form.type === 'series' ? Number(form.series_episode_number || 1) : null,
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

      if (queueId && data?.story?.id) {
        try {
          const persistRes = await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2',
              title: form.title || data.story.title || '',
              premise: form.premise || '',
              setting: form.setting || '',
              primaryGenre: form.genre || '',
              duration: form.runtime || '',
              authorTarget: form.author || ''
            }),
          })

          if (!persistRes.ok) {
            const txt = await persistRes.text()
            console.error('Persist storyId to queue failed:', txt)
          }
        } catch (err) {
          console.error('Persist storyId to queue failed:', err)
        }
      }

      try {
        if (queueId) {
          await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2'
            }),
          })
        }
      } catch (err) {
        console.error('Failed to persist storyId to queue item', err)
      }

      try {
        if (typeof window !== 'undefined' && data?.story?.id) {
          localStorage.setItem('et_last_story_id_v2', data.story.id)
          if (queueId) localStorage.setItem('et_last_queue_id_v2', queueId)
        }
      } catch (err) {
        console.error('Failed to persist last active V2 story', err)
      }

      try {
        if (queueId) {
          await fetch('/api/admin/story-queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: queueId,
              storyId: data.story.id,
              status: 'in_v2',
              title: data.story.title || form.title || '',
              premise: form.premise || '',
              setting: form.setting || '',
              primaryGenre: form.genre || '',
              duration: form.runtime || '',
              authorTarget: form.author || '',
            }),
          })
        }
      } catch (err) {
        console.error('Failed to persist storyId back to queue item', err)
      }
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Brief failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function saveSeriesPackage() {
    setLoading(true)
    setActiveStep('brief')
    setWorkingMessage('Planning series package...')
    setStepMessage('')
    setReport('')
    try {
      const res = await fetch('/api/v2/series-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          seriesId: seriesPackage?.series?.id || undefined,
          series_total_episodes: Number(form.series_total_episodes),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create series package')

      const pkg = data.package as SeriesPackage
      const firstEpisode = pkg.episodes?.[0]
      setSeriesPackage(pkg)
      setStoryId(firstEpisode?.id || '')
      setStatus((firstEpisode?.status || 'brief_complete') as V2Status)
      setTitle(pkg.series?.title || '')
      setForm(prev => ({
        ...prev,
        title: pkg.series?.title || prev.title,
        series_name: pkg.series?.title || prev.series_name,
        series_arc_plan: pkg.series?.description || prev.series_arc_plan,
        series_episode_number: '1',
      }))
      setReport(`✓ Series package planned: ${pkg.episodes?.length || 0} episodes`)
      setStepMessage('Series package ready for episode scripting phase')

      if (typeof window !== 'undefined' && pkg.series?.id) {
        const url = new URL(window.location.href)
        url.searchParams.delete('storyId')
        url.searchParams.set('seriesId', pkg.series.id)
        window.history.replaceState({}, '', url.toString())
      }
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Series package planning failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function generateScript() {
    if (seriesPackage?.series?.id) {
      await generateSeriesScripts()
      return
    }

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

  async function generateSeriesScripts() {
    if (!seriesPackage?.series?.id) return

    setLoading(true)
    setActiveStep('script')
    setWorkingMessage('Generating all episode scripts...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/series-package/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesPackage.series.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const episodeNote = data?.failedEpisode ? ` Episode ${data.failedEpisode}.` : ''
        throw new Error(`${data.error || 'Failed to generate series scripts'}${episodeNote}`)
      }

      const pkg = data.package as SeriesPackage
      const firstEpisode = pkg.episodes?.[0]
      setSeriesPackage(pkg)
      setStoryId(firstEpisode?.id || '')
      setStatus((firstEpisode?.status || 'script_drafted') as V2Status)
      setTitle(pkg.series?.title || '')
      setScript('')
      setReport(`✓ Generated scripts for ${pkg.episodes?.length || 0} episodes`)
      setStepMessage('Series scripts drafted. Ready for package score/validate phase.')
      setTimeout(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Series script generation failed')
    } finally {
      setLoading(false)
      setWorkingMessage('')
      setActiveStep('')
    }
  }

  async function scoreScript() {
    if (seriesPackage?.series?.id) {
      await scoreValidateSeriesPackage()
      return
    }

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
    if (seriesPackage?.series?.id) {
      await scoreValidateSeriesPackage()
      return
    }

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

  async function scoreValidateSeriesPackage() {
    if (!seriesPackage?.series?.id) return

    setLoading(true)
    setActiveStep('validate')
    setWorkingMessage('Scoring and validating episodes...')
    setStepMessage('')
    setReport('')
    setReviewText('')
    setReviewTotal(null)
    try {
      const res = await fetch('/api/v2/series-package/score-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesPackage.series.id }),
      })
      const data = await res.json()

      if (data?.package) {
        const pkg = data.package as SeriesPackage
        const firstEpisode = pkg.episodes?.[0]
        setSeriesPackage(pkg)
        setStoryId(firstEpisode?.id || '')
        setStatus((firstEpisode?.status || 'script_drafted') as V2Status)
        setTitle(pkg.series?.title || '')
        setScript('')
      }

      if (!res.ok || !data.success) {
        const episodeNote = data?.failedEpisode ? ` Episode ${data.failedEpisode}.` : ''
        const phaseNote = data?.failurePhase ? ` Phase: ${data.failurePhase}.` : ''
        const failureReport = data?.failureReport ? `\n\n${data.failureReport}` : ''
        throw new Error(`${data.error || 'Series package score/validate failed'}${episodeNote}${phaseNote}${failureReport}`)
      }

      const pkg = data.package as SeriesPackage
      const totals = pkg.episodes
        .map((episode) => episode.script_json?.pre_audio_review?.total)
        .filter((total): total is number => typeof total === 'number')
      const firstTotal = totals.length ? totals[0] : null
      setReviewTotal(firstTotal)
      setReviewText(`Series package score/validate complete.\n\n${pkg.episodes.map((episode) => {
        const n = episode.episode_number || episode.series_episode_number || '?'
        const total = episode.script_json?.pre_audio_review?.total
        return `Episode ${n}: ${typeof total === 'number' ? `${total}/25` : 'score recorded'}, ${episode.validator_result || episode.status}`
      }).join('\n')}`)
      setReport('✓ All episodes passed validation')
      setStepMessage('Series package ready for ASC handoff')
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      setReport(e instanceof Error ? e.message : 'Unknown error')
      setStepMessage('Series package score/validate failed')
      setTimeout(() => validateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
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
            <select
              className="border rounded p-2"
              value={form.type}
              onChange={e => {
                const nextType = e.target.value
                setForm({
                  ...form,
                  type: nextType,
                  series_episode_number: nextType === 'series' ? (form.series_episode_number || '1') : '',
                  series_is_finale: nextType === 'series' ? form.series_is_finale : 'false',
                })
              }}
            >
              <option value="standalone">Standalone</option>
              <option value="series">Series</option>
            </select>
          </div>

          {form.type === 'series' ? (
            <div className="border rounded p-3 bg-gray-50 space-y-3">
              <div className="font-semibold">Series Planning</div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  className="border rounded p-2"
                  placeholder="Series Name"
                  value={form.series_name}
                  onChange={e => setForm({ ...form, series_name: e.target.value })}
                />
                <select
                  className="border rounded p-2"
                  value={form.series_total_episodes}
                  onChange={e => setForm({ ...form, series_total_episodes: e.target.value, series_episode_number: form.series_episode_number || '1' })}
                >
                  <option value="">Episode Count</option>
                  {SERIES_EPISODE_COUNTS.map(count => (
                    <option key={count} value={String(count)}>{count} episodes</option>
                  ))}
                </select>
              </div>
              <input
                className="border rounded p-2 w-full"
                placeholder="Series Episode Number"
                value={form.series_episode_number || '1'}
                onChange={e => setForm({ ...form, series_episode_number: e.target.value || '1' })}
              />
              <textarea
                className="border rounded p-2 w-full"
                rows={5}
                placeholder="Series Bible / Arc Plan: plan the full series continuity, character arcs, episode turns, reveals, and finale before scripting episode one."
                value={form.series_arc_plan}
                onChange={e => setForm({ ...form, series_arc_plan: e.target.value })}
              />
            </div>
          ) : null}

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
          <div><strong>{seriesPackage ? 'First Episode ID' : 'Story ID'}:</strong> {storyId || 'Not created yet'}</div>
          <div><strong>Status:</strong> {status || '—'}</div>
          <div><strong>Title:</strong> {title || '—'}</div>
          <div><strong>Script Score:</strong> {reviewTotal != null ? `${reviewTotal}/25` : '—'}</div>

          {seriesPackage ? (
            <div className="border rounded p-3 bg-gray-50 space-y-3">
              <div>
                <div className="font-semibold">Series Package</div>
                <div className="text-sm text-gray-700">Series ID: {seriesPackage.series.id}</div>
                <div className="text-sm text-gray-700">Episodes: {seriesPackage.episodes.length}</div>
              </div>
              <div className="text-sm whitespace-pre-wrap border rounded bg-white p-3">
                {seriesPackage.series.description || 'No series bible saved yet.'}
              </div>
              <div className="space-y-2">
                {seriesPackage.episodes.map((episode) => {
                  const score = episode.script_json?.pre_audio_review?.total ?? episode.script_json?.series_score_validate?.score_total
                  const validation = episode.validator_result ?? episode.script_json?.series_score_validate?.validator_result
                  const passed = episode.status === 'validator_passed' || validation === 'PASS'
                  const failed = episode.status === 'validator_failed' || validation === 'FAIL'
                  const state = passed ? 'Passed' : failed ? 'Failed' : 'Pending'
                  const stateClass = passed
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : failed
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-gray-200 bg-gray-50 text-gray-700'

                  return (
                  <div key={episode.id} className="border rounded bg-white p-3 text-sm">
                    <div className="font-semibold">Episode {episode.episode_number || episode.series_episode_number}: {episode.title}</div>
                    <div className={`mt-2 grid gap-2 rounded border p-2 sm:grid-cols-3 ${stateClass}`}>
                      <div><strong>Score:</strong> {typeof score === 'number' ? `${score}/25` : 'Not scored'}</div>
                      <div><strong>Validation:</strong> {validation || 'Not validated'}</div>
                      <div><strong>State:</strong> {state}</div>
                    </div>
                    <div className="text-gray-700 mt-2">Status: {episode.status}</div>
                    <div className="text-gray-700">Script: {episode.script ? 'Generated' : 'Not generated'}</div>
                    {episode.script_json?.series_generation?.generated_at ? (
                      <div className="text-gray-600">Generated: {episode.script_json.series_generation.generated_at}</div>
                    ) : null}
                    {episode.validator_passed_at ? (
                      <div className="text-gray-600">Validated: {episode.validator_passed_at}</div>
                    ) : null}
                    {episode.status === 'validator_failed' && episode.validator_report ? (
                      <div className="text-red-700 mt-1 whitespace-pre-wrap">{episode.validator_report}</div>
                    ) : null}
                    {episode.brief_json?.description ? <div className="text-gray-700 mt-1">{episode.brief_json.description}</div> : null}
                    {episode.brief_json?.continuity_notes ? <div className="text-gray-600 mt-1">Continuity: {episode.brief_json.continuity_notes}</div> : null}
                  </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 flex-wrap">
            <button disabled={!canGenerate || loading} className={generateActionClass} onClick={generateScript}>
              {activeStep === 'script' && loading
                ? 'Generating Script...'
                : seriesPackage
                  ? packageAllScriptsPresent ? '✓ Generate All Episode Scripts' : 'Generate All Episode Scripts'
                  : 'Generate Script'}
            </button>
            <button disabled={!canScore || loading} className={scoreActionClass} onClick={scoreScript}>
              {activeStep === 'score' && loading
                ? 'Scoring Script...'
                : seriesPackage
                  ? packageAllValidationsPass ? '✓ Score + Validate All Episodes' : 'Score + Validate All Episodes'
                  : 'Score Script'}
            </button>
            <button disabled={!canValidate || loading} className={scoreActionClass} onClick={validateScript}>
              {activeStep === 'validate' && loading
                ? 'Validating Script...'
                : seriesPackage
                  ? packageAllValidationsPass ? '✓ Score + Validate Package' : 'Score + Validate Package'
                  : 'Validate Script'}
            </button>
            <button
              disabled={!canProduce || loading}
              className={produceActionClass}
              onClick={async () => {
                try {
                  setLoading(true)
                  setActiveStep('produce')
                  setWorkingMessage('Preparing ASC handoff...')
                  setStepMessage('Preparing ASC handoff...')

                  if (seriesPackage?.series?.id) {
                    const res = await fetch('/api/v2/series-package/produce-audio', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ seriesId: seriesPackage.series.id }),
                    })

                    const data = await res.json()
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || 'Failed to prepare series package ASC handoff')
                    }

                    if (data?.package) {
                      const pkg = data.package as SeriesPackage
                      const firstEpisode = pkg.episodes?.[0]
                      setSeriesPackage(pkg)
                      setStoryId(firstEpisode?.id || storyId)
                      setStatus((firstEpisode?.status || 'audio_pending') as V2Status)
                    }

                    if (typeof window !== 'undefined') {
                      localStorage.setItem('et_last_series_id_v2', seriesPackage.series.id)
                      localStorage.setItem('et_asc_package_handoff_v1', JSON.stringify(data.handoff))
                      localStorage.removeItem('et_asc_handoff_v1')
                    }

                    const episodeLines = (data.handoff?.episodes || [])
                      .map((episode: any) => `Episode ${episode.episodeNumber}: ${episode.title} (${episode.storyId})`)
                      .join('\n')
                    setReport(`Series package ASC handoff prepared.\n\n${episodeLines}`)
                    setStepMessage('Series package ready for ordered ASC production')
                    return
                  }

                  const res = await fetch('/api/v2/produce-audio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      storyId,
                      title: form.title || title || 'Untitled Story',
                      script,
                    }),
                  })

                  const data = await res.json()
                  if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to prepare ASC handoff')
                  }

                  setStatus('audio_pending')

                  try {
                    const handoff = {
                      storyId: data?.storyId || storyId || '',
                      title: form.title || title || '',
                      author: form.author || '',
                      genre: form.genre || '',
                      queueId: queueId || '',
                      script: script || '',
                      handoffPath: data?.handoffPath || '',
                      status: 'ready_for_asc',
                      updatedAt: new Date().toISOString(),
                    }
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('et_asc_handoff_v1', JSON.stringify(handoff))
                    }
                  } catch (err) {
                    console.error('Failed to prepare admin ASC handoff', err)
                  }

                  try {
                    if (queueId) {
                      await fetch('/api/admin/story-queue', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: queueId, status: 'ready_for_asc' }),
                      })
                    }
                  } catch (err) {
                    console.error('Failed to mark queue ready_for_asc', err)
                  }

                  setReport((prev: string) => {
                    const note = `ASC handoff prepared. ${data?.handoffPath || ''}`.trim()
                    return prev ? `${prev}\n\n${note}` : note
                  })
                  setStepMessage('Sent to ASC')

                  window.location.href = '/admin/asc'
                  return
                } catch (e) {
                  setReport(e instanceof Error ? e.message : 'Unknown error')
                  setStepMessage('Produce Audio failed')
                } finally {
                  setLoading(false)
                  setWorkingMessage('')
                  setActiveStep('')
                }
              }}
            >
              {activeStep === 'produce' && loading ? 'Preparing ASC...' : 'Produce Audio (Phase 2)'}
            </button>
          </div>
          {seriesPackage ? (
            <div className="rounded border border-gray-300 bg-gray-50 p-2 text-xs text-gray-700">
              <strong>Produce readiness:</strong>{' '}
              package {packageExists ? 'yes' : 'no'} | episodes {packageEpisodeCount} | scripts {packageAllScriptsPresent ? 'yes' : 'no'} | validation {packageAllValidationsPass ? 'PASS' : 'not ready'} | loading {loading ? 'yes' : 'no'}
            </div>
          ) : null}
        </div>

        {!isPackageMode ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
