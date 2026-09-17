'use client'

/**
 * app/admin/cfo-report/page.tsx
 * CFO Morning Report Dashboard — 8-section layout
 * Route: /admin/cfo-report
 *
 * Reads: /api/admin/cfo-report?date=YYYY-MM-DD
 * Styling: light (#FAF9F6 / #fff), dark text — consistent with admin panel
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Types (mirrors compile.ts output) ───────────────────────────────────────

interface CfoAlert {
  level: 'red' | 'yellow' | 'green'
  message: string
}

interface MercuryCard {
  id: string
  name: string
  last4: string
  balance: number
  dailyLimit: number
  monthlyLimit: number
  status: string
}

interface MercuryTransaction {
  merchant: string
  card: string
  amount: number
  purpose: string
}

interface MercuryData {
  balance: number
  accountName: string
  cards: MercuryCard[]
  transactions24h: MercuryTransaction[]
  stale: false
  fetchedAt: string
}

interface MercuryStale { stale: true; reason: string }

interface ElevenLabsData {
  creditsUsed: number
  creditsTotal: number
  pctUsed: number
  remaining: number
  pipelineNeeded: number
  surplus: number
  tier: string
  stale: false
  fetchedAt: string
}

interface ElevenLabsStale { stale: true; reason: string }

interface EpisodeStatus {
  episodeNumber: number
  title: string
  workflowState: string
  needsAttention: boolean
  updatedAt: string
  blocker?: string
}

interface SeriesStatus {
  seriesTitle: string
  episodes: EpisodeStatus[]
}

interface HalStatusData {
  series: SeriesStatus[]
  totalActive: number
  totalNeedsAttention: number
  stale: false
  fetchedAt: string
}

interface HalStatusStale { stale: true; reason: string }

interface StripeData {
  mrr: number
  payingSubCount: number
  newRev24h: number
  activeTrials: number
  stale: false
  fetchedAt: string
}

interface StripeStale { stale: true; reason: string }

interface CfoLedger {
  anthropicMtd: number
  openAiMtd: number
  elMtd: number
  totalAI: number
  infraMtd: number
  totalSpend: number
  revenueMtd: number
  netBurn: number
  daysElapsed: number
  daysInMonth: number
  dailyBurn: number
  runway: number | null
  breakEvenSubs: number | null
  netRevPerSub: number
  workings: string[]
}

interface CfoReport {
  reportDate: string
  generatedAt: string
  alerts: CfoAlert[]
  banking: MercuryData | MercuryStale
  elevenlabs: ElevenLabsData | ElevenLabsStale
  halStatus: HalStatusData | HalStatusStale
  expenses24h: Array<{ merchant: string; card: string; amount: number; purpose: string }>
  revenue: StripeData | StripeStale
  ledger: CfoLedger
  assessment: { runway: string; breakEven: string; keyRisks: string[] }
  blockers: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertBadge({ level, message }: CfoAlert) {
  const colors = {
    red: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', dot: '#dc2626' },
    yellow: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
    green: { bg: '#f0fdf4', border: '#86efac', text: '#166534', dot: '#16a34a' },
  }
  const c = colors[level]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, marginBottom: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 5 }} />
      <span style={{ color: c.text, fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>{message}</span>
    </div>
  )
}

function SectionCard({ title, icon, children, stale }: { title: string; icon: string; children: React.ReactNode; stale?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a', flex: 1 }}>{title}</h2>
        {stale && (
          <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            STALE
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function StaleNotice({ reason }: { reason: string }) {
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
      ⚠️ Data unavailable — {reason}
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number | React.ReactNode)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '8px 12px', color: '#1e293b', verticalAlign: 'middle' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProgressBar({ pct, color = '#f97316' }: { pct: number; color?: string }) {
  const capped = Math.min(100, Math.max(0, pct))
  return (
    <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{ width: `${capped}%`, background: capped > 90 ? '#dc2626' : capped > 70 ? '#f59e0b' : color, height: '100%', borderRadius: 6, transition: 'width 0.4s' }} />
    </div>
  )
}

function LedgerRow({ label, value, formula, bold }: { label: string; value: string; formula?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #f1f5f9', gap: 16 }}>
      <div>
        <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 500, color: '#1e293b' }}>{label}</span>
        {formula && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{formula}</div>}
      </div>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400, color: '#1e293b', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CfoReportPage() {
  const [report, setReport] = useState<CfoReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [refreshing, setRefreshing] = useState(false)

  const fetchReport = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cfo-report?date=${date}`, { cache: 'no-store' })
      const data = await res.json() as { success: boolean; report?: CfoReport; message?: string; error?: string }

      if (!data.success || !data.report) {
        setError(data.message || data.error || 'No report found for this date')
        setReport(null)
      } else {
        setReport(data.report)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReport(selectedDate)
  }, [selectedDate, fetchReport])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchReport(selectedDate)
    setRefreshing(false)
  }

  // ── Header ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      {/* Title Row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#0f172a' }}>📊 CFO Morning Report</h1>
          {report && (
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Generated {fmtDate(report.generatedAt)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1e293b', background: '#fff' }}
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            style={{ padding: '8px 16px', background: '#f97316', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {refreshing ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>
          <p>Loading report…</p>
        </div>
      )}

      {/* Error / No Data */}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#dc2626' }}>No report available</h2>
          <p style={{ margin: 0, color: '#7f1d1d', fontSize: 14 }}>{error}</p>
          <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 13 }}>
            Reports are delivered at 7:00 AM ET daily. Check back after the first report is compiled.
            <br />
            Or run: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>npx ts-node scripts/cfo-report/compile.ts --dry-run</code>
          </p>
        </div>
      )}

      {/* Report */}
      {!loading && report && (
        <>
          {/* Blockers banner */}
          {report.blockers.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 13, marginBottom: 6 }}>⛔ Active Blockers ({report.blockers.length})</div>
              {report.blockers.map((b, i) => (
                <div key={i} style={{ color: '#7c2d12', fontSize: 13, marginTop: 4 }}>• {b}</div>
              ))}
            </div>
          )}

          {/* Section 1: Alerts */}
          <SectionCard title="Alerts" icon="🚨">
            {report.alerts.length === 0 ? (
              <div style={{ color: '#16a34a', fontSize: 14 }}>✅ No alerts — all systems nominal</div>
            ) : (
              report.alerts.map((a, i) => <AlertBadge key={i} {...a} />)
            )}
          </SectionCard>

          {/* Section 2: Bank & Cards */}
          <SectionCard
            title="Bank & Cards"
            icon="🏦"
            stale={report.banking.stale}
          >
            {report.banking.stale ? (
              <StaleNotice reason={(report.banking as MercuryStale).reason} />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px 24px', flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>MERCURY BALANCE</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: (report.banking as MercuryData).balance < 5000 ? '#dc2626' : (report.banking as MercuryData).balance < 15000 ? '#f59e0b' : '#16a34a' }}>
                      {fmtUsd((report.banking as MercuryData).balance)}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{(report.banking as MercuryData).accountName}</div>
                  </div>
                </div>

                {(report.banking as MercuryData).cards.length > 0 ? (
                  <DataTable
                    headers={['Card Name', 'Last 4', 'Balance', 'Daily Limit', 'Monthly Limit', 'Status']}
                    rows={(report.banking as MercuryData).cards.map(card => [
                      card.name,
                      `…${card.last4}`,
                      fmtUsd(card.balance),
                      card.dailyLimit > 0 ? fmtUsd(card.dailyLimit) : '—',
                      card.monthlyLimit > 0 ? fmtUsd(card.monthlyLimit) : '—',
                      <span key="s" style={{ color: card.status === 'active' ? '#16a34a' : '#f59e0b', fontWeight: 600, fontSize: 12 }}>
                        {card.status}
                      </span>,
                    ])}
                  />
                ) : (
                  <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                    Virtual cards: GVL-Meta (7468), GVL-TikTok (3966), ET-Cover (9687) — card list API not returning data
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* Section 3: ElevenLabs Credits */}
          <SectionCard
            title="ElevenLabs Credits"
            icon="🎙"
            stale={report.elevenlabs.stale}
          >
            {report.elevenlabs.stale ? (
              <StaleNotice reason={(report.elevenlabs as ElevenLabsStale).reason} />
            ) : (
              <>
                {(() => {
                  const el = report.elevenlabs as ElevenLabsData
                  return (
                    <>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                        {[
                          { label: 'Used', value: fmtNum(el.creditsUsed), sub: `${el.pctUsed}%` },
                          { label: 'Remaining', value: fmtNum(el.remaining), sub: 'chars left' },
                          { label: 'Pipeline Needs', value: fmtNum(el.pipelineNeeded), sub: 'chars reserved' },
                          { label: 'Surplus', value: el.surplus >= 0 ? `+${fmtNum(el.surplus)}` : fmtNum(el.surplus), sub: el.surplus >= 0 ? '✅ buffer ok' : '🔴 SHORT', color: el.surplus < 0 ? '#dc2626' : '#16a34a' },
                        ].map(({ label, value, sub, color }) => (
                          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 130 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: color || '#0f172a' }}>{value}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                          <span>Character usage — {el.pctUsed}% of {fmtNum(el.creditsTotal)}</span>
                          <span>{fmtNum(el.creditsUsed)} used</span>
                        </div>
                        <ProgressBar pct={el.pctUsed} />
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Tier: {el.tier}</div>
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </SectionCard>

          {/* Section 4: Hal Production Pipeline */}
          <SectionCard
            title="Stories in Production"
            icon="🎬"
            stale={report.halStatus.stale}
          >
            {report.halStatus.stale ? (
              <StaleNotice reason={(report.halStatus as HalStatusStale).reason} />
            ) : (
              <>
                {(() => {
                  const hs = report.halStatus as HalStatusData
                  if (hs.series.length === 0) {
                    return <div style={{ color: '#16a34a', fontSize: 14 }}>✅ No active episodes in pipeline</div>
                  }
                  return (
                    <>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#1e293b' }}>
                          <strong>{hs.totalActive}</strong> active episodes
                        </div>
                        {hs.totalNeedsAttention > 0 && (
                          <div style={{ background: '#fffbeb', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#92400e' }}>
                            ⚠️ <strong>{hs.totalNeedsAttention}</strong> need attention
                          </div>
                        )}
                      </div>
                      {hs.series.map((series) => (
                        <div key={series.seriesTitle} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{series.seriesTitle}</div>
                          <DataTable
                            headers={['Ep', 'Title', 'Stage', 'Status']}
                            rows={series.episodes.map(ep => [
                              ep.episodeNumber,
                              ep.title,
                              ep.workflowState,
                              ep.needsAttention
                                ? <span key="s" style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>⚠️ Needs Attention</span>
                                : <span key="s" style={{ color: '#16a34a', fontSize: 12 }}>✅ On Track</span>,
                            ])}
                          />
                        </div>
                      ))}
                    </>
                  )
                })()}
              </>
            )}
          </SectionCard>

          {/* Section 5: Last 24h Expenses */}
          <SectionCard title="Last 24h Expenses" icon="💸">
            {report.expenses24h.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 14, fontStyle: 'italic' }}>
                No transactions in the last 24 hours {report.banking.stale ? '(Mercury data stale)' : ''}
              </div>
            ) : (
              <DataTable
                headers={['Merchant', 'Card', 'Amount', 'Purpose']}
                rows={report.expenses24h.map(tx => [
                  tx.merchant,
                  tx.card,
                  fmtUsd(tx.amount),
                  tx.purpose || '—',
                ])}
              />
            )}
          </SectionCard>

          {/* Section 6: Revenue */}
          <SectionCard
            title="Revenue"
            icon="💳"
            stale={report.revenue.stale}
          >
            {report.revenue.stale ? (
              <StaleNotice reason={(report.revenue as StripeStale).reason} />
            ) : (
              <>
                {(() => {
                  const rev = report.revenue as StripeData
                  return (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {[
                        { label: 'MRR', value: fmtUsd(rev.mrr), sub: 'monthly recurring' },
                        { label: 'Paying Subs', value: fmtNum(rev.payingSubCount), sub: 'active subscriptions' },
                        { label: 'Active Trials', value: fmtNum(rev.activeTrials), sub: 'trialing' },
                        { label: 'New Rev (24h)', value: fmtUsd(rev.newRev24h), sub: 'net after Stripe fees' },
                      ].map(({ label, value, sub }) => (
                        <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 20px', flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{value}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            )}
          </SectionCard>

          {/* Section 7: MTD Ledger */}
          <SectionCard title="Month-to-Date Ledger" icon="📒">
            {(() => {
              const l = report.ledger
              return (
                <>
                  <LedgerRow label="Anthropic (Claude)" value={fmtUsd(l.anthropicMtd)} formula="from manual finance entry" />
                  <LedgerRow label="OpenAI (DALL-E/TTS)" value={fmtUsd(l.openAiMtd)} formula="from manual finance entry" />
                  <LedgerRow label="ElevenLabs" value={fmtUsd(l.elMtd)} formula="plan + overage" />
                  <LedgerRow label="Total AI Spend" value={fmtUsd(l.totalAI)} formula={`= ${fmtUsd(l.anthropicMtd)} + ${fmtUsd(l.openAiMtd)} + ${fmtUsd(l.elMtd)}`} bold />
                  <div style={{ height: 8 }} />
                  <LedgerRow label="Infrastructure (Vercel, etc.)" value={fmtUsd(l.infraMtd)} />
                  <LedgerRow label="Total Spend" value={fmtUsd(l.totalSpend)} formula={`= AI ${fmtUsd(l.totalAI)} + Infra ${fmtUsd(l.infraMtd)}`} bold />
                  <div style={{ height: 8 }} />
                  <LedgerRow label="Revenue MTD" value={fmtUsd(l.revenueMtd)} formula="from Stripe" />
                  <LedgerRow
                    label="Net Burn"
                    value={fmtUsd(l.netBurn)}
                    formula={`= ${fmtUsd(l.totalSpend)} - ${fmtUsd(l.revenueMtd)}`}
                    bold
                  />
                  <div style={{ height: 8 }} />
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginTop: 8, fontSize: 12, color: '#475569' }}>
                    <strong>Day {l.daysElapsed} of {l.daysInMonth}</strong> — burn rate {fmtUsd(l.dailyBurn)}/day
                  </div>
                  {l.workings.length > 0 && (
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>Show calculation workings</summary>
                      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11, color: '#64748b', lineHeight: 1.8 }}>
                        {l.workings.map((w, i) => <div key={i}>{w}</div>)}
                      </div>
                    </details>
                  )}
                </>
              )
            })()}
          </SectionCard>

          {/* Section 8: CFO Assessment */}
          <SectionCard title="CFO Assessment" icon="🎯">
            {(() => {
              const a = report.assessment
              const l = report.ledger
              return (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ background: l.runway !== null && l.runway < 30 ? '#fef2f2' : l.runway !== null && l.runway < 90 ? '#fffbeb' : '#f0fdf4', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>RUNWAY</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: l.runway !== null && l.runway < 30 ? '#dc2626' : l.runway !== null && l.runway < 90 ? '#f59e0b' : '#16a34a' }}>
                        {l.runway !== null ? `${l.runway.toFixed(0)} days` : 'N/A'}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{a.runway}</div>
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>BREAK-EVEN</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
                        {l.breakEvenSubs !== null ? `${fmtNum(l.breakEvenSubs)} subs` : 'N/A'}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{a.breakEven}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Key Risks</div>
                    {a.keyRisks.map((risk, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, color: '#475569' }}>
                        <span style={{ color: '#f59e0b', flexShrink: 0 }}>•</span>
                        <span>{risk}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </SectionCard>

          {/* Footer */}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '8px 0 32px' }}>
            CFO Morning Report · {report.reportDate} · Generated {fmtDate(report.generatedAt)}
            <br />
            Delivered daily at 7:00 AM ET via Telegram
          </div>
        </>
      )}
    </div>
  )
}
