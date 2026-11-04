#!/usr/bin/env node
/**
 * send-trial-emails.mjs — Nov 9 trial emails (hour1 / day1 / day10)
 * Branch: feat/atlas-trial-emails-nov09 — NO MERGE without Marc explicit merge word.
 *
 * WHERE EACH EMAIL RUNS (plain statement for PR body):
 * - hour1-welcome.html (Trial + ~1h): Stripe webhook `checkout.session.completed`
 *   → Vercel Next.js route `app/api/webhook/route.ts` (same path that sends the
 *   existing trial-start email today). Fires once per verified-live activation.
 * - day1-install.html (Trial + day 1): Vercel Cron daily
 *   → `app/api/cron/trial-emails/route.ts` (same route that sends day-2/5/6 +
 *   day-1 install today). Window: users created 24–48h ago, not yet stamped.
 * - day10-billing-reminder.html (Trial + day 10): Vercel Cron daily
 *   → `app/api/cron/trial-emails/route.ts` (new block, same pattern as day-2/5/6).
 *   Window: trial_started_at + 10 days. Live-before: Nov 18.
 *   (NOT a Stripe `trial_will_end` webhook send — that existing webhook path stays
 *   as-is; day10 here is cron so cancel/convert/opt-out checks run in one place.)
 *
 * SKIP RULES (cancel / convert / opt-out — must be enforced by wiring):
 * - cancelled_at IS NOT NULL → skip all three (mirrors webhook cancel handler).
 * - subscription no longer trialing (converted to paid / past_due cancel path) → skip day10.
 * - email_opt_out = true → skip (same suppression as REACH-REMINDERS-001).
 * - is_test_account = true in production sends → skip (test accounts never mailed).
 * - already stamped (hour1_sent_at / day1_sent_at / day10_sent_at) → skip (one send ever).
 *
 * TEST-ADDRESS-ONLY SENDS:
 * - Default mode is --dry-run: renders templates, prints subjects/recipients,
 *   makes ZERO network calls, spends $0.
 * - --send-test REQUIRES --to=<address> AND the address must be a test address:
 *   it must end in @example.com OR exactly match $TEST_EMAIL. Anything else is
 *   refused with exit 1. Real Resend send only happens with RESEND_API_KEY set;
 *   otherwise the script logs what WOULD send (still $0, still zero prod writes).
 *
 * Usage:
 *   node retention-nov09/send-trial-emails.mjs --dry-run
 *   TEST_EMAIL=you@example.com RESEND_API_KEY=... node retention-nov09/send-trial-emails.mjs --send-test --to=you@example.com
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEMPLATES = [
  { key: 'hour1', file: 'hour1-welcome.html', subject: 'Your free trial has started — press play', trigger: 'stripe-webhook:checkout.session.completed → app/api/webhook/route.ts (Vercel)' },
  { key: 'day1', file: 'day1-install.html', subject: 'One tap to your stories — add us to your home screen', trigger: 'vercel-cron:daily → app/api/cron/trial-emails/route.ts, 24–48h window' },
  { key: 'day10', file: 'day10-billing-reminder.html', subject: 'Your trial ends soon — here’s what happens next', trigger: 'vercel-cron:daily → app/api/cron/trial-emails/route.ts, trial_day=10' },
]

function parseArgs(argv) {
  const out = { dryRun: true, sendTest: false, to: null }
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') { out.dryRun = true; out.sendTest = false }
    else if (a === '--send-test') { out.dryRun = false; out.sendTest = true }
    else if (a.startsWith('--to=')) out.to = a.slice(5)
  }
  return out
}

function isTestAddress(addr) {
  if (!addr || !addr.includes('@')) return false
  const testEnv = (process.env.TEST_EMAIL || '').trim().toLowerCase()
  const low = addr.trim().toLowerCase()
  if (testEnv && low === testEnv) return true
  return low.endsWith('@example.com')
}

function render(file) {
  const raw = fs.readFileSync(path.join(__dirname, file), 'utf8')
  return raw.replaceAll('{{unsubscribe_url}}', 'https://app.endless-tales.com/email/unsubscribe?token=TEST')
}

async function main() {
  const args = parseArgs(process.argv)
  const rendered = TEMPLATES.map(t => {
    const html = render(t.file)
    return { ...t, bytes: Buffer.byteLength(html, 'utf8'), hasUnsub: html.includes('/email/unsubscribe'), hasCta: html.includes('https://app.endless-tales.com/home') }
  })

  console.log('[send-trial-emails] mode=' + (args.sendTest ? 'send-test' : 'dry-run'))
  for (const r of rendered) {
    console.log(`- ${r.key}: ${r.file} | subject="${r.subject}" | ${r.bytes} bytes | unsub=${r.hasUnsub ? 'ok' : 'MISSING'} | cta=${r.hasCta ? 'ok' : 'MISSING'} | trigger=${r.trigger}`)
  }
  console.log('[send-trial-emails] skip-rules: cancelled_at set → skip; converted/off-trial → skip day10; opt-out → skip; test accounts → skip; already-stamped → skip (one send ever)')

  if (!args.sendTest) {
    console.log('[send-trial-emails] DRY-RUN complete: 3/3 rendered, 0 network calls, $0 spend, 0 production writes.')
    return
  }

  // --send-test path: test-address-only enforcement, hard refuse otherwise.
  if (!isTestAddress(args.to)) {
    console.error(`[send-trial-emails] REFUSED: --to must be a test address (@example.com or $TEST_EMAIL). Got: ${args.to || '(none)'}`)
    process.exit(1)
  }
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) {
    console.log(`[send-trial-emails] NO RESEND_API_KEY — would send 3 test emails to ${args.to}, sent 0. $0 spend.`)
    console.log('[send-trial-emails] To actually deliver: set RESEND_API_KEY and re-run with --send-test --to=<test-address>.')
    return
  }
  // Live Resend send to test address only.
  const { Resend } = await import('resend').catch(() => ({ Resend: null }))
  if (!Resend) {
    console.log('[send-trial-emails] resend package not installed — would send 3 test emails, sent 0. $0 spend.')
    return
  }
  const resend = new Resend(apiKey)
  for (const r of rendered) {
    const html = render(r.file)
    await resend.emails.send({
      from: 'Endless Tales <hello@endless-tales.com>',
      to: args.to,
      subject: `[TEST] ${r.subject}`,
      html,
    })
    console.log(`[send-trial-emails] sent TEST ${r.key} → ${args.to}`)
  }
}

main().catch(e => { console.error('[send-trial-emails] FATAL', e.message); process.exit(1) })
