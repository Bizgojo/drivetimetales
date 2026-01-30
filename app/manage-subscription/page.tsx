'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const PLANS = [
  {
    id: 'test_driver',
    name: 'Test Driver',
    monthlyPrice: 2.99,
    yearlyPrice: 29.99,
    credits: 10,
    monthlyPriceId: 'price_1SjSWGG3QDdai0ZhIluFz2T3',
    yearlyPriceId: 'price_1SjSc8G3QDdai0ZhzV24N11l',
  },
  {
    id: 'commuter',
    name: 'Commuter',
    monthlyPrice: 7.99,
    yearlyPrice: 79.99,
    credits: 25,
    monthlyPriceId: 'price_1SjShgG3QDdai0ZhpLpMLBig',
    yearlyPriceId: 'price_1SjSj1G3QDdai0ZhSETd2rcS',
  },
  {
    id: 'road_warrior',
    name: 'Road Warrior',
    monthlyPrice: 14.99,
    yearlyPrice: 149.99,
    credits: 100,
    monthlyPriceId: 'price_1SjSkJG3QDdai0ZhEqPaFOmU',
    yearlyPriceId: 'price_1SjSlRG3QDdai0ZhD10RJ0sl',
  },
]

const FREEDOM_PACKS = [
  { id: 'small', name: 'Small Pack', price: 4.99, credits: 10, priceId: 'price_1SjSxEG3QDdai0Zhi0BbuzED' },
  { id: 'medium', name: 'Medium Pack', price: 9.99, credits: 25, priceId: 'price_1SjSydG3QDdai0ZhUIYLwgzw' },
  { id: 'large', name: 'Large Pack', price: 19.99, credits: 60, priceId: 'price_1SjT2LG3QDdai0ZhyG3JTuGY', bestValue: true },
]

export default function ManageSubscriptionPage() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [confirmPack, setConfirmPack] = useState<{id: string, name: string, price: number, credits: number} | null>(null)
  const [confirmChange, setConfirmChange] = useState<{plan: typeof PLANS[0], isUpgrade: boolean} | null>(null)
  
  // User data
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [currentCredits, setCurrentCredits] = useState(0)
  const [renewalDate, setRenewalDate] = useState<string | null>(null)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')

  useEffect(() => {
    async function loadUserData() {
      if (!user?.id) {
        setLoading(false)
        return
      }
      
      const { data } = await supabase
        .from('users')
        .select('plan, credits, subscription_ends_at')
        .eq('id', user.id)
        .single()
      
      if (data) {
        setCurrentPlan(data.plan || 'free')
        setCurrentCredits(data.credits || 0)
        if (data.subscription_ends_at) {
          const date = new Date(data.subscription_ends_at)
          setRenewalDate(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
          // Determine if annual based on days until renewal (>35 days = likely annual)
          const daysUntilRenewal = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          if (daysUntilRenewal > 35) {
            setBillingInterval('year')
          }
        }
      }
      setLoading(false)
    }
    loadUserData()
  }, [user])

  const currentPlanData = PLANS.find(p => p.id === currentPlan)
  const currentPlanIndex = PLANS.findIndex(p => p.id === currentPlan)

  const handlePlanChange = (plan: typeof PLANS[0]) => {
    if (plan.id === currentPlan) return
    
    const newPlanIndex = PLANS.findIndex(p => p.id === plan.id)
    const isUpgrade = newPlanIndex > currentPlanIndex
    
    setConfirmChange({ plan, isUpgrade })
  }

  const handleConfirmPlanChange = async () => {
    if (!user || !confirmChange) return
    
    setProcessing(confirmChange.plan.id)
    try {
      const response = await fetch('/api/subscription/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          newPlanId: confirmChange.plan.id,
          isUpgrade: confirmChange.isUpgrade,
          billingInterval,
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        await refreshUser()
        setConfirmChange(null)
        // Reload to show updated plan
        window.location.reload()
      } else if (data.url) {
        // Redirect to Stripe checkout if needed
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to change plan')
      }
    } catch (error) {
      console.error('Plan change error:', error)
      alert('Failed to change plan. Please try again.')
    } finally {
      setProcessing(null)
    }
  }

  const handleSelectPack = (pack: typeof FREEDOM_PACKS[0]) => {
    setConfirmPack({ id: pack.id, name: pack.name, price: pack.price, credits: pack.credits })
  }

  const handleQuickPurchase = async () => {
    if (!user || !confirmPack) return
    
    setProcessing(confirmPack.id)
    try {
      const response = await fetch('/api/quick-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: confirmPack.id,
          userId: user.id
        })
      })
      const data = await response.json()
      
      if (data.success) {
        await refreshUser()
        setConfirmPack(null)
        // Reload to show updated credits
        window.location.reload()
      } else {
        alert(data.error || 'Purchase failed. Please try again.')
        setConfirmPack(null)
      }
    } catch (error) {
      console.error('Purchase error:', error)
      alert('Purchase failed. Please try again.')
      setConfirmPack(null)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) {
    router.push('/signin')
    return null
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#030712', borderBottom: '1px solid #1f2937', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => router.back()} style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#1f2937', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '20px' }}>‹</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🚛</span>
            <span style={{ fontSize: '20px' }}>🚗</span>
            <span style={{ color: 'white', fontWeight: 'bold', marginLeft: '4px' }}>Drive Time </span>
            <span style={{ color: '#fb923c', fontWeight: 'bold' }}>Tales</span>
          </div>
          <div style={{ width: '44px' }} />
        </div>
      </header>

      <main style={{ padding: '16px', maxWidth: '500px', margin: '0 auto' }}>
        {/* Current Plan Card */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '2px solid #334155' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Current Plan</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f97316' }}>
                {currentPlanData?.name || 'Free'}
              </div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                {currentPlanData ? `$${billingInterval === 'month' ? currentPlanData.monthlyPrice : currentPlanData.yearlyPrice}/${billingInterval}` : 'No subscription'}
              </div>
              {renewalDate && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Renews {renewalDate}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: 'white' }}>{currentCredits}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>credits</div>
            </div>
          </div>
        </div>

        {/* Change Plan Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: 'white' }}>Change Plan</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {PLANS.map((plan, index) => {
              const isCurrent = plan.id === currentPlan
              const isUpgrade = index > currentPlanIndex
              const isDowngrade = index < currentPlanIndex
              
              return (
                <div
                  key={plan.id}
                  style={{
                    backgroundColor: isCurrent ? '#1e3a2f' : '#1e293b',
                    borderRadius: '12px',
                    padding: '16px',
                    border: isCurrent ? '2px solid #22c55e' : '2px solid #334155',
                    opacity: processing ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>{plan.name}</span>
                        {isCurrent && (
                          <span style={{ fontSize: '10px', backgroundColor: '#22c55e', color: 'black', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>CURRENT</span>
                        )}
                      </div>
                      <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
                        {plan.credits} credits/month
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>${plan.monthlyPrice}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>/month</div>
                    </div>
                  </div>
                  
                  {!isCurrent && (
                    <button
                      onClick={() => handlePlanChange(plan)}
                      disabled={!!processing}
                      style={{
                        width: '100%',
                        marginTop: '12px',
                        padding: '10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: processing ? 'not-allowed' : 'pointer',
                        backgroundColor: isUpgrade ? '#f97316' : '#475569',
                        color: isUpgrade ? 'black' : 'white',
                      }}
                    >
                      {processing === plan.id ? 'Processing...' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          
          {currentPlan !== 'free' && (
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', textAlign: 'center' }}>
              Upgrades take effect immediately. Downgrades take effect at your next billing date.
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
          <span style={{ color: '#64748b', fontSize: '14px' }}>Or Buy Credits</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
        </div>

        {/* Freedom Packs */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {FREEDOM_PACKS.map((pack) => (
              <div
                key={pack.id}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  border: pack.bestValue ? '2px solid #22c55e' : '2px solid #334155',
                  position: 'relative',
                }}
              >
                {pack.bestValue && (
                  <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#22c55e', color: 'black', fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px' }}>
                    BEST VALUE
                  </div>
                )}
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>{pack.name}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>${pack.price}</div>
                <div style={{ fontSize: '14px', color: '#f97316', fontWeight: '600', marginBottom: '12px' }}>{pack.credits} credits</div>
                <button
                  onClick={() => handleSelectPack(pack)}
                  disabled={!!processing}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    backgroundColor: pack.bestValue ? '#22c55e' : '#475569',
                    color: pack.bestValue ? 'black' : 'white',
                  }}
                >
                  {processing === pack.id ? '...' : 'Buy Now'}
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', textAlign: 'center' }}>
            Freedom Pack credits are added to your balance and never expire.
          </p>
        </div>
      </main>

      {/* Plan Change Confirmation Modal */}
      {confirmChange && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '100%', border: '1px solid #334155' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: '16px' }}>
              {confirmChange.isUpgrade ? 'Confirm Upgrade' : 'Confirm Downgrade'}
            </h3>
            
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: '#94a3b8' }}>From:</span>
                <span style={{ color: 'white', fontWeight: 'bold' }}>{currentPlanData?.name || 'Free'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <span style={{ color: '#f97316', fontSize: '20px' }}>↓</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8' }}>To:</span>
                <span style={{ color: '#f97316', fontWeight: 'bold' }}>{confirmChange.plan.name}</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: 'white', marginBottom: '8px' }}>
                <strong>New credits:</strong> {confirmChange.plan.credits}/month
              </div>
              <div style={{ fontSize: '14px', color: 'white' }}>
                <strong>New price:</strong> ${confirmChange.plan.monthlyPrice}/month
              </div>
            </div>

            {confirmChange.isUpgrade ? (
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', textAlign: 'center' }}>
                Your card will be charged a prorated amount. Your credits will reset to {confirmChange.plan.credits} immediately.
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', textAlign: 'center' }}>
                This change will take effect on your next billing date. Your current credits will reset to {confirmChange.plan.credits} at that time.
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmChange(null)}
                disabled={!!processing}
                style={{ flex: 1, padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPlanChange}
                disabled={!!processing}
                style={{ flex: 1, padding: '12px', backgroundColor: confirmChange.isUpgrade ? '#f97316' : '#475569', border: 'none', borderRadius: '12px', color: confirmChange.isUpgrade ? 'black' : 'white', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Purchase Confirmation Modal */}
      {confirmPack && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '100%', border: '1px solid #334155' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: '8px' }}>Confirm Purchase</h3>
            
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', margin: '16px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>{confirmPack.name}</p>
              <p style={{ color: '#f97316', fontWeight: '600' }}>{confirmPack.credits} credits</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: 'white', marginTop: '8px' }}>${confirmPack.price}</p>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
              Your card on file will be charged
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmPack(null)}
                disabled={!!processing}
                style={{ flex: 1, padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickPurchase}
                disabled={!!processing}
                style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', border: 'none', borderRadius: '12px', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
