import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    id: 'blocker-pricing',
    description: 'Pricing decision (monthly / annual rates)',
    department: 'susan',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-trial',
    description: 'Trial length decision',
    department: 'susan',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-belle-b',
    description: 'Canonical Belle B voice ID from ElevenLabs',
    department: 'hal',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-founding-member',
    description: 'Founding Member details and offer design',
    department: 'susan',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-marketing-budget',
    description: 'Marketing budget authorization',
    department: 'susan',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-genre-priorities',
    description: 'Genre priorities for launch catalog',
    department: 'hal',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-stress-test-poller',
    description: 'Stress-test poller: keep or remove decision',
    department: 'atlas',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
  },
  {
    id: 'blocker-stripe-annual',
    description: 'Authorize Stripe Annual price fix (live billing error)',
    department: 'atlas',
    createdAt: NOW,
    done: false,
    resolvedAt: null,
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
        reports: [],
        source: 'seed',
      })
    }

    // Parse rows from org_state table (key/value pairs)
    const rows = (data || []) as Array<{ key: string; value: unknown }>
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    // Merge with seed as default (table may have partial data)
    return json({
      agents: (byKey['agents'] as typeof SEED_AGENTS) ?? SEED_AGENTS,
      missions: (byKey['missions'] as typeof SEED_MISSIONS) ?? SEED_MISSIONS,
      blockers: (byKey['blockers'] as typeof SEED_BLOCKERS) ?? SEED_BLOCKERS,
      readiness: (byKey['readiness'] as typeof SEED_READINESS) ?? SEED_READINESS,
      reports: (byKey['reports'] as unknown[]) ?? [],
      source: rows.length > 0 ? 'supabase' : 'seed',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load org status'
    console.error('[org-status] GET failed:', err)
    return json({ success: false, error: message }, 500)
  }
}
