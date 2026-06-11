'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AGENTS,
  MISSION_PRIORITY_COLORS,

  type AgentConfig,
  type AgentId,
  type AgentState,
  type AgentStatus,
  type DecisionResolution,
  type LaunchReadiness,
  type MarcAction,
  type MarcBlocker,
  type Mission,
  type MissionPriority,
  type MissionStatus,
  type OrionReport,
} from '@/lib/config/command-center'

type AgentsState = Record<AgentId, AgentState>
type MobileTab = 'agents' | 'detail' | 'comms'

const AGENTS_KEY = 'cc_v2_agents'
const MISSIONS_KEY = 'cc_v2_missions'
const ACTIVE_MISSION_KEY = 'cc_v2_active_mission'
const ORION_REPORTS_KEY = 'cc_orion_reports'
const MARC_BLOCKERS_KEY = 'cc_marc_blockers'
const LAUNCH_READINESS_KEY = 'cc_launch_readiness'
const ORION_LAST_REPLY_KEY = 'cc_orion_last_reply'
const MARC_ACTIONS_KEY = 'cc_marc_actions'
const ORION_CHAT_KEY = 'cc_orion_chat_v1'
const ORION_CHAT_POLL_MS = 5000

// Agent display config for Orion Terminal (emoji + color)
const AGENT_TERMINAL_CONFIG: Record<string, { emoji: string; color: string; name: string }> = {
  marc:   { emoji: '👤', color: '#0f172a', name: 'Marc' },
  orion:  { emoji: '🧭', color: '#6366f1', name: 'Orion' },
  hal:    { emoji: '🎙', color: '#f59e0b', name: 'Hal' },
  atlas:  { emoji: '⚙️', color: '#3b82f6', name: 'Atlas' },
  maya:   { emoji: '🔮', color: '#8b5cf6', name: 'Maya' },
  susan:  { emoji: '🩷', color: '#ec4899', name: 'Susan' },
  vega:   { emoji: '🎚', color: '#10b981', name: 'Vega' },
  bart:   { emoji: '💰', color: '#16a34a', name: 'Bart' },
  system: { emoji: '⚡', color: '#94a3b8', name: 'System' },
}

const CC_BG = '#FAF9F6'
const CARD: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.06)',
}
const BTN: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: '7px',
  backgroundColor: '#fff',
  color: '#0f172a',
  fontWeight: 800,
  fontSize: '12px',
  padding: '0.5rem 0.65rem',
  cursor: 'pointer',
}

const STATUS_DOT_COLORS: Record<AgentStatus, string> = {
  working: '#eab308',
  waiting: '#3b82f6',
  blocked: '#ef4444',
  complete: '#22c55e',
  idle: '#94a3b8',
}

const PRIORITY_SORT: Record<MissionPriority, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
}

// IDs shown in the 5-card grid
const GRID_AGENT_IDS: AgentId[] = ['hal', 'atlas', 'maya', 'susan', 'vega', 'bart', 'lex']

// ORION-GOV-002 — Authority category display maps
const AUTHORITY_LABELS: Record<string, string> = {
  strategy: 'Strategy',
  publishing: 'Publishing',
  spending: 'Spending',
  legal: 'Legal',
  'org-structure': 'Org Structure',
  'executive-judgment': 'Exec Judgment',
}
const AUTHORITY_COLORS: Record<string, string> = {
  strategy: '#7c3aed',
  publishing: '#0369a1',
  spending: '#b45309',
  legal: '#dc2626',
  'org-structure': '#4b5563',
  'executive-judgment': '#0f172a',
}

function normalizeMarcActionText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function AgentBadge({ agentId }: { agentId: AgentId | string }) {
  const agent = AGENTS.find(a => a.id === agentId)
  return (
    <span style={{
      background: agent?.accentColor ?? '#475569',
      color: '#fff',
      borderRadius: 999,
      padding: '4px 9px',
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap' as const,
    }}>
      {agent ? `${agent.emoji} ${agent.displayName}` : agentId}
    </span>
  )
}

function Section({ label, body, highlight }: { label: string; body: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 14,
        color: highlight ? '#f1f5f9' : '#cbd5e1',
        lineHeight: 1.6,
        background: highlight ? '#1e3a5f' : 'transparent',
        borderRadius: highlight ? 6 : 0,
        padding: highlight ? '10px 12px' : 0,
      }}>
        {body}
      </div>
    </div>
  )
}

function OutcomeBox({ label, body, color }: { label: string; body: string; color: string }) {
  return (
    <div style={{ background: '#0f172a', border: `1px solid ${color}33`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
}

function InfoBox({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
}

function ResolveButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: `${color}22`,
      border: `1px solid ${color}88`,
      borderRadius: 8,
      padding: '10px 20px',
      color,
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
      flex: 1,
      minWidth: 100,
    }}>
      {label}
    </button>
  )
}

function MarcDecisionCard({
  action,
  onResolve,
}: {
  action: MarcAction
  onResolve: (id: string, resolution: MarcAction['resolution'], note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const d = action.detail

  if (!d) return null

  const recColor = {
    approve: '#22c55e',
    reject: '#ef4444',
    defer: '#f59e0b',
    request_info: '#3b82f6',
  }[d.orionRecommends]

  const recLabel = {
    approve: 'Approve',
    reject: 'Reject',
    defer: 'Defer',
    request_info: 'Request Info',
  }[d.orionRecommends]

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: 24,
      maxWidth: 680,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AgentBadge agentId={action.agentId} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>
            {d.title}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {action.missionId} · {action.id}
          </div>
        </div>
      </div>

      <Section label="Situation" body={d.situation} />
      <Section label="What you're being asked" body={d.whatMarcDecides} highlight />
      <Section label="Why this needs you" body={d.whyOrionCannotDecide} />

      <div style={{
        background: '#0f172a',
        borderRadius: 8,
        padding: 16,
        border: `1px solid ${recColor}44`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            background: recColor,
            color: '#000',
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 20,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Orion recommends: {recLabel}
          </span>
        </div>
        <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
          {d.whyRecommends}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <OutcomeBox label="If approved" body={d.ifApproved} color="#22c55e" />
        <OutcomeBox label="If deferred" body={d.ifDeferred} color="#f59e0b" />
        <OutcomeBox label="If rejected" body={d.ifRejected} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <InfoBox label="Cost" body={d.costTimeAndMoney} />
        <InfoBox label="Risk of delay" body={d.riskOfDelay} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <InfoBox label="Follow-up owner" body={d.followUpOwner} />
        <InfoBox label="Next action on approve" body={d.nextActionOnApprove} />
      </div>

      <textarea
        placeholder="Optional note for your decision..."
        value={note}
        onChange={e => setNote(e.target.value)}
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 12,
          color: '#f1f5f9',
          fontSize: 13,
          resize: 'vertical',
          minHeight: 60,
        }}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <ResolveButton label="Approve" color="#22c55e" onClick={() => onResolve(action.id, 'approved', note || null)} />
        <ResolveButton label="Defer" color="#f59e0b" onClick={() => onResolve(action.id, 'deferred', note || null)} />
        <ResolveButton label="Reject" color="#ef4444" onClick={() => onResolve(action.id, 'rejected', note || null)} />
        <ResolveButton label="Request Info" color="#3b82f6" onClick={() => onResolve(action.id, 'needs_info', note || null)} />
      </div>
    </div>
  )
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function writeLS<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function makeEmptyAgentState(): AgentState {
  return {
    status: 'idle',
    currentTask: '',
    activeTasks: [],
    percentComplete: null,
    waitingOn: '',
    lastActivity: '',
    eta: '',
    whyItMatters: '',
    lastReport: null,
  }
}

function makeSeedAgents(): AgentsState {
  return AGENTS.reduce((map, agent) => {
    map[agent.id] = makeEmptyAgentState()
    return map
  }, {} as AgentsState)
}

function clampPercent(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value)
  if (Number.isNaN(next)) return null
  return Math.min(100, Math.max(0, next))
}

function priorityBadge(priority: MissionPriority) {
  return (
    <span
      style={{
        backgroundColor: MISSION_PRIORITY_COLORS[priority],
        color: '#fff',
        fontSize: '9px',
        fontWeight: 900,
        padding: '1px 5px',
        borderRadius: 999,
      }}
    >
      {priority}
    </span>
  )
}

function sectionLabel(text: string) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginBottom: 6,
      }}
    >
      {text}
    </div>
  )
}

function divider() {
  return <div style={{ borderTop: '1px solid #f1f5f9', margin: '12px 0' }} />
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function inferActionType(text: string): MarcAction['type'] {
  const t = text.toLowerCase()
  if (t.includes('approve') || t.includes('accept')) return 'approve'
  if (t.includes('verify') || t.includes('re-verify') || t.includes('confirm')) return 'verify'
  if (t.includes('authoriz')) return 'authorize'
  return 'decide'
}

interface ChatMessage {
  id: string
  role: string
  agent: string
  content: string
  created_at: string
}

export default function AdminCommandCenterPage() {
  const [loaded, setLoaded] = useState(false)
  const [agentsState, setAgentsState] = useState<AgentsState>(() => makeSeedAgents())
  const [missions, setMissions] = useState<Mission[]>([])
  const [blockers, setBlockers] = useState<MarcBlocker[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('agents')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => readLS<ChatMessage[]>(ORION_CHAT_KEY, []))
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatAgentTarget, setChatAgentTarget] = useState<string>('orion')
  const [chatThinking, setChatThinking] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const [expandedBlockerId, setExpandedBlockerId] = useState<string | null>(null)
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [showResolvedBlockers, setShowResolvedBlockers] = useState(false)
  const [showDeferredBlockers, setShowDeferredBlockers] = useState(false)
  const missionWriteTimer = useRef<number | null>(null)
  const [orionReports, setOrionReports] = useState<OrionReport[]>(() => readLS<OrionReport[]>(ORION_REPORTS_KEY, []))
  const [marcActionResolutions, setMarcActionResolutions] = useState<Record<string, { resolution: MarcAction['resolution']; resolvedAt: string; note: string | null }>>(() =>
    readLS(MARC_ACTIONS_KEY, {})
  )
  const [selectedMarcActionId, setSelectedMarcActionId] = useState<string | null>(null)
  const [showResolvedMarcActions, setShowResolvedMarcActions] = useState(false)
  const [showDraftCards, setShowDraftCards] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

  useEffect(() => {
    // Fetch from API first, fall back to localStorage
    fetch('/api/admin/org-status')
      .then((r) => {
        if (!r.ok) throw new Error(`org-status ${r.status}`)
        return r.json()
      })
      .then((data: {
        agents?: AgentsState
        missions?: Mission[]
        blockers?: MarcBlocker[]
        marcActions?: Record<string, { resolution: MarcAction['resolution']; resolvedAt: string; note: string | null }>
        readiness?: LaunchReadiness
        reports?: OrionReport[]
        source?: string
      }) => {
        if (data.agents) {
          setAgentsState(data.agents)
          writeLS(AGENTS_KEY, data.agents)
        }
        if (data.missions) {
          setMissions(data.missions)
          writeLS(MISSIONS_KEY, data.missions)
        }
        // Marc Action resolutions: server is source of truth; merge localStorage under server values
        // This reconciles Firefox/Chrome split-brain: server-persisted resolutions win everywhere
        if (data.marcActions !== undefined) {
          const local = readLS<Record<string, { resolution: MarcAction['resolution']; resolvedAt: string; note: string | null }>>(MARC_ACTIONS_KEY, {})
          const merged = { ...local, ...data.marcActions } // server values overwrite local
          setMarcActionResolutions(merged)
          writeLS(MARC_ACTIONS_KEY, merged)
          // Migration push: if local has resolutions the server doesn't know about yet,
          // push the full merged set up immediately so all browsers converge.
          // This handles the case where old resolutions lived only in localStorage
          // before the PATCH fix was deployed.
          if (Object.keys(merged).length > Object.keys(data.marcActions).length) {
            fetch('/api/admin/org-status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ marcActions: merged }),
            }).catch(() => {})
          }
        }
        if (data.blockers) {
          // MERGE: API (state.json) is the source of truth for finalized states.
          // localStorage is preserved ONLY for in-flight resolutions (PATCH sent but not yet
          // reflected in a subsequent GET) — i.e. when the API has no resolution yet.
          //
          // BUG FIXED (2026-06-11): The previous logic unconditionally preferred localStorage
          // over the API whenever localStorage had any resolution/done value. This caused Orion's
          // direct state.json writes (archiving, closing deferred cards) to be silently overridden
          // by stale localStorage on every page load.
          //
          // Priority:  archived (API) > decided/approved/rejected (API) > deferred (local) > null (local)
          const localBlockers = readLS<MarcBlocker[]>(MARC_BLOCKERS_KEY, [])
          const merged = (data.blockers as MarcBlocker[]).map(apiBlocker => {
            const local = localBlockers.find(b => b.id === apiBlocker.id)
            const apiResolution = apiBlocker.resolution ?? null

            // API wins when it holds a terminal state — archived or any non-deferred resolution.
            // These states can only be set by Orion writing state.json directly, or by Marc
            // resolving through the UI (which immediately PATCHes the server).
            const apiIsFinal =
              (apiBlocker as MarcBlocker & { archived?: boolean }).archived === true ||
              (apiBlocker.done && apiResolution !== null && apiResolution !== 'deferred')

            if (apiIsFinal) {
              // API is authoritative — discard any stale localStorage state for this blocker.
              return {
                ...apiBlocker,
                resolution: apiResolution,
                done: apiBlocker.done ?? false,
              }
            }

            // API has no final resolution yet. If localStorage has a resolution (e.g. in-flight
            // PATCH that hasn't propagated), preserve it so the UI stays consistent.
            if (local && (local.resolution || local.done)) {
              return {
                ...apiBlocker,          // API provides fresh text/structure
                done: local.done,
                resolvedAt: local.resolvedAt,
                resolution: local.resolution ?? null,
                answer: local.answer ?? null,
                answeredAt: local.answeredAt ?? null,
                nextAction: local.nextAction ?? null,
              }
            }

            // Neither side has a resolution — normalize and return API structure.
            return {
              ...apiBlocker,
              resolution: apiResolution,
              done: apiBlocker.done ?? false,
            }
          })
          setBlockers(merged)
          writeLS(MARC_BLOCKERS_KEY, merged)
        }
        if (data.readiness) {
          writeLS(LAUNCH_READINESS_KEY, data.readiness)
        }
        if (data.reports && data.reports.length > 0) {
          setOrionReports(data.reports)
          writeLS(ORION_REPORTS_KEY, data.reports)
          // Note: if server returns empty (e.g. deployed env can't read local filesystem),
          // we preserve the localStorage cache so the modal still shows cached reports.
        }
        setLoaded(true)
      })
      .catch(() => {
        // API unavailable — fall back to localStorage (existing behavior)
        const storedAgents = readLS<AgentsState | null>(AGENTS_KEY, null)
        if (storedAgents) {
          setAgentsState({ ...makeSeedAgents(), ...storedAgents })
        } else {
          const seed = makeSeedAgents()
          setAgentsState(seed)
          writeLS(AGENTS_KEY, seed)
        }
        setMissions(readLS<Mission[]>(MISSIONS_KEY, []))
        setBlockers(readLS<MarcBlocker[]>(MARC_BLOCKERS_KEY, []))
        setLoaded(true)
      })
  }, [])

  // Escape key closes detail panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAgentId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (missionWriteTimer.current) window.clearTimeout(missionWriteTimer.current)
    }
  }, [])

  const activeBlockers = useMemo(() => blockers.filter((b) => !b.done), [blockers])

  const marcActions = useMemo<MarcAction[]>(() => {
    const seen = new Set<string>()
    const actions: MarcAction[] = []

    const parse = (waitingOn: string, missionId: string, agentId: AgentId | string, missionTitle: string, resolveUrl?: string, sourceMission?: Mission) => {
      if (!waitingOn) return
      waitingOn.split(' · ').forEach((part, idx) => {
        const trimmed = part.trim()
        if (!/^marc:/i.test(trimmed)) return
        const actionText = trimmed.replace(/^marc:\s*/i, '').trim()
        const normalizedText = normalizeMarcActionText(actionText)
        if (seen.has(normalizedText)) return
        seen.add(normalizedText)
        const detail = sourceMission?.marcActionDetails?.[normalizedText]
        const isComplete = !!detail && Object.values(detail).every(v => v !== '' && v !== null && v !== undefined)
        actions.push({
          id: `ma-${missionId}-${idx}`,
          missionId,
          agentId,
          actionText,
          missionTitle,
          type: inferActionType(actionText),
          done: false,
          resolution: null,
          resolvedAt: null,
          note: null,
          resolveUrl,
          detail,
          isComplete,
        })
      })
    }

    // Parse from missions
    missions.forEach(m => {
      if (m.status === 'complete' || m.status === 'archived') return
      parse(m.waitingOn ?? '', m.id, m.agentId, m.title, m.resolveUrl, m)
    })

    // Parse from agent states (for items not already in missions)
    Object.entries(agentsState).forEach(([agentId, state]) => {
      parse((state as AgentState).waitingOn ?? '', `agent-${agentId}`, agentId as AgentId, `${agentId} department`)
    })

    return actions
  }, [missions, agentsState])

  const launchReadiness = useMemo<LaunchReadiness | null>(() => {
    if (!loaded) return null
    return readLS<LaunchReadiness | null>(LAUNCH_READINESS_KEY, null)
  }, [loaded])

  // ─── Orion Terminal: polling effect ──────────────────────────────────────
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch('/api/admin/orion-chat')
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setChatMessages(data.messages)
          writeLS(ORION_CHAT_KEY, data.messages)
        }
      } catch {}
    }

    fetchMessages() // initial load
    const interval = setInterval(fetchMessages, ORION_CHAT_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  // ─── Orion Terminal: auto-scroll ──────────────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatThinking])

  // ─── Orion Terminal: clear thinking when agent responds ──────────────────
  useEffect(() => {
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (lastMsg && lastMsg.role !== 'marc') {
      setChatThinking(false)
    }
  }, [chatMessages])

  const resolveBlocker = (
    blockerId: string,
    resolution: DecisionResolution,
    answer: string | null = null
  ) => {
    const blocker = blockers.find((b) => b.id === blockerId)
    const nextAction =
      answer && blocker?.detail?.nextActionTemplate
        ? blocker.detail.nextActionTemplate.replace('{answer}', answer)
        : null

    const next = blockers.map((b) =>
      b.id === blockerId
        ? {
            ...b,
            done: true,
            resolvedAt: new Date().toISOString(),
            resolution,
            answer,
            answeredAt: new Date().toISOString(),
            nextAction,
          }
        : b
    )
    setBlockers(next)
    writeLS(MARC_BLOCKERS_KEY, next)
    setExpandedBlockerId(null)
    // Auto-expand the relevant section so Marc can see where the item landed
    if (resolution === 'deferred') setShowDeferredBlockers(true)
    // Persist to server — silent fail, localStorage is the backup
    fetch('/api/admin/org-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockers: next }),
    }).catch(() => {})
  }

  const resolveMarcAction = (id: string, resolution: MarcAction['resolution'], note: string | null = null) => {
    const next = { ...marcActionResolutions, [id]: { resolution, resolvedAt: new Date().toISOString(), note } }
    setMarcActionResolutions(next)
    writeLS(MARC_ACTIONS_KEY, next)
    setSelectedMarcActionId(null)
    // Persist to server
    fetch('/api/admin/org-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marcActions: next }),
    }).catch(() => {})
    // For needs_info: route to Orion (sole routing authority per ORION-GOV-003)
    if (resolution === 'needs_info' && note) {
      const act = marcActions.find(a => a.id === id)
      const owningDept = act?.agentId ?? 'unknown'
      const actionText = act?.actionText ?? id
      const missionId = act?.missionId ?? id

      // 1. Write Marc's question to orion_messages (audit trail entry 1)
      fetch('/api/admin/orion-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'marc',
          agent: 'marc',
          content: `📋 [Needs Your Decision — ${missionId}]\n\nMarc's question: "${note}"\n\nItem: ${actionText}\nOwning department: ${owningDept}\n\nRouted to Orion for review and consultation.`,
        }),
      }).catch(() => {})

      // 2. Notify Orion via Telegram (backup channel)
      fetch('/api/admin/send-to-orion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📋 NEEDS YOUR DECISION — Marc's question:\n"${note}"\n\nItem: ${actionText}\nMission: ${missionId}\nOwning dept: ${owningDept}\n\nOrion: you are the sole routing authority. Determine whether to answer directly or consult department(s). Respond in the Orion Terminal.`,
          source: 'marc-action-needs-decision',
        }),
      }).catch(() => {})
    }
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 3000)
  }

  const openMarcAction = (action: MarcAction) => {
    if (!action.isComplete) {
      showToast('This decision card is incomplete. Orion is working on it.')
      return
    }
    setSelectedMarcActionId(action.id)
    setMobileTab('agents')
    window.setTimeout(() => {
      document.getElementById('marc-actions')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const gridAgents = useMemo(
    () => AGENTS.filter((a) => GRID_AGENT_IDS.includes(a.id)),
    []
  )

  // ─── Orion Terminal: send handler ────────────────────────────────────────
  const sendChatMessage = async () => {
    const content = chatInput.trim()
    if (!content || chatSending) return

    // Optimistic local append
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'marc',
      agent: 'marc',
      content,
      created_at: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, optimistic])
    setChatInput('')
    setChatSending(true)
    setChatThinking(true)

    try {
      await fetch('/api/admin/orion-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'marc', agent: 'marc', content }),
      })
    } catch {}

    setChatSending(false)
    // chatThinking stays true until next poll brings a response; clear after 60s max
    setTimeout(() => setChatThinking(false), 60000)
  }

  // ─── Marc Blockers Panel ────────────────────────────────────────────────────

  const renderBlockersPanel = () => {
    // Archived blockers (set by Orion via state.json) are excluded from all sections.
    // They have served their purpose and should not appear in any UI section.
    const isArchived = (b: MarcBlocker) => !!(b as MarcBlocker & { archived?: boolean }).archived
    const activeOnes = blockers.filter((b) => !b.done && !isArchived(b))
    // Use loose != null to catch both null AND undefined (e.g. old stored data without the field)
    const deferredOnes = blockers.filter((b) => !isArchived(b) && b.done && b.resolution === 'deferred')
    const resolvedOnes = blockers.filter((b) => !isArchived(b) && b.done && b.resolution != null && b.resolution !== 'deferred')

    const activeMarcActions = marcActions.filter(a => {
      const res = marcActionResolutions[a.id]
      return (!res || res.resolution === null) && a.isComplete
    })

    const draftMarcActions = marcActions.filter(a => {
      const res = marcActionResolutions[a.id]
      return (!res || res.resolution === null) && !a.isComplete
    })

    const resolvedMarcActions = marcActions.filter(a => {
      const res = marcActionResolutions[a.id]
      return !!res && res.resolution !== 'needs_info'
    })

    if (blockers.length === 0 && marcActions.length === 0) return null

    const deptBadge = (departmentId: string) => {
      const agent = AGENTS.find((a) => a.id === departmentId)
      if (!agent) return (
        <span style={{ backgroundColor: '#f1f5f9', color: '#475569', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
          {departmentId}
        </span>
      )
      return (
        <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
          {agent.emoji} {agent.displayName}
        </span>
      )
    }

    const resolutionBadge = (resolution: DecisionResolution | null | undefined) => {
      if (!resolution) return null
      const map: Record<DecisionResolution, { label: string; bg: string; color: string }> = {
        decided: { label: 'Decided', bg: '#d1fae5', color: '#065f46' },
        deferred: { label: 'Deferred', bg: '#f1f5f9', color: '#475569' },
        not_needed: { label: 'Not Needed', bg: '#fef2f2', color: '#991b1b' },
      }
      const s = map[resolution]
      return (
        <span style={{ backgroundColor: s.bg, color: s.color, borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
          {s.label}
        </span>
      )
    }

    const renderInput = (blocker: MarcBlocker) => {
      const { id, inputType, choiceOptions } = blocker
      const draft = draftAnswers[id] ?? ''

      if (inputType === 'choice') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {(choiceOptions ?? []).map((opt) => (
              <label
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#0f172a',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#fff',
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="radio"
                  name={`blocker-choice-${id}`}
                  value={opt}
                  checked={false}
                  onChange={() => resolveBlocker(id, 'decided', opt)}
                  style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                />
                {opt}
              </label>
            ))}
          </div>
        )
      }

      if (inputType === 'dropdown') {
        return (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) resolveBlocker(id, 'decided', e.target.value)
            }}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 13,
              color: '#0f172a',
              backgroundColor: '#fff',
            }}
          >
            <option value="">— select an option —</option>
            {(choiceOptions ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      }

      if (inputType === 'text') {
        const draft = draftAnswers[id] ?? ''
        return (
          <div>
            <textarea
              rows={3}
              placeholder="Type your answer..."
              value={draft}
              onChange={(e) => setDraftAnswers((prev) => ({ ...prev, [id]: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                color: '#0f172a',
                fontFamily: 'inherit',
                resize: 'vertical' as const,
                boxSizing: 'border-box' as const,
                marginBottom: 8,
              }}
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => resolveBlocker(id, 'decided', draft)}
              style={{
                ...BTN,
                backgroundColor: draft.trim() ? '#10b981' : '#e2e8f0',
                color: draft.trim() ? '#fff' : '#94a3b8',
                borderColor: draft.trim() ? '#10b981' : '#e2e8f0',
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Submit Answer →
            </button>
          </div>
        )
      }

      if (inputType === 'confirm') {
        const confirmText = choiceOptions?.[0] ?? 'Confirm'
        return (
          <button
            type="button"
            onClick={() => resolveBlocker(id, 'decided', confirmText)}
            style={{
              ...BTN,
              width: '100%',
              backgroundColor: '#f59e0b',
              color: '#fff',
              borderColor: '#f59e0b',
              fontSize: 14,
              padding: '10px 16px',
              fontWeight: 700,
            }}
          >
            ✓ {confirmText}
          </button>
        )
      }

      return null
    }

    const renderBlockerRow = (blocker: MarcBlocker, section: 'active' | 'deferred' | 'resolved') => {
      const isExpanded = expandedBlockerId === blocker.id
      const isResolved = section !== 'active'
      const titleText = blocker.title ?? blocker.description
      const truncated = titleText.length > 60 ? titleText.slice(0, 60) + '…' : titleText
      const daysOpen = Math.floor((Date.now() - new Date(blocker.createdAt).getTime()) / 86400000)
      const draft = draftAnswers[blocker.id] ?? ''

      const dotColor = section === 'resolved' ? '#22c55e' : section === 'deferred' ? '#f59e0b' : '#ef4444'
      const summaryBorderColor = section === 'resolved' ? '#d1fae5' : '#fde68a'
      const summaryBgColor = section === 'resolved' ? '#f0fdf4' : '#fffbeb'
      const summaryHeaderColor = section === 'resolved' ? '#065f46' : '#92400e'

      return (
        <div key={blocker.id}>
          {/* Row */}
          <div
            onClick={() => setExpandedBlockerId(isExpanded ? null : blocker.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 4px',
              borderBottom: '1px solid #fde68a',
              cursor: 'pointer',
              userSelect: 'none' as const,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
              <span style={{ marginRight: 6, fontSize: 11, color: '#94a3b8' }}>{isExpanded ? '▼' : '▶'}</span>
              {truncated}
              {isResolved && blocker.answer && (
                <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 400, marginTop: 2, fontStyle: 'italic' }}>
                  → {blocker.answer.length > 80 ? blocker.answer.slice(0, 80) + '…' : blocker.answer}
                </span>
              )}
            </span>
            {deptBadge(blocker.department)}
            <span style={{ fontSize: 11, color: '#92400e', whiteSpace: 'nowrap' as const }}>{daysOpen}d</span>
            {isResolved && resolutionBadge(blocker.resolution)}
          </div>

          {/* Resolved Accordion — summary only, no inputs (finalized decisions) */}
          {isExpanded && section === 'resolved' && (
            <div style={{
              margin: '8px 0 12px',
              borderRadius: 8,
              overflow: 'hidden',
              border: `1px solid ${summaryBorderColor}`,
              backgroundColor: summaryBgColor,
              padding: '14px 16px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: summaryHeaderColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                Resolution Summary
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const }}>QUESTION: </span>
                <span style={{ fontSize: 13, color: '#0f172a' }}>{blocker.title ?? blocker.description}</span>
              </div>
              {blocker.answer && (
                <div style={{ marginBottom: 8, padding: '8px 12px', backgroundColor: '#fff', borderRadius: 6, border: `1px solid ${summaryBorderColor}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: 4 }}>MARC&apos;S ANSWER</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{blocker.answer}</div>
                </div>
              )}
              {blocker.answeredAt && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const }}>DATE ANSWERED: </span>
                  <span style={{ fontSize: 13, color: '#0f172a' }}>{new Date(blocker.answeredAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {blocker.detail?.followUpOwner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const }}>FOLLOW-UP OWNER:</span>
                  {deptBadge(blocker.detail.followUpOwner)}
                </div>
              )}
              {blocker.nextAction && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, marginBottom: 4 }}>NEXT ACTION</div>
                  <div style={{ fontSize: 13, color: '#0f172a', padding: '8px 12px', backgroundColor: '#fff', borderRadius: 6, border: `1px solid ${summaryBorderColor}` }}>{blocker.nextAction}</div>
                </div>
              )}
              {/* deferred items no longer reach this branch — handled by active accordion below */}
            </div>
          )}

          {/* Active / Deferred Accordion — full decision UI with inputs */}
          {isExpanded && (section === 'active' || section === 'deferred') && (
            <div style={{ margin: '8px 0 12px', borderRadius: 8, overflow: 'hidden', border: section === 'deferred' ? '1px solid #fde68a' : '1px solid #e2e8f0' }}>

              {/* Previously Deferred banner */}
              {section === 'deferred' && (
                <div style={{
                  backgroundColor: '#fffbeb',
                  padding: '10px 16px',
                  borderBottom: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>⏸</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                      Previously Deferred
                      {blocker.resolvedAt && (
                        <span style={{ fontWeight: 400, marginLeft: 6 }}>
                          — {new Date(blocker.resolvedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          {' at '}
                          {new Date(blocker.resolvedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                      Enter your answer below to resolve this decision, or defer again.
                    </div>
                  </div>
                </div>
              )}

              {/* Issue card */}
              {blocker.detail && (
                <div style={{ backgroundColor: '#fffbeb', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>Issue</div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>WHAT: </span>
                    <span style={{ fontSize: 13, color: '#0f172a' }}>{blocker.detail.what}</span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>WHY IT MATTERS: </span>
                    <span style={{ fontSize: 13, color: '#0f172a' }}>{blocker.detail.why}</span>
                  </div>
                  {blocker.detail.recommendation && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>ORION RECOMMENDS: </span>
                      <span style={{ fontSize: 13, color: '#0f172a', fontStyle: 'italic' }}>{blocker.detail.recommendation}</span>
                    </div>
                  )}
                  {blocker.detail.followUpOwner && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>FOLLOW-UP OWNER:</span>
                      {deptBadge(blocker.detail.followUpOwner)}
                    </div>
                  )}
                </div>
              )}

              {/* Answer section */}
              <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>Your Answer</div>
                {renderInput(blocker)}
              </div>

              {/* Action row — always: Defer + Ask ChatGPT */}
              <div style={{
                backgroundColor: '#fff',
                padding: '10px 16px',
                display: 'flex',
                flexWrap: 'wrap' as const,
                gap: 8,
                alignItems: 'center',
              }}>
                <button
                  type="button"
                  onClick={() => resolveBlocker(blocker.id, 'deferred', null)}
                  style={{ ...BTN, backgroundColor: '#64748b', color: '#fff', borderColor: '#64748b' }}
                >
                  → Defer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const prompt = blocker.chatGptPrompt
                      ?? `I need to make a decision about: "${blocker.title ?? blocker.description}". ${blocker.detail?.what ?? ''} ${blocker.detail?.why ?? ''} What should I consider?`
                    window.open(`https://chat.openai.com/?q=${encodeURIComponent(prompt)}`, '_blank')
                  }}
                  style={{ ...BTN, backgroundColor: '#8b5cf6', color: '#fff', borderColor: '#8b5cf6' }}
                >
                  💬 Ask ChatGPT
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div
        style={{
          border: '2px solid #f59e0b',
          borderRadius: 8,
          backgroundColor: '#fffbeb',
          padding: '12px 16px',
          marginBottom: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 700, color: '#92400e' }}>⚠️ Needs Your Decision</span>
          {(activeOnes.length + activeMarcActions.length) > 0 && (
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
              {activeOnes.length + activeMarcActions.length} active
            </span>
          )}
          {activeMarcActions.length > 0 && (
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
              {activeMarcActions.length} actions needed
            </span>
          )}
          {draftMarcActions.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              {draftMarcActions.length} incomplete card{draftMarcActions.length !== 1 ? 's' : ''} held — Orion documentation pending
            </div>
          )}
          {deferredOnes.length > 0 && (
            <span style={{ backgroundColor: '#fef3c7', color: '#b45309', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
              {deferredOnes.length} deferred
            </span>
          )}
          {activeOnes.length === 0 && activeMarcActions.length === 0 && (
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✓ All resolved</span>
          )}
        </div>

        {/* Active blockers */}
        {activeOnes.length === 0 && deferredOnes.length === 0 && resolvedOnes.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>(No decisions pending)</div>
        )}
        {/* Marc Actions Required — auto-derived from missions */}
        {activeMarcActions.length > 0 && (
          <div id="marc-actions" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              🎯 Marc Actions Required
              <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {activeMarcActions.length}
              </span>
            </div>
            {activeMarcActions.map(action => {
              const agent = AGENTS.find(a => a.id === action.agentId)
              const missionForAction = missions.find(m => m.id === action.missionId)
              const urgency = missionForAction?.urgency
              const urgencyPillColor = urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#d97706' : urgency === 'medium' ? '#3b82f6' : urgency === 'low' ? '#64748b' : null
              const recStance = action.detail?.orionRecommends
              const recBadgeColor = recStance === 'approve' ? '#16a34a' : recStance === 'reject' ? '#dc2626' : recStance === 'defer' ? '#d97706' : recStance === 'request_info' ? '#3b82f6' : null
              const recBadgeText = recStance === 'approve' ? 'APPROVE' : recStance === 'reject' ? 'REJECT' : recStance === 'defer' ? 'DEFER' : recStance === 'request_info' ? 'REQUEST INFO' : null
              return (
                <div
                  key={action.id}
                  onClick={() => setSelectedMarcActionId(action.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #fde68a',
                    backgroundColor: '#fff',
                    marginBottom: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                    {action.type === 'approve' ? '✅' : action.type === 'verify' ? '🔍' : action.type === 'authorize' ? '🔐' : '🤔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{action.detail?.title ?? action.actionText}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                      {agent && (
                        <span style={{ fontSize: 10, color: '#fff', backgroundColor: agent.accentColor, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>
                          {agent.emoji} {agent.displayName}
                        </span>
                      )}
                      <span
                        onClick={e => { e.stopPropagation(); setSelectedMarcActionId(action.id) }}
                        style={{ fontSize: 10, color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {action.missionId}
                      </span>
                      {urgencyPillColor && urgency && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', backgroundColor: urgencyPillColor, borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                          {urgency.toUpperCase()}
                        </span>
                      )}
                      {recBadgeColor && recBadgeText && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: recBadgeColor, backgroundColor: `${recBadgeColor}18`, borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase' as const, letterSpacing: '0.04em', border: `1px solid ${recBadgeColor}40` }}>
                          🧭 {recBadgeText}
                        </span>
                      )}
                      {(() => {
                        const m = missions.find(m => m.id === action.missionId)
                        return (
                          <>
                            {m?.authorityCategory && (
                              <span style={{
                                fontSize: 10,
                                color: '#fff',
                                backgroundColor: AUTHORITY_COLORS[m.authorityCategory] ?? '#4b5563',
                                borderRadius: 10,
                                padding: '1px 7px',
                                fontWeight: 700,
                                marginLeft: 4,
                              }}>
                                📌 {AUTHORITY_LABELS[m.authorityCategory]}
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>
                      {action.actionText}
                    </div>
                    {marcActionResolutions[action.id]?.resolution === 'needs_info' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: '#fff', backgroundColor: '#d97706', borderRadius: 10, padding: '2px 7px', fontWeight: 700 }}>
                          ↩ Routing to Orion
                        </span>
                        {marcActionResolutions[action.id]?.note && (
                          <span style={{ fontSize: 10, color: '#92400e', fontStyle: 'italic' }}>
                            &ldquo;{marcActionResolutions[action.id].note}&rdquo;
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, alignSelf: 'center' }}>›</span>
                </div>
              )
            })}
          </div>
        )}

        {draftMarcActions.length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowDraftCards(!showDraftCards)}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13 }}
            >
              {showDraftCards ? '▾' : '▸'} {draftMarcActions.length} incomplete card{draftMarcActions.length !== 1 ? 's' : ''} (Orion only)
            </button>
            {showDraftCards && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draftMarcActions.map(a => (
                  <div key={a.id} style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: '#64748b',
                  }}>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{a.actionText}</span>
                    <span style={{ marginLeft: 8 }}>— missing detail fields (source: {a.missionId})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Resolved Marc Actions (collapsed) */}
        {/* Deferred Marc Actions — separate from finalized; fully re-openable */}
        {resolvedMarcActions.filter(a => marcActionResolutions[a.id]?.resolution === 'deferred').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              ⏸ Deferred Decisions ({resolvedMarcActions.filter(a => marcActionResolutions[a.id]?.resolution === 'deferred').length})
            </div>
            <div>
              {resolvedMarcActions
                .filter(a => marcActionResolutions[a.id]?.resolution === 'deferred')
                .map(action => {
                  const res = marcActionResolutions[action.id]
                  const deferredAt = res?.resolvedAt ? new Date(res.resolvedAt) : null
                  const deferLabel = deferredAt
                    ? deferredAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                      ' ' + deferredAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : null
                  return (
                    <div
                      key={action.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 6,
                        border: '1px solid #fde68a',
                        backgroundColor: '#fffbeb',
                        marginBottom: 5,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                          {action.detail?.title ?? action.actionText}
                        </div>
                        {deferLabel && (
                          <div style={{ fontSize: 10, color: '#92400e' }}>Deferred {deferLabel}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMarcActionId(action.id)}
                        style={{
                          fontSize: 11, fontWeight: 700, color: '#92400e',
                          backgroundColor: '#fef3c7', border: '1px solid #fde68a',
                          borderRadius: 6, padding: '6px 10px',
                          cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const,
                          minHeight: 36,
                        }}
                      >
                        Review Decision →
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Finalized Marc Actions (approved / rejected) */}
        {resolvedMarcActions.filter(a => marcActionResolutions[a.id]?.resolution !== 'deferred').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowResolvedMarcActions(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#64748b', fontWeight: 700, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showResolvedMarcActions ? '▼' : '▶'}
              <span>✓ Handled Marc Actions ({resolvedMarcActions.filter(a => marcActionResolutions[a.id]?.resolution !== 'deferred').length})</span>
            </button>
            {showResolvedMarcActions && (
              <div style={{ marginTop: 4 }}>
                {resolvedMarcActions
                  .filter(a => marcActionResolutions[a.id]?.resolution !== 'deferred')
                  .map(action => {
                    const res = marcActionResolutions[action.id]
                    return (
                      <div key={action.id} style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span>{res?.resolution === 'approved' ? '✅' : '❌'}</span>
                        <span style={{ textDecoration: 'line-through' }}>{action.actionText}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {activeOnes.map((b) => renderBlockerRow(b, 'active'))}

        {/* Deferred section */}
        {deferredOnes.length > 0 && (
          <div style={{ marginTop: activeOnes.length > 0 ? 12 : 4, borderTop: activeOnes.length > 0 ? '1px solid #fde68a' : undefined, paddingTop: activeOnes.length > 0 ? 10 : 0 }}>
            <button
              type="button"
              onClick={() => setShowDeferredBlockers((prev) => !prev)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#92400e', fontWeight: 700, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showDeferredBlockers ? '▼' : '▶'}
              <span style={{ color: '#b45309' }}>⏸ Deferred ({deferredOnes.length})</span>
            </button>
            {showDeferredBlockers && (
              <div style={{ marginTop: 6 }}>
                {deferredOnes.map((b) => renderBlockerRow(b, 'deferred'))}
              </div>
            )}
          </div>
        )}

        {/* Resolved section */}
        {resolvedOnes.length > 0 && (
          <div style={{ marginTop: (activeOnes.length > 0 || deferredOnes.length > 0) ? 12 : 4 }}>
            <button
              type="button"
              onClick={() => setShowResolvedBlockers((prev) => !prev)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#64748b', fontWeight: 700, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showResolvedBlockers ? '▼' : '▶'}
              <span style={{ color: '#065f46' }}>✓ Resolved ({resolvedOnes.length})</span>
            </button>
            {showResolvedBlockers && (
              <div style={{ marginTop: 6 }}>
                {resolvedOnes.map((b) => renderBlockerRow(b, 'resolved'))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Agent Cards Grid ───────────────────────────────────────────────────────

  /** Format an ISO timestamp or date string as "MM/yyyy h:mm AM/PM".
   *  Falls back to "MM/yyyy" when no time component is available. */
  function formatLastUpdated(ts?: string): string | null {
    if (!ts) return null
    try {
      // Attempt full ISO parse first (includes time)
      const d = new Date(ts)
      if (isNaN(d.getTime())) return null
      const mm   = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      // Only show time if the original string contained a 'T' (ISO with time)
      if (ts.includes('T')) {
        const h24 = d.getHours()
        const min = String(d.getMinutes()).padStart(2, '0')
        const ampm = h24 >= 12 ? 'PM' : 'AM'
        const h12  = h24 % 12 || 12
        return `${mm}/${yyyy} ${h12}:${min} ${ampm}`
      }
      return `${mm}/${yyyy}`
    } catch {
      return null
    }
  }

  const renderAgentCard = (agent: AgentConfig) => {
    const state = agentsState[agent.id] ?? makeEmptyAgentState()
    const teaser =
      state.currentTask.length > 60
        ? state.currentTask.slice(0, 60) + '…'
        : state.currentTask

    return (
      <div
        key={agent.id}
        onClick={() => {
          setSelectedAgentId(agent.id)
          setMobileTab('detail')
        }}
        style={{
          ...CARD,
          cursor: 'pointer',
          borderTop: `4px solid ${agent.accentColor}`,
          padding: 16,
          transition: 'box-shadow 0.15s ease',
        }}
      >
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>{agent.emoji}</span>
          <span style={{ fontSize: 17, fontWeight: 800, marginLeft: 8, color: '#0f172a' }}>
            {agent.displayName}
          </span>
        </div>
        {/* Row 2 */}
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: formatLastUpdated(state.lastUpdatedAt) ? 2 : 8 }}>{agent.roleTitle}</div>
        {/* Row 2b — Last Updated timestamp */}
        {formatLastUpdated(state.lastUpdatedAt) && (
          <div style={{ fontSize: 10, color: '#b0b8c6', marginBottom: 8, letterSpacing: '0.01em' }}>
            Last Updated {formatLastUpdated(state.lastUpdatedAt)}
          </div>
        )}
        {/* Row 3 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: STATUS_DOT_COLORS[state.status],
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: STATUS_DOT_COLORS[state.status],
              marginLeft: 6,
            }}
          >
            {state.status}
          </span>
        </div>
        {/* Row 4 — Current Task (highest-priority active work) */}
        <div style={{ marginTop: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 3 }}>
            Current Task
          </div>
          <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.4, fontWeight: 600 }}>
            {state.currentTask || <span style={{ color: '#94a3b8' }}>Not set</span>}
          </div>
        </div>

        {/* Row 5 — Active Work list (Orion-prioritized, up to 5) */}
        {(state.activeTasks ?? []).length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 3 }}>
              Active Work
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(state.activeTasks ?? []).slice(0, 5).map((t, i) => (
                <li key={i} style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 2 }}>
                  <span style={{ color: agent.accentColor, fontWeight: 700, flexShrink: 0, lineHeight: 1.4 }}>•</span>
                  <span style={{ lineHeight: 1.35 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Row 6 – progress bar */}
        {state.percentComplete !== null && (
          <div
            style={{
              height: 4,
              backgroundColor: '#e2e8f0',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: `${state.percentComplete}%`,
                backgroundColor: agent.accentColor,
                height: '100%',
              }}
            />
          </div>
        )}

        {/* Row 7 — Waiting on / Marc action links */}
        {(() => {
          // Find unresolved MarcActions for this agent
          // ATL-SYNC-002 FIX A: mirror the panel's resolution filter so agent cards
          // reflect the same resolved/needs_info state as the Marc Actions panel.
          // Previously used a.resolution === null which is always true (action objects
          // are never mutated); this caused resolved items to persist on agent cards
          // even after Marc approved/rejected/deferred them in the panel.
          const agentMarcActions = marcActions.filter(a => {
            if (a.agentId !== agent.id) return false
            const res = marcActionResolutions[a.id]
            if (res && res.resolution !== 'needs_info') return false
            return true
          })
          const marcCount = agentMarcActions.length

          if (marcCount > 0) {
            // Marc is the blocker — show action links
            if (marcCount === 1) {
              const action = agentMarcActions[0]
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🔴</span> Waiting on Marc
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5, lineHeight: 1.3 }}>
                    {action.actionText.length > 70 ? action.actionText.slice(0, 70) + '…' : action.actionText}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openMarcAction(action)
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      backgroundColor: '#dc2626',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 12px',
                      minHeight: 44,
                      cursor: 'pointer',
                    }}
                  >
                    Resolve Issue →
                  </button>
                </div>
              )
            } else {
              // Multiple Marc blockers — link to Marc action queue section
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🔴</span> {marcCount} items waiting on Marc
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const completeAction = agentMarcActions.find(a => a.isComplete)
                      if (completeAction) {
                        openMarcAction(completeAction)
                        return
                      }
                      showToast('This decision card is incomplete. Orion is working on it.')
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      backgroundColor: '#dc2626',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 12px',
                      minHeight: 44,
                      cursor: 'pointer',
                    }}
                  >
                    View Marc-blocked items →
                  </button>
                </div>
              )
            }
          }

          // No Marc blocker — show existing waitingOn text if present
          if (state.waitingOn) {
            return (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
                ⏳ {state.waitingOn.length > 80 ? state.waitingOn.slice(0, 80) + '…' : state.waitingOn}
              </div>
            )
          }

          return null
        })()}
      </div>
    )
  }

  // ─── Launch Readiness Strip ─────────────────────────────────────────────────

  const renderReadinessStrip = () => {
    const data = launchReadiness
    return (
      <div
        style={{
          ...CARD,
          padding: '10px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {!data ? (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>(No readiness data)</span>
        ) : (
          <>
            <span
              style={{
                fontWeight: 800,
                fontSize: 16,
                color:
                  data.score <= 2 ? '#ef4444' : data.score === 3 ? '#f59e0b' : '#22c55e',
              }}
            >
              ★ {data.score}/5
            </span>
            <span style={{ fontSize: 13 }}>
              <span style={{ color: '#22c55e' }}>● {data.gatesGreen} green</span>
              <span style={{ color: '#64748b' }}> · </span>
              <span style={{ color: '#f59e0b' }}>● {data.gatesYellow} yellow</span>
              <span style={{ color: '#64748b' }}> · </span>
              <span style={{ color: '#ef4444' }}>● {data.gatesRed} red</span>
            </span>
            <span style={{ fontSize: 13, color: '#475569' }}>
              {data.bestCaseDate
                ? `Best case: ${data.bestCaseDate} · Most likely: ${data.mostLikelyDate}`
                : 'Launch is gate-based — no target date (Work Order 001 Rev D §2)'}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Updated {relativeTime(data.updatedAt)}
            </span>
          </>
        )}
      </div>
    )
  }

  // ─── Communication Panel ────────────────────────────────────────────────────

  // ─── Orion Terminal ────────────────────────────────────────────────────────
  const renderOrionTerminal = () => {
    return (
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', height: 'clamp(350px, calc(100vh - 220px), 520px)', padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          backgroundColor: '#f8fafc',
        }}>
          <span style={{ fontSize: 18 }}>🧭</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Orion Terminal</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Direct line to Orion — messages route automatically</div>
          </div>
          {/* Reports + Agent selector */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowReportsModal(true)}
              style={{ ...BTN, fontSize: 12, padding: '4px 10px', minHeight: 32 }}
            >
              📋 Reports
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>To:</span>
            <select
              value={chatAgentTarget}
              onChange={e => setChatAgentTarget(e.target.value)}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              <option value="orion">🧭 Orion</option>
              <option value="hal">🎙 Hal</option>
              <option value="atlas">⚙️ Atlas</option>
              <option value="maya">🔮 Maya</option>
              <option value="susan">🩷 Susan</option>
              <option value="vega">🎚 Vega</option>
              <option value="bart">💰 Bart</option>
            </select>
          </div>
        </div>

        {/* Message list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {chatMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧭</div>
              <div>Send a message to start a conversation with Orion.</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Messages route automatically — no need to tag anyone.</div>
            </div>
          )}

          {chatMessages.map(msg => {
            const isMarc = msg.role === 'marc'
            const config = AGENT_TERMINAL_CONFIG[msg.agent] ?? AGENT_TERMINAL_CONFIG['orion']
            const bubbleTime = (() => {
              const d = new Date(msg.created_at)
              return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            })()

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: isMarc ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  gap: 6,
                }}
              >
                {/* Avatar */}
                {!isMarc && (
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: config.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    flexShrink: 0,
                  }}>
                    {config.emoji}
                  </div>
                )}
                {/* Bubble */}
                <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isMarc ? 'flex-end' : 'flex-start' }}>
                  {!isMarc && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, fontWeight: 600 }}>
                      {config.name}
                    </div>
                  )}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: isMarc ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    backgroundColor: isMarc ? '#6366f1' : '#f1f5f9',
                    color: isMarc ? '#fff' : '#0f172a',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
                    {bubbleTime}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Thinking indicator */}
          {chatThinking && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                backgroundColor: AGENT_TERMINAL_CONFIG[chatAgentTarget]?.color ?? '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
              }}>
                {AGENT_TERMINAL_CONFIG[chatAgentTarget]?.emoji ?? '🧭'}
              </div>
              <div style={{
                padding: '8px 14px',
                borderRadius: '14px 14px 14px 4px',
                backgroundColor: '#f1f5f9',
                fontSize: 13,
                color: '#94a3b8',
                fontStyle: 'italic',
              }}>
                {AGENT_TERMINAL_CONFIG[chatAgentTarget]?.name ?? 'Orion'} is thinking…
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Sticky input */}
        <div style={{
          borderTop: '1px solid #e2e8f0',
          padding: '10px 12px',
          backgroundColor: '#fff',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendChatMessage()
                }
              }}
              placeholder={`Message ${AGENT_TERMINAL_CONFIG[chatAgentTarget]?.name ?? 'Orion'}… (Enter to send, Shift+Enter for newline)`}
              rows={2}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                fontSize: 14,
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.4,
                color: '#0f172a',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || chatSending}
              style={{
                ...BTN,
                backgroundColor: chatInput.trim() && !chatSending ? '#6366f1' : '#e2e8f0',
                color: chatInput.trim() && !chatSending ? '#fff' : '#94a3b8',
                borderColor: chatInput.trim() && !chatSending ? '#6366f1' : '#e2e8f0',
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 700,
                minWidth: 72,
                minHeight: 44,
                cursor: chatInput.trim() && !chatSending ? 'pointer' : 'not-allowed',
                borderRadius: 10,
              }}
            >
              {chatSending ? '…' : '↑'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, textAlign: 'center' }}>
            Messages route to {AGENT_TERMINAL_CONFIG[chatAgentTarget]?.name ?? 'Orion'} · Telegram backup active · Refreshes every 5s
          </div>
        </div>
      </div>
    )
  }

  // ─── Agent Detail Panel ─────────────────────────────────────────────────────

  const renderDetailPanel = () => {
    if (!selectedAgentId) return null
    const agent = AGENTS.find((a) => a.id === selectedAgentId)
    if (!agent) return null
    const state = agentsState[selectedAgentId] ?? makeEmptyAgentState()

    // Backlog = all missions for this agent that are NOT the current task, NOT complete, NOT archived
    const currentTaskMission = missions.find(m => m.agentId === selectedAgentId && m.status === 'active')
    const backlogMissions = missions
      .filter(
        (m) =>
          m.agentId === selectedAgentId &&
          m.status !== 'complete' &&
          m.status !== 'archived' &&
          m.id !== currentTaskMission?.id
      )
      .sort(
        (a, b) =>
          PRIORITY_SORT[a.priority] - PRIORITY_SORT[b.priority] ||
          Date.parse(a.createdAt) - Date.parse(b.createdAt)
      )

    const panelContent = (
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setSelectedAgentId(null)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            fontSize: 20,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          ×
        </button>

        {/* Header */}
        <div
          style={{
            borderTop: `4px solid ${agent.accentColor}`,
            paddingTop: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            {agent.emoji} {agent.displayName}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{agent.roleTitle}</div>
        </div>

        {/* Responsibilities */}
        {sectionLabel('Responsibilities')}
        <ul
          style={{
            margin: '0 0 12px',
            paddingLeft: 20,
            fontSize: 13,
            color: '#475569',
            lineHeight: 1.6,
          }}
        >
          {agent.responsibilities.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        {divider()}

        {/* Current Task */}
        {sectionLabel('Current Task')}
        <div style={{ fontSize: 13, color: '#0f172a', marginBottom: 12 }}>
          {state.currentTask || <span style={{ color: '#94a3b8' }}>(Not set)</span>}
        </div>

        {/* Why It Matters */}
        {sectionLabel('Why It Matters')}
        <div style={{ fontSize: 13, color: '#475569', fontStyle: 'italic', marginBottom: 12 }}>
          {state.whyItMatters || <span style={{ color: '#94a3b8', fontStyle: 'normal' }}>(Not set)</span>}
        </div>

        {divider()}

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {sectionLabel('Status')}
          <span
            style={{
              backgroundColor: STATUS_DOT_COLORS[state.status] + '20',
              color: STATUS_DOT_COLORS[state.status],
              borderRadius: 12,
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {state.status}
          </span>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {sectionLabel('Progress')}
          {state.percentComplete !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  width: 100,
                  height: 6,
                  backgroundColor: '#e2e8f0',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${state.percentComplete}%`,
                    height: '100%',
                    backgroundColor: agent.accentColor,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: '#475569' }}>{state.percentComplete}%</span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>—</span>
          )}
        </div>

        {/* Blocked callout */}
        {state.status === 'blocked' && (
          <div
            style={{
              border: '1px solid #ef4444',
              borderRadius: 6,
              backgroundColor: '#fef2f2',
              padding: 12,
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>🚫 Blocked On</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>{state.waitingOn}</div>
          </div>
        )}

        {divider()}

        {/* Backlog */}
        {sectionLabel('Backlog')}
        {backlogMissions.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
            (No backlog items)
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {backlogMissions.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  padding: '4px 0',
                }}
              >
                {priorityBadge(m.priority)}
                <span style={{ flex: 1, color: '#0f172a' }}>{m.title}</span>
                <span
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    borderRadius: 8,
                    padding: '1px 6px',
                    fontSize: 11,
                  }}
                >
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {divider()}

        {/* Last Report */}
        {sectionLabel('Last Report')}
        {state.lastReport ? (
          <blockquote
            style={{
              borderLeft: '3px solid #e2e8f0',
              paddingLeft: 12,
              margin: 0,
              color: '#475569',
              fontStyle: 'italic',
              fontSize: 13,
            }}
          >
            <p style={{ margin: '0 0 4px' }}>{state.lastReport.text}</p>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {formatTimestamp(state.lastReport.timestamp)}
            </span>
          </blockquote>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>(No report received)</div>
        )}
      </div>
    )

    return panelContent
  }

  // ─── Marc Action Detail Modal ───────────────────────────────────────────────

  const renderMarcActionModal = () => {
    if (!selectedMarcActionId) return null
    const action = marcActions.find(a => a.id === selectedMarcActionId)
    if (!action) return null

    // Deferred decisions open with full card regardless of isComplete
    const res = marcActionResolutions[action.id]
    const isDeferred = res?.resolution === 'deferred'

    if (!action.isComplete && !isDeferred) return null

    // Format "Previously Deferred" banner timestamp
    const deferredAt = isDeferred && res?.resolvedAt ? new Date(res.resolvedAt) : null
    const deferBannerText = deferredAt
      ? 'Previously Deferred — ' +
        deferredAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
        ' at ' + deferredAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null

    return (
      <div
        onClick={() => setSelectedMarcActionId(null)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const }}
        >
          {/* Previously Deferred banner */}
          {deferBannerText && (
            <div style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⏸</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                  {deferBannerText}
                </div>
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>
                  This decision was deferred. All options are still available — approve, reject, request info, or defer again.
                </div>
              </div>
            </div>
          )}
          {/* Full decision card — identical to first-time view */}
          <div style={isDeferred ? { borderRadius: '0 0 8px 8px', overflow: 'hidden' } : {}}>
            <MarcDecisionCard key={action.id} action={action} onResolve={resolveMarcAction} />
          </div>
          <button
            onClick={() => setSelectedMarcActionId(null)}
            style={{ ...BTN, marginTop: 8, width: '100%', color: '#cbd5e1', borderColor: '#334155', backgroundColor: '#0f172a' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ─── Orion Reports Modal ────────────────────────────────────────────────────

  const renderReportsModal = () => {
    if (!showReportsModal) return null
    const reports = [...orionReports].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    )

    const typeLabel = (type: OrionReport['type']) => {
      if (type === 'morning') return '🌅 MORNING REPORT'
      if (type === 'evening') return '🌆 EVENING REPORT'
      return '📊 WEEKLY REVIEW'
    }
    const typeBg = (type: OrionReport['type']) => {
      if (type === 'morning') return '#f0fdf4'
      if (type === 'evening') return '#eff6ff'
      return '#faf5ff'
    }

    return (
      <>
        <div
          onClick={() => setShowReportsModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 200,
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 640,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '80vh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch' as any,
            overscrollBehavior: 'contain' as any,
            backgroundColor: '#fff',
            borderRadius: 12,
            zIndex: 201,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              📋 Orion Reports
            </span>
            <button
              type="button"
              onClick={() => setShowReportsModal(false)}
              style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              ×
            </button>
          </div>

          {reports.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: '#94a3b8',
                marginTop: 32,
                fontSize: 14,
              }}
            >
              (No reports yet.)
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                style={{
                  marginBottom: 16,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: typeBg(report.type),
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#374151' }}>
                    {typeLabel(report.type)}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {formatTimestamp(report.timestamp)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 12,
                    padding: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    lineHeight: 1.5,
                    backgroundColor: '#fafafa',
                    color: '#374151',
                  }}
                >
                  {report.content}
                </div>
              </div>
            ))
          )}
        </div>
      </>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: CC_BG,
        color: '#0f172a',
        padding: '2rem 2rem 5rem',
      }}
    >
      <style jsx>{`
        .cc-agent-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }
        .cc-mobile-tabs {
          display: none;
        }
        .cc-tab-panel {
          display: block;
        }
        .cc-tab-panel[data-active='false'] {
          display: none;
        }
        .cc-desktop-only {
          display: block;
        }
        .cc-mobile-only {
          display: none;
        }
        @media (max-width: 900px) {
          .cc-agent-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 767px) {
          .cc-agent-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .cc-desktop-only {
            display: none;
          }
          .cc-mobile-only {
            display: block;
          }
          .cc-mobile-tabs {
            display: flex;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            height: 56px;
            background: #fff;
            border-top: 1px solid #e2e8f0;
            z-index: 20;
          }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: '#0f172a' }}>
            Command Center
          </h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{today}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowReportsModal(true)}
          style={BTN}
        >
          📋 Last Orion Report
        </button>
      </header>

      {/* Desktop layout */}
      <div className="cc-desktop-only">
        {renderBlockersPanel()}
        <div className="cc-agent-grid">{gridAgents.map(renderAgentCard)}</div>
        {renderReadinessStrip()}
        {renderOrionTerminal()}
      </div>

      {/* Mobile layout */}
      <div className="cc-mobile-only">
        <div className="cc-tab-panel" data-active={mobileTab === 'agents'}>
          {renderBlockersPanel()}
          <div className="cc-agent-grid">{gridAgents.map(renderAgentCard)}</div>
          {renderReadinessStrip()}
        </div>
        <div className="cc-tab-panel" data-active={mobileTab === 'detail'}>
          {selectedAgentId ? (
            <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>{renderDetailPanel()}</div>
          ) : (
            <div
              style={{
                ...CARD,
                padding: 32,
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: 14,
              }}
            >
              Tap an agent on the Team tab
            </div>
          )}
        </div>
        <div className="cc-tab-panel" data-active={mobileTab === 'comms'}>
          {renderOrionTerminal()}
        </div>
      </div>

      {/* Desktop Agent Detail Slide-in */}
      {selectedAgentId && (
        <div className="cc-desktop-only">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedAgentId(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.3)',
              zIndex: 100,
            }}
          />
          {/* Panel */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100vh',
              width: 480,
              backgroundColor: '#fff',
              zIndex: 101,
              overflowY: 'auto',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
              padding: 24,
            }}
          >
            {renderDetailPanel()}
          </div>
        </div>
      )}

      {/* Orion Reports Modal */}
      {renderReportsModal()}

      {/* Marc Action Detail Modal */}
      {renderMarcActionModal()}

      {toastMessage && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 76,
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 600,
          zIndex: 1200,
          boxShadow: '0 12px 28px rgba(15,23,42,0.22)',
        }}>
          {toastMessage}
        </div>
      )}

      {/* Mobile tab bar */}
      <nav className="cc-mobile-tabs">
        {(
          [
            ['agents', '👥', 'Team'],
            ['detail', '🔍', 'Detail'],
            ['comms', '💬', 'Comms'],
          ] as const
        ).map(([tab, emoji, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            style={{
              flex: 1,
              border: 0,
              borderTop: mobileTab === tab ? '3px solid #f97316' : '3px solid transparent',
              backgroundColor: '#fff',
              color: mobileTab === tab ? '#f97316' : '#475569',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'block', fontSize: '15px' }}>{emoji}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
