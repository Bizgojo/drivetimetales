'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ArmInt = 1 | 2 | 3

interface SignupsArmData {
  signups: number
  played: number
  completedEP2: number
  avgStoriesStarted: number | null
  avgStoriesCompleted: number | null
}

interface SignupsData {
  generatedAt: string
  since: string
  ep2StoryId: string
  arms: Record<ArmInt, SignupsArmData>
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_SINCE = '2026-08-21T00:00:00.000Z'
const ARMS: ArmInt[] = [1, 2, 3]
const ARM_LABELS: Record<ArmInt, string> = { 1: 'Arm 1', 2: 'Arm 2', 3: 'Arm 3' }
const ARM_KEYS: Record<ArmInt, string> = { 1: 'bell-arm1', 2: 'bell-arm2', 3: 'bell-arm3' }
const LOW_N_THRESHOLD = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateFmt(num: number, denom: number): { label: string; warn: boolean } {
  if (denom === 0) return { label: '—', warn: false }
  const r = Math.round((num / denom) * 100)
  return { label: `${r}% (${num}/${denom})`, warn: denom < LOW_N_THRESHOLD }
}

function avgFmt(val: number | null): string {
  if (val === null) return '—'
  return val.toFixed(1)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: { padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' } as React.CSSProperties,
  heading: { fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 0.15rem' } as React.CSSProperties,
  subtitle: { fontSize: 13, color: '#64748b', margin: '0 0 0.5rem' } as React.CSSProperties,
  meta: { fontSize: 11, color: '#94a3b8', margin: '0 0 1.5rem' } as React.CSSProperties,
  tableWrap: { overflowX: 'auto' as const, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.75rem' },
  table: { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' } as React.CSSProperties,
  thRow: { background: '#1e293b' } as React.CSSProperties,
  th: { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13, fontWeight: 700, color: '#f1f5f9' },
  thArm: { padding: '12px 16px', textAlign: 'center' as const, fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 160 },
  trAlt: { background: '#f8fafc' } as React.CSSProperties,
  trPlain: { background: '#fff' } as React.CSSProperties,
  tdLabel: { padding: '11px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b', fontWeight: 600 } as React.CSSProperties,
  tdSub: { display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 400 } as React.CSSProperties,
  tdVal: { padding: '11px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#1e293b', textAlign: 'center' as const },
  tdDash: { padding: '11px 16px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#94a3b8', textAlign: 'center' as const },
  badge: { display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 4, fontWeight: 700 } as React.CSSProperties,
  loading: { padding: '4rem 2rem', textAlign: 'center' as const, color: '#94a3b8', fontSize: 14 },
  error: { padding: '1.5rem 2rem', background: '#fef2f2', borderRadius: 10, color: '#991b1b', fontSize: 13, margin: '2rem 0' } as React.CSSProperties,
  note: { fontSize: 11, color: '#94a3b8', marginTop: '0.5rem' } as React.CSSProperties,
}

// ─── Row definitions ──────────────────────────────────────────────────────────

interface RowDef {
  key: string
  label: string
  sublabel?: string
  render: (arm: SignupsArmData) => { label: string; warn: boolean } | string
}

function makeRows(arms: Record<ArmInt, SignupsArmData>): RowDef[] {
  return [
    {
      key: 'signups',
      label: 'Signups',
      sublabel: 'bell-invitation users, non-test',
      render: (a) => ({ label: String(a.signups), warn: false }),
    },
    {
      key: 'played',
      label: 'Played anything',
      sublabel: '≥1 library row with progress > 0',
      render: (a) => rateFmt(a.played, a.signups),
    },
    {
      key: 'ep2',
      label: 'Completed EP2',
      sublabel: 'Bell Beneath Falls Park — Ep 2: The Seventh Token',
      render: (a) => rateFmt(a.completedEP2, a.signups),
    },
    {
      key: 'avgStarted',
      label: 'Avg stories started',
      sublabel: 'distinct story_ids with progress > 0 per user',
      render: (a) => ({ label: avgFmt(a.avgStoriesStarted), warn: a.signups > 0 && a.signups < LOW_N_THRESHOLD }),
    },
    {
      key: 'avgCompleted',
      label: 'Avg stories completed',
      sublabel: 'distinct story_ids with completed = true per user',
      render: (a) => ({ label: avgFmt(a.avgStoriesCompleted), warn: a.signups > 0 && a.signups < LOW_N_THRESHOLD }),
    },
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignupsByArmPage() {
  const [data, setData] = useState<SignupsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [since] = useState(DEFAULT_SINCE)

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/analytics/signups?since=' + encodeURIComponent(since))
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [since])

  if (loading) return <div style={S.loading}>Loading signup data…</div>

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Signups & Behaviour by Arm</h1>
      <p style={S.subtitle}>
        Whether each arm attracts people who listen, or only people who submit an email.
      </p>
      <p style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, margin: '0 0 0.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 12px', display: 'inline-block' } as React.CSSProperties}>
        Signups since: {since.slice(0, 10)}
      </p>
      {data && (
        <p style={S.meta}>
          Generated {new Date(data.generatedAt).toLocaleString()} ·
          Filter: signup_source = &lsquo;bell-invitation&rsquo;, listen_arm IN (1,2,3), is_test_account IS DISTINCT FROM true, created_at ≥ {(data.since || since).slice(0, 10)}
        </p>
      )}

      {error && <div style={S.error}>Error loading signups: {error}</div>}

      {data && (
        <>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr style={S.thRow}>
                  <th style={S.th}>Metric</th>
                  {ARMS.map(arm => (
                    <th key={arm} style={S.thArm}>
                      {ARM_LABELS[arm]}
                      <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                        {ARM_KEYS[arm]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {makeRows(data.arms).map((row, idx) => (
                  <tr key={row.key} style={idx % 2 === 0 ? S.trPlain : S.trAlt}>
                    <td style={S.tdLabel}>
                      {row.label}
                      {row.sublabel && <span style={S.tdSub}>{row.sublabel}</span>}
                    </td>
                    {ARMS.map(arm => {
                      const armData = data.arms[arm]
                      if (!armData || armData.signups === 0) {
                        // Still render the column even if no data
                        const result = typeof row.render(armData ?? { signups: 0, played: 0, completedEP2: 0, avgStoriesStarted: null, avgStoriesCompleted: null }) === 'string'
                          ? { label: '—', warn: false }
                          : row.render(armData ?? { signups: 0, played: 0, completedEP2: 0, avgStoriesStarted: null, avgStoriesCompleted: null }) as { label: string; warn: boolean }
                        if (row.key === 'signups' && armData?.signups === 0) {
                          return <td key={arm} style={S.tdDash}>—</td>
                        }
                        return <td key={arm} style={S.tdDash}>{result.label}</td>
                      }
                      const result = row.render(armData)
                      const { label, warn } = typeof result === 'string'
                        ? { label: result, warn: false }
                        : result
                      return (
                        <td key={arm} style={S.tdVal}>
                          {label}
                          {warn && <span style={S.badge}>⚠️</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={S.note}>
            ⚠️ badge = fewer than {LOW_N_THRESHOLD} users in this arm — interpret with caution. &nbsp;|&nbsp;
            EP2 story ID: {data.ep2StoryId}
          </p>
        </>
      )}
    </div>
  )
}
