'use client'
import { useState, useEffect, useCallback } from 'react'

export default function ELUsagePage() {
  const [sub, setSub] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [view, setView] = useState<'days' | 'stories' | 'categories'>('stories')
  const [lastSync, setLastSync] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [subRes, dataRes] = await Promise.all([
      fetch('/api/admin/el-usage'),
      fetch('/api/admin/el-sync')
    ])
    const subJson = await subRes.json()
    const dataJson = await dataRes.json()
    setSub(subJson.subscription)
    setData(dataJson)
    setLastSync(new Date().toLocaleTimeString())
    setLoading(false)
  }, [])

  const runSync = async () => {
    setSyncing(true)
    await fetch('/api/admin/el-sync', { method: 'POST' })
    await loadData()
    setSyncing(false)
  }

  useEffect(() => {
    loadData()
    // Auto-refresh every hour
    const interval = setInterval(loadData, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadData])

  const S = {
    page: { background: '#f5f5f5', minHeight: '100vh', padding: 24, fontFamily: '-apple-system,sans-serif', color: '#000' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '16px 20px', marginBottom: 20 } as React.CSSProperties,
    stat: (accent: string) => ({ background: '#fff', border: '1px solid #ddd', borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px', flex: 1, minWidth: 130 } as React.CSSProperties),
    tab: (a: boolean) => ({ padding: '8px 18px', borderRadius: 8, border: `1px solid ${a ? '#f97316' : '#ddd'}`, background: a ? '#f97316' : '#fff', color: a ? '#fff' : '#333', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as React.CSSProperties),
    th: { textAlign: 'left' as const, padding: '8px 12px', fontWeight: 700, borderBottom: '2px solid #eee', fontSize: 13 },
    td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
    catBadge: (cat: string) => {
      const map: Record<string, [string, string]> = {
        news: ['#fef2f2', '#dc2626'], story: ['#f0fdf4', '#16a34a'],
        production: ['#eff6ff', '#2563eb'], intro: ['#faf5ff', '#7c3aed'],
        testing: ['#fff7ed', '#f97316']
      }
      const [bg, color] = map[cat] || ['#f5f5f5', '#666']
      return { background: bg, color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }
    },
  }

  if (loading) return (
    <div style={S.page}>
      <div style={{ textAlign: 'center', padding: 80, color: '#666' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
        <div>Loading ElevenLabs data...</div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🎙️ ElevenLabs Usage</h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Last updated: {lastSync} · Auto-refreshes hourly
          </div>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.7 : 1 }}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
        </button>
      </div>

      {/* Subscription bar */}
      {sub && (
        <div style={{ ...S.card, borderLeft: `4px solid ${sub.pct > 90 ? '#dc2626' : sub.pct > 70 ? '#f97316' : '#16a34a'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Billing Period</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
                {sub.charUsed.toLocaleString()} <span style={{ color: '#666', fontSize: 14 }}>/ {sub.charLimit.toLocaleString()} chars</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ background: sub.pct > 90 ? '#fee2e2' : sub.pct > 70 ? '#fff7ed' : '#f0fdf4', color: sub.pct > 90 ? '#dc2626' : sub.pct > 70 ? '#f97316' : '#16a34a', padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
                {sub.pct}% used
              </span>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Resets: {sub.resetDate}</div>
            </div>
          </div>
          <div style={{ marginTop: 10, background: '#f0f0f0', borderRadius: 4, height: 8 }}>
            <div style={{ height: '100%', width: `${Math.min(sub.pct, 100)}%`, background: sub.pct > 90 ? '#dc2626' : sub.pct > 70 ? '#f97316' : '#16a34a', borderRadius: 4 }} />
          </div>
          {sub.charUsed > sub.charLimit && (
            <div style={{ marginTop: 8, color: '#dc2626', fontWeight: 700, fontSize: 13 }}>
              ⚠️ OVER LIMIT by {(sub.charUsed - sub.charLimit).toLocaleString()} chars — overage charges applying
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      {data?.summary && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={S.stat('#6366f1')}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#6366f1' }}>{(data.summary.totalChars/1000).toFixed(0)}k</div>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>TOTAL CHARS (LOGGED)</div>
          </div>
          <div style={S.stat('#f97316')}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#f97316' }}>${data.summary.totalCost.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>EST. COST LOGGED</div>
          </div>
          <div style={S.stat('#2563eb')}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>{data.summary.totalCalls.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>API CALLS LOGGED</div>
          </div>
          {data.byCategory?.find((c: any) => c.cat === 'news') && (
            <div style={S.stat('#dc2626')}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>${data.byCategory.find((c: any) => c.cat === 'news')?.cost?.toFixed(2) || '0'}</div>
              <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>NEWS BRIEFINGS COST</div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={S.tab(view === 'stories')} onClick={() => setView('stories')}>📖 By Story</button>
        <button style={S.tab(view === 'days')} onClick={() => setView('days')}>📅 By Day</button>
        <button style={S.tab(view === 'categories')} onClick={() => setView('categories')}>🏷️ By Category</button>
      </div>

      {/* By Story */}
      {view === 'stories' && (
        <div style={S.card}>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            Cost per story — all identified story audio in history
          </div>
          {!data?.byStory?.length ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
              <div>No story-specific data yet. Click <strong>Sync Now</strong> to classify your history.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Story</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Characters</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>API Calls</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Est. Cost</th>
                  <th style={S.th}>Usage</th>
                </tr>
              </thead>
              <tbody>
                {data.byStory.map((s: any) => (
                  <tr key={s.title}>
                    <td style={S.td}><strong>{s.title}</strong></td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{s.chars.toLocaleString()}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#666' }}>{s.calls}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: s.cost > 10 ? '#f97316' : '#333' }}>${s.cost.toFixed(2)}</td>
                    <td style={S.td}>
                      <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6, width: 100 }}>
                        <div style={{ height: '100%', width: `${Math.round((s.chars / (data.byStory[0]?.chars || 1)) * 100)}%`, background: '#f97316', borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* By Day */}
      {view === 'days' && (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total Chars</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Story</th>
                <th style={{ ...S.th, textAlign: 'right' }}>News</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Testing</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byDay || []).map((d: any) => (
                <tr key={d.date}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{d.date}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{d.total.toLocaleString()}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#16a34a' }}>{(d.story + d.production + d.intro).toLocaleString()}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: d.news > 0 ? '#dc2626' : '#ccc' }}>{d.news.toLocaleString()}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#f97316' }}>{d.testing.toLocaleString()}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: d.cost > 20 ? '#dc2626' : '#333' }}>${d.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By Category */}
      {view === 'categories' && (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Category</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total Chars</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Est. Cost</th>
                <th style={S.th}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byCategory || []).map((c: any) => {
                const totalChars = data.summary?.totalChars || 1
                const pct = Math.round((c.chars / totalChars) * 100)
                return (
                  <tr key={c.cat}>
                    <td style={S.td}><span style={S.catBadge(c.cat)}>{c.cat}</span></td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{c.chars.toLocaleString()}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>${c.cost.toFixed(2)}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, width: 120 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#f97316', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#666' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
