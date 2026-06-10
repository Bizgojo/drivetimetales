import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

// Reads agent-state.json — the live authoritative source for agent card data
// Written by POST /api/admin/agent-status (Orion-driven, no deploy required)
async function readAgentState(): Promise<Record<string, Partial<AgentState>>> {
  try {
    const { data, error } = await supabase.storage.from('org-state').download('agent-state.json')
    if (error || !data) return {}
    const text = await data.text()
    return JSON.parse(text) as Record<string, Partial<AgentState>>
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
  try {
    const { data, error } = await supabase
      .from('orion_messages')
      .select('id, content, created_at')
      .eq('role', 'orion')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error || !data || data.length === 0) return []

    return data.map((row, i) => {
      // Infer report type from content keywords
      const c = (row.content ?? '').toLowerCase()
      const type: OrionReport['type'] = c.includes('morning') || c.includes('7:00 am') || c.includes('7 am')
        ? 'morning'
        : c.includes('evening') || c.includes('4:00 pm') || c.includes('4 pm')
        ? 'evening'
        : 'weekly'
      return {
        id: row.id ?? `report-${i}`,
        type,
        content: row.content,
        timestamp: row.created_at,
      }
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
    status: 'waiting',
    currentTask: 'Production paused — waiting on workflow clarity and Production Console redesign (June 7 directive)',
    activeTasks: [
      'No new story production until Production Console + Content Approval are rebuilt',
      '33 clean audio stories in Ready For Review — awaiting Marc approval via Content Approval page',
      '4 stories in Approved Ready — awaiting Marc publish (Bridges of Bad Blood + The Manifest)',
      'Lost Signal series (3 eps) in Repair Queue — awaiting repair assignment',
    ],
    percentComplete: 20,
    waitingOn: 'Atlas: Production Console + Content Approval rebuild (ATL-CONS-001 Phase C) · Marc: approve stories in Content Approval · Marc: canonical Belle B voice ID',
    lastActivity: TODAY,
    eta: 'Resume production: after ATL-CONS-001 Phase C accepted by Marc',
    whyItMatters: 'New production would add more stories to a broken review queue. Workflow clarity must come first. When Console + Approval are rebuilt, Hal resumes immediately.',
    lastReport: {
      text: 'Hal 2026-06-07: Production paused per Marc June 7 directive. Workflow clarity takes priority over new production. 33 clean stories in RFR await Marc review once Content Approval page is rebuilt. 4 Approved Ready stories await Marc publish. Lost Signal repair queue awaiting assignment.',
      timestamp: new Date('2026-06-07').toISOString(),
    },
  },
  atlas: {
    status: 'working',
    currentTask: 'ATL-CONS-001 Phase B complete (17:47 Jun 7) — FK Safety Audit + Production Console Design + Content Approval Design delivered. Awaiting Marc approval to begin Phase C implementation.',
    activeTasks: [
      'ATL-CONS-001 Phase C: Production Console + Content Approval rebuild — awaiting Marc design approval',
      'ATL-CC2 R2/R3: Command Center v2 — awaiting Marc verification (hard refresh + test) since Jun 5',
      'ATL-004: Stripe Annual price ID conflict — awaiting Marc to create correct price in Stripe dashboard',
      'ATL-001: www.endless-tales.com — Jun 7 audit shows HTTP 200 (not 404); status under investigation',
    ],
    percentComplete: 45,
    waitingOn: 'Marc: approve ATL-CONS-001 Phase C design docs · Marc: verify ATL-CC2 R2/R3 at /admin/command-center · Marc: create Stripe Annual price ID',
    lastActivity: TODAY,
    eta: 'ATL-CONS-001 Phase C: same day Marc approves design · ATL-CC2: same day Marc verifies · ATL-004: same day Marc provides price ID',
    whyItMatters: 'Production Console and Content Approval workflow clarity is Marc\'s stated Priority 1. Stripe billing error is live revenue risk. ATL-CC2 acceptance gate open 48h.',
    lastReport: {
      text: 'Atlas 2026-06-07: ATL-CONS-001 Phase B complete (17:47). FK Safety Audit: all 13 proposed deletions structurally safe, zero child rows. Production Console Design + Content Approval Design committed (7de1174). Database cleanup: 34 records moved to cold_storage, Meridian Threshold tagged [INCUBATOR]. RFR queue: 90 → 56. ATL-CC2 R2/R3 still awaiting Marc verify.',
      timestamp: new Date('2026-06-07').toISOString(),
    },
  },
  maya: {
    status: 'waiting',
    currentTask: 'Desktop audit complete — 2 launch-critical bugs found and escalated to Atlas',
    activeTasks: [
      'Monitoring Atlas: /subscribe re-subscribe fix (churned users hit dead end)',
      'Monitoring Atlas: /player subscription gate fix (possible unguarded route)',
      'MAYA-002 mobile audit — blocked (needs physical iOS/Android device)',
      'MAYA-003 onboarding audit — queued after Atlas fixes complete',
    ],
    percentComplete: 30,
    waitingOn: 'Atlas: /subscribe fix + /player gate fix · Human tester for iOS/Android mobile',
    lastActivity: TODAY,
    eta: 'Mobile: blocked · Onboarding audit: after Atlas fixes',
    whyItMatters: 'Churned subscribers have no path back to billing. /player may be publicly accessible. Both are Gate 1 failures blocking launch.',
    lastReport: {
      text: 'MAYA-001 D1 desktop complete. CRITICAL 1: /subscribe dead end for expired users. CRITICAL 2: /player in PUBLIC_PREFIXES — gate bypass risk. Time-to-first-play: 4–7 min. Both escalated to Atlas.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  susan: {
    status: 'working',
    currentTask: 'Founding Member campaign ready — organic posts drafted, awaiting Marc approval',
    activeTasks: [
      'GTM: FM campaign in Airtable (Recommended) — awaiting Marc approval to Activate',
      'Organic posts ready: Reddit, X, TikTok/Reels drafts complete',
      'Platform accounts active: Instagram + TikTok (@endlesstalesllc), X (@EndlessTalesAudio)',
      'Marketing asset inventory complete — 7 accounts confirmed, 2FA audit needed',
    ],
    percentComplete: 40,
    waitingOn: 'Marc: approve FM Airtable campaign · Marc: confirm X API plan (free vs $100/mo)',
    lastActivity: TODAY,
    eta: 'Organic campaign: immediate on Marc approval · Paid acquisition: blocked on budget',
    whyItMatters: '7 waitlist leads + 500 FM slots available now. Campaign is ready. Only Marc approval is missing.',
    lastReport: {
      text: 'SUS-002 complete. Confirmed: X, Reddit, Email, Airtable, Instagram, TikTok, TikTok Business. Instagram/TikTok @endlesstalesllc active. FM campaign (rec6HTGp3cVFa6OUt): $2.99/mo, 500 cap, organic. 3 organic post drafts ready.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  vega: {
    status: 'working',
    currentTask: 'VEGA-002 catalog classification complete — 14/14 PASS',
    activeTasks: [
      'VEGA-002: 14/14 published stories PASS (audio accessible, all fields confirmed)',
      'Intro/outro verification: blocked on Belle B canonical voice ID',
      '14 non-standard audio paths (/test/ or /asc3/) — PASS/REPAIR/RETIRE assessment queued',
    ],
    percentComplete: 35,
    waitingOn: 'Marc: canonical Belle B voice ID — candidates: GMhgX8fCR9GUtd3kmlKC, EXAVITQu4vr4xnSDxMaL, KWDD3Wyq30ZF5NEL01EJ',
    lastActivity: TODAY,
    eta: 'Belle B decision: same day Marc chooses · Non-standard path audit: 2–3 days after',
    whyItMatters: 'Gate 4 (Audio Quality) is RED. Belle B voice ID is the only remaining blocker — one Marc decision unblocks Vega completely.',
    lastReport: {
      text: 'VEGA-002 2026-06-05: 14/14 PASS. All audio HTTP 200, narrator IDs present, series complete. Intro/outro UNVERIFIED — 3 Belle B candidates, Marc must choose. 14 non-standard paths need assessment.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  bart: {
    status: 'waiting',
    currentTask: 'BART-001 corrected baseline filed — accepted pending Mercury, KIE.ai, and X API confirmation',
    activeTasks: [
      'BART-001: Ground truth baseline — 3 data points pending from Marc',
      'Mercury balance: 24 days stale — awaiting new API token from Marc',
      'KIE.ai monthly cost: untracked service, cost unknown',
      'X API plan: free vs $100/mo — unconfirmed',
      'BART-002: financial framework — blocked until BART-001 fully accepted',
    ],
    percentComplete: 75,
    waitingOn: 'Marc: new Mercury API token · Marc: KIE.ai monthly cost · Marc: X API plan (free vs $100/mo)',
    lastActivity: TODAY,
    eta: 'BART-001 closes same day Marc provides 3 data points · BART-002 begins immediately after',
    whyItMatters: 'Runway calc is 24 days stale. Up to $110/mo in untracked burn. BART-002 cannot begin until baseline is confirmed.',
    lastReport: {
      text: 'BART-001 Corrected 2026-06-05: MRR $0. External subs 0. Burn $405.17/mo (9 services confirmed). Mercury last known $9,925.24 on 2026-05-12 (token revoked). Runway est. 22–24 months. KIE.ai + X API costs unknown. Break-even: 52 subs at $7.99/mo.',
      timestamp: new Date('2026-06-05').toISOString(),
    },
  },
  // Required by AgentId type but not shown in CC grid
  lex: {
    status: 'working',
    currentTask: 'LEX-001 complete. Two CRITICAL legal blockers identified: trial terms conflict (ToS 14-day vs ORION-002 7-day) and Suno commercial rights unconfirmed. Trademark unfiled. Entity registration unconfirmed.',
    percentComplete: 40,
    waitingOn: 'Marc: resolve trial terms (7-day or 14-day? card required?) · Marc: confirm Suno subscription tier (free prohibits commercial use)',
    lastActivity: TODAY,
    eta: 'Blockers resolved same day Marc provides decisions',
    whyItMatters: 'Two Gate 3 (Legal) failures block launch. Trial terms conflict is consumer protection exposure on every signup. Suno free tier commercial use prohibition means every story with Suno music could be a license violation. Both require Marc decision, not just Orion.',
    lastReport: {
      text: 'LEX-001 Legal Ground Truth 2026-06-05: CRITICAL — ToS (live) states 14-day trial with card required; ORION-002 states 7-day no card. One of these must be corrected before launch. CRITICAL — Suno subscription tier unconfirmed; Free tier prohibits commercial use. ElevenLabs growing_business commercial license confirmed (RESOLVED). USPTO search: "Endless Tales" clear in Class 41 — trademark not yet filed. Wonder Books Press entity registration status unconfirmed (ToS operates under this name).',
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
    resolveUrl: '/admin/authors-narrators-v2',
    lastActivity: TODAY,
    eta: '3–4 weeks to 25 stories',
    notes: 'Current task.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'review', rationale: 'Pick one of three candidate voice IDs. Current best candidate: GMhgX8fCR9GUtd3kmlKC (active in voiceConstants.ts). Confirm or override.' },
    whyNeedsMarc: 'Canonical voice ID affects every future story production. Creative/brand decision — cannot be delegated.',
    approvalConsequences: 'Vega confirms intro/outro on all 14 published stories. All future stories use confirmed voice. Gate 4 moves toward GREEN.',
    rejectionConsequences: 'Belle B intro/outro unverified on all 14 published stories. Gate 4 remains RED. Vega and Hal cannot close quality checks.',
    urgency: 'high',
    urgencyReason: 'Blocks Vega Gate 4 assessment and all future production QC. One decision unblocks two departments.',
    nextActionOnApprove: 'Vega runs intro/outro spot-check on all 14 stories. Hal uses confirmed ID in all future production.',
    whyOrionCannotDecide: 'Belle B voice ID is a brand identity decision affecting all future content. This is a creative direction call that requires Marc\'s unique judgment.',
    authorityCategory: 'executive-judgment',
  },
  {
    id: 'HAL-002',
    title: 'Content approval queue resolution — fix Production Console so 74 hidden stories appear',
    agentId: 'hal',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Atlas: fix audio_url/final_mix.mp3 path requirement in Production Console',
    resolveUrl: '/admin/production/console',
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
    resolveUrl: '/admin/command-center',
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
    title: 'Platform stability + Stripe Annual billing fix',
    agentId: 'atlas',
    status: 'active',
    priority: 'P1',
    percentComplete: 30,
    waitingOn: 'Marc: create correct Stripe Annual price ID in Stripe dashboard · Atlas: re-verify www.endless-tales.com status',
    resolveUrl: 'https://dashboard.stripe.com/prices',
    lastActivity: TODAY,
    eta: 'D1 by Jun 9',
    notes: 'Jun 7 audit: www.endless-tales.com confirmed HTTP 200 (not 404 as previously reported). www domain status retracted as launch blocker. Stripe Annual price ID conflict confirmed in 4 env files — active billing risk.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: 'Stripe Annual = Monthly price ID means annual subscribers are charged monthly rate. Marc must create the correct Annual price ID in Stripe dashboard. Low effort, high risk if unresolved before launch.' },
    whyNeedsMarc: 'Creating a new Stripe price requires access to the live Stripe dashboard — only Marc has this access.',
    approvalConsequences: 'Marc creates correct Annual price ID. Atlas updates 4 env files and deploys. Annual billing works correctly.',
    rejectionConsequences: 'Annual subscribers continue to be charged monthly rate. Potential chargeback and refund risk at launch.',
    urgency: 'high',
    urgencyReason: 'Active billing misconfiguration in all 4 env files. Must be fixed before any founding member annual subscriptions are processed.',
    nextActionOnApprove: 'Marc provides new Stripe Annual price ID. Atlas updates .env files and deploys.',
    whyOrionCannotDecide: 'Creating Stripe prices requires live Stripe dashboard access held by Marc.',
    authorityCategory: 'executive-judgment',
  },
  {
    id: 'ATL-CONS-001',
    title: 'Production Console + Content Approval workflow rebuild (Phases A–C)',
    agentId: 'atlas',
    status: 'active',
    priority: 'P1',
    percentComplete: 55,
    waitingOn: 'Marc: approve Production Console design doc · Marc: approve Content Approval design doc · Marc: authorize Phase 1 deletions (10 no-audio duplicates)',
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: 'Phase C implementation: same day Marc approves design',
    notes: 'Phase A (audit) complete. 34 shell/test/orphan records moved to cold_storage (RFR: 90→56). Phase B (design) complete: FK Safety Audit + Console Design + Approval Design committed (7de1174). Phase C (implementation) pending Marc design approval.',
    unread: true,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: 'Marc\'s Priority 1. Design documents ready. Approving both design docs unblocks Atlas to build the correct Production Console and Content Approval pages. Implementation time est. 6–8 hours.' },
    whyNeedsMarc: 'Per ORION-011 Marc Acceptance Gate. Also: 10 no-audio duplicate deletion authorization required before full cleanup is complete.',
    approvalConsequences: 'Atlas implements Production Console redesign and Content Approval gate unification. Marc sees accurate workflow counts. RFR queue shows only reviewable stories.',
    rejectionConsequences: 'Production Console and Content Approval continue to show divergent, inaccurate counts.',
    urgency: 'high',
    urgencyReason: 'Marc\'s stated Priority 1 for June 7. Design docs ready. Only Marc approval is blocking implementation.',
    nextActionOnApprove: 'Atlas begins Phase C implementation of Production Console and Content Approval simultaneously.',
    whyOrionCannotDecide: 'Per ORION-011 Marc Acceptance Gate: design documents require Marc approval before implementation.',
    authorityCategory: 'executive-judgment',
  },
  {
    id: 'ATL-CC2',
    title: 'Command Center v2 — R2/R3 verification (deferred section + report button)',
    agentId: 'atlas',
    status: 'active',
    priority: 'P2',
    percentComplete: 90,
    waitingOn: 'Marc: hard refresh /admin/command-center and verify R2 (defer a decision) + R3 (click Last Orion Report button)',
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: 'Same day Marc verifies',
    notes: 'Deployed Jun 5 (commit 431b6240). R4 backlog complete. Awaiting Marc verification of R2 (deferred decisions section) and R3 (Last Orion Report button). Open 48+ hours at Marc Acceptance Gate.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'review', rationale: 'Hard refresh /admin/command-center. Test: (1) defer any decision → confirm Deferred section appears. (2) click Last Orion Report → confirm correct report shows. Both deployed Jun 5. Two-minute verification.' },
    whyNeedsMarc: 'Per ORION-011 Marc Acceptance Gate: no task marked complete until Marc explicitly verifies.',
    approvalConsequences: 'ATL-CC2 closed. Command Center v2 acceptance complete.',
    rejectionConsequences: 'Fixes remain unverified. Investigation required.',
    urgency: 'low',
    urgencyReason: 'No operational impact while pending. Blocking only ATL-CC2 formal closure.',
    nextActionOnApprove: 'Orion marks ATL-CC2 complete.',
    whyOrionCannotDecide: 'Per ORION-011 Marc Acceptance Gate: Orion cannot self-certify Marc\'s acceptance.',
    authorityCategory: 'executive-judgment',
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
    resolveUrl: 'https://dashboard.stripe.com/prices',
    lastActivity: TODAY,
    eta: 'Same day once authorized',
    notes: 'Annual subscribers charged at monthly rate. Active billing error.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: 'Live billing error. Annual subscribers billed at monthly rate. 30-minute fix, zero cost.' },
    whyNeedsMarc: 'Stripe live dashboard access is Marc-only. No spend involved — only dashboard action.',
    approvalConsequences: 'Marc creates correct Annual price ID in Stripe. Atlas updates .env.local, redeploys. Billing corrected.',
    rejectionConsequences: 'Annual subscribers billed at wrong rate. Gate 2 remains RED.',
    urgency: 'high',
    urgencyReason: 'Live billing error — must fix before any subscriber pays for Annual plan.',
    nextActionOnApprove: 'Marc creates price ID in Stripe dashboard, sends ID to Orion → Atlas deploys within 1 hour.',
    whyOrionCannotDecide: 'Stripe live dashboard access is Marc-only. This is a Marc account action — Orion has no login credentials.',
    authorityCategory: 'executive-judgment',
  },
  {
    id: 'ATL-005',
    title: 'Legacy cron job audit and disable (stress-test-poller)',
    agentId: 'atlas',
    status: 'waiting',
    priority: 'P3',
    percentComplete: 0,
    waitingOn: 'Marc: kill or keep decision on stress-test-poller',
    resolveUrl: '/admin/command-center',
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
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: '2–3 weeks for full GTM plan',
    notes: 'Pricing confirmed. FM campaign in Airtable (rec6HTGp3cVFa6OUt). Paid acquisition blocked on budget.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    whyOrionCannotDecide: 'Paid acquisition budget is a spending decision above Orion\'s delegated authority. ORION-FIN-001 requires Marc approval for any paid marketing commitment.',
    authorityCategory: 'spending',
    urgency: 'medium',
    urgencyReason: 'FM organic campaign active. Standard tier paid acquisition cannot start without budget authorization.',
  },
  {
    id: 'SUS-002',
    title: 'Founding Member campaign activation — organic only, 500 cap, lifetime lock',
    agentId: 'susan',
    status: 'waiting',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: approve Founding Member Airtable campaign record (rec6HTGp3cVFa6OUt)',
    resolveUrl: 'https://airtable.com/appPYSnJkNbWCc9Lj',
    lastActivity: TODAY,
    eta: 'Immediate upon Marc approval',
    notes: 'Campaign entered in Airtable. $2.99/mo or $29.99/yr. Organic only. 500 cap.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: '7 waitlist leads, 500 FM slots, organic only. Campaign is ready. No spend involved. Delay costs waitlist conversions.' },
    whyNeedsMarc: 'Per ORION-FIN-001 and Susan Bible: all campaigns require Marc approval before activation.',
    approvalConsequences: 'Susan activates FM campaign. Organic posts go live (Reddit, X, TikTok/Reels). Waitlist conversion begins.',
    rejectionConsequences: 'FM launch window continues to close. 7 waitlist leads remain unconverted. 500 slots unused.',
    urgency: 'medium',
    urgencyReason: 'No immediate cost. But every day of delay is a missed organic conversion opportunity.',
    nextActionOnApprove: 'Susan posts organic content on Reddit, X, and TikTok/Reels within 24 hours of approval.',
    whyOrionCannotDecide: 'Susan Bible requires Marc approval before any campaign activates. All public-facing campaigns are a form of publishing authority.',
    authorityCategory: 'publishing',
  },
  {
    id: 'SUS-003',
    title: 'QR commuter program proposal — truck stop physical campaign',
    agentId: 'susan',
    status: 'waiting',
    priority: 'P3',
    percentComplete: 0,
    waitingOn: 'Marc: go/no-go decision on ~$9,500 print budget',
    resolveUrl: 'https://airtable.com/appPYSnJkNbWCc9Lj',
    lastActivity: TODAY,
    eta: '6–8 weeks from authorization',
    notes: '220+ truck stop locations, 7,000 printed QR assets. Orion recommends deferring until digital CAC validated.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'defer', rationale: 'Defer until digital CAC is established. $9,500 print spend before knowing digital conversion rate is premature. Revisit after Founding Member campaign data is collected.' },
    whyOrionCannotDecide: '$9,500 print budget exceeds Orion\'s delegated spending authority. Any paid external campaign requires Marc approval per ORION-FIN-001.',
    authorityCategory: 'spending',
    urgency: 'low',
    urgencyReason: 'P3 priority. No active deployment risk. Orion recommendation is to defer.',
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
    waitingOn: 'Atlas: production_standard DB tracking fix',
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: 'After blockers resolved',
    notes: 'Cannot PASS any story without Belle B confirmation and production_standard in DB. Belle B ask tracked via Hal agent-state (single authoritative source per ATL-SYNC-002).',
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
  // ── BART ──────────────────────────────────────────────────────────────────
  {
    id: 'BART-001',
    title: 'Ground Truth Financial Assessment — establish actual financial baseline',
    agentId: 'bart',
    status: 'active',
    priority: 'P1',
    percentComplete: 75,
    waitingOn: 'Marc: accept corrected BART-001 baseline · Marc: new Mercury API token (generate from Mercury → Settings → API) · Marc: KIE.ai monthly cost · Marc: X API plan (free or $100/mo)',
    resolveUrl: 'https://app.mercury.com/settings/api',
    lastActivity: TODAY,
    eta: 'Closes same day Marc provides 3 outstanding data points',
    notes: 'Corrected baseline filed and accepted pending corrections. MRR $0. Burn $405.17/mo confirmed. Mercury balance 24 days stale (token revoked). Two untracked expenses: KIE.ai and X API.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: 'Corrected baseline is accurate for all confirmed data. Mercury balance gap is the only remaining unknown. Accept now, update when Mercury token is restored.' },
    whyNeedsMarc: 'Per ORION-FIN-001: no variance analysis may begin before Marc accepts the baseline. Marc is sole approver. Only Marc has Mercury dashboard access.',
    approvalConsequences: 'BART-002 begins immediately. Bart implements live financial tracking, expenditure review chain, monthly reporting. Atlas updates .env.local with new Mercury token, live balance visible within 1 hour.',
    rejectionConsequences: 'BART-002 blocked indefinitely. No live financial governance. Expenditure requests cannot be processed. Mercury runway data remains stale.',
    urgency: 'high',
    urgencyReason: 'BART-002 (live framework) is blocked until baseline accepted. Mercury balance 24 days stale. Every day of delay is a day without financial governance.',
    nextActionOnApprove: 'Bart begins BART-002 immediately. Marc generates Mercury token from Mercury → Settings → API and sends to Orion. Atlas updates .env.local within 1 hour.',
    whyOrionCannotDecide: 'Per ORION-FIN-001 Section 3: Marc must accept the financial baseline before any variance analysis or planning begins. Orion may not self-certify financial ground truth.',
    authorityCategory: 'executive-judgment',
  },
  {
    id: 'BART-002',
    title: 'Financial Framework Implementation — activate live Bart governance against approved framework',
    agentId: 'bart',
    status: 'blocked',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: accept corrected BART-001 baseline (3 data points outstanding) · Marc: new Mercury API token (24 days stale — generate from Mercury → Settings → API)',
    resolveUrl: 'https://app.mercury.com/settings/api',
    lastActivity: TODAY,
    eta: 'Begins immediately after Marc accepts BART-001',
    notes: 'Cannot begin variance analysis, forecasting, or expenditure tracking until ground truth baseline is Marc-approved. Per governance: no assumptions, no variance against estimates.',
    unread: false,
    createdAt: NOW,
    updatedAt: NOW,
    orionRecommendation: { stance: 'approve', rationale: 'Runway data is 24 days stale. Generate token from Mercury dashboard — takes 2 minutes. Restores live financial visibility. Accept BART-001 baseline to unblock live governance framework.' },
    whyNeedsMarc: 'Only Marc has Mercury dashboard access. Token generation requires login. BART-001 baseline acceptance requires Marc as sole approver per ORION-FIN-001.',
    approvalConsequences: 'Atlas updates .env.local with new token. Mercury snapshot cron restored. Live balance visible in Command Center within 1 hour. BART-002 live governance framework begins.',
    rejectionConsequences: 'Runway data remains stale. Bart cannot confirm actual financial position. Financial governance partially blind. BART-002 blocked indefinitely.',
    urgency: 'high',
    urgencyReason: 'Mercury balance is 24 days stale. Last known $9,925.24. Actual balance unknown. BART-002 fully blocked.',
    nextActionOnApprove: 'Marc generates token from Mercury → Settings → API. Sends to Orion. Atlas updates .env.local and redeploys within 1 hour. Bart begins BART-002 immediately.',
    whyOrionCannotDecide: 'Mercury banking dashboard access is Marc-only. API token generation requires Marc to log in. Orion cannot generate tokens for Marc\'s account.',
    authorityCategory: 'executive-judgment',
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
  bestCaseDate: null,   // removed per Work Order 001 Rev D Sec 2 — no launch date, gate-based only
  mostLikelyDate: null, // removed per Work Order 001 Rev D Sec 2 — no launch date, gate-based only
  updatedAt: NOW,
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Narrow read-only bypass for Orion cron jobs (no session cookie available in isolated runs).
  // Only allows GET. PATCH and PUT remain fully session-protected.
  const cronKey = req.headers.get('x-orion-service-key')
  const validCronKey = process.env.ORION_CRON_READ_KEY
  const isCronRead = cronKey && validCronKey && cronKey === validCronKey

  if (!isCronRead) {
    const authError = await requireAdmin()
    if (authError) return authError
  }

  const state = await readOrgState()
  const reports = await loadOrionReports()

  const allBlockers: MarcBlocker[] = (state.blockers as MarcBlocker[]) ?? SEED_BLOCKERS
  const decisions = {
    active:   allBlockers.filter((b) => !b.done),
    deferred: allBlockers.filter((b) => b.done && b.resolution === 'deferred'),
    resolved: allBlockers.filter((b) => b.done && b.resolution != null && b.resolution !== 'deferred'),
  }

  // Agent Card SSoT: merge SEED_AGENTS (schema defaults) with agent-state.json (live values)
  // agent-state.json is authoritative for any field it contains.
  // SEED_AGENTS provides structural defaults only — never overrides live storage values.
  const agentStateOverrides = await readAgentState()
  const agents: AgentsState = (Object.keys(SEED_AGENTS) as AgentId[]).reduce((acc, id) => {
    acc[id as AgentId] = {
      ...SEED_AGENTS[id as AgentId],
      ...(agentStateOverrides[id] ?? {}),
    }
    return acc
  }, {} as AgentsState)

  // Use SEED_MISSIONS when stored array is empty ([] is truthy — ?? alone is insufficient)
  const storedMissions = state.missions as Mission[] | undefined
  const missions = (storedMissions && storedMissions.length > 0) ? storedMissions : SEED_MISSIONS

  return json({
    agents,
    missions,
    blockers: allBlockers,
    decisions,
    // Return persisted Marc Action resolutions so all browsers hydrate from one source of truth
    marcActions: (state.marcActions as Record<string, unknown>) ?? {},
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
    const patch: Record<string, unknown> = {}

    // Handle blockers update (existing behaviour preserved)
    if ('blockers' in body) {
      const { blockers } = body
      if (!Array.isArray(blockers)) {
        return json({ success: false, error: 'blockers must be an array' }, 400)
      }
      patch.blockers = blockers
    }

    // Handle Marc Action resolutions — persists approved/rejected/deferred decisions cross-browser
    if ('marcActions' in body) {
      const { marcActions } = body
      if (typeof marcActions !== 'object' || marcActions === null || Array.isArray(marcActions)) {
        return json({ success: false, error: 'marcActions must be an object' }, 400)
      }
      patch.marcActions = marcActions
    }

    if (Object.keys(patch).length === 0) {
      return json({ success: false, error: 'body must contain blockers or marcActions' }, 400)
    }

    await writeOrgState(patch)
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
