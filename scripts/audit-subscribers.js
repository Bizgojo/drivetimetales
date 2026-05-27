#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function parseArgs(argv) {
  const args = { output: 'reports/subscribers-dry-run-audit.json', markdown: 'reports/subscribers-dry-run-audit.md' }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--env-path') args.envPath = argv[++i]
    else if (arg === '--output') args.output = argv[++i]
    else if (arg === '--markdown') args.markdown = argv[++i]
  }
  return args
}

function loadEnv(envPath) {
  if (!envPath) return
  const fullPath = path.resolve(envPath)
  if (!fs.existsSync(fullPath)) throw new Error(`Env file not found: ${fullPath}`)
  const text = fs.readFileSync(fullPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    value = value.replace(/\\n+$/g, '').trim()
    if (!process.env[key]) process.env[key] = value
  }
}

function normalizePlan(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') || 'unknown'
}

function isFoundingPlan(plan) {
  return ['founding_member', 'founding', 'founder'].includes(normalizePlan(plan))
}

function isLaunchStandardPlan(plan, isFoundingMember = false) {
  const normalized = normalizePlan(plan)
  return normalized === 'standard' || isFoundingMember || isFoundingPlan(normalized)
}

function recommendedCleanupAction(plan, hasStripe, hasListeningHistory, email) {
  const normalized = normalizePlan(plan)
  const lowerEmail = String(email || '').toLowerCase()
  const internal = lowerEmail.includes('@endless-tales.com') || lowerEmail.includes('williampostlewaite') || lowerEmail.includes('test')
  if (internal || ['internal', 'admin', 'staff'].includes(normalized)) return 'mark internal/test and hide from subscriber dashboard'
  if (['free', 'test_driver', 'trial', 'test'].includes(normalized)) return 'hide from subscriber dashboard; mark internal/test if not a real customer'
  if (!normalized || normalized === 'unknown') return hasStripe || hasListeningHistory
    ? 'hide from subscriber dashboard; review before archive'
    : 'safe to archive later after auth check'
  if (hasStripe) return 'hide from subscriber dashboard; preserve Stripe-linked record'
  if (hasListeningHistory) return 'hide from subscriber dashboard; preserve listening history'
  return 'safe to delete later after Marc review'
}

async function safeSelect(client, table, select = '*') {
  const { data, error } = await client.from(table).select(select).limit(10000)
  if (error) return { data: [], error: error.message }
  return { data: data || [], error: null }
}

async function listAuthUsers(client) {
  const users = []
  let page = 1
  while (page < 100) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { users, error: error.message }
    users.push(...(data?.users || []))
    if (!data?.users || data.users.length < 1000) break
    page += 1
  }
  return { users, error: null }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
}

function writeMarkdown(report, filePath) {
  const lines = []
  lines.push('# Subscribers Dry-Run Audit')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push('')
  lines.push('No database changes were made.')
  lines.push('')
  if (report.auditIncomplete) {
    lines.push('**Audit incomplete:** one or more read-only data sources could not be queried.')
    lines.push('')
  }
  lines.push('## Source Errors')
  lines.push('')
  for (const [source, error] of Object.entries(report.sourceErrors)) lines.push(`- ${source}: ${error || 'none'}`)
  lines.push('')
  lines.push('## Count By Plan')
  lines.push('')
  for (const [plan, count] of Object.entries(report.countByPlan)) lines.push(`- ${plan}: ${count}`)
  lines.push('')
  lines.push('## Non-Standard Users')
  lines.push('')
  if (!report.nonStandardUsers.length) {
    lines.push('No non-Standard users found.')
  } else {
    lines.push('| Plan | Email | User ID | Stripe | Listening | Auth user | Recommended action |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const user of report.nonStandardUsers) {
      lines.push(`| ${user.plan} | ${user.email || '—'} | ${user.id} | ${user.hasStripeRecord ? 'yes' : 'no'} | ${user.hasListeningHistory ? 'yes' : 'no'} | ${user.authUser ? 'yes' : 'no'} | ${user.recommendedAction} |`)
    }
  }
  lines.push('')
  lines.push('## Notes')
  lines.push('')
  for (const note of report.notes) lines.push(`- ${note}`)
  ensureDir(filePath)
  fs.writeFileSync(filePath, lines.join('\n'))
}

async function main() {
  const args = parseArgs(process.argv)
  loadEnv(args.envPath)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const [usersRes, subsRes, libraryRes, authRes] = await Promise.all([
    safeSelect(supabase, 'users', '*'),
    safeSelect(supabase, 'subscriptions', '*'),
    safeSelect(supabase, 'user_library', 'user_id,progress,completed,updated_at,last_played'),
    listAuthUsers(supabase),
  ])

  const subscriptions = subsRes.data
  const subByUser = new Map()
  subscriptions.forEach((sub) => {
    const userId = sub.user_id || sub.metadata?.userId
    if (!userId) return
    subByUser.set(userId, sub)
  })

  const listeningByUser = new Map()
  libraryRes.data.forEach((row) => {
    if (!row.user_id) return
    listeningByUser.set(row.user_id, [...(listeningByUser.get(row.user_id) || []), row])
  })
  const authIds = new Set(authRes.users.map((user) => user.id))

  const countByPlan = {}
  const nonStandardUsers = []
  let standardCount = 0

  for (const user of usersRes.data) {
    const sub = subByUser.get(user.id)
    const plan = normalizePlan(user.plan || user.subscription_type || user.subscription_tier || user.subscription_plan || sub?.plan || sub?.tier || 'unknown')
    const isFoundingMember = Boolean(user.is_founding_member || sub?.is_founding_member || isFoundingPlan(plan))
    countByPlan[plan] = (countByPlan[plan] || 0) + 1
    const hasStripeRecord = Boolean(user.stripe_customer_id || user.stripe_subscription_id || sub?.stripe_customer_id || sub?.customer_id || sub?.stripe_subscription_id || sub?.subscription_id)
    const hasListeningHistory = (listeningByUser.get(user.id) || []).length > 0
    if (isLaunchStandardPlan(plan, isFoundingMember)) {
      standardCount += 1
      continue
    }
    nonStandardUsers.push({
      id: user.id,
      email: user.email || null,
      plan,
      hasStripeRecord,
      hasListeningHistory,
      authUser: authIds.has(user.id),
      recommendedAction: recommendedCleanupAction(plan, hasStripeRecord, hasListeningHistory, user.email),
    })
  }

  const report = {
    success: !usersRes.error,
    dryRun: true,
    auditIncomplete: Boolean(usersRes.error || subsRes.error || libraryRes.error || authRes.error),
    generatedAt: new Date().toISOString(),
    standardSubscriberCount: standardCount,
    countByPlan,
    nonStandardUsers,
    sourceErrors: {
      users: usersRes.error,
      subscriptions: subsRes.error,
      user_library: libraryRes.error,
      auth: authRes.error,
    },
    notes: [
      'Read-only audit. No user, auth, Stripe, or listening-history data was changed.',
      'Main launch subscriber dashboard should include Standard/Founding Standard only.',
      'Free, Test Driver, trial/test/internal, blank/unknown, and deprecated plans should remain hidden from subscriber inventory counts.',
    ],
  }

  ensureDir(args.output)
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2))
  if (args.markdown) writeMarkdown(report, args.markdown)
  console.log(JSON.stringify({
    success: report.success,
    auditIncomplete: report.auditIncomplete,
    output: args.output,
    markdown: args.markdown,
    standardSubscriberCount: report.standardSubscriberCount,
    countByPlan: report.countByPlan,
    nonStandardCount: report.nonStandardUsers.length,
    sourceErrors: report.sourceErrors,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exit(1)
})
