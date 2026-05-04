'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Offer {
  id: string
  name: string
  offer_type: 'free_days' | 'credits'
  referrer_reward: number
  referred_reward: number
}

interface Referral {
  id: string
  referred_email: string | null
  status: string
  created_at: string
  opened_at: string | null
  subscribed_at: string | null
  rewarded_at: string | null
  offer_id: string | null
}

export default function ReferralDashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [userName, setUserName] = useState('Friend')
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'rewarded'>('all')

  useEffect(() => {
    if (user?.id) fetchData()
  }, [user])

  async function fetchData() {
    setLoading(true)
    
    const { data: userData } = await supabase
      .from('users')
      .select('first_name, display_name, default_offer_id')
      .eq('id', user?.id)
      .single()
    
    if (userData) {
      setUserName(userData.first_name || userData.display_name || 'Friend')

      let offerId = userData.default_offer_id
      if (!offerId) {
        const { data: defaultOffer } = await supabase
          .from('referral_offers')
          .select('id')
          .eq('is_default', true)
          .single()
        if (defaultOffer) offerId = defaultOffer.id
      }

      if (offerId) {
        const { data: offerData } = await supabase
          .from('referral_offers')
          .select('*')
          .eq('id', offerId)
          .single()
        if (offerData) setCurrentOffer(offerData)
      }
    }

    const { data: referralsData } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', user?.id)
      .order('created_at', { ascending: false })

    if (referralsData) setReferrals(referralsData)
    setLoading(false)
  }

  const stats = {
    total: referrals.length,
    opened: referrals.filter(r => r.opened_at).length,
    signed_up: referrals.filter(r => ['signed_up', 'subscribed', 'rewarded'].includes(r.status)).length,
    subscribed: referrals.filter(r => ['subscribed', 'rewarded'].includes(r.status)).length,
    rewarded: referrals.filter(r => r.status === 'rewarded').length
  }

  const filteredReferrals = referrals.filter(r => {
    if (filter === 'pending') return r.status !== 'rewarded'
    if (filter === 'rewarded') return r.status === 'rewarded'
    return true
  })

  const totalEarned = currentOffer 
    ? stats.rewarded * currentOffer.referrer_reward 
    : stats.rewarded * 14
  const earnedDisplay = currentOffer?.offer_type === 'free_days'
    ? `${totalEarned} days`
    : `${stats.rewarded} rewards`

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/refer')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Referral Dashboard</span>
          </div>
          <div onClick={() => router.push('/account')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '1rem' }}>
        {/* Stats Overview */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>Your Performance</h2>
          
          {/* Funnel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.total}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Sent</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.opened}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Opened</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{stats.total > 0 ? Math.round(stats.opened / stats.total * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.signed_up}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Signed Up</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{stats.opened > 0 ? Math.round(stats.signed_up / stats.opened * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.subscribed}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Subscribed</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{stats.signed_up > 0 ? Math.round(stats.subscribed / stats.signed_up * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 'bold' }}>{stats.rewarded}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Rewarded</div>
            </div>
          </div>

          {/* Total Earned */}
          <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.25rem' }}>Total Earned</div>
            <div style={{ color: '#22c55e', fontSize: '32px', fontWeight: 'bold' }}>
              {earnedDisplay}
            </div>
            {currentOffer?.offer_type === 'free_days' && (
              <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '0.25rem' }}>
                ≈ ${Math.round(totalEarned / 30 * 9.99)} value
              </div>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setFilter('all')} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', backgroundColor: filter === 'all' ? '#f97316' : '#334155', color: 'white', cursor: 'pointer', fontWeight: 500 }}>All ({referrals.length})</button>
          <button onClick={() => setFilter('pending')} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', backgroundColor: filter === 'pending' ? '#f97316' : '#334155', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Pending ({referrals.filter(r => r.status !== 'rewarded').length})</button>
          <button onClick={() => setFilter('rewarded')} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', backgroundColor: filter === 'rewarded' ? '#22c55e' : '#334155', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Rewarded ({stats.rewarded})</button>
        </div>

        {/* Referrals List */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
          <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>
            Referral History ({filteredReferrals.length})
          </h2>
          
          {filteredReferrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '32px', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>No referrals yet</div>
              <button onClick={() => router.push('/refer')} style={{ marginTop: '1rem', backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Share Your Link
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredReferrals.map(ref => (
                <div key={ref.id} style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                        {ref.referred_email || 'Waiting for signup...'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                        Sent: {new Date(ref.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ 
                      backgroundColor: ref.status === 'rewarded' ? '#22c55e' : ref.status === 'subscribed' ? '#3b82f6' : ref.status === 'signed_up' ? '#f97316' : ref.opened_at ? '#eab308' : '#475569',
                      color: ['rewarded', 'subscribed'].includes(ref.status) ? 'white' : 'black',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      {ref.status === 'rewarded' ? '✓ REWARDED' : ref.status === 'subscribed' ? 'SUBSCRIBED' : ref.status === 'signed_up' ? 'SIGNED UP' : ref.opened_at ? 'OPENED' : 'SENT'}
                    </div>
                  </div>
                  
                  {/* Timeline */}
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '11px' }}>
                    {ref.opened_at && (
                      <span style={{ color: '#eab308' }}>👀 Opened {new Date(ref.opened_at).toLocaleDateString()}</span>
                    )}
                    {ref.subscribed_at && (
                      <span style={{ color: '#3b82f6' }}>💳 Subscribed {new Date(ref.subscribed_at).toLocaleDateString()}</span>
                    )}
                    {ref.rewarded_at && (
                      <span style={{ color: '#22c55e' }}>🎁 Rewarded {new Date(ref.rewarded_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
