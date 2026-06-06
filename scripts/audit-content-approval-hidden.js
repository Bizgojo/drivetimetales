#!/usr/bin/env node

const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_ENV_PATH = '.env.production.local'

function parseArgs(argv) {
  const args = {
    envPath: process.env.CONTENT_APPROVAL_AUDIT_ENV || DEFAULT_ENV_PATH,
    output: '',
    markdown: '',
    printSchema: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      index += 1
      return argv[index]
    }
    if (arg === '--env-path' || arg.startsWith('--env-path=')) args.envPath = readValue()
    else if (arg === '--output' || arg.startsWith('--output=')) args.output = readValue()
    else if (arg === '--markdown' || arg.startsWith('--markdown=')) args.markdown = readValue()
    else if (arg === '--print-schema') args.printSchema = true
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/audit-content-approval-hidden.js [options]',
        '',
        'Read-only audit of audio-ready unpublished packages hidden by strict Ready for Review gates.',
        '',
        'Options:',
        '  --env-path <path>   Env file with Supabase URL/service role (default: .env.production.local)',
        '  --output <path>     Write JSON report',
        '  --markdown <path>   Write markdown report',
        '  --print-schema      Print detected stories columns and exit',
      ].join('\n'))
      process.exit(0)
    }
  }
  return args
}

function clean(value) {
  return String(value ?? '').trim()
}

function bool(value) {
  return clean(value).length > 0
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function dateMs(value) {
  const parsed = Date.parse(clean(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function episodeNumber(story) {
  return numberOrNull(story.episode_number) || numberOrNull(story.series_number)
}

function finalMixPresent(story) {
  return clean(story.audio_url).includes('/final_mix.mp3')
}

function reviewStatus(story) {
  return clean(story.review_status) || 'pending'
}

function workflowState(story) {
  const explicit = clean(story.workflow_state)
  if (explicit) return explicit
  if (story.status === 'published' && story.is_hidden === false) return 'published'
  if (reviewStatus(story) === 'approved') return 'approved_ready'
  if (reviewStatus(story) === 'not_approved') return 'cold_storage'
  return 'ready_for_review'
}

function storyJobIds(job) {
  const ids = new Set()
  const add = (value) => {
    const id = clean(value)
    if (id) ids.add(id)
  }
  add(job.story_id)
  add(job.state_json?.storyId)
  add(job.state_json?.story_id)
  add(job.error_json?.storyId)
  add(job.error_json?.story_id)
  for (const list of [
    job.state_json?.episodes,
    job.state_json?.seriesValidation?.validatedEpisodes,
    job.state_json?.seriesVoicePreflight?.checkedEpisodes,
    Object.values(job.state_json?.seriesVoiceGeneration?.progressByEpisode || {}),
  ]) {
    if (!Array.isArray(list)) continue
    for (const item of list) add(item?.storyId || item?.story_id || item?.id)
  }
  return ids
}

function jobSeriesIds(job) {
  const ids = new Set()
  const add = (value) => {
    const id = clean(value)
    if (id) ids.add(id)
  }
  add(job.series_id)
  add(job.state_json?.seriesId)
  add(job.state_json?.series_id)
  add(job.error_json?.seriesId)
  add(job.error_json?.series_id)
  return ids
}

function relatedJobs(story, jobs) {
  return jobs
    .filter((job) => storyJobIds(job).has(story.id) || (story.series_id && jobSeriesIds(job).has(story.series_id)))
    .sort((a, b) => dateMs(b.updated_at || b.created_at) - dateMs(a.updated_at || a.created_at))
}

function packageCompletionJob(job) {
  if (!job || !bool(job.completed_at)) return false
  const status = clean(job.status).toLowerCase()
  const step = clean(job.current_step).toLowerCase()
  return status === 'complete' || [
    'ready_for_review',
    'complete_story_package',
    'series_render_final_mix',
    'render_final_mix',
  ].includes(step)
}

function completionProof(story, jobs, options = {}) {
  if (!finalMixPresent(story)) return { date: null, source: 'missing_final_mix' }
  if (options.unavailable) return { date: null, source: 'completion_proof_unavailable' }
  const job = relatedJobs(story, jobs).find(packageCompletionJob)
  if (job) return { date: job.completed_at, source: `production_jobs.completed_at:${job.current_step || 'complete'}` }
  return { date: null, source: 'unproven_final_mix_completion_time' }
}

function metadataMissing(story) {
  const missing = []
  if (!bool(story.title)) missing.push('title')
  if (!bool(story.author)) missing.push('author')
  if (!bool(story.genre)) missing.push('genre')
  if (!bool(story.description)) missing.push('description')
  if (!numberOrNull(story.duration_mins)) missing.push('duration_mins')
  if (!bool(story.created_at)) missing.push('created_at')
  return missing
}

function episodeReasons(story, proof, jobs) {
  const reasons = []
  const workflow = workflowState(story)
  if (story.status !== 'audio_ready') reasons.push(`status is ${story.status || 'empty'}, expected audio_ready`)
  if (story.is_hidden !== true) reasons.push(`is_hidden is ${String(story.is_hidden)}, expected true`)
  if (story.published_on !== null) reasons.push('published_on is set, expected null')
  if (reviewStatus(story) !== 'pending') reasons.push(`review_status is ${reviewStatus(story)}, expected pending`)
  if (['pending', 'script_revised', 'partial'].includes(clean(story.status).toLowerCase())) reasons.push(`partial status ${story.status}`)
  if (['pending', 'script_revised', 'partial'].includes(workflow)) reasons.push(`partial workflow_state ${workflow}`)
  if (!bool(story.audio_url)) reasons.push('missing audio_url')
  if (!finalMixPresent(story)) reasons.push('missing final_mix audio_url')
  if (!bool(story.story_audio_url)) reasons.push('missing story_audio_url')
  if (!bool(story.cover_url)) reasons.push('missing cover_url')
  if (!bool(story.prose_text)) reasons.push('missing prose_text')
  if (!bool(story.author_id)) reasons.push('missing author_id')
  if (!bool(story.narrator_voice_id) && !bool(story.narrator_voice_name)) reasons.push('missing narrator')
  for (const field of metadataMissing(story)) reasons.push(`missing ${field}`)
  if (!proof.date) reasons.push(`completion timestamp not proven: ${proof.source}`)
  for (const job of activeFailedJobs(jobs, proof.date)) {
    reasons.push(`Active failed production job ${job.id} at ${job.current_step || 'unknown step'}`)
  }
  return reasons
}

function activeFailedJobs(jobs, completionSortDate) {
  const completionMs = dateMs(completionSortDate)
  return jobs.filter((job) => {
    const status = clean(job.status).toLowerCase()
    if (status !== 'failed' && status !== 'error') return false
    const jobMs = dateMs(job.updated_at || job.completed_at || job.created_at)
    return completionMs === 0 || jobMs >= completionMs
  })
}

function classify(flags) {
  if (flags.published) return 'Published'
  if (flags.cold) return 'Cold Storage'
  if (flags.failed) return 'Failed/blocked production'
  if (flags.partial) return 'Partial series'
  if (flags.ready) return 'Strict Ready for Review'
  if (flags.missingPackage) return 'Missing package fields'
  if (flags.missingProofOnly) return 'Missing completion proof only'
  return 'Missing package fields'
}

function packageMissingOnly(reasons) {
  return reasons.some((reason) => /missing (audio_url|final_mix|story_audio_url|cover_url|prose_text|author_id|narrator|title|author|genre|description|duration_mins|created_at)/.test(reason))
}

function recommendationFor(item) {
  if (item.category === 'Missing completion proof only') return 'Needs completion-proof backfill before Ready for Review.'
  if (item.category === 'Missing package fields') return 'Needs package completion/backfill before Ready for Review.'
  if (item.category === 'Partial series') return 'Stay hidden until every expected episode is complete and packaged.'
  if (item.category === 'Cold Storage') return 'Keep in Cold Storage unless Marc explicitly retrieves it.'
  if (item.category === 'Failed/blocked production') return 'Resolve or defer failed production job before review.'
  if (item.category === 'Strict Ready for Review') return 'Already passes strict Ready for Review.'
  return 'No cleanup action recommended.'
}

const STORY_AUDIT_COLUMNS = [
  'id',
  'title',
  'author',
  'genre',
  'description',
  'duration_mins',
  'created_at',
  'updated_at',
  'status',
  'is_hidden',
  'published_on',
  'review_status',
  'workflow_state',
  'audio_url',
  'story_audio_url',
  'cover_url',
  'prose_text',
  'author_id',
  'narrator_voice_id',
  'narrator_voice_name',
  'narrator_id',
  'narrator_name',
  'series_id',
  'series_name',
  'episode_number',
  'series_number',
  'series_total',
  'series_total_episodes',
]

const STORY_FIELD_MAPPINGS = {
  episode_number: ['episode_number', 'series_number'],
  series_total_episodes: ['series_total_episodes', 'series_total'],
  narrator_voice_id: ['narrator_voice_id', 'narrator_id'],
  narrator_voice_name: ['narrator_voice_name', 'narrator_name'],
}

async function detectStoriesSchema(supabase) {
  const schemaResult = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'stories')
    .order('ordinal_position', { ascending: true })
  if (!schemaResult.error && Array.isArray(schemaResult.data) && schemaResult.data.length > 0) {
    return {
      columns: schemaResult.data.map((row) => row.column_name).filter(Boolean),
      source: 'information_schema.columns',
      error: null,
    }
  }

  const result = await supabase.from('stories').select('*').limit(1)
  if (result.error) return { columns: [], source: 'stories.select_star_sample', error: result.error }
  const columns = Object.keys(result.data?.[0] || {}).sort()
  return { columns, source: 'stories.select_star_sample', error: null }
}

function buildStoriesSelect(schema) {
  const detected = new Set(schema.columns || [])
  const selectedColumns = STORY_AUDIT_COLUMNS.filter((column) => detected.has(column))
  const fallbackFields = STORY_AUDIT_COLUMNS.filter((column) => !detected.has(column))
  return {
    selectedColumns,
    fallbackFields,
    mappedFields: STORY_FIELD_MAPPINGS,
  }
}

function firstMappedValue(row, fields) {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && clean(row[field])) return row[field]
  }
  return null
}

function normalizeStoryRow(row) {
  const normalized = { ...row }
  for (const column of STORY_AUDIT_COLUMNS) {
    if (normalized[column] === undefined) normalized[column] = null
  }
  for (const [target, fields] of Object.entries(STORY_FIELD_MAPPINGS)) {
    if (!bool(normalized[target])) normalized[target] = firstMappedValue(row, fields)
  }
  return normalized
}

async function selectStoriesWithDetectedSchema(supabase, schema) {
  const selectInfo = buildStoriesSelect(schema)
  if (!selectInfo.selectedColumns.includes('id')) {
    return {
      data: null,
      error: new Error('stories.id was not detected; refusing to audit without a proven stable story identifier'),
      ...selectInfo,
    }
  }
  const result = await supabase.from('stories').select(selectInfo.selectedColumns.join(',')).limit(3000)
  if (result.error) return { ...result, ...selectInfo }
  return {
    data: (result.data || []).map(normalizeStoryRow),
    error: null,
    ...selectInfo,
  }
}

async function detectTableExists(supabase, tableName) {
  const schemaResult = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .limit(1)
  if (!schemaResult.error) {
    return {
      table: tableName,
      exists: Array.isArray(schemaResult.data) && schemaResult.data.length > 0,
      source: 'information_schema.tables',
      error: null,
    }
  }

  const probe = await supabase.from(tableName).select('*').limit(1)
  if (!probe.error) {
    return { table: tableName, exists: true, source: `${tableName}.select_star_probe`, error: null }
  }
  if (/schema cache|could not find the table|does not exist|not found/i.test(probe.error.message || '')) {
    return { table: tableName, exists: false, source: `${tableName}.select_star_probe`, error: probe.error.message }
  }
  return { table: tableName, exists: null, source: `${tableName}.select_star_probe`, error: probe.error.message }
}

async function selectJobsWithSchemaFallback(supabase) {
  const currentColumns = 'id,story_id,series_id,status,current_step,created_at,updated_at,completed_at,state_json,error_json'
  const fallbackColumns = 'id,story_id,series_id,status,current_step,created_at,updated_at,state_json,error_json'
  const result = await supabase.from('production_jobs').select(currentColumns).order('updated_at', { ascending: false }).limit(3000)
  if (!result.error) return { data: result.data || [], error: null, fallbackUsed: false }
  if (!/schema cache|column|does not exist/i.test(result.error.message || '')) return result

  const fallbackResult = await supabase.from('production_jobs').select(fallbackColumns).order('updated_at', { ascending: false }).limit(3000)
  if (fallbackResult.error) return fallbackResult
  return {
    data: (fallbackResult.data || []).map((job) => ({ ...job, completed_at: null })),
    error: null,
    fallbackUsed: true,
    fallbackReason: result.error.message,
  }
}

async function selectJobsIfAvailable(supabase, tableInfo) {
  if (!tableInfo.exists) {
    return {
      data: [],
      error: null,
      unavailable: true,
      unavailableReason: tableInfo.error || 'production_jobs table not detected',
      fallbackUsed: false,
      fallbackReason: null,
    }
  }
  return selectJobsWithSchemaFallback(supabase)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  require('dotenv').config({ path: args.envPath, quiet: true })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const storySchema = await detectStoriesSchema(supabase)
  if (storySchema.error) throw storySchema.error
  const storySelectInfo = buildStoriesSelect(storySchema)
  const productionJobsTable = await detectTableExists(supabase, 'production_jobs')
  if (productionJobsTable.exists === null) throw new Error(`Unable to determine production_jobs availability: ${productionJobsTable.error}`)
  if (args.printSchema) {
    console.log(JSON.stringify({
      success: true,
      tables: {
        stories: {
          exists: true,
          source: storySchema.source,
          columns: storySchema.columns,
          selectedColumns: storySelectInfo.selectedColumns,
          fallbackFields: storySelectInfo.fallbackFields,
          mappedFields: storySelectInfo.mappedFields,
        },
        production_jobs: productionJobsTable,
      },
      detectedTables: ['stories', ...(productionJobsTable.exists ? ['production_jobs'] : [])],
      missingTables: productionJobsTable.exists ? [] : ['production_jobs'],
    }, null, 2))
    return
  }

  const storyResult = await selectStoriesWithDetectedSchema(supabase, storySchema)
  if (storyResult.error) throw storyResult.error
  const jobResult = await selectJobsIfAvailable(supabase, productionJobsTable)
  if (jobResult.error) throw jobResult.error
  const stories = storyResult.data || []
  const jobs = jobResult.data || []
  const completionProofOptions = { unavailable: Boolean(jobResult.unavailable) }

  const candidates = (stories || []).filter((story) =>
    story.published_on === null && (story.status === 'audio_ready' || bool(story.audio_url) || bool(story.story_audio_url))
  )

  const seriesMap = new Map()
  const standalone = []
  for (const story of candidates) {
    if (bool(story.series_id) && episodeNumber(story)) {
      seriesMap.set(story.series_id, [...(seriesMap.get(story.series_id) || []), story])
    } else {
      standalone.push(story)
    }
  }

  const items = []
  for (const [seriesId, episodes] of seriesMap.entries()) {
    episodes.sort((a, b) => (episodeNumber(a) || 999) - (episodeNumber(b) || 999))
    const seriesJobs = (jobs || []).filter((job) => jobSeriesIds(job).has(seriesId))
    const expected = Math.max(
      0,
      ...episodes.map((story) => numberOrNull(story.series_total_episodes) || numberOrNull(story.series_total) || 0),
      ...seriesJobs.map((job) => Number(job.state_json?.totalEpisodes || job.state_json?.seriesValidation?.episodeCount || 0) || 0)
    )
    const present = new Set(episodes.map(episodeNumber).filter(Boolean))
    const missingEpisodes = []
    for (let index = 1; index <= expected; index += 1) {
      if (!present.has(index)) missingEpisodes.push(index)
    }
    const reports = episodes.map((story) => {
      const proof = completionProof(story, jobs || [], completionProofOptions)
      const rel = relatedJobs(story, jobs || [])
      return { story, proof, rel, reasons: episodeReasons(story, proof, rel) }
    })
    const reasons = [
      ...(expected ? [] : ['series expected episode count is not proven']),
      ...(missingEpisodes.length ? [`missing episode(s): ${missingEpisodes.join(', ')}`] : []),
      ...reports.flatMap((report) => report.reasons.map((reason) => `Episode ${episodeNumber(report.story) || '?'}: ${reason}`)),
    ]
    const completionDates = reports.map((report) => report.proof.date).filter(Boolean).sort((a, b) => dateMs(b) - dateMs(a))
    const failed = reasons.some((reason) => reason.includes('Active failed production job'))
    const cold = reports.every((report) => ['cold_storage', 'not_approved'].includes(workflowState(report.story)) || reviewStatus(report.story) === 'not_approved')
    const published = reports.some((report) => report.story.published_on !== null || report.story.status === 'published')
    const partial = Boolean(missingEpisodes.length || !expected || reports.some((report) => ['pending', 'script_revised', 'partial'].includes(clean(report.story.status).toLowerCase()) || ['pending', 'script_revised', 'partial'].includes(workflowState(report.story))))
    const missingPackage = packageMissingOnly(reasons.join('\n').split('\n'))
    const missingProofOnly = !missingPackage && reasons.length > 0 && reasons.every((reason) => reason.includes('completion timestamp not proven'))
    const ready = reasons.length === 0
    const item = {
      title: clean(episodes[0].series_name) || clean(episodes[0].title) || 'Untitled Series',
      kind: 'series',
      presentEpisodeCount: episodes.length,
      expectedEpisodeCount: expected || episodes.length,
      finalMixPresent: reports.every((report) => finalMixPresent(report.story)),
      coverPresent: reports.every((report) => bool(report.story.cover_url)),
      proseTextPresent: reports.every((report) => bool(report.story.prose_text)),
      authorIdPresent: reports.every((report) => bool(report.story.author_id)),
      narratorPresent: reports.every((report) => bool(report.story.narrator_voice_id) || bool(report.story.narrator_voice_name)),
      completionSortDate: completionDates[0] || null,
      activeFailedJob: failed,
      approvalBlockingReasons: reasons,
      category: classify({ ready, missingProofOnly, missingPackage, partial, cold, published, failed }),
    }
    item.recommendation = recommendationFor(item)
    items.push(item)
  }

  for (const story of standalone) {
    const proof = completionProof(story, jobs || [], completionProofOptions)
    const rel = relatedJobs(story, jobs || [])
    const reasons = episodeReasons(story, proof, rel)
    const failed = reasons.some((reason) => reason.includes('Active failed production job'))
    const cold = ['cold_storage', 'not_approved'].includes(workflowState(story)) || reviewStatus(story) === 'not_approved'
    const published = story.published_on !== null || story.status === 'published'
    const missingPackage = packageMissingOnly(reasons)
    const missingProofOnly = !missingPackage && reasons.length > 0 && reasons.every((reason) => reason.includes('completion timestamp not proven'))
    const ready = reasons.length === 0
    const item = {
      title: clean(story.title) || 'Untitled',
      kind: 'standalone',
      presentEpisodeCount: 1,
      expectedEpisodeCount: 1,
      finalMixPresent: finalMixPresent(story),
      coverPresent: bool(story.cover_url),
      proseTextPresent: bool(story.prose_text),
      authorIdPresent: bool(story.author_id),
      narratorPresent: bool(story.narrator_voice_id) || bool(story.narrator_voice_name),
      completionSortDate: proof.date,
      activeFailedJob: failed,
      approvalBlockingReasons: reasons,
      category: classify({ ready, missingProofOnly, missingPackage, partial: false, cold, published, failed }),
    }
    item.recommendation = recommendationFor(item)
    items.push(item)
  }

  const groups = {}
  for (const item of items) {
    groups[item.category] = groups[item.category] || []
    groups[item.category].push(item)
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => dateMs(b.completionSortDate) - dateMs(a.completionSortDate) || a.title.localeCompare(b.title))
  }
  const audioCompleteWithoutCompletionProof = items
    .filter((item) => item.finalMixPresent && !item.completionSortDate)
    .map((item) => ({
      title: item.title,
      kind: item.kind,
      presentEpisodeCount: item.presentEpisodeCount,
      expectedEpisodeCount: item.expectedEpisodeCount,
      category: item.category,
      recommendation: item.recommendation,
      approvalBlockingReasons: item.approvalBlockingReasons.filter((reason) =>
        reason.includes('completion timestamp not proven')
      ),
    }))

  const report = {
    success: true,
    generatedAt: new Date().toISOString(),
    envPath: args.envPath,
    dataChanged: false,
    detectedTables: ['stories', ...(productionJobsTable.exists ? ['production_jobs'] : [])],
    missingTables: productionJobsTable.exists ? [] : ['production_jobs'],
    completionProofUnavailable: Boolean(jobResult.unavailable),
    completionProofUnavailableReason: jobResult.unavailableReason || null,
    schema: {
      stories: {
        source: storySchema.source,
        columns: storySchema.columns,
        selectedColumns: storyResult.selectedColumns,
        fallbackFields: storyResult.fallbackFields,
        mappedFields: storyResult.mappedFields,
      },
      production_jobs: productionJobsTable,
    },
    schemaFallbacks: {
      productionJobs: Boolean(jobResult.fallbackUsed),
      productionJobsReason: jobResult.fallbackReason || null,
    },
    candidates: candidates.length,
    counts: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length])),
    audioCompleteWithoutCompletionProof,
    groups,
  }

  if (args.output) fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`)
  if (args.markdown) fs.writeFileSync(args.markdown, markdownReport(report))
  console.log(JSON.stringify(report, null, 2))
}

function markdownReport(report) {
  const lines = [
    '# Content Approval Hidden Package Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Data changed: ${report.dataChanged}`,
    `Detected tables: ${report.detectedTables.join(', ') || 'none'}`,
    `Missing tables: ${report.missingTables.join(', ') || 'none'}`,
    `Completion proof unavailable: ${report.completionProofUnavailable}`,
    `Candidates: ${report.candidates}`,
    '',
  ]
  if (report.audioCompleteWithoutCompletionProof.length) {
    lines.push('## Audio-Complete Without Completion Proof', '')
    for (const item of report.audioCompleteWithoutCompletionProof) {
      lines.push(`- ${item.title} (${item.kind}) - ${item.recommendation}`)
    }
    lines.push('')
  }
  for (const [category, items] of Object.entries(report.groups)) {
    lines.push(`## ${category}`, '')
    for (const item of items) {
      lines.push(`- ${item.title} (${item.kind})`)
      lines.push(`  - Episodes: ${item.presentEpisodeCount}/${item.expectedEpisodeCount}`)
      lines.push(`  - final_mix: ${item.finalMixPresent}; cover: ${item.coverPresent}; prose_text: ${item.proseTextPresent}; author_id: ${item.authorIdPresent}; narrator: ${item.narratorPresent}`)
      lines.push(`  - completionSortDate: ${item.completionSortDate || 'none'}; activeFailedJob: ${item.activeFailedJob}`)
      lines.push(`  - Reasons: ${item.approvalBlockingReasons.length ? item.approvalBlockingReasons.join(' | ') : 'none'}`)
      lines.push(`  - Recommendation: ${item.recommendation}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exit(1)
})
