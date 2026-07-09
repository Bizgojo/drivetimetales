'use client'

import { useEffect, useMemo, useState } from 'react'
import { partitionProductionItems, isTerminalJobStatus } from '@/lib/dispatchGuards'

// ── Types (must mirror route ConsoleItem.op shape) ────────────────────────────

type ApprovalGate = {
  approvalReady: boolean
  blockReasons: string[]
  recommendedAction: string | null
}

type OpData = {
  // Repair
  repairStage?: 'queued_for_repair' | 'being_repaired' | 'vega_review' | 'blocked'
  repairCategories?: string[]
  parsedRepairReasons?: string[]
  repairOwner?: string
  repairNextAction?: string
  repairAfterCompletion?: string
  queuePosition?: number
  waitingDays?: number
  // Production
  stepLabel?: string
  progressPct?: number
  isStalled?: boolean
  stalledHours?: number
  productionOwner?: string
  productionNextAction?: string
  productionBlocker?: string | null
  // ATL-MON-002: nested error display
  errorSummary?: string | null
  recoveryAction?: string | null
  seriesDisplay?: string | null
  // ATL-DISPATCH-DEFECTS-001: explicit activity flags from the API
  isTerminal?: boolean
  isActiveJob?: boolean
  // ATL-OPS-001 CHANGE 1: story metadata for failed-job displays
  storyTitle?: string | null
  episodeDisplay?: string | null
  // Cold Storage
  reasonStored?: string
  recoverable?: 'YES' | 'NO' | 'MAYBE'
  coldRecommendedAction?: string
  // Queue
  queueSource?: string
  queueOwner?: string
  queueNextAction?: string
  queuePositionIndex?: number
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
  op?: OpData
  _approvalGate?: ApprovalGate
  _gate?: { blocked: boolean; blockedReason?: string; warnings: string[] }
  jobs?: Array<{ id: string; status: string | null; currentStep: string | null; updatedAt: string | null }>
  queue?: {
    id: string; title: string; genre: string | null; duration: string | null
    episodeCount: number | null; status: string | null; priority: number | null
    createdAt: string | null; updatedAt: string | null; brief: string | null
    source: string | null; notes: string | null
  } | null
}

type RecentFailure = {
  jobId: string
  storyId: string | null
  storyTitle: string
  seriesDisplay: string
  episodeDisplay: string | null
  minutesSinceFailed: number
  errorSummary: string
}

type ConsolePayload = {
  success: boolean
  error?: string
  fetchedAt?: string
  repairItems?: ConsoleItem[]
  inProductionItems?: ConsoleItem[]
  coldStorageItems?: ConsoleItem[]
  incubatorItems?: ConsoleItem[]
  queueItems?: ConsoleItem[]
  readyForReviewItems?: ConsoleItem[]
  recentFailures?: RecentFailure[]
}

type SectionId = 'queue' | 'production' | 'repair' | 'cold'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTIONS: Array<{ id: SectionId; label: string; color: string; icon: string }> = [
  { id: 'queue',      label: 'Stories In Queue', color: '#64748b', icon: '📋' },
  { id: 'production', label: 'In Production',    color: '#2563eb', icon: '⚙️' },
  { id: 'repair',     label: 'Production Holds', color: '#f97316', icon: '🔧' },
  { id: 'cold',       label: 'Cold Storage',     color: '#8b5cf6', icon: '🗄️' },
]

const REPAIR_STAGE_LABELS: Record<string, string> = {
  queued_for_repair: 'Queued For Repair',
  being_repaired:    'Being Repaired',
  vega_review:       'Under Vega Review',
  blocked:           'Blocked',
}
const REPAIR_STAGE_COLORS: Record<string, string> = {
  queued_for_repair: '#f97316',
  being_repaired:    '#2563eb',
  vega_review:       '#7c3aed',
  blocked:           '#dc2626',
}

const RECOVERABLE_COLORS = { YES: '#16a34a', NO: '#64748b', MAYBE: '#d97706' }

const COLD_ACTION_COLORS: Record<string, string> = {
  'Move to Production': '#2563eb',
  'Move to Repair':     '#f97316',
  'Keep For Training':  '#64748b',
  'Audit Required':     '#dc2626',
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fmt(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Not recorded'
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function s(n: number | undefined, word: string) {
  return `${n ?? 0} ${word}${(n ?? 0) !== 1 ? 's' : ''}`
}

// ── Shared components ─────────────────────────────────────────────────────────

function Badge({ children, color, small }: { children: React.ReactNode; color: string; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px',
      padding: small ? '1px 6px' : '3px 8px',
      backgroundColor: `${color}18`, color, fontSize: small ? '10px' : '11px', fontWeight: 900,
    } as React.CSSProperties}>
      {children}
    </span>
  )
}

function FieldGrid({ fields }: { fields: Array<{ label: string; value: React.ReactNode; accent?: string }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '7px', marginTop: '10px' } as React.CSSProperties}>
      {fields.map(({ label, value, accent }) => (
        <div key={label} style={{ padding: '8px 10px', borderRadius: '7px', backgroundColor: '#F8FAFC', border: `1px solid ${accent ?? '#E5E7EB'}` } as React.CSSProperties}>
          <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>{label}</div>
          <div style={{ color: '#0F172A', fontSize: '12px', fontWeight: 900, marginTop: '3px', lineHeight: 1.35 } as React.CSSProperties}>{value || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function ActionRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', borderRadius: '7px', backgroundColor: color ? `${color}0c` : '#F8FAFC', border: `1px solid ${color ? color + '30' : '#E5E7EB'}`, marginTop: '8px' } as React.CSSProperties}>
      <span style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', paddingTop: '1px', minWidth: '110px' } as React.CSSProperties}>{label}</span>
      <span style={{ color: color ?? '#0F172A', fontSize: '12px', fontWeight: 800, lineHeight: 1.4 } as React.CSSProperties}>{value}</span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '22px', borderRadius: '8px', border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>
      {text}
    </div>
  )
}

function SectionShell({
  icon, title, color, count, children,
}: { icon: string; title: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '20px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E5E7EB' } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties}>
          <span>{icon}</span>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '16px', fontWeight: 950 } as React.CSSProperties}>{title}</h2>
        </div>
        <Badge color={color}>{count}</Badge>
      </div>
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' } as React.CSSProperties}>{children}</div>
    </section>
  )
}

// ── REPAIR QUEUE ──────────────────────────────────────────────────────────────

function RepairCard({ item }: { item: ConsoleItem }) {
  const [open, setOpen] = useState(false)
  const op = item.op ?? {}
  const stage = op.repairStage ?? 'queued_for_repair'
  const stageLabel = REPAIR_STAGE_LABELS[stage]
  const stageColor = REPAIR_STAGE_COLORS[stage]
  const categories = op.repairCategories ?? []
  const reasons = op.parsedRepairReasons ?? []
  const waiting = op.waitingDays ?? 0

  return (
    <div style={{ border: '1px solid #FED7AA', borderLeft: `4px solid ${stageColor}`, borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
      >
        <div style={{ minWidth: 0, flex: 1 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' } as React.CSSProperties}>
            <span style={{ color: '#111827', fontSize: '15px', fontWeight: 950 } as React.CSSProperties}>{item.title}</span>
            <Badge color={stageColor}>{stageLabel}</Badge>
            {item.type === 'series' && <Badge color="#475569" small>Series · {s(item.affectedEpisodes.length, 'ep')}</Badge>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } as React.CSSProperties}>
            {categories.map(cat => <Badge key={cat} color="#f97316" small>{cat}</Badge>)}
            {waiting > 0 && <Badge color="#94a3b8" small>Waiting {waiting}d</Badge>}
            {op.queuePosition && <Badge color="#64748b" small>#{op.queuePosition} in queue</Badge>}
          </div>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', flexShrink: 0, paddingTop: '2px' } as React.CSSProperties}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #FED7AA', padding: '13px 14px', backgroundColor: '#FFFBF5' } as React.CSSProperties}>
          {/* Reason */}
          {reasons.length > 0 && (
            <div style={{ marginBottom: '8px' } as React.CSSProperties}>
              <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' } as React.CSSProperties}>Repair Reason</div>
              {reasons.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#7c2d12', lineHeight: 1.45, marginBottom: '3px' } as React.CSSProperties}>
                  <span style={{ flexShrink: 0 }}>•</span><span>{r}</span>
                </div>
              ))}
            </div>
          )}

          <ActionRow label="Owner" value={op.repairOwner} color={stageColor} />
          <ActionRow label="Next Action" value={op.repairNextAction} color="#f97316" />
          <ActionRow label="After Completion" value={op.repairAfterCompletion} />

          <FieldGrid fields={[
            { label: 'State',      value: stageLabel,        accent: stageColor + '50' },
            { label: 'Categories', value: categories.join(', ') || '—' },
            { label: 'Last Updated', value: fmt(item.lastUpdated) },
            { label: 'Queue Position', value: op.queuePosition ? `#${op.queuePosition}` : '—' },
          ]} />
        </div>
      )}
    </div>
  )
}

function RepairSection({ items }: { items: ConsoleItem[] }) {
  if (items.length === 0) return (
    <SectionShell icon="🔧" title="Production Holds" color="#f97316" count={0}>
      <EmptyState text="No stories currently in Production Holds." />
    </SectionShell>
  )
  const staged = {
    vega_review:       items.filter(i => i.op?.repairStage === 'vega_review'),
    being_repaired:    items.filter(i => i.op?.repairStage === 'being_repaired'),
    queued_for_repair: items.filter(i => !i.op?.repairStage || i.op?.repairStage === 'queued_for_repair'),
    blocked:           items.filter(i => i.op?.repairStage === 'blocked'),
  }
  return (
    <SectionShell icon="🔧" title="Production Holds" color="#f97316" count={items.length}>
      {staged.vega_review.length > 0 && <>
        <div style={{ color: '#7c3aed', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Under Vega Review ({staged.vega_review.length})</div>
        {staged.vega_review.map(i => <RepairCard key={i.key} item={i} />)}
      </>}
      {staged.being_repaired.length > 0 && <>
        <div style={{ color: '#2563eb', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Being Repaired ({staged.being_repaired.length})</div>
        {staged.being_repaired.map(i => <RepairCard key={i.key} item={i} />)}
      </>}
      {staged.queued_for_repair.length > 0 && <>
        <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Queued For Repair ({staged.queued_for_repair.length})</div>
        {staged.queued_for_repair.map(i => <RepairCard key={i.key} item={i} />)}
      </>}
      {staged.blocked.length > 0 && <>
        <div style={{ color: '#dc2626', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Blocked ({staged.blocked.length})</div>
        {staged.blocked.map(i => <RepairCard key={i.key} item={i} />)}
      </>}
    </SectionShell>
  )
}

// ── IN PRODUCTION ─────────────────────────────────────────────────────────────

function ProductionCard({ item }: { item: ConsoleItem }) {
  const [open, setOpen] = useState(true) // default open — fewer items expected
  const op = item.op ?? {}
  const pct = op.progressPct ?? 0
  const isStalled = op.isStalled === true
  const stalled = op.stalledHours ?? 0
  // ATL-DISPATCH-DEFECTS-001: terminal jobs (failed/cancelled/complete) must
  // never render an "In Production"/active badge.
  const status = String(item.status || '').trim().toLowerCase()
  const isTerminal = op.isTerminal === true || isTerminalJobStatus(status)
  const color = isStalled || status === 'failed' ? '#dc2626' : isTerminal ? '#64748b' : '#2563eb'

  return (
    <div style={{ border: `1px solid ${isStalled ? '#FECACA' : '#BFDBFE'}`, borderLeft: `4px solid ${color}`, borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
      >
        <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' } as React.CSSProperties}>
            <span style={{ color: '#111827', fontSize: '15px', fontWeight: 950 } as React.CSSProperties}>{item.title}</span>
            {isStalled
              ? <Badge color="#dc2626">⚠️ STALLED {stalled}h</Badge>
              : status === 'failed'
                ? <Badge color="#dc2626">❌ Failed — Not Running</Badge>
                : isTerminal
                  ? <Badge color="#64748b">{status === 'complete' ? 'Complete' : 'Cancelled'} — Not Running</Badge>
                  : <Badge color="#2563eb">In Production</Badge>}
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: '8px' } as React.CSSProperties}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } as React.CSSProperties}>
              <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 700 } as React.CSSProperties}>{op.stepLabel || 'Unknown step'}</span>
              <span style={{ color: color, fontSize: '11px', fontWeight: 900 } as React.CSSProperties}>{pct}%</span>
            </div>
            <div style={{ height: '6px', borderRadius: '999px', backgroundColor: '#E5E7EB', overflow: 'hidden' } as React.CSSProperties}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: '999px', backgroundColor: color, transition: 'width 0.4s' } as React.CSSProperties} />
            </div>
          </div>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', flexShrink: 0, paddingTop: '2px' } as React.CSSProperties}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${isStalled ? '#FECACA' : '#BFDBFE'}`, padding: '13px 14px', backgroundColor: isStalled ? '#FFF5F5' : '#F0F7FF' } as React.CSSProperties}>
          {/* ATL-MON-002 / ATL-OPS-001: Error summary and story metadata for failed jobs */}
          {item.status === 'failed' && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderRadius: '7px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', marginBottom: '8px' } as React.CSSProperties}>
              <span>❌</span>
              <div style={{ flex: 1 }}>
                {/* ATL-OPS-001 CHANGE 1: story metadata */}
                <div style={{ color: '#7F1D1D', fontSize: '11px', fontWeight: 900, marginBottom: '3px' } as React.CSSProperties}>
                  Story: &quot;{op.storyTitle || item.title}&quot;
                  {op.seriesDisplay && op.seriesDisplay !== 'Standalone' && (
                    <> — Series: {op.seriesDisplay}{op.episodeDisplay ? ` · ${op.episodeDisplay}` : ''}</>
                  )}
                  {op.seriesDisplay === 'Standalone' && <> — Standalone</>}
                </div>
                {op.errorSummary && (
                  <div style={{ color: '#991B1B', fontSize: '12px', fontWeight: 800 } as React.CSSProperties}>{op.errorSummary}</div>
                )}
                {op.recoveryAction && (
                  <div style={{ color: '#7F1D1D', fontSize: '11px', marginTop: '4px', fontStyle: 'italic' } as React.CSSProperties}>
                    Recovery: {op.recoveryAction}
                  </div>
                )}
              </div>
            </div>
          )}
          {op.productionBlocker && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderRadius: '7px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', marginBottom: '8px' } as React.CSSProperties}>
              <span>🚫</span>
              <span style={{ color: '#991B1B', fontSize: '12px', fontWeight: 800 } as React.CSSProperties}>{op.productionBlocker}</span>
            </div>
          )}
          <ActionRow label="Owner" value={op.productionOwner} color={color} />
          <ActionRow label="Next Action" value={op.productionNextAction} color={isStalled ? '#dc2626' : '#2563eb'} />
          {item.status !== 'failed' && (
            <ActionRow label="After Completion" value="Story moves to Ready For Review → Content Approval" />
          )}
          <FieldGrid fields={[
            { label: 'Current Step', value: op.stepLabel },
            { label: 'Progress',     value: `${pct}%` },
            { label: 'Owner',        value: op.productionOwner },
            { label: 'Series',       value: op.seriesDisplay ?? '—' },
            { label: 'Last Updated', value: fmt(item.lastUpdated) },
            { label: 'Status',       value: item.status },
            { label: 'Episodes',     value: item.episodeCount || '—' },
          ]} />
        </div>
      )}
    </div>
  )
}

function ProductionSection({ items }: { items: ConsoleItem[] }) {
  // ATL-DISPATCH-DEFECTS-001: "Active" may contain ONLY status IN ('running','queued').
  // Terminal jobs (failed/cancelled/complete) are shown in their own group and
  // must never be presented as active/rendering.
  const { active, stalled, terminal, waiting } = partitionProductionItems(items)
  if (items.length === 0) return (
    <SectionShell icon="⚙️" title="In Production" color="#2563eb" count={0}>
      <EmptyState text="No active production jobs." />
    </SectionShell>
  )
  return (
    <SectionShell icon="⚙️" title="In Production" color="#2563eb" count={items.length}>
      {stalled.length > 0 && <>
        <div style={{ color: '#dc2626', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>⚠️ Stalled — Local Execution Required ({stalled.length})</div>
        {stalled.map(i => <ProductionCard key={i.key} item={i} />)}
      </>}
      {active.length > 0 && <>
        <div style={{ color: '#2563eb', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Active ({active.length})</div>
        {active.map(i => <ProductionCard key={i.key} item={i} />)}
      </>}
      {waiting.length > 0 && <>
        <div style={{ color: '#a16207', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>⏳ Waiting on External ({waiting.length})</div>
        {waiting.map(i => <ProductionCard key={i.key} item={i} />)}
      </>}
      {terminal.length > 0 && <>
        <div style={{ color: '#dc2626', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>❌ Failed / Terminal — Not Running ({terminal.length})</div>
        {terminal.map(i => <ProductionCard key={i.key} item={i} />)}
      </>}
    </SectionShell>
  )
}

// ── COLD STORAGE ──────────────────────────────────────────────────────────────

function ColdCard({ item }: { item: ConsoleItem }) {
  const [open, setOpen] = useState(false)
  const op = item.op ?? {}
  const rec = op.recoverable ?? 'NO'
  const recColor = RECOVERABLE_COLORS[rec]
  const actionColor = op.coldRecommendedAction ? (COLD_ACTION_COLORS[op.coldRecommendedAction] ?? '#64748b') : '#64748b'

  return (
    <div style={{ border: '1px solid #E9D5FF', borderLeft: `4px solid #8b5cf6`, borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
      >
        <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' } as React.CSSProperties}>
            <span style={{ color: '#111827', fontSize: '14px', fontWeight: 950 } as React.CSSProperties}>{item.title}</span>
            <Badge color={recColor} small>Recoverable: {rec}</Badge>
            {op.coldRecommendedAction && <Badge color={actionColor} small>{op.coldRecommendedAction}</Badge>}
          </div>
          {op.reasonStored && (
            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', lineHeight: 1.35 } as React.CSSProperties}>{op.reasonStored}</div>
          )}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', flexShrink: 0, paddingTop: '2px' } as React.CSSProperties}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #E9D5FF', padding: '12px 14px', backgroundColor: '#FAF5FF' } as React.CSSProperties}>
          <ActionRow label="Reason Stored" value={op.reasonStored} />
          <ActionRow label="Recommended Action" value={op.coldRecommendedAction} color={actionColor} />
          <FieldGrid fields={[
            { label: 'Recoverable', value: rec, accent: recColor + '50' },
            { label: 'Type',        value: item.type === 'series' ? `Series · ${s(item.affectedEpisodes.length, 'ep')}` : 'Story' },
            { label: 'Last Updated', value: fmt(item.lastUpdated) },
            { label: 'Notes', value: item.reviewNotes ? item.reviewNotes.slice(0, 80) : '—' },
          ]} />
        </div>
      )}
    </div>
  )
}

function ColdSection({ items, incubatorItems }: { items: ConsoleItem[]; incubatorItems: ConsoleItem[] }) {
  const total = items.length + incubatorItems.length
  const recoverable = items.filter(i => i.op?.recoverable === 'YES')
  const maybe = items.filter(i => i.op?.recoverable === 'MAYBE')
  const notRecoverable = items.filter(i => !i.op?.recoverable || i.op?.recoverable === 'NO')
  return (
    <SectionShell icon="🗄️" title="Cold Storage" color="#8b5cf6" count={total}>
      {incubatorItems.length > 0 && <>
        <div style={{ color: '#7c3aed', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>🌱 Incubator — Recovery Candidates ({incubatorItems.length})</div>
        {incubatorItems.map(i => <ColdCard key={i.key} item={i} />)}
      </>}
      {recoverable.length > 0 && <>
        <div style={{ color: '#16a34a', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Recoverable ({recoverable.length})</div>
        {recoverable.map(i => <ColdCard key={i.key} item={i} />)}
      </>}
      {maybe.length > 0 && <>
        <div style={{ color: '#d97706', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Possibly Recoverable ({maybe.length})</div>
        {maybe.map(i => <ColdCard key={i.key} item={i} />)}
      </>}
      {notRecoverable.length > 0 && <>
        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties}>Archived ({notRecoverable.length})</div>
        {notRecoverable.map(i => <ColdCard key={i.key} item={i} />)}
      </>}
      {total === 0 && <EmptyState text="No Cold Storage items found." />}
    </SectionShell>
  )
}

// ── STORIES IN QUEUE ──────────────────────────────────────────────────────────

function QueueCard({ item }: { item: ConsoleItem }) {
  const [open, setOpen] = useState(false)
  const op = item.op ?? {}
  const q = item.queue

  return (
    <div style={{ border: '1px solid #E2E8F0', borderLeft: '4px solid #64748b', borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
      >
        <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' } as React.CSSProperties}>
            {op.queuePositionIndex && <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 900, minWidth: '20px' } as React.CSSProperties}>#{op.queuePositionIndex}</span>}
            <span style={{ color: '#111827', fontSize: '14px', fontWeight: 950 } as React.CSSProperties}>{item.title}</span>
            {op.queueSource && <Badge color="#64748b" small>{op.queueSource}</Badge>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '5px' } as React.CSSProperties}>
            {q?.genre && <Badge color="#475569" small>{q.genre}</Badge>}
            {q?.episodeCount && <Badge color="#475569" small>{s(q.episodeCount, 'episode')}</Badge>}
            {q?.duration && <Badge color="#475569" small>{q.duration}</Badge>}
            <Badge color="#64748b" small>Owner: {op.queueOwner ?? 'Hal'}</Badge>
          </div>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', flexShrink: 0, paddingTop: '2px' } as React.CSSProperties}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 14px', backgroundColor: '#F8FAFC' } as React.CSSProperties}>
          <ActionRow label="Owner"       value={op.queueOwner ?? 'Hal'}        color="#64748b" />
          <ActionRow label="Next Action" value={op.queueNextAction}            color="#64748b" />
          <ActionRow label="After Production" value="Story enters In Production → Ready For Review" />
          {q?.brief && <div style={{ marginTop: '8px', color: '#475569', fontSize: '12px', lineHeight: 1.45 } as React.CSSProperties}>{q.brief}</div>}
          <FieldGrid fields={[
            { label: 'Source',    value: op.queueSource },
            { label: 'Status',    value: item.status },
            { label: 'Genre',     value: q?.genre },
            { label: 'Episodes',  value: q?.episodeCount ? String(q.episodeCount) : '—' },
            { label: 'Duration',  value: q?.duration },
            { label: 'Queued',    value: fmt(q?.createdAt) },
          ]} />
          {q?.notes && <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '7px', backgroundColor: '#ffffff', border: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', lineHeight: 1.4 } as React.CSSProperties}>{q.notes}</div>}
        </div>
      )}
    </div>
  )
}

function QueueSection({ items }: { items: ConsoleItem[] }) {
  return (
    <SectionShell icon="📋" title="Stories In Queue" color="#64748b" count={items.length}>
      {items.length === 0
        ? <EmptyState text="No stories queued for production." />
        : items.map(i => <QueueCard key={i.key} item={i} />)}
    </SectionShell>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

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

  useEffect(() => { loadConsole() }, [])

  const counts = useMemo(() => ({
    queue:      payload?.queueItems?.length ?? 0,
    production: payload?.inProductionItems?.length ?? 0,
    repair:     payload?.repairItems?.length ?? 0,
    cold:       (payload?.coldStorageItems?.length ?? 0) + (payload?.incubatorItems?.length ?? 0),
  }), [payload])

  // ATL-OPS-001 CHANGE 2: red alert banner data
  const recentFailures = payload?.recentFailures ?? []

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', color: '#111827', padding: '24px' }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto' }}>

        {/* ATL-OPS-001 CHANGE 2: Red alert banner for recent failures (last 24h) */}
        {recentFailures.length > 0 && (
          <div style={{ marginBottom: '20px', borderRadius: '10px', border: '2px solid #DC2626', backgroundColor: '#FEF2F2', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px' }}>🚨</span>
              <span style={{ color: '#991B1B', fontSize: '15px', fontWeight: 950 }}>
                PIPELINE ALERT — {recentFailures.length} failed job{recentFailures.length !== 1 ? 's' : ''} in last 24h
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentFailures.map((f) => (
                <div key={f.jobId} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '6px 10px', borderRadius: '6px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', fontSize: '12px', color: '#7F1D1D', fontWeight: 700, flexWrap: 'wrap' }}>
                  <span>⚠️</span>
                  <span>
                    &quot;{f.storyTitle}&quot;
                    {f.seriesDisplay !== 'Standalone' ? ` (${f.seriesDisplay}${f.episodeDisplay ? ` · ${f.episodeDisplay}` : ''})` : ' (Standalone)'}
                    {' — '}
                    <span style={{ color: '#991B1B', fontWeight: 900 }}>{f.errorSummary}</span>
                    {' — '}
                    <span style={{ color: '#B91C1C' }}>{f.minutesSinceFailed}m ago</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: '#111827', fontSize: '28px', fontWeight: 950 }}>Production Console</h1>
            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>Operational management dashboard — ATL-CONS-002</p>
            {payload?.fetchedAt && (
              <div style={{ marginTop: '6px', color: '#94A3B8', fontSize: '11px', fontWeight: 800 }}>
                Fetched {fmt(payload.fetchedAt)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={loadConsole}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#ffffff', color: '#374151', padding: '8px 12px', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '18px' }}>
          {SECTIONS.map(({ id, label, color, icon }) => {
            const active = activeSection === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                style={{
                  border: `1px solid ${active ? color : '#E5E7EB'}`,
                  borderRadius: '999px',
                  backgroundColor: active ? `${color}12` : '#ffffff',
                  color: active ? color : '#475569',
                  padding: '8px 11px',
                  fontSize: '12px',
                  fontWeight: 950,
                  cursor: 'pointer',
                }}
              >
                {icon} {label} ({counts[id]})
              </button>
            )
          })}
        </div>

        {/* Loading / error */}
        {loading && <EmptyState text="Loading Production Console..." />}
        {error && (
          <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#991B1B', fontSize: '13px', fontWeight: 800 }}>
            {error}
          </div>
        )}

        {/* Sections */}
        {!loading && !error && activeSection === 'queue' && (
          <QueueSection items={payload?.queueItems ?? []} />
        )}
        {!loading && !error && activeSection === 'production' && (
          <ProductionSection items={payload?.inProductionItems ?? []} />
        )}
        {!loading && !error && activeSection === 'repair' && (
          <RepairSection items={payload?.repairItems ?? []} />
        )}
        {!loading && !error && activeSection === 'cold' && (
          <ColdSection items={payload?.coldStorageItems ?? []} incubatorItems={payload?.incubatorItems ?? []} />
        )}

      </div>
    </div>
  )
}
