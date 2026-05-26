#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv(envPath) {
  const file = envPath || '.env.local'
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

function parseArgs(argv) {
  const args = {
    jobId: null,
    envPath: '.env.production.local',
    baseUrl: 'https://app.endless-tales.com',
    applyStateFix: false,
    runNext: false,
    maxSteps: 12,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      i += 1
      return argv[i]
    }
    if (arg === '--job-id' || arg.startsWith('--job-id=')) args.jobId = readValue()
    else if (arg === '--env-path' || arg.startsWith('--env-path=')) args.envPath = readValue()
    else if (arg === '--base-url' || arg.startsWith('--base-url=')) args.baseUrl = readValue().replace(/\/+$/, '')
    else if (arg === '--max-steps' || arg.startsWith('--max-steps=')) args.maxSteps = Number(readValue())
    else if (arg === '--apply-state-fix') args.applyStateFix = true
    else if (arg === '--run-next') args.runNext = true
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/resume-series-segment-job.js --job-id <id-or-prefix> [options]',
        '',
        'Options:',
        '  --env-path <file>       Env file with Supabase service role (default: .env.production.local)',
        '  --base-url <url>        App URL for run-next (default: https://app.endless-tales.com)',
        '  --apply-state-fix       Repair only the current episode progress map when proven stale',
        '  --run-next              Resume controlled run-next calls after state validation',
        '  --max-steps <number>    Max run-next calls when --run-next is set (default: 12)',
      ].join('\n'))
      process.exit(0)
    }
  }
  if (!args.jobId) throw new Error('--job-id is required')
  if (!Number.isFinite(args.maxSteps) || args.maxSteps < 1) throw new Error('--max-steps must be positive')
  return args
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function storyEpisodeNumber(story, fallback) {
  const value = Number(story.episode_number || story.series_episode_number || story.series_number || fallback)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function parseScriptSegments(script) {
  const lines = []
  const speakers = new Set()
  const combinedSpeakerLabels = []
  const rawLines = String(script || '').split(/\r?\n/)
  rawLines.forEach((raw, index) => {
    const text = raw.trim()
    if (!text) return
    const match = text.match(/^([A-Z][A-Z0-9 .'\-]+):\s*(.+)$/)
    if (match) {
      const speaker = match[1].trim()
      speakers.add(speaker)
      if (/\bLILA\s+AND\s+OWEN\b/i.test(speaker)) combinedSpeakerLabels.push({ index, speaker, text })
      lines.push({ index, type: 'character', speaker, text: match[2].trim() })
      return
    }
    if (/^\[(beat|pause|silence|music|sting)\b/i.test(text)) {
      lines.push({ index, type: /beat|pause|silence/i.test(text) ? 'beat' : 'non-story', speaker: null, text })
      return
    }
    if (!/^(title|author|episode|characters?|cast|notes?)\b/i.test(text)) {
      lines.push({ index, type: 'narrator', speaker: 'NARRATOR', text })
    }
  })
  const targetable = lines.filter(line => line.type === 'narrator' || line.type === 'character' || line.type === 'beat' || line.type === 'pause')
  return {
    lineCount: lines.length,
    targetable,
    targetableNumbers: targetable.map(line => line.index).sort((a, b) => a - b),
    speakers: Array.from(speakers).sort((a, b) => a.localeCompare(b)),
    combinedSpeakerLabels,
  }
}

async function fetchJob(supabase, jobIdOrPrefix) {
  let query = supabase.from('production_jobs').select('*')
  query = /^[0-9a-f-]{36}$/i.test(jobIdOrPrefix)
    ? query.eq('id', jobIdOrPrefix)
    : query.ilike('id', `${jobIdOrPrefix}%`)
  const { data, error } = await query.limit(2)
  if (error) throw new Error(`Failed to fetch production job: ${error.message}`)
  if (!data?.length) throw new Error(`No production job found for ${jobIdOrPrefix}`)
  if (data.length > 1) throw new Error(`Job prefix ${jobIdOrPrefix} matched multiple jobs`)
  return data[0]
}

async function listAudio(supabase, storyId) {
  const { data, error } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 1000 })
  if (error) throw new Error(`Failed to list audio for ${storyId}: ${error.message}`)
  const files = data || []
  return {
    files: files.map(file => file.name).sort(),
    segments: files.filter(file => /^segment_\d{4}\.mp3$/.test(file.name)).map(file => file.name).sort(),
    finalMix: files.some(file => file.name === 'final_mix.mp3'),
  }
}

async function loadEpisodes(supabase, seriesId) {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('series_id', seriesId)
  if (error) throw new Error(`Failed to load series episodes: ${error.message}`)
  return (data || [])
    .map((story, index) => ({ ...story, _episodeNumber: storyEpisodeNumber(story, index + 1) }))
    .sort((a, b) => a._episodeNumber - b._episodeNumber)
}

function expectedNames(numbers) {
  return numbers.map(number => `segment_${String(number).padStart(4, '0')}.mp3`)
}

function firstMissingNumber(numbers, presentNames) {
  const present = new Set(presentNames)
  return numbers.find(number => !present.has(`segment_${String(number).padStart(4, '0')}.mp3`)) ?? null
}

async function repairEpisodeProgress({ supabase, job, episode, episodeParse, audio }) {
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const seriesVoiceGeneration = state.seriesVoiceGeneration && typeof state.seriesVoiceGeneration === 'object'
    ? state.seriesVoiceGeneration
    : {}
  const progressByEpisode = seriesVoiceGeneration.progressByEpisode && typeof seriesVoiceGeneration.progressByEpisode === 'object'
    ? { ...seriesVoiceGeneration.progressByEpisode }
    : {}
  const episodeKey = String(episode._episodeNumber)
  const expected = expectedNames(episodeParse.targetableNumbers)
  const missingSegments = expected.filter(name => !audio.segments.includes(name))
  const nextSegmentNumber = firstMissingNumber(episodeParse.targetableNumbers, audio.segments)
  if (nextSegmentNumber === null) throw new Error(`Episode ${episodeKey} has no missing parsed segments to repair`)

  progressByEpisode[episodeKey] = {
    ...(progressByEpisode[episodeKey] || {}),
    storyId: episode.id,
    title: episode.title || null,
    episodeNumber: episode._episodeNumber,
    expectedSegmentCount: expected.length,
    nextSegmentNumber,
    presentCount: audio.segments.length,
    missingSegments,
    failures: [],
    lastSegmentNumber: null,
    lastUpdatedAt: new Date().toISOString(),
    skippedNonSegmentStreak: 0,
    staleSegmentRecognitionFailure: false,
    complete: false,
    stateRepair: {
      repairedAt: new Date().toISOString(),
      reason: 'Reset stale episode-local segment pointer after repeated no-progress non-story skips.',
    },
  }

  const nextState = {
    ...state,
    seriesId: job.series_id || state.seriesId,
    seriesVoiceGeneration: {
      ...seriesVoiceGeneration,
      currentEpisodeNumber: episode._episodeNumber,
      progressByEpisode,
      nextSegmentNumber,
      missingSegments,
      lastEpisodeNumber: episode._episodeNumber,
      lastStoryId: episode.id,
      lastUpdatedAt: new Date().toISOString(),
    },
  }

  const { data, error } = await supabase
    .from('production_jobs')
    .update({
      status: 'running',
      current_step: 'series_generate_voices',
      state_json: nextState,
      error_json: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', job.id)
    .select('id,status,current_step,state_json')
    .single()
  if (error) throw new Error(`Failed to repair episode progress: ${error.message}`)
  return data
}

async function callRunNext(baseUrl, jobId) {
  const response = await fetch(`${baseUrl}/api/admin/production-jobs/run-next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId }),
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { success: false, error: 'Non-JSON run-next response', bodySnippet: text.slice(0, 500) }
  }
  return { status: response.status, ok: response.ok && payload?.success !== false, payload }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadEnv(args.envPath)
  const supabase = createSupabase()
  const job = await fetchJob(supabase, args.jobId)
  if (!job.series_id) throw new Error(`Job ${job.id} is not a series job`)

  const episodes = await loadEpisodes(supabase, job.series_id)
  const state = job.state_json && typeof job.state_json === 'object' ? job.state_json : {}
  const progressByEpisode = state.seriesVoiceGeneration?.progressByEpisode || {}
  const episodeReports = []
  for (const episode of episodes) {
    const script = episode.script || episode.prose_text || episode.content || ''
    const parsed = parseScriptSegments(script)
    const audio = await listAudio(supabase, episode.id)
    const expected = expectedNames(parsed.targetableNumbers)
    episodeReports.push({
      episode,
      parsed,
      audio,
      expected,
      progress: progressByEpisode[String(episode._episodeNumber)] || null,
    })
  }

  const ep2 = episodeReports.find(report => report.episode._episodeNumber === 2)
  if (!ep2) throw new Error('Episode 2 was not found')
  const ep2Progress = ep2.progress || {}
  const ep2FirstMissing = firstMissingNumber(ep2.parsed.targetableNumbers, ep2.audio.segments)
  const ep2Next = Number(ep2Progress.nextSegmentNumber)
  const ep2RangeMax = ep2.parsed.targetableNumbers[ep2.parsed.targetableNumbers.length - 1] ?? null
  const ep2StateLooksStale = ep2.audio.segments.length === 0
    && Number.isFinite(ep2Next)
    && ep2RangeMax !== null
    && ep2Next > ep2RangeMax

  const report = {
    job: {
      id: job.id,
      status: job.status,
      current_step: job.current_step,
      series_id: job.series_id,
      locked_at: job.locked_at || null,
      locked_by: job.locked_by || null,
      error_json: job.error_json || null,
    },
    episodes: episodeReports.map(({ episode, parsed, audio, progress }) => ({
      episodeNumber: episode._episodeNumber,
      storyId: episode.id,
      title: episode.title || null,
      audioSegments: audio.segments.length,
      finalMix: audio.finalMix,
      targetableSegmentCount: parsed.targetableNumbers.length,
      firstTargetableSegmentNumber: parsed.targetableNumbers[0] ?? null,
      lastTargetableSegmentNumber: parsed.targetableNumbers[parsed.targetableNumbers.length - 1] ?? null,
      speakers: parsed.speakers,
      combinedSpeakerLabels: parsed.combinedSpeakerLabels,
      progress: progress ? {
        expectedSegmentCount: progress.expectedSegmentCount ?? null,
        nextSegmentNumber: progress.nextSegmentNumber ?? null,
        presentCount: progress.presentCount ?? null,
        complete: progress.complete ?? null,
        skippedNonSegmentCount: progress.skippedNonSegmentCount ?? null,
        skippedNonSegmentStreak: progress.skippedNonSegmentStreak ?? null,
      } : null,
    })),
    ep2Validation: {
      validParsedSegments: ep2.parsed.targetableNumbers.length > 0,
      lilaRecognizedInScript: ep2.parsed.speakers.includes('LILA'),
      owenRecognizedInScript: ep2.parsed.speakers.includes('OWEN'),
      combinedSpeakerLabelsRemaining: ep2.parsed.combinedSpeakerLabels,
      firstMissingSegmentNumber: ep2FirstMissing,
      stateLooksStale: ep2StateLooksStale,
      nextSegmentNumber: Number.isFinite(ep2Next) ? ep2Next : null,
      lastTargetableSegmentNumber: ep2RangeMax,
    },
    actions: [],
  }

  if (args.applyStateFix) {
    if (!ep2.parsed.targetableNumbers.length) throw new Error('Refusing state fix: Ep2 has no parsed targetable segments')
    if (ep2.parsed.combinedSpeakerLabels.length) throw new Error('Refusing state fix: Ep2 still contains combined speaker labels')
    if (ep2FirstMissing === null) throw new Error('Refusing state fix: Ep2 has no missing parsed segments')
    if (!ep2StateLooksStale && ep2.audio.segments.length > 0) {
      throw new Error('Refusing state fix: Ep2 state is not an obvious zero-audio stale pointer case')
    }
    const repaired = await repairEpisodeProgress({ supabase, job, episode: ep2.episode, episodeParse: ep2.parsed, audio: ep2.audio })
    report.actions.push({
      type: 'state_fix',
      status: repaired.status,
      current_step: repaired.current_step,
      ep2NextSegmentNumber: repaired.state_json?.seriesVoiceGeneration?.progressByEpisode?.['2']?.nextSegmentNumber ?? null,
    })
  }

  if (args.runNext) {
    if (!args.applyStateFix && ep2StateLooksStale) {
      throw new Error('Refusing run-next: Ep2 state looks stale. Re-run with --apply-state-fix first.')
    }
    for (let i = 0; i < args.maxSteps; i += 1) {
      const result = await callRunNext(args.baseUrl, job.id)
      report.actions.push({ type: 'run_next', step: i + 1, status: result.status, ok: result.ok, payload: result.payload })
      const text = JSON.stringify(result.payload || {})
      if (/No parsed script line found/i.test(text)) break
      if (!result.ok || result.payload?.complete || result.payload?.episodeComplete) break
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exit(1)
})
