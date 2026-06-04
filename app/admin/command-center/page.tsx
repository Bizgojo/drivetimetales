'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AGENTS,
  MISSION_PRIORITY_COLORS,
  ORION_CHAT_URL,
  type AgentConfig,
  type AgentId,
  type AgentState,
  type AgentStatus,
  type LaunchReadiness,
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
const GRID_AGENT_IDS: AgentId[] = ['hal', 'atlas', 'maya', 'susan', 'vega']

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

export default function AdminCommandCenterPage() {
  const [loaded, setLoaded] = useState(false)
  const [agentsState, setAgentsState] = useState<AgentsState>(() => makeSeedAgents())
  const [missions, setMissions] = useState<Mission[]>([])
  const [blockers, setBlockers] = useState<MarcBlocker[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('agents')
  const [orionMessage, setOrionMessage] = useState('')
  const missionWriteTimer = useRef<number | null>(null)

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
          setBlockers(data.blockers)
          writeLS(MARC_BLOCKERS_KEY, data.blockers)
        }
        if (data.readiness) {
          writeLS(LAUNCH_READINESS_KEY, data.readiness)
        }
        if (data.reports) {
          writeLS(ORION_REPORTS_KEY, data.reports)
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

  const launchReadiness = useMemo<LaunchReadiness | null>(() => {
    if (!loaded) return null
    return readLS<LaunchReadiness | null>(LAUNCH_READINESS_KEY, null)
  }, [loaded])

  const orionLastReply = useMemo<{ text: string; timestamp: string } | null>(() => {
    if (!loaded) return null
    return readLS<{ text: string; timestamp: string } | null>(ORION_LAST_REPLY_KEY, null)
  }, [loaded])

  const markBlockerDone = (blockerId: string) => {
    const next = blockers.map((b) =>
      b.id === blockerId ? { ...b, done: true, resolvedAt: new Date().toISOString() } : b
    )
    setBlockers(next)
    writeLS(MARC_BLOCKERS_KEY, next)
  }

  const gridAgents = useMemo(
    () => AGENTS.filter((a) => GRID_AGENT_IDS.includes(a.id)),
    []
  )

  // ─── Marc Blockers Panel ────────────────────────────────────────────────────

  const renderBlockersPanel = () => {
    if (activeBlockers.length === 0) return null
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, color: '#92400e' }}>⚠️ Needs Your Decision</span>
          <span
            style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              borderRadius: 12,
              padding: '2px 8px',
              fontSize: 12,
            }}
          >
            {activeBlockers.length}
          </span>
        </div>
        {activeBlockers.map((blocker, idx) => {
          const agent = AGENTS.find((a) => a.id === blocker.department)
          const daysOpen = Math.floor((Date.now() - new Date(blocker.createdAt).getTime()) / 86400000)
          const isLast = idx === activeBlockers.length - 1
          return (
            <div
              key={blocker.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '6px 0',
                borderBottom: isLast ? 'none' : '1px solid #fde68a',
              }}
            >
              <span style={{ fontWeight: 600, flex: 1, fontSize: 13, color: '#0f172a' }}>
                {blocker.description}
              </span>
              {agent && (
                <span
                  style={{
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {agent.emoji} {agent.displayName}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#92400e', whiteSpace: 'nowrap' }}>{daysOpen}d</span>
              <button
                type="button"
                onClick={() => markBlockerDone(blocker.id)}
                style={{ ...BTN, fontSize: 11, padding: '3px 8px' }}
              >
                Done
              </button>
            </div>
          )
        })}
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
        {/* Row 4 */}
        <ul
          style={{
            listStyle: 'disc',
            paddingLeft: 16,
            margin: 0,
            fontSize: 11,
            color: '#475569',
            lineHeight: 1.5,
            marginTop: 6,
            marginBottom: 6,
          }}
        >
          {agent.responsibilities.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {/* Row 5 – progress bar */}
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
        {/* Row 6 */}
        {teaser && (
          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{teaser}</div>
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
              onClick={() => {
                if (orionMessage.trim()) {
                  window.open(ORION_CHAT_URL, '_blank')
                  setOrionMessage('')
                }
              }}
              style={BTN}
            >
              Send →
            </button>
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
              💬{' '}
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

    const backlogMissions = missions
      .filter(
        (m) =>
          m.agentId === selectedAgentId &&
          !['active', 'complete', 'archived'].includes(m.status)
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

  // ─── Orion Reports Modal ────────────────────────────────────────────────────

  const renderReportsModal = () => {
    if (!showReportsModal) return null
    const reports = (readLS<OrionReport[]>(ORION_REPORTS_KEY, []) as OrionReport[]).sort(
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
