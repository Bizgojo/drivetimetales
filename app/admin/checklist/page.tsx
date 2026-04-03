'use client'
import { useEffect, useState } from 'react'

type TaskStatus = 'complete' | 'in-progress' | 'not-started' | 'on-hold'
type TaskOwner = 'Claude' | 'Hal' | 'Marc'

interface Task {
  id: string
  name: string
  status: TaskStatus
  owner: TaskOwner
  hours: number
  dueDate: string
  completedDate: string | null
}

interface Area {
  id: string
  name: string
  goal: string
  tasks: Task[]
}

interface ChecklistData {
  meta: { launchDate: string; bufferStart?: string; lastUpdated: string; totalTasks: number; completedTasks: number }
  areas: Area[]
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  'complete':    { label: '✅ Complete',    bg: '#e6f4ea', text: '#2e7d32', dot: '#22c55e' },
  'in-progress': { label: '🔵 In Progress', bg: '#e8f0fe', text: '#1565c0', dot: '#3b82f6' },
  'on-hold':     { label: '⏸ On Hold',     bg: '#fff3e0', text: '#e65100', dot: '#f97316' },
  'not-started': { label: '○ Not Started', bg: '#f5f5f5', text: '#666666', dot: '#cccccc' },
}

const OWNER_CONFIG: Record<TaskOwner, { bg: string; text: string; border: string }> = {
  'Claude': { bg: '#e8f0fe', text: '#1565c0', border: '#93c5fd' },
  'Hal':    { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Marc':   { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DueChip({ dueDate, status }: { dueDate: string; status: TaskStatus }) {
  if (status === 'complete') return null
  const days = daysUntil(dueDate)
  const color = days < 0 ? '#ef4444' : days <= 3 ? '#f97316' : days <= 7 ? '#b45309' : '#6b7280'
  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`
  return <span style={{ fontSize: 11, background: color + '22', color, borderRadius: 4, padding: '2px 7px', fontWeight: 700, marginLeft: 8 }}>{label}</span>
}

function OwnerBadge({ owner }: { owner?: string }) {
  if (!owner) return null
  const cfg = OWNER_CONFIG[owner as TaskOwner] || { bg: '#f5f5f5', text: '#666', border: '#ccc' }
  return (
    <span style={{ fontSize: 10, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`, borderRadius: 4, padding: '2px 6px', fontWeight: 700, flexShrink: 0 }}>
      {owner}
    </span>
  )
}

function HoursBadge({ hours }: { hours?: number }) {
  if (!hours) return null
  return (
    <span style={{ fontSize: 10, background: '#f5f5f5', color: '#666', border: '1px solid #ddd', borderRadius: 4, padding: '2px 6px', fontWeight: 600, flexShrink: 0 }}>
      {hours}h
    </span>
  )
}

export default function ChecklistPage() {
  const [data, setData] = useState<ChecklistData | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/admin/checklist?t=' + Date.now())
    if (res.ok) { setData(await res.json()); setLastRefresh(new Date()) }
  }

  useEffect(() => { load(); const t = setInterval(load, 300000); return () => clearInterval(t) }, [])

  async function updateStatus(taskId: string, status: TaskStatus) {
    setUpdating(taskId)
    await fetch('/api/admin/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, status })
    })
    await load()
    setUpdating(null)
  }

  if (!data) return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f97316', fontSize: 16 }}>Loading checklist…</div>
    </div>
  )

  const { meta, areas } = data
  const pct = Math.round((meta.completedTasks / meta.totalTasks) * 100)
  const launchDays = daysUntil(meta.launchDate)
  const bufferDays = meta.bufferStart ? daysUntil(meta.bufferStart) : null

  const filteredAreas = ownerFilter
    ? areas.map(a => ({ ...a, tasks: a.tasks.filter((t: any) => t.owner === ownerFilter) })).filter(a => a.tasks.length > 0)
    : areas

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', color: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#ffffff', borderBottom: '1px solid #dddddd', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#000' }}>🚀 Endless Tales — Pre-Launch Checklist</h1>
              <p style={{ fontSize: 13, color: '#555', margin: '4px 0 0' }}>
                Launch: April 24, 2026 &nbsp;·&nbsp; Buffer: Apr 17–24 &nbsp;·&nbsp;
                <span style={{ color: launchDays <= 7 ? '#ef4444' : launchDays <= 14 ? '#f97316' : '#555' }}>
                  {launchDays} days to launch
                </span>
                {bufferDays !== null && bufferDays > 0 && (
                  <span style={{ color: '#888' }}> &nbsp;·&nbsp; {bufferDays}d to buffer week</span>
                )}
                &nbsp;·&nbsp; Updated {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 12, color: '#555' }}>{meta.completedTasks}/{meta.totalTasks} tasks done</div>
            </div>
          </div>
          <div style={{ marginTop: 16, height: 8, background: '#eeeeee', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg, #f97316, #fb923c)', borderRadius: 999, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: '20px auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Owner:</span>
          {(['All', 'Claude', 'Hal', 'Marc'] as const).map(o => {
            const active = (o === 'All' && !ownerFilter) || ownerFilter === o
            const cfg = o === 'All' ? null : OWNER_CONFIG[o as TaskOwner]
            return (
              <button key={o} onClick={() => setOwnerFilter(o === 'All' ? null : o)}
                style={{ background: active ? (cfg?.bg || '#f97316') : '#fff', color: active ? (cfg?.text || '#fff') : '#555', border: `1px solid ${cfg?.border || '#ddd'}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {o}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {areas.map(area => {
            const done = area.tasks.filter(t => t.status === 'complete').length
            const total = area.tasks.length
            const allDone = done === total
            const shortName = area.name.split('—')[1]?.trim() || area.name.split('--')[1]?.trim() || area.name
            return (
              <a key={area.id} href={`#area-${area.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: allDone ? '#e6f4ea' : '#ffffff', border: `1px solid ${allDone ? '#a8d5b0' : '#dddddd'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: allDone ? '#2e7d32' : '#333', fontWeight: 600, cursor: 'pointer' }}>
                  {allDone ? '✅' : `${done}/${total}`} {shortName}
                </div>
              </a>
            )
          })}
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 60px' }}>
        {filteredAreas.map(area => {
          const done = area.tasks.filter(t => t.status === 'complete').length
          const total = area.tasks.length
          const areaPct = total > 0 ? Math.round((done / total) * 100) : 0
          return (
            <div key={area.id} id={`area-${area.id}`} style={{ marginBottom: 24, background: '#ffffff', border: '1px solid #dddddd', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #eeeeee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fafafa' }}>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#000' }}>{area.name}</h2>
                  <p style={{ fontSize: 12, color: '#666', margin: '2px 0 0', fontStyle: 'italic' }}>{area.goal}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: areaPct === 100 ? '#2e7d32' : '#f97316' }}>{areaPct}%</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{done}/{total}</div>
                </div>
              </div>
              <div style={{ height: 3, background: '#eeeeee' }}>
                <div style={{ height: '100%', width: areaPct + '%', background: areaPct === 100 ? '#22c55e' : '#f97316', transition: 'width 0.5s' }} />
              </div>
              {area.tasks.map((task, i) => {
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG['not-started']
                const isLast = i === area.tasks.length - 1
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: isLast ? 'none' : '1px solid #eeeeee', background: updating === task.id ? '#fafafa' : 'transparent' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#999', fontWeight: 600, minWidth: 32, flexShrink: 0 }}>{task.id}</span>
                    <span style={{ fontSize: 14, color: task.status === 'complete' ? '#999' : '#000', flex: 1, textDecoration: task.status === 'complete' ? 'line-through' : 'none' }}>
                      {task.name}
                    </span>
                    <OwnerBadge owner={(task as any).owner} />
                    <HoursBadge hours={(task as any).hours} />
                    <DueChip dueDate={task.dueDate} status={task.status} />
                    {task.completedDate && (
                      <span style={{ fontSize: 11, color: '#2e7d32', minWidth: 60, textAlign: 'right' }}>✓ {formatDate(task.completedDate)}</span>
                    )}
                    <select
                      value={task.status}
                      disabled={updating === task.id}
                      onChange={e => updateStatus(task.id, e.target.value as TaskStatus)}
                      style={{ background: '#ffffff', color: '#000', border: '1px solid #dddddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 120, flexShrink: 0 }}
                    >
                      <option value="complete">✅ Complete</option>
                      <option value="in-progress">🔵 In Progress</option>
                      <option value="on-hold">⏸ On Hold</option>
                      <option value="not-started">○ Not Started</option>
                    </select>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
