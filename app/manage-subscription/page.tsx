'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface Invoice {
  id: string
  date: string
  description: string
  amount: number
  invoice_url?: string
}

export default function ManageSubscriptionPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelSuccess, setCancelSuccess] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/user/invoices?userId=${user.id}`)
      .then(r => r.json())
      .then(data => { setInvoices(data.invoices || []); setLoadingInvoices(false) })
      .catch(() => setLoadingInvoices(false))
  }, [user?.id])

  useEffect(() => {
    fetch('/api/subscriber-count')
      .then(r => r.json())
      .then(data => setCurrentPrice(data.price))
      .catch(() => setCurrentPrice(7.99))
  }, [])

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) {
    router.push('/signin')
    return null
  }

  const isActive = user.subscription_status === 'active' || user.subscription_status === 'trialing'
  const isCancelling = user.subscription_status === 'cancelling'
  const isFree = !isActive && !isCancelling
  const hasSubscription = isActive || isCancelling

  // Determine what price the user is paying (from their plan or DB)
  const userPrice = (user as any).subscription_price ?? null
  const displayPrice = userPrice ? `$${parseFloat(userPrice).toFixed(2)} / month` : '$7.99 / month'

  const cardStyle = { backgroundColor: '#0f172a', borderRadius: '16px', padding: '20px', marginBottom: '16px', border: '1px solid #334155' }
  const labelStyle = { fontSize: '13px', color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

  const handleManagePayment = async () => {
    setOpeningPortal(true)
    try {
      const res = await fetch('/api/user/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert('Could not open billing portal. Please try again.')
    } catch {
      alert('Could not open billing portal. Please try again.')
    } finally {
      setOpeningPortal(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch('/api/user/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.success) {
        setCancelSuccess(true)
        setShowCancelConfirm(false)
      } else {
        alert(data.error || 'Failed to cancel. Please try again.')
      }
    } catch {
      alert('Failed to cancel. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white' }}>
      <StickyHeaderFull />

      <div style={{ padding: '20px 20px 0', maxWidth: '480px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white', margin: '0 0 20px' }}>Billing &amp; Subscription</h1>
      </div>

      <div style={{ padding: '0 20px 40px', maxWidth: '480px', margin: '0 auto' }}>

        {/* Cancel Success Banner */}
        {cancelSuccess && (
          <div style={{ backgroundColor: '#052e16', border: '1px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#86efac' }}>
            ✅ Subscription cancelled. You'll keep access until the end of your billing period.
          </div>
        )}

        {/* Current Plan */}
        <div style={cardStyle}>
          <div style={labelStyle}>Current Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>
                {isFree ? 'Free' : 'Unlimited'}
              </div>
              <div style={{ fontSize: '15px', color: 'white' }}>
                {isFree ? 'Free access' : displayPrice}
              </div>
              {isCancelling && user.subscription_ends_at && (
                <div style={{ fontSize: '13px', color: '#f97316', marginTop: '4px' }}>
                  Access until {new Date(user.subscription_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
            <div style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
              backgroundColor: isActive ? '#052e16' : isCancelling ? '#431407' : '#1e293b',
              color: isActive ? '#4ade80' : isCancelling ? '#f97316' : 'white',
              border: `1px solid ${isActive ? '#16a34a' : isCancelling ? '#f97316' : '#334155'}`
            }}>
              {isActive ? 'Active' : isCancelling ? 'Cancelling' : 'Free'}
            </div>
          </div>
        </div>

        {/* Payment Method — only for subscribers */}
        {hasSubscription && !cancelSuccess && (
          <div style={cardStyle}>
            <div style={labelStyle}>Payment Method</div>
            <button
              onClick={handleManagePayment}
              disabled={openingPortal}
              style={{ width: '100%', padding: '14px', backgroundColor: '#1e293b', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', opacity: openingPortal ? 0.6 : 1 }}
            >
              {openingPortal ? 'Opening…' : 'Manage Payment Method'}
            </button>
          </div>
        )}

        {/* Purchase History */}
        <div style={cardStyle}>
          <div style={labelStyle}>Purchase History</div>
          {loadingInvoices ? (
            <div style={{ color: 'white', fontSize: '14px' }}>Loading…</div>
          ) : invoices.length === 0 ? (
            <div style={{ color: 'white', fontSize: '14px' }}>No purchase history yet</div>
          ) : (
            invoices.map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>{inv.description}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>${inv.amount.toFixed(2)}</span>
                  {inv.invoice_url && (
                    <a href={inv.invoice_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#f97316' }}>Receipt</a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cancel Subscription — only for active subscribers */}
        {isActive && !cancelSuccess && (
          <div style={cardStyle}>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '10px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' }}
              >
                Cancel Subscription
              </button>
            ) : (
              <div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>Are you sure?</div>
                <div style={{ fontSize: '14px', color: 'white', marginBottom: '16px' }}>
                  You'll keep access until the end of your current billing period. This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    style={{ flex: 1, padding: '12px', backgroundColor: '#1e293b', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', cursor: 'pointer' }}
                  >
                    Keep Plan
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    style={{ flex: 1, padding: '12px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', opacity: cancelling ? 0.6 : 1 }}
                  >
                    {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subscribe card — only for free users (no existing subscription) */}
        {isFree && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>Unlimited access to all stories</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#f97316', marginBottom: '16px' }}>
              {currentPrice !== null ? `$${currentPrice.toFixed(2)} / month` : '…'}
            </div>
            <button
              onClick={() => router.push('/signup')}
              style={{ width: '100%', padding: '14px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
            >
              Subscribe Now
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
