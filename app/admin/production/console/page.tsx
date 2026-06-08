'use client'

import { useEffect, useMemo, useState } from 'react'

// ATL-CONS-001 Phase C.1 — approval gate result type (mirrors lib/story-gates)
type ApprovalGate = {
  approvalReady: boolean
  blockReasons: string[]
  recommendedAction: string | null
}

type ConsoleItem = {
  key: string
  type: 'series' | 'story' | 'job'
  title: string
  seriesId: string | null
  storyId: string | null
  episodeCount: number
  affectedEpisodes: number[]
  workflowState: string | null
  status: string | null
  lastUpdated: string | null
  owner: string | null
  repairNotes: string | null
  repairChecklist: unknown | null
  reviewNotes: string | null
  warning: string | null
  // Phase C.1: approval pipeline fields
  _approvalGate?: ApprovalGate
  _gate?: { blocked: boolean; blockedReason?: string; warnings: string[] }
  jobs?: Array<{
    id: string
    status: string | null
    currentStep: string | null
    updatedAt: string | null
  }>
  queue?: {
    id: string
    title: string
    genre: string | null
    duration: string | null
    episodeCount: number | null
    status: string | null
    priority: number | null
    createdAt: string | null
    updatedAt: string | null
    brief: string | null
    source: string | null
    notes: string | null
  } | null
}

type ConsolePayload = {
  success: boolean
  error?: string
  fetchedAt?: string
  repairItems?: ConsoleItem[]
  readyForReviewItems?: ConsoleItem[]
  inProductionItems?: ConsoleItem[]
  coldStorageItems?: ConsoleItem[]
  incubatorItems?: ConsoleItem[]
  queueItems?: ConsoleItem[]
}

type SectionId = 'repair' | 'review' | 'production' | 'cold' | 'incubator' | 'queue'

const sections: Array<{ id: SectionId; label: string; color: string }> = [
  { id: 'repair', label: 'Repair Queue', color: '#f97316' },
  { id: 'review', label: 'Review Pipeline', color: '#16a34a' },
  { id: 'production', label: 'In Production', color: '#2563eb' },
  { id: 'cold', label: 'Cold Storage', color: '#8b5cf6' },
  { id: 'incubator', label: 'Incubator', color: '#64748b' },
  { id: 'queue', label: 'Stories in Queue', color: '#64748b' },
]

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function readableChecklist(value: unknown) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (typeof value !== 'object') return ''

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([group, items]) => {
      if (!Array.isArray(items) || items.length === 0) return []
      return [`${group}: ${items.join(', ')}`]
    })
    .join(' | ')
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '3px 8px', backgroundColor: `${color}18`, color, fontSize: '11px', fontWeight: 900 }}>
      {children}
    </span>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '22px', borderRadius: '8px', border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>
      {text}
    </div>
  )
}

function ItemCard({ item, color, mode }: { item: ConsoleItem; color: string; mode: 'repair' | 'production' | 'cold' }) {
  const checklist = readableChecklist(item.repairChecklist)
  const issueText = item.repairNotes || checklist || item.reviewNotes || ''

  return (
    <div style={{ border: '1px solid #E2E8F0', borderLeft: `4px solid ${color}`, borderRadius: '8px', backgroundColor: '#ffffff', padding: '14px', boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#0F172A', fontSize: '15px', fontWeight: 950, lineHeight: 1.25 }}>{item.title}</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <Badge color={color}>{item.type === 'series' ? 'Series' : item.type === 'story' ? 'Story' : 'Job'}</Badge>
            <Badge color="#475569">Episodes: {item.episodeCount || 'Unknown'}</Badge>
            {item.affectedEpisodes.length > 0 && <Badge color="#475569">Affected: {item.affectedEpisodes.join(', ')}</Badge>}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>
          <div>{formatDate(item.lastUpdated)}</div>
          <div style={{ marginTop: '4px' }}>{item.owner || 'Owner not assigned'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginTop: '12px' }}>
        <div style={{ padding: '9px', borderRadius: '7px', backgroundColor: '#F8FAFC' }}>
          <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Workflow State</div>
          <div style={{ color: '#0F172A', fontSize: '12px', fontWeight: 900, marginTop: '3px' }}>{item.workflowState || 'Not set'}</div>
        </div>
        <div style={{ padding: '9px', borderRadius: '7px', backgroundColor: '#F8FAFC' }}>
          <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Status</div>
          <div style={{ color: '#0F172A', fontSize: '12px', fontWeight: 900, marginTop: '3px' }}>{item.status || 'Not set'}</div>
        </div>
        {mode === 'production' && (
          <div style={{ padding: '9px', borderRadius: '7px', backgroundColor: '#F8FAFC' }}>
            <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Current Step</div>
            <div style={{ color: '#0F172A', fontSize: '12px', fontWeight: 900, marginTop: '3px' }}>{item.jobs?.[0]?.currentStep || 'Not recorded'}</div>
          </div>
        )}
        {mode === 'production' && item.queue && (
          <div style={{ padding: '9px', borderRadius: '7px', backgroundColor: '#EFF6FF' }}>
            <div style={{ color: '#1D4ED8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Queue Source</div>
            <div style={{ color: '#1E3A8A', fontSize: '12px', fontWeight: 900, marginTop: '3px' }}>{item.queue.status || 'Queued'} · {item.queue.genre || 'No genre'}</div>
          </div>
        )}
      </div>

      {mode === 'production' && item.queue?.brief && (
        <div style={{ marginTop: '12px', color: '#475569', fontSize: '13px', lineHeight: 1.4 }}>
          {item.queue.brief}
        </div>
      )}

      {mode === 'repair' && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', backgroundColor: issueText ? '#FFF7ED' : '#FEF2F2', border: `1px solid ${issueText ? '#FED7AA' : '#FECACA'}` }}>
          <div style={{ color: issueText ? '#9A3412' : '#991B1B', fontSize: '11px', fontWeight: 950, textTransform: 'uppercase' }}>Repair Issue</div>
          <div style={{ color: issueText ? '#7C2D12' : '#7F1D1D', fontSize: '13px', lineHeight: 1.4, marginTop: '5px', fontWeight: 750 }}>
            {issueText || item.warning || 'No documented repair issue found.'}
          </div>
        </div>
      )}

      {mode === 'cold' && (
        <div style={{ marginTop: '12px', color: '#475569', fontSize: '13px', lineHeight: 1.4 }}>
          {item.reviewNotes || 'No review notes recorded.'}
        </div>
      )}
    </div>
  )
}

function QueueCard({ item }: { item: ConsoleItem }) {
  const queue = item.queue
  return (
    <div style={{ border: '1px solid #E2E8F0', borderLeft: '4px solid #64748b', borderRadius: '8px', backgroundColor: '#ffffff', padding: '14px', boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#0F172A', fontSize: '15px', fontWeight: 950, lineHeight: 1.25 }}>{queue?.title || item.title}</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <Badge color="#64748b">{queue?.status === 'dispatched' ? 'Dispatched / pending production' : 'Queued'}</Badge>
            {queue?.genre && <Badge color="#475569">{queue.genre}</Badge>}
            {queue?.episodeCount ? <Badge color="#475569">Episodes: {queue.episodeCount}</Badge> : queue?.duration ? <Badge color="#475569">{queue.duration}</Badge> : null}
            {queue?.priority !== null && queue?.priority !== undefined && <Badge color="#475569">Priority: {queue.priority}</Badge>}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>
          <div>{formatDate(queue?.createdAt || item.lastUpdated)}</div>
          <div style={{ marginTop: '4px' }}>{queue?.source || 'Source not recorded'}</div>
        </div>
      </div>
      {queue?.brief && <div style={{ marginTop: '12px', color: '#475569', fontSize: '13px', lineHeight: 1.4 }}>{queue.brief}</div>}
      {queue?.notes && <div style={{ marginTop: '10px', padding: '9px', borderRadius: '7px', backgroundColor: '#F8FAFC', color: '#475569', fontSize: '12px', lineHeight: 1.4 }}>{queue.notes}</div>}
    </div>
  )
}

function Section({ title, color, count, children }: { title: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '20px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: color }} />
          <h2 style={{ margin: 0, color: '#111827', fontSize: '16px', fontWeight: 950 }}>{title}</h2>
        </div>
        <Badge color={color}>{count}</Badge>
      </div>
      <div style={{ padding: '14px', display: 'grid', gap: '10px' }}>{children}</div>
    </section>
  )
}

// ── ATL-CONS-001 Phase C.1: Review Pipeline Section ───────────────────────────
// Replaces the plain "Ready For Review" section with a three-tier view:
//   Approval Ready | Blocked — with per-story block reasons and recommended action

const ACTION_COLOR: Record<string, string> = {
  'Resume Production':        '#2563eb',
  'Send to Repair Queue':     '#f97316',
  'Move to Cold Storage':     '#8b5cf6',
  'Await Missing Episode':    '#64748b',
  'Await Metadata Completion':'#d97706',
  'Audit Required':           '#dc2626',
}

function ReviewPipelineSection({ items }: { items: ConsoleItem[] }) {
  const approvalReady = items.filter(i => i._approvalGate?.approvalReady === true)
  const blocked       = items.filter(i => !i._approvalGate?.approvalReady)
  const [showReady,   setShowReady]   = useState(true)
  const [showBlocked, setShowBlocked] = useState(true)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggleExpand(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const total = items.length
  const readyPct = total > 0 ? Math.round((approvalReady.length / total) * 100) : 0

  return (
    <section style={{ marginTop: '20px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E5E7EB' } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties}>
          <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: '#16a34a' } as React.CSSProperties} />
          <h2 style={{ margin: 0, color: '#111827', fontSize: '16px', fontWeight: 950 } as React.CSSProperties}>Review Pipeline</h2>
        </div>
        <Badge color="#16a34a">{total}</Badge>
      </div>

      {/* Summary bar */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#ffffff' } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' } as React.CSSProperties}>
            <span style={{ fontSize: '16px' }}>✅</span>
            <span style={{ color: '#15803d', fontWeight: 900, fontSize: '14px' } as React.CSSProperties}>Approval Ready: {approvalReady.length}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 700 }}>·</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' } as React.CSSProperties}>
            <span style={{ fontSize: '16px' }}>🚫</span>
            <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '14px' } as React.CSSProperties}>Blocked: {blocked.length}</span>
          </div>
          <a
            href="/admin/production/approval"
            style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: '6px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '11px', fontWeight: 900, textDecoration: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}
          >
            Open Content Approval →
          </a>
        </div>
        {/* Progress bar */}
        <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#F1F5F9', overflow: 'hidden' } as React.CSSProperties}>
          <div style={{ height: '100%', width: `${readyPct}%`, borderRadius: '999px', backgroundColor: '#16a34a', transition: 'width 0.4s ease' } as React.CSSProperties} />
        </div>
        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginTop: '4px' } as React.CSSProperties}>
          {readyPct}% approval-ready · {blocked.length} {blocked.length === 1 ? 'story' : 'stories'} need attention before they appear in Content Approval
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' } as React.CSSProperties}>

        {/* ── Approval Ready ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowReady(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '7px', border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5', cursor: 'pointer' } as React.CSSProperties}
          >
            <span style={{ color: '#065F46', fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' } as React.CSSProperties}>
              ✅ Approval Ready ({approvalReady.length})
            </span>
            <span style={{ color: '#065F46', fontSize: '12px' }}>{showReady ? '▲' : '▼'}</span>
          </button>
          {showReady && (
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' } as React.CSSProperties}>
              {approvalReady.length === 0
                ? <EmptyState text="No stories currently pass all approval gates." />
                : approvalReady.map(item => (
                  <div key={item.key} style={{ border: '1px solid #A7F3D0', borderLeft: '4px solid #16a34a', borderRadius: '8px', backgroundColor: '#F0FDF4', padding: '12px 14px' } as React.CSSProperties}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' } as React.CSSProperties}>
                      <div>
                        <div style={{ color: '#111827', fontSize: '14px', fontWeight: 950 } as React.CSSProperties}>{item.title}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '5px', flexWrap: 'wrap' } as React.CSSProperties}>
                          <Badge color="#16a34a">{item.type === 'series' ? 'Series' : 'Story'}</Badge>
                          <Badge color="#475569">{item.status || 'audio_ready'}</Badge>
                          {item.lastUpdated && <Badge color="#475569">{formatDate(item.lastUpdated)}</Badge>}
                        </div>
                      </div>
                      <a
                        href="/admin/production/approval"
                        style={{ padding: '5px 10px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#ffffff', fontSize: '11px', fontWeight: 900, textDecoration: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}
                      >
                        Review in Content Approval →
                      </a>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ── Blocked ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowBlocked(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '7px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', cursor: 'pointer' } as React.CSSProperties}
          >
            <span style={{ color: '#991B1B', fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' } as React.CSSProperties}>
              🚫 Blocked from Content Approval ({blocked.length})
            </span>
            <span style={{ color: '#991B1B', fontSize: '12px' }}>{showBlocked ? '▲' : '▼'}</span>
          </button>
          {showBlocked && (
            <div style={{ marginTop: '8px', display: 'grid', gap: '8px' } as React.CSSProperties}>
              {blocked.length === 0
                ? <EmptyState text="No blocked stories." />
                : blocked.map(item => {
                  const gate = item._approvalGate
                  const action = gate?.recommendedAction
                  const actionColor = action ? (ACTION_COLOR[action] ?? '#64748b') : '#64748b'
                  const expanded = expandedKeys.has(item.key)
                  const reasons = gate?.blockReasons ?? []

                  return (
                    <div key={item.key} style={{ border: '1px solid #FECACA', borderLeft: '4px solid #dc2626', borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
                      {/* Card header — always visible */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.key)}
                        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
                      >
                        <div style={{ minWidth: 0, flex: 1 } as React.CSSProperties}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' } as React.CSSProperties}>
                            <span style={{ color: '#111827', fontSize: '14px', fontWeight: 950 } as React.CSSProperties}>{item.title}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '2px 7px', backgroundColor: `${actionColor}18`, color: actionColor, fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' } as React.CSSProperties}>
                              {action ?? 'Audit Required'}
                            </span>
                          </div>
                          <div style={{ color: '#dc2626', fontSize: '11px', fontWeight: 700, marginTop: '4px' } as React.CSSProperties}>
                            {reasons.length} {reasons.length === 1 ? 'block' : 'blocks'} — click to {expanded ? 'hide' : 'view'} details
                          </div>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '12px', flexShrink: 0, paddingTop: '2px' } as React.CSSProperties}>{expanded ? '▲' : '▼'}</span>
                      </button>

                      {/* Expanded detail */}
                      {expanded && (
                        <div style={{ borderTop: '1px solid #FECACA', backgroundColor: '#FFF5F5', padding: '12px 14px' } as React.CSSProperties}>
                          {/* Recommended action */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '8px 10px', borderRadius: '6px', backgroundColor: `${actionColor}12`, border: `1px solid ${actionColor}30` } as React.CSSProperties}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' } as React.CSSProperties}>Recommended Action</span>
                            <span style={{ color: actionColor, fontSize: '12px', fontWeight: 900 } as React.CSSProperties}>{action ?? 'Audit Required'}</span>
                          </div>
                          {/* Block reasons */}
                          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' } as React.CSSProperties}>
                            Blocking reasons ({reasons.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' } as React.CSSProperties}>
                            {reasons.map((r, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '12px', color: '#7f1d1d' } as React.CSSProperties}>
                                <span style={{ flexShrink: 0, marginTop: '1px' }}>❌</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                          {/* Metadata strip */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', marginTop: '10px' } as React.CSSProperties}>
                            <div style={{ padding: '7px 9px', borderRadius: '6px', backgroundColor: '#ffffff', border: '1px solid #FECACA' } as React.CSSProperties}>
                              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' } as React.CSSProperties}>Workflow</div>
                              <div style={{ color: '#0f172a', fontSize: '11px', fontWeight: 900, marginTop: '2px' } as React.CSSProperties}>{item.workflowState || '—'}</div>
                            </div>
                            <div style={{ padding: '7px 9px', borderRadius: '6px', backgroundColor: '#ffffff', border: '1px solid #FECACA' } as React.CSSProperties}>
                              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' } as React.CSSProperties}>Status</div>
                              <div style={{ color: '#0f172a', fontSize: '11px', fontWeight: 900, marginTop: '2px' } as React.CSSProperties}>{item.status || '—'}</div>
                            </div>
                            <div style={{ padding: '7px 9px', borderRadius: '6px', backgroundColor: '#ffffff', border: '1px solid #FECACA' } as React.CSSProperties}>
                              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' } as React.CSSProperties}>Updated</div>
                              <div style={{ color: '#0f172a', fontSize: '11px', fontWeight: 900, marginTop: '2px' } as React.CSSProperties}>{formatDate(item.lastUpdated)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              }
            </div>
          )}
        </div>

      </div>
    </section>
  )
}

export default function ProductionConsolePage() {
  const [activeSection, setActiveSection] = useState<SectionId>('repair')
  const [payload, setPayload] = useState<ConsolePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadConsole() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/production-console', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`)
      setPayload(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConsole()
  }, [])

  const counts = useMemo(() => ({
    repair: payload?.repairItems?.length || 0,
    review: payload?.readyForReviewItems?.length || 0,
    production: payload?.inProductionItems?.length || 0,
    cold: payload?.coldStorageItems?.length || 0,
    incubator: payload?.incubatorItems?.length || 0,
    queue: payload?.queueItems?.length || 0,
  }), [payload])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', color: '#111827', padding: '24px' }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '28px', fontWeight: 950 }}>Production Console</h1>
            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>Read-only Phase 0.2 view for production visibility.</p>
            {payload?.fetchedAt && <div style={{ marginTop: '6px', color: '#94A3B8', fontSize: '11px', fontWeight: 800 }}>Fetched {formatDate(payload.fetchedAt)}</div>}
          </div>
          <button type="button" onClick={loadConsole} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#ffffff', color: '#374151', padding: '8px 12px', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>Refresh</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '18px' }}>
          {sections.map((section) => {
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                style={{ border: `1px solid ${active ? section.color : '#E5E7EB'}`, borderRadius: '999px', backgroundColor: active ? `${section.color}12` : '#ffffff', color: active ? section.color : '#475569', padding: '8px 11px', fontSize: '12px', fontWeight: 950, cursor: 'pointer' }}
              >
                {section.label} ({counts[section.id]})
              </button>
            )
          })}
        </div>

        {loading && <EmptyState text="Loading Production Console..." />}
        {error && <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#991B1B', fontSize: '13px', fontWeight: 800 }}>{error}</div>}

        {!loading && !error && activeSection === 'repair' && (
          <Section title="Repair Queue" color="#f97316" count={counts.repair}>
            {(payload?.repairItems || []).length > 0
              ? payload?.repairItems?.map((item) => <ItemCard key={item.key} item={item} color="#f97316" mode="repair" />)
              : <EmptyState text="No Repair Queue items found." />}
          </Section>
        )}

        {!loading && !error && activeSection === 'review' && (
          <ReviewPipelineSection items={payload?.readyForReviewItems || []} />
        )}

        {!loading && !error && activeSection === 'production' && (
          <Section title="In Production" color="#2563eb" count={counts.production}>
            {(payload?.inProductionItems || []).length > 0
              ? payload?.inProductionItems?.map((item) => <ItemCard key={item.key} item={item} color="#2563eb" mode="production" />)
              : <EmptyState text="No active production items found from existing job/status data." />}
          </Section>
        )}

        {!loading && !error && activeSection === 'cold' && (
          <Section title="Cold Storage" color="#8b5cf6" count={counts.cold}>
            {(payload?.coldStorageItems || []).length > 0
              ? payload?.coldStorageItems?.map((item) => <ItemCard key={item.key} item={item} color="#8b5cf6" mode="cold" />)
              : <EmptyState text="No Cold Storage items found." />}
          </Section>
        )}

        {!loading && !error && activeSection === 'incubator' && (
          <Section title="Incubator" color="#64748b" count={counts.incubator}>
            {(payload?.incubatorItems || []).length > 0
              ? payload?.incubatorItems?.map((item) => <ItemCard key={item.key} item={item} color="#64748b" mode="cold" />)
              : <EmptyState text="Incubator requires future workflow_state support. No items shown unless review_notes already contains [INCUBATOR]." />}
          </Section>
        )}

        {!loading && !error && activeSection === 'queue' && (
          <Section title="Stories in Queue" color="#64748b" count={counts.queue}>
            {(payload?.queueItems || []).length > 0
              ? payload?.queueItems?.map((item) => <QueueCard key={item.key} item={item} />)
              : <EmptyState text="No queued Story Queue items found." />}
          </Section>
        )}
      </div>
    </div>
  )
}
