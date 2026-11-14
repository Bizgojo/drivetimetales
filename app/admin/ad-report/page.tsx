'use client'

// AD-REPORT-001 — /admin/ad-report
// Per ad: signups, then how far those listeners went (60 s, Episode 1 finished,
// Episode 3 reached, series finished), trials and paid. Meta fills the ad tags
// when the ad link carries:
//   utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
// UI rules: light background, dark text, LARGE type (same as /admin/listen-report).

import { useEffect, useState } from 'react'

type Row = {
  key: string
  source: string
  campaign: string
  adSet: string
  ad: string
  signups: number
  listened60: number
  finishedEp1: number
  reachedEp3: number
  finishedSeries: number
  trials: number
  paid: number
  topSeries: string | null
}

type Payload = { generatedAt: string; days: number; signups: number; truncated: boolean; rows: Row[] }

const th: React.CSSProperties = { padding: '14px 16px', textAlign: 'right', fontSize: 16, fontWeight: 900, borderBottom: '2px solid #111', whiteSpace: 'nowrap' }
const thLeft: React.CSSProperties = { ...th, textAlign: 'left' }
const td: React.CSSProperties = { padding: '14px 16px', textAlign: 'right', fontSize: 22, fontWeight: 800, borderBottom: '1px solid #ccc' }
const tdLeft: React.CSSProperties = { ...td, textAlign: 'left', fontSize: 18, fontWeight: 700 }

function cell(n: number, of: number) {
  if (!of) return '—'
  return `${n} (${Math.round((n / of) * 100)}%)`
}

const DAY_CHOICES = [7, 30, 90, 365]

export default function AdReportPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    fetch(`/api/admin/ad-report?days=${days}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        if (alive) setData(j)
      })
      .catch((e) => alive && setError(String(e?.message || e)))
    return () => { alive = false }
  }, [days])

  return (
    <main style={{ background: '#fff', color: '#111', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 8px' }}>Ad report</h1>
      <p style={{ fontSize: 20, margin: '0 0 16px' }}>
        Which ads bring listeners who stay. Each row is one ad. Percentages are of that ad&apos;s signups.
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {DAY_CHOICES.map((d) => (
          <button key={d} onClick={() => setDays(d)}
            style={{ fontSize: 20, fontWeight: 800, padding: '10px 18px', borderRadius: 10, border: '2px solid #111', background: d === days ? '#111' : '#fff', color: d === days ? '#fff' : '#111' }}>
            Last {d} days
          </button>
        ))}
      </div>
      {error && <p style={{ fontSize: 22, color: '#b91c1c', fontWeight: 800 }}>Could not load: {error}</p>}
      {!error && !data && <p style={{ fontSize: 22 }}>Loading…</p>}
      {data && (
        <>
          <p style={{ fontSize: 20, fontWeight: 700 }}>
            {data.signups.toLocaleString('en-US')} signups in the last {data.days} days (test accounts left out).
            {data.truncated ? ' Showing the first 20,000.' : ''}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={thLeft}>Ad (source | campaign | ad set | ad)</th>
                  <th style={th}>Signups</th>
                  <th style={th}>Listened 60 s</th>
                  <th style={th}>Finished EP1</th>
                  <th style={th}>Reached EP3</th>
                  <th style={th}>Finished series</th>
                  <th style={th}>Trial</th>
                  <th style={th}>Paid</th>
                  <th style={thLeft}>Most played</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key}>
                    <td style={tdLeft}>{r.key}</td>
                    <td style={td}>{r.signups}</td>
                    <td style={td}>{cell(r.listened60, r.signups)}</td>
                    <td style={td}>{cell(r.finishedEp1, r.signups)}</td>
                    <td style={td}>{cell(r.reachedEp3, r.signups)}</td>
                    <td style={td}>{cell(r.finishedSeries, r.signups)}</td>
                    <td style={td}>{cell(r.trials, r.signups)}</td>
                    <td style={td}>{cell(r.paid, r.signups)}</td>
                    <td style={tdLeft}>{r.topSeries || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 16, marginTop: 20 }}>
            Ad link tags for Meta (paste into the ad&apos;s URL parameters):<br />
            <code style={{ fontSize: 16 }}>utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign={'{{campaign.id}}'}&amp;utm_term={'{{adset.id}}'}&amp;utm_content={'{{ad.id}}'}</code>
          </p>
        </>
      )}
    </main>
  )
}
