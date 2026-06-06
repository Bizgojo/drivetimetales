#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const DEFAULT_REPORT_DIR = path.join(process.cwd(), 'reports', 'reliability')
const DEFAULT_AUTOPILOT_DIR = path.join(process.cwd(), 'reports', 'production-autopilot')
const DEFAULT_DOCTOR_REPORT = path.join(DEFAULT_AUTOPILOT_DIR, 'phantom-ledger-doctor-latest.json')
const DEFAULT_READY_AUDIT = path.join(DEFAULT_AUTOPILOT_DIR, 'phantom-ledger-ready-audit-latest.json')

function parseArgs(argv) {
  const args = {
    reportDir: process.env.RELIABILITY_REPORT_DIR || DEFAULT_REPORT_DIR,
    autopilotDir: process.env.PRODUCTION_AUTOPILOT_REPORT_DIR || DEFAULT_AUTOPILOT_DIR,
    doctorReport: process.env.DOCTOR_OUTPUT || DEFAULT_DOCTOR_REPORT,
    readyAudit: process.env.AUDIT_OUTPUT || DEFAULT_READY_AUDIT,
    output: '',
    selfTest: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = () => {
      if (arg.includes('=')) return arg.split('=').slice(1).join('=')
      index += 1
      return argv[index]
    }

    if (arg === '--report-dir' || arg.startsWith('--report-dir=')) args.reportDir = readValue()
    else if (arg === '--autopilot-dir' || arg.startsWith('--autopilot-dir=')) args.autopilotDir = readValue()
    else if (arg === '--doctor-report' || arg.startsWith('--doctor-report=')) args.doctorReport = readValue()
    else if (arg === '--ready-audit' || arg.startsWith('--ready-audit=')) args.readyAudit = readValue()
    else if (arg === '--output' || arg.startsWith('--output=')) args.output = readValue()
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/reliability-report.js [options]',
        '',
        'Creates a four-hour reliability handoff from local production artifacts.',
        '',
        'Options:',
        '  --report-dir <path>      Directory for generated markdown reports',
        '  --autopilot-dir <path>   Directory containing production-autopilot reports',
        '  --doctor-report <path>   Latest doctor JSON report',
        '  --ready-audit <path>     Latest Ready-for-Review audit JSON report',
        '  --output <path>          Explicit markdown output path',
        '  --self-test              Run local report classifier checks',
      ].join('\n'))
      process.exit(0)
    }
  }

  return args
}

function nowIso() {
  return new Date().toISOString()
}

function reportStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false, value: null, error: null }
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')), error: null }
  } catch (error) {
    return { exists: true, value: null, error: error.message }
  }
}

function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function latestMarkdownFile(directory) {
  if (!fs.existsSync(directory)) return null
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const filePath = path.join(directory, name)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0]?.filePath || null
}

function extractMarkdownSection(markdown, heading) {
  if (!markdown) return ''
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start < 0) return ''
  const body = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break
    body.push(lines[index])
  }
  return body.join('\n').trim()
}

function bullet(value) {
  const text = String(value || '').trim()
  return text ? `- ${text}` : '- None recorded'
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function classifyInfrastructureHealth(doctor) {
  if (!doctor?.exists) return 'unknown: no doctor report found'
  if (doctor.error) return `degraded: doctor report unreadable (${doctor.error})`
  const blockers = doctor.value?.blockers || []
  if (!Array.isArray(blockers) || blockers.length === 0) return 'healthy: latest doctor report passed'
  if (blockers.some((blocker) => /listen_eperm|route_unreachable|supabase|dns|invalid_api_key|port_listener/.test(String(blocker)))) {
    return `blocked: ${blockers.join(', ')}`
  }
  return `degraded: ${blockers.join(', ')}`
}

function classifyReadyForReview(audit) {
  if (!audit?.exists) return 'not proven: no Ready-for-Review audit report found'
  if (audit.error) return `not proven: audit report unreadable (${audit.error})`
  if (audit.value?.success) return 'proven ready by latest audit'
  return `not proven: ${audit.value?.error || 'latest audit did not pass'}`
}

function estimateLaunchReadiness({ infrastructureHealth, readyForReviewStatus, blockers }) {
  if (/healthy/.test(infrastructureHealth) && /proven ready/.test(readyForReviewStatus) && blockers.length === 0) {
    return 'high for approval delivery; publish still requires Marc approval'
  }
  if (/blocked/.test(infrastructureHealth)) {
    return 'blocked for unattended production in this environment; recovery tooling is ready for a normal runner'
  }
  if (/not proven/.test(readyForReviewStatus)) {
    return 'partial: factory tooling is improving, but approval delivery is not yet proven'
  }
  return 'partial: review current blockers before launch inventory production'
}

function collectFailureClasses({ doctor, latestAutopilotText }) {
  const classes = []
  const doctorBlockers = Array.isArray(doctor.value?.blockers) ? doctor.value.blockers : []
  for (const blocker of doctorBlockers) classes.push(`doctor:${blocker}`)

  const deferred = extractMarkdownSection(latestAutopilotText, 'Deferred Blockers')
  for (const line of deferred.split(/\r?\n/)) {
    const cleaned = line.replace(/^-\s*/, '').trim()
    if (cleaned) classes.push(`deferred:${cleaned}`)
  }

  const hardStop = extractMarkdownSection(latestAutopilotText, 'Current Hard Stop')
  if (hardStop) classes.push(`hard_stop:${hardStop.split(/\r?\n/)[0].slice(0, 160)}`)
  return unique(classes)
}

function createReport({ doctor, audit, latestAutopilotPath, latestAutopilotText, generatedAt = nowIso() }) {
  const infrastructureHealth = classifyInfrastructureHealth(doctor)
  const readyForReviewStatus = classifyReadyForReview(audit)
  const failureClasses = collectFailureClasses({ doctor, latestAutopilotText })
  const blockers = Array.isArray(doctor.value?.blockers) ? doctor.value.blockers : []
  const latestProgress = extractMarkdownSection(latestAutopilotText, 'Progress This Cycle')
  const verification = extractMarkdownSection(latestAutopilotText, 'Verification')
  const launchReadiness = estimateLaunchReadiness({ infrastructureHealth, readyForReviewStatus, blockers })

  const lines = [
    '# Endless Tales Reliability Report',
    '',
    `Generated: ${generatedAt}`,
    `Cadence: four-hour unattended reliability handoff`,
    `Publish safety: no publish endpoints invoked by this report`,
    '',
    '## New Failure Classes Discovered',
    '',
    ...(failureClasses.length ? failureClasses.map(bullet) : ['- None recorded in local artifacts']),
    '',
    '## Fixes Implemented',
    '',
    latestProgress || '- No latest production-autopilot progress section found',
    '',
    '## Tests Added Or Run',
    '',
    verification || '- No latest production-autopilot verification section found',
    '',
    '## Infrastructure Health',
    '',
    bullet(infrastructureHealth),
    doctor.value?.checks?.portListeners
      ? bullet(`Port ${doctor.value.checks.portListeners.port}: ${doctor.value.checks.portListeners.listeners.length} listener(s) reported`)
      : bullet('Port listener diagnostics unavailable'),
    '',
    '## Unattended Continuity Progress',
    '',
    bullet(`Ready-for-Review status: ${readyForReviewStatus}`),
    bullet(`Latest autopilot artifact: ${latestAutopilotPath || 'none'}`),
    bullet('Deferred-blocker mode remains non-publish and review-gated for serious unknowns'),
    '',
    '## Launch-Readiness Estimate',
    '',
    bullet(launchReadiness),
    '',
  ]

  return lines.join('\n')
}

function runSelfTest() {
  const doctor = {
    exists: true,
    value: {
      blockers: ['run_next_route_unreachable_or_unexpected', 'local_listen_eperm'],
      checks: { portListeners: { port: '3000', listeners: ['node 1 TCP *:3000'] } },
    },
    error: null,
  }
  const audit = { exists: true, value: { success: false, error: 'not ready' }, error: null }
  const markdown = [
    '## Progress This Cycle',
    '- Added safe retry.',
    '',
    '## Verification',
    '- Self-test passed.',
    '',
    '## Current Hard Stop',
    'Runner cannot bind.',
    '',
    '## Deferred Blockers',
    '- Supabase DNS blocked.',
  ].join('\n')
  const report = createReport({
    doctor,
    audit,
    latestAutopilotPath: '/tmp/report.md',
    latestAutopilotText: markdown,
    generatedAt: '2026-05-25T13:00:00.000Z',
  })

  const required = [
    'New Failure Classes Discovered',
    'Fixes Implemented',
    'Tests Added Or Run',
    'Infrastructure Health',
    'Unattended Continuity Progress',
    'Launch-Readiness Estimate',
    'doctor:local_listen_eperm',
    'Supabase DNS blocked',
    'Publish safety',
  ]
  const missing = required.filter((value) => !report.includes(value))
  if (missing.length) {
    console.error(JSON.stringify({ success: false, missing, report }, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify({ success: true, checks: required.length }, null, 2))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    runSelfTest()
    return
  }

  const latestAutopilotPath = latestMarkdownFile(args.autopilotDir)
  const doctor = readJson(args.doctorReport)
  const audit = readJson(args.readyAudit)
  const report = createReport({
    doctor,
    audit,
    latestAutopilotPath,
    latestAutopilotText: readText(latestAutopilotPath),
  })

  const output = args.output || path.join(args.reportDir, `${reportStamp()}-reliability-report.md`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, report)
  console.log(JSON.stringify({ success: true, output }, null, 2))
}

main()
