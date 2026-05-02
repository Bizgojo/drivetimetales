'use client'

import { useEffect, useState } from 'react'

type AscHandoff = {
  type?: 'single_story' | 'series_package'
  storyId?: string
  title?: string
  author?: string
  genre?: string
  queueId?: string
  handoffPath?: string
  status?: string
  updatedAt?: string
  script?: string
  audio_url?: string
  cover_url?: string
  description?: string
  duration_mins?: number | string
  is_free?: boolean
  productionJobId?: string
  seriesId?: string
  episodeCount?: number
  episodes?: Array<{
    storyId?: string
    title?: string
    author?: string
    genre?: string
    episodeNumber?: number
    seriesId?: string
    seriesTitle?: string
    seriesName?: string
    seriesTotalEpisodes?: number
    seriesIsFinale?: boolean
    status?: string
    script?: string
    imported?: boolean
    importedAt?: string
    audioUrl?: string
    finalMix?: string
    coverUrl?: string
  }>
  packageJobs?: ProductionJob[]
}

type ProductionJob = {
  jobId?: string
  status?: string
  phase?: string
  message?: string
  error?: string
  details?: any
  updatedAt?: string
  storyId?: string
  title?: string
  episodeNumber?: number
  projectDir?: string
  finalMix?: string
  audioUrl?: string
  coverUrl?: string
  imported?: boolean
  importedAt?: string
}

const STORAGE_KEY = 'et_asc_handoff_v1'
const PACKAGE_STORAGE_KEY = 'et_asc_package_handoff_v1'
const V2_RESTORE_KEYS = [
  'et_last_series_id_v2',
  'et_last_story_id_v2',
  'et_last_queue_id_v2',
]

function classifyFailure(job: ProductionJob) {
  const phase = (job.phase || '').toLowerCase()
  const message = job.message || ''
  const error = job.error || ''
  const details = JSON.stringify(job.details || {}).toLowerCase()
  const combined = `${message} ${error}`.toLowerCase()

  if (combined.includes('timed out') && message.includes('Rendering ASC3 final mix')) {
    return {
      classification: 'render/mix timeout',
      confidence: 'high',
      suggestedNextStep: 'Increase or verify the render-final-mix timeout, then retry this episode only.',
    }
  }

  if (phase === 'voices') {
    return {
      classification: 'voice generation issue',
      confidence: 'medium',
      suggestedNextStep: 'Inspect generate-voices output and voice/segment generation logs before retrying.',
    }
  }

  if (
    details.includes('no intro audio') ||
    details.includes('no outro audio') ||
    details.includes('no story segments') ||
    details.includes('missing intro') ||
    details.includes('missing outro') ||
    details.includes('missing segment')
  ) {
    return {
      classification: 'missing asset',
      confidence: 'medium',
      suggestedNextStep: 'Regenerate the missing intro, outro, or story segment asset before retrying.',
    }
  }

  if (
    details.includes('status') ||
    details.includes('http') ||
    details.includes('failed to load') ||
    details.includes('500') ||
    details.includes('404') ||
    details.includes('response')
  ) {
    return {
      classification: 'route/API failure',
      confidence: 'medium',
      suggestedNextStep: 'Inspect the route response details and server logs for the failing API call.',
    }
  }

  return {
    classification: 'unknown',
    confidence: 'low',
    suggestedNextStep: 'Inspect the raw job fields and server logs before deciding whether retry is safe.',
  }
}

export default function AscAdminPage() {
  const [handoff, setHandoff] = useState<AscHandoff | null>(null)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  const [isLocalRuntime, setIsLocalRuntime] = useState(false)
  const [job, setJob] = useState<ProductionJob | null>(null)
  const [packageJobs, setPackageJobs] = useState<ProductionJob[]>([])
  const [failureInspectionJob, setFailureInspectionJob] = useState<ProductionJob | null>(null)
  const [creditsApproved, setCreditsApproved] = useState(false)

  const [form, setForm] = useState({
    audio_url: '',
    cover_url: '',
    description: '',
    duration_mins: '15',
    is_free: false,
  })

  useEffect(() => {
    refreshHandoff()
    const hostname = window.location.hostname
    setIsLocalRuntime(
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local')
    )
  }, [])

  const hasActiveSingleJob = Boolean(handoff?.productionJobId) && (() => {
    const status = (job?.status || handoff?.status || '').toLowerCase()
    return status === 'queued' || status === 'running' || status === 'ready_for_asc'
  })()
  const hasActivePackageJobs = packageJobs.some((packageJob) => {
    const status = (packageJob.status || '').toLowerCase()
    return status === 'queued' || status === 'running'
  })

  useEffect(() => {
    if ((!hasActivePackageJobs && !hasActiveSingleJob) || working) return

    const timer = window.setInterval(() => {
      refreshProductionStatus({ silent: true })
    }, 15000)

    return () => window.clearInterval(timer)
  }, [hasActivePackageJobs, hasActiveSingleJob, working])

  function refreshHandoff() {
    try {
      const packageRaw = localStorage.getItem(PACKAGE_STORAGE_KEY)
      const raw = packageRaw || localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        setHandoff(null)
        setMessage('No ASC handoff found.')
        return
      }
      const parsed = JSON.parse(raw)
      setHandoff(parsed)
      setPackageJobs(parsed.packageJobs || [])
      setForm({
        audio_url: parsed.audio_url || '',
        cover_url: parsed.cover_url || '',
        description: parsed.description || '',
        duration_mins: String(parsed.duration_mins || 15),
        is_free: Boolean(parsed.is_free),
      })
      setMessage(packageRaw ? 'ASC package handoff refreshed.' : 'ASC handoff refreshed.')
    } catch {
      setMessage('Could not read ASC handoff.')
    }
  }

  function clearHandoff() {
    try {
      clearProductionWorkspace()
      setMessage('ASC handoff cleared.')
    } catch {
      setMessage('Could not clear ASC handoff.')
    }
  }

  function clearProductionWorkspace() {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PACKAGE_STORAGE_KEY)
    V2_RESTORE_KEYS.forEach((key) => localStorage.removeItem(key))
    setHandoff(null)
    setPackageJobs([])
    setJob(null)
    setForm({
      audio_url: '',
      cover_url: '',
      description: '',
      duration_mins: '15',
      is_free: false,
    })
  }

  async function runAscProduction() {
    const isPackageHandoff = handoff?.type === 'series_package' || !!handoff?.episodes?.length
    const packageEpisodes = handoff?.episodes || []

    if (isPackageHandoff) {
      if (!handoff?.seriesId || !handoff?.title || !packageEpisodes.length) {
        setMessage('Missing package handoff data.')
        return
      }

      const missingEpisode = packageEpisodes.find((episode) => !episode.storyId || !episode.title || !episode.script)
      if (missingEpisode) {
        setMessage(`Episode ${missingEpisode.episodeNumber || '?'} missing storyId, title, or script.`)
        return
      }

      try {
        setWorking(true)
        setMessage('Starting package ASC production...')

        const res = await fetch('/api/admin/run-asc-package-production', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesId: handoff.seriesId,
            title: handoff.title,
            episodes: packageEpisodes,
          }),
        })

        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to start package ASC production')
        }

        const jobs = data.jobs || []
        const updated = {
          ...handoff,
          packageJobs: jobs,
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(updated))
        setHandoff(updated)
        setPackageJobs(jobs)
        setMessage(`Queued ${jobs.length} package ASC production jobs.`)
      } catch (err: any) {
        setMessage(err?.message || 'Failed to start package ASC production')
      } finally {
        setWorking(false)
      }
      return
    }

    if (!handoff?.storyId || !handoff?.title) {
      setMessage('Missing story handoff data.')
      return
    }

    try {
      setWorking(true)
      setMessage('Starting ASC production...')

      const res = await fetch('/api/admin/run-asc-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: handoff.storyId,
          title: handoff.title,
          queueId: handoff.queueId || '',
          script: handoff.script || '',
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start ASC production')
      }

      const updated = {
        ...handoff,
        productionJobId: data.jobId,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setHandoff(updated)
      setJob({
        jobId: data.jobId,
        status: data.status,
        phase: data.phase,
      })
      setMessage('Headless ASC production started.')
    } catch (err: any) {
      setMessage(err?.message || 'Failed to start ASC production')
    } finally {
      setWorking(false)
    }
  }

  async function refreshProductionStatus(options: { silent?: boolean } = {}) {
    if ((handoff?.type === 'series_package' || handoff?.episodes?.length) && packageJobs.length) {
      try {
        setWorking(true)
        const refreshedJobs = []

        for (const packageJob of packageJobs) {
          if (!packageJob.jobId) {
            refreshedJobs.push(packageJob)
            continue
          }

          const res = await fetch(`/api/admin/asc-production-status?jobId=${encodeURIComponent(packageJob.jobId)}`)
          const data = await res.json()
          if (!res.ok || !data.success) {
            refreshedJobs.push({
              ...packageJob,
              status: 'unknown',
              phase: packageJob.phase || 'unknown',
              error: data.error || 'Failed to load production status',
              updatedAt: new Date().toISOString(),
            })
            continue
          }

          refreshedJobs.push({
            ...packageJob,
            ...data.job,
          })
        }

        const updated = {
          ...handoff,
          packageJobs: refreshedJobs,
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(updated))
        setHandoff(updated)
        setPackageJobs(refreshedJobs)
        if (!options.silent) {
          setMessage(`Refreshed ${refreshedJobs.length} package production jobs.`)
        }
      } catch (err: any) {
        setMessage(err?.message || 'Failed to load package production status')
      } finally {
        setWorking(false)
      }
      return
    }

    if (!handoff?.productionJobId) {
      setMessage('No production job found yet.')
      return
    }

    try {
      setWorking(true)
      const res = await fetch(`/api/admin/asc-production-status?jobId=${encodeURIComponent(handoff.productionJobId)}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load production status')
      }
      setJob(data.job || null)
      if (!options.silent) {
        setMessage(`Production status: ${data.job?.status || 'unknown'}`)
      }
    } catch (err: any) {
      setMessage(err?.message || 'Failed to load production status')
    } finally {
      setWorking(false)
    }
  }

  async function importAscOutput() {
    if (!handoff?.title) {
      setMessage('No handoff title found.')
      return
    }

    if (handoff.type === 'series_package' || handoff.episodes?.length) {
      try {
        setWorking(true)
        setMessage('Importing package ASC outputs...')

        const importedJobs = packageJobs.map((packageJob) => {
          if (
            !packageJob.storyId ||
            !packageJob.title ||
            !packageJob.audioUrl ||
            !packageJob.finalMix ||
            packageJob.status !== 'complete' ||
            packageJob.phase !== 'published'
          ) {
            throw new Error(`Episode ${packageJob.episodeNumber || '?'} is not ready to import`)
          }

          return {
            ...packageJob,
            imported: true,
            importedAt: new Date().toISOString(),
          }
        })

        const updatedEpisodes = (handoff.episodes || []).map((episode) => {
          const importedJob = importedJobs.find((packageJob) => packageJob.storyId === episode.storyId)
          return importedJob
            ? {
                ...episode,
                imported: true,
                importedAt: importedJob.importedAt,
                audioUrl: importedJob.audioUrl,
                finalMix: importedJob.finalMix,
                coverUrl: importedJob.coverUrl || '',
              }
            : episode
        })

        const updated = {
          ...handoff,
          episodes: updatedEpisodes,
          packageJobs: importedJobs,
          imported: true,
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(updated))
        clearProductionWorkspace()
        setMessage(`Imported ${importedJobs.length} package episode outputs. Production workspace cleared for the next story.`)
      } catch (err: any) {
        setMessage(err?.message || 'Package import failed')
      } finally {
        setWorking(false)
      }
      return
    }

    try {
      setWorking(true)
      setMessage('Importing ASC output...')

      const res = await fetch('/api/admin/import-asc-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: handoff.title }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Import failed')
      }

      setForm(prev => ({
        ...prev,
        audio_url: data.audio_url || prev.audio_url,
        cover_url: data.cover_url || prev.cover_url,
      }))

      const updated = {
        ...handoff,
        audio_url: data.audio_url || handoff.audio_url,
        cover_url: data.cover_url || handoff.cover_url,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setHandoff(updated)
      setMessage('ASC output imported.')
    } catch (err: any) {
      setMessage(err?.message || 'Import failed')
    } finally {
      setWorking(false)
    }
  }

  async function completeStoryPackage() {
    if (!handoff?.storyId) {
      setMessage('No storyId found in ASC handoff.')
      return
    }

    try {
      setWorking(true)
      setMessage('Completing story package...')

      const res = await fetch('/api/admin/complete-story-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: handoff.storyId }),
      })

      const data = await res.json()
      const steps = Array.isArray(data.steps) ? data.steps : []
      const failedStep = steps.find((step: any) => step?.status === 'failed')

      if (!res.ok || !data.success || failedStep) {
        const fallback = data.error || 'Package completion failed'
        const detail = failedStep ? `${failedStep.step}: ${failedStep.message}` : fallback
        throw new Error(`Package incomplete: ${detail}`)
      }

      const { data: storyRow, error: storyError } = await supabase
        .from('stories')
        .select('audio_url, cover_url, description, duration_mins')
        .eq('id', handoff.storyId)
        .single()

      if (storyError) {
        throw new Error(`Package completed, but failed to reload story fields: ${storyError.message}`)
      }

      const updated = {
        ...handoff,
        audio_url: storyRow?.audio_url || form.audio_url || handoff.audio_url,
        cover_url: storyRow?.cover_url || form.cover_url || handoff.cover_url,
        description: storyRow?.description || form.description || handoff.description,
        duration_mins: storyRow?.duration_mins || form.duration_mins || handoff.duration_mins,
        updatedAt: new Date().toISOString(),
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setHandoff(updated)
      setForm(prev => ({
        ...prev,
        audio_url: storyRow?.audio_url || prev.audio_url,
        cover_url: storyRow?.cover_url || prev.cover_url,
        description: storyRow?.description || prev.description,
        duration_mins: String(storyRow?.duration_mins || prev.duration_mins),
      }))

      const summary = steps.map((step: any) => `${step.step} ${step.status}`).join(', ')
      setMessage(`Package complete: ${summary}.`)
    } catch (err: any) {
      setMessage(err?.message || 'Package completion failed')
    } finally {
      setWorking(false)
    }
  }

  function saveDraftPackageLocally() {
    if (!handoff) return
    const updated = {
      ...handoff,
      audio_url: form.audio_url.trim(),
      cover_url: form.cover_url.trim(),
      description: form.description.trim(),
      duration_mins: Number(form.duration_mins || 15),
      is_free: true,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setHandoff(updated)
    setMessage('ASC package draft saved locally.')
  }

  async function publishStory() {
    if (!handoff?.storyId) {
      setMessage('No storyId found in ASC handoff.')
      return
    }

    try {
      setWorking(true)
      setMessage('Publishing story...')

      const payload = {
        storyId: handoff.storyId,
        queueId: handoff.queueId || '',
        title: handoff.title || '',
        author: handoff.author || '',
        genre: handoff.genre || '',
        audio_url: form.audio_url.trim(),
        cover_url: form.cover_url.trim(),
        description: form.description.trim(),
        duration_mins: Number(form.duration_mins || 15),
        is_free: true,
      }

      const res = await fetch('/api/admin/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Publish failed')
      }

      const updated = {
        ...handoff,
        ...payload,
        status: 'published',
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      clearProductionWorkspace()
      setMessage(`Published: ${data.story?.title || handoff.title || 'Story'}. Production workspace cleared for the next story.`)
    } catch (err: any) {
      setMessage(err?.message || 'Publish failed')
    } finally {
      setWorking(false)
    }
  }

  const isPackageHandoff = handoff?.type === 'series_package' || !!handoff?.episodes?.length
  const packageEpisodes = handoff?.episodes || []
  const packageCanRun = !!handoff?.seriesId
    && !!handoff?.title
    && packageEpisodes.length > 0
    && packageEpisodes.every((episode) => !!episode.storyId && !!episode.title && !!episode.script)
  const canRefreshProductionStatus = isPackageHandoff ? packageJobs.length > 0 : !!handoff?.productionJobId
  const singleJobPublished = !isPackageHandoff && job?.status === 'complete' && job?.phase === 'published'
  const singleProductionRunning = !isPackageHandoff && (
    working
    || job?.status === 'running'
    || job?.status === 'queued'
    || handoff?.status === 'running'
  )
  const canRunProduction = isPackageHandoff
    ? packageCanRun
    : !!handoff?.storyId && !singleProductionRunning && !singleJobPublished
  const canRunProductionHere = canRunProduction && isLocalRuntime
  const canStartProduction = canRunProductionHere && creditsApproved && !working
  const canImportSingleOutput = !isPackageHandoff
    && !!handoff?.title
    && !singleProductionRunning
  const canCompleteSingleStoryPackage = !isPackageHandoff
    && !!handoff?.storyId
    && !!form.audio_url
    && !working
    && !singleProductionRunning
  const canPublishSingleStory = !isPackageHandoff
    && !!handoff?.storyId
    && !singleProductionRunning
    && !!form.audio_url
    && !!form.cover_url
    && !!form.description
    && !!form.duration_mins
  const packageCompletionRows = packageEpisodes.map((episode) => {
    const episodeJob = packageJobs.find((packageJob) => packageJob.storyId === episode.storyId)
    return {
      episode,
      job: episodeJob,
      imported: Boolean(episode.imported || episodeJob?.imported),
      publishedComplete: episodeJob?.status === 'complete' && episodeJob?.phase === 'published',
      hasAudioUrl: Boolean(episode.audioUrl || episodeJob?.audioUrl),
      hasFinalMix: Boolean(episode.finalMix || episodeJob?.finalMix),
    }
  })
  const packageAllImported = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.imported)
  const packageAllPublished = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.publishedComplete)
  const packageAllAudioReady = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.hasAudioUrl && row.hasFinalMix)
  const inspectedFailure = failureInspectionJob ? classifyFailure(failureInspectionJob) : null

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ASC</h1>
        <p className="text-sm text-gray-500 mt-2">
          Headless production, final packaging, and publish.
        </p>
        {message ? (
          <div className="mt-3 inline-block rounded bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div className="font-semibold text-lg">Current ASC Handoff</div>

          {!handoff ? (
            <div className="text-sm text-gray-500">No handoff is loaded yet.</div>
          ) : handoff.type === 'series_package' || handoff.episodes?.length ? (
            <div className="space-y-3 text-sm">
              <div><strong>Type:</strong> Series Package</div>
              <div><strong>Series:</strong> {handoff.title || '—'}</div>
              <div><strong>Series ID:</strong> {handoff.seriesId || '—'}</div>
              <div><strong>Episodes:</strong> {handoff.episodeCount || handoff.episodes?.length || 0}</div>
              <div><strong>Status:</strong> {handoff.status || '—'}</div>
              <div><strong>Updated:</strong> {handoff.updatedAt || '—'}</div>
              <div className="rounded border border-dashed border-gray-300 p-3 space-y-2">
                {(handoff.episodes || []).map((episode) => (
                  <div key={episode.storyId || episode.episodeNumber} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                    <div><strong>Episode {episode.episodeNumber || '—'}:</strong> {episode.title || '—'}</div>
                    <div className="text-gray-600">Story ID: {episode.storyId || '—'}</div>
                    <div className="text-gray-600">Status: {episode.status || '—'}{episode.seriesIsFinale ? ' | Finale' : ''}</div>
                    <div className="text-gray-600">Imported: {episode.imported ? 'yes' : 'no'}</div>
                    {episode.audioUrl ? <div className="text-gray-600 break-all">Audio: {episode.audioUrl}</div> : null}
                    {episode.finalMix ? <div className="text-gray-600 break-all">Final mix: {episode.finalMix}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div><strong>Title:</strong> {handoff.title || '—'}</div>
              <div><strong>Author:</strong> {handoff.author || '—'}</div>
              <div><strong>Genre:</strong> {handoff.genre || '—'}</div>
              <div><strong>Story ID:</strong> {handoff.storyId || '—'}</div>
              <div><strong>Queue ID:</strong> {handoff.queueId || '—'}</div>
              <div><strong>Status:</strong> {handoff.status || '—'}</div>
              <div><strong>Handoff Path:</strong> {handoff.handoffPath || '—'}</div>
              <div><strong>Updated:</strong> {handoff.updatedAt || '—'}</div>
            </div>
          )}

          {job ? (
            <div className="rounded border border-dashed border-gray-400 p-3 text-sm space-y-1">
              <div><strong>Production Job:</strong> {job.jobId || '—'}</div>
              <div><strong>Status:</strong> {job.status || '—'}</div>
              <div><strong>Phase:</strong> {job.phase || '—'}</div>
              <div><strong>Message:</strong> {job.message || job.error || '—'}</div>
              <div><strong>Updated:</strong> {job.updatedAt || '—'}</div>
            </div>
          ) : null}

          {packageJobs.length ? (
            <div className="rounded border border-dashed border-gray-400 p-3 text-sm space-y-2">
              <div className="font-semibold">Package Production Jobs</div>
              {packageJobs.map((packageJob) => {
                const isFailedJob = packageJob.status === 'failed' || packageJob.phase === 'exception'
                return (
                  <div key={packageJob.jobId} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                    <div><strong>Episode {packageJob.episodeNumber || '—'}:</strong> {packageJob.title || '—'}</div>
                    <div><strong>Job:</strong> {packageJob.jobId || '—'}</div>
                    <div><strong>Status:</strong> {packageJob.status || '—'} / {packageJob.phase || '—'}</div>
                    <div><strong>Imported:</strong> {packageJob.imported ? 'yes' : 'no'}</div>
                    {packageJob.audioUrl ? <div className="text-gray-600 break-all">Audio: {packageJob.audioUrl}</div> : null}
                    {packageJob.finalMix ? <div className="text-gray-600 break-all">Final mix: {packageJob.finalMix}</div> : null}
                    {isFailedJob ? (
                      <button
                        type="button"
                        onClick={() => setFailureInspectionJob(packageJob)}
                        className="mt-2 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                      >
                        Inspect Failure
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}

          {!isLocalRuntime ? (
            <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              ASC production must be run locally or by an external worker. Vercel serverless cannot run detached Python workers.
            </div>
          ) : null}

          <div className={`rounded border p-3 text-sm ${canRunProductionHere && creditsApproved ? 'border-green-600 bg-green-50 text-green-900' : 'border-amber-500 bg-amber-50 text-amber-900'}`}>
            <div className="font-semibold">Local ASC Ready</div>
            <div className="mt-2 grid gap-1 text-xs">
              <div>Local runtime: {isLocalRuntime ? 'yes' : 'no'}</div>
              <div>Handoff loaded: {handoff ? 'yes' : 'no'}</div>
              <div>Mode: {isPackageHandoff ? 'package' : 'single'}</div>
              {isPackageHandoff ? (
                <>
                  <div>Series ID present: {handoff?.seriesId ? 'yes' : 'no'}</div>
                  <div>Title present: {handoff?.title ? 'yes' : 'no'}</div>
                  <div>Episode count: {packageEpisodes.length}</div>
                  <div>All episodes have storyId/title/script: {packageCanRun ? 'yes' : 'no'}</div>
                  <div>No running package job: {!hasActivePackageJobs ? 'yes' : 'no'}</div>
                </>
              ) : (
                <>
                  <div>Story ID present: {handoff?.storyId ? 'yes' : 'no'}</div>
                  <div>Title present: {handoff?.title ? 'yes' : 'no'}</div>
                  <div>Script present: {handoff?.script ? 'yes' : 'no'}</div>
                  <div>No running job: {!singleProductionRunning ? 'yes' : 'no'}</div>
                </>
              )}
            </div>
            <div className="mt-3 rounded border border-amber-300 bg-white/70 p-2 text-xs font-semibold">
              <div>Check ElevenLabs credits before producing audio.</div>
              <div>2,000,000 ElevenLabs credits refresh on the 9th of each month.</div>
              <div>Recent known remaining credits: 162,515. Confirm before running.</div>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={creditsApproved}
                onChange={(event) => setCreditsApproved(event.target.checked)}
              />
              <span>I have checked ElevenLabs credits and Marc approved production.</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={refreshHandoff} className="bg-black text-white px-4 py-2 rounded">
              Refresh Handoff
            </button>
            <button onClick={clearHandoff} className="bg-gray-200 text-black px-4 py-2 rounded">
              Clear Handoff
            </button>
            <button
              onClick={runAscProduction}
              disabled={!canStartProduction}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {working ? 'Working...' : isLocalRuntime ? 'Run ASC Production' : 'Run ASC Production Locally Only'}
            </button>
            <button
              onClick={refreshProductionStatus}
              disabled={!canRefreshProductionStatus || working}
              className="bg-gray-200 text-black px-4 py-2 rounded disabled:opacity-50"
            >
              Refresh Production Status
            </button>
          </div>
        </div>

        {isPackageHandoff ? (
          <div className="bg-white border border-black rounded-lg p-4 space-y-4">
            <div>
              <div className="font-semibold text-lg">Series Package Completion</div>
              <div className="text-sm text-gray-600 mt-1">
                Episode publishing is handled by the package ASC jobs. The single-story publish form is not used for series packages.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className={`rounded border p-3 ${packageAllImported ? 'border-green-600 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                <div className="font-semibold">Imported</div>
                <div>{packageAllImported ? 'yes' : 'no'}</div>
              </div>
              <div className={`rounded border p-3 ${packageAllPublished ? 'border-green-600 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                <div className="font-semibold">Published/complete</div>
                <div>{packageAllPublished ? 'yes' : 'no'}</div>
              </div>
              <div className={`rounded border p-3 ${packageAllAudioReady ? 'border-green-600 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                <div className="font-semibold">Outputs ready</div>
                <div>{packageAllAudioReady ? 'yes' : 'no'}</div>
              </div>
            </div>

            <div className="rounded border border-dashed border-gray-400 p-3 text-sm space-y-2">
              {packageCompletionRows.length ? packageCompletionRows.map((row) => (
                <div key={row.episode.storyId || row.episode.episodeNumber} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                  <div className="font-semibold">Episode {row.episode.episodeNumber || '—'}: {row.episode.title || row.job?.title || '—'}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700 mt-1">
                    <div>Imported: {row.imported ? 'yes' : 'no'}</div>
                    <div>Published/complete: {row.publishedComplete ? 'yes' : 'no'}</div>
                    <div>Audio URL present: {row.hasAudioUrl ? 'yes' : 'no'}</div>
                    <div>Final mix present: {row.hasFinalMix ? 'yes' : 'no'}</div>
                  </div>
                </div>
              )) : (
                <div className="text-gray-600">No package episodes are loaded.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={importAscOutput}
                disabled={!canImportSingleOutput}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {working ? 'Working...' : 'Import ASC Output'}
              </button>
              <button
                disabled
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded cursor-not-allowed"
              >
                Series package episodes already published
              </button>
            </div>

            <div className="rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600">
              Package mode does not call the single-story publish route. Use the episode/job states above as the current package completion record.
            </div>
          </div>
        ) : singleJobPublished ? (
          <div className="bg-white border border-black rounded-lg p-4 space-y-4">
            <div>
              <div className="font-semibold text-lg">Story Published</div>
              <div className="text-sm text-gray-600 mt-1">
                ASC completed the final mix, imported the output, and published this story.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded border border-green-600 bg-green-50 p-3">
                <div className="font-semibold">Production</div>
                <div>complete</div>
              </div>
              <div className="rounded border border-green-600 bg-green-50 p-3">
                <div className="font-semibold">Publish</div>
                <div>complete</div>
              </div>
              <div className="rounded border border-green-600 bg-green-50 p-3">
                <div className="font-semibold">Workspace</div>
                <div>ready to clear</div>
              </div>
            </div>

            <div className="rounded border border-dashed border-gray-400 p-4 text-sm text-gray-700 space-y-1">
              <div><strong>Title:</strong> {handoff?.title || '—'}</div>
              <div><strong>Story ID:</strong> {handoff?.storyId || '—'}</div>
              <div><strong>Job:</strong> {job?.jobId || '—'}</div>
              <div><strong>Message:</strong> {job?.message || 'Published by ASC worker.'}</div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={clearHandoff}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Clear Workspace for Next Story
              </button>
              <button
                onClick={refreshProductionStatus}
                disabled={!canRefreshProductionStatus || working}
                className="bg-gray-200 text-black px-4 py-2 rounded disabled:opacity-50"
              >
                Refresh Production Status
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-black rounded-lg p-4 space-y-4">
            <div className="font-semibold text-lg">Final Story Package</div>

            <input
              className="border rounded p-2 w-full"
              placeholder="Final audio URL"
              value={form.audio_url}
              onChange={(e) => setForm(prev => ({ ...prev, audio_url: e.target.value }))}
            />

            <input
              className="border rounded p-2 w-full"
              placeholder="Final cover URL"
              value={form.cover_url}
              onChange={(e) => setForm(prev => ({ ...prev, cover_url: e.target.value }))}
            />

            <textarea
              className="border rounded p-2 w-full h-24"
              placeholder="Short story card hook / description"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            />

            <input
              className="border rounded p-2 w-full"
              placeholder="Duration mins"
              value={form.duration_mins}
              onChange={(e) => setForm(prev => ({ ...prev, duration_mins: e.target.value }))}
            />

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={importAscOutput}
                disabled={!handoff?.title || working}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {working ? 'Working...' : 'Import ASC Output'}
              </button>

              <button
                onClick={completeStoryPackage}
                disabled={!canCompleteSingleStoryPackage}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {working ? 'Working...' : 'Complete Story Package'}
              </button>

              <button
                onClick={saveDraftPackageLocally}
                className="bg-gray-200 text-black px-4 py-2 rounded"
              >
                Save Package Draft
              </button>

              <button
                onClick={publishStory}
                disabled={!canPublishSingleStory}
                className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {working ? 'Publishing...' : 'Publish Story Live'}
              </button>
            </div>

            <div className="rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600">
              {singleProductionRunning
                ? 'Production is still running. Import ASC Output after it completes, then publish when audio URL, cover URL, description, and duration are present.'
                : 'Publish requires: audio URL, cover URL, description, and duration.'}
            </div>
          </div>
        )}
      </div>

      {failureInspectionJob && inspectedFailure ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">ASC Failure Inspection</div>
                <div className="text-sm text-gray-600">
                  Episode {failureInspectionJob.episodeNumber || '—'}: {failureInspectionJob.title || '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFailureInspectionJob(null)}
                className="rounded bg-gray-200 px-3 py-1 text-sm text-black"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><strong>Job ID:</strong> {failureInspectionJob.jobId || '—'}</div>
              <div><strong>Status:</strong> {failureInspectionJob.status || '—'}</div>
              <div><strong>Phase:</strong> {failureInspectionJob.phase || '—'}</div>
              <div><strong>Final mix present:</strong> {failureInspectionJob.finalMix ? 'yes' : 'no'}</div>
              <div><strong>Audio URL present:</strong> {failureInspectionJob.audioUrl ? 'yes' : 'no'}</div>
              <div className="sm:col-span-2"><strong>Message:</strong> {failureInspectionJob.message || '—'}</div>
              <div className="sm:col-span-2"><strong>Error:</strong> {failureInspectionJob.error || '—'}</div>
              <div className="break-all sm:col-span-2"><strong>Project dir:</strong> {failureInspectionJob.projectDir || '—'}</div>
            </div>

            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm">
              <div><strong>Likely cause:</strong> {inspectedFailure.classification}</div>
              <div><strong>Confidence:</strong> {inspectedFailure.confidence}</div>
              <div><strong>Suggested next step:</strong> {inspectedFailure.suggestedNextStep}</div>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Stage 1 is inspection-only. Retry and auto-fix actions are intentionally not enabled here.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
