'use client'

// ATL-LAUNCH-REPORT-001 — /admin/launch-report
// Marc's launch-day spreadsheet, live. Row order copied exactly from his sheet.
// UI rules (mandatory): light background, dark text, LARGE type.
// Fetched rows (launch_metrics-sourced) always display "as of [time]".
// If the launch_metrics migration hasn't been applied yet, fetched rows show
// "awaiting data" and the page renders normally (no crash).

import { useEffect, useState } from 'react'

type WindowValues = { h4: number | null; h24: number | null; total: number | null }

type ReportRow = {
  key: string
  label: string
  kind: 'live' | 'fetched' | 'computed'
  format: 'int' | 'usd'
  windows: WindowValues
  asOf: string | null
  note?: string
}

type ReportPayload = {
  anchor: string
  generatedAt: string
  metricsTableAvailable: boolean
  rows: ReportRow[]
}

const ET = 'America/New_York'

function fmtValue(value: number | null, format: 'int' | 'usd', awaiting: boolean) {
  if (value === null) return awaiting ? 'awaiting data' : '—'
  if (format === 'usd') {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return Math.round(value).toLocaleString('en-US')
}

function fmtAsOf(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { timeZone: ET, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
}

export default function LaunchReportPage() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/launch-report', { credentials: 'same-origin' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Launch report failed')
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch report failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const anchorLabel = data
    ? new Date(data.anchor).toLocaleString('en-US', { timeZone: ET, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
    : 'July 17, 2026, 9:55 AM ET'
  const generatedLabel = data ? fmtAsOf(data.generatedAt) : null

  return (
    <div style={{ padding: 32, background: '#FAF9F6', minHeight: '100vh', color: '#111827' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 950, margin: '0 0 6px', color: '#111827' }}>🚀 Launch Report</h1>
          <p style={{ margin: 0, fontSize: 17, color: '#374151', fontWeight: 600 }}>
            Launch anchor: {anchorLabel} · &ldquo;Total to date&rdquo; counts from this moment
          </p>
          {generatedLabel && (
            <p style={{ margin: '4px 0 0', fontSize: 15, color: '#6b7280' }}>Report generated {generatedLabel}</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ border: '2px solid #cbd5e1', background: '#fff', color: '#111827', borderRadius: 10, padding: '12px 20px', fontSize: 17, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {data && !data.metricsTableAvailable && (
        <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '14px 18px', fontSize: 16, fontWeight: 700, margin: '16px 0' }}>
          ⚠️ launch_metrics table not found — Impressions, Clicks, expenses and Mercury balance are awaiting the
          launch_metrics migration + Marc&rsquo;s upsert script. Live rows (sign ups, trials, subs) are real.
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '2px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '14px 18px', fontSize: 16, fontWeight: 700, margin: '16px 0' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden', marginTop: 16 }}>
        {loading && !data ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6b7280', fontSize: 20, fontWeight: 700 }}>Loading launch report…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 15, fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Metric</th>
                  {['In last 4 hours', 'In last 24 hours', 'Total to date'].map(h => (
                    <th key={h} style={{ padding: '16px 20px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map(row => {
                  const awaiting = row.kind === 'fetched' && !data?.metricsTableAvailable
                  const asOfLabel = row.kind !== 'live' ? fmtAsOf(row.asOf) : null
                  return (
                    <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 19, fontWeight: 850, color: '#111827' }}>{row.label}</div>
                        {row.kind === 'fetched' && (
                          <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>
                            {asOfLabel ? `as of ${asOfLabel}` : awaiting ? 'awaiting data — as of —' : 'as of — (no data yet)'}
                          </div>
                        )}
                        {row.kind === 'computed' && asOfLabel && (
                          <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>as of {asOfLabel}</div>
                        )}
                        {row.note && (
                          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{row.note}</div>
                        )}
                      </td>
                      {(['h4', 'h24', 'total'] as const).map(wk => {
                        const value = row.windows[wk]
                        const isAwaitingCell = awaiting && !(row.key === 'tiktok_expenses')
                        return (
                          <td key={wk} style={{ padding: '16px 20px', textAlign: 'right', verticalAlign: 'top' }}>
                            <span style={{
                              fontSize: value === null ? 16 : 22,
                              fontWeight: value === null ? 600 : 900,
                              color: value === null ? '#9ca3af' : '#111827',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}>
                              {fmtValue(value, row.format, isAwaitingCell)}
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
        )}
      </div>

      <p style={{ marginTop: 18, fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
        Live rows (Sign ups, Cancelations, Total trials, Total subs, Sub Rev. Added) are computed from the users table
        in real time. Fetched rows come from the launch_metrics table, upserted by Marc&rsquo;s local script — each shows
        its own &ldquo;as of&rdquo; freshness. Cost per Trial = (Meta + TikTok spend to date) ÷ trials to date;
        True CAC (paid) = (Meta + TikTok spend to date) ÷ paid conversions to date (same count as Total subs) —
        both total column only. TikTok expenses default to $0 until TikTok launch. Sub Rev. Added = monthly conversions × $7.99 +
        annual conversions × $59.99 (unknown billing cycle counted as monthly) &mdash; an approximation; Stripe is
        the source of truth for actual revenue. Total Expenses shows &ldquo;—&rdquo; until real expense rows exist in
        launch_metrics (the TikTok $0 default alone never counts as a total).
      </p>
    </div>
  )
}
