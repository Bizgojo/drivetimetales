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
const GRID_AGENT_IDS: AgentId[] = ['hal', 'atlas', 'maya', 'susan', 'vega', 'bart']

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

export default function AdminCommandCenterPage() {
  const [loaded, setLoaded] = useState(false)
  const [agentsState, setAgentsState] = useState<AgentsState>(() => makeSeedAgents())
  const [missions, setMissions] = useState<Mission[]>([])
  const [blockers, setBlockers] = useState<MarcBlocker[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('agents')
  const [orionMessage, setOrionMessage] = useState('')
  const [orionSending, setOrionSending] = useState(false)
  const [orionSendError, setOrionSendError] = useState<string | null>(null)
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
  const [marcActionNote, setMarcActionNote] = useState('')

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
        if (data.blockers) {
          // MERGE: preserve local resolution state, take structure from API
          const localBlockers = readLS<MarcBlocker[]>(MARC_BLOCKERS_KEY, [])
          const merged = (data.blockers as MarcBlocker[]).map(apiBlocker => {
            const local = localBlockers.find(b => b.id === apiBlocker.id)
            // If local has a resolution decision, preserve it over the API version
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
            // Normalize: ensure resolution is explicitly null (never undefined) so filters behave correctly
            return {
              ...apiBlocker,
              resolution: apiBlocker.resolution ?? null,
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

    const parse = (waitingOn: string, missionId: string, agentId: AgentId | string, missionTitle: string) => {
      if (!waitingOn) return
      waitingOn.split(' · ').forEach((part, idx) => {
        const trimmed = part.trim()
        if (!/^marc:/i.test(trimmed)) return
        const actionText = trimmed.replace(/^marc:\s*/i, '').trim()
        const key = actionText.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (seen.has(key)) return
        seen.add(key)
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
        })
      })
    }

    // Parse from missions
    missions.forEach(m => {
      if (m.status === 'complete' || m.status === 'archived') return
      parse(m.waitingOn ?? '', m.id, m.agentId, m.title)
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

  const [orionLastReply, setOrionLastReply] = useState<{ text: string; timestamp: string } | null>(null)
  useEffect(() => {
    if (loaded) {
      setOrionLastReply(readLS<{ text: string; timestamp: string } | null>(ORION_LAST_REPLY_KEY, null))
    }
  }, [loaded])

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
    setMarcActionNote('')
    // Persist to server
    fetch('/api/admin/org-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marcActions: next }),
    }).catch(() => {})
  }

  const gridAgents = useMemo(
    () => AGENTS.filter((a) => GRID_AGENT_IDS.includes(a.id)),
    []
  )

  // ─── Marc Blockers Panel ────────────────────────────────────────────────────

  const renderBlockersPanel = () => {
    const activeOnes = blockers.filter((b) => !b.done)
    // Use loose != null to catch both null AND undefined (e.g. old stored data without the field)
    const deferredOnes = blockers.filter((b) => b.done && b.resolution === 'deferred')
    const resolvedOnes = blockers.filter((b) => b.done && b.resolution != null && b.resolution !== 'deferred')

    const activeMarcActions = marcActions.filter(a => !marcActionResolutions[a.id])
    const resolvedMarcActions = marcActions.filter(a => !!marcActionResolutions[a.id])

    if (blockers.length === 0) return null

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

          {/* Resolved/Deferred Accordion — summary only, no inputs */}
          {isExpanded && isResolved && (
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
              {blocker.resolution === 'deferred' && (
                <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>
                  Deferred — no answer recorded. Click to re-open if needed... (currently view-only once resolved)
                </div>
              )}
            </div>
          )}

          {/* Accordion */}
          {isExpanded && !isResolved && (
            <div style={{ margin: '8px 0 12px', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>

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
          {deferredOnes.length > 0 && (
            <span style={{ backgroundColor: '#fef3c7', color: '#b45309', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
              {deferredOnes.length} deferred
            </span>
          )}
          {activeOnes.length === 0 && (
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✓ All resolved</span>
          )}
        </div>

        {/* Active blockers */}
        {activeOnes.length === 0 && deferredOnes.length === 0 && resolvedOnes.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>(No decisions pending)</div>
        )}
        {/* Marc Actions Required — auto-derived from missions */}
        {activeMarcActions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
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
              const recStance = missionForAction?.orionRecommendation?.stance
              const recBadgeColor = recStance === 'approve' ? '#16a34a' : recStance === 'reject' ? '#dc2626' : recStance === 'defer' ? '#d97706' : recStance === 'review' ? '#3b82f6' : null
              const recBadgeText = recStance === 'approve' ? 'APPROVE' : recStance === 'reject' ? 'REJECT' : recStance === 'defer' ? 'DEFER' : recStance === 'review' ? 'REVIEW' : null
              return (
                <div
                  key={action.id}
                  onClick={() => { setSelectedMarcActionId(action.id); setMarcActionNote('') }}
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
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{action.actionText}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                      {agent && (
                        <span style={{ fontSize: 10, color: '#fff', backgroundColor: agent.accentColor, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>
                          {agent.emoji} {agent.displayName}
                        </span>
                      )}
                      <span
                        onClick={e => { e.stopPropagation(); setSelectedMarcActionId(action.id); setMarcActionNote('') }}
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
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, alignSelf: 'center' }}>›</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Resolved Marc Actions (collapsed) */}
        {resolvedMarcActions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowResolvedMarcActions(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#64748b', fontWeight: 700, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showResolvedMarcActions ? '▼' : '▶'}
              <span>✓ Handled Marc Actions ({resolvedMarcActions.length})</span>
            </button>
            {showResolvedMarcActions && (
              <div style={{ marginTop: 4 }}>
                {resolvedMarcActions.map(action => {
                  const res = marcActionResolutions[action.id]
                  return (
                    <div key={action.id} style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{res?.resolution === 'approved' ? '✅' : res?.resolution === 'rejected' ? '❌' : '⏸'}</span>
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
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{agent.roleTitle}</div>
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

        {/* Row 7 — Waiting on (compact) */}
        {state.waitingOn && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
            ⏳ {state.waitingOn.length > 80 ? state.waitingOn.slice(0, 80) + '…' : state.waitingOn}
          </div>
        )}
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
              Best case: {data.bestCaseDate} · Most likely: {data.mostLikelyDate}
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

  const renderCommsPanel = () => {
    return (
      <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>
          Communication
        </div>

        {/* Field 1 – Orion */}
        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 6,
              display: 'block',
              color: '#0f172a',
            }}
          >
            Message Orion
          </label>
          <textarea
            value={orionMessage}
            onChange={(e) => setOrionMessage(e.target.value)}
            style={{
              width: '100%',
              minHeight: 80,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 8,
              fontFamily: 'inherit',
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              color: '#0f172a',
            }}
          />
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              disabled={orionSending}
              onClick={async () => {
                if (!orionMessage.trim() || orionSending) return
                setOrionSending(true)
                setOrionSendError(null)
                try {
                  const res = await fetch('/api/admin/send-to-orion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: orionMessage }),
                  })
                  const data = await res.json()
                  if (data.success) {
                    const reply = { text: `✓ Sent: "${orionMessage.slice(0, 80)}${orionMessage.length > 80 ? '…' : ''}"`, timestamp: new Date().toISOString() }
                    setOrionLastReply(reply)
                    writeLS(ORION_LAST_REPLY_KEY, reply)
                    setOrionMessage('')
                  } else {
                    setOrionSendError(data.error ?? 'Send failed')
                  }
                } catch {
                  setOrionSendError('Network error — could not reach server')
                } finally {
                  setOrionSending(false)
                }
              }}
              style={BTN}
            >
              {orionSending ? 'Sending…' : 'Send →'}
            </button>
            {orionSendError && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{orionSendError}</div>
            )}
          </div>
          {orionLastReply && (
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                color: '#64748b',
                marginTop: 8,
              }}
            >
              Last sent:{' '}
              {orionLastReply.text.length > 120
                ? orionLastReply.text.slice(0, 120) + '…'
                : orionLastReply.text}{' '}
              — {formatTimestamp(orionLastReply.timestamp)}
            </div>
          )}
        </div>

        {/* Field 2 – ChatGPT */}
        <div style={{ marginTop: 16 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 6,
              display: 'block',
              color: '#0f172a',
            }}
          >
            ChatGPT
          </label>
          <button
            type="button"
            onClick={() => window.open('https://chat.openai.com', '_blank')}
            style={BTN}
          >
            Open ChatGPT →
          </button>
          <span
            style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}
          >
            (Opens in new tab)
          </span>
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
    const mission = missions.find(m => m.id === action.missionId)
    const agent = AGENTS.find(a => a.id === action.agentId)

    // ── Urgency pill helpers ─────────────────────────────────────────────────
    const urgencyColor = (u: string | undefined): string => {
      if (u === 'critical') return '#dc2626'
      if (u === 'high') return '#d97706'
      if (u === 'medium') return '#3b82f6'
      if (u === 'low') return '#64748b'
      return '#94a3b8'
    }
    const urgencyLabel = (u: string | undefined): string => {
      if (!u) return ''
      return u.toUpperCase()
    }

    // ── Orion recommendation banner helpers ──────────────────────────────────
    const rec = mission?.orionRecommendation
    const recBg = (): string => {
      if (!rec) return '#f8fafc'
      if (rec.stance === 'approve') return '#f0fdf4'
      if (rec.stance === 'reject') return '#fef2f2'
      if (rec.stance === 'defer') return '#fffbeb'
      if (rec.stance === 'review') return '#eff6ff'
      return '#f8fafc'
    }
    const recTextColor = (): string => {
      if (!rec) return '#64748b'
      if (rec.stance === 'approve') return '#16a34a'
      if (rec.stance === 'reject') return '#dc2626'
      if (rec.stance === 'defer') return '#d97706'
      if (rec.stance === 'review') return '#3b82f6'
      return '#64748b'
    }
    const recBadgeLabel = (): string => {
      if (!rec) return 'NO RECOMMENDATION YET'
      if (rec.stance === 'approve') return 'APPROVE'
      if (rec.stance === 'reject') return 'REJECT'
      if (rec.stance === 'defer') return 'DEFER'
      if (rec.stance === 'review') return 'REVIEW NEEDED'
      return 'NO RECOMMENDATION YET'
    }

    // ── Section label helper ─────────────────────────────────────────────────
    const sectionLabel = (text: string) => (
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>
        {text}
      </div>
    )

    // ── Type icon ────────────────────────────────────────────────────────────
    const typeIcon = action.type === 'approve' ? '✅' : action.type === 'verify' ? '🔍' : action.type === 'authorize' ? '🔐' : '🤔'
    const typeLabel = action.type.toUpperCase()

    return (
      <div
        onClick={() => setSelectedMarcActionId(null)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        >
          {/* 1. Header row: type icon + TYPE BADGE ... URGENCY PILL */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18 }}>{typeIcon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', backgroundColor: '#f1f5f9', borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                {typeLabel}
              </span>
            </div>
            {mission?.urgency && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: urgencyColor(mission.urgency), borderRadius: 10, padding: '3px 10px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                {urgencyLabel(mission.urgency)}
              </span>
            )}
          </div>

          {/* 2. Decision title */}
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8, lineHeight: 1.3 }}>{action.actionText}</div>

          {/* 3. Agent badge + Mission ID badge */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 16 }}>
            {agent && (
              <span style={{ fontSize: 11, color: '#fff', backgroundColor: agent.accentColor, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                {agent.emoji} {agent.displayName}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
              {action.missionId}
            </span>
          </div>

          {/* 4. Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', marginBottom: 14 }} />

          {/* 5. WHAT */}
          <div style={{ marginBottom: 12 }}>
            {sectionLabel('What')}
            <div style={{ fontSize: 13, color: '#0f172a' }}>{action.actionText}</div>
          </div>

          {/* 6. WHY THIS NEEDS MARC */}
          <div style={{ marginBottom: 12 }}>
            {sectionLabel('Why This Needs Marc')}
            <div style={{ fontSize: 13, color: '#0f172a' }}>
              {mission?.whyNeedsMarc ?? mission?.waitingOn ?? 'N/A'}
            </div>
          </div>

          {/* 7. ORION RECOMMENDS banner */}
          <div style={{ backgroundColor: recBg(), border: `1px solid ${recTextColor()}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: rec?.rationale ? 6 : 0 }}>
              <span style={{ fontSize: 14 }}>🧭</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Orion Recommends</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: recTextColor(), borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginLeft: 'auto' }}>
                {recBadgeLabel()}
              </span>
            </div>
            {rec?.rationale && (
              <div style={{ fontSize: 12, color: recTextColor(), lineHeight: 1.5 }}>{rec.rationale}</div>
            )}
            {!rec && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No recommendation has been filed for this action yet.</div>
            )}
          </div>

          {/* 8. IF APPROVED */}
          <div style={{ marginBottom: 12 }}>
            {sectionLabel('If Approved')}
            <div style={{ fontSize: 12, color: '#0f172a' }}>{mission?.approvalConsequences ?? 'N/A'}</div>
          </div>

          {/* 9. IF REJECTED / DELAYED */}
          <div style={{ marginBottom: 14 }}>
            {sectionLabel('If Rejected / Delayed')}
            <div style={{ fontSize: 12, color: '#0f172a' }}>{mission?.rejectionConsequences ?? 'N/A'}</div>
          </div>

          {/* 10. Context divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e2e8f0' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const }}>Context</span>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e2e8f0' }} />
          </div>

          {/* 11. Mission title + status + % complete */}
          {mission && (
            <div style={{ marginBottom: 10 }}>
              {sectionLabel('Mission')}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>{mission.title}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 11, color: '#475569' }}>Status: <strong>{mission.status}</strong></span>
                {mission.percentComplete != null && (
                  <span style={{ fontSize: 11, color: '#475569' }}>{mission.percentComplete}% complete</span>
                )}
              </div>
            </div>
          )}

          {/* 12. Blocked on */}
          <div style={{ marginBottom: 10 }}>
            {sectionLabel('Blocked On')}
            <div style={{ fontSize: 12, color: '#475569' }}>{mission?.waitingOn || 'N/A'}</div>
          </div>

          {/* 13. Follow-up owner */}
          <div style={{ marginBottom: 10 }}>
            {sectionLabel('Follow-up Owner')}
            <div style={{ fontSize: 12, color: '#475569' }}>
              {agent ? `${agent.emoji} ${agent.displayName}` : 'N/A'}
            </div>
          </div>

          {/* 14. Next action on approve */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Next Action on Approve')}
            <div style={{ fontSize: 12, color: '#475569' }}>{mission?.nextActionOnApprove ?? 'N/A'}</div>
          </div>

          {/* 15. Optional note textarea */}
          <textarea
            value={marcActionNote}
            onChange={e => setMarcActionNote(e.target.value)}
            placeholder="Add a note (optional)..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, resize: 'vertical' as const, minHeight: 60, marginBottom: 12, boxSizing: 'border-box' as const }}
          />

          {/* 16. Approve / Reject / Defer buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button
              onClick={() => resolveMarcAction(action.id, 'approved', marcActionNote || null)}
              style={{ ...BTN, backgroundColor: '#16a34a', color: '#fff', borderColor: '#16a34a', flex: 1 }}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => resolveMarcAction(action.id, 'rejected', marcActionNote || null)}
              style={{ ...BTN, backgroundColor: '#dc2626', color: '#fff', borderColor: '#dc2626', flex: 1 }}
            >
              ❌ Reject
            </button>
            <button
              onClick={() => resolveMarcAction(action.id, 'deferred', marcActionNote || null)}
              style={{ ...BTN, flex: 1 }}
            >
              ⏸ Defer
            </button>
          </div>

          {/* 17. Cancel button */}
          <button
            onClick={() => setSelectedMarcActionId(null)}
            style={{ ...BTN, marginTop: 8, width: '100%', color: '#64748b', borderColor: '#e2e8f0' }}
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
        {renderCommsPanel()}
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
          {renderCommsPanel()}
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
