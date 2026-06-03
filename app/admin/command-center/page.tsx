'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AGENTS,
  COMMAND_CENTER_EXTERNAL_LINKS,
  MISSION_PRIORITY_COLORS,
  type AgentId,
  type AgentState,
  type AgentStatus,
  type Mission,
  type MissionPriority,
  type MissionStatus,
} from '@/lib/config/command-center'

type AgentsState = Record<AgentId, AgentState>
type MobileTab = 'fleet' | 'missions' | 'detail'

const AGENTS_KEY = 'cc_v2_agents'
const MISSIONS_KEY = 'cc_v2_missions'
const ACTIVE_MISSION_KEY = 'cc_v2_active_mission'
const MOBILE_TAB_KEY = 'cc_v2_mobile_tab'

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

const MISSION_DOT_COLORS: Record<'active' | 'waiting' | 'blocked', string> = {
  active: '#3b82f6',
  waiting: '#eab308',
  blocked: '#ef4444',
}

const PRIORITY_SORT: Record<MissionPriority, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
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
    percentComplete: null,
    waitingOn: '',
    lastActivity: '',
    eta: '',
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

function fieldLabel(label: string) {
  return (
    <label style={{ display: 'block', color: '#334155', fontSize: '12px', fontWeight: 900, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
      {label}
    </label>
  )
}

function inputStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    backgroundColor: '#fff',
    color: '#0f172a',
    fontSize: '14px',
    padding: '0.65rem',
    ...extra,
  }
}

function priorityBadge(priority: MissionPriority) {
  return (
    <span style={{ backgroundColor: MISSION_PRIORITY_COLORS[priority], color: '#fff', fontSize: '9px', fontWeight: 900, padding: '1px 5px', borderRadius: 999 }}>
      {priority}
    </span>
  )
}

function getAgent(agentId: Mission['agentId']) {
  return agentId === 'unassigned' ? null : AGENTS.find((agent) => agent.id === agentId) || null
}

export default function AdminCommandCenterPage() {
  const [loaded, setLoaded] = useState(false)
  const [agents, setAgents] = useState<AgentsState>(() => makeSeedAgents())
  const [missions, setMissions] = useState<Mission[]>([])
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('fleet')
  const [editingAgentId, setEditingAgentId] = useState<AgentId | null>(null)
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
    const storedAgents = readLS<AgentsState | null>(AGENTS_KEY, null)
    if (storedAgents) {
      setAgents({ ...makeSeedAgents(), ...storedAgents })
    } else {
      const seed = makeSeedAgents()
      setAgents(seed)
      writeLS(AGENTS_KEY, seed)
    }
    setMissions(readLS<Mission[]>(MISSIONS_KEY, []))
    setActiveMissionId(readLS<string | null>(ACTIVE_MISSION_KEY, null))
    setMobileTab(readLS<MobileTab>(MOBILE_TAB_KEY, 'fleet'))
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    writeLS(ACTIVE_MISSION_KEY, activeMissionId)
  }, [activeMissionId, loaded])

  useEffect(() => {
    if (!loaded) return
    writeLS(MOBILE_TAB_KEY, mobileTab)
  }, [loaded, mobileTab])

  useEffect(() => {
    return () => {
      if (missionWriteTimer.current) window.clearTimeout(missionWriteTimer.current)
    }
  }, [])

  const activeMission = missions.find((mission) => mission.id === activeMissionId) || null

  const activeMissions = useMemo(() => {
    return missions
      .filter((mission) => mission.status === 'active' || mission.status === 'waiting' || mission.status === 'blocked')
      .sort((a, b) => PRIORITY_SORT[a.priority] - PRIORITY_SORT[b.priority] || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }, [missions])

  const completeMissions = useMemo(() => {
    return missions
      .filter((mission) => mission.status === 'complete' || mission.status === 'archived')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }, [missions])

  const scheduleMissionWrite = (next: Mission[]) => {
    if (missionWriteTimer.current) window.clearTimeout(missionWriteTimer.current)
    missionWriteTimer.current = window.setTimeout(() => {
      writeLS(MISSIONS_KEY, next)
      missionWriteTimer.current = null
    }, 600)
  }

  const saveMissionsNow = (next: Mission[]) => {
    if (missionWriteTimer.current) {
      window.clearTimeout(missionWriteTimer.current)
      missionWriteTimer.current = null
    }
    writeLS(MISSIONS_KEY, next)
  }

  const updateMission = (missionId: string, changes: Partial<Mission>, immediate = false) => {
    setMissions((current) => {
      const now = new Date().toISOString()
      const next = current.map((mission) => {
        if (mission.id !== missionId) return mission
        return { ...mission, ...changes, updatedAt: now }
      })
      if (immediate) saveMissionsNow(next)
      else scheduleMissionWrite(next)
      return next
    })
  }

  const createMission = () => {
    const now = new Date().toISOString()
    const mission: Mission = {
      id: Date.now().toString(),
      title: 'New Mission',
      agentId: 'unassigned',
      status: 'active',
      priority: 'P3',
      percentComplete: null,
      waitingOn: '',
      lastActivity: '',
      eta: '',
      notes: '',
      unread: true,
      createdAt: now,
      updatedAt: now,
    }
    const next = [...missions, mission]
    setMissions(next)
    saveMissionsNow(next)
    setActiveMissionId(mission.id)
    setMobileTab('detail')
  }

  const clearAll = () => {
    if (!window.confirm('Clear all Command Center v2 fields on this device?')) return
    window.localStorage.removeItem(AGENTS_KEY)
    window.localStorage.removeItem(MISSIONS_KEY)
    window.localStorage.removeItem(ACTIVE_MISSION_KEY)
    window.localStorage.removeItem(MOBILE_TAB_KEY)
    const seed = makeSeedAgents()
    setAgents(seed)
    setMissions([])
    setActiveMissionId(null)
    setMobileTab('fleet')
    setEditingAgentId(null)
  }

  const saveAgent = (agentId: AgentId, state: AgentState) => {
    const next = { ...agents, [agentId]: state }
    setAgents(next)
    writeLS(AGENTS_KEY, next)
    setEditingAgentId(null)
  }

  const deleteMission = (missionId: string) => {
    if (!window.confirm('Delete this mission?')) return
    const index = missions.findIndex((mission) => mission.id === missionId)
    const next = missions.filter((mission) => mission.id !== missionId)
    setMissions(next)
    saveMissionsNow(next)
    setActiveMissionId(next[index - 1]?.id || next[index]?.id || null)
  }

  const renderAgentCard = (agent: (typeof AGENTS)[number]) => {
    const state = agents[agent.id]
    const missionCount = missions.filter((mission) => mission.agentId === agent.id && mission.status !== 'archived').length
    const [draft, setDraft] = [state, (next: AgentState) => saveAgent(agent.id, next)] as const

    if (editingAgentId === agent.id) {
      return (
        <article key={agent.id} style={{ ...CARD, borderTop: `4px solid ${agent.accentColor}`, padding: '0.85rem' }}>
          <AgentEditForm initialState={draft} onSave={setDraft} onCancel={() => setEditingAgentId(null)} />
        </article>
      )
    }

    return (
      <article key={agent.id} style={{ ...CARD, borderTop: `4px solid ${agent.accentColor}`, padding: '0.85rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <span style={{ fontSize: '20px' }}>{agent.emoji}</span>
            <strong style={{ fontSize: '15px', color: '#0f172a' }}>{agent.displayName}</strong>
          </div>
          <button type="button" onClick={() => setEditingAgentId(agent.id)} style={{ border: 0, background: 'transparent', color: agent.accentColor, fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>Edit</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.65rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: STATUS_DOT_COLORS[state.status] }} />
          <span style={{ color: '#475569', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{state.status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <div style={{ height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ width: `${state.percentComplete ?? 0}%`, height: '100%', borderRadius: 4, backgroundColor: agent.accentColor }} />
          </div>
          <span style={{ color: '#475569', fontSize: '11px', fontWeight: 900 }}>{state.percentComplete === null ? '—' : `${state.percentComplete}%`}</span>
        </div>
        {state.currentTask && <p style={{ color: '#475569', fontSize: '13px', margin: '0 0 0.45rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.currentTask}</p>}
        {state.waitingOn && <p style={{ color: '#64748b', fontSize: '11px', margin: '0 0 0.35rem' }}>Waiting on: {state.waitingOn}</p>}
        {state.lastActivity && <p style={{ color: '#64748b', fontSize: '11px', margin: '0 0 0.55rem' }}>Last: {state.lastActivity}</p>}
        <span style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '10px', fontWeight: 800, borderRadius: 999, padding: '2px 8px' }}>
          {missionCount} {missionCount === 1 ? 'mission' : 'missions'}
        </span>
      </article>
    )
  }

  const renderMissionRow = (mission: Mission, complete = false) => {
    const agent = getAgent(mission.agentId)
    const dotColor = complete ? '#22c55e' : MISSION_DOT_COLORS[mission.status as 'active' | 'waiting' | 'blocked']
    return (
      <button
        key={mission.id}
        type="button"
        onClick={() => {
          setActiveMissionId(mission.id)
          setMobileTab('detail')
        }}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '14px auto minmax(0, 1fr) 20px',
          alignItems: 'center',
          gap: '0.4rem',
          border: activeMissionId === mission.id ? '1px solid #f97316' : '1px solid transparent',
          borderRadius: '8px',
          backgroundColor: activeMissionId === mission.id ? '#fff7ed' : '#fff',
          padding: '0.5rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ color: complete ? '#fff' : dotColor, fontSize: complete ? '12px' : 0, width: 10, height: 10, borderRadius: '50%', border: complete || mission.unread ? 'none' : `2px solid ${dotColor}`, backgroundColor: complete || mission.unread ? dotColor : 'transparent', display: 'grid', placeItems: 'center', lineHeight: 1 }}>
          {complete ? '✓' : ''}
        </span>
        {priorityBadge(mission.priority)}
        <span style={{ color: '#0f172a', fontSize: '12px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mission.title}</span>
        <span style={{ color: '#64748b', fontSize: '12px', textAlign: 'right' }}>{agent?.emoji || '—'}</span>
      </button>
    )
  }

  const renderMissionIndex = () => (
    <section className="cc-index" style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ color: '#334155', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>Missions</span>
        <button type="button" onClick={createMission} style={BTN}>+ New Mission</button>
      </div>
      {missions.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>No missions yet. Create one to get started.</p>
      ) : (
        <div className="cc-mission-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {activeMissions.map((mission) => renderMissionRow(mission))}
          {completeMissions.length > 0 && <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', padding: '0.45rem 0.25rem 0.1rem' }}>Complete</div>}
          {completeMissions.map((mission) => renderMissionRow(mission, true))}
        </div>
      )}
    </section>
  )

  const renderMissionDetail = () => (
    <section className="cc-detail" style={{ ...CARD }}>
      {!activeMission ? (
        <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '1rem' }}>
          <div>
            <p style={{ color: '#64748b', fontSize: '15px', fontWeight: 800 }}>Select a mission or create a new one.</p>
            <button type="button" onClick={createMission} style={BTN}>+ New Mission</button>
          </div>
        </div>
      ) : (
        <MissionDetail
          mission={activeMission}
          onUpdate={(changes) => updateMission(activeMission.id, changes)}
          onSaveNow={(changes) => updateMission(activeMission.id, changes, true)}
          onDelete={() => deleteMission(activeMission.id)}
        />
      )}
    </section>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: CC_BG, color: '#0f172a', padding: '2rem 2rem 5rem' }}>
      <style jsx>{`
        .cc-fleet {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 1rem;
        }
        .cc-workspace {
          display: flex;
          flex-direction: row;
          gap: 1rem;
          min-height: 540px;
          margin-bottom: 1rem;
        }
        .cc-index {
          width: 260px;
          flex: 0 0 260px;
          overflow-y: auto;
          padding: 12px;
        }
        .cc-detail {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        .cc-mobile-tabs {
          display: none;
        }
          .cc-tab-panel {
            display: none;
          }
        .cc-field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        @media (max-width: 899px) {
          .cc-fleet {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .cc-workspace {
            flex-direction: column;
          }
          .cc-index {
            width: auto;
            flex: none;
            height: 56px;
            overflow-x: auto;
            overflow-y: hidden;
          }
          .cc-mission-list {
            flex-direction: row !important;
            min-width: max-content;
          }
          .cc-mission-list button {
            width: 220px !important;
          }
        }
        @media (max-width: 599px) {
          .cc-fleet {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .cc-desktop-fleet {
            display: none;
          }
          .cc-workspace {
            display: none;
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
          .cc-tab-panel {
            display: block;
            margin-bottom: 1rem;
          }
          .cc-tab-panel[data-active='false'] {
            display: none;
          }
          .cc-field-grid {
            grid-template-columns: 1fr;
          }
          .cc-index {
            width: auto;
            height: auto;
            overflow: visible;
          }
          .cc-mission-list {
            flex-direction: column !important;
            min-width: 0;
          }
          .cc-mission-list button {
            width: 100% !important;
          }
        }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ color: '#0f172a', margin: 0, fontSize: '31px', fontWeight: 800, lineHeight: 1.1 }}>Command Center</h1>
          <p style={{ color: '#64748b', margin: '0.5rem 0 0', fontSize: '14px', fontWeight: 700 }}>{today}</p>
        </div>
        <button type="button" onClick={clearAll} style={{ ...BTN, borderColor: '#ef4444', color: '#ef4444' }}>Clear All</button>
      </header>

      <section className="cc-fleet cc-desktop-fleet">{AGENTS.map(renderAgentCard)}</section>

      <main className="cc-workspace">
        {renderMissionIndex()}
        {renderMissionDetail()}
      </main>

      <div className="cc-tab-panel" data-active={mobileTab === 'fleet'}>
        <section className="cc-fleet">{AGENTS.map(renderAgentCard)}</section>
      </div>
      <div className="cc-tab-panel" data-active={mobileTab === 'missions'}>{renderMissionIndex()}</div>
      <div className="cc-tab-panel" data-active={mobileTab === 'detail'}>{renderMissionDetail()}</div>

      <footer style={{ ...CARD, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase' }}>External Tools</span>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          {COMMAND_CENTER_EXTERNAL_LINKS.map((link) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#ea580c', fontSize: '13px', fontWeight: 900, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>

      <nav className="cc-mobile-tabs">
        {([
          ['fleet', '🤖', 'Fleet'],
          ['missions', '📋', 'Missions'],
          ['detail', '📄', 'Detail'],
        ] as const).map(([tab, emoji, label]) => (
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

function AgentEditForm({
  initialState,
  onSave,
  onCancel,
}: {
  initialState: AgentState
  onSave: (state: AgentState) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<AgentState>(initialState)

  return (
    <div style={{ display: 'grid', gap: '0.55rem' }}>
      <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AgentStatus })} style={inputStyle({ padding: '0.45rem' })}>
        {(['working', 'waiting', 'blocked', 'complete', 'idle'] as AgentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <input value={draft.currentTask} onChange={(event) => setDraft({ ...draft, currentTask: event.target.value })} placeholder="Current task" style={inputStyle({ padding: '0.45rem' })} />
      <input type="number" min={0} max={100} value={draft.percentComplete ?? ''} onChange={(event) => setDraft({ ...draft, percentComplete: clampPercent(event.target.value) })} placeholder="—" style={inputStyle({ padding: '0.45rem' })} />
      <input value={draft.waitingOn} onChange={(event) => setDraft({ ...draft, waitingOn: event.target.value })} placeholder="Waiting on" style={inputStyle({ padding: '0.45rem' })} />
      <input value={draft.lastActivity} onChange={(event) => setDraft({ ...draft, lastActivity: event.target.value })} placeholder="Last activity" style={inputStyle({ padding: '0.45rem' })} />
      <input value={draft.eta} onChange={(event) => setDraft({ ...draft, eta: event.target.value })} placeholder="ETA" style={inputStyle({ padding: '0.45rem' })} />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onSave(draft)} style={BTN}>Save ✓</button>
        <button type="button" onClick={onCancel} style={BTN}>Cancel</button>
      </div>
    </div>
  )
}

function MissionDetail({
  mission,
  onUpdate,
  onSaveNow,
  onDelete,
}: {
  mission: Mission
  onUpdate: (changes: Partial<Mission>) => void
  onSaveNow: (changes: Partial<Mission>) => void
  onDelete: () => void
}) {
  const agent = getAgent(mission.agentId)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <header>
        <input
          value={mission.title}
          onChange={(event) => onUpdate({ ...mission, title: event.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', border: 0, borderBottom: '2px solid #e2e8f0', color: '#0f172a', backgroundColor: '#fff', fontSize: '22px', fontWeight: 800, padding: '0.3rem 0' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
          <span style={{ color: '#334155', fontSize: '14px', fontWeight: 700 }}>{agent ? `${agent.emoji} ${agent.displayName}` : '— Unassigned'}</span>
          {priorityBadge(mission.priority)}
          <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '10px', fontWeight: 900, borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase' }}>{mission.status}</span>
        </div>
      </header>

      <div className="cc-field-grid">
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div>
            {fieldLabel('Agent')}
            <select value={mission.agentId} onChange={(event) => onUpdate({ ...mission, agentId: event.target.value as Mission['agentId'] })} style={inputStyle()}>
              <option value="unassigned">Unassigned</option>
              {AGENTS.map((agentOption) => <option key={agentOption.id} value={agentOption.id}>{agentOption.emoji} {agentOption.displayName}</option>)}
            </select>
          </div>
          <div>
            {fieldLabel('Status')}
            <select value={mission.status} onChange={(event) => onUpdate({ ...mission, status: event.target.value as MissionStatus })} style={inputStyle()}>
              {(['active', 'waiting', 'blocked', 'complete', 'archived'] as MissionStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            {fieldLabel('Priority')}
            <select value={mission.priority} onChange={(event) => onUpdate({ ...mission, priority: event.target.value as MissionPriority })} style={inputStyle()}>
              <option value="P1">🔴 P1 Urgent</option>
              <option value="P2">🟠 P2 High</option>
              <option value="P3">⚫ P3 Normal</option>
              <option value="P4">⚪ P4 Low</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <div>
            {fieldLabel('% Complete')}
            <input type="number" min={0} max={100} value={mission.percentComplete ?? ''} onChange={(event) => onUpdate({ ...mission, percentComplete: clampPercent(event.target.value) })} style={inputStyle()} />
          </div>
          <div>
            {fieldLabel('Waiting on')}
            <input value={mission.waitingOn} onChange={(event) => onUpdate({ ...mission, waitingOn: event.target.value })} style={inputStyle()} />
          </div>
          <div>
            {fieldLabel('Last activity')}
            <input value={mission.lastActivity} onChange={(event) => onUpdate({ ...mission, lastActivity: event.target.value })} style={inputStyle()} />
          </div>
          <div>
            {fieldLabel('ETA')}
            <input value={mission.eta} onChange={(event) => onUpdate({ ...mission, eta: event.target.value })} style={inputStyle()} />
          </div>
        </div>
      </div>

      <div>
        {fieldLabel('Notes')}
        <textarea value={mission.notes} onChange={(event) => onUpdate({ ...mission, notes: event.target.value })} style={{ ...inputStyle(), minHeight: 160, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155', fontSize: '13px', fontWeight: 800 }}>
        <input type="checkbox" checked={mission.unread} onChange={(event) => onUpdate({ ...mission, unread: event.target.checked })} />
        Needs Marc action
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>
        <button type="button" onClick={() => onSaveNow({ ...mission, status: 'complete', unread: false })} style={BTN}>Mark Complete</button>
        <button type="button" onClick={() => onSaveNow({ ...mission, status: 'archived' })} style={BTN}>Archive</button>
        <button type="button" onClick={onDelete} style={{ ...BTN, borderColor: '#fecaca', color: '#991b1b' }}>Delete</button>
      </div>
    </div>
  )
}
