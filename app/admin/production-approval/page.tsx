'use client'

import { useEffect, useState, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalTab = 'ready_for_review' | 'approved_ready' | 'published' | 'repair_queue' | 'cold_storage'

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
  op?: Record<string, unknown>
  jobs?: Array<{ id: string; status: string | null; currentStep: string | null; updatedAt: string | null }>
  queue?: any
}

type ApprovalEpisode = {
  storyId: string
  title: string | null
  episodeNumber: number | null
  status: string | null
  reviewStatus: 'pending' | 'approved' | 'not_approved' | null
  workflowState: string
  repairChecklist: any | null
  repairNotes: string | null
  isHidden: boolean | null
  publishedOn: string | null
  audioReadiness: { audioUrl: boolean; storyAudioUrl: boolean; finalMix?: boolean }
  packagingReadiness: { coverUrl: boolean; proseText: boolean; authorId: boolean; narratorVoiceId: boolean; narratorVoiceName?: boolean }
  approvalReady: boolean
  approvalBlockingReasons: string[]
  approvalEntryReason: string | null
  sourceJobId: string | null
  completionSortDate: string | null
  completionSortSource: string | null
}

type ApprovalItem =
  | { type: 'series'; seriesId: string; title: string; expectedEpisodeCount: number; presentEpisodeCount: number; episodes: ApprovalEpisode[]; approvalReady: boolean; approvalBlockingReasons: string[] }
  | { type: 'story'; storyId: string; title: string; episode: ApprovalEpisode; approvalReady: boolean; approvalBlockingReasons: string[] }

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Not recorded'
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function s(n: number | undefined, word: string) {
  return `${n ?? 0} ${word}${(n ?? 0) !== 1 ? 's' : ''}`
}

// ── Shared Components ─────────────────────────────────────────────────────────

function Badge({ children, color, small }: { children: React.ReactNode; color: string; small?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: small ? '1px 6px' : '3px 8px', backgroundColor: `${color}18`, color, fontSize: small ? '10px' : '11px', fontWeight: 900 }}>
      {children}
    </span>
  )
}

function SectionHeader({ icon, title, color, count }: { icon: string; title: string; color: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{icon}</span>
        <h2 style={{ margin: 0, color: '#111827', fontSize: '15px', fontWeight: 950 }}>{title}</h2>
      </div>
      <Badge color={color}>{count}</Badge>
    </div>
  )
}

function TabBar({ tabs, active, onSelect }: { tabs: Array<{ id: ApprovalTab; label: string; count: number; color: string }>; active: ApprovalTab; onSelect: (tab: ApprovalTab) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', padding: '0 16px', overflowX: 'auto' }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: isActive ? tab.color : '#64748B',
              borderBottom: `3px solid ${isActive ? tab.color : 'transparent'}`,
              cursor: 'pointer',
              fontWeight: isActive ? 900 : 700,
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label} ({tab.count})
          </button>
        )
      })}
    </div>
  )
}

function StoryCard({ episode, onAction }: { episode: ApprovalEpisode; onAction: (action: string, episode: ApprovalEpisode) => void }) {
  return (
    <div style={{ padding: '12px 14px', border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#FFFFFF', marginBottom: '8px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900 }}>{episode.title || 'Untitled'}</div>
          {episode.episodeNumber && <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>Episode {episode.episodeNumber}</div>}
          <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '4px' }}>{fmt(episode.completionSortDate)}</div>
        </div>
        <Badge color={episode.approvalReady ? '#16A34A' : '#DC2626'} small>
          {episode.workflowState}
        </Badge>
      </div>
      <div style={{ marginTop: '10px' }}>
        {episode.workflowState === 'ready_for_review' && <button onClick={() => onAction('review', episode)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #3B82F6', backgroundColor: '#FFFFFF', color: '#3B82F6', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Review & Approve →</button>}
        {episode.workflowState === 'approved_ready' && <button onClick={() => onAction('publish', episode)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #10B981', backgroundColor: '#10B981', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Publish →</button>}
        {episode.workflowState === 'published' && <button onClick={() => onAction('view', episode)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #64748B', backgroundColor: '#FFFFFF', color: '#64748B', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>View →</button>}
        {['repair_queue', 'being_repaired'].includes(episode.workflowState) && <button onClick={() => onAction('repair', episode)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #F97316', backgroundColor: '#FFFFFF', color: '#F97316', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Repair →</button>}
      </div>
    </div>
  )
}

// ── Console Components ────────────────────────────────────────────────────────

function QueueCard({ item }: { item: ConsoleItem }) {
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FFFFFF', padding: '12px 14px', marginBottom: '8px' }}>
      <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900 }}>{item.title}</div>
      {item.queue?.episodeCount && <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px' }}>{s(item.queue.episodeCount, 'episode')}</div>}
      <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '4px' }}>{fmt(item.lastUpdated)}</div>
    </div>
  )
}

function ProductionCard({ item }: { item: ConsoleItem }) {
  const op = (item.op || {}) as any
  const pct = op.progressPct ?? 0
  return (
    <div style={{ border: '1px solid #BFDBFE', borderRadius: '8px', backgroundColor: '#FFFFFF', padding: '12px 14px', marginBottom: '8px' }}>
      <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900 }}>{item.title}</div>
      <div style={{ marginTop: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 700 }}>{op.stepLabel || 'Unknown'}</div>
        <div style={{ color: '#2563EB', fontSize: '10px', fontWeight: 900 }}>{pct}%</div>
      </div>
      <div style={{ height: '4px', borderRadius: '999px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#2563EB', borderRadius: '999px' }} />
      </div>
      <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '6px' }}>{fmt(item.lastUpdated)}</div>
    </div>
  )
}

function RepairCard({ item }: { item: ConsoleItem }) {
  const op = (item.op || {}) as any
  return (
    <div style={{ border: '1px solid #FED7AA', borderRadius: '8px', backgroundColor: '#FFFFFF', padding: '12px 14px', marginBottom: '8px' }}>
      <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900 }}>{item.title}</div>
      {op.repairCategories?.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
          {op.repairCategories.map((cat: string) => (
            <Badge key={cat} color="#F97316" small>
              {cat}
            </Badge>
          ))}
        </div>
      )}
      <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '6px' }}>{fmt(item.lastUpdated)}</div>
    </div>
  )
}

function ColdCard({ item }: { item: ConsoleItem }) {
  const op = (item.op || {}) as any
  return (
    <div style={{ border: '1px solid #E9D5FF', borderRadius: '8px', backgroundColor: '#FFFFFF', padding: '12px 14px', marginBottom: '8px' }}>
      <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900 }}>{item.title}</div>
      {op.reasonStored && <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px', lineHeight: 1.3 }}>{op.reasonStored}</div>}
      {op.recoverable && <Badge color={op.recoverable === 'YES' ? '#16A34A' : op.recoverable === 'MAYBE' ? '#D97706' : '#64748B'} small>{op.recoverable}</Badge>}
      <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '6px' }}>{fmt(item.lastUpdated)}</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductionApprovalPage() {
  const [consolePayload, setConsolePayload] = useState<any>(null)
  const [approvalPayload, setApprovalPayload] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ApprovalTab>('ready_for_review')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [consoleRes, rfrRes, allRes] = await Promise.all([
        fetch('/api/admin/production-console', { cache: 'no-store' }),
        fetch('/api/admin/content-approval?tab=ready_for_review&includeBlocked=false', { cache: 'no-store' }),
        fetch('/api/admin/content-approval?tab=all&includeBlocked=true', { cache: 'no-store' }),
      ])
      const consoleData = await consoleRes.json()
      const rfrData = await rfrRes.json()
      const allData = await allRes.json()

      if (!consoleData.success) throw new Error(consoleData.error || 'Failed to load production console')
      if (!allData.success) throw new Error(allData.error || 'Failed to load approval items')

      setConsolePayload(consoleData)
      setApprovalPayload({ rfrReadyCount: rfrData.counts?.items || 0, allItems: allData.items || [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const tabCounts = useMemo(() => {
    if (!approvalPayload?.allItems) return { ready_for_review: 0, approved_ready: 0, published: 0, repair_queue: 0, cold_storage: 0, being_repaired: 0 }
    const counts: Record<ApprovalTab | 'being_repaired', number> = { ready_for_review: 0, approved_ready: 0, published: 0, repair_queue: 0, cold_storage: 0, being_repaired: 0 }
    for (const item of approvalPayload.allItems) {
      const episodes = item.type === 'series' ? item.episodes : [item.episode]
      for (const ep of episodes) {
        const state = ep.workflowState as string
        if (state in counts) counts[state as keyof typeof counts]++
      }
    }
    return counts
  }, [approvalPayload])

  const filteredApprovalItems = useMemo(() => {
    if (!approvalPayload?.allItems) return []
    return approvalPayload.allItems.flatMap((item: ApprovalItem) => {
      if (item.type === 'series') {
        return item.episodes.filter((ep) => ep.workflowState === activeTab).map((ep) => ({ ...ep, seriesTitle: item.title }))
      }
      return item.episode.workflowState === activeTab ? [item.episode] : []
    })
  }, [approvalPayload, activeTab])

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#64748B' }}>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>Loading Production & Approval Dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#991B1B', fontSize: '13px', fontWeight: 700 }}>{error}</div>
      </div>
    )
  }

  const repairCount = (consolePayload?.repairItems?.length || 0)
  const repairStoriesCount = consolePayload?.repairStoriesCount || 0
  const coldCount = (consolePayload?.coldStorageItems?.length || 0) + (consolePayload?.incubatorItems?.length || 0)
  const coldStoriesCount = consolePayload?.coldStoriesCount || 0

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '24px' }}>
      <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 950, color: '#111827' }}>Production & Approval</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>Unified view of production pipeline and content approval</p>
        </div>

        {/* Two-column layout: Production (44%) | Approval (56%) */}
        <div style={{ display: 'flex', gap: '24px', '@media (max-width: 1100px)': { flexDirection: 'column' } } as React.CSSProperties}>
          {/* LEFT: Production Status */}
          <div style={{ flex: '0 0 calc(44% - 12px)', minWidth: 0 }}>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <SectionHeader icon="🏭" title="Production Pipeline" color="#2563EB" count={(consolePayload?.queueItems?.length || 0) + (consolePayload?.inProductionItems?.length || 0) + (consolePayload?.repairItems?.length || 0) + (consolePayload?.coldStorageItems?.length || 0)} />

              {/* Stories in Queue */}
              <div style={{ padding: '14px', borderBottom: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stories In Queue</span>
                  <Badge color="#64748B">{consolePayload?.queueItems?.length || 0}</Badge>
                </div>
                {(consolePayload?.queueItems || []).slice(0, 5).map((item: ConsoleItem) => (
                  <QueueCard key={item.key} item={item} />
                ))}
                {(consolePayload?.queueItems?.length || 0) === 0 && <div style={{ color: '#94A3B8', fontSize: '12px', padding: '8px' }}>No items queued</div>}
              </div>

              {/* In Production */}
              <div style={{ padding: '14px', borderBottom: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>In Production</span>
                  <Badge color="#2563EB">{consolePayload?.inProductionItems?.length || 0}</Badge>
                </div>
                {(consolePayload?.inProductionItems || []).slice(0, 5).map((item: ConsoleItem) => (
                  <ProductionCard key={item.key} item={item} />
                ))}
                {(consolePayload?.inProductionItems?.length || 0) === 0 && <div style={{ color: '#94A3B8', fontSize: '12px', padding: '8px' }}>No active production jobs</div>}
              </div>

              {/* Repair Queue */}
              <div style={{ padding: '14px', borderBottom: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Repair Queue</span>
                  <Badge color="#F97316">{repairCount} cases · {repairStoriesCount} stories</Badge>
                </div>
                {(consolePayload?.repairItems || []).slice(0, 5).map((item: ConsoleItem) => (
                  <RepairCard key={item.key} item={item} />
                ))}
                {repairCount === 0 && <div style={{ color: '#94A3B8', fontSize: '12px', padding: '8px' }}>No stories in repair queue</div>}
              </div>

              {/* Cold Storage */}
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cold Storage</span>
                  <Badge color="#8B5CF6">{coldCount} cases · {coldStoriesCount} stories</Badge>
                </div>
                {(consolePayload?.coldStorageItems || []).slice(0, 5).map((item: ConsoleItem) => (
                  <ColdCard key={item.key} item={item} />
                ))}
                {coldCount === 0 && <div style={{ color: '#94A3B8', fontSize: '12px', padding: '8px' }}>No cold storage items</div>}
              </div>
            </div>
          </div>

          {/* RIGHT: Content Approval */}
          <div style={{ flex: '0 0 calc(56% - 12px)', minWidth: 0 }}>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E5E7EB', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader
                icon="✅"
                title="Ready to Review & Approve"
                color="#3B82F6"
                count={filteredApprovalItems.length}
              />

              <TabBar
                tabs={[
                  { id: 'ready_for_review', label: 'Ready For Review', count: tabCounts.ready_for_review, color: '#3B82F6' },
                  { id: 'approved_ready', label: 'Ready To Publish', count: tabCounts.approved_ready, color: '#10B981' },
                  { id: 'published', label: 'Published', count: tabCounts.published, color: '#8B5CF6' },
                  { id: 'repair_queue', label: 'Repair Queue', count: (tabCounts.repair_queue + (tabCounts.being_repaired || 0)), color: '#F97316' },
                  { id: 'cold_storage', label: 'Cold Storage', count: tabCounts.cold_storage, color: '#64748B' },
                ]}
                active={activeTab}
                onSelect={setActiveTab}
              />

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                {filteredApprovalItems.length === 0 ? (
                  <div style={{ color: '#94A3B8', fontSize: '12px', padding: '8px', textAlign: 'center' }}>
                    No items in {activeTab} tab
                  </div>
                ) : (
                  filteredApprovalItems.map((ep) => (
                    <StoryCard key={ep.storyId} episode={ep} onAction={(action, episode) => {
                      if (action === 'review') window.location.href = `/admin/production/approval?storyId=${episode.storyId}`
                      if (action === 'publish') window.location.href = `/admin/production/approval?storyId=${episode.storyId}`
                      if (action === 'view') window.location.href = `/admin/production/approval?storyId=${episode.storyId}`
                      if (action === 'repair') window.location.href = `/admin/production/approval?storyId=${episode.storyId}`
                    }} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
