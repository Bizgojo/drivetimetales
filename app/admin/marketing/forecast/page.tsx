'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  SCENARIO_LABELS,
  SCENARIO_RATES,
  TOTAL_WEEKS,
  ScenarioName,
  formatCac,
  formatUsd,
  simulateAll,
} from '@/lib/marketing/cacForecast'

const SCENARIOS: ScenarioName[] = ['best', 'likely', 'worst']
const SCENARIO_COLORS: Record<ScenarioName, string> = {
  best: '#1a7f37',
  likely: '#0969da',
  worst: '#cf222e',
}

const BG = '#FAF9F6'
const CARD = '#FFFFFF'
const TEXT = '#1a1a1a'
const MUTED = '#4a4a4a'
const BORDER = '#e0e0e0'
const BODY = '18px'
const BTN = '22px'

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

// --- CAC-over-time line chart (pure SVG, no deps) ---
function CacLineChart({
  series,
  selectedWeek,
}: {
  series: Record<ScenarioName, (number | null)[]>
  selectedWeek: number
}) {
  const W = 720
  const H = 300
  const PAD_L = 70
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 36
  const iw = W - PAD_L - PAD_R
  const ih = H - PAD_T - PAD_B

  const allVals = SCENARIOS.flatMap((s) => series[s].filter((v): v is number => v !== null))
  const maxV = Math.max(...allVals, 1)
  const x = (week: number) => PAD_L + ((week - 1) / (TOTAL_WEEKS - 1)) * iw
  const y = (v: number) => PAD_T + ih - (v / maxV) * ih

  const ticks = 4
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px' }}
      role="img"
      aria-label="CAC over time line chart"
    >
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (maxV * i) / ticks
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="#eee" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(v) + 5} textAnchor="end" fontSize={13} fill={MUTED}>
              ${Math.round(v)}
            </text>
          </g>
        )
      })}
      {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
        <text key={i} x={x(i + 1)} y={H - 12} textAnchor="middle" fontSize={13} fill={MUTED}>
          W{i + 1}
        </text>
      ))}
      {/* selected-week marker */}
      <line
        x1={x(selectedWeek)}
        x2={x(selectedWeek)}
        y1={PAD_T}
        y2={PAD_T + ih}
        stroke="#1a1a1a"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      {SCENARIOS.map((s) => {
        const pts = series[s]
          .map((v, i) => (v === null ? null : `${x(i + 1)},${y(v)}`))
          .filter(Boolean)
          .join(' ')
        if (!pts) return null
        return <polyline key={s} points={pts} fill="none" stroke={SCENARIO_COLORS[s]} strokeWidth={3} />
      })}
    </svg>
  )
}

// --- Weekly new paid grouped bar chart (pure SVG, no deps) ---
function PaidBarChart({
  series,
  selectedWeek,
}: {
  series: Record<ScenarioName, number[]>
  selectedWeek: number
}) {
  const W = 720
  const H = 260
  const PAD_L = 60
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 36
  const iw = W - PAD_L - PAD_R
  const ih = H - PAD_T - PAD_B

  const maxV = Math.max(...SCENARIOS.flatMap((s) => series[s]), 1)
  const slotW = iw / TOTAL_WEEKS
  const barW = Math.min(22, (slotW - 12) / 3)
  const y = (v: number) => PAD_T + ih - (v / maxV) * ih

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px' }}
      role="img"
      aria-label="Weekly new paid bar chart"
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(maxV * f)} y2={y(maxV * f)} stroke="#eee" strokeWidth={1} />
          <text x={PAD_L - 8} y={y(maxV * f) + 5} textAnchor="end" fontSize={13} fill={MUTED}>
            {Math.round(maxV * f)}
          </text>
        </g>
      ))}
      {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
        const week = i + 1
        const cx = PAD_L + slotW * i + slotW / 2
        return (
          <g key={week}>
            {week === selectedWeek && (
              <rect
                x={PAD_L + slotW * i + 2}
                y={PAD_T}
                width={slotW - 4}
                height={ih}
                rx={6}
                fill="#1a1a1a"
                opacity={0.06}
              />
            )}
            {SCENARIOS.map((s, si) => {
              const v = series[s][i]
              const h = Math.max(0, (v / maxV) * ih)
              const bx = cx + (si - 1) * (barW + 3) - barW / 2
              return (
                <rect
                  key={s}
                  x={bx}
                  y={PAD_T + ih - h}
                  width={barW}
                  height={h}
                  rx={3}
                  fill={SCENARIO_COLORS[s]}
                  opacity={week === selectedWeek ? 1 : 0.55}
                >
                  <title>{`${SCENARIO_LABELS[s]} W${week}: ${Math.round(v)} paid`}</title>
                </rect>
              )
            })}
            <text x={cx} y={H - 12} textAnchor="middle" fontSize={13} fill={MUTED}>
              W{week}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function CacForecastPage() {
  const [budget, setBudget] = useState(3000)
  const [week, setWeek] = useState(TOTAL_WEEKS)

  const results = useMemo(() => simulateAll(budget), [budget])
  const cacSeries = useMemo(() => {
    const out = {} as Record<ScenarioName, (number | null)[]>
    for (const s of SCENARIOS) out[s] = results[s].weeks.map((w) => w.runningCac)
    return out
  }, [results])
  const paidSeries = useMemo(() => {
    const out = {} as Record<ScenarioName, number[]>
    for (const s of SCENARIOS) out[s] = results[s].weeks.map((w) => w.newPaid)
    return out
  }, [results])

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', background: BG, minHeight: '100vh', color: TEXT }}>
      <Link href="/admin/marketing/dashboard" style={{ fontSize: BODY, color: '#0969da' }}>
        ← Marketing Dashboard
      </Link>
      <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0.5rem 0' }}>CAC Forecast</h1>
      <p
        style={{
          fontSize: BODY,
          color: TEXT,
          background: '#fff8c5',
          border: '1px solid #d4a017',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          margin: '0 0 1.5rem',
          fontWeight: 700,
        }}
      >
        ⚠️ MODELED, NOT LIVE — simulated funnel numbers for planning only. No live ad-platform or
        analytics data is used on this page.
      </p>

      {/* Controls */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2rem',
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: BODY }}>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem' }}>
            Total budget (USD)
          </span>
          <input
            type="number"
            min={0}
            step={100}
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
            style={{
              fontSize: BTN,
              padding: '0.5rem 0.75rem',
              border: `1px solid ${BORDER}`,
              borderRadius: '8px',
              width: '200px',
              color: TEXT,
              background: '#fff',
            }}
          />
        </label>
        <label style={{ fontSize: BODY, flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem' }}>
            Week: {week} of {TOTAL_WEEKS}
          </span>
          <input
            type="range"
            min={1}
            max={TOTAL_WEEKS}
            step={1}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#1a1a1a', height: '32px' }}
          />
        </label>
      </div>

      {/* Scenario cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {SCENARIOS.map((s) => {
          const r = results[s]
          const row = r.weeks[week - 1]
          const rates = SCENARIO_RATES[s]
          return (
            <div
              key={s}
              style={{
                background: CARD,
                border: `2px solid ${SCENARIO_COLORS[s]}`,
                borderRadius: '12px',
                padding: '1.25rem',
                fontSize: BODY,
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 800, color: SCENARIO_COLORS[s] }}>
                {SCENARIO_LABELS[s]}
              </div>
              <div style={{ fontSize: '15px', color: MUTED, marginBottom: '0.75rem' }}>
                CPC {formatUsd(rates.cpc)} · click→trial {Math.round(rates.clickToTrial * 100)}% ·
                trial→paid {Math.round(rates.trialToPaid * 100)}%
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '0.3rem' }}>
                <dt>Spend (W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{formatUsd(row.spend)}</dd>
                <dt>Clicks (W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{num(row.clicks)}</dd>
                <dt>Trials (W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{num(row.trials)}</dd>
                <dt>New paid (W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{num(row.newPaid)}</dd>
                <dt>Cum. paid (→W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{num(row.cumPaid)}</dd>
                <dt>Running CAC (→W{week})</dt>
                <dd style={{ margin: 0, fontWeight: 800 }}>{formatCac(row.runningCac)}</dd>
              </dl>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 0.75rem' }}>
        CAC over time (running, W1–W{TOTAL_WEEKS})
      </h2>
      <CacLineChart series={cacSeries} selectedWeek={week} />
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: BODY }}>
        {SCENARIOS.map((s) => (
          <span key={`legend-${s}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: SCENARIO_COLORS[s],
              }}
            />
            {SCENARIO_LABELS[s]}
          </span>
        ))}
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '1.5rem 0 0.75rem' }}>
        Weekly new paid subscribers
      </h2>
      <PaidBarChart series={paidSeries} selectedWeek={week} />

      <p style={{ fontSize: BODY, color: MUTED, marginTop: '1.5rem' }}>
        Model: budget ÷ {6} per week for weeks 1–6 ($0 weeks 7–8); trials convert to paid 2 weeks
        later; running CAC = cumulative spend ÷ cumulative paid.
      </p>
    </div>
  )
}
