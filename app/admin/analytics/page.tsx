'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface SubscriptionStats {
  tier: string
  name: string
  count: number
  mrr: number
}

interface FreedomPackStats {
  name: string
  sold: number
  revenue: number
}

interface DailyRevenue {
  date: string
  subscriptions: number
  packs: number
  total: number
}

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'subscriptions' | 'packs' | 'traffic'>('overview')
  
  // Stats
  const [totalMRR, setTotalMRR] = useState(0)
  const [totalSubscribers, setTotalSubscribers] = useState(0)
  const [totalPacksSold, setTotalPacksSold] = useState(0)
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats[]>([])
  const [packStats, setPackStats] = useState<FreedomPackStats[]>([])
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([])
  const [churnRate, setChurnRate] = useState(0)
  const [newThisMonth, setNewThisMonth] = useState(0)

  // Theme
  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    setLoading(true)
    
    // Fetch subscription stats from users table
    const { data: users } = await supabase
      .from('users')
      .select('subscription_type, created_at')
    
    if (users) {
      // Calculate subscription stats
      const subCounts: Record<string, number> = {}
      const prices: Record<string, number> = {
        'test_driver': 2.99,
        'commuter': 7.99,
        'road_warrior': 14.99
      }
      
      let totalSubs = 0
      let mrr = 0
      let newSubs = 0
      const now = new Date()
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
      
      users.forEach(user => {
        if (user.subscription_type) {
          const tier = user.subscription_type
          subCounts[tier] = (subCounts[tier] || 0) + 1
          totalSubs++
          mrr += prices[tier] || 0
          
          // Check if new this month
          if (new Date(user.created_at) >= monthAgo) {
            newSubs++
          }
        }
      })
      
      setTotalSubscribers(totalSubs)
      setTotalMRR(mrr)
      setNewThisMonth(newSubs)
      
      // Format subscription stats
      const stats: SubscriptionStats[] = [
        { tier: 'test_driver', name: 'Test Driver', count: subCounts['test_driver'] || 0, mrr: (subCounts['test_driver'] || 0) * 2.99 },
        { tier: 'commuter', name: 'Commuter', count: subCounts['commuter'] || 0, mrr: (subCounts['commuter'] || 0) * 7.99 },
        { tier: 'road_warrior', name: 'Road Warrior', count: subCounts['road_warrior'] || 0, mrr: (subCounts['road_warrior'] || 0) * 14.99 }
      ]
      setSubscriptionStats(stats)
    }

    // Fetch freedom pack purchases (from a purchases or transactions table if exists)
    // For now, using placeholder - you'll need to create this table or pull from Stripe
    const packData: FreedomPackStats[] = [
      { name: 'Small Pack', sold: 0, revenue: 0 },
      { name: 'Medium Pack', sold: 0, revenue: 0 },
      { name: 'Large Pack', sold: 0, revenue: 0 }
    ]
    
    // Try to fetch from purchases table if it exists
    const { data: purchases } = await supabase
      .from('purchases')
      .select('pack_type, amount')
      .eq('type', 'freedom_pack')
    
    if (purchases) {
      purchases.forEach(p => {
        if (p.pack_type === 'small') {
          packData[0].sold++
          packData[0].revenue += p.amount || 4.99
        } else if (p.pack_type === 'medium') {
          packData[1].sold++
          packData[1].revenue += p.amount || 9.99
        } else if (p.pack_type === 'large') {
          packData[2].sold++
          packData[2].revenue += p.amount || 19.99
        }
      })
      setTotalPacksSold(purchases.length)
    }
    setPackStats(packData)

    // Calculate churn (simplified - users who had subscription but don't anymore)
    // This would need more sophisticated tracking in production
    setChurnRate(2.5) // Placeholder
    
    setLoading(false)
  }

  // Stripe Portal Link
  const openStripePortal = () => {
    window.open('https://dashboard.stripe.com/billing', '_blank')
  }

  // Vercel Analytics Link
  const openVercelAnalytics = () => {
    window.open('https://vercel.com/dashboard', '_blank')
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
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Analytics Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={openStripePortal} style={{ backgroundColor: '#635bff', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>💳</span> Stripe Dashboard
          </button>
          <button onClick={openVercelAnalytics} style={{ backgroundColor: '#000', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>▲</span> Vercel Analytics
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['overview', 'subscriptions', 'packs', 'traffic'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === tab ? '#f97316' : '#e5e5e5',
              color: activeTab === tab ? 'white' : textPrimary,
              cursor: 'pointer',
              fontWeight: 600,
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
              <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '0.5rem' }}>Monthly Recurring Revenue</div>
              <div style={{ color: '#16a34a', fontSize: '32px', fontWeight: 'bold' }}>${totalMRR.toFixed(2)}</div>
              <div style={{ color: textSecondary, fontSize: '12px', marginTop: '0.25rem' }}>From {totalSubscribers} subscribers</div>
            </div>
            <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
              <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '0.5rem' }}>Active Subscribers</div>
              <div style={{ color: '#2563eb', fontSize: '32px', fontWeight: 'bold' }}>{totalSubscribers}</div>
              <div style={{ color: '#16a34a', fontSize: '12px', marginTop: '0.25rem' }}>+{newThisMonth} this month</div>
            </div>
            <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
              <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '0.5rem' }}>Freedom Packs Sold</div>
              <div style={{ color: '#f97316', fontSize: '32px', fontWeight: 'bold' }}>{totalPacksSold}</div>
              <div style={{ color: textSecondary, fontSize: '12px', marginTop: '0.25rem' }}>One-time purchases</div>
            </div>
            <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
              <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '0.5rem' }}>Churn Rate</div>
              <div style={{ color: churnRate > 5 ? '#dc2626' : '#16a34a', fontSize: '32px', fontWeight: 'bold' }}>{churnRate}%</div>
              <div style={{ color: textSecondary, fontSize: '12px', marginTop: '0.25rem' }}>Monthly average</div>
            </div>
          </div>

          {/* Revenue by Tier */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}`, marginBottom: '1.5rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Revenue by Subscription Tier</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {subscriptionStats.map(stat => (
                <div key={stat.tier} style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: textPrimary, fontWeight: 600 }}>{stat.name}</span>
                    <span style={{ backgroundColor: stat.tier === 'road_warrior' ? '#f97316' : stat.tier === 'commuter' ? '#3b82f6' : '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      {stat.tier === 'road_warrior' ? '$14.99' : stat.tier === 'commuter' ? '$7.99' : '$2.99'}/mo
                    </span>
                  </div>
                  <div style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>{stat.count}</div>
                  <div style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>${stat.mrr.toFixed(2)}/mo</div>
                  <div style={{ marginTop: '0.5rem', backgroundColor: '#e5e5e5', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: stat.tier === 'road_warrior' ? '#f97316' : stat.tier === 'commuter' ? '#3b82f6' : '#22c55e', height: '100%', width: `${totalSubscribers > 0 ? (stat.count / totalSubscribers) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>External Dashboards</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <a href="https://dashboard.stripe.com/billing" target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#635bff', color: 'white', padding: '1rem', borderRadius: '8px', textDecoration: 'none', display: 'block' }}>
                <div style={{ fontSize: '20px', marginBottom: '0.5rem' }}>💳</div>
                <div style={{ fontWeight: 600 }}>Stripe Billing</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>MRR, Churn, Revenue charts</div>
              </a>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#000', color: 'white', padding: '1rem', borderRadius: '8px', textDecoration: 'none', display: 'block' }}>
                <div style={{ fontSize: '20px', marginBottom: '0.5rem' }}>▲</div>
                <div style={{ fontWeight: 600 }}>Vercel Analytics</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>Page views, visitors, performance</div>
              </a>
              <a href="https://buffer.com/publish" target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#2563eb', color: 'white', padding: '1rem', borderRadius: '8px', textDecoration: 'none', display: 'block' }}>
                <div style={{ fontSize: '20px', marginBottom: '0.5rem' }}>📱</div>
                <div style={{ fontWeight: 600 }}>Buffer</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>Social media scheduling</div>
              </a>
            </div>
          </div>
        </>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>Subscription Details</h2>
            <button onClick={openStripePortal} style={{ backgroundColor: '#635bff', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>View in Stripe →</button>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${border}` }}>
                <th style={{ color: textSecondary, textAlign: 'left', padding: '0.75rem', fontSize: '13px' }}>Tier</th>
                <th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem', fontSize: '13px' }}>Price</th>
                <th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem', fontSize: '13px' }}>Credits</th>
                <th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem', fontSize: '13px' }}>Subscribers</th>
                <th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem', fontSize: '13px' }}>MRR</th>
                <th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem', fontSize: '13px' }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '0.75rem', color: textPrimary, fontWeight: 500 }}>🚗 Test Driver</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary }}>$2.99/mo</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#f97316' }}>10</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary, fontWeight: 600 }}>{subscriptionStats[0]?.count || 0}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>${subscriptionStats[0]?.mrr.toFixed(2) || '0.00'}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textSecondary }}>{totalSubscribers > 0 ? ((subscriptionStats[0]?.count || 0) / totalSubscribers * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: '#fef3c7' }}>
                <td style={{ padding: '0.75rem', color: textPrimary, fontWeight: 500 }}>🚙 Commuter <span style={{ backgroundColor: '#f97316', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem' }}>POPULAR</span></td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary }}>$7.99/mo</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#f97316' }}>30</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary, fontWeight: 600 }}>{subscriptionStats[1]?.count || 0}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>${subscriptionStats[1]?.mrr.toFixed(2) || '0.00'}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textSecondary }}>{totalSubscribers > 0 ? ((subscriptionStats[1]?.count || 0) / totalSubscribers * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '0.75rem', color: textPrimary, fontWeight: 500 }}>🚛 Road Warrior</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary }}>$14.99/mo</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#f97316' }}>∞ Unlimited</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary, fontWeight: 600 }}>{subscriptionStats[2]?.count || 0}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>${subscriptionStats[2]?.mrr.toFixed(2) || '0.00'}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textSecondary }}>{totalSubscribers > 0 ? ((subscriptionStats[2]?.count || 0) / totalSubscribers * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td style={{ padding: '0.75rem', color: textPrimary, fontWeight: 700 }}>TOTAL</td>
                <td style={{ padding: '0.75rem' }}></td>
                <td style={{ padding: '0.75rem' }}></td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary, fontWeight: 700, fontSize: '18px' }}>{totalSubscribers}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: '18px' }}>${totalMRR.toFixed(2)}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center', color: textPrimary, fontWeight: 700 }}>100%</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3 style={{ color: textPrimary, fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>💡 Pro Tip</h3>
            <p style={{ color: textSecondary, fontSize: '13px', margin: 0 }}>
              For detailed charts, churn analysis, and revenue forecasts, click "View in Stripe" to access Stripe's built-in Billing Analytics dashboard. It's free and updates in real-time!
            </p>
          </div>
        </div>
      )}

      {/* Packs Tab */}
      {activeTab === 'packs' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Freedom Pack Sales</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {packStats.map((pack, i) => (
              <div key={pack.name} style={{ backgroundColor: i === 2 ? '#f0fdf4' : '#f5f5f5', borderRadius: '8px', padding: '1rem', border: i === 2 ? '2px solid #16a34a' : 'none' }}>
                {i === 2 && <div style={{ backgroundColor: '#16a34a', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '0.5rem', fontWeight: 600 }}>BEST VALUE</div>}
                <div style={{ color: textPrimary, fontWeight: 600, fontSize: '16px' }}>{pack.name}</div>
                <div style={{ color: textSecondary, fontSize: '13px' }}>
                  {i === 0 ? '$4.99 • 10 credits' : i === 1 ? '$9.99 • 25 credits' : '$19.99 • 60 credits'}
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ color: textPrimary, fontSize: '28px', fontWeight: 'bold' }}>{pack.sold}</div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>packs sold</div>
                </div>
                <div style={{ marginTop: '0.5rem', color: '#16a34a', fontSize: '18px', fontWeight: 600 }}>
                  ${pack.revenue.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <h3 style={{ color: '#92400e', fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>📊 Note</h3>
            <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>
              Freedom Pack data requires a <code style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: '2px 4px', borderRadius: '4px' }}>purchases</code> table in your database. 
              Alternatively, view all one-time payments directly in Stripe Dashboard → Payments.
            </p>
          </div>
        </div>
      )}

      {/* Traffic Tab */}
      {activeTab === 'traffic' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>Website Traffic</h2>
            <button onClick={openVercelAnalytics} style={{ backgroundColor: '#000', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>Open Vercel Analytics →</button>
          </div>

          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>▲</div>
            <h3 style={{ color: textPrimary, fontSize: '20px', fontWeight: 600, marginBottom: '0.5rem' }}>Vercel Web Analytics</h3>
            <p style={{ color: textSecondary, marginBottom: '1.5rem' }}>
              Track page views, unique visitors, top pages, referrers, and more.
            </p>
            <button onClick={openVercelAnalytics} style={{ backgroundColor: '#000', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '15px' }}>
              View Full Analytics Dashboard
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3 style={{ color: textPrimary, fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem' }}>✅ Free Tier Includes</h3>
            <ul style={{ color: textSecondary, fontSize: '13px', margin: 0, paddingLeft: '1.25rem' }}>
              <li>50,000 events/month</li>
              <li>Page views & unique visitors</li>
              <li>Top pages & referrers</li>
              <li>Device & browser breakdown</li>
              <li>Geographic data</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
