'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Subscriber {
  id: string
  email: string
  created_at: string
  source: string | null
  locked_price: number | null
  notified: boolean
}

export default function AdminWaitlistPage() {
  const router = useRouter()
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [blasting, setBlasting] = useState(false)
  const [blastResult, setBlastResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'

  useEffect(() => { fetchSubscribers() }, [])

  async function fetchSubscribers() {
    setLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('id, email, created_at, source, locked_price, notified')
      .order('created_at', { ascending: false })
    if (data) setSubscribers(data)
    setLoading(false)
  }

  async function sendBlast() {
    if (!confirm('Send launch day email to ALL unnotified subscribers? This cannot be undone.')) return
    setBlasting(true)
    setBlastResult(null)
    try {
      const res = await fetch('https://vmyhlfeouzslixtkmddy.supabase.co/functions/v1/waitlist-blast', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      })
      const data = await res.json()
      if (res.ok) {
        setBlastResult(`✓ Sent ${data.sent} of ${data.total} emails successfully.`)
        fetchSubscribers()
      } else {
        setBlastResult(`Error: ${JSON.stringify(data)}`)
      }
    } catch (err) {
      setBlastResult(`Error: ${String(err)}`)
    }
    setBlasting(false)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  function exportCSV() {
    const rows = [['email', 'source', 'locked_price', 'notified', 'created_at']]
    subscribers.forEach(s => rows.push([s.email, s.source || '', String(s.locked_price || 7.99), String(s.notified), s.created_at]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'waitlist.csv'; a.click()
  }

  const filtered = subscribers.filter(s => s.email.toLowerCase().includes(search.toLowerCase()))
  const unnotified = subscribers.filter(s => !s.notified).length
  const notified = subscribers.filter(s => s.notified).length

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Waitlist</h1>
        </div>
        <button onClick={exportCSV} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>↓ Export CSV</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Subscribers', value: subscribers.length, color: '#f97316' },
          { label: 'Not Yet Notified', value: unnotified, color: '#2563eb' },
          { label: 'Notified', value: notified, color: '#16a34a' },
        ].map((stat, i) => (
          <div key={i} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
            <div style={{ color: textSecondary, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{stat.label}</div>
            <div style={{ color: stat.color, fontSize: '32px', fontWeight: 800 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Blast Section */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.5rem', border: `1px solid ${border}`, marginBottom: '1.5rem' }}>
        <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '0.5rem' }}>🚀 Launch Day Blast Email</h2>
        <p style={{ color: textSecondary, fontSize: '14px', marginBottom: '1rem' }}>
          Sends the launch day free trial email to all <strong>{unnotified} unnotified</strong> subscribers. Marks each as notified after sending.
        </p>
        <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', fontSize: '13px', color: textSecondary, lineHeight: 1.6 }}>
          <strong>Subject:</strong> Endless Tales is live — start your 14-day free trial now<br />
          <strong>From:</strong> hello@endless-tales.com<br />
          <strong>CTA:</strong> Start My 14-Day Free Trial → (links to endless-tales.com/welcome)
        </div>
        {blastResult && (
          <div style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: blastResult.startsWith('✓') ? '#dcfce7' : '#fee2e2', color: blastResult.startsWith('✓') ? '#16a34a' : '#dc2626', fontSize: '14px', marginBottom: '1rem' }}>
            {blastResult}
          </div>
        )}
        <button
          onClick={sendBlast}
          disabled={blasting || unnotified === 0}
          style={{ backgroundColor: unnotified === 0 ? '#e5e5e5' : '#e8520a', color: unnotified === 0 ? textSecondary : 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: unnotified === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '15px' }}
        >
          {blasting ? 'Sending...' : unnotified === 0 ? 'All Subscribers Notified' : `Send to ${unnotified} Subscriber${unnotified !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Subscriber Table */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>Subscribers</h2>
          <input
            type="text"
            placeholder="Search email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: `1px solid ${border}`, fontSize: '14px', width: '200px' }}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${border}` }}>
                {['Email', 'Source', 'Locked Price', 'Status', 'Signed Up'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: textSecondary, fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '0.75rem', color: textPrimary }}>{s.email}</td>
                  <td style={{ padding: '0.75rem', color: textSecondary }}>{s.source || 'direct'}</td>
                  <td style={{ padding: '0.75rem', color: textPrimary }}>${s.locked_price || 7.99}/mo</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ backgroundColor: s.notified ? '#dcfce7' : '#dbeafe', color: s.notified ? '#16a34a' : '#2563eb', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '12px', fontWeight: 600 }}>
                      {s.notified ? 'Notified' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', color: textSecondary }}>{formatDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: textSecondary }}>No subscribers found.</div>
          )}
        </div>
      </div>
    </div>
  )
}
