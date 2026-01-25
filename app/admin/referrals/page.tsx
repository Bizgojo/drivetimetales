'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ReferralStats {
  total_referrals: number
  successful_referrals: number
  pending_referrals: number
  total_rewards_given: number
  conversion_rate: number
}

interface TopReferrer {
  id: string
  display_name: string
  email: string
  referral_code: string
  referral_count: number
  successful_referrals: number
  total_earnings: number
}

interface RecentReferral {
  id: string
  referrer_name: string
  referred_name: string
  referred_email: string
  status: string
  created_at: string
  converted_at: string | null
}

export default function AdminReferralsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ReferralStats>({
    total_referrals: 0,
    successful_referrals: 0,
    pending_referrals: 0,
    total_rewards_given: 0,
    conversion_rate: 0
  })
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([])
  const [recentReferrals, setRecentReferrals] = useState<RecentReferral[]>([])
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  const bg = '#0f172a'
  const cardBg = '#1e293b'
  const textPrimary = '#ffffff'
  const textSecondary = '#94a3b8'
  const border = '#334155'
  const orange = '#f97316'
  const green = '#22c55e'

  useEffect(() => {
    fetchData()
  }, [timeRange])

  async function fetchData() {
    setLoading(true)
    
    try {
      // Fetch referral stats
      const { data: referrals } = await supabase
        .from('referrals')
        .select('*')
      
      if (referrals) {
        const successful = referrals.filter(r => r.status === 'completed' || r.converted_at)
        const pending = referrals.filter(r => r.status === 'pending' || (!r.converted_at && r.status !== 'completed'))
        
        setStats({
          total_referrals: referrals.length,
          successful_referrals: successful.length,
          pending_referrals: pending.length,
          total_rewards_given: successful.length * 30, // 30 days free per referral
          conversion_rate: referrals.length > 0 ? Math.round((successful.length / referrals.length) * 100) : 0
        })
      }

      // Fetch top referrers
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name, email, referral_code, referral_count')
        .not('referral_code', 'is', null)
        .order('referral_count', { ascending: false })
        .limit(10)
      
      if (users) {
        setTopReferrers(users.map(u => ({
          id: u.id,
          display_name: u.display_name || 'Unknown',
          email: u.email,
          referral_code: u.referral_code,
          referral_count: u.referral_count || 0,
          successful_referrals: u.referral_count || 0,
          total_earnings: (u.referral_count || 0) * 30 // 30 days per referral
        })))
      }

      // Fetch recent referrals
      const { data: recent } = await supabase
        .from('referrals')
        .select(`
          id,
          status,
          created_at,
          converted_at,
          referrer:referrer_id(display_name),
          referred:referred_id(display_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (recent) {
        setRecentReferrals(recent.map((r: any) => ({
          id: r.id,
          referrer_name: r.referrer?.display_name || 'Unknown',
          referred_name: r.referred?.display_name || 'Unknown',
          referred_email: r.referred?.email || '',
          status: r.converted_at ? 'completed' : (r.status || 'pending'),
          created_at: r.created_at,
          converted_at: r.converted_at
        })))
      }
    } catch (err) {
      console.error('Error fetching referral data:', err)
    }
    
    setLoading(false)
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold', marginBottom: '0.25rem' }}>🎁 Referrals</h1>
          <p style={{ color: textSecondary, fontSize: '14px' }}>Track referral program performance and rewards</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['7d', '30d', '90d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: timeRange === range ? orange : cardBg,
                color: timeRange === range ? 'black' : textPrimary,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {range === 'all' ? 'All Time' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ color: textSecondary, fontSize: '12px', marginBottom: '0.5rem' }}>Total Referrals</div>
          <div style={{ color: textPrimary, fontSize: '32px', fontWeight: 'bold' }}>{stats.total_referrals}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ color: textSecondary, fontSize: '12px', marginBottom: '0.5rem' }}>Successful</div>
          <div style={{ color: green, fontSize: '32px', fontWeight: 'bold' }}>{stats.successful_referrals}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ color: textSecondary, fontSize: '12px', marginBottom: '0.5rem' }}>Pending</div>
          <div style={{ color: orange, fontSize: '32px', fontWeight: 'bold' }}>{stats.pending_referrals}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ color: textSecondary, fontSize: '12px', marginBottom: '0.5rem' }}>Conversion Rate</div>
          <div style={{ color: stats.conversion_rate > 50 ? green : textPrimary, fontSize: '32px', fontWeight: 'bold' }}>{stats.conversion_rate}%</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ color: textSecondary, fontSize: '12px', marginBottom: '0.5rem' }}>Free Days Given</div>
          <div style={{ color: '#a855f7', fontSize: '32px', fontWeight: 'bold' }}>{stats.total_rewards_given}</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Top Referrers */}
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <h2 style={{ color: textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>🏆 Top Referrers</h2>
          
          {topReferrers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: textSecondary }}>
              No referrers yet
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: textSecondary }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: textSecondary }}>User</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: textSecondary }}>Code</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: textSecondary }}>Referrals</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: textSecondary }}>Days Earned</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.map((referrer, i) => (
                  <tr key={referrer.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '0.5rem', color: i < 3 ? orange : textPrimary, fontWeight: i < 3 ? 'bold' : 'normal' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ color: textPrimary, fontWeight: 500 }}>{referrer.display_name}</div>
                      <div style={{ color: textSecondary, fontSize: '10px' }}>{referrer.email}</div>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <span style={{ backgroundColor: '#1e3a5f', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                        {referrer.referral_code}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', color: green, fontWeight: 'bold' }}>
                      {referrer.referral_count}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', color: '#a855f7', fontWeight: 'bold' }}>
                      {referrer.total_earnings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Referrals */}
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <h2 style={{ color: textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>📋 Recent Referrals</h2>
          
          {recentReferrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: textSecondary }}>
              No referrals yet
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {recentReferrals.map(referral => (
                <div key={referral.id} style={{ padding: '0.75rem', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: textPrimary, fontSize: '13px' }}>
                      <span style={{ fontWeight: 500 }}>{referral.referrer_name}</span>
                      <span style={{ color: textSecondary }}> → </span>
                      <span style={{ fontWeight: 500 }}>{referral.referred_name}</span>
                    </div>
                    <div style={{ color: textSecondary, fontSize: '11px' }}>{formatDate(referral.created_at)}</div>
                  </div>
                  <div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      backgroundColor: referral.status === 'completed' ? '#166534' : '#854d0e',
                      color: referral.status === 'completed' ? '#86efac' : '#fde047'
                    }}>
                      {referral.status === 'completed' ? '✓ Completed' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Referral Program Info */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}`, marginTop: '1.5rem' }}>
        <h2 style={{ color: textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '1rem' }}>ℹ️ Referral Program Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div style={{ backgroundColor: bg, borderRadius: '8px', padding: '1rem' }}>
            <div style={{ color: orange, fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>Referrer Reward</div>
            <div style={{ color: textPrimary, fontSize: '13px' }}>30 days free added to subscription for each successful referral</div>
          </div>
          <div style={{ backgroundColor: bg, borderRadius: '8px', padding: '1rem' }}>
            <div style={{ color: green, fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>New User Reward</div>
            <div style={{ color: textPrimary, fontSize: '13px' }}>30-day free trial when signing up with a referral code</div>
          </div>
          <div style={{ backgroundColor: bg, borderRadius: '8px', padding: '1rem' }}>
            <div style={{ color: '#a855f7', fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>No Limits</div>
            <div style={{ color: textPrimary, fontSize: '13px' }}>Unlimited referrals - users can earn unlimited free subscription time</div>
          </div>
        </div>
      </div>
    </div>
  )
}
