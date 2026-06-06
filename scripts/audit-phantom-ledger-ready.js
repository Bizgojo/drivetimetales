#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const https = require('https')
const path = require('path')

require('dotenv').config({ path: '.env.local' })

const DEFAULT_JOB_ID = 'a880ab98-52a7-49ae-b52f-4a1b83a90926'
const DEFAULT_EXPECTED_EPISODES = 3

function parseArgs(argv) {
  const args = {
    jobId: process.env.JOB_ID || DEFAULT_JOB_ID,
    seriesId: process.env.SERIES_ID || '',
    expectedEpisodes: Number(process.env.EXPECTED_EPISODES || DEFAULT_EXPECTED_EPISODES),
    checkAssets: process.env.CHECK_ASSETS !== 'false',
    output: process.env.AUDIT_OUTPUT || '',
    transport: process.env.AUDIT_TRANSPORT || 'supabase',
    selfTest: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      index += 1
      return argv[index]
    }

    if (arg === '--job-id' || arg.startsWith('--job-id=')) args.jobId = readValue()
    else if (arg === '--series-id' || arg.startsWith('--series-id=')) args.seriesId = readValue()
    else if (arg === '--expected-episodes' || arg.startsWith('--expected-episodes=')) args.expectedEpisodes = Number(readValue())
    else if (arg === '--output' || arg.startsWith('--output=')) args.output = readValue()
    else if (arg === '--transport' || arg.startsWith('--transport=')) args.transport = readValue()
    else if (arg === '--no-asset-head') args.checkAssets = false
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/audit-phantom-ledger-ready.js [options]',
        '',
        'Options:',
        '  --job-id <uuid>             Production job ID',
        '  --series-id <uuid>          Optional explicit series ID',
        '  --expected-episodes <n>     Expected episode count (default: 3)',
        '  --output <path>             Also write JSON report to this path',
        '  --transport <name>           Data transport: supabase or rest (default: supabase)',
        '  --no-asset-head             Do not HEAD-check final mix URLs',
        '  --self-test                 Run local readiness-gate checks without Supabase',
      ].join('\n'))
      process.exit(0)
    }
  }

  if (!args.jobId) throw new Error('jobId is required')
  if (!Number.isFinite(args.expectedEpisodes) || args.expectedEpisodes <= 0) {
    throw new Error('--expected-episodes must be a positive number')
  }
  if (!['supabase', 'rest'].includes(args.transport)) {
    throw new Error('--transport must be either "supabase" or "rest"')
  }
  return args
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function serviceEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return { url: url.replace(/\/+$/, ''), serviceRole }
}

function restGetJson(pathname, params = {}) {
  const { url, serviceRole } = serviceEnv()
  const requestUrl = new URL(pathname, `${url}/`)
  for (const [key, value] of Object.entries(params)) {
    requestUrl.searchParams.set(key, value)
  }

  return new Promise((resolve, reject) => {
    const request = https.request(requestUrl, {
      method: 'GET',
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        accept: 'application/json',
      },
      timeout: 10000,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try {
          parsed = body ? JSON.parse(body) : null
        } catch {
          return reject(new Error(`Supabase REST returned non-JSON response (${response.statusCode}): ${body.slice(0, 200)}`))
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = parsed?.message || parsed?.error || body || `HTTP ${response.statusCode}`
          return reject(new Error(`Supabase REST request failed (${response.statusCode}): ${message}`))
        }
        resolve(parsed)
      })
    })
    request.on('timeout', () => request.destroy(new Error('Supabase REST request timed out')))
    request.on('error', reject)
    request.end()
  })
}

const JOB_SELECT = 'id,status,current_step,series_id,story_id,completed_at,state_json,error_json,updated_at'
const STORY_SELECT = 'id,title,author,genre,description,duration_mins,created_at,status,is_hidden,published_on,review_status,workflow_state,audio_url,story_audio_url,intro_audio_url,intro_before_url,intro_after_url,outro_audio_url,background_music_url,cover_url,prose_text,author_id,narrator_voice_id,narrator_voice_name,series_id,series_name,episode_number,series_number,series_total,series_total_episodes'

async function loadProductionDataViaSupabase(args) {
  const supabase = createSupabase()

  const { data: job, error: jobError } = await supabase
    .from('production_jobs')
    .select(JOB_SELECT)
    .eq('id', args.jobId)
    .single()

  if (jobError || !job) throw new Error(jobError?.message || `Production job not found: ${args.jobId}`)

  const seriesId = clean(args.seriesId || job.series_id || job.state_json?.seriesId)
  if (!seriesId) throw new Error(`Could not resolve series_id for job ${args.jobId}`)

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select(STORY_SELECT)
    .eq('series_id', seriesId)

  if (storiesError) throw new Error(storiesError.message)
  return { job, seriesId, stories: stories || [] }
}

async function loadProductionDataViaRest(args) {
  const jobs = await restGetJson('/rest/v1/production_jobs', {
    select: JOB_SELECT,
    id: `eq.${args.jobId}`,
    limit: '1',
  })
  const job = Array.isArray(jobs) ? jobs[0] : jobs
  if (!job) throw new Error(`Production job not found: ${args.jobId}`)

  const seriesId = clean(args.seriesId || job.series_id || job.state_json?.seriesId)
  if (!seriesId) throw new Error(`Could not resolve series_id for job ${args.jobId}`)

  const stories = await restGetJson('/rest/v1/stories', {
    select: STORY_SELECT,
    series_id: `eq.${seriesId}`,
  })
  return { job, seriesId, stories: Array.isArray(stories) ? stories : [] }
}

async function loadProductionData(args) {
  if (args.transport === 'rest') return loadProductionDataViaRest(args)
  return loadProductionDataViaSupabase(args)
}

function clean(value) {
  return String(value || '').trim()
}

function episodeNumber(story) {
  const value = Number(story.episode_number || story.series_number || 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

async function remoteAssetExists(url) {
  if (!url) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function missingEpisodeFields(story, finalMixExists) {
  const missing = []
  if (!clean(story.title)) missing.push('title')
  if (!clean(story.author)) missing.push('author')
  if (!clean(story.genre)) missing.push('genre')
  if (!clean(story.description)) missing.push('description')
  if (!Number(story.duration_mins || 0)) missing.push('duration_mins')
  if (!clean(story.created_at)) missing.push('created_at')
  if (story.status !== 'audio_ready') missing.push('status=audio_ready')
  if (story.is_hidden !== true) missing.push('is_hidden=true')
  if (story.published_on !== null) missing.push('published_on=null')
  if (clean(story.review_status || 'pending') !== 'pending') missing.push('review_status=pending')
  if (clean(story.workflow_state) && clean(story.workflow_state) !== 'ready_for_review') missing.push('workflow_state=ready_for_review')
  if (!clean(story.audio_url).includes('/final_mix.mp3')) missing.push('audio_url=/final_mix.mp3')
  if (finalMixExists === false) missing.push('final_mix_asset_exists')
  if (!clean(story.story_audio_url)) missing.push('story_audio_url')
  if (!clean(story.intro_audio_url) && !clean(story.intro_before_url) && !clean(story.intro_after_url)) missing.push('intro_audio')
  if (!clean(story.outro_audio_url)) missing.push('outro_audio_url')
  if (!clean(story.cover_url)) missing.push('cover_url')
  if (!clean(story.prose_text)) missing.push('prose_text')
  if (!clean(story.author_id)) missing.push('author_id')
  if (!clean(story.narrator_voice_id)) missing.push('narrator_voice_id')
  if (!clean(story.narrator_voice_name)) missing.push('narrator_voice_name')
  return missing
}

function completeEpisode(overrides = {}) {
  return {
    id: 'story-1',
    title: 'The Phantom Ledger',
    author: 'Evelyn Cross',
    genre: 'mystery',
    description: 'A complete episode package.',
    duration_mins: 31,
    created_at: '2026-05-25T12:00:00.000Z',
    status: 'audio_ready',
    is_hidden: true,
    published_on: null,
    review_status: 'pending',
    workflow_state: 'ready_for_review',
    audio_url: 'https://example.test/series/episode-1/final_mix.mp3',
    story_audio_url: 'https://example.test/series/episode-1/story.mp3',
    intro_audio_url: 'https://example.test/series/episode-1/intro.mp3',
    intro_before_url: null,
    intro_after_url: null,
    outro_audio_url: 'https://example.test/series/episode-1/outro.mp3',
    cover_url: 'https://example.test/series/episode-1/cover.jpg',
    prose_text: 'Chapter text',
    author_id: 'author-1',
    narrator_voice_id: 'voice-1',
    narrator_voice_name: 'Belle B',
    episode_number: 1,
    ...overrides,
  }
}

function runSelfTest() {
  const cases = [
    {
      name: 'complete package is approval ready',
      story: completeEpisode(),
      finalMixExists: true,
      missing: [],
    },
    {
      name: 'published episode is rejected',
      story: completeEpisode({ published_on: '2026-05-25T12:00:00.000Z' }),
      finalMixExists: true,
      missing: ['published_on=null'],
    },
    {
      name: 'missing final mix asset is rejected',
      story: completeEpisode(),
      finalMixExists: false,
      missing: ['final_mix_asset_exists'],
    },
    {
      name: 'repair workflow state is rejected',
      story: completeEpisode({ workflow_state: 'repair_queue' }),
      finalMixExists: true,
      missing: ['workflow_state=ready_for_review'],
    },
    {
      name: 'missing narrator metadata is rejected',
      story: completeEpisode({ narrator_voice_id: '', narrator_voice_name: '' }),
      finalMixExists: true,
      missing: ['narrator_voice_id', 'narrator_voice_name'],
    },
    {
      name: 'legacy intro field is accepted',
      story: completeEpisode({ intro_audio_url: '', intro_before_url: 'https://example.test/intro-before.mp3' }),
      finalMixExists: true,
      missing: [],
    },
  ]

  const failures = []
  for (const testCase of cases) {
    const actual = missingEpisodeFields(testCase.story, testCase.finalMixExists)
    const actualSet = new Set(actual)
    const expectedSet = new Set(testCase.missing)
    const missingExpected = [...expectedSet].filter((field) => !actualSet.has(field))
    const unexpected = actual.filter((field) => !expectedSet.has(field))
    if (missingExpected.length || unexpected.length) {
      failures.push({
        name: testCase.name,
        expected: testCase.missing,
        actual,
        missingExpected,
        unexpected,
      })
    }
  }

  if (episodeNumber(completeEpisode({ episode_number: null, series_number: 2 })) !== 2) {
    failures.push({ name: 'series_number fallback', expected: 2, actual: episodeNumber(completeEpisode({ episode_number: null, series_number: 2 })) })
  }

  if (failures.length) {
    console.error(JSON.stringify({ success: false, failures }, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({ success: true, cases: cases.length + 1 }, null, 2))
}

function writeReport(filePath, report) {
  if (!filePath) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    runSelfTest()
    return
  }

  const { job, seriesId, stories } = await loadProductionData(args)

  const sortedStories = [...(stories || [])].sort((a, b) => (episodeNumber(a) || 999) - (episodeNumber(b) || 999))
  const presentNumbers = new Set(sortedStories.map(episodeNumber).filter(Boolean))
  const missingEpisodeNumbers = []
  for (let episode = 1; episode <= args.expectedEpisodes; episode += 1) {
    if (!presentNumbers.has(episode)) missingEpisodeNumbers.push(episode)
  }

  const episodeReports = []
  for (const story of sortedStories) {
    const finalMixExists = args.checkAssets && clean(story.audio_url).includes('/final_mix.mp3')
      ? await remoteAssetExists(clean(story.audio_url))
      : null
    const missing = missingEpisodeFields(story, finalMixExists)
    episodeReports.push({
      storyId: story.id,
      title: story.title,
      episodeNumber: episodeNumber(story),
      status: story.status,
      isHidden: story.is_hidden,
      publishedOn: story.published_on,
      reviewStatus: clean(story.review_status || 'pending'),
      workflowState: clean(story.workflow_state) || null,
      finalMixUrl: clean(story.audio_url),
      finalMixExists,
      approvalReady: missing.length === 0,
      missing,
    })
  }

  const jobReady = job.status === 'complete' && job.current_step === 'ready_for_review'
  const allEpisodesReady = missingEpisodeNumbers.length === 0
    && episodeReports.length === args.expectedEpisodes
    && episodeReports.every((episode) => episode.approvalReady)
  const readyForReview = jobReady && allEpisodesReady

  const report = {
    success: readyForReview,
    job: {
      id: job.id,
      status: job.status,
      currentStep: job.current_step,
      completedAt: job.completed_at,
      updatedAt: job.updated_at,
      errorPresent: Boolean(job.error_json && Object.keys(job.error_json).length),
    },
    seriesId,
    transport: args.transport,
    expectedEpisodes: args.expectedEpisodes,
    presentEpisodes: episodeReports.length,
    missingEpisodeNumbers,
    jobReady,
    allEpisodesReady,
    readyForReview,
    publishSafety: {
      noEpisodePublished: episodeReports.every((episode) => episode.publishedOn === null),
      allEpisodesHidden: episodeReports.every((episode) => episode.isHidden === true),
    },
    episodes: episodeReports,
  }

  writeReport(args.output, report)
  console.log(JSON.stringify(report, null, 2))
  if (!readyForReview) process.exit(1)
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exit(1)
})
