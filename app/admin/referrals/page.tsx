'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Offer {
  id: string
  name: string
  description: string
  offer_type: 'free_days' | 'credits'
  referrer_reward: number
  referred_reward: number
  is_default: boolean
  is_active: boolean
  created_at: string
}

interface OfferStats {
  offer_id: string
  offer_name: string
  offer_type: string
  referrer_reward: number
  referred_reward: number
  total_referrals: number
  total_opened: number
  total_signed_up: number
  total_subscribed: number
  total_rewarded: number
  open_rate: number
  signup_rate: number
  subscribe_rate: number
}

interface PlatformStats {
  total_users_with_codes: number
  users_who_referred: number
  pct_users_referring: number
  total_referrals_sent: number
  total_opened: number
  total_signed_up: number
  total_subscribed: number
  total_rewarded: number
}

export default function AdminReferralsPage() {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [offerStats, setOfferStats] = useState<OfferStats[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newOffer, setNewOffer] = useState({ name: '', description: '', offer_type: 'free_days', referrer_reward: 14, referred_reward: 14 })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    
    const { data: offersData } = await supabase.from('referral_offers').select('*').order('created_at', { ascending: false })
    if (offersData) setOffers(offersData)

    const { data: statsData } = await supabase.from('referral_stats_by_offer').select('*')
    if (statsData) setOfferStats(statsData)

    const { data: platformData } = await supabase.from('referral_platform_stats').select('*').single()
    if (platformData) setPlatformStats(platformData)

    setLoading(false)
  }

  async function createOffer() {
    const { error } = await supabase.from('referral_offers').insert({
      name: newOffer.name,
      description: newOffer.description,
      offer_type: newOffer.offer_type,
      referrer_reward: newOffer.referrer_reward,
      referred_reward: newOffer.referred_reward
    })
    if (!error) {
      setShowCreateModal(false)
      setNewOffer({ name: '', description: '', offer_type: 'free_days', referrer_reward: 14, referred_reward: 14 })
      fetchData()
    }
  }

  async function setDefault(offerId: string) {
    await supabase.from('referral_offers').update({ is_default: false }).neq('id', offerId)
    await supabase.from('referral_offers').update({ is_default: true }).eq('id', offerId)
    fetchData()
  }

  async function toggleActive(offerId: string, currentState: boolean) {
    await supabase.from('referral_offers').update({ is_active: !currentState }).eq('id', offerId)
    fetchData()
  }

  function exportCSV() {
    const headers = ['Offer Name', 'Type', 'Referrer Reward', 'Referred Reward', 'Total Sent', 'Opened', 'Open Rate %', 'Signed Up', 'Signup Rate %', 'Subscribed', 'Subscribe Rate %', 'Rewarded']
    const rows = offerStats.map(s => [
      s.offer_name, s.offer_type, s.referrer_reward, s.referred_reward,
      s.total_referrals, s.total_opened, s.open_rate || 0,
      s.total_signed_up, s.signup_rate || 0,
      s.total_subscribed, s.subscribe_rate || 0, s.total_rewarded
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `referral-stats-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>← Back</button>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>Referral Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} style={{ backgroundColor: '#22c55e', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>📊 Export CSV</button>
          <button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ New Offer</button>
        </div>
      </div>

      {/* Platform Stats */}
      {platformStats && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Platform Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>Users with Codes</div>
              <div style={{ color: 'white', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_users_with_codes}</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>Users Who Referred</div>
              <div style={{ color: '#3b82f6', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.users_who_referred}</div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>{platformStats.pct_users_referring || 0}% of users</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>Total Referrals Sent</div>
              <div style={{ color: 'white', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_referrals_sent}</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>Total Rewarded</div>
              <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_rewarded}</div>
            </div>
          </div>
          {/* Funnel */}
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_referrals_sent}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Sent</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_opened}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Opened</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{platformStats.total_referrals_sent > 0 ? Math.round(platformStats.total_opened / platformStats.total_referrals_sent * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_signed_up}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Signed Up</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{platformStats.total_opened > 0 ? Math.round(platformStats.total_signed_up / platformStats.total_opened * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_subscribed}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Subscribed</div>
              <div style={{ color: '#f97316', fontSize: '10px' }}>{platformStats.total_signed_up > 0 ? Math.round(platformStats.total_subscribed / platformStats.total_signed_up * 100) : 0}%</div>
            </div>
            <div style={{ color: '#475569' }}>→</div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_rewarded}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Rewarded</div>
            </div>
          </div>
        </div>
      )}

      {/* A/B Test Comparison Table */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>A/B Test Comparison</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ color: '#94a3b8', textAlign: 'left', padding: '0.75rem 0.5rem' }}>Offer</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Type</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Reward</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Sent</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Opened</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Open %</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Signed Up</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Signup %</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Subscribed</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Sub %</th>
                <th style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Rewarded</th>
              </tr>
            </thead>
            <tbody>
              {offerStats.map(stat => (
                <tr key={stat.offer_id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ color: 'white', padding: '0.75rem 0.5rem', fontWeight: 500 }}>{stat.offer_name}</td>
                  <td style={{ color: '#94a3b8', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.offer_type === 'free_days' ? '📅 Days' : '🎫 Credits'}</td>
                  <td style={{ color: '#f97316', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.referrer_reward}/{stat.referred_reward}</td>
                  <td style={{ color: 'white', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_referrals}</td>
                  <td style={{ color: 'white', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_opened}</td>
                  <td style={{ color: stat.open_rate > 50 ? '#22c55e' : '#f97316', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.open_rate || 0}%</td>
                  <td style={{ color: 'white', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_signed_up}</td>
                  <td style={{ color: stat.signup_rate > 30 ? '#22c55e' : '#f97316', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.signup_rate || 0}%</td>
                  <td style={{ color: 'white', textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_subscribed}</td>
                  <td style={{ color: stat.subscribe_rate > 20 ? '#22c55e' : '#f97316', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.subscribe_rate || 0}%</td>
                  <td style={{ color: '#22c55e', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.total_rewarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Offers List */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem' }}>
        <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Manage Offers</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {offers.map(offer => (
            <div key={offer.id} style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: offer.is_default ? '2px solid #22c55e' : '2px solid transparent' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'white', fontWeight: 600 }}>{offer.name}</span>
                  {offer.is_default && <span style={{ backgroundColor: '#22c55e', color: 'black', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>DEFAULT</span>}
                  {!offer.is_active && <span style={{ backgroundColor: '#dc2626', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>INACTIVE</span>}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '0.25rem' }}>
                  {offer.offer_type === 'free_days' ? `${offer.referrer_reward} days free` : `${offer.referrer_reward} credits`} each
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!offer.is_default && (
                  <button onClick={() => setDefault(offer.id)} style={{ backgroundColor: '#334155', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Set Default</button>
                )}
                <button onClick={() => toggleActive(offer.id, offer.is_active)} style={{ backgroundColor: offer.is_active ? '#dc2626' : '#22c55e', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                  {offer.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', margin: '1rem' }}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem' }}>Create New Offer</h2>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Offer Name</label>
              <input type="text" value={newOffer.name} onChange={(e) => setNewOffer({...newOffer, name: e.target.value})} placeholder="e.g., 2 Weeks Free" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Description</label>
              <input type="text" value={newOffer.description} onChange={(e) => setNewOffer({...newOffer, description: e.target.value})} placeholder="Both get 2 weeks free" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Reward Type</label>
              <select value={newOffer.offer_type} onChange={(e) => setNewOffer({...newOffer, offer_type: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' }}>
                <option value="free_days">Free Days</option>
                <option value="credits">Credits</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Referrer Reward</label>
                <input type="number" value={newOffer.referrer_reward} onChange={(e) => setNewOffer({...newOffer, referrer_reward: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Referred Reward</label>
                <input type="number" value={newOffer.referred_reward} onChange={(e) => setNewOffer({...newOffer, referred_reward: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#334155', color: 'white', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createOffer} disabled={!newOffer.name} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: newOffer.name ? '#f97316' : '#334155', color: 'white', fontSize: '14px', cursor: newOffer.name ? 'pointer' : 'not-allowed', fontWeight: 600 }}>Create Offer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
