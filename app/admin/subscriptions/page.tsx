'use client'

import SubscriberDetails from '../SubscriberDetails'
import { useEffect, useMemo, useState } from 'react'

type Subscriber = {
  id: string
  email: string
  name: string
  plan: string
  status: string
  isFoundingMember: boolean
  signupDate: string | null
  lastActive: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeStatus: string | null
  stripeUrl: string | null
  subscriptionEndsAt: string | null
  adminNotes: string
  accessGranted: boolean
  listening: {
    storiesStarted: number
    storiesCompleted: number
    totalListenedMinutes: number
    recentListeningDate: string | null
    hasReliableEvents: boolean
    eventCount?: number
    libraryActivityCount?: number
  }
  preferences: {
    hasEnoughData: boolean
    preferredGenres: string[]
    mostListenedGenre: string | null
    avgListenedStoryDuration: number | null
    avgCompletedStoryDuration: number | null
    typicalDurationBucket: string | null
  }
  listeningPatterns: {
    hasEnoughData: boolean
    favoriteListeningTime: string | null
    listeningTimeBuckets: Array<{ name: string; weight: number }>
    favoriteListeningDays: string[]
    mostActiveListeningDay: string | null
    averageSessionLengthMinutes: number | null
    recentSessions: Array<{
      storyId: string | null
      storyTitle: string | null
      startedAt: string | null
      endedAt: string | null
      secondsPlayed: number
      stopReason: string | null
    }>
    likelyListeningContext: string
    movementContextSource: string
    travelInsightsSetting: string
    travelInsightsSource: string
    travelInsightsUpdatedAt: string | null
  }
  playlist: { activityKnown: boolean; note: string }
  referrals: { count: number; rows: any[] }
}

type SubscriberPayload = {
  summary: {
    totalStandard: number
    activePaid: number
    canceledExpired: number
    foundingMembers: number
    newThisWeek: number
  }
  subscribers: Subscriber[]
  audit: { nonStandardUsers: any[] }
}

const statusColors: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  trialing: { bg: '#dbeafe', fg: '#1d4ed8' },
  canceled: { bg: '#fee2e2', fg: '#991b1b' },
  expired: { bg: '#f1f5f9', fg: '#475569' },
  past_due: { bg: '#ffedd5', fg: '#9a3412' },
  unknown: { bg: '#f1f5f9', fg: '#64748b' },
}

function fmtDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function planLabel(subscriber: Subscriber) {
  return subscriber.isFoundingMember ? 'Standard · Founding' : 'Standard'
}

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubscriberPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [sharedSummary,setSharedSummary]=useState<any>(null)

  async function adminFetch(path: string, init?: RequestInit) {
    const res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(payload.error || 'Request failed')
    return payload
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [payload,summary]=await Promise.all([adminFetch('/api/admin/subscribers'),adminFetch('/api/admin/center/customer-summary').catch((e:Error)=>({error:e.message}))])
      setSharedSummary(summary)
      setData(payload)
      setSelectedId((current) => current || payload.subscribers?.[0]?.id || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscriber load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selected = useMemo(() => {
    return data?.subscribers.find((subscriber) => subscriber.id === selectedId) || data?.subscribers[0] || null
  }, [data, selectedId])

  async function runAction(action: string, subscriber: Subscriber) {
    setActionMessage('')
    try {
      await adminFetch('/api/admin/subscribers', {
        method: 'PATCH',
        body: JSON.stringify({ userId: subscriber.id, action }),
      })
      setActionMessage('Action saved')
      await load()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const S = {
    page: { padding: 24, color: '#111827' } as React.CSSProperties,
    card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' } as React.CSSProperties,
    muted: { color: '#64748b', fontSize: 12 } as React.CSSProperties,
  }

  const summary=sharedSummary?.summary||{}

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px' }}>Subscribers</h1>
          <p style={{ ...S.muted, margin: 0 }}>Launch dashboard for real Standard subscribers only. Free, Test Driver, trial/test, and deprecated plans are excluded from inventory counts.</p>
        </div>
        <button onClick={load} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }}>Refresh</button>
      </div>

      {error && <div style={{ ...S.card, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', padding: 14, marginBottom: 16 }}>{error}</div>}

      <p style={S.muted}>{sharedSummary?.error||sharedSummary?.note||'Shared subscriber summary loading…'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['Total Standard subscribers', summary.totalStandard, '#f97316'],
          ['Active paid · Stripe', summary.activePaid, '#16a34a'],
          ['Canceled / expired / past due', summary.canceledExpired, '#64748b'],
          ['Founding Members', summary.foundingMembers, '#b45309'],
          ['New in last 7 days', summary.newThisWeek, '#2563eb'],
        ].map(([label, value, color]) => (
          <div key={label as string} style={{ ...S.card, padding: 16, borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 28, fontWeight: 950, color: color as string, lineHeight: 1 }}>{value==null?'Unavailable':value as number}</div>
            <div style={{ ...S.muted, marginTop: 8, fontWeight: 800 }}>{label as string}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1.45fr) minmax(360px, 0.75fr)' : '1fr', gap: 16 }}>
        <div style={{ ...S.card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>Standard Subscriber Inventory</div>
            <div style={S.muted}>{loading ? 'Loading…' : `${data?.subscribers.length || 0} rows`}</div>
          </div>
          {loading ? (
            <div style={{ padding: 36, color: '#64748b', textAlign: 'center' }}>Loading subscribers…</div>
          ) : !data?.subscribers.length ? (
            <div style={{ padding: 36, color: '#64748b', textAlign: 'center' }}>No Standard subscribers found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    {['Name / email', 'Plan', 'Status', 'Founding', 'Signup', 'Last active', 'Stripe', 'Actions'].map((heading) => (
                      <th key={heading} style={{ padding: '10px 12px', textAlign: 'left', color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.subscribers.map((subscriber) => {
                    const colors = statusColors[subscriber.status] || statusColors.unknown
                    return (
                      <tr key={subscriber.id} onClick={() => setSelectedId(subscriber.id)} style={{ borderBottom: '1px solid #f1f5f9', background: selectedId === subscriber.id ? '#fff7ed' : '#fff', cursor: 'pointer' }}>
                        <td style={{ padding: '11px 12px' }}>
                          <div style={{ fontWeight: 850, color: '#111827' }}>{subscriber.name}</div>
                          <div style={S.muted}>{subscriber.email}</div>
                        </td>
                        <td style={{ padding: '11px 12px', fontWeight: 800 }}>{planLabel(subscriber)}</td>
                        <td style={{ padding: '11px 12px' }}><span style={{ background: colors.bg, color: colors.fg, padding: '3px 8px', borderRadius: 999, fontWeight: 850, fontSize: 12 }}>{subscriber.status}</span></td>
                        <td style={{ padding: '11px 12px' }}>{subscriber.isFoundingMember ? 'Yes' : 'No'}</td>
                        <td style={{ padding: '11px 12px', color: '#475569' }}>{fmtDate(subscriber.signupDate)}</td>
                        <td style={{ padding: '11px 12px', color: '#475569' }}>{fmtDateTime(subscriber.lastActive)}</td>
                        <td style={{ padding: '11px 12px', color: '#475569' }}>{subscriber.stripeCustomerId ? 'Linked' : '—'}</td>
                        <td style={{ padding: '11px 12px' }}>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedId(subscriber.id) }} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '6px 8px', fontWeight: 800, cursor: 'pointer' }}>Details</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected&&<SubscriberDetails selected={selected} runAction={runAction} actionMessage={actionMessage}/>}
      </div>

      <div style={{ ...S.card, marginTop: 16, padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Dry-run cleanup audit</div>
        <p style={{ ...S.muted, margin: '0 0 10px' }}>Non-Standard users are hidden from the launch subscriber counts. Use `node scripts/audit-subscribers.js --env-path .env.production.local --output reports/subscribers-dry-run-audit.json --markdown reports/subscribers-dry-run-audit.md` for the full read-only report.</p>
        <div style={{ fontSize: 13, color: '#334155' }}>{data?.audit.nonStandardUsers.length || 0} non-Standard user records detected by the page load.</div>
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 950, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gap: 7 }}>{children}</div>
    </section>
  )
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: 10, fontSize: 13 }}>
      <div style={{ color: '#64748b', fontWeight: 700 }}>{label}</div>
      <div style={{ color: '#111827', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function ActionButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${danger ? '#fecaca' : '#cbd5e1'}`, background: danger ? '#fef2f2' : '#fff', color: danger ? '#991b1b' : '#0f172a', borderRadius: 8, padding: '9px 10px', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>
      {label}
    </button>
  )
}
