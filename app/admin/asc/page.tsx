'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  packageJobId?: string
  packageJob?: ProductionJob
  packageJobs?: ProductionJob[]
}

type ProductionJob = {
  packageJobId?: string
  jobId?: string
  status?: string
  phase?: string
  message?: string
  error?: string
  details?: any
  createdAt?: string
  updatedAt?: string
  storyId?: string
  title?: string
  queueId?: string
  episodeNumber?: number
  projectDir?: string
  finalMix?: string
  audioUrl?: string
  coverUrl?: string
  imported?: boolean
  importedAt?: string
  publishedStory?: any
  currentEpisode?: number
  currentJobId?: string
}

type PackageStoryOutput = {
  id: string
  audio_url?: string | null
  story_audio_url?: string | null
  cover_url?: string | null
  status?: string | null
  is_hidden?: boolean | null
  published_on?: string | null
}

type PackageImportReport = {
  storyId: string
  episodeNumber?: number
  title: string
  completeStatus: 'pending' | 'success' | 'failed'
  publishStatus: 'pending' | 'success' | 'failed' | 'skipped'
  verified: boolean
  route?: string
  error?: string
  dbState?: {
    status?: string | null
    is_hidden?: boolean | null
    published_on?: string | null
    cover_url?: string | null
  }
}

const STORAGE_KEY = 'et_asc_handoff_v1'
const PACKAGE_STORAGE_KEY = 'et_asc_package_handoff_v1'
const V2_RESTORE_KEYS = [
  'et_last_series_id_v2',
  'et_last_story_id_v2',
  'et_last_queue_id_v2',
]

const ASC_PROGRESS_POLL_MS = 5000

const ASC_PHASE_STEPS = [
  { key: 'preparing', label: 'preparing', percent: 5 },
  { key: 'splitting', label: 'splitting script', percent: 15 },
  { key: 'narrator', label: 'generating narrator voices', percent: 30 },
  { key: 'characters', label: 'generating character voices', percent: 45 },
  { key: 'belle', label: 'generating Belle B intro/outro', percent: 55 },
  { key: 'music', label: 'generating music', percent: 65 },
  { key: 'mixing', label: 'mixing', percent: 78 },
  { key: 'exporting', label: 'exporting', percent: 85 },
  { key: 'importing', label: 'importing ASC output', percent: 92 },
  { key: 'complete', label: 'complete', percent: 100 },
]

function formatElapsed(ms: number) {
  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function formatTimestamp(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function getPhaseStep(job?: ProductionJob | null) {
  const status = (job?.status || '').toLowerCase()
  const phase = (job?.phase || '').toLowerCase()
  const message = (job?.message || job?.error || '').toLowerCase()

  if (status === 'complete' || phase === 'complete' || phase === 'published' || phase === 'ready_for_review') {
    return ASC_PHASE_STEPS[ASC_PHASE_STEPS.length - 1]
  }

  if (status === 'failed' || phase === 'exception') {
    return { key: 'failed', label: 'failed', percent: 100 }
  }

  if (phase === 'importing') return ASC_PHASE_STEPS[8]
  if (phase === 'mix') return ASC_PHASE_STEPS[6]
  if (phase === 'voices') {
    if (message.includes('belle')) return ASC_PHASE_STEPS[4]
    if (message.includes('character')) return ASC_PHASE_STEPS[3]
    if (message.includes('narrator')) return ASC_PHASE_STEPS[2]
    return ASC_PHASE_STEPS[3]
  }
  if (phase === 'packaging' || phase === 'validation') return ASC_PHASE_STEPS[1]
  if (phase === 'queued' || phase === 'starting' || status === 'queued' || status === 'running') return ASC_PHASE_STEPS[0]

  return ASC_PHASE_STEPS[0]
}

function inferPackageJobId(jobs: ProductionJob[]) {
  const firstJobId = jobs.find((packageJob) => packageJob.jobId)?.jobId || ''
  const match = firstJobId.match(/^(ascpkg_\d+)_\d+$/)
  return match?.[1] || ''
}

function getPackageProgress(packageJob: ProductionJob | null, childJobs: ProductionJob[], episodeCount: number) {
  if (episodeCount <= 0) return 0

  const parentStatus = (packageJob?.status || '').toLowerCase()
  const parentPhase = (packageJob?.phase || '').toLowerCase()
  if (parentStatus === 'complete' || parentPhase === 'complete' || parentPhase === 'published') return 100
  if (parentStatus === 'failed' || parentPhase === 'exception') return 100

  const completedCount = childJobs.filter((childJob) => {
    const status = (childJob.status || '').toLowerCase()
    const phase = (childJob.phase || '').toLowerCase()
    return status === 'complete' || phase === 'published' || phase === 'complete'
  }).length
  const currentEpisode = Number(packageJob?.currentEpisode || childJobs.find((childJob) => {
    const status = (childJob.status || '').toLowerCase()
    return status === 'running' || status === 'queued'
  })?.episodeNumber || completedCount + 1)
  const currentJob = childJobs.find((childJob) => childJob.jobId === packageJob?.currentJobId)
    || childJobs.find((childJob) => Number(childJob.episodeNumber) === currentEpisode)
  const currentPercent = currentJob ? getPhaseStep(currentJob).percent : 0
  const progress = ((Math.max(0, currentEpisode - 1) + currentPercent / 100) / episodeCount) * 100

  return Math.max(0, Math.min(100, Math.round(progress)))
}

function estimateRemaining(elapsedMs: number, percent: number) {
  if (percent <= 0 || percent >= 100 || elapsedMs <= 0) return '—'
  const totalEstimateMs = elapsedMs / (percent / 100)
  return formatElapsed(totalEstimateMs - elapsedMs)
}

async function readJsonResponse(res: Response, source: string) {
  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()
  const trimmed = raw.trim()
  const rawPreview = raw.slice(0, 200)

  if (!trimmed) {
    throw Object.assign(new Error(`Empty response from ${source}`), {
      source,
      contentType,
      rawPreview,
    })
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw Object.assign(new Error(`Non-JSON response from ${source}`), {
      source,
      contentType,
      rawPreview,
    })
  }

  try {
    return JSON.parse(trimmed)
  } catch (err: any) {
    throw Object.assign(new Error(`Invalid JSON response from ${source}: ${err?.message || 'parse failed'}`), {
      source,
      contentType,
      rawPreview,
    })
  }
}

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
  const [packageJob, setPackageJob] = useState<ProductionJob | null>(null)
  const [packageJobs, setPackageJobs] = useState<ProductionJob[]>([])
  const [packageStoryOutputs, setPackageStoryOutputs] = useState<Record<string, PackageStoryOutput>>({})
  const [packageImportReport, setPackageImportReport] = useState<PackageImportReport[]>([])
  const [failureInspectionJob, setFailureInspectionJob] = useState<ProductionJob | null>(null)
  const [creditsApproved, setCreditsApproved] = useState(false)
  const [statusNow, setStatusNow] = useState(() => Date.now())
  const [ascParseError, setAscParseError] = useState<{
    source?: string
    contentType?: string
    rawPreview?: string
    message?: string
  } | null>(null)

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
  }) || (() => {
    const status = (packageJob?.status || '').toLowerCase()
    return status === 'queued' || status === 'running'
  })()

  useEffect(() => {
    if ((!hasActivePackageJobs && !hasActiveSingleJob) || working) return

    const timer = window.setInterval(() => {
      refreshProductionStatus({ silent: true })
    }, ASC_PROGRESS_POLL_MS)

    return () => window.clearInterval(timer)
  }, [hasActivePackageJobs, hasActiveSingleJob, working])

  useEffect(() => {
    if (!hasActivePackageJobs && !hasActiveSingleJob) return

    const timer = window.setInterval(() => {
      setStatusNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [hasActivePackageJobs, hasActiveSingleJob])

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
      const parsedPackageJobs = parsed.packageJobs || []
      const parsedPackageJobId = parsed.packageJobId || parsed.packageJob?.packageJobId || inferPackageJobId(parsedPackageJobs)
      setHandoff(parsed)
      setPackageJob(parsed.packageJob || (parsedPackageJobId ? { packageJobId: parsedPackageJobId, status: parsed.status, phase: parsed.phase } : null))
      setPackageJobs(parsedPackageJobs)
      refreshPackageStoryOutputs(parsed.episodes || [])
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
    setPackageJob(null)
    setPackageStoryOutputs({})
    setJob(null)
    setForm({
      audio_url: '',
      cover_url: '',
      description: '',
      duration_mins: '15',
      is_free: false,
    })
  }

  async function refreshPackageStoryOutputs(episodes: AscHandoff['episodes'] = []) {
    const storyIds = Array.from(new Set((episodes || []).map((episode) => episode.storyId).filter(Boolean))) as string[]
    if (!storyIds.length) {
      setPackageStoryOutputs({})
      return
    }

    const { data, error } = await supabase
      .from('stories')
      .select('id,audio_url,story_audio_url,cover_url,status,is_hidden,published_on')
      .in('id', storyIds)

    if (error) {
      console.warn('[ASC] Failed to load package story outputs:', error.message)
      return
    }

    setPackageStoryOutputs(Object.fromEntries((data || []).map((story) => [story.id, story])))
  }

  function recordParseError(err: any, fallback: string) {
    if (err?.rawPreview !== undefined || err?.source) {
      setAscParseError({
        source: err?.source || 'unknown endpoint',
        contentType: err?.contentType || '',
        rawPreview: err?.rawPreview || '',
        message: err?.message || fallback,
      })
    }
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

        const data = await readJsonResponse(res, '/api/admin/run-asc-package-production')
        setAscParseError(null)
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to start package ASC production')
        }

        const jobs = data.jobs || []
        const nextPackageJob = {
          packageJobId: data.packageJobId,
          status: data.status,
          phase: data.phase,
          message: data.message,
          title: data.title,
          updatedAt: new Date().toISOString(),
        }
        const updated = {
          ...handoff,
          packageJobId: data.packageJobId,
          packageJob: nextPackageJob,
          packageJobs: jobs,
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(updated))
        setHandoff(updated)
        setPackageJob(nextPackageJob)
        setPackageJobs(jobs)
        setMessage(`Queued ${jobs.length} package ASC production jobs.`)
      } catch (err: any) {
        recordParseError(err, 'Failed to start package ASC production')
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

      const data = await readJsonResponse(res, '/api/admin/run-asc-production')
      setAscParseError(null)
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
      recordParseError(err, 'Failed to start ASC production')
      setMessage(err?.message || 'Failed to start ASC production')
    } finally {
      setWorking(false)
    }
  }

  async function refreshProductionStatus(options: { silent?: boolean } = {}) {
    if ((handoff?.type === 'series_package' || handoff?.episodes?.length) && packageJobs.length) {
      try {
        setWorking(true)
        let refreshedPackageJob: ProductionJob | null = packageJob
        const parentPackageJobId = packageJob?.packageJobId || handoff?.packageJobId || inferPackageJobId(packageJobs)
        if (parentPackageJobId) {
          const source = `/api/admin/asc-production-status?jobId=${parentPackageJobId}`
          const res = await fetch(`/api/admin/asc-production-status?jobId=${encodeURIComponent(parentPackageJobId)}`)
          try {
            const data = await readJsonResponse(res, source)
            setAscParseError(null)
            if (res.ok && data.success) {
              refreshedPackageJob = data.job || null
            } else {
              refreshedPackageJob = {
                ...refreshedPackageJob,
                packageJobId: parentPackageJobId,
                status: refreshedPackageJob?.status || 'unknown',
                phase: refreshedPackageJob?.phase || 'unknown',
                error: data.error || 'Failed to load package production status',
                updatedAt: new Date().toISOString(),
              }
            }
          } catch (err: any) {
            setAscParseError({
              source: err?.source || source,
              contentType: err?.contentType || '',
              rawPreview: err?.rawPreview || '',
              message: err?.message || 'Failed to parse package production status',
            })
            refreshedPackageJob = {
              ...refreshedPackageJob,
              packageJobId: parentPackageJobId,
              error: err?.message || refreshedPackageJob?.error || 'Failed to parse package production status',
              updatedAt: new Date().toISOString(),
            }
          }
        }

        const refreshedJobs = []

        for (const packageJob of packageJobs) {
          if (!packageJob.jobId) {
            refreshedJobs.push(packageJob)
            continue
          }

          const source = `/api/admin/asc-production-status?jobId=${packageJob.jobId}`
          const res = await fetch(`/api/admin/asc-production-status?jobId=${encodeURIComponent(packageJob.jobId)}`)
          let data
          try {
            data = await readJsonResponse(res, source)
            setAscParseError(null)
          } catch (err: any) {
            setAscParseError({
              source: err?.source || source,
              contentType: err?.contentType || '',
              rawPreview: err?.rawPreview || '',
              message: err?.message || 'Failed to parse ASC production status',
            })
            refreshedJobs.push({
              ...packageJob,
              error: err?.message || packageJob.error || 'Failed to parse ASC production status',
              updatedAt: new Date().toISOString(),
            })
            continue
          }
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
          packageJobId: refreshedPackageJob?.packageJobId || parentPackageJobId || handoff?.packageJobId,
          packageJob: refreshedPackageJob,
          packageJobs: refreshedJobs,
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(updated))
        setHandoff(updated)
        setPackageJob(refreshedPackageJob)
        setPackageJobs(refreshedJobs)
        if (!options.silent) {
          setMessage(`Refreshed ${refreshedJobs.length} package production jobs.`)
        }
      } catch (err: any) {
        recordParseError(err, 'Failed to load package production status')
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
      const source = `/api/admin/asc-production-status?jobId=${handoff.productionJobId}`
      const res = await fetch(`/api/admin/asc-production-status?jobId=${encodeURIComponent(handoff.productionJobId)}`)
      const data = await readJsonResponse(res, source)
      setAscParseError(null)
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load production status')
      }
      setJob(data.job || null)
      if (!options.silent) {
        setMessage(`Production status: ${data.job?.status || 'unknown'}`)
      }
    } catch (err: any) {
      recordParseError(err, 'Failed to load production status')
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

        const missingOutput = packageCompletionRows.find((row) => (
          !row.episode.storyId ||
          !(row.episode.title || row.job?.title) ||
          !row.hasAudioUrl ||
          !row.hasFinalMix
        ))
        if (missingOutput) {
          throw new Error(`Episode ${missingOutput.episode.episodeNumber || missingOutput.job?.episodeNumber || '?'} is missing ASC output`)
        }

        const candidateSource = packageJobs.length > 0 ? 'packageJobs' : 'packageEpisodes'
        const importCandidates = packageJobs.length > 0
          ? packageJobs.map((packageJob) => ({
              packageJob,
              row: packageCompletionRows.find((candidate) => candidate.job?.jobId === packageJob.jobId || candidate.episode.storyId === packageJob.storyId),
            }))
          : packageCompletionRows.map((row) => ({
              packageJob: {
                storyId: row.episode.storyId,
                title: row.episode.title,
                queueId: '',
                episodeNumber: row.episode.episodeNumber,
                audioUrl: row.episode.audioUrl || row.dbAudioUrl,
                finalMix: row.episode.finalMix || row.dbAudioUrl,
                coverUrl: row.episode.coverUrl || row.dbCoverUrl,
              } as ProductionJob,
              row,
            }))

        const importedJobs = []
        const nextReport: PackageImportReport[] = importCandidates.map(({ packageJob, row }) => ({
          storyId: packageJob.storyId || row?.episode.storyId || '',
          episodeNumber: packageJob.episodeNumber || row?.episode.episodeNumber,
          title: packageJob.title || row?.episode.title || `Episode ${packageJob.episodeNumber || row?.episode.episodeNumber || '?'}`,
          completeStatus: 'pending',
          publishStatus: 'pending',
          verified: false,
        }))
        setPackageImportReport(nextReport)

        const updateImportReport = (storyId: string, updates: Partial<PackageImportReport>) => {
          const next = nextReport.map((entry) => (
            entry.storyId === storyId ? { ...entry, ...updates } : entry
          ))
          nextReport.splice(0, nextReport.length, ...next)
          setPackageImportReport([...nextReport])
        }

        for (const { packageJob, row } of importCandidates) {
          const storyId = packageJob.storyId || row?.episode.storyId || ''
          const episodeNumber = packageJob.episodeNumber || row?.episode.episodeNumber
          const episodeTitle = packageJob.title || row?.episode.title || `Episode ${episodeNumber || '?'}`

          if (
            !storyId ||
            !episodeTitle ||
            !(packageJob.audioUrl || row?.episode.audioUrl || row?.dbAudioUrl) ||
            !(packageJob.finalMix || row?.episode.finalMix || row?.dbAudioUrl)
          ) {
            const error = `Episode ${episodeNumber || '?'} "${episodeTitle}" is not ready to import`
            updateImportReport(storyId, { completeStatus: 'failed', publishStatus: 'skipped', route: 'preflight', error })
            throw new Error(error)
          }

          setMessage(`Completing package for Episode ${episodeNumber || '?'}: ${episodeTitle}...`)
          const completeRes = await fetch('/api/admin/complete-story-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId }),
          })
          const completeData = await readJsonResponse(completeRes, '/api/admin/complete-story-package')
          setAscParseError(null)
          if (!completeRes.ok || !completeData.success) {
            const error = completeData.blockingReason || completeData.error || `Package completion failed`
            updateImportReport(storyId, {
              completeStatus: 'failed',
              publishStatus: 'skipped',
              route: '/api/admin/complete-story-package',
              error,
            })
            throw new Error(`Episode ${episodeNumber || '?'} "${episodeTitle}" complete-story-package failed: ${error}`)
          }
          updateImportReport(storyId, { completeStatus: 'success' })

          const completedStory = completeData.story || {}
          setMessage(`Publishing Episode ${episodeNumber || '?'}: ${episodeTitle}...`)
          const publishRes = await fetch('/api/admin/publish-story', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storyId,
              queueId: packageJob.queueId || '',
              title: episodeTitle,
              author: completedStory.author || '',
              genre: completedStory.genre || '',
              audio_url: packageJob.audioUrl || row?.episode.audioUrl || row?.dbAudioUrl || '',
              cover_url: completedStory.cover_url || row?.episode.coverUrl || row?.dbCoverUrl || '',
              description: completedStory.description || '',
              duration_mins: completedStory.duration_mins || '',
              is_free: false,
            }),
          })
          const publishData = await readJsonResponse(publishRes, '/api/admin/publish-story')
          setAscParseError(null)
          if (!publishRes.ok || !publishData.success) {
            const error = publishData.error || `Publish failed`
            updateImportReport(storyId, {
              publishStatus: 'failed',
              route: '/api/admin/publish-story',
              error,
            })
            throw new Error(`Episode ${episodeNumber || '?'} "${episodeTitle}" publish-story failed: ${error}`)
          }
          updateImportReport(storyId, { publishStatus: 'success' })

          const { data: verifiedStory, error: verifyError } = await supabase
            .from('stories')
            .select('id,status,is_hidden,published_on,cover_url')
            .eq('id', storyId)
            .single()

          if (verifyError || !verifiedStory) {
            const error = verifyError?.message || 'Story row not found after publish'
            updateImportReport(storyId, {
              verified: false,
              route: 'stories verification',
              error,
            })
            throw new Error(`Episode ${episodeNumber || '?'} "${episodeTitle}" publish verification failed: ${error}`)
          }

          const dbState = {
            status: verifiedStory.status,
            is_hidden: verifiedStory.is_hidden,
            published_on: verifiedStory.published_on,
            cover_url: verifiedStory.cover_url,
          }
          const verified = verifiedStory.status === 'published'
            && verifiedStory.is_hidden === false
            && Boolean(verifiedStory.published_on)
            && Boolean(verifiedStory.cover_url)

          updateImportReport(storyId, { verified, dbState })

          if (!verified) {
            throw new Error(
              `Episode ${episodeNumber || '?'} "${episodeTitle}" publish verification failed: ` +
              `status=${verifiedStory.status || 'empty'}, ` +
              `is_hidden=${String(verifiedStory.is_hidden)}, ` +
              `published_on=${verifiedStory.published_on ? 'yes' : 'no'}, ` +
              `cover_url=${verifiedStory.cover_url ? 'yes' : 'no'}`
            )
          }

          importedJobs.push({
            ...packageJob,
            audioUrl: packageJob.audioUrl || row?.episode.audioUrl || row?.dbAudioUrl,
            finalMix: packageJob.finalMix || row?.episode.finalMix || row?.dbAudioUrl,
            coverUrl: publishData.story?.cover_url || completedStory.cover_url || packageJob.coverUrl || row?.episode.coverUrl || row?.dbCoverUrl || '',
            imported: true,
            importedAt: new Date().toISOString(),
            publishedStory: publishData.story,
          })
        }

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
        setMessage(`Imported ${importedJobs.length} package episode outputs from ${candidateSource}. Production workspace cleared for the next story.`)
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

      const data = await readJsonResponse(res, '/api/admin/import-asc-output')
      setAscParseError(null)
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
      recordParseError(err, 'Import failed')
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

      const data = await readJsonResponse(res, '/api/admin/complete-story-package')
      setAscParseError(null)
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
      recordParseError(err, 'Package completion failed')
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

      const data = await readJsonResponse(res, '/api/admin/publish-story')
      setAscParseError(null)
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
      recordParseError(err, 'Publish failed')
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
    const storyOutput = episode.storyId ? packageStoryOutputs[episode.storyId] : null
    return {
      episode,
      job: episodeJob,
      imported: Boolean(episode.imported || episodeJob?.imported),
      publishedComplete: Boolean((episodeJob?.status === 'complete' && episodeJob?.phase === 'published') || (storyOutput?.status === 'published' && storyOutput?.is_hidden === false)),
      hasAudioUrl: Boolean(episode.audioUrl || episodeJob?.audioUrl || storyOutput?.audio_url),
      hasFinalMix: Boolean(episode.finalMix || episodeJob?.finalMix || storyOutput?.audio_url),
      dbAudioUrl: storyOutput?.audio_url || '',
      dbStoryAudioUrl: storyOutput?.story_audio_url || '',
      dbCoverUrl: storyOutput?.cover_url || '',
    }
  })
  const packageAllImported = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.imported)
  const packageAllPublished = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.publishedComplete)
  const packageAllAudioReady = packageCompletionRows.length > 0 && packageCompletionRows.every((row) => row.hasAudioUrl && row.hasFinalMix)
  const packageMissingOutputCount = packageCompletionRows.filter((row) => !row.hasAudioUrl || !row.hasFinalMix).length
  const packageImportCandidateSource = packageJobs.length > 0 ? 'packageJobs' : 'packageEpisodes'
  const packageImportCandidateCount = packageJobs.length > 0 ? packageJobs.length : packageCompletionRows.length
  const canImportPackageOutput = isPackageHandoff && packageAllAudioReady && !packageAllImported && !working
  const inspectedFailure = failureInspectionJob ? classifyFailure(failureInspectionJob) : null
  const activePackageJob = packageJobs.find((packageJob) => {
    const status = (packageJob.status || '').toLowerCase()
    return status === 'running' || status === 'queued'
  }) || packageJobs.find((packageJob) => {
    const status = (packageJob.status || '').toLowerCase()
    return status !== 'complete' && status !== 'failed'
  }) || packageJobs[packageJobs.length - 1]
  const packageEpisodeCount = packageEpisodes.length || packageJobs.length || Number(handoff?.episodeCount || 0)
  const packageOverallProgress = isPackageHandoff ? getPackageProgress(packageJob, packageJobs, packageEpisodeCount) : 0
  const currentPackageChildJob = packageJob?.currentJobId
    ? packageJobs.find((candidate) => candidate.jobId === packageJob.currentJobId)
    : activePackageJob
  const statusJob = isPackageHandoff ? (packageJob || activePackageJob) : job
  const statusPhase = getPhaseStep(statusJob)
  const statusStartTime = statusJob?.createdAt || handoff?.updatedAt || statusJob?.updatedAt
  const statusStartMs = statusStartTime ? new Date(statusStartTime).getTime() : 0
  const elapsedMs = statusStartMs && !Number.isNaN(statusStartMs) ? statusNow - statusStartMs : 0
  const statusPercent = isPackageHandoff ? packageOverallProgress : statusPhase.percent
  const isStatusRunning = hasActivePackageJobs || hasActiveSingleJob
  const statusStepMessage = isPackageHandoff
    ? currentPackageChildJob?.message || packageJob?.message || packageJob?.error || (isStatusRunning ? 'Waiting for package ASC worker update...' : 'No active package production job.')
    : statusJob?.message || statusJob?.error || (isStatusRunning ? 'Waiting for ASC worker update...' : 'No active production job.')
  const progressBarClass = statusJob?.status === 'failed' || statusJob?.phase === 'exception'
    ? 'bg-red-600'
    : statusPercent >= 100
      ? 'bg-green-600'
      : 'bg-blue-600'

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
        {ascParseError ? (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <div className="font-semibold">ASC status response could not be parsed.</div>
            <div className="mt-1">
              Production polling will keep trying without interrupting the running worker.
            </div>
            <div className="mt-2 grid gap-1 text-xs">
              <div><strong>Endpoint:</strong> {ascParseError.source || '—'}</div>
              <div><strong>Content-Type:</strong> {ascParseError.contentType || '—'}</div>
              <div><strong>Error:</strong> {ascParseError.message || '—'}</div>
            </div>
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-red-950">
              {ascParseError.rawPreview || '(empty response)'}
            </pre>
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

          {isPackageHandoff && (packageJob || handoff?.packageJobId || packageJobs.length) ? (
            <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 space-y-2">
              <div className="font-semibold">Package ASC Progress</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><strong>Package job:</strong> {packageJob?.packageJobId || handoff?.packageJobId || inferPackageJobId(packageJobs) || '—'}</div>
                <div><strong>Status:</strong> {packageJob?.status || '—'}</div>
                <div><strong>Phase:</strong> {packageJob?.phase || '—'}</div>
                <div><strong>Current episode:</strong> {packageJob?.currentEpisode || currentPackageChildJob?.episodeNumber || '—'} of {packageEpisodeCount || '—'}</div>
                <div><strong>Current child job:</strong> {packageJob?.currentJobId || currentPackageChildJob?.jobId || '—'}</div>
                <div><strong>Updated:</strong> {formatTimestamp(packageJob?.updatedAt || handoff?.updatedAt)}</div>
              </div>
              <div><strong>Current message:</strong> {currentPackageChildJob?.message || packageJob?.message || packageJob?.error || 'Waiting for package worker update...'}</div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-blue-800">
                  <span>Overall package progress</span>
                  <span>{packageOverallProgress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${packageJob?.status === 'failed' || packageJob?.phase === 'exception' ? 'bg-red-600' : packageOverallProgress >= 100 ? 'bg-green-600' : 'bg-blue-600'}`}
                    style={{ width: `${packageOverallProgress}%` }}
                  />
                </div>
              </div>
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
                    <div><strong>Message:</strong> {packageJob.message || packageJob.error || '—'}</div>
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

          <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-base">ASC Production Status</div>
                <div className="mt-1 text-xs text-blue-800">
                  Polling every {ASC_PROGRESS_POLL_MS / 1000}s while production is active.
                </div>
              </div>
              {isStatusRunning ? (
                <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-label="Production running" />
              ) : (
                <div className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-blue-800">
                  idle
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current phase</div>
                <div className="mt-1 font-semibold">{statusPhase.label}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current step</div>
                <div className="mt-1">{statusStepMessage}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Elapsed</div>
                <div className="mt-1 font-mono">{isStatusRunning || statusStartTime ? formatElapsed(elapsedMs) : '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Estimated remaining</div>
                <div className="mt-1 font-mono">{isStatusRunning ? estimateRemaining(elapsedMs, statusPercent) : '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Last update</div>
                <div className="mt-1">{formatTimestamp(statusJob?.updatedAt || handoff?.updatedAt)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Job</div>
                <div className="mt-1 break-all font-mono text-xs">{statusJob?.jobId || statusJob?.packageJobId || handoff?.productionJobId || handoff?.packageJobId || '—'}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-blue-800">
                <span>Estimated progress</span>
                <span>{statusPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressBarClass}`}
                  style={{ width: `${statusPercent}%` }}
                />
              </div>
            </div>
          </div>

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
                    <div>DB audio URL present: {row.dbAudioUrl ? 'yes' : 'no'}</div>
                    <div>DB cover present: {row.dbCoverUrl ? 'yes' : 'no'}</div>
                  </div>
                </div>
              )) : (
                <div className="text-gray-600">No package episodes are loaded.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={importAscOutput}
                disabled={!canImportPackageOutput}
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
            <div className="rounded border border-dashed border-gray-400 p-3 text-xs text-gray-700">
              <div>Import debug</div>
              <div>outputsReady: {packageAllAudioReady ? 'yes' : 'no'}</div>
              <div>imported: {packageAllImported ? 'yes' : 'no'}</div>
              <div>missingEpisodes count: {packageMissingOutputCount}</div>
              <div>candidateSource: {packageImportCandidateSource}</div>
              <div>candidateCount: {packageImportCandidateCount}</div>
            </div>

            {packageImportReport.length > 0 && (
              <div className="rounded border border-black bg-gray-50 p-3 text-sm space-y-3">
                <div className="font-semibold">Package Import Report</div>
                {packageImportReport.map((entry) => (
                  <div key={entry.storyId || `${entry.episodeNumber}-${entry.title}`} className="rounded border border-gray-300 bg-white p-3">
                    <div className="font-semibold">
                      Episode {entry.episodeNumber || '—'}: {entry.title}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2 text-xs text-gray-700">
                      <div>complete-story-package: {entry.completeStatus}</div>
                      <div>publish-story: {entry.publishStatus}</div>
                      <div>DB verified: {entry.verified ? 'yes' : 'no'}</div>
                      <div>storyId: {entry.storyId || '—'}</div>
                    </div>
                    {entry.dbState && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2 text-xs text-gray-700">
                        <div>status: {entry.dbState.status || '—'}</div>
                        <div>is_hidden: {String(entry.dbState.is_hidden)}</div>
                        <div>published_on: {entry.dbState.published_on ? 'yes' : 'no'}</div>
                        <div>cover_url: {entry.dbState.cover_url ? 'yes' : 'no'}</div>
                      </div>
                    )}
                    {entry.error && (
                      <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                        <div className="font-semibold">{entry.route || 'error'}</div>
                        <div>{entry.error}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600">
              Package import completes and publishes each episode one at a time, then verifies the final database row before marking the package complete.
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
