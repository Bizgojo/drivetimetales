'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, active: 0, trialing: 0, cancelled: 0, founding: 0 })

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false })
      const rows = data || []
      setSubs(rows)
      setStats({
        total: rows.length,
        active: rows.filter(r => r.status === 'active').length,
        trialing: rows.filter(r => r.status === 'trialing').length,
        cancelled: rows.filter(r => r.status === 'canceled' || r.status === 'cancelled').length,
        founding: rows.filter(r => r.is_founding_member).length,
      })
      setLoading(false)
    }
    load()
  }, [])

  const S = {
    page: { background: '#f5f5f5', minHeight: '100vh', padding: 24, fontFamily: '-apple-system,sans-serif' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '16px 20px', marginBottom: 20 } as React.CSSProperties,
    stat: { background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '14px 20px', textAlign: 'center' as const, flex: 1 },
    badge: (color: string) => ({ background: color + '20', color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }),
  }

  const statusColor: Record<string, string> = { active: '#16a34a', trialing: '#2563eb', canceled: '#dc2626', cancelled: '#dc2626', past_due: '#f97316' }

  return (
    <div style={S.page}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20, color: '#000' }}>💳 Subscriptions</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['Total', stats.total, '#6366f1'], ['Active', stats.active, '#16a34a'], ['Trialing', stats.trialing, '#2563eb'], ['Cancelled', stats.cancelled, '#dc2626'], ['Founding', stats.founding, '#f97316']].map(([label, val, color]) => (
          <div key={label as string} style={{ ...S.stat, borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: color as string }}>{val as number}</div>
            <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label as string}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Loading...</div>
        ) : subs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#000' }}>No subscriptions yet</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Subscriptions will appear here once users sign up after April 17 launch.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                {['User ID', 'Status', 'Plan', 'Founding', 'Trial Ends', 'Period End', 'Created'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#000' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{s.user_id?.slice(0,12)}...</td>
                  <td style={{ padding: '8px 12px' }}><span style={S.badge(statusColor[s.status] || '#666')}>{s.status}</span></td>
                  <td style={{ padding: '8px 12px', color: '#333' }}>{s.price_id?.slice(-8) || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{s.is_founding_member ? '⭐ Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
