#!/usr/bin/env node

const { spawnSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const path = require('path')

const DEFAULT_JOB_ID = 'a880ab98-52a7-49ae-b52f-4a1b83a90926'
const EXPLICIT_FAILED_JOB_RESUME_STEPS = new Set([
  'generate_voices',
  'generate_belle_assets',
  'validate_belle_assets',
  'validate_belle_quality',
  'generate_music',
  'render_final_mix',
  'complete_story_package',
  'ready_for_review',
  'series_generate_voices',
  'series_generate_belle_assets',
  'series_generate_music',
  'series_render_final_mix',
])

function parseArgs(argv) {
  const args = {
    jobId: process.env.JOB_ID || DEFAULT_JOB_ID,
    baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3000',
    envPath: process.env.PHANTOM_ENV_FILE || '.env.local',
    devLog: process.env.DEV_LOG || '/tmp/drivetimetales-next-dev.log',
    checkDb: process.env.DOCTOR_CHECK_DB !== 'false',
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      index += 1
      return argv[index]
    }

    if (arg === '--job-id' || arg.startsWith('--job-id=')) args.jobId = readValue()
    else if (arg === '--base-url' || arg.startsWith('--base-url=')) args.baseUrl = readValue()
    else if (arg === '--env-path' || arg.startsWith('--env-path=')) args.envPath = readValue()
    else if (arg === '--dev-log' || arg.startsWith('--dev-log=')) args.devLog = readValue()
    else if (arg === '--skip-db') args.checkDb = false
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/phantom-ledger-doctor.js [options]',
        '',
        'Read-only recovery preflight for The Phantom Ledger.',
        '',
        'Options:',
        '  --job-id <uuid>       Production job ID',
        '  --base-url <url>      Local app base URL',
        '  --env-path <path>     Env file to validate',
        '  --dev-log <path>      Next dev server log path',
        '  --skip-db             Skip read-only Supabase job lookup',
        '  --self-test           Run local doctor classifier checks',
        '  --json                Print JSON only',
      ].join('\n'))
      process.exit(0)
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '')
  return args
}

function runSelfTest() {
  const cases = [
    {
      name: 'running job is resumable',
      job: { status: 'running', currentStep: 'series_generate_voices', errorPresent: false },
      resumeEligible: true,
      reason: 'job_already_active',
    },
    {
      name: 'failed blank series voice step is resumable',
      job: { status: 'failed', currentStep: 'series_generate_voices', errorPresent: false },
      resumeEligible: true,
      reason: 'failed_blank_error_nonpublish_step_is_auto_resumable',
    },
    {
      name: 'failed job with error details is not resumable',
      job: { status: 'failed', currentStep: 'series_generate_voices', errorPresent: true },
      resumeEligible: false,
      reason: 'failed_job_has_error_details_for_review',
    },
    {
      name: 'failed unknown step is not resumable',
      job: { status: 'failed', currentStep: 'publish_story', errorPresent: false },
      resumeEligible: false,
      reason: 'step_publish_story_is_not_auto_resumable',
    },
    {
      name: 'complete ready job is not resumable',
      job: { status: 'complete', currentStep: 'ready_for_review', errorPresent: false },
      resumeEligible: false,
      reason: 'job_already_complete_ready_for_review',
    },
  ]

  const failures = []
  for (const testCase of cases) {
    const actual = classifyJobForResume(testCase.job)
    if (actual.resumeEligible !== testCase.resumeEligible || actual.reason !== testCase.reason) {
      failures.push({ name: testCase.name, expected: testCase, actual })
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ success: false, failures }, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({ success: true, cases: cases.length }, null, 2))
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  })
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function hasErrorDetails(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function classifyJobForResume(job) {
  if (!job) {
    return {
      known: false,
      resumeEligible: false,
      reason: 'job_not_loaded',
    }
  }

  const currentStep = String(job.currentStep || job.current_step || '').trim()
  const status = String(job.status || '').trim()
  const errorPresent = job.errorPresent != null
    ? Boolean(job.errorPresent)
    : hasErrorDetails(job.error_json)

  if (status === 'queued' || status === 'running') {
    return {
      known: true,
      resumeEligible: true,
      reason: 'job_already_active',
      status,
      currentStep,
    }
  }

  if (status === 'complete' && currentStep === 'ready_for_review') {
    return {
      known: true,
      resumeEligible: false,
      reason: 'job_already_complete_ready_for_review',
      status,
      currentStep,
    }
  }

  if (status !== 'failed') {
    return {
      known: true,
      resumeEligible: false,
      reason: `status_${status || 'unknown'}_is_not_auto_resumable`,
      status,
      currentStep,
    }
  }

  if (!EXPLICIT_FAILED_JOB_RESUME_STEPS.has(currentStep)) {
    return {
      known: true,
      resumeEligible: false,
      reason: `step_${currentStep || 'unknown'}_is_not_auto_resumable`,
      status,
      currentStep,
    }
  }

  if (errorPresent) {
    return {
      known: true,
      resumeEligible: false,
      reason: 'failed_job_has_error_details_for_review',
      status,
      currentStep,
    }
  }

  return {
    known: true,
    resumeEligible: true,
    reason: 'failed_blank_error_nonpublish_step_is_auto_resumable',
    status,
    currentStep,
  }
}

function checkEnv(envPath) {
  const result = run('node', ['scripts/check-production-env.js', '--env-path', envPath])
  return {
    success: result.status === 0,
    commandStatus: result.status,
    report: parseJson(result.stdout.replace(/^\[dotenv[^\n]*\n/, '')),
    stderr: result.stderr.trim() || null,
  }
}

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function restJobLookup(envPath, jobId) {
  const env = { ...process.env, ...loadEnvFile(envPath) }
  const baseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceRole = String(env.SUPABASE_SERVICE_ROLE_KEY || '')

  if (!baseUrl || !serviceRole) {
    return Promise.resolve({
      success: false,
      skipped: false,
      error: 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    })
  }

  let requestUrl
  try {
    requestUrl = new URL('/rest/v1/production_jobs', `${baseUrl}/`)
  } catch {
    return Promise.resolve({
      success: false,
      skipped: false,
      error: 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL',
    })
  }
  requestUrl.searchParams.set('select', 'id,status,current_step,series_id,updated_at,error_json')
  requestUrl.searchParams.set('id', `eq.${jobId}`)
  requestUrl.searchParams.set('limit', '1')

  return new Promise((resolve) => {
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
          return resolve({
            success: false,
            skipped: false,
            statusCode: response.statusCode,
            error: `non-json response: ${body.slice(0, 160)}`,
          })
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return resolve({
            success: false,
            skipped: false,
            statusCode: response.statusCode,
            error: parsed?.message || parsed?.error || `HTTP ${response.statusCode}`,
          })
        }
        const job = Array.isArray(parsed) ? parsed[0] : null
        return resolve({
          success: Boolean(job),
          skipped: false,
          statusCode: response.statusCode,
          jobFound: Boolean(job),
          job: job ? {
            id: job.id,
            status: job.status,
            currentStep: job.current_step,
            seriesIdPresent: Boolean(job.series_id),
            updatedAt: job.updated_at,
            errorPresent: Boolean(job.error_json && Object.keys(job.error_json).length),
          } : null,
          error: job ? null : `Production job not found: ${jobId}`,
        })
      })
    })
    request.on('timeout', () => request.destroy(new Error('Supabase REST job lookup timed out')))
    request.on('error', (error) => resolve({
      success: false,
      skipped: false,
      error: error.message,
    }))
    request.end()
  })
}

function routeStatus(baseUrl) {
  const url = `${baseUrl}/api/admin/production-jobs/run-next`
  const result = run('curl', ['-s', '--max-time', '10', '-o', '/dev/null', '-w', '%{http_code}', url])
  const status = result.stdout.trim() || '000'
  return {
    success: ['405', '400', '200'].includes(status),
    status,
    error: result.error || result.stderr.trim() || null,
  }
}

function portFromBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl)
    if (url.port) return url.port
    return url.protocol === 'https:' ? '443' : '80'
  } catch {
    return null
  }
}

function inspectPortListeners(baseUrl) {
  const port = portFromBaseUrl(baseUrl)
  if (!port) {
    return {
      checked: false,
      port: null,
      listeners: [],
      error: 'baseUrl is not a valid URL',
    }
  }
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  return {
    checked: result.status === 0 || result.status === 1,
    port,
    listeners: lines.length > 1 ? lines.slice(1) : [],
    error: result.error || result.stderr.trim() || null,
  }
}

function checkFile(filePath) {
  return {
    path: filePath,
    exists: fs.existsSync(filePath),
    executable: fs.existsSync(filePath) ? Boolean(fs.statSync(filePath).mode & 0o111) : false,
  }
}

function readTail(filePath, maxBytes = 12000) {
  if (!fs.existsSync(filePath)) return ''
  const stat = fs.statSync(filePath)
  const start = Math.max(0, stat.size - maxBytes)
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(stat.size - start)
    fs.readSync(fd, buffer, 0, buffer.length, start)
    return buffer.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

function inspectDevLog(filePath) {
  const tail = readTail(filePath)
  const indicators = []
  if (/Cannot find module '.\/\d+\.js'|Cannot find module "\.\/\d+\.js"/.test(tail)) indicators.push('missing_next_server_chunk')
  if (/listen EPERM/.test(tail)) indicators.push('listen_eperm')
  if (/Invalid API key/.test(tail)) indicators.push('invalid_api_key')
  if (/getaddrinfo ENOTFOUND/.test(tail)) indicators.push('dns_enotfound')
  return {
    path: filePath,
    exists: Boolean(tail),
    indicators,
  }
}

function inspectNextArtifacts() {
  const serverDir = path.join('.next', 'server')
  const webpackRuntime = path.join(serverDir, 'webpack-runtime.js')
  return {
    nextDirExists: fs.existsSync('.next'),
    serverDirExists: fs.existsSync(serverDir),
    webpackRuntimeExists: fs.existsSync(webpackRuntime),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    runSelfTest()
    return
  }
  const helpers = [
    checkFile('scripts/resume-phantom-ledger.sh'),
    checkFile('scripts/audit-phantom-ledger-ready.js'),
    checkFile('scripts/production-autopilot.js'),
    checkFile('scripts/check-production-env.js'),
  ]
  const env = checkEnv(args.envPath)
  const database = args.checkDb
    ? await restJobLookup(args.envPath, args.jobId)
    : { success: true, skipped: true }
  const resumeEligibility = classifyJobForResume(database.job)
  const route = routeStatus(args.baseUrl)
  const portListeners = inspectPortListeners(args.baseUrl)
  const devLog = inspectDevLog(args.devLog)
  const nextArtifacts = inspectNextArtifacts()

  const blockers = []
  if (!env.success) blockers.push('env_check_failed')
  if (!database.success) blockers.push('supabase_job_lookup_failed')
  if (!database.skipped && database.success && !resumeEligibility.resumeEligible && resumeEligibility.reason !== 'job_already_complete_ready_for_review') {
    blockers.push('job_not_auto_resumable')
  }
  if (!route.success) blockers.push('run_next_route_unreachable_or_unexpected')
  if (!route.success && portListeners.listeners.length) blockers.push('route_unreachable_with_port_listener')
  if (devLog.indicators.includes('missing_next_server_chunk')) blockers.push('stale_next_server_artifact')
  if (devLog.indicators.includes('listen_eperm')) blockers.push('local_listen_eperm')
  if (devLog.indicators.includes('invalid_api_key')) blockers.push('invalid_api_key_seen_in_dev_log')
  for (const helper of helpers) {
    if (!helper.exists) blockers.push(`missing_${path.basename(helper.path)}`)
  }

  const report = {
    success: blockers.length === 0,
    jobId: args.jobId,
    baseUrl: args.baseUrl,
    envPath: args.envPath,
    blockers,
    checks: {
      helpers,
      env,
      database,
      resumeEligibility,
      route,
      portListeners,
      devLog,
      nextArtifacts,
    },
    safeResumeCommand: `PHANTOM_ENV_FILE=${args.envPath} FORCE_RESTART_DEV=true CLEAN_NEXT_BUILD=true npm run phantom-ledger:resume`,
    publishSafety: 'doctor is read-only; it does not call publish endpoints or mutate the job',
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(JSON.stringify(report, null, 2))
  }

  if (!report.success) process.exit(1)
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exit(1)
})
