'use client'
import { useState, useEffect } from 'react'

interface Day {
  date: string
  chars: number
  calls: number
  cost: number
  topVoices: { name: string; chars: number }[]
}
interface Voice { name: string; chars: number; cost: number }

export default function ELUsagePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'days' | 'voices'>('days')

  useEffect(() => {
    fetch('/api/admin/el-usage')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const S = {
    page: { background: '#f5f5f5', minHeight: '100vh', padding: 24, fontFamily: '-apple-system,sans-serif', color: '#000' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '16px 20px', marginBottom: 20 } as React.CSSProperties,
    statBox: (accent: string) => ({ background: '#fff', border: `1px solid #ddd`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px', flex: 1, minWidth: 140 } as React.CSSProperties),
    tab: (active: boolean) => ({ padding: '8px 20px', borderRadius: 8, border: `1px solid ${active ? '#f97316' : '#ddd'}`, background: active ? '#f97316' : '#fff', color: active ? '#fff' : '#333', fontWeight: 600, fontSize: 14, cursor: 'pointer' } as React.CSSProperties),
    badge: (pct: number) => ({ background: pct > 90 ? '#fee2e2' : pct > 70 ? '#fff7ed' : '#f0fdf4', color: pct > 90 ? '#dc2626' : pct > 70 ? '#f97316' : '#16a34a', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 } as React.CSSProperties),
  }

  if (loading) return <div style={S.page}><div style={{ textAlign: 'center', padding: 80, color: '#666' }}>Loading ElevenLabs data... (fetching full history)</div></div>
  if (error || data?.error) return <div style={S.page}><div style={{ color: '#dc2626', padding: 20 }}>Error: {error || data?.error}</div></div>

  const { subscription: sub, summary, days, voices } = data

  return (
    <div style={S.page}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎙️ ElevenLabs Usage</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>Full history — character usage, cost estimates, and voice breakdown</p>

      {/* Subscription Status */}
      <div style={{ ...S.card, borderLeft: `4px solid ${sub.pct > 90 ? '#dc2626' : sub.pct > 70 ? '#f97316' : '#16a34a'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Billing Period</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
              {sub.charUsed.toLocaleString()} <span style={{ color: '#666', fontSize: 14 }}>/ {sub.charLimit.toLocaleString()} chars</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={S.badge(sub.pct)}>{sub.pct}% used</span>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Resets: {sub.resetDate || 'unknown'}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(sub.pct, 100)}%`, background: sub.pct > 90 ? '#dc2626' : sub.pct > 70 ? '#f97316' : '#16a34a', borderRadius: 4 }} />
        </div>
        {sub.charUsed > sub.charLimit && (
          <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 700, fontSize: 13 }}>
            ⚠️ Over limit by {(sub.charUsed - sub.charLimit).toLocaleString()} chars — overage charges applying
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={S.statBox('#6366f1')}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#6366f1' }}>{summary.totalChars.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Total Chars (history)</div>
        </div>
        <div style={S.statBox('#f97316')}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#f97316' }}>${summary.estimatedCost}</div>
          <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Est. Cost @ $0.30/1k</div>
        </div>
        <div style={S.statBox('#2563eb')}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#2563eb' }}>{summary.totalCalls.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Total API Calls</div>
        </div>
        <div style={S.statBox('#16a34a')}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>{summary.days}</div>
          <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Days with Usage</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={S.tab(view === 'days')} onClick={() => setView('days')}>📅 Daily Breakdown</button>
        <button style={S.tab(view === 'voices')} onClick={() => setView('voices')}>🎤 By Voice</button>
      </div>

      {/* Daily Breakdown */}
      {view === 'days' && (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700 }}>Date</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700 }}>Characters</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700 }}>API Calls</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700 }}>Est. Cost</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700 }}>Top Voices</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day: Day) => (
                <tr key={day.date} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{day.date}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{day.chars.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#666' }}>{day.calls}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: day.cost > 10 ? '#dc2626' : '#333' }}>${day.cost.toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', color: '#666', fontSize: 12 }}>
                    {day.topVoices.map(v => `${v.name} (${v.chars.toLocaleString()})`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Voice Breakdown */}
      {view === 'voices' && (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700 }}>Voice</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700 }}>Characters Used</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700 }}>Est. Cost</th>
                <th style={{ padding: '8px 12px' }}>Usage Bar</th>
              </tr>
            </thead>
            <tbody>
              {voices.map((v: Voice, i: number) => (
                <tr key={v.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{i + 1} {v.name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{v.chars.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: v.cost > 5 ? '#f97316' : '#333' }}>${v.cost.toFixed(2)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6, width: 120 }}>
                      <div style={{ height: '100%', width: `${Math.round((v.chars / voices[0].chars) * 100)}%`, background: '#f97316', borderRadius: 4 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
