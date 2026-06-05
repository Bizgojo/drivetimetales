'use client'

import { useEffect, useMemo, useState } from 'react'

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
  { id: 'review', label: 'Ready For Review', color: '#16a34a' },
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
          <Section title="Ready For Review" color="#16a34a" count={counts.review}>
            {(payload?.readyForReviewItems || []).length > 0
              ? payload?.readyForReviewItems?.map((item) => <ItemCard key={item.key} item={item} color="#16a34a" mode="cold" />)
              : <EmptyState text="No Ready For Review stories found." />}
          </Section>
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
