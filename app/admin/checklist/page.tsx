'use client'
import { useEffect, useState } from 'react'

type TaskStatus = 'complete' | 'in-progress' | 'not-started' | 'on-hold'
type Owner = 'Claude' | 'Hal' | 'Marc'

interface Task {
  id: string
  name: string
  owner: Owner
  hours: number
  status: TaskStatus
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
  meta: { launchDate: string; lastUpdated: string; totalTasks: number; completedTasks: number }
  areas: Area[]
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  'complete':    { label: '✅ Complete',    bg: '#e6f4ea', text: '#2e7d32', dot: '#22c55e' },
  'in-progress': { label: '🔵 In Progress', bg: '#e8f0fe', text: '#1565c0', dot: '#3b82f6' },
  'on-hold':     { label: '⏸ On Hold',     bg: '#fff3e0', text: '#e65100', dot: '#f97316' },
  'not-started': { label: '○ Not Started', bg: '#f5f5f5', text: '#666666', dot: '#cccccc' },
}

const OWNER_CONFIG: Record<Owner, { bg: string; text: string }> = {
  'Claude': { bg: '#f3e8ff', text: '#7c3aed' },
  'Hal':    { bg: '#fef3c7', text: '#b45309' },
  'Marc':   { bg: '#dbeafe', text: '#1d4ed8' },
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
  return <span style={{ fontSize: 11, background: color + '22', color, borderRadius: 4, padding: '2px 7px', fontWeight: 700, marginLeft: 6, flexShrink: 0 }}>{label}</span>
}

function OwnerBadge({ owner }: { owner: Owner }) {
  const cfg = OWNER_CONFIG[owner] || { bg: '#f5f5f5', text: '#555' }
  return <span style={{ fontSize: 11, background: cfg.bg, color: cfg.text, borderRadius: 4, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>{owner}</span>
}

export default function ChecklistPage() {
  const [data, setData] = useState<ChecklistData | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [filterOwner, setFilterOwner] = useState<string>('All')
  const [filterStatus, setFilterStatus] = useState<string>('All')

  async function load() {
    const res = await fetch('/api/admin/checklist?t=' + Date.now())
    if (res.ok) { setData(await res.json()); setLastRefresh(new Date()) }
  }

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [])

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

  // Totals by owner
  const ownerHours: Record<string, { total: number; remaining: number }> = {}
  for (const area of areas) {
    for (const task of area.tasks) {
      if (!ownerHours[task.owner]) ownerHours[task.owner] = { total: 0, remaining: 0 }
      ownerHours[task.owner].total += task.hours
      if (task.status !== 'complete') ownerHours[task.owner].remaining += task.hours
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', color: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #dddddd', padding: '20px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#000' }}>🚀 Endless Tales — Launch Checklist</h1>
              <p style={{ fontSize: 13, color: '#555', margin: '4px 0 0' }}>
                Launch: April 24, 2026 &nbsp;·&nbsp;
                <span style={{ color: launchDays <= 7 ? '#f97316' : '#555' }}>{launchDays} days remaining</span>
                &nbsp;·&nbsp; Updated {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 12, color: '#555' }}>{meta.completedTasks}/{meta.totalTasks} tasks done</div>
            </div>
          </div>

          {/* Overall progress bar */}
          <div style={{ marginTop: 16, height: 8, background: '#eeeeee', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg, #f97316, #fb923c)', borderRadius: 999, transition: 'width 0.5s ease' }} />
          </div>

          {/* Owner workload summary */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(Object.entries(ownerHours) as [Owner, { total: number; remaining: number }][]).map(([owner, hrs]) => {
              const cfg = OWNER_CONFIG[owner] || { bg: '#f5f5f5', text: '#555' }
              return (
                <div key={owner} style={{ background: cfg.bg, border: `1px solid ${cfg.text}33`, borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                  <span style={{ fontWeight: 800, color: cfg.text }}>{owner}</span>
                  <span style={{ color: '#555', marginLeft: 8 }}>{hrs.remaining}h remaining / {hrs.total}h total</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ maxWidth: 960, margin: '16px auto', padding: '0 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Filter:</span>
        {['All', 'Claude', 'Hal', 'Marc'].map(o => (
          <button key={o} onClick={() => setFilterOwner(o)}
            style={{ background: filterOwner === o ? '#f97316' : '#fff', color: filterOwner === o ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {o}
          </button>
        ))}
        <span style={{ fontSize: 13, color: '#555', fontWeight: 600, marginLeft: 8 }}>Status:</span>
        {['All', 'not-started', 'in-progress', 'on-hold', 'complete'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ background: filterStatus === s ? '#333' : '#fff', color: filterStatus === s ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
            {s === 'not-started' ? 'Not Started' : s === 'in-progress' ? 'In Progress' : s === 'on-hold' ? 'On Hold' : s}
          </button>
        ))}
      </div>

      {/* Area summary chips */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {areas.map(area => {
          const done = area.tasks.filter(t => t.status === 'complete').length
          const total = area.tasks.length
          const allDone = done === total
          const shortName = area.name.split('—')[1]?.trim().split(':')[0]?.trim() || area.name.split('—')[0].trim()
          return (
            <a key={area.id} href={`#area-${area.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: allDone ? '#e6f4ea' : '#ffffff', border: `1px solid ${allDone ? '#a8d5b0' : '#dddddd'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: allDone ? '#2e7d32' : '#333', fontWeight: 600, cursor: 'pointer' }}>
                {allDone ? '✅' : `${done}/${total}`} {shortName}
              </div>
            </a>
          )
        })}
      </div>

      {/* Area tables */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 60px' }}>
        {areas.map(area => {
          const filteredTasks = area.tasks.filter(task => {
            const ownerMatch = filterOwner === 'All' || task.owner === filterOwner
            const statusMatch = filterStatus === 'All' || task.status === filterStatus
            return ownerMatch && statusMatch
          })
          if (filteredTasks.length === 0) return null

          const done = area.tasks.filter(t => t.status === 'complete').length
          const total = area.tasks.length
          const areaPct = Math.round((done / total) * 100)
          const areaHrsLeft = area.tasks.filter(t => t.status !== 'complete').reduce((s, t) => s + t.hours, 0)

          return (
            <div key={area.id} id={`area-${area.id}`} style={{ marginBottom: 20, background: '#ffffff', border: '1px solid #dddddd', borderRadius: 10, overflow: 'hidden' }}>
              {/* Area header */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #eeeeee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fafafa' }}>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#000' }}>{area.name}</h2>
                  <p style={{ fontSize: 12, color: '#666', margin: '2px 0 0', fontStyle: 'italic' }}>{area.goal}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: areaPct === 100 ? '#2e7d32' : '#f97316' }}>{areaPct}%</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{done}/{total} &nbsp;·&nbsp; {areaHrsLeft}h left</div>
                </div>
              </div>
              {/* Area progress bar */}
              <div style={{ height: 3, background: '#eeeeee' }}>
                <div style={{ height: '100%', width: areaPct + '%', background: areaPct === 100 ? '#22c55e' : '#f97316', transition: 'width 0.5s' }} />
              </div>
              {/* Tasks */}
              {filteredTasks.map((task, i) => {
                const cfg = STATUS_CONFIG[task.status]
                const isLast = i === filteredTasks.length - 1
                return (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: isLast ? 'none' : '1px solid #eeeeee', background: updating === task.id ? '#fafafa' : 'transparent', flexWrap: 'wrap' }}>
                    {/* Status dot */}
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    {/* Task number */}
                    <span style={{ fontSize: 11, color: '#999', fontWeight: 600, minWidth: 30, flexShrink: 0 }}>{task.id}</span>
                    {/* Owner badge */}
                    <OwnerBadge owner={task.owner} />
                    {/* Hours */}
                    {task.hours > 0 && (
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{task.hours}h</span>
                    )}
                    {/* Task name */}
                    <span style={{ fontSize: 13, color: task.status === 'complete' ? '#999' : '#000', flex: 1, textDecoration: task.status === 'complete' ? 'line-through' : 'none', minWidth: 200 }}>
                      {task.name}
                    </span>
                    {/* Due date chip */}
                    <DueChip dueDate={task.dueDate} status={task.status} />
                    {/* Completed date */}
                    {task.completedDate && (
                      <span style={{ fontSize: 11, color: '#2e7d32', flexShrink: 0 }}>✓ {formatDate(task.completedDate)}</span>
                    )}
                    {/* Status dropdown */}
                    <select
                      value={task.status}
                      disabled={updating === task.id}
                      onChange={e => updateStatus(task.id, e.target.value as TaskStatus)}
                      style={{ background: '#ffffff', color: '#000', border: '1px solid #dddddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 120, flexShrink: 0 }}>
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
