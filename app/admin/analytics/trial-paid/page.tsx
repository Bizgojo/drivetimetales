'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ArmInt = 1 | 2 | 3

interface TrialArmData {
  signups: number
  pastDay7: number
  converted: number
  medianDaysToConvert: number | null
}

interface SpendArmData {
  spendUsd: number
  notes: string | null
}

interface TrialPaidData {
  generatedAt: string
  arms: Record<ArmInt, TrialArmData>
  spend: Record<string, SpendArmData> | null
  spendTableExists: boolean
}

// ─── Config ───────────────────────────────────────────────────────────────────

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

function usdFmt(val: number): string {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function costFmt(spend: number, denom: number): string {
  if (denom === 0 || spend === 0) return '—'
  return usdFmt(spend / denom)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: { padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' } as React.CSSProperties,
  heading: { fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 0.15rem' } as React.CSSProperties,
  subtitle: { fontSize: 13, color: '#64748b', margin: '0 0 0.5rem' } as React.CSSProperties,
  meta: { fontSize: 11, color: '#94a3b8', margin: '0 0 1.5rem' } as React.CSSProperties,
  spendCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  } as React.CSSProperties,
  spendTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 0.25rem' } as React.CSSProperties,
  spendSub: { fontSize: 12, color: '#64748b', margin: '0 0 1rem' } as React.CSSProperties,
  spendRow: { display: 'flex', gap: '1rem', flexWrap: 'wrap' as const, alignItems: 'flex-end', marginBottom: '1rem' },
  spendField: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  spendLabel: { fontSize: 12, fontWeight: 600, color: '#374151' } as React.CSSProperties,
  spendInput: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    width: 140,
    outline: 'none',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  saveBtn: {
    padding: '8px 20px',
    background: '#f97316',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  saveBtnDisabled: {
    padding: '8px 20px',
    background: '#94a3b8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'not-allowed',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  saveStatus: { fontSize: 12, marginTop: 6 } as React.CSSProperties,
  migrationNote: { fontSize: 12, color: '#92400e', background: '#fef3c7', padding: '0.5rem 0.75rem', borderRadius: 6, marginTop: '0.5rem', display: 'inline-block' } as React.CSSProperties,
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
  emptyState: { padding: '2rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, color: '#166534', fontSize: 13, lineHeight: 1.6, margin: '1.5rem 0' } as React.CSSProperties,
  loading: { padding: '4rem 2rem', textAlign: 'center' as const, color: '#94a3b8', fontSize: 14 },
  error: { padding: '1.5rem 2rem', background: '#fef2f2', borderRadius: 10, color: '#991b1b', fontSize: 13, margin: '2rem 0' } as React.CSSProperties,
  note: { fontSize: 11, color: '#94a3b8', marginTop: '0.5rem' } as React.CSSProperties,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrialToPaidPage() {
  const [data, setData] = useState<TrialPaidData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Spend input state (keyed by arm key e.g. 'bell-arm1')
  const [spendInputs, setSpendInputs] = useState<Record<string, string>>({
    'bell-arm1': '',
    'bell-arm2': '',
    'bell-arm3': '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/analytics/trial-paid')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setData(d)
          // Pre-fill spend inputs from existing data
          if (d.spend) {
            const filled: Record<string, string> = {}
            for (const key of Object.keys(d.spend)) {
              filled[key] = d.spend[key].spendUsd > 0 ? String(d.spend[key].spendUsd) : ''
            }
            setSpendInputs(prev => ({ ...prev, ...filled }))
          }
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleSaveSpend() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const arms: Record<string, number> = {}
      for (const [key, val] of Object.entries(spendInputs)) {
        const n = parseFloat(val)
        arms[key] = isFinite(n) && n >= 0 ? n : 0
      }
      const res = await fetch('/api/admin/analytics/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arms }),
      })
      const json = await res.json()
      if (json.tableExists === false) {
        setSaveMsg({ ok: false, text: 'Migration pending — run the campaign_arm_spend migration first.' })
      } else if (json.saved) {
        setSaveMsg({ ok: true, text: `Saved ${(json.updatedArms || []).join(', ')}` })
        // Refresh data
        const refreshed = await fetch('/api/admin/analytics/trial-paid').then(r => r.json())
        if (!refreshed.error) setData(refreshed)
      } else {
        setSaveMsg({ ok: false, text: json.error || 'Save failed' })
      }
    } catch (e: unknown) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={S.loading}>Loading trial-to-paid data…</div>

  // Check all-zero conversions
  const allZeroConversions = data
    ? ARMS.every(arm => data.arms[arm]?.converted === 0)
    : false

  const hasSpend = data?.spend
    ? ARMS.some(arm => (data.spend?.[ARM_KEYS[arm]]?.spendUsd ?? 0) > 0)
    : false

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Trial to Paid by Arm</h1>
      <p style={S.subtitle}>The only metric that decides whether the campaign works.</p>
      {data && (
        <p style={S.meta}>
          Generated {new Date(data.generatedAt).toLocaleString()} ·
          Filter: signup_source = &lsquo;bell-invitation&rsquo;, listen_arm IN (1,2,3), is_test_account IS DISTINCT FROM true
        </p>
      )}

      {error && <div style={S.error}>Error loading trial-to-paid data: {error}</div>}

      {/* ── Spend section ──────────────────────────────────────────────── */}
      <div style={S.spendCard}>
        <div style={S.spendTitle}>Campaign Spend</div>
        <p style={S.spendSub}>
          Enter Meta ad spend per arm manually. Cost-per-result columns appear automatically when spend &gt; 0.
        </p>
        <div style={S.spendRow}>
          {ARMS.map(arm => {
            const key = ARM_KEYS[arm]
            return (
              <div key={arm} style={S.spendField}>
                <label style={S.spendLabel}>{ARM_LABELS[arm]} spend ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={spendInputs[key] ?? ''}
                  onChange={e => setSpendInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  style={S.spendInput}
                />
              </div>
            )
          })}
          <button
            onClick={handleSaveSpend}
            disabled={saving}
            style={saving ? S.saveBtnDisabled : S.saveBtn}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {saveMsg && (
          <div style={{ ...S.saveStatus, color: saveMsg.ok ? '#166534' : '#991b1b' }}>
            {saveMsg.ok ? '✓ ' : '✗ '}{saveMsg.text}
          </div>
        )}

        {data && !data.spendTableExists && (
          <div style={S.migrationNote}>
            ⚠️ Run migration to enable spend tracking:{' '}
            <code>supabase/migrations/20260813_create_campaign_arm_spend.sql</code>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* ── Empty state ──────────────────────────────────────────────── */}
          {allZeroConversions && (
            <div style={S.emptyState}>
              <strong>No conversions yet.</strong> Check back after day 7 from first signup
              (2026-08-18 at the earliest for the first cohort).
              This report is correct; no data is missing.
            </div>
          )}

          {/* ── Main metrics table ─────────────────────────────────────── */}
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
                {/* Signups */}
                {[
                  {
                    key: 'signups',
                    label: 'Signups',
                    sub: 'bell-invitation, non-test',
                    render: (a: TrialArmData) => ({ label: String(a.signups), warn: false }),
                  },
                  {
                    key: 'pastDay7',
                    label: 'Past day 7',
                    sub: 'trial_started_at ≤ 7 days ago',
                    render: (a: TrialArmData) => ({ label: String(a.pastDay7), warn: false }),
                  },
                  {
                    key: 'converted',
                    label: 'Converted',
                    sub: 'first_paid_date IS NOT NULL',
                    render: (a: TrialArmData) => ({ label: String(a.converted), warn: false }),
                  },
                  {
                    key: 'convRate',
                    label: 'Conversion rate',
                    sub: 'converted / past day 7',
                    render: (a: TrialArmData) => rateFmt(a.converted, a.pastDay7),
                  },
                  {
                    key: 'medianDays',
                    label: 'Median days to convert',
                    sub: 'for converted users only',
                    render: (a: TrialArmData) => ({
                      label: a.medianDaysToConvert !== null ? `${a.medianDaysToConvert}d` : '—',
                      warn: false,
                    }),
                  },
                ].map((row, idx) => (
                  <tr key={row.key} style={idx % 2 === 0 ? S.trPlain : S.trAlt}>
                    <td style={S.tdLabel}>
                      {row.label}
                      <span style={S.tdSub}>{row.sub}</span>
                    </td>
                    {ARMS.map(arm => {
                      const a = data.arms[arm]
                      if (!a) return <td key={arm} style={S.tdDash}>—</td>
                      const { label, warn } = row.render(a)
                      if (label === '—') return <td key={arm} style={S.tdDash}>—</td>
                      return (
                        <td key={arm} style={S.tdVal}>
                          {label}
                          {warn && <span style={S.badge}>⚠️</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Spend rows — only if table exists and spend > 0 or table missing */}
                {!data.spendTableExists ? (
                  <tr style={S.trAlt}>
                    <td style={S.tdLabel} colSpan={4}>
                      <span style={{ fontSize: 12, color: '#92400e' }}>
                        Cost columns: run migration to enable spend tracking
                      </span>
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr style={S.trPlain}>
                      <td style={S.tdLabel}>
                        Spend ($)
                        <span style={S.tdSub}>from Campaign Spend section above</span>
                      </td>
                      {ARMS.map(arm => {
                        const spend = data.spend?.[ARM_KEYS[arm]]?.spendUsd ?? 0
                        return (
                          <td key={arm} style={spend > 0 ? S.tdVal : S.tdDash}>
                            {spend > 0 ? usdFmt(spend) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                    <tr style={S.trAlt}>
                      <td style={S.tdLabel}>
                        Cost per signup
                        <span style={S.tdSub}>spend / signups</span>
                      </td>
                      {ARMS.map(arm => {
                        const spend = data.spend?.[ARM_KEYS[arm]]?.spendUsd ?? 0
                        const signups = data.arms[arm]?.signups ?? 0
                        const val = costFmt(spend, signups)
                        return <td key={arm} style={val === '—' ? S.tdDash : S.tdVal}>{val}</td>
                      })}
                    </tr>
                    <tr style={S.trPlain}>
                      <td style={S.tdLabel}>
                        Cost per conversion
                        <span style={S.tdSub}>spend / converted; — while 0 conversions</span>
                      </td>
                      {ARMS.map(arm => {
                        const spend = data.spend?.[ARM_KEYS[arm]]?.spendUsd ?? 0
                        const converted = data.arms[arm]?.converted ?? 0
                        const val = costFmt(spend, converted)
                        return <td key={arm} style={val === '—' ? S.tdDash : S.tdVal}>{val}</td>
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <p style={S.note}>
            ⚠️ badge = fewer than {LOW_N_THRESHOLD} users in denominator — interpret with caution. &nbsp;|&nbsp;
            Conversion rate uses &ldquo;past day 7&rdquo; as denominator (users whose trial has had time to convert).
          </p>

          {!hasSpend && data.spendTableExists && (
            <p style={{ ...S.note, marginTop: '0.25rem' }}>
              Enter spend above to see cost-per-signup and cost-per-conversion columns.
            </p>
          )}
        </>
      )}
    </div>
  )
}
