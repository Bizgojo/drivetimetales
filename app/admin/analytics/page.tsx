'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Proforma targets (from ET_ProForma_2026_v2.1) ────────────────────────────
const PROFORMA = [
  { month: 'May 2026',  subs: 108,  mrr: 863,   cash: 20939 },
  { month: 'Jun 2026',  subs: 245,  mrr: 1958,   cash: 18200 },
  { month: 'Jul 2026',  subs: 420,  mrr: 3356,   cash: 19200 },
  { month: 'Aug 2026',  subs: 640,  mrr: 5114,   cash: 22800 },
  { month: 'Sep 2026',  subs: 900,  mrr: 7191,   cash: 29600 },
  { month: 'Oct 2026',  subs: 1210, mrr: 9671,   cash: 40200 },
  { month: 'Nov 2026',  subs: 1580, mrr: 12625,  cash: 55800 },
  { month: 'Dec 2026',  subs: 2010, mrr: 16063,  cash: 76400 },
]

const LAUNCH_DATE = new Date('2026-04-24')

function daysSinceLaunch() {
  return Math.max(0, Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000))
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtMoney(n: number) {
  return '$' + fmt(n, 2)
}

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'subscribers' | 'stories' | 'covers' | 'proforma'>('overview')

  // Core metrics
  const [subs, setSubs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [plays, setPlays] = useState<any[]>([])
  const [stories, setStories] = useState<any[]>([])

  // Computed
  const [mrr, setMrr] = useState(0)
  const [active, setActive] = useState(0)
  const [trialing, setTrialing] = useState(0)
  const [cancelled, setCancelled] = useState(0)
  const [founding, setFounding] = useState(0)
  const [newToday, setNewToday] = useState(0)
  const [newWeek, setNewWeek] = useState(0)
  const [trialEnding3, setTrialEnding3] = useState(0) // trials ending in 3 days

  // C6 — Cover performance (TTR)
  const [coverData, setCoverData] = useState<any>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [coverError, setCoverError] = useState('')

  const bg = '#FAF9F6'
  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab === 'covers' && !coverData && !coverLoading) loadCovers()
  }, [tab])

  async function loadCovers() {
    setCoverLoading(true)
    setCoverError('')
    try {
      const res = await fetch('/api/admin/cover-performance', { credentials: 'same-origin' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Request failed')
      setCoverData(payload)
    } catch (e: any) {
      setCoverError(e?.message || String(e))
    } finally {
      setCoverLoading(false)
    }
  }

  async function load() {
    setLoading(true)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString()
    const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString()

    const [
      { data: subsData },
      { data: usersData },
      { data: playsData },
      { data: storiesData },
    ] = await Promise.all([
      supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('id, email, first_name, plan, subscription_ends_at, created_at').order('created_at', { ascending: false }),
      supabase.from('user_library').select('story_id, completed, progress').gt('progress', 0),
      supabase.from('stories').select('id, title, author, duration_mins, genre').not('status', 'eq', 'archived').limit(100),
    ])

    const subsRows = subsData || []
    const usersRows = usersData || []
    const playsRows = playsData || []
    const storiesRows = storiesData || []

    setSubs(subsRows)
    setUsers(usersRows)
    setPlays(playsRows)
    setStories(storiesRows)

    // Compute subscription metrics from subscriptions table
    const activeRows = subsRows.filter(s => s.status === 'active')
    const trialingRows = subsRows.filter(s => s.status === 'trialing')
    const cancelledRows = subsRows.filter(s => s.status === 'canceled' || s.status === 'cancelled')
    const foundingRows = subsRows.filter(s => s.is_founding_member)

    setActive(activeRows.length)
    setTrialing(trialingRows.length)
    setCancelled(cancelledRows.length)
    setFounding(foundingRows.length)

    // MRR: founding_member = $2.99/mo, annual = $59.99/12 = $5.00, standard = $7.99/mo
    let totalMrr = 0
    activeRows.forEach(s => {
      if (s.plan === 'annual') totalMrr += 5.00
      else if (s.plan === 'founding_member') totalMrr += 2.99
      else totalMrr += 7.99
    })
    trialingRows.forEach(s => {
      // Count trialing as future MRR
      if (s.plan === 'annual') totalMrr += 5.00
      else if (s.plan === 'founding_member') totalMrr += 2.99
      else totalMrr += 7.99
    })
    setMrr(totalMrr)

    // New signups
    const todayUsers = usersRows.filter(u => u.created_at >= todayStart)
    const weekUsers = usersRows.filter(u => u.created_at >= weekStart)
    setNewToday(todayUsers.length)
    setNewWeek(weekUsers.length)

    // Trials ending in 3 days
    const endingSoon = usersRows.filter(u =>
      u.subscription_ends_at &&
      u.subscription_ends_at <= in3Days &&
      u.subscription_ends_at >= now.toISOString() &&
      u.plan && u.plan !== 'free'
    )
    setTrialEnding3(endingSoon.length)

    setLoading(false)
  }

  // Story play counts
  const storyPlayCounts: Record<string, number> = {}
  const storyCompleteCounts: Record<string, number> = {}
  plays.forEach(p => {
    storyPlayCounts[p.story_id] = (storyPlayCounts[p.story_id] || 0) + 1
    if (p.completed) storyCompleteCounts[p.story_id] = (storyCompleteCounts[p.story_id] || 0) + 1
  })

  const topStories = stories
    .map(s => ({
      ...s,
      plays: storyPlayCounts[s.id] || 0,
      completions: storyCompleteCounts[s.id] || 0,
      completion_rate: storyPlayCounts[s.id] ? Math.round((storyCompleteCounts[s.id] || 0) / storyPlayCounts[s.id] * 100) : 0,
    }))
    .filter(s => s.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10)

  const totalPlays = plays.length
  const totalCompletions = plays.filter(p => p.completed).length
  const overallCompletionRate = totalPlays > 0 ? Math.round(totalCompletions / totalPlays * 100) : 0

  // Days since launch for proforma comparison
  const dsl = daysSinceLaunch()
  const monthsSinceLaunch = Math.floor(dsl / 30)
  const currentProforma = PROFORMA[Math.min(monthsSinceLaunch, PROFORMA.length - 1)]
  const totalSubs = active + trialing

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '24px', fontFamily: '-apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={() => router.push('/admin')} style={{ background: '#e5e7eb', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#111' }}>Launch Analytics</h1>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>Day {dsl} since launch · Last updated just now</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" style={{ background: '#635bff', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>💳 Stripe</a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" style={{ background: '#000', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>▲ Vercel</a>
          <button onClick={load} style={{ background: '#f97316', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>↻ Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['overview', 'subscribers', 'stories', 'covers', 'proforma'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: tab === t ? '#f97316' : '#e5e7eb', color: tab === t ? 'white' : '#111', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', fontSize: 14 }}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          {/* Alert: trials ending soon */}
          {trialEnding3 > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <span style={{ color: '#92400e', fontWeight: 600 }}>{trialEnding3} trial{trialEnding3 > 1 ? 's' : ''} ending in the next 3 days — check email sequence is firing</span>
            </div>
          )}

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'MRR', value: fmtMoney(mrr), sub: `${active + trialing} paying/trialing`, color: '#16a34a' },
              { label: 'Active Subs', value: fmt(active), sub: `+${founding} founding members`, color: '#2563eb' },
              { label: 'In Trial', value: fmt(trialing), sub: `${trialEnding3} ending in 3 days`, color: '#f97316' },
              { label: 'Cancelled', value: fmt(cancelled), sub: 'all time', color: '#dc2626' },
            ].map(m => (
              <div key={m.label} style={{ ...card, marginBottom: 0 }}>
                <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ color: m.color, fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{m.value}</div>
                <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Signups and plays */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'New Today', value: fmt(newToday), color: '#7c3aed' },
              { label: 'New This Week', value: fmt(newWeek), color: '#7c3aed' },
              { label: 'Total Plays', value: fmt(totalPlays), color: '#0891b2' },
              { label: 'Completion Rate', value: overallCompletionRate + '%', color: '#0891b2' },
            ].map(m => (
              <div key={m.label} style={{ ...card, marginBottom: 0 }}>
                <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ color: m.color, fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Proforma snapshot */}
          {currentProforma && (
            <div style={{ ...card }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#111' }}>📊 Proforma vs Actual — {currentProforma.month}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Subscribers', target: currentProforma.subs, actual: totalSubs },
                  { label: 'MRR', target: currentProforma.mrr, actual: Math.round(mrr), money: true },
                ].map(m => {
                  const pct = m.target > 0 ? Math.round(m.actual / m.target * 100) : 0
                  const color = pct >= 100 ? '#16a34a' : pct >= 75 ? '#f97316' : '#dc2626'
                  return (
                    <div key={m.label} style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
                      <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{m.label}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#9ca3af', fontSize: 13 }}>Target: {m.money ? fmtMoney(m.target) : fmt(m.target)}</span>
                        <span style={{ color: '#111', fontWeight: 700, fontSize: 13 }}>Actual: {m.money ? fmtMoney(m.actual) : fmt(m.actual)}</span>
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ background: color, height: '100%', width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ color, fontWeight: 800, fontSize: 18, marginTop: 6 }}>{pct}%</div>
                    </div>
                  )
                })}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
                  <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Days Since Launch</div>
                  <div style={{ color: '#111', fontSize: 32, fontWeight: 900 }}>{dsl}</div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Launch: April 24, 2026</div>
                </div>
              </div>
            </div>
          )}

          {/* Top stories preview */}
          {topStories.length > 0 && (
            <div style={{ ...card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111' }}>🎧 Top Stories</h2>
                <button onClick={() => setTab('stories')} style={{ background: 'none', border: 'none', color: '#f97316', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>See all →</button>
              </div>
              {topStories.slice(0, 5).map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ width: 24, height: 24, background: i === 0 ? '#f97316' : '#e5e7eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: i === 0 ? 'white' : '#666', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#111', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                    <div style={{ color: '#9ca3af', fontSize: 12 }}>{s.author} · {s.genre}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, color: '#111', fontSize: 14 }}>{s.plays} plays</div>
                    <div style={{ color: s.completion_rate >= 70 ? '#16a34a' : '#9ca3af', fontSize: 12 }}>{s.completion_rate}% finish</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SUBSCRIBERS TAB ── */}
      {tab === 'subscribers' && (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>All Users ({users.length})</h2>
            <a href="https://dashboard.stripe.com/customers" target="_blank" rel="noreferrer" style={{ background: '#635bff', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>View in Stripe →</a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Email', 'Name', 'Plan', 'Trial Ends', 'Signed Up'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const planColor: Record<string, string> = { monthly: '#2563eb', annual: '#16a34a', founding_member: '#f97316', free: '#9ca3af' }
                  const trialEnd = u.subscription_ends_at ? new Date(u.subscription_ends_at) : null
                  const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000) : null
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', color: '#111', fontWeight: 500 }}>{u.email}</td>
                      <td style={{ padding: '10px 12px', color: '#374151' }}>{u.first_name || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: (planColor[u.plan] || '#9ca3af') + '20', color: planColor[u.plan] || '#9ca3af', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          {u.plan || 'free'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: daysLeft !== null && daysLeft <= 3 ? '#dc2626' : '#374151', fontWeight: daysLeft !== null && daysLeft <= 3 ? 700 : 400 }}>
                        {trialEnd ? (daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Today' : 'Expired') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#9ca3af' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STORIES TAB ── */}
      {tab === 'stories' && (
        <div style={{ ...card }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#111' }}>Story Performance ({stories.length} stories)</h2>
          {topStories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No plays yet — check back after launch!</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['#', 'Title', 'Author', 'Genre', 'Plays', 'Completions', 'Finish Rate'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topStories.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: i === 0 ? '#fff8f3' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: i === 0 ? '#f97316' : '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{s.author}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.genre}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111' }}>{s.plays}</td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{s.completions}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{ background: s.completion_rate >= 70 ? '#16a34a' : s.completion_rate >= 40 ? '#f97316' : '#dc2626', height: '100%', width: `${s.completion_rate}%` }} />
                        </div>
                        <span style={{ fontWeight: 700, color: s.completion_rate >= 70 ? '#16a34a' : '#374151', minWidth: 36 }}>{s.completion_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── COVERS TAB (C6 — cover performance / TTR) ── */}
      {tab === 'covers' && (
        <>
          {coverLoading && (
            <div style={{ ...card, textAlign: 'center', color: '#9ca3af' }}>Loading cover performance…</div>
          )}
          {coverError && (
            <div style={{ ...card, color: '#dc2626', fontWeight: 600 }}>
              Failed to load cover performance: {coverError}
              <button onClick={loadCovers} style={{ marginLeft: 12, background: '#f97316', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Retry</button>
            </div>
          )}
          {coverData && (
            <>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Cover Impressions', value: fmt(coverData.totalImpressions || 0), color: '#0891b2' },
                  { label: 'Cover Taps', value: fmt(coverData.totalTaps || 0), color: '#2563eb' },
                  { label: 'Overall TTR', value: coverData.totalImpressions >= coverData.floor ? ((coverData.totalTaps / coverData.totalImpressions) * 100).toFixed(1) + '%' : 'collecting', color: '#16a34a' },
                  { label: 'Tagged Covers', value: `${coverData.taggedStories}/${coverData.storiesWithCovers}`, color: '#7c3aed' },
                ].map(m => (
                  <div key={m.label} style={{ ...card, marginBottom: 0 }}>
                    <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{m.label}</div>
                    <div style={{ color: m.color, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Attribute rollups — what KIND of cover wins */}
              <div style={{ ...card }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#111' }}>🎨 What Kind of Cover Wins</h2>
                <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 16px' }}>Tap-through rate grouped by cover attribute. Groups under {fmt(coverData.floor)} impressions show “collecting”. Rollups span all placements — use the placement table below for band-clean comparison.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {([['palette', 'Palette'], ['dominant_subject', 'Subject'], ['face_visible', 'Face Visible'], ['temperature', 'Temperature']] as const).map(([key, label]) => (
                    <div key={key} style={{ background: '#f9fafb', borderRadius: 10, padding: 14 }}>
                      <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                      {Object.keys(coverData.attributes?.[key] || {}).length === 0 && (
                        <div style={{ color: '#9ca3af', fontSize: 12 }}>No tagged data yet</div>
                      )}
                      {Object.entries(coverData.attributes?.[key] || {}).sort((a: any, b: any) => (b[1].ttr ?? -1) - (a[1].ttr ?? -1)).map(([value, stats]: [string, any]) => (
                        <div key={value} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <span style={{ color: '#111', fontSize: 12, fontWeight: 600 }}>{value}</span>
                          <span style={{ color: stats.collecting ? '#9ca3af' : '#16a34a', fontSize: 12, fontWeight: 800 }}>
                            {stats.collecting ? `collecting (${fmt(stats.impressions)})` : (stats.ttr * 100).toFixed(1) + '%'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-cover TTR by placement band */}
              <div style={{ ...card }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#111' }}>🖼️ Cover TTR by Placement</h2>
                <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 16px' }}>Taps ÷ impressions, compared within the same page + position band so placement doesn’t pollute the signal. Covers under {fmt(coverData.floor)} impressions in a band show “collecting”.</p>
                {(coverData.rows || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No impressions recorded yet — data appears as listeners browse covers.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          {['Cover', 'Story', 'Page', 'Positions', 'Impressions', 'Taps', 'TTR', 'Attributes'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(coverData.rows || []).map((r: any, i: number) => (
                          <tr key={`${r.story_id}-${r.page}-${r.position_band}`} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px' }}>
                              {r.cover_url ? <img src={r.cover_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} /> : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#111', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{r.page}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{r.position_band}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#111' }}>{fmt(r.impressions)}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{fmt(r.taps)}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {r.collecting ? (
                                <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>collecting ({fmt(r.impressions)}/{fmt(coverData.floor)})</span>
                              ) : (
                                <span style={{ color: '#16a34a', fontWeight: 800 }}>{(r.ttr * 100).toFixed(1)}%</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>
                              {r.cover_attributes
                                ? `${r.cover_attributes.palette || '?'} · ${r.cover_attributes.dominant_subject || '?'} · ${r.cover_attributes.face_visible ? 'face' : 'no face'} · ${r.cover_attributes.temperature || '?'}`
                                : 'untagged'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── PROFORMA TAB ── */}
      {tab === 'proforma' && (
        <div style={{ ...card }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#111' }}>Proforma vs Actual</h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>Based on ET_ProForma_2026_v2.1. Checkpoints: May 24, Jun 17, Jul 17.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Month', 'Target Subs', 'Actual Subs', 'vs Target', 'Target MRR', 'Actual MRR', 'vs Target'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROFORMA.map((row, i) => {
                const isCurrentMonth = i === Math.min(monthsSinceLaunch, PROFORMA.length - 1)
                const subPct = row.subs > 0 ? Math.round(totalSubs / row.subs * 100) : 0
                const mrrPct = row.mrr > 0 ? Math.round(mrr / row.mrr * 100) : 0
                return (
                  <tr key={row.month} style={{ borderBottom: '1px solid #f3f4f6', background: isCurrentMonth ? '#fff8f3' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', fontWeight: isCurrentMonth ? 800 : 400, color: isCurrentMonth ? '#f97316' : '#111' }}>
                      {row.month} {isCurrentMonth && '← now'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{fmt(row.subs)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111' }}>{isCurrentMonth ? fmt(totalSubs) : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {isCurrentMonth ? (
                        <span style={{ color: subPct >= 100 ? '#16a34a' : subPct >= 75 ? '#f97316' : '#dc2626', fontWeight: 800 }}>{subPct}%</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{fmtMoney(row.mrr)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111' }}>{isCurrentMonth ? fmtMoney(mrr) : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {isCurrentMonth ? (
                        <span style={{ color: mrrPct >= 100 ? '#16a34a' : mrrPct >= 75 ? '#f97316' : '#dc2626', fontWeight: 800 }}>{mrrPct}%</span>
                      ) : '—'}
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
