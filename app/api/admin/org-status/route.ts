import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { AgentId, AgentState, Blocker, Mission, MarcBlocker, LaunchReadiness } from '@/lib/config/command-center'

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

// Reads blockers.json — the single source of truth for all agent blocked states.
// Agent cards read blockerIds[] → look up here. "Needs Your Decision" panel filters
// by requires_marc_action: true AND status: 'open'.
async function readBlockers(): Promise<Blocker[]> {
  try {
    const { data, error } = await supabase.storage.from('org-state').download('blockers.json')
    if (error || !data) return []
    const text = await data.text()
    const parsed = JSON.parse(text) as { blockers?: Blocker[] }
    return Array.isArray(parsed.blockers) ? parsed.blockers : []
  } catch {
    return []
  }
}

async function writeBlockers(blockers: Blocker[]): Promise<void> {
  const blob = new Blob([JSON.stringify({ blockers })], { type: 'application/json' })
  await supabase.storage
    .from('org-state')
    .upload('blockers.json', blob, { upsert: true })
}

async function writeAgentState(agentState: Record<string, Partial<AgentState>>): Promise<void> {
  const blob = new Blob([JSON.stringify(agentState)], { type: 'application/json' })
  await supabase.storage
    .from('org-state')
    .upload('agent-state.json', blob, { upsert: true })
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

// SEED_AGENTS provides type-safe structural defaults ONLY.
// No operational descriptions — those come exclusively from agent-state.json (live source of truth).
// If agent-state.json has no entry for an agent, the card renders idle/empty state, not stale seed text.
const MINIMAL_AGENT_DEFAULT: AgentState = {
  status: 'idle',
  currentTask: '',
  activeTasks: [],
  percentComplete: null,
  waitingOn: '',
  lastActivity: '',
  lastUpdatedAt: undefined,
  eta: '',
  whyItMatters: '',
  lastReport: null,
}

const SEED_AGENTS: AgentsState = {
  hal:   { ...MINIMAL_AGENT_DEFAULT },
  atlas: { ...MINIMAL_AGENT_DEFAULT },
  maya:  { ...MINIMAL_AGENT_DEFAULT },
  susan: { ...MINIMAL_AGENT_DEFAULT },
  vega:  { ...MINIMAL_AGENT_DEFAULT },
  bart:  { ...MINIMAL_AGENT_DEFAULT },
  lex:   { ...MINIMAL_AGENT_DEFAULT },
  codex: { ...MINIMAL_AGENT_DEFAULT },
  orion: { ...MINIMAL_AGENT_DEFAULT },
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
    id: 'ATL-PROD-001',
    agentId: 'atlas',
    title: 'Unified Production & Approval page — pre-build spec',
    status: 'active',
    priority: 'P1',
    percentComplete: 0,
    waitingOn: 'Marc: approve ATL-PROD-001 pre-build spec to begin Phase 1 code',
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: 'Phase 1 begins immediately after Marc approves',
    notes: 'Atlas delivered the pre-build spec for unified /admin/production page. Awaiting Marc acceptance gate before code starts.',
    unread: true,
    createdAt: NOW,
    updatedAt: NOW,
    whyOrionCannotDecide: 'ORION-011 Marc Acceptance Gate — no implementation may begin until Marc approves the design document.',
    authorityCategory: 'executive-judgment',
    marcActionDetails: {
      'approve atlprod001 prebuild spec to begin phase 1 code': {
        title: 'Approve the design spec for the unified Production page',
        situation: 'Atlas has delivered a complete pre-build spec for the unified /admin/production page (ATL-PROD-001). This page will merge the current Production Console and Content Approval pages into one view. All outstanding questions in the spec were resolved before delivery. Atlas is waiting for approval before writing any code.',
        whatMarcDecides: 'Approve the spec as written so Atlas begins Phase 1 code, or request changes before Atlas starts.',
        whyOrionCannotDecide: 'ORION-011 requires Marc to approve design documents before any implementation begins. Orion cannot self-certify.',
        orionRecommends: 'approve',
        whyRecommends: 'The spec was reviewed and both Atlas Notes were resolved. Phase 1 introduces no schema changes, no breaking changes, and no new dependencies. It adds a read-only unified view. The risk of approving is near zero. The risk of delay is continued split workflows across two pages.',
        ifApproved: 'Atlas begins Phase 1 coding immediately. A working Needs Attention section and production queue view are delivered in 1-2 days. Marc reviews and approves Phase 1 before Phase 2 begins.',
        ifDeferred: 'Phase 1 delays one day per day of deferral. Orion and Hal continue operating across two separate admin pages with no unified production status view.',
        ifRejected: 'Atlas revises the spec per Marc\'s feedback and resubmits. 1-2 day revision cycle.',
        costTimeAndMoney: '5 minutes to review the spec. No cost to approve - Atlas builds it.',
        riskOfDelay: 'Orion cannot see production status in one place. Every day without it makes production coordination harder.',
        followUpOwner: 'Atlas',
        nextActionOnApprove: 'Atlas begins Phase 1 immediately - Needs Attention section, production queue, three parallel data fetches. No schema changes. Delivers working code for Marc review in 1-2 days.',
      },
    },
  },
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
    eta: 'D1 investigation ongoing — HTTP 200 confirmed, cause unclear',
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
    waitingOn: 'Marc: create Founding Member annual Stripe price',
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
    marcActionDetails: {
      'create founding member annual stripe price': {
        title: 'Create the Founding Member annual Stripe price ($29.99/year)',
        situation: 'The Founding Member annual billing option is built in the codebase (ATL-PIPE-006, deployed) but non-functional because the Stripe price ID doesn\'t exist. If any FM subscriber chooses annual billing today, they are charged the wrong amount — the standard annual price instead of $29.99/year.',
        whatMarcDecides: 'Create a $29.99/year recurring price in Stripe for the Founding Member plan, then add the price ID as an env var in Vercel.',
        whyOrionCannotDecide: 'Stripe live dashboard and Vercel env vars are Marc-only. Orion cannot create prices or set env vars.',
        orionRecommends: 'approve',
        whyRecommends: 'This is a live billing risk. The code is deployed and waiting for this price to exist. Takes 5 minutes. Must be done before any FM campaign launches — it is a campaign launch gate.',
        ifApproved: 'Annual FM billing works correctly. FM campaign can include annual option. ATL-PIPE-006 routes annual FM subscribers to $29.99/year automatically.',
        ifDeferred: 'FM annual billing stays broken. Cannot launch FM campaign until this is set. Any subscriber who somehow chooses annual is charged the wrong amount.',
        ifRejected: 'Annual FM option must be disabled entirely, reducing the FM value proposition. Monthly-only FM is possible but suboptimal.',
        costTimeAndMoney: '5 minutes. Creating a Stripe price is free.',
        riskOfDelay: 'Blocks FM campaign launch. Live billing misconfiguration for any annual FM subscriber.',
        followUpOwner: 'Atlas (verifies env var is set)',
        nextActionOnApprove: 'Marc creates price in Stripe → sends price_ID to Orion → Orion adds STRIPE_PRICE_FOUNDING_MEMBER_ANNUAL to Vercel → Atlas verifies → FM campaign unblocked.',
      },
    },
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
    waitingOn: 'Marc: accept corrected BART-001 baseline · Marc: new Mercury API token · Marc: KIE.ai monthly cost · Marc: X API plan (free or $100/mo)',
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
    marcActionDetails: {
      'accept corrected bart001 baseline': {
        title: 'Accept the BART-001 corrected financial baseline',
        situation: 'Bart filed a corrected financial baseline: MRR $0, burn $405.17/month, 22-24 month runway estimate based on May 12 Mercury balance. Two data points remain outstanding: KIE.ai monthly cost (now confirmed at $0.33/month) and X API plan (free vs $100/month). Mercury balance itself is stale pending token replacement.',
        whatMarcDecides: 'Accept this baseline as the official Endless Tales financial ground truth, understanding that the Mercury balance will be updated once the token is replaced.',
        whyOrionCannotDecide: 'Per ORION-FIN-001 Section 3: Marc must accept the financial baseline. Orion cannot self-certify financial ground truth.',
        orionRecommends: 'approve',
        whyRecommends: 'The confirmed data is accurate. The only gap is the stale Mercury balance, which will be resolved when Marc provides the new token. Accepting now unblocks BART-002 live governance framework. We can update the baseline the moment Mercury is live.',
        ifApproved: 'BART-002 begins immediately. Bart implements live financial tracking, expenditure review chain, and monthly reporting. Mercury balance updates automatically once token is replaced.',
        ifDeferred: 'BART-002 stays blocked. No live financial governance. Spending decisions made without an approved baseline.',
        ifRejected: 'Bart revises per Marc\'s feedback. Specify which data point is wrong or missing.',
        costTimeAndMoney: '2 minutes to review. No cost.',
        riskOfDelay: 'Every financial decision is made without approved ground truth. BART-002 governance framework cannot start.',
        followUpOwner: 'Bart',
        nextActionOnApprove: 'Bart begins BART-002 immediately. First deliverable: live expenditure tracking report within 24 hours.',
      },
      'new mercury api token': {
        title: 'Replace the Mercury API token to restore financial tracking',
        situation: 'The Mercury API token was revoked. Bart has had no live Mercury balance data since May 12, 2026 — 29+ days ago. The cash balance in the Command Center is stale. Bart cannot complete the financial baseline or model runway accurately without current data.',
        whatMarcDecides: 'Log in to Mercury → Settings → API → Generate new token, then send the token to Orion.',
        whyOrionCannotDecide: 'Only Marc holds Mercury account credentials. Token generation requires logging in. Orion cannot generate tokens for Marc\'s account.',
        orionRecommends: 'approve',
        whyRecommends: 'This takes 2 minutes. Mercury balance is 29+ days stale. Every financial decision we make right now is based on a May 12 snapshot. Restoring the token gives Bart live cash visibility and unblocks the entire BART financial governance framework. No risk involved.',
        ifApproved: 'Marc sends token to Orion. Atlas updates MERCURY_API_TOKEN in Vercel env vars and redeploys within 1 hour. Live Mercury balance visible in Command Center. Bart completes BART-001 baseline and begins BART-002 live financial tracking. Daily cash floor alerts activate.',
        ifDeferred: 'Financial tracking stays blind. Runway modeling remains at May 12 data. Bart cannot complete baseline. BART-002 governance framework stays blocked. Every day of delay is a day without live cash visibility.',
        ifRejected: 'Live Mercury tracking stays disabled permanently. Bart cannot confirm current runway. Not recommended — there is no downside to restoring the token.',
        costTimeAndMoney: '2 minutes. No cost.',
        riskOfDelay: '29+ days blind on cash position. Balance may have changed materially. Launch financial decisions are made without verified runway data.',
        followUpOwner: 'Bart + Atlas',
        nextActionOnApprove: 'Marc sends new token to Orion → Orion sends to Atlas → Atlas updates MERCURY_API_TOKEN in Vercel within 1 hour → Bart pulls live balance and completes BART-001 baseline.',
      },
    },
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
  // ── LEX ───────────────────────────────────────────────────────────────────
  {
    id: 'LEX-004',
    title: 'Endless Tales trademark and defensive domain strategy',
    agentId: 'lex',
    status: 'active',
    priority: 'P1',
    percentComplete: 40,
    waitingOn: 'Marc: earliest commercial activity date · Marc: buy defensive domain variants',
    resolveUrl: '/admin/command-center',
    lastActivity: TODAY,
    eta: 'Trademark strategy within 24 hours after Marc response',
    notes: 'Lex found an active same-name competitor at www.endless-tales.com. Trademark and domain protection require Marc factual input and spending authorization.',
    unread: true,
    createdAt: NOW,
    updatedAt: NOW,
    whyOrionCannotDecide: 'Commercial history is Marc-only factual knowledge, and defensive domain purchases require Marc spending authorization.',
    authorityCategory: 'legal',
    marcActionDetails: {
      'earliest commercial activity date': {
        title: 'Tell Orion the earliest date Endless Tales was publicly available',
        situation: 'Lex found an active competitor at www.endless-tales.com — same product, same pricing ($2.99/month Founding Member, 500-cap), launched April 17, 2026. Neither party holds a USPTO trademark on "Endless Tales." The date Endless Tales first had any public commercial activity determines whether we file a trademark based on prior use or need a different strategy.',
        whatMarcDecides: 'Provide the earliest date Endless Tales was publicly offered, marketed, or made available — even in beta, invite-only, or waitlist form.',
        whyOrionCannotDecide: 'Only Marc knows the factual commercial history of Endless Tales. This is a question of fact, not a decision Orion can make.',
        orionRecommends: 'request_info',
        whyRecommends: 'This single date determines the entire trademark strategy. If Endless Tales pre-dates April 17, 2026, we have strong common-law priority over the competitor. If not, Lex recommends filing now and establishing use going forward. Lex can finalize the strategy within 24 hours of receiving this date.',
        ifApproved: 'Lex receives the date and delivers a trademark filing recommendation within 24 hours. If the date pre-dates the competitor, Lex recommends filing immediately. LEX-004 closes.',
        ifDeferred: 'Every day of delay strengthens the competitor\'s common-law trademark position. The longer they operate publicly, the harder a future challenge becomes.',
        ifRejected: 'N/A — this is a request for a factual answer, not a policy decision.',
        costTimeAndMoney: '2 minutes to answer. USPTO filing ~$350 is a separate decision.',
        riskOfDelay: 'Competitor launched April 17, 2026. Every month of public operation builds their common-law claim. Filing priority depends on who was first in commerce.',
        followUpOwner: 'Lex',
        nextActionOnApprove: 'Marc sends date to Orion → Lex delivers trademark strategy recommendation within 24 hours.',
      },
      'buy defensive domain variants': {
        title: 'Buy defensive domain variants to block brand squatting',
        situation: 'An active competitor operates www.endless-tales.com since April 17, 2026, with an identical product. No party holds a USPTO trademark. Domain variants — endlesstales.co, endlesstales.app, endlesstales.io, getendlesstales.com — are currently unregistered and available. Acquiring them now costs ~$50 and closes a cheap brand-protection gap.',
        whatMarcDecides: 'Approve purchasing ~4 defensive domain variants at ~$10-15/year each (~$50 total).',
        whyOrionCannotDecide: 'Domain purchases cost real money. All spending requires Marc\'s authorization per ORION-FIN-001.',
        orionRecommends: 'approve',
        whyRecommends: 'This is the cheapest brand protection action available. ~$50 to prevent squatting. The competitor\'s existence makes this more urgent, not less. Delay costs nothing today but risks having a squatter register these domains as Endless Tales gains visibility.',
        ifApproved: 'Lex purchases the approved variants via registrar of Marc\'s choice. Redirects configured to drivetimetales.com. Lex confirms and reports back within 24 hours.',
        ifDeferred: 'Variants remain available. Risk grows as Endless Tales gains public visibility. Recovery via UDRP dispute costs significantly more.',
        ifRejected: 'Variants remain unregistered. Acceptable only if Marc is comfortable with the squatting risk.',
        costTimeAndMoney: '~$50 total for 4 domains at ~$10-15/year each. 10 minutes of Lex\'s time.',
        riskOfDelay: 'Once a squatter registers any variant, recovery is expensive or impossible. Risk is low today but grows with launch visibility.',
        followUpOwner: 'Lex',
        nextActionOnApprove: 'Lex purchases endlesstales.co, .app, .io, getendlesstales.com. Configures redirects. Reports confirmation within 24 hours.',
      },
    },
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
    description: 'Confirm trial: 7 days, card required upfront. Promo and referral paths may extend eligible trials.',
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
      'Confirmed — 7 days, card required upfront',
      '14 days, card required upfront',
    ],
    detail: {
      what: 'The codebase defaults trialDays to 7. GVL promo codes and referral paths can extend eligible trials to 14 days. Checkout requires a card.',
      why: 'Trial terms affect signup conversion rate, Stripe configuration, and all marketing copy. Wrong terms in marketing = broken user expectation on checkout.',
      recommendation: 'Confirm 7 days by default, card required upfront. Promo and referral exceptions should be represented explicitly in campaign copy.',
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

function mergeSeedMissionDetails(storedMissions: Mission[] | undefined): Mission[] {
  if (!storedMissions || storedMissions.length === 0) return SEED_MISSIONS

  const seedById = new Map(SEED_MISSIONS.map(mission => [mission.id, mission]))
  const storedIds = new Set(storedMissions.map(mission => mission.id))
  const merged = storedMissions.map(mission => {
    const seedMission = seedById.get(mission.id)
    if (!seedMission?.marcActionDetails) return mission
    return {
      ...mission,
      waitingOn: mission.waitingOn ?? seedMission.waitingOn,
      marcActionDetails: {
        ...seedMission.marcActionDetails,
        ...mission.marcActionDetails,
      },
    }
  })

  SEED_MISSIONS.forEach(seedMission => {
    if (!storedIds.has(seedMission.id)) merged.push(seedMission)
  })

  return merged
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
  const allStructuredBlockers = await readBlockers()

  const allBlockers: MarcBlocker[] = (state.blockers as MarcBlocker[]) ?? SEED_BLOCKERS
  // Archived blockers are excluded from all decision buckets — they have been closed by Orion.
  const isArchived = (b: MarcBlocker) => !!(b as MarcBlocker & { archived?: boolean }).archived
  const decisions = {
    active:   allBlockers.filter((b) => !b.done && !isArchived(b)),
    deferred: allBlockers.filter((b) => !isArchived(b) && b.done && b.resolution === 'deferred'),
    resolved: allBlockers.filter((b) => !isArchived(b) && b.done && b.resolution != null && b.resolution !== 'deferred'),
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

  const storedMissions = state.missions as Mission[] | undefined
  const missions = mergeSeedMissionDetails(storedMissions)

  return json({
    agents,
    missions,
    blockers: allBlockers,
    decisions,
    // Structured blockers.json SSoT — used by agent cards (via blockerIds) and Needs Your Decision panel
    structuredBlockers: allStructuredBlockers.filter(b => b.status === 'open'),
    allStructuredBlockers,
    // Return persisted Marc Action resolutions so all browsers hydrate from one source of truth
    marcActions: (state.marcActions as Record<string, unknown>) ?? {},
    readiness: (state.readiness as LaunchReadiness) ?? SEED_READINESS,
    m1: (state.m1 as Record<string, unknown>) ?? null,
    reports,
    source: Object.keys(state).length > 0 ? 'storage' : 'seed',
  })
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  try {
    const body = await req.json()

    // ─── resolve_blocker: structured blockers.json resolution workflow ──────
    if (body.action === 'resolve_blocker') {
      const { blockerId, resolution, resolvedBy } = body as {
        blockerId: string
        resolution: string
        resolvedBy?: string
      }

      if (!blockerId || typeof blockerId !== 'string') {
        return json({ success: false, error: 'blockerId is required' }, 400)
      }
      if (!resolution || typeof resolution !== 'string' || !resolution.trim()) {
        return json({ success: false, error: 'resolution text is required' }, 400)
      }

      // 1. Download and update blockers.json
      const allBlockers = await readBlockers()
      const blockerIndex = allBlockers.findIndex(b => b.id === blockerId)
      if (blockerIndex === -1) {
        return json({ success: false, error: `Blocker ${blockerId} not found` }, 404)
      }

      const updatedBlocker: Blocker = {
        ...allBlockers[blockerIndex],
        status: 'resolved',
        resolution: resolution.trim(),
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedBy ?? 'marc',
      }
      const updatedBlockers = [...allBlockers]
      updatedBlockers[blockerIndex] = updatedBlocker

      await writeBlockers(updatedBlockers)

      // 2. Update agent-state.json: remove blockerId from blocked_agent's blockerIds[]
      const agentStateMap = await readAgentState()
      const blockedAgent = updatedBlocker.blocked_agent
      const agentEntry = agentStateMap[blockedAgent]
      if (agentEntry?.blockerIds && Array.isArray(agentEntry.blockerIds)) {
        agentStateMap[blockedAgent] = {
          ...agentEntry,
          blockerIds: agentEntry.blockerIds.filter((id: string) => id !== blockerId),
        }
        await writeAgentState(agentStateMap)
      }

      return json({ success: true, blocker: updatedBlocker })
    }

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
      return json({ success: false, error: 'body must contain action, blockers, or marcActions' }, 400)
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
    const body = await req.json() as Record<string, unknown>

    // Auto-stamp currentTaskUpdatedAt when currentTask changes for any agent
    if (body.agents && typeof body.agents === 'object' && !Array.isArray(body.agents)) {
      const existing = await readOrgState()
      const existingAgents = (existing.agents ?? {}) as Record<string, Partial<AgentState>>
      const patchAgents = body.agents as Record<string, Partial<AgentState>>

      for (const agentId of Object.keys(patchAgents)) {
        const patchAgent = patchAgents[agentId]
        const now = new Date().toISOString()

        // Stamp currentTaskUpdatedAt ONLY when currentTask actually changes
        if (patchAgent?.currentTask !== undefined) {
          const existingCurrentTask = existingAgents[agentId]?.currentTask
          if (patchAgent.currentTask !== existingCurrentTask) {
            patchAgent.currentTaskUpdatedAt = now
          }
        }

        // lastUpdatedAt tracks file writes (prose, formatting, admin)
        // Always update on any PUT — this is NOT the task-change timestamp
        patchAgent.lastUpdatedAt = now

        patchAgents[agentId] = patchAgent
      }
      body.agents = patchAgents
    }

    // body can contain: agents, missions, blockers, readiness — any subset
    await writeOrgState(body)
    return json({ success: true })
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Failed to persist' }, 500)
  }
}
