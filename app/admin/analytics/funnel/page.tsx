'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type BellVariant = 'bell-arm1' | 'bell-arm2' | 'bell-arm3'
type FunnelStage = 'page_view' | 'play_start' | 'pct_25' | 'pct_50' | 'pct_75' | 'wall_shown' | 'wall_submit'

interface FunnelData {
  generatedAt: string
  stages: FunnelStage[]
  arms: Record<BellVariant, Record<FunnelStage, number>>
}

interface MetaReachData {
  reach: number | null
  adSetName: string
  generatedAt: string
  cacheTtlSeconds: number
}

type MetaReachState =
  | { status: 'loading' }
  | { status: 'ok'; data: MetaReachData }
  | { status: 'error'; message: string }

// ─── Config ───────────────────────────────────────────────────────────────────

const ARMS: BellVariant[] = ['bell-arm1', 'bell-arm2', 'bell-arm3']
const ARM_LABELS: Record<BellVariant, string> = {
  'bell-arm1': 'Arm 1',
  'bell-arm2': 'Arm 2',
  'bell-arm3': 'Arm 3',
}

/** Only Arm 2 has a live Meta ad set — Arms 1 and 3 are intentionally inactive. */
const ARM_WITH_META_ADS: BellVariant = 'bell-arm2'

const STAGE_LABELS: Record<FunnelStage, string> = {
  page_view: 'Page View',
  play_start: 'Play Start',
  pct_25: '25% listened',
  pct_50: '50% listened',
  pct_75: '75% listened',
  wall_shown: 'Wall Shown',
  wall_submit: 'Wall Submit',
}

const LOW_N_THRESHOLD = 20  // ⚠️ badge if denominator < 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, denom: number): string {
  if (denom === 0) return '—'
  return Math.round((num / denom) * 100) + '%'
}

function cell(num: number, denom: number): { label: string; warn: boolean } {
  if (denom === 0) return { label: '—', warn: false }
  const rate = Math.round((num / denom) * 100)
  return {
    label: `${rate}% (${num}/${denom})`,
    warn: denom < LOW_N_THRESHOLD,
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: { padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' } as React.CSSProperties,
  heading: { fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 0.15rem' } as React.CSSProperties,
  subtitle: { fontSize: 13, color: '#64748b', margin: '0 0 0.5rem' } as React.CSSProperties,
  meta: { fontSize: 11, color: '#94a3b8', margin: '0 0 1.5rem' } as React.CSSProperties,
  section: { marginBottom: '2rem' } as React.CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: '0.75rem' } as React.CSSProperties,
  tableWrap: { overflowX: 'auto' as const, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, background: '#fff', borderRadius: 10 } as React.CSSProperties,
  thRow: { background: '#1e293b' } as React.CSSProperties,
  th: { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' as const },
  thArm: { padding: '12px 16px', textAlign: 'center' as const, fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 170 },
  td: { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b' } as React.CSSProperties,
  tdCenter: { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b', textAlign: 'center' as const },
  tdDash: { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#94a3b8', textAlign: 'center' as const },
  tdMeta: { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b', textAlign: 'center' as const, background: '#f8fafc' } as React.CSSProperties,
  tdReachRow: { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b', background: '#f8fafc' } as React.CSSProperties,
  stageLabel: { fontWeight: 600 } as React.CSSProperties,
  stageSub: { display: 'block', fontSize: 11, color: '#94a3b8' } as React.CSSProperties,
  armKey: { display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 400 } as React.CSSProperties,
  armCount: { display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 } as React.CSSProperties,
  badge: { display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 4, fontWeight: 700 } as React.CSSProperties,
  loading: { padding: '4rem 2rem', textAlign: 'center' as const, color: '#94a3b8', fontSize: 14 },
  error: { padding: '1.5rem 2rem', background: '#fef2f2', borderRadius: 10, color: '#991b1b', fontSize: 13, margin: '2rem 0' } as React.CSSProperties,
  overall: { fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 } as React.CSSProperties,
  reachNum: { fontWeight: 700, fontSize: 15 } as React.CSSProperties,
  reachSub: { display: 'block', fontSize: 10, color: '#94a3b8', marginTop: 2 } as React.CSSProperties,
  metaBadge: { display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 4, fontWeight: 700, verticalAlign: 'middle' } as React.CSSProperties,
}

// ─── Reach cell ───────────────────────────────────────────────────────────────

function ReachCell({ arm, metaState }: { arm: BellVariant; metaState: MetaReachState }) {
  if (arm !== ARM_WITH_META_ADS) {
    return <td style={S.tdDash}>—</td>
  }

  if (metaState.status === 'loading') {
    return (
      <td style={S.tdMeta}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>…</span>
      </td>
    )
  }

  if (metaState.status === 'error') {
    return (
      <td style={S.tdMeta}>
        <span title={metaState.message} style={{ color: '#dc2626', fontSize: 12, cursor: 'help' }}>
          ⚠ error
        </span>
      </td>
    )
  }

  const reach = metaState.data.reach
  if (reach === null) {
    return (
      <td style={S.tdMeta}>
        <span style={{ color: '#94a3b8' }}>—</span>
        <span style={S.reachSub}>ad set not found</span>
      </td>
    )
  }

  return (
    <td style={S.tdMeta}>
      <span style={S.reachNum}>{reach.toLocaleString()}</span>
      <span style={S.reachSub}>unique accounts reached</span>
    </td>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FunnelByArmPage() {
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metaState, setMetaState] = useState<MetaReachState>({ status: 'loading' })

  useEffect(() => {
    const fetchFunnel = fetch('/api/admin/analytics/funnel').then((r) => r.json())
    const fetchReach = fetch('/api/admin/analytics/meta-reach').then((r) => r.json())

    Promise.all([fetchFunnel, fetchReach])
      .then(([funnelData, reachData]) => {
        if (funnelData.error) {
          setError(funnelData.error)
        } else {
          setData(funnelData)
        }

        if (reachData.error) {
          setMetaState({ status: 'error', message: reachData.error })
        } else {
          setMetaState({ status: 'ok', data: reachData as MetaReachData })
        }
      })
      .catch((e) => {
        setError(e.message)
        setMetaState({ status: 'error', message: e.message })
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={S.loading}>Loading funnel data…</div>

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Funnel by Arm</h1>
      <p style={S.subtitle}>Shows where each arm lost people — at the ad, during the promo, or at the wall.</p>
      {data && (
        <p style={S.meta}>
          Generated {new Date(data.generatedAt).toLocaleString()} ·
          Filters: bell-arm1, bell-arm2, bell-arm3 only ·{' '}
          {metaState.status === 'ok' && (
            <>
              Reach via Meta (cached {metaState.data.cacheTtlSeconds / 60} min) ·{' '}
              {new Date(metaState.data.generatedAt).toLocaleString()}
            </>
          )}
        </p>
      )}

      {error && <div style={S.error}>Error loading funnel: {error}</div>}

      {data && (
        <>
          {/* Total sessions per arm */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Session totals (page views)</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' as const }}>
              {ARMS.map(arm => (
                <div key={arm} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.5rem', minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{ARM_LABELS[arm]}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{arm}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: data.arms[arm].page_view === 0 ? '#94a3b8' : '#0f172a' }}>
                    {data.arms[arm].page_view || '0'}
                    {data.arms[arm].page_view < LOW_N_THRESHOLD && data.arms[arm].page_view > 0 && (
                      <span style={S.badge}>⚠️</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>sessions</div>
                </div>
              ))}
            </div>
          </div>

          {/* Funnel table */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Stage-by-stage funnel</div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr style={S.thRow}>
                    <th style={S.th}>Stage</th>
                    {ARMS.map(arm => (
                      <th key={arm} style={S.thArm}>
                        {ARM_LABELS[arm]}
                        <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{arm}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* ── Reach row (Meta ad-delivery metric, above Page View) ── */}
                  <tr>
                    <td style={S.tdReachRow}>
                      <span style={S.stageLabel}>
                        Reach
                        <span style={S.metaBadge}>Meta</span>
                      </span>
                      <span style={S.stageSub}>ad delivery · unique accounts</span>
                    </td>
                    {ARMS.map((arm) => (
                      <ReachCell key={arm} arm={arm} metaState={metaState} />
                    ))}
                  </tr>

                  {/* ── Supabase funnel stages ── */}
                  {(data.stages as FunnelStage[]).map((stage, idx) => {
                    const prevStage = idx > 0 ? data.stages[idx - 1] as FunnelStage : null
                    return (
                      <tr key={stage}>
                        <td style={S.td}>
                          <span style={S.stageLabel}>{STAGE_LABELS[stage]}</span>
                          <span style={S.stageSub}>{stage}</span>
                        </td>
                        {ARMS.map(arm => {
                          const count = data.arms[arm][stage]
                          const pageViews = data.arms[arm].page_view
                          const prevCount = prevStage ? data.arms[arm][prevStage] : pageViews

                          if (pageViews === 0) {
                            return <td key={arm} style={S.tdDash}>—</td>
                          }

                          if (stage === 'page_view') {
                            return (
                              <td key={arm} style={S.tdCenter}>
                                <strong>{count}</strong>
                              </td>
                            )
                          }

                          const stageToPrev = cell(count, prevCount ?? 0)
                          const stageToTop = cell(count, pageViews)

                          return (
                            <td key={arm} style={S.tdCenter}>
                              <span>
                                {stageToPrev.label}
                                {stageToPrev.warn && <span style={S.badge}>⚠️</span>}
                              </span>
                              <span style={S.overall}>
                                vs top: {stageToTop.label}
                                {stageToTop.warn && !stageToPrev.warn && <span style={S.badge}>⚠️</span>}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: '0.75rem' }}>
              Each cell shows <strong>stage-to-previous-stage rate (n/prev)</strong> with overall rate vs page_view below.
              ⚠️ = fewer than {LOW_N_THRESHOLD} sessions in denominator — interpret with caution.{' '}
              Reach = Meta ad-delivery count (live, cached 5 min); only Arm 2 has a running ad set.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
