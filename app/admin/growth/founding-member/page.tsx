'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'

type FMStatus = {
  spotsUsed: number
  spotsRemaining: number
  capReached: boolean
  warningThreshold: boolean
  priceId: string
}

type FMSubscriber = {
  customerId: string
  subscriptionId: string
  status: string
  currentPeriodEnd: string
  createdAt: string
}

type FMStatusResponse = {
  success: boolean
  status?: FMStatus
  subscribers?: FMSubscriber[]
  activeSubscribers?: number
  totalSubscribers?: number
  error?: string
}

const CARD: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
}

const LABEL: CSSProperties = {
  color: '#666',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

function maskPriceId(priceId: string) {
  if (!priceId) return 'Not configured'
  return `...${priceId.slice(-4)}`
}

function calculateSevenDayPace(subscribers: FMSubscriber[]) {
  if (subscribers.length === 0) return null
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const oldestCreatedAt = Math.min(...subscribers.map((subscriber) => new Date(subscriber.createdAt).getTime()))
  if (!Number.isFinite(oldestCreatedAt) || oldestCreatedAt > sevenDaysAgo) return null

  const lastSevenDays = subscribers.filter((subscriber) => {
    const createdAt = new Date(subscriber.createdAt).getTime()
    return Number.isFinite(createdAt) && createdAt >= sevenDaysAgo && createdAt <= now
  })

  return lastSevenDays.length / 7
}

function statusBadge(status: FMStatus) {
  if (status.capReached) {
    return { text: 'LOCKED — Cap Reached', bg: '#fee2e2', color: '#991b1b', border: '#fecaca' }
  }
  if (status.warningThreshold) {
    return { text: 'Warning — < 50 spots', bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
  }
  return { text: 'Active — Accepting Members', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' }
}

function LoadingSkeleton() {
  return (
    <div style={{ ...CARD, padding: 24 }}>
      <div style={{ width: '40%', height: 18, backgroundColor: '#f1f1f1', borderRadius: 4, marginBottom: 18 }} />
      <div style={{ width: '60%', height: 46, backgroundColor: '#f1f1f1', borderRadius: 6, marginBottom: 14 }} />
      <div style={{ width: '30%', height: 18, backgroundColor: '#f1f1f1', borderRadius: 4 }} />
    </div>
  )
}

export function FoundingMemberStatusBoard() {
  const [data, setData] = useState<FMStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/fm-status', { cache: 'no-store' })
      const payload = await response.json() as FMStatusResponse
      if (!response.ok || !payload.success || !payload.status) {
        throw new Error(payload.error || `FM status request failed with ${response.status}`)
      }
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const pace = useMemo(() => calculateSevenDayPace(data?.subscribers || []), [data?.subscribers])

  if (loading) return <LoadingSkeleton />

  if (error || !data?.status) {
    return (
      <div style={{ ...CARD, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#991b1b', marginBottom: 8 }}>FM status unavailable</div>
        <div style={{ color: '#555', marginBottom: 16 }}>{error || 'Unable to load Founding Member data.'}</div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          style={{ border: '1px solid #1a1a1a', backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 6, padding: '0.65rem 0.9rem', fontWeight: 800, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  const status = data.status
  const badge = statusBadge(status)
  const activeSubscribers = data.activeSubscribers ?? status.spotsUsed
  const totalSubscribers = data.totalSubscribers ?? status.spotsUsed

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section style={{ ...CARD, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={LABEL}>FM Status Board</div>
            <div style={{ fontSize: 42, lineHeight: 1.1, fontWeight: 950, color: '#1a1a1a', marginTop: 8 }}>
              {status.spotsUsed} / 500 Founding Member spots used
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#374151', marginTop: 10 }}>
              {status.spotsRemaining} spots remaining
            </div>
          </div>
          <div style={{ border: `1px solid ${badge.border}`, backgroundColor: badge.bg, color: badge.color, borderRadius: 999, padding: '0.45rem 0.8rem', fontSize: 12, fontWeight: 900 }}>
            {badge.text}
          </div>
        </div>
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <div style={{ border: '1px solid #eeeeee', borderRadius: 8, padding: 14 }}>
            <div style={LABEL}>Acquisition pace</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#1a1a1a', marginTop: 8 }}>
              {pace === null ? '—' : `${pace.toFixed(1)} / day`}
            </div>
          </div>
          <div style={{ border: '1px solid #eeeeee', borderRadius: 8, padding: 14 }}>
            <div style={LABEL}>Last refreshed</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', marginTop: 12 }}>
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...CARD, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#1a1a1a', marginBottom: 14 }}>Cap Enforcement Status</div>
        <div style={{ display: 'grid', gap: 10, color: '#333', fontSize: 14, lineHeight: 1.5 }}>
          <div>Cap enforcement: <strong>ACTIVE — Checkout route auto-enforces via Stripe subscription count</strong></div>
          <div>FM price ID: <strong>{maskPriceId(status.priceId)}</strong></div>
          <div>FM annual billing: <strong>⚠️ Bug flagged — requires fix before launch (annual subscribers charged $59.99 instead of $29.99)</strong></div>
        </div>
      </section>

      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid #e0e0e0' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#1a1a1a' }}>FM Subscriber Count</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ backgroundColor: '#f7f7f7', color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #e0e0e0' }}>Total FM subscribers</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #e0e0e0' }}>Active</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #e0e0e0' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '16px', borderBottom: '1px solid #eeeeee', fontWeight: 900 }}>{totalSubscribers}</td>
                <td style={{ padding: '16px', borderBottom: '1px solid #eeeeee', fontWeight: 900 }}>{activeSubscribers}</td>
                <td style={{ padding: '16px', borderBottom: '1px solid #eeeeee' }}>{badge.text}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function FoundingMemberPage() {
  return (
    <div style={{ backgroundColor: '#FAF9F6', minHeight: '100vh', padding: 24, color: '#1a1a1a' }}>
      <FoundingMemberStatusBoard />
    </div>
  )
}
