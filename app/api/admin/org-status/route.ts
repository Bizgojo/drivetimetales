import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'
import type { AgentId, AgentState, Mission, MarcBlocker, LaunchReadiness } from '@/lib/config/command-center'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AgentsState = Record<AgentId, AgentState>

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

// ─── Supabase Storage persistence ────────────────────────────────────────────

async function readOrgState(): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase.storage.from('org-state').download('state.json')
    if (error || !data) return {}
    const text = await data.text()
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeOrgState(patch: Record<string, unknown>): Promise<void> {
  const current = await readOrgState()
  const next = { ...current, ...patch }
  const blob = new Blob([JSON.stringify(next)], { type: 'application/json' })

  const { error } = await supabase.storage
    .from('org-state')
    .upload('state.json', blob, { upsert: true })

  if (error?.message?.includes('Bucket not found') || error?.message?.toLowerCase().includes('bucket')) {
    // Create bucket and retry
    await supabase.storage.createBucket('org-state', { public: false })
    await supabase.storage
      .from('org-state')
      .upload('state.json', blob, { upsert: true })
  }
}

// ─── Orion Reports ───────────────────────────────────────────────────────────

type OrionReport = {
  id: string
  type: 'morning' | 'evening' | 'weekly'
  content: string
  timestamp: string
}

async function loadOrionReports(): Promise<OrionReport[]> {
  // Try Supabase Storage first (works in production)
  try {
    const { data, error } = await supabase.storage.from('org-state').download('reports.json')
    if (!error && data) {
      const text = await data.text()
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // Fallback to local filesystem
  }

  // Fallback: local filesystem (dev only)
  try {
    const dir = '/Users/williampostlewaite/.openclaw/workspace-orion/reports'
    if (!fs.existsSync(dir)) return []
    
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

// ─── Seed data ────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString()
const TODAY = new Date().toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const SEED_AGENTS: AgentsState = {
  hal: {
    status: 'working',
    currentTask: 'HAL-001: Reliability self-assessment (D2) — counting first-pass acceptance rate and verifying ElevenLabs credit balance. 97 stories discovered in review pipeline.',
    percentComplete: 15,
    waitingOn: 'Canonical Belle B voice ID from Marc. Content Approval console investigation results from Atlas.',
    lastActivity: TODAY,
    eta: '3–4 weeks to 25 published stories (Gate B target)',
    whyItMatters: 'The catalog is at 4.6 hours published. Gate B requires 8 hours. 97 stories are in the pipeline but none appear in the Content Approval UI — Atlas is investigating. Without Hal clearance, no new stories reach subscribers.',
    lastReport: {
      text: 'HAL-001 D2 in progress. 14 published stories confirmed. 97 stories in ready_for_review/repair_queue states discovered — none visible in Content Approval UI due to final_mix.mp3 path requirement. Belle B voice ID unresolved — cannot confirm intro/outro voice on any published story. Production standard field = "unknown" in DB for all 14 published stories.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  atlas: {
    status: 'working',
    currentTask: 'ATL-001: Domain verification + platform bug fixes. ATL-CC2: Command Center corrections in progress (decision persistence, agent state, mission registry).',
    percentComplete: 35,
    waitingOn: 'Marc: authorize Stripe Test Driver Annual price fix. Marc: confirm/deprecate legacy Stripe price IDs.',
    lastActivity: TODAY,
    eta: 'Platform bugs D1–D3 by Jun 7 · Stripe fix after Marc authorization · Full mission Jun 14',
    whyItMatters: 'Atlas owns every system that touches subscriber money and platform access. A confirmed billing error is live in Stripe right now — Test Driver Annual subscribers are being charged at the wrong rate. The Content Approval UI is broken — Hal cannot get stories to Marc for review. The /subscribe re-subscribe flow is broken — churned subscribers cannot return.',
    lastReport: {
      text: 'ATL platform report 2026-06-05: Production Console root cause identified — stories require audio_url containing /final_mix.mp3 path AND full packaging fields to appear in Ready For Review lane. Stripe Test Driver Annual/Monthly billing error confirmed live. Decision persistence fixed (commit bfc69a7b). Message Orion panel fixed — now routes to Telegram (commit 7fe0d02b). org_state table does not exist — switching to Supabase Storage.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  maya: {
    status: 'working',
    currentTask: 'MAYA-001 D1 complete (desktop). Two launch-critical bugs found and escalated to Atlas: /subscribe broken for expired users, /player route unguarded. Mobile testing blocked — requires physical device.',
    percentComplete: 30,
    waitingOn: 'Atlas: fix /subscribe re-subscribe flow. Atlas: assess /player subscription gate. Human tester for iOS/Android mobile testing.',
    lastActivity: TODAY,
    eta: 'D1 desktop: complete · D1 mobile: blocked · D2 onboarding audit: 3–5 days · Full mission 7–10 days',
    whyItMatters: 'Maya found that every subscriber who churns hits a dead end — the /subscribe CTA sends them to /signup with no path back to their billing portal. This is silent revenue loss happening right now. The /player route is potentially accessible without a subscription. These are Gate 1 failures.',
    lastReport: {
      text: 'MAYA D1 desktop walkthrough complete 2026-06-04. LAUNCH-CRITICAL 1: /subscribe re-subscribe flow broken — expired subscribers routed to /signup dead end, no Stripe Customer Portal path. LAUNCH-CRITICAL 2: /player in PUBLIC_PREFIXES at middleware — no subscription gate. Stripe post-checkout redirect not confirmed. Time-to-first-play (new visitor): 4–7 min. Top retention risk: no re-subscribe path for churned users.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  susan: {
    status: 'working',
    currentTask: 'SUS-001: GTM planning updated with confirmed pricing. Founding Member campaign entered in Airtable (rec6HTGp3cVFa6OUt, status: Recommended). Waitlist count still unknown.',
    percentComplete: 30,
    waitingOn: 'Marc: marketing budget for Standard tier paid acquisition. Marc: approve Founding Member Airtable campaign. Atlas: fix X/Twitter 401 and social generator domain. Waitlist count from /admin/waitlist.',
    lastActivity: TODAY,
    eta: 'FM campaign brief: complete · Standard paid plan: blocked on budget decision · Full GTM plan: 2–3 weeks',
    whyItMatters: 'Pricing is now confirmed. Susan has a campaign structure ready but cannot execute paid acquisition without a budget decision from Marc. The Founding Member window creates launch urgency — 500 spots at $2.99/month is the primary conversion lever. Every day without an active organic campaign is a missed waitlist-to-subscriber conversion.',
    lastReport: {
      text: 'SUS-001 GTM update 2026-06-05: Pricing confirmed — FM $2.99/mo, Standard $7.99/mo. CAC targets set: operating target $32 (3:1 ratio at $7.99/mo). FM campaign entered in Airtable — organic only, 500 cap, lifetime lock messaging. Standard annual price ID missing from .env.local — Atlas flagged. X/Twitter 401 still unresolved. Social generator posts to drivetimetales.com — wrong domain on every organic post.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  vega: {
    status: 'working',
    currentTask: 'VEGA-001 D2 catalog audit complete. Result: 14 UNKNOWN — cannot PASS or FAIL. All 14 audio files accessible. Production standard not tracked in DB. Belle B intro/outro voice unverifiable.',
    percentComplete: 20,
    waitingOn: 'Marc: canonical Belle B voice ID (3 candidates). Atlas: fix production_standard field tracking in story generation pipeline. Orion: approve path forward given 14 UNKNOWN results.',
    lastActivity: TODAY,
    eta: 'D2 audit findings delivered · D3 (deeper audio metadata) blocked until Belle B resolved · Full mission 7–10 days',
    whyItMatters: 'Vega cannot PASS any story for Gate 4 until the production_standard is tracked in the DB and the Belle B voice ID is confirmed. All 14 published stories are in an UNKNOWN audio quality state. Launching with UNKNOWN audio quality means potentially shipping stories with wrong voice settings, wrong loudness, or wrong structure — and not knowing it.',
    lastReport: {
      text: 'VEGA D2 catalog audit complete 2026-06-05. 14 stories audited, 14 UNKNOWN. Root causes: production_standard="unknown" in DB (13/14 asc_version=null), Belle B intro/outro voice ID not stored in any DB table, no production_jobs records for published stories. All 14 audio_urls return HTTP 200. Estimated total duration: 4.6 hours. Voice IDs in content: Elliott Crane (Harbor series), Ray Dolan (Exit 19 + Lost Mailbag), Finn Calloway (Meridian + Dead in Water), Iris Calloway (Rainy Morning). EXAVITQu4vr4xnSDxMaL found in narrator_audio table as "Sarah Mitchell" — data integrity issue.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  // Required by AgentId type but not shown in CC grid
  codex: {
    status: 'idle',
    currentTask: '',
    percentComplete: null,
    waitingOn: '',
    lastActivity: TODAY,
    eta: '',
    whyItMatters: '',
    lastReport: null,
  },
  orion: {
    status: 'working',
    currentTask: 'Coordinating all departments. Monitoring launch readiness. Resolving blockers.',
    percentComplete: null,
    waitingOn: '',
    lastActivity: TODAY,
    eta: '',
    whyItMatters: 'Orion ensures the right work is done by the right department at the right time.',
    lastReport: null,
  },
}

const SEED_MISSIONS: Mission[] = [
  // ── HAL ──────────────────────────────────────────────────────────────────
  {
    id: 'HAL-001',
    title: 'Reliability self-assessment D2: 25 story pipeline, ElevenLabs credits, first-pass rate',
    agentId: 'hal',
    status: 'active',
    priority: 'P1',
    percentComplete: 15,
    waitingOn: 'Canonical Belle B voice ID from Marc',
    lastActivity: TODAY,
    eta: '3–4 weeks to 25 stories',
    notes: 'Current task.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'HAL-002',
    title: 'Content approval queue resolution — fix Production Console so 74 hidden stories appear',
    agentId: 'hal',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Atlas: fix audio_url/final_mix.mp3 path requirement in Production Console',
    lastActivity: TODAY,
    eta: 'Unblocked once Atlas deploys Production Console fix',
    notes: '74 stories in ready_for_review / repair_queue states are invisible in Production Console.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'HAL-003',
    title: 'Catalog variety expansion — 3.4 additional hours needed for Gate B',
    agentId: 'hal',
    status: 'waiting',
    priority: 'P2',
    percentComplete: 0,
    waitingOn: 'Pipeline review · Marc: genre priority decision',
    lastActivity: TODAY,
    eta: '3–4 weeks',
    notes: 'Current catalog: 4.6h. Gate B requires 8h. Drama and Mystery underrepresented (1 each).',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'HAL-004',
    title: 'Story quality review — first-pass acceptance audit of 97 pipeline stories',
    agentId: 'hal',
    status: 'waiting',
    priority: 'P2',
    percentComplete: 0,
    waitingOn: 'HAL-002 Production Console fix',
    lastActivity: TODAY,
    eta: 'After HAL-002 unblocked',
    notes: '97 stories in pipeline awaiting first-pass acceptance review.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  // ── ATLAS ─────────────────────────────────────────────────────────────────
  {
    id: 'ATL-001',
    title: 'Domain fix (www.endless-tales.com → 404) + platform stability',
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
    title: 'Command Center v2 corrections (R2 deferred section, R3 report button, R4 backlog)',
    agentId: 'atlas',
    status: 'active',
    priority: 'P1',
    percentComplete: 80,
    waitingOn: '',
    lastActivity: TODAY,
    eta: 'Jun 5',
    notes: 'In progress — three correction missions assigned by Orion.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'ATL-002',
    title: '/subscribe re-subscribe flow fix — churned subscribers hit dead end',
    agentId: 'atlas',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'ATL-001 D1 complete',
    lastActivity: TODAY,
    eta: 'After ATL-001 D1',
    notes: 'Expired subscribers are routed to /signup with no Stripe Customer Portal path. Silent revenue loss.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'ATL-003',
    title: '/player subscription gate audit — route may be publicly accessible',
    agentId: 'atlas',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'ATL-001 D1 complete',
    lastActivity: TODAY,
    eta: 'After ATL-001 D1',
    notes: '/player is in PUBLIC_PREFIXES in middleware — potential gate bypass.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'ATL-004',
    title: 'Stripe Test Driver Annual price ID fix — live billing error',
    agentId: 'atlas',
    status: 'blocked',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: authorize creation of correct Annual price ID in Stripe live dashboard',
    lastActivity: TODAY,
    eta: 'Same day once authorized',
    notes: 'Annual subscribers charged at monthly rate. Active billing error.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'ATL-005',
    title: 'Legacy cron job audit and disable (stress-test-poller)',
    agentId: 'atlas',
    status: 'waiting',
    priority: 'P3',
    percentComplete: 0,
    waitingOn: 'Marc: kill or keep decision on stress-test-poller',
    lastActivity: TODAY,
    eta: 'After Marc decision',
    notes: 'stress-test-poller fires every 5 min in production. Dev artifact or intentional?',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  // ── MAYA ──────────────────────────────────────────────────────────────────
  {
    id: 'MAYA-001',
    title: 'UX audit D1 desktop — /subscribe, /player, key user flows',
    agentId: 'maya',
    status: 'complete',
    priority: 'P1',
    percentComplete: 100,
    waitingOn: '',
    lastActivity: TODAY,
    eta: 'Done',
    notes: 'D1 complete. 2 launch-critical bugs found: /subscribe dead end + /player gate bypass. Routed to Atlas.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'MAYA-002',
    title: 'Mobile UX audit (iOS/Android)',
    agentId: 'maya',
    status: 'blocked',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Human tester with physical iOS and Android devices',
    lastActivity: TODAY,
    eta: 'Blocked — needs physical device tester',
    notes: 'Cannot test mobile without a real device. Simulator insufficient for audio playback UX.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'MAYA-003',
    title: 'Onboarding flow audit — time-to-first-play, signup-to-listen journey',
    agentId: 'maya',
    status: 'waiting',
    priority: 'P2',
    percentComplete: 0,
    waitingOn: 'Atlas: /subscribe fix + /player gate fix',
    lastActivity: TODAY,
    eta: 'After MAYA-002 unblocked or in parallel',
    notes: 'Desktop onboarding baseline: 4–7 min time-to-first-play. Needs post-Atlas-fix re-test.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  // ── SUSAN ─────────────────────────────────────────────────────────────────
  {
    id: 'SUS-001',
    title: 'GTM plan: waitlist audit, marketing intelligence, Founding Member strategy',
    agentId: 'susan',
    status: 'active',
    priority: 'P1',
    percentComplete: 30,
    waitingOn: 'Marc: marketing budget for Standard tier paid acquisition',
    lastActivity: TODAY,
    eta: '2–3 weeks for full GTM plan',
    notes: 'Pricing confirmed. FM campaign in Airtable (rec6HTGp3cVFa6OUt). Paid acquisition blocked on budget.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'SUS-002',
    title: 'Founding Member campaign activation — organic only, 500 cap, lifetime lock',
    agentId: 'susan',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: approve Founding Member Airtable campaign record (rec6HTGp3cVFa6OUt)',
    lastActivity: TODAY,
    eta: 'Immediate upon Marc approval',
    notes: 'Campaign entered in Airtable. $2.99/mo or $29.99/yr. Organic only. 500 cap.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'SUS-003',
    title: 'QR commuter program proposal — truck stop physical campaign',
    agentId: 'susan',
    status: 'waiting',
    priority: 'P3',
    percentComplete: 0,
    waitingOn: 'Marc: go/no-go decision on ~$9,500 print budget',
    lastActivity: TODAY,
    eta: '6–8 weeks from authorization',
    notes: '220+ truck stop locations, 7,000 printed QR assets. Orion recommends deferring until digital CAC validated.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  // ── VEGA ──────────────────────────────────────────────────────────────────
  {
    id: 'VEGA-001',
    title: 'Audio quality catalog audit D2 — 14 published stories assessed',
    agentId: 'vega',
    status: 'complete',
    priority: 'P1',
    percentComplete: 100,
    waitingOn: '',
    lastActivity: TODAY,
    eta: 'Done',
    notes: '14 stories audited, all UNKNOWN. production_standard not in DB. Belle B voice ID unresolved.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'VEGA-002',
    title: 'Gate A/B audio quality assessment — pass/fail all 14 published stories',
    agentId: 'vega',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: canonical Belle B voice ID · Atlas: production_standard DB tracking fix',
    lastActivity: TODAY,
    eta: 'After blockers resolved',
    notes: 'Cannot PASS any story without Belle B confirmation and production_standard in DB.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'VEGA-003',
    title: 'Production standard DB tracking — add production_standard field to story pipeline',
    agentId: 'vega',
    status: 'waiting',
    priority: 'P2',
    percentComplete: 0,
    waitingOn: 'Atlas: implement production_standard field tracking in story generation pipeline',
    lastActivity: TODAY,
    eta: 'Blocked on Atlas',
    notes: 'All 14 published stories have production_standard="unknown". 13/14 have asc_version=null.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const SEED_BLOCKERS: MarcBlocker[] = [
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
    chatGptPrompt: undefined,
  },
  {
    id: 'b4',
    description: 'Launch pricing confirmed by Marc 2026-06-05: Standard $7.99/month / $59.99/year. Founding Member $2.99/month / $29.99/year (500 cap, organic only, lifetime lock).',
    title: 'Launch pricing — RESOLVED',
    department: 'atlas',
    createdAt: new Date().toISOString(),
    done: true,
    resolvedAt: '2026-06-05T09:01:00.000Z',
    resolution: 'decided',
    answer: 'Standard: $7.99/month / $59.99/year. Founding Member: $2.99/month / $29.99/year (500 cap, organic only, lifetime lock).',
    answeredAt: '2026-06-05T09:01:00.000Z',
    nextAction: 'Atlas verifies Stripe price IDs match these amounts. Susan updates all GTM messaging. Bart updates revenue projections.',
    inputType: 'choice',
    choiceOptions: ['Standard: $7.99/month / $59.99/year. Founding Member: $2.99/month / $29.99/year.'],
    detail: {
      what: 'Launch pricing has been confirmed by Marc.',
      why: 'All acquisition messaging, Stripe configuration, and revenue projections depend on confirmed pricing.',
      recommendation: 'Confirmed.',
      followUpOwner: 'atlas',
      nextActionTemplate: 'Atlas verifies Stripe price IDs. Susan updates GTM messaging.',
    },
    chatGptPrompt: undefined,
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
    chatGptPrompt: undefined,
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
    chatGptPrompt: undefined,
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
    description: 'Founding Member offer confirmed by Marc 2026-06-05: $2.99/month or $29.99/year. First 500 members, organic acquisition only, lifetime price lock while subscription uninterrupted.',
    title: 'Founding Member offer — RESOLVED',
    department: 'susan',
    createdAt: new Date().toISOString(),
    done: true,
    resolvedAt: '2026-06-05T09:01:00.000Z',
    resolution: 'decided',
    answer: '$2.99/month or $29.99/year. First 500 members only. Organic acquisition only. Lifetime price lock while subscription remains uninterrupted.',
    answeredAt: '2026-06-05T09:01:00.000Z',
    nextAction: 'Susan builds Founding Member GTM campaign in Airtable. Messaging: exclusive early-access pricing, 500-member cap, lifetime lock.',
    inputType: 'text',
    detail: {
      what: 'Founding Member offer has been confirmed by Marc.',
      why: 'Susan needs these details to build GTM campaigns. This is the primary acquisition lever at launch.',
      recommendation: 'Confirmed.',
      followUpOwner: 'susan',
      nextActionTemplate: 'Susan updates Founding Member GTM messaging with confirmed offer.',
    },
    chatGptPrompt: undefined,
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
    chatGptPrompt: undefined,
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

const SEED_READINESS: LaunchReadiness = {
  score: 2,
  gatesGreen: 1,
  gatesYellow: 2,
  gatesRed: 5,
  bestCaseDate: 'Jul 4, 2026',
  mostLikelyDate: 'Jul 19, 2026',
  updatedAt: NOW,
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const state = await readOrgState()
  const reports = await loadOrionReports()

  const allBlockers: MarcBlocker[] = (state.blockers as MarcBlocker[]) ?? SEED_BLOCKERS
  const decisions = {
    active:   allBlockers.filter((b) => !b.done),
    deferred: allBlockers.filter((b) => b.done && b.resolution === 'deferred'),
    resolved: allBlockers.filter((b) => b.done && b.resolution != null && b.resolution !== 'deferred'),
  }

  return json({
    agents: (state.agents as AgentsState) ?? SEED_AGENTS,
    missions: (state.missions as Mission[]) ?? SEED_MISSIONS,
    blockers: allBlockers,
    decisions,
    readiness: (state.readiness as LaunchReadiness) ?? SEED_READINESS,
    reports,
    source: Object.keys(state).length > 0 ? 'storage' : 'seed',
  })
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  try {
    const body = await req.json()
    const { blockers } = body
    if (!Array.isArray(blockers)) {
      return json({ success: false, error: 'blockers must be an array' }, 400)
    }
    await writeOrgState({ blockers })
    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Failed to persist' }, 500)
  }
}

export async function PUT(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  try {
    const body = await req.json()
    // body can contain: agents, missions, blockers, readiness — any subset
    await writeOrgState(body as Record<string, unknown>)
    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Failed to persist' }, 500)
  }
}
