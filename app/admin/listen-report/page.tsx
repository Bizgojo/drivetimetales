'use client'

// ATL-GO-LISTEN-001 — /admin/listen-report
// First-party listen analytics for the /go sample player: per variant and
// per utm_source — sample starts, median listen depth, 25/50/75/complete
// milestone funnel, CTA click rate, and the decision signal Marc asked for:
// "listened ≥75% but never clicked the CTA" (player worked, CTA didn't) vs
// clicked CTA.
// UI rules (mandatory): light background, dark text, LARGE type — same as
// /admin/launch-report. If the go_listen_events migration hasn't been
// applied yet, the page shows an awaiting-data state and never crashes.

import { useEffect, useState } from 'react'

type GroupStats = {
  key: string
  starts: number
  totalSessions: number
  medianListenSeconds: number | null
  pct25Rate: number | null
  pct50Rate: number | null
  pct75Rate: number | null
  completionRate: number | null
  ctaClickRate: number | null
  listenedFullyNoCta: number
  clickedCta: number
}

type ReportPayload = {
  generatedAt: string
  tableAvailable: boolean
  truncated: boolean
  totalEvents: number
  totalSessions: number
  byVariant: GroupStats[]
  bySource: GroupStats[]
}

const ET = 'America/New_York'

const VARIANT_LABELS: Record<string, string> = {
  a: 'Variant A — Commuter of the Year',
  b: 'Variant B — Murder at Falls Park',
  bare: 'Bare /go — default story',
}

function fmtPct(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function fmtSeconds(value: number | null) {
  if (value === null) return '—'
  const s = Math.round(value)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

function fmtAsOf(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { timeZone: ET, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
}

const th: React.CSSProperties = {
  padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 900,
  color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
}
const tdNum: React.CSSProperties = {
  padding: '14px 16px', textAlign: 'right', fontSize: 20, fontWeight: 800,
  color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}

function StatsTable({ title, subtitle, rows, keyLabel, labelFor }: {
  title: string
  subtitle: string
  rows: GroupStats[]
  keyLabel: string
  labelFor?: (key: string) => string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden', marginTop: 20 }}>
      <div style={{ padding: '18px 20px 4px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: '#111827' }}>{title}</h2>
        <p style={{ margin: '4px 0 10px', fontSize: 15, color: '#6b7280', fontWeight: 600 }}>{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '18px 20px 26px', color: '#6b7280', fontSize: 17, fontWeight: 700 }}>
          No sessions recorded yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ ...th, textAlign: 'left' }}>{keyLabel}</th>
                <th style={th}>Sample starts</th>
                <th style={th}>Median listen</th>
                <th style={th}>≥25%</th>
                <th style={th}>≥50%</th>
                <th style={th}>≥75%</th>
                <th style={th}>Completed</th>
                <th style={th}>CTA click rate</th>
                <th style={{ ...th, color: '#b45309' }}>≥75%, no CTA</th>
                <th style={{ ...th, color: '#15803d' }}>Clicked CTA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 16px', fontSize: 18, fontWeight: 850, color: '#111827' }}>
                    {labelFor ? labelFor(row.key) : row.key}
                    <div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>{row.totalSessions} session{row.totalSessions === 1 ? '' : 's'}</div>
                  </td>
                  <td style={tdNum}>{row.starts.toLocaleString('en-US')}</td>
                  <td style={tdNum}>{fmtSeconds(row.medianListenSeconds)}</td>
                  <td style={tdNum}>{fmtPct(row.pct25Rate)}</td>
                  <td style={tdNum}>{fmtPct(row.pct50Rate)}</td>
                  <td style={tdNum}>{fmtPct(row.pct75Rate)}</td>
                  <td style={tdNum}>{fmtPct(row.completionRate)}</td>
                  <td style={tdNum}>{fmtPct(row.ctaClickRate)}</td>
                  <td style={{ ...tdNum, color: '#b45309' }}>{row.listenedFullyNoCta.toLocaleString('en-US')}</td>
                  <td style={{ ...tdNum, color: '#15803d' }}>{row.clickedCta.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ListenReportPage() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/listen-report', { credentials: 'same-origin' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Listen report failed')
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Listen report failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const generatedLabel = data ? fmtAsOf(data.generatedAt) : null

  return (
    <div style={{ padding: 32, background: '#FAF9F6', minHeight: '100vh', color: '#111827' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 950, margin: '0 0 6px', color: '#111827' }}>🎧 Listen Report</h1>
          <p style={{ margin: 0, fontSize: 17, color: '#374151', fontWeight: 600 }}>
            /go sample player — what ad visitors actually did with the audio, per session
          </p>
          {generatedLabel && (
            <p style={{ margin: '4px 0 0', fontSize: 15, color: '#6b7280' }}>
              Report generated {generatedLabel}
              {data ? ` · ${data.totalSessions.toLocaleString('en-US')} sessions · ${data.totalEvents.toLocaleString('en-US')} events` : ''}
            </p>
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

      {data && !data.tableAvailable && (
        <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '14px 18px', fontSize: 16, fontWeight: 700, margin: '16px 0' }}>
          ⚠️ go_listen_events table not found — awaiting the ATL-GO-LISTEN-001 migration (Marc applies it manually).
          Once applied, /go starts recording listen events immediately; no deploy dependency in this page.
        </div>
      )}

      {data && data.truncated && (
        <div style={{ background: '#eff6ff', border: '2px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '12px 16px', fontSize: 15, fontWeight: 700, margin: '12px 0' }}>
          Report capped at 100k events — figures cover the earliest 100k.
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '2px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '14px 18px', fontSize: 16, fontWeight: 700, margin: '16px 0' }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 60, textAlign: 'center', color: '#6b7280', fontSize: 20, fontWeight: 700, marginTop: 16 }}>
          Loading listen report…
        </div>
      ) : data && (
        <>
          <StatsTable
            title="By variant"
            subtitle="Which story was actually served (?v=a, ?v=b, or the bare-/go default)"
            rows={data.byVariant}
            keyLabel="Variant"
            labelFor={key => VARIANT_LABELS[key] ?? key}
          />
          <StatsTable
            title="By UTM source"
            subtitle="Split by utm_source on the ad click (GVL-TEST-001 Meta ads); (none) = no utm_source param"
            rows={data.bySource}
            keyLabel="utm_source"
          />
        </>
      )}

      <p style={{ marginTop: 18, fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
        A session is one /go page visit (random client UUID, no PII, not persisted across days). Sample starts =
        sessions that pressed play. Median listen = median of the furthest audio position reached per started session
        (sampled at milestone events, so it reads &ldquo;at least this far&rdquo;). Milestone columns = started sessions that
        crossed 25/50/75% or finished the sample. CTA click rate = sessions that clicked a Start-free-trial CTA ÷
        starts. <strong style={{ color: '#b45309' }}>≥75%, no CTA</strong> = listened nearly all the way but never clicked
        (CTA/layout problem if this dominates); <strong style={{ color: '#15803d' }}>Clicked CTA</strong> = sessions that
        clicked. Resumed sessions (same browser returning) may register milestones at their resume point. Events are
        fire-and-forget beacons — undercounting is possible (ad blockers), never overcounting (once-per-session latch +
        DB unique index).
      </p>
    </div>
  )
}
