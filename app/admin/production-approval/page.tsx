'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConsolePayload = {
  repairItems?: any[]
  repairStoriesCount?: number
  inProductionItems?: any[]
  queueItems?: any[]
  coldStorageItems?: any[]
  incubatorItems?: any[]
  coldStoriesCount?: number
  fetchedAt?: string
}

type ApprovalItem = any

// ─── Constants ────────────────────────────────────────────────────────────────

const APPROVAL_TABS = [
  { id: 'ready_for_review', label: 'Ready For Review', color: '#f59e0b' },
  { id: 'approved_ready', label: 'Ready To Publish', color: '#22c55e' },
  { id: 'published', label: 'Published', color: '#3b82f6' },
  { id: 'repair_queue', label: 'Repair Queue', color: '#f97316' },
  { id: 'cold_storage', label: 'Cold Storage', color: '#8b5cf6' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItemWorkflowState(item: any): string {
  if (item.type === 'series') return item.episodes?.[0]?.workflowState || 'ready_for_review'
  return item.episode?.workflowState || 'ready_for_review'
}

// ─── Production card renderers ────────────────────────────────────────────────

function renderQueueItem(item: any) {
  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 800, color: '#111827' }}>{item.title || item.key || '—'}</div>
      {item.nextAction && <div style={{ color: '#64748b', marginTop: 2 }}>{item.nextAction}</div>}
    </div>
  )
}

function renderProductionItem(item: any) {
  return (
    <div style={{ border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 12px', fontSize: 12, backgroundColor: '#eff6ff' }}>
      <div style={{ fontWeight: 800, color: '#1e40af' }}>{item.title || item.key || '—'}</div>
      {item.currentStep && <div style={{ color: '#3b82f6', marginTop: 2 }}>Step: {item.currentStep}</div>}
      {item.updatedAt && <div style={{ color: '#94a3b8', marginTop: 2 }}>Updated {new Date(item.updatedAt).toLocaleTimeString()}</div>}
    </div>
  )
}

function renderRepairItem(item: any) {
  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 12, backgroundColor: '#fff7ed' }}>
      <div style={{ fontWeight: 800, color: '#c2410c' }}>{item.title || item.key || '—'}</div>
      {item.op?.repairStage && <div style={{ color: '#f97316', marginTop: 2 }}>{item.op.repairStage}</div>}
      {item.op?.repairNextAction && <div style={{ color: '#64748b', marginTop: 2 }}>{item.op.repairNextAction}</div>}
    </div>
  )
}

function renderColdItem(item: any) {
  return (
    <div style={{ border: '1px solid #ede9fe', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#6d28d9' }}>{item.title || item.key || '—'}</div>
    </div>
  )
}

// ─── ProdSection ──────────────────────────────────────────────────────────────

function ProdSection({
  icon, title, color, count, subtitle, items, renderItem, collapsed: defaultCollapsed = false,
}: {
  icon: string
  title: string
  color: string
  count: number
  subtitle?: string
  items: any[]
  renderItem: (item: any) => React.ReactNode
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(!defaultCollapsed || count > 0)
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 900, color: '#111827' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{subtitle}</span>}
        <span style={{ minWidth: 28, height: 28, borderRadius: 999, backgroundColor: `${color}18`, color, fontSize: 13, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0
            ? <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>Nothing here.</div>
            : items.map((item, i) => <div key={item.key || i}>{renderItem(item)}</div>)
          }
        </div>
      )}
    </div>
  )
}

// ─── ProductionColumn ─────────────────────────────────────────────────────────

function ProductionColumn({ data, loading }: { data: ConsolePayload | null; loading: boolean }) {
  if (loading) return <div style={{ color: '#94a3b8', padding: 32, textAlign: 'center' }}>Loading...</div>
  if (!data) return <div style={{ color: '#ef4444', padding: 32 }}>Failed to load production data.</div>

  const repair = data.repairItems || []
  const inProd = data.inProductionItems || []
  const queue = data.queueItems || []
  const cold = [...(data.coldStorageItems || []), ...(data.incubatorItems || [])]
  const repairStories = data.repairStoriesCount ?? repair.length
  const coldStories = data.coldStoriesCount ?? cold.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Production Pipeline</h2>
      <ProdSection icon="📋" title="Stories In Queue" color="#64748b" count={queue.length} items={queue} renderItem={renderQueueItem} />
      <ProdSection icon="⚙️" title="In Production" color="#2563eb" count={inProd.length} items={inProd} renderItem={renderProductionItem} />
      <ProdSection
        icon="🔧" title="Repair Queue" color="#f97316" count={repair.length}
        subtitle={repairStories !== repair.length ? `${repairStories} stories` : undefined}
        items={repair} renderItem={renderRepairItem}
      />
      <ProdSection
        icon="🗄️" title="Cold Storage" color="#8b5cf6" count={cold.length}
        subtitle={coldStories !== cold.length ? `${coldStories} stories` : undefined}
        items={cold} renderItem={renderColdItem} collapsed={true}
      />
    </div>
  )
}

// ─── ApprovalItemCard ─────────────────────────────────────────────────────────

function ApprovalItemCard({ item, tab }: { item: any; tab: string }) {
  const isSeriesItem = item.type === 'series'
  const title = item.title || (isSeriesItem ? `Series (${item.episodes?.length} eps)` : item.episode?.title || '—')
  const storyId = isSeriesItem ? null : item.episode?.storyId
  const seriesId = isSeriesItem ? item.seriesId : item.episode?.seriesId
  const approvalUrl = storyId
    ? `/admin/production/approval?storyId=${storyId}`
    : seriesId
    ? `/admin/production/approval?seriesId=${seriesId}`
    : '/admin/production/approval'

  const tabColor: Record<string, string> = {
    ready_for_review: '#f59e0b',
    approved_ready: '#22c55e',
    published: '#3b82f6',
    repair_queue: '#f97316',
    cold_storage: '#8b5cf6',
  }
  const color = tabColor[tab] || '#64748b'

  const actionLabel =
    tab === 'approved_ready' ? 'Publish Now →'
    : tab === 'ready_for_review' ? 'Review & Approve →'
    : tab === 'repair_queue' ? 'Repair →'
    : 'View →'
  const showAction = tab !== 'cold_storage'

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', backgroundColor: '#fff', display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {isSeriesItem && item.episodes?.length > 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.episodes.length} episode{item.episodes.length !== 1 ? 's' : ''}</div>
        )}
        {item.approvalBlockingReasons?.length > 0 && (
          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠ {item.approvalBlockingReasons[0]}</div>
        )}
      </div>
      {showAction && (
        <a
          href={approvalUrl}
          style={{ fontSize: 11, fontWeight: 900, color, textDecoration: 'none', whiteSpace: 'nowrap', padding: '4px 8px', border: `1px solid ${color}`, borderRadius: 6, flex: '0 0 auto' }}
        >
          {actionLabel}
        </a>
      )}
    </div>
  )
}

// ─── ApprovalColumn ───────────────────────────────────────────────────────────

function ApprovalColumn({
  allItems, readyItems, loading, activeTab, setActiveTab,
}: {
  allItems: ApprovalItem[]
  readyItems: ApprovalItem[]
  loading: boolean
  activeTab: string
  setActiveTab: (t: string) => void
}) {
  const tabCounts: Record<string, number> = {}
  for (const item of allItems) {
    const state = getItemWorkflowState(item)
    tabCounts[state] = (tabCounts[state] || 0) + 1
  }

  const rfrTotal = tabCounts['ready_for_review'] || 0
  const rfrReady = readyItems.length
  const rfrBlocked = rfrTotal - rfrReady

  const visibleItems = allItems.filter((item) => getItemWorkflowState(item) === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Content Approval</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {APPROVAL_TABS.map((tab) => {
          const count = tabCounts[tab.id] || 0
          const active = activeTab === tab.id
          // Compute ready/blocked/total per tab
          const readyCount = tab.id === 'ready_for_review' ? rfrReady : count
          const blockedCount = tab.id === 'ready_for_review' ? rfrBlocked : 0
          const totalCount = count
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ border: `1px solid ${active ? tab.color : '#e5e7eb'}`, borderRadius: 8, padding: '10px 14px', background: active ? `${tab.color}12` : '#fff', cursor: 'pointer', color: active ? tab.color : '#374151', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, minWidth: 120 }}
            >
              <span style={{ fontSize: 12, fontWeight: 900 }}>{tab.label}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: active ? tab.color : '#111827', marginTop: 4, lineHeight: 1 }}>
                {readyCount} {tab.id === 'ready_for_review' ? 'Ready Now' : tab.id === 'approved_ready' ? 'To Publish' : tab.id === 'published' ? 'Published' : tab.id === 'repair_queue' ? 'In Repair' : 'Archived'}
              </span>
              {blockedCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginTop: 2 }}>{blockedCount} Blocked</span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 2 }}>{totalCount} Total</span>
            </button>
          )
        })}
      </div>

      {/* Story list */}
      {loading ? (
        <div style={{ color: '#94a3b8', padding: 32, textAlign: 'center' }}>Loading...</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ color: '#94a3b8', padding: 32, textAlign: 'center', fontStyle: 'italic' }}>No stories in this category.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleItems.slice(0, 50).map((item, i) => (
            <ApprovalItemCard key={item.seriesId || item.episode?.storyId || i} item={item} tab={activeTab} />
          ))}
          {visibleItems.length > 50 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 8 }}>
              Showing 50 of {visibleItems.length} —{' '}
              <a href="/admin/production/approval" style={{ color: '#3b82f6' }}>see all in full view →</a>
            </div>
          )}
        </div>
      )}

      {/* Link to full approval page */}
      <div style={{ textAlign: 'right' }}>
        <a href="/admin/production/approval" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700 }}>Open full Approval page for editing &amp; publishing →</a>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductionApprovalPage() {
  const [console_, setConsole] = useState<ConsolePayload | null>(null)
  const [allItems, setAllItems] = useState<ApprovalItem[]>([])
  const [readyItems, setReadyItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('ready_for_review')

  async function load() {
    setLoading(true)
    const [consoleRes, allRes, readyRes] = await Promise.all([
      fetch('/api/admin/production-console', { cache: 'no-store' }),
      fetch('/api/admin/content-approval?tab=all&includeBlocked=true', { cache: 'no-store' }),
      fetch('/api/admin/content-approval?tab=ready_for_review&includeBlocked=false', { cache: 'no-store' }),
    ])
    const [consoleData, allData, readyData] = await Promise.all([
      consoleRes.json().catch(() => ({})),
      allRes.json().catch(() => ({})),
      readyRes.json().catch(() => ({})),
    ])
    setConsole(consoleData)
    setAllItems(allData.items || [])
    setReadyItems(readyData.items || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', color: '#111827', padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>Production &amp; Approval</h1>
            <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12, fontWeight: 700 }}>Pipeline status and story approval — combined view</p>
          </div>
          <button
            onClick={load}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, backgroundColor: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 420px', minWidth: 320, maxWidth: 480 }}>
            <ProductionColumn data={console_} loading={loading} />
          </div>
          <div style={{ flex: '1 1 500px', minWidth: 320 }}>
            <ApprovalColumn
              allItems={allItems}
              readyItems={readyItems}
              loading={loading}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
