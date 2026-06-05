import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const {
    data: { user },
  } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  return null
}

// ─── Orion Reports ───────────────────────────────────────────────────────────

type OrionReport = {
  id: string
  type: 'morning' | 'evening' | 'weekly'
  content: string
  timestamp: string
}

function loadOrionReports(): OrionReport[] {
  const dir = '/Users/williampostlewaite/.openclaw/workspace-orion/reports'
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse()
    return files.slice(0, 10).map((f, i) => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8')
      const type: OrionReport['type'] = f.includes('morning') ? 'morning' : f.includes('evening') ? 'evening' : 'weekly'
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/)
      const timestamp = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
      return { id: `report-${i}`, type, content, timestamp }
    })
  } catch {
    return []
  }
}

// ─── Seed data (used when Supabase table doesn't exist yet) ──────────────────

const NOW = new Date().toISOString()
const TODAY = new Date().toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const SEED_AGENTS = {
  hal: {
    status: 'working',
    currentTask:
      'HAL-001: Reliability self-assessment (D2) — counting first-pass acceptance rate, verifying ElevenLabs credits',
    percentComplete: 15,
    waitingOn: 'Canonical Belle B voice ID from Marc',
    lastActivity: NOW,
    eta: '3–4 weeks to 25 stories',
    whyItMatters:
      'Content pipeline must demonstrate 25 reliable stories before public launch.',
    lastReport: null,
  },
  atlas: {
    status: 'working',
    currentTask:
      'ATL-001: Domain verification, /subscribe fix, Stripe billing error, platform stability',
    percentComplete: 25,
    waitingOn: 'Marc: authorize Stripe Annual price fix (live billing error)',
    lastActivity: NOW,
    eta: 'D1-D3 by Jun 9',
    whyItMatters:
      'Platform must be stable and billing must work before any subscriber acquisition.',
    lastReport: null,
  },
  maya: {
    status: 'working',
    currentTask:
      'MAYA-001 D1 complete: 2 launch-critical issues found — /subscribe broken, /player unguarded. Routing to Atlas.',
    percentComplete: 30,
    waitingOn: 'Human tester for mobile testing',
    lastActivity: NOW,
    eta: '7–10 days total',
    whyItMatters:
      'Subscriber experience must be validated end-to-end before launch.',
    lastReport: null,
  },
  susan: {
    status: 'working',
    currentTask:
      'SUS-001: Waitlist audit (D6), marketing intelligence, Airtable campaign orientation',
    percentComplete: 20,
    waitingOn: 'Marc: pricing, budget, Founding Member details',
    lastActivity: NOW,
    eta: '2–3 weeks for full GTM plan',
    whyItMatters:
      'GTM plan and waitlist strategy required to convert early interest into paying subscribers.',
    lastReport: null,
  },
  vega: {
    status: 'waiting',
    currentTask:
      'VEGA-001 D1 done: Audio quality standard drafted, waiting for Orion approval. Catalog audit of 14 stories ready to begin.',
    percentComplete: 15,
    waitingOn: 'Orion D1 approval · Marc: canonical Belle B voice ID',
    lastActivity: NOW,
    eta: '5–7 days after D1 approved',
    whyItMatters:
      'Audio quality gate must be established before any story is cleared for subscriber access.',
    lastReport: null,
  },
}

const SEED_MISSIONS = [
  {
    id: 'ATL-001',
    title: 'Platform stability, /subscribe fix, Stripe billing error, domain verification',
    agentId: 'atlas',
    status: 'active',
    priority: 'P1',
    percentComplete: 25,
    waitingOn: 'Marc: authorize Stripe Annual price fix',
    lastActivity: TODAY,
    eta: 'D1-D3 by Jun 9',
    notes: '',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'ATL-CC2',
    title: 'Command Center v2 — live data layer',
    agentId: 'atlas',
    status: 'complete',
    priority: 'P1',
    percentComplete: 100,
    waitingOn: '',
    lastActivity: TODAY,
    eta: 'Done',
    notes: 'API route + localStorage fallback deployed.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'HAL-001',
    title: 'Reliability self-assessment: 25 story pipeline, ElevenLabs credits, first-pass rate',
    agentId: 'hal',
    status: 'active',
    priority: 'P1',
    percentComplete: 15,
    waitingOn: 'Canonical Belle B voice ID from Marc',
    lastActivity: TODAY,
    eta: '3–4 weeks to 25 stories',
    notes: '',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'VEGA-001',
    title: 'Audio quality standard + catalog audit of 14 stories',
    agentId: 'vega',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 15,
    waitingOn: 'Orion D1 approval · Marc: canonical Belle B voice ID',
    lastActivity: TODAY,
    eta: '5–7 days after D1 approved',
    notes: '',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'MAYA-001',
    title: 'Subscriber experience audit: /subscribe, /player, mobile QA',
    agentId: 'maya',
    status: 'active',
    priority: 'P1',
    percentComplete: 30,
    waitingOn: 'Human tester for mobile testing',
    lastActivity: TODAY,
    eta: '7–10 days total',
    notes: 'D1 complete: 2 critical issues found, routed to Atlas.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'SUS-001',
    title: 'GTM plan: waitlist audit, marketing intelligence, Founding Member strategy',
    agentId: 'susan',
    status: 'active',
    priority: 'P1',
    percentComplete: 20,
    waitingOn: 'Marc: pricing, budget, Founding Member details',
    lastActivity: TODAY,
    eta: '2–3 weeks for full GTM plan',
    notes: '',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const SEED_BLOCKERS = [
  {
    id: 'b1',
    description: 'Has the product launched? What is the current subscriber count?',
    title: 'Has the product launched?',
    department: 'orion',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'Yes — live with paying subscribers',
      'No — not launched yet',
      'Soft launch — some users, not fully public',
    ],
    detail: {
      what: 'We do not know if Endless Tales has publicly launched or how many subscribers exist.',
      why: 'Every launch scenario, department priority, and readiness gate depends on this answer. Orion cannot produce an accurate launch timeline without it.',
      recommendation: 'Confirm launch status before Orion produces any readiness estimate.',
      followUpOwner: 'orion',
      nextActionTemplate: 'Orion updates all department priorities based on launch status: {answer}',
    },
    chatGptPrompt: 'I run a subscription audio storytelling app called Endless Tales. I need to decide how to categorize my current launch status for my COO. Options: (1) Live with paying subscribers, (2) Not launched yet, (3) Soft launch. What factors should I consider?',
  },
  {
    id: 'b2',
    description: 'Canonical Belle B voice ID — three IDs in contention across codebase, locked spec, and DB migration.',
    title: 'Which Belle B voice ID is canonical?',
    department: 'hal',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'GMhgX8fCR9GUtd3kmlKC — current production code (lib/voiceConstants.ts)',
      'EXAVITQu4vr4xnSDxMaL — locked ASC3 Production Standard (Mar 22)',
      'KWDD3Wyq30ZF5NEL01EJ — DB migration + HAL Briefing (Mar 23)',
    ],
    detail: {
      what: 'Three different ElevenLabs voice IDs for Belle B appear in three different official documents. All three claim to be correct.',
      why: 'Every story produced with the wrong voice must be regenerated. Vega cannot audit the catalog. Hal cannot produce new stories. This blocks Gates A and B.',
      recommendation: 'Use GMhgX8fCR9GUtd3kmlKC — it is what production code uses today and what listeners are already hearing.',
      followUpOwner: 'hal',
      nextActionTemplate: 'Hal locks Belle B voice ID as {answer}. Vega proceeds with catalog audit. ASC3 spec updated.',
    },
    chatGptPrompt: 'I have a production audio app. Our narrator voice "Belle B" has three different ElevenLabs voice IDs across our codebase (used in production code), a locked production spec (written March 22), and a DB migration (written March 23). The production code ID is what listeners have been hearing. Which should I designate as canonical?',
  },
  {
    id: 'b3',
    description: 'Stripe Test Driver Annual price ID is identical to Monthly — live billing error.',
    title: 'Authorize Stripe Annual price fix',
    department: 'atlas',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'confirm',
    choiceOptions: [
      'Yes — authorize Atlas to create correct Annual price in Stripe live dashboard',
    ],
    detail: {
      what: 'The Test Driver Monthly and Annual plans share the same Stripe price ID in live production. Annual subscribers are being charged the monthly rate.',
      why: 'This is an active billing error. Every Annual subscriber since launch has been charged the wrong amount. Stripe does not auto-correct past charges.',
      recommendation: 'Authorize immediately. Marc creates a new Annual price in the Stripe live dashboard, then provides the new price ID to Atlas.',
      followUpOwner: 'atlas',
      nextActionTemplate: 'Marc creates Annual price in Stripe live dashboard. Provides new price ID to Atlas. Atlas updates .env.local and redeploys.',
    },
    chatGptPrompt: null,
  },
  {
    id: 'b4',
    description: 'Launch pricing: $7.99/month (current waitlist code default) or $2.99/month (March checklist revision)?',
    title: 'What is the launch price?',
    department: 'atlas',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      '$7.99/month — current waitlist code default',
      '$2.99/month — March checklist revision',
      'Different price — I will specify in the text field',
    ],
    detail: {
      what: 'The waitlist locked_price field defaults to $7.99 in code, but a March launch checklist task required updating it to $2.99. It is unclear which is correct.',
      why: 'This price appears in the waitlist launch email, all acquisition messaging, CAC calculations, and break-even projections. All of those are wrong until this is set.',
      recommendation: 'Confirm with Susan before deciding — lower price increases conversion but reduces LTV. Current break-even is ~360 subscribers.',
      followUpOwner: 'atlas',
      nextActionTemplate: 'Atlas updates locked_price in waitlist config to {answer}. Susan updates all acquisition messaging.',
    },
    chatGptPrompt: 'I run a subscription audio storytelling app launching soon. My current waitlist code defaults to $7.99/month, but a planning document from March said to change it to $2.99/month. Subscribers get a 14-day free trial. My break-even is about 360 subscribers. What factors should I consider when choosing a launch price?',
  },
  {
    id: 'b5',
    description: 'stress-test-poller cron fires every 5 minutes in production — intentional or dev artifact?',
    title: 'Kill or keep stress-test-poller?',
    department: 'atlas',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'Kill it — it is a dev artifact',
      'Keep it — it is intentional',
    ],
    detail: {
      what: 'A cron job named stress-test-poller is running in production every 5 minutes. The name suggests it was a development or testing artifact.',
      why: 'If it is a dev artifact, it is burning API quota and adding noise to production logs. If it is intentional, Atlas needs to know what it monitors.',
      recommendation: 'Kill it. The name is not consistent with a production monitoring job. If monitoring is needed, Atlas will set up a proper health check.',
      followUpOwner: 'atlas',
      nextActionTemplate: 'Atlas {answer} the stress-test-poller cron job.',
    },
    chatGptPrompt: null,
  },
  {
    id: 'b6',
    description: 'Confirm trial: 14 days, no card required. Code says 14 days. Docs said 7. Card requirement unclear.',
    title: 'Confirm trial terms',
    department: 'atlas',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'Confirmed — 14 days, no card required',
      '14 days, card required upfront',
      '7 days, no card required',
      '7 days, card required upfront',
    ],
    detail: {
      what: 'The codebase has trialDays: 14. Some documents said 7 days. The card-required setting has not been confirmed.',
      why: 'Trial terms affect signup conversion rate, Stripe configuration, and all marketing copy. Wrong terms in marketing = broken user expectation on checkout.',
      recommendation: 'Confirm 14 days, no card. Code is already set correctly. Just needs Marc sign-off so Atlas can close this gate item.',
      followUpOwner: 'atlas',
      nextActionTemplate: 'Atlas confirms trial config matches: {answer}. Gate 2 partial item closed.',
    },
    chatGptPrompt: null,
  },
  {
    id: 'b7',
    description: 'Marketing budget for paid channels: TikTok, Meta, influencers, QR printing.',
    title: 'Marketing budget?',
    department: 'susan',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'text',
    detail: {
      what: 'No marketing budget has been defined or approved for paid acquisition channels at launch.',
      why: 'Susan cannot plan or enter any paid campaign into Airtable without a budget. Influencer contracts require a commitment. QR printing requires PO authorization. No budget = no paid GTM.',
      recommendation: 'Minimum $5,000 to activate influencer outreach + at least one paid social channel. Influencer campaign alone is budgeted at $9,500 based on prior planning.',
      followUpOwner: 'susan',
      nextActionTemplate: 'Susan enters approved budget of {answer} into Airtable. Activates influencer outreach and paid social planning.',
    },
    chatGptPrompt: 'I am launching a subscription audio storytelling app targeting truck drivers and commuters. My break-even is 360 subscribers at $7.99/month. I have an influencer list of 12-15 creators in the trucker/commuter space. My prior planning budgeted $9,500 for influencers and additional budget for QR campaigns at truck stops. What marketing budget should I allocate for launch?',
  },
  {
    id: 'b8',
    description: 'Founding Member price and offer details — currently a Stripe product exists but offer is undefined.',
    title: 'Founding Member offer details',
    department: 'susan',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'text',
    detail: {
      what: 'A Founding Member Stripe product exists with a price ID and a cap of 500 members. The actual price, perks, and what distinguishes it from Standard are undefined.',
      why: 'Susan cannot write GTM messaging for Founding Member without knowing what it offers. It may be the primary acquisition lever at launch.',
      recommendation: 'Define: price point (suggested: $4.99–$5.99/month locked for life), perks (e.g. lifetime price lock, early access to new series, name in credits), and the cap (500 is already set in code).',
      followUpOwner: 'susan',
      nextActionTemplate: 'Susan updates Founding Member GTM messaging and Airtable campaign with: {answer}',
    },
    chatGptPrompt: 'I am launching a subscription audio app. I want to offer a "Founding Member" tier capped at 500 people. What price and perks should I offer to make it feel exclusive and drive urgency at launch?',
  },
  {
    id: 'b9',
    description: 'Genre priorities for next 6+ stories — Drama, Mystery, Comedy are underrepresented.',
    title: 'Genre priorities for next stories',
    department: 'hal',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'Drama + Mystery first (close the gaps)',
      'More Adventure + Thriller (play to catalog strength)',
      'Comedy + Drama (broaden appeal)',
      'All genres equal — Hal decides',
    ],
    detail: {
      what: 'The current catalog has 5 Adventure, 3 Historical, 3 Thriller, 1 Comedy, 1 Drama, 1 Mystery. Gate B requires variety. Drama and Mystery have only one story each.',
      why: 'A subscriber who finishes their preferred genre will churn. Catalog variety is a retention driver. Gate B will not clear without genre balance.',
      recommendation: 'Drama + Mystery first. One story each closes the gap fast. Then Hal returns to series continuation.',
      followUpOwner: 'hal',
      nextActionTemplate: 'Hal queues next story productions as: {answer}',
    },
    chatGptPrompt: null,
  },
  {
    id: 'b10',
    description: 'QR physical campaign — go/no-go? ~$9,500 print budget, 7,000 assets, 220+ truck stop locations.',
    title: 'QR campaign: go or no-go?',
    department: 'susan',
    createdAt: new Date().toISOString(),
    done: false,
    resolvedAt: null,
    resolution: null,
    answer: null,
    answeredAt: null,
    nextAction: null,
    inputType: 'choice',
    choiceOptions: [
      'Go — authorize ~$9,500 print budget',
      'No-go — skip physical campaign entirely',
      'Defer — revisit after digital launch results',
    ],
    detail: {
      what: 'A physical QR code campaign was planned for truck stop locations (220+ sites, 7,000 printed assets). No infrastructure has been built and no contracts signed.',
      why: 'This is the highest-cost, longest-lead-time item in the GTM plan. If approved, Susan needs 6–8 weeks minimum for design, print, and distribution coordination.',
      recommendation: 'Defer until digital launch results are in. Validate digital CAC first; if truckers convert well online, QR amplifies a proven channel. Do not commit $9,500 before knowing if the audience converts.',
      followUpOwner: 'susan',
      nextActionTemplate: 'Susan {answer} the QR campaign. Updates Airtable accordingly.',
    },
    chatGptPrompt: 'I am launching a subscription audio app targeting truck drivers. I planned a physical QR code campaign for 220+ truck stops at ~$9,500 cost with 7,000 printed materials. I have not launched digitally yet. Should I pursue the physical campaign at launch or validate digital channels first?',
  },
]

const SEED_READINESS = {
  score: 2,
  gatesGreen: 1,
  gatesYellow: 2,
  gatesRed: 5,
  bestCaseDate: 'Jul 4, 2026',
  mostLikelyDate: 'Jul 19, 2026',
  updatedAt: NOW,
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    // Try to read from the org_state Supabase table
    const { data, error } = await supabase
      .from('org_state')
      .select('key, value')

    if (error) {
      // Table doesn't exist yet (or another DB error) — return seed data
      console.info('[org-status] org_state table unavailable, returning seed data:', error.message)
      return json({
        agents: SEED_AGENTS,
        missions: SEED_MISSIONS,
        blockers: SEED_BLOCKERS,
        readiness: SEED_READINESS,
        reports: loadOrionReports(),
        source: 'seed',
      })
    }

    // Parse rows from org_state table (key/value pairs)
    const rows = (data || []) as Array<{ key: string; value: unknown }>
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    // Load Orion reports from filesystem
    const reports = loadOrionReports()

    // Merge with seed as default (table may have partial data)
    return json({
      agents: (byKey['agents'] as typeof SEED_AGENTS) ?? SEED_AGENTS,
      missions: (byKey['missions'] as typeof SEED_MISSIONS) ?? SEED_MISSIONS,
      blockers: (byKey['blockers'] as typeof SEED_BLOCKERS) ?? SEED_BLOCKERS,
      readiness: (byKey['readiness'] as typeof SEED_READINESS) ?? SEED_READINESS,
      reports,
      source: rows.length > 0 ? 'supabase' : 'seed',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load org status'
    console.error('[org-status] GET failed:', err)
    return json({ success: false, error: message }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin()
    if (unauthorized) return unauthorized

    const body = await req.json().catch(() => ({}))
    const blockers = body.blockers

    if (!Array.isArray(blockers)) {
      return json({ success: false, error: 'blockers must be an array' }, 400)
    }

    const { error } = await supabase
      .from('org_state')
      .upsert({ key: 'blockers', value: JSON.stringify(blockers) }, { onConflict: 'key' })

    if (error) {
      console.error('[org-status] PATCH upsert failed:', error.message)
      return json({ success: false, error: error.message }, 500)
    }

    return json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to persist blockers'
    console.error('[org-status] PATCH failed:', err)
    return json({ success: false, error: message }, 500)
  }
}
