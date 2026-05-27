'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  listening: { storiesStarted: number; storiesCompleted: number; totalProgressMinutes: number }
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

  async function adminFetch(path: string, init?: RequestInit) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Admin session not available')
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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
      const payload = await adminFetch('/api/admin/subscribers')
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

  const summary = data?.summary || { totalStandard: 0, activePaid: 0, canceledExpired: 0, foundingMembers: 0, newThisWeek: 0 }

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['Total Standard subscribers', summary.totalStandard, '#f97316'],
          ['Active paid subscribers', summary.activePaid, '#16a34a'],
          ['Canceled / expired', summary.canceledExpired, '#64748b'],
          ['Founding Members', summary.foundingMembers, '#b45309'],
          ['New this week', summary.newThisWeek, '#2563eb'],
        ].map(([label, value, color]) => (
          <div key={label as string} style={{ ...S.card, padding: 16, borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 28, fontWeight: 950, color: color as string, lineHeight: 1 }}>{value as number}</div>
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

        {selected && (
          <div style={{ ...S.card, padding: 16, alignSelf: 'start', position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>{selected.name}</div>
                <div style={S.muted}>{selected.email}</div>
              </div>
              {selected.isFoundingMember && <div style={{ background: '#ffedd5', color: '#9a3412', borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 900 }}>Founding</div>}
            </div>

            <DetailSection title="Account info">
              <Info label="User ID" value={selected.id} mono />
              <Info label="Signup date" value={fmtDateTime(selected.signupDate)} />
              <Info label="Last active" value={fmtDateTime(selected.lastActive)} />
            </DetailSection>
            <DetailSection title="Subscription / payment">
              <Info label="Plan" value={planLabel(selected)} />
              <Info label="Subscription status" value={selected.status} />
              <Info label="Stripe status" value={selected.stripeStatus || '—'} />
              <Info label="Current period / access ends" value={fmtDate(selected.subscriptionEndsAt)} />
              {selected.stripeUrl && <a href={selected.stripeUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', color: '#2563eb', fontSize: 13, fontWeight: 850, marginTop: 4 }}>Open Stripe customer</a>}
            </DetailSection>
            <DetailSection title="Listening history">
              <Info label="Stories started" value={String(selected.listening.storiesStarted)} />
              <Info label="Stories completed" value={String(selected.listening.storiesCompleted)} />
              <Info label="Total progress" value={`${selected.listening.totalProgressMinutes} min`} />
            </DetailSection>
            <DetailSection title="Playlist activity">
              <Info label="Server activity" value={selected.playlist.activityKnown ? 'Known' : 'Client-side only'} />
              <div style={S.muted}>{selected.playlist.note}</div>
            </DetailSection>
            <DetailSection title="Referral info">
              <Info label="Referral records" value={String(selected.referrals.count)} />
            </DetailSection>
            <DetailSection title="Admin notes">
              <div style={{ minHeight: 54, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, color: selected.adminNotes ? '#111827' : '#94a3b8', fontSize: 13 }}>
                {selected.adminNotes || 'No admin notes recorded.'}
              </div>
            </DetailSection>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <ActionButton label={selected.isFoundingMember ? 'Remove Founding' : 'Grant Founding'} onClick={() => runAction(selected.isFoundingMember ? 'remove_founding' : 'grant_founding', selected)} />
              <ActionButton label={selected.accessGranted ? 'Revoke access' : 'Grant access'} onClick={() => runAction(selected.accessGranted ? 'revoke_access' : 'grant_access', selected)} />
              <ActionButton label="Mark internal/test" onClick={() => runAction('mark_internal', selected)} />
              <ActionButton label="Disable account" danger onClick={() => runAction('disable_account', selected)} />
            </div>
            {actionMessage && <div style={{ marginTop: 10, color: actionMessage === 'Action saved' ? '#166534' : '#991b1b', fontSize: 12, fontWeight: 800 }}>{actionMessage}</div>}
          </div>
        )}
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
