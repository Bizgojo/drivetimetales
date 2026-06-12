export type ExternalToolLink = {
  id: string
  label: string
  url: string
}

export const COMMAND_CENTER_EXTERNAL_LINKS: ExternalToolLink[] = [
  { id: 'telegram', label: 'Telegram', url: 'https://web.telegram.org' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  { id: 'supabase', label: 'Supabase', url: 'https://supabase.com/dashboard' },
  { id: 'vercel', label: 'Vercel', url: 'https://vercel.com/dashboard' },
  { id: 'github', label: 'GitHub', url: 'https://github.com' },
]

export type AgentId = 'hal' | 'atlas' | 'codex' | 'susan' | 'orion' | 'maya' | 'vega' | 'bart' | 'lex'
export type AgentStatus = 'working' | 'waiting' | 'blocked' | 'complete' | 'idle'
export type MissionStatus = 'active' | 'waiting' | 'blocked' | 'complete' | 'archived'
export type MissionPriority = 'P1' | 'P2' | 'P3' | 'P4'

export interface AgentConfig {
  id: AgentId
  displayName: string
  emoji: string
  accentColor: string
  roleTitle: string
  responsibilities: string[]
}

export const AGENTS: AgentConfig[] = [
  {
    id: 'hal',
    displayName: 'Hal',
    emoji: '🎙',
    accentColor: '#f97316',
    roleTitle: 'Content Director',
    responsibilities: [
      'Story scripts and quality control',
      'ASC3 pipeline management',
      'ElevenLabs credit management',
      'Post-launch production queue',
      'Series continuity and sequencing',
    ],
  },
  {
    id: 'atlas',
    displayName: 'Atlas',
    emoji: '🗺',
    accentColor: '#0ea5e9',
    roleTitle: 'Operations Manager',
    responsibilities: [
      'Platform reliability and deployments',
      'Domain and infrastructure',
      'Stripe payments and checkout',
      'Security and admin access',
      'Cron health and monitoring',
    ],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    emoji: '💻',
    accentColor: '#22c55e',
    roleTitle: 'Technical Executor',
    responsibilities: [
      'Code implementation (Atlas-directed)',
      'Feature builds',
      'Bug fixes',
      'Refactors',
    ],
  },
  {
    id: 'susan',
    displayName: 'Susan',
    emoji: '📊',
    accentColor: '#a855f7',
    roleTitle: 'Marketing Manager',
    responsibilities: [
      'Subscriber acquisition strategy',
      'GTM plan and social channels',
      'Waitlist management',
      'Landing page brief',
      'Founding Member strategy',
    ],
  },
  {
    id: 'orion',
    displayName: 'Orion',
    emoji: '🔭',
    accentColor: '#ef4444',
    roleTitle: 'Chief Operating Officer',
    responsibilities: [
      'Organizational coordination',
      'Mission assignment and tracking',
      'Bottleneck resolution',
      'Launch readiness oversight',
      'Daily and weekly reporting to Marc',
    ],
  },
  {
    id: 'maya',
    displayName: 'Maya',
    emoji: '📐',
    accentColor: '#8b5cf6',
    roleTitle: 'Product Manager',
    responsibilities: [
      'Subscriber experience evaluation',
      'Retention risk analysis',
      'Discovery and navigation audit',
      'Onboarding assessment',
      'Mobile experience QA',
    ],
  },
  {
    id: 'vega',
    displayName: 'Vega',
    emoji: '🎧',
    accentColor: '#10b981',
    roleTitle: 'Audio Quality Manager',
    responsibilities: [
      'Audio quality standard (ASC3)',
      'Full catalog QC audit',
      'QC gate for all stories before Marc review',
      'Listening time verification',
      'Belle B voice consistency',
    ],
  },
  {
    id: 'bart',
    displayName: 'Bart',
    emoji: '💰',
    accentColor: '#16a34a',
    roleTitle: 'Chief Financial Officer',
    responsibilities: [
      'Financial ground truth',
      'Mercury / Stripe tracking',
      'Monthly recurring expenses',
      'Runway and cash forecast',
      'Budget and variance governance',
      'Expenditure review',
    ],
  },
  {
    id: 'lex',
    displayName: 'Lex',
    emoji: '⚖️',
    accentColor: '#7c3aed',
    roleTitle: 'Legal & Compliance',
    responsibilities: [
      'Terms of service and privacy policy',
      'Vendor contract review',
      'IP and trademark protection',
      'Regulatory compliance',
      'Trial terms and refund policy',
      'Commercial licensing verification',
    ],
  },
]

export interface AgentState {
  status: AgentStatus
  currentTask: string
  activeTasks?: string[]          // Ordered list of active work items (Orion-determined priority)
  percentComplete: number | null
  waitingOn: string
  blockerIds?: string[]           // References to structured Blocker records in blockers.json
  lastActivity: string
  lastUpdatedAt?: string          // ISO timestamp of most recent agent-state write (e.g. "2026-06-10T16:07:00Z")
  currentTaskUpdatedAt?: string   // ISO timestamp when currentTask last changed
  eta: string
  whyItMatters: string
  lastReport: { text: string; timestamp: string } | null
}

// ─── Structured Blocker (blockers.json SSoT) ─────────────────────────────────
// All blocked states on agent cards MUST reference a Blocker record.
// No free-text waitingOn for blocked agents — blockerIds is authoritative.

export interface Blocker {
  id: string                        // e.g. "blk-bart-x-billing"
  blocked_agent: AgentId | string   // which agent is blocked
  owner: string                     // "marc" | agent id | "resolved"
  requires_marc_action: boolean     // true → appears in Needs Your Decision panel
  status: 'open' | 'resolved' | 'superseded'
  headline: string                  // short display label for agent card
  context: string                   // full explanation
  recommendation: string            // what should be done
  resolution_target: string         // link anchor / mission ID
  updated_at: string                // ISO timestamp
  // Resolution fields (set when Marc resolves via the UI)
  resolution?: string | null        // free-text description of what was decided
  resolvedAt?: string | null        // ISO timestamp of resolution
  resolvedBy?: string | null        // "marc" or other actor
}

export interface Mission {
  id: string
  title: string
  agentId: AgentId | 'unassigned'
  status: MissionStatus
  priority: MissionPriority
  percentComplete: number | null
  waitingOn: string
  lastActivity: string
  eta: string
  notes: string
  unread: boolean
  createdAt: string
  updatedAt: string
  // ORION-UX-001 Executive Approval Card Standard fields
  orionRecommendation?: {
    stance: 'approve' | 'reject' | 'defer' | 'review'
    rationale: string
  }
  whyNeedsMarc?: string
  approvalConsequences?: string
  rejectionConsequences?: string
  urgency?: 'critical' | 'high' | 'medium' | 'low'
  urgencyReason?: string
  nextActionOnApprove?: string
  nextActionOnReject?: string
  // ORION-GOV-002 Marc Escalation Filter fields
  whyOrionCannotDecide?: string
  authorityCategory?: 'strategy' | 'publishing' | 'spending' | 'legal' | 'org-structure' | 'executive-judgment'
  resolveUrl?: string       // where Marc goes to resolve this — internal path or external URL
  marcActionDetails?: Partial<Record<string, MarcActionDetail>>
}

export const MISSION_PRIORITY_COLORS: Record<MissionPriority, string> = {
  P1: '#ef4444',
  P2: '#f97316',
  P3: '#64748b',
  P4: '#94a3b8',
}

export interface OrionReport {
  id: string
  type: 'morning' | 'evening' | 'weekly'
  content: string
  timestamp: string
}

export type DecisionResolution = 'decided' | 'deferred' | 'not_needed'
export type DecisionInputType = 'choice' | 'dropdown' | 'text' | 'confirm'

export interface MarcBlocker {
  // EXISTING — do not remove
  id: string
  description: string
  department: AgentId | string
  createdAt: string
  done: boolean
  resolvedAt: string | null

  // NEW — decision workflow fields
  title?: string                    // short clickable name (falls back to description if absent)
  detail?: {
    what: string                    // one sentence: what is the issue?
    why: string                     // one sentence: why does it matter?
    recommendation?: string         // Orion's recommendation
    followUpOwner?: string          // department that acts on Marc's answer
    nextActionTemplate?: string     // e.g. "Atlas updates Stripe with: {answer}"
  }
  inputType?: DecisionInputType
  choiceOptions?: string[]          // for 'choice' and 'dropdown' inputType
  chatGptPrompt?: string            // pre-filled prompt for "Ask ChatGPT" button

  // Resolution (set when Marc decides)
  resolution?: DecisionResolution | null
  answer?: string | null
  answeredAt?: string | null
  nextAction?: string | null        // computed from nextActionTemplate + answer
}

export interface MarcAction {
  id: string                // 'ma-<missionId>-<index>'
  missionId: string         // source mission ID (e.g. 'ATL-004')
  agentId: AgentId | string
  actionText: string        // the specific thing Marc must do (parsed from waitingOn)
  missionTitle: string      // from mission.title
  type: 'approve' | 'verify' | 'authorize' | 'decide' | 'review'
  done: boolean
  resolution: 'approved' | 'rejected' | 'deferred' | 'needs_info' | null
  resolvedAt: string | null
  note: string | null
  resolveUrl?: string       // propagated from source mission
  detail?: MarcActionDetail   // Full 13-field card data. If absent -> Draft Card only.
  isComplete: boolean         // true iff detail is present with all 13 fields populated
}

export interface MarcActionDetail {
  title: string                      // Plain-English decision title (NOT a mission ID)
  situation: string                  // What's happening that prompted this decision
  whatMarcDecides: string            // The specific question Marc is answering
  whyOrionCannotDecide: string       // Why Orion can't handle this
  orionRecommends: 'approve' | 'reject' | 'defer' | 'request_info'
  whyRecommends: string              // 2-4 sentences of plain reasoning
  ifApproved: string                 // Concrete outcome
  ifDeferred: string                 // Risk or consequence
  ifRejected: string                 // Risk or consequence (or 'N/A - see ifDeferred' if same)
  costTimeAndMoney: string           // e.g. "5 minutes, no cost" or "~$50"
  riskOfDelay: string                // What gets worse the longer Marc waits
  followUpOwner: string              // Named agent
  nextActionOnApprove: string        // First concrete step after Marc approves
}

export interface LaunchReadiness {
  score: number
  gatesGreen: number
  gatesYellow: number
  gatesRed: number
  bestCaseDate: string | null   // null = gate-based launch (no target date)
  mostLikelyDate: string | null // null = gate-based launch (no target date)
  updatedAt: string
}

// ─── M-1 Milestone ────────────────────────────────────────────────────────────
// Three consecutive fully autonomous story productions, zero human intervention.

export interface M1StorySlot {
  slot: number
  label: string
  title: string | null
  storyId: string | null
  status: string          // "Pending" | "Running" | "Vega Review" | "Qualified" | "Disqualified"
  jobId: string | null
  completedAt: string | null
  vegaResult: string | null   // "PASS" | "FAIL" | null
  vegaDetails: string | null
  qualifies: boolean
  disqualifyReason: string | null
  notes: string | null
}

export interface M1LeadingCandidate {
  slot: number
  storyId: string
  title: string
  narrator: string
  workflowState: string
  queuePosition: number
  rationale: string
}

export interface M1State {
  counter: number                          // 0 | 1 | 2 | 3
  definition: string
  gatesRequired: string[]
  gatesStatus: Record<string, string>      // "verified_complete" | "claimed_complete" | "not_started" | "blocked"
  gatesAllClear: boolean
  gateBlockSummary: string | null
  currentBlocker?: string | null
  leadingCandidate: M1LeadingCandidate | null
  approvedReadyQueue: { rank: number; storyId: string; title: string; narrator: string; queuedSince: string }[]
  stories: M1StorySlot[]
  lastUpdatedAt: string
  updatedBy: string
}

// ORION_CHAT_URL is deprecated — communication now via /api/admin/send-to-orion
// export const ORION_CHAT_URL = 'https://app.openclaw.ai/chat/orion'
