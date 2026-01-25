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
  weight: number
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

interface UserAssignment {
  id: string
  email: string
  first_name: string
  display_name: string
  referral_code: string
  default_offer_id: string | null
  offer_name: string | null
  offer_type: string | null
  referrer_reward: number | null
  total_referrals: number
  rewarded_referrals: number
}

export default function AdminReferralsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'offers' | 'users'>('overview')
  const [offers, setOffers] = useState<Offer[]>([])
  const [offerStats, setOfferStats] = useState<OfferStats[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [users, setUsers] = useState<UserAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserAssignment | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [newOffer, setNewOffer] = useState({ name: '', description: '', offer_type: 'free_days', referrer_reward: 14, referred_reward: 14, weight: 100 })

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'
  const inputBg = '#FFFFFF'

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: offersData } = await supabase.from('referral_offers').select('*').order('created_at', { ascending: false })
    if (offersData) setOffers(offersData)
    const { data: statsData } = await supabase.from('referral_stats_by_offer').select('*')
    if (statsData) setOfferStats(statsData)
    const { data: platformData } = await supabase.from('referral_platform_stats').select('*').single()
    if (platformData) setPlatformStats(platformData)
    const { data: usersData } = await supabase.from('user_offer_assignments').select('*')
    if (usersData) setUsers(usersData)
    setLoading(false)
  }

  async function createOffer() {
    await supabase.from('referral_offers').insert({ name: newOffer.name, description: newOffer.description, offer_type: newOffer.offer_type, referrer_reward: newOffer.referrer_reward, referred_reward: newOffer.referred_reward, weight: newOffer.weight })
    setShowCreateModal(false)
    setNewOffer({ name: '', description: '', offer_type: 'free_days', referrer_reward: 14, referred_reward: 14, weight: 100 })
    fetchData()
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

  async function updateWeight(offerId: string, weight: number) {
    await supabase.from('referral_offers').update({ weight }).eq('id', offerId)
    fetchData()
  }

  async function assignOfferToUser(userId: string, offerId: string | null) {
    await supabase.from('users').update({ default_offer_id: offerId }).eq('id', userId)
    setShowAssignModal(false)
    setSelectedUser(null)
    fetchData()
  }

  async function bulkAssignRandom() {
    const unassigned = users.filter(u => !u.default_offer_id)
    const activeOffers = offers.filter(o => o.is_active)
    if (activeOffers.length === 0) return

    const totalWeight = activeOffers.reduce((sum, o) => sum + (o.weight || 100), 0)
    
    for (const user of unassigned) {
      let random = Math.random() * totalWeight
      let selected = activeOffers[0]
      for (const offer of activeOffers) {
        random -= (offer.weight || 100)
        if (random <= 0) { selected = offer; break }
      }
      await supabase.from('users').update({ default_offer_id: selected.id }).eq('id', user.id)
    }
    fetchData()
  }

  function exportCSV() {
    const headers = ['Offer Name', 'Type', 'Referrer Reward', 'Referred Reward', 'Weight', 'Total Sent', 'Opened', 'Open Rate %', 'Signed Up', 'Signup Rate %', 'Subscribed', 'Subscribe Rate %', 'Rewarded']
    const rows = offerStats.map(s => {
      const offer = offers.find(o => o.id === s.offer_id)
      return [s.offer_name, s.offer_type, s.referrer_reward, s.referred_reward, offer?.weight || 100, s.total_referrals, s.total_opened, s.open_rate || 0, s.total_signed_up, s.signup_rate || 0, s.total_subscribed, s.subscribe_rate || 0, s.total_rewarded]
    })
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'referral-stats-' + new Date().toISOString().split('T')[0] + '.csv'; a.click()
  }

  const totalWeight = offers.filter(o => o.is_active).reduce((sum, o) => sum + (o.weight || 100), 0)
  const filteredUsers = users.filter(u => 
    userSearch === '' || 
    u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.referral_code?.toLowerCase().includes(userSearch.toLowerCase())
  )

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Referral Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} style={{ backgroundColor: '#22c55e', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>📊 Export CSV</button>
          <button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ New Offer</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setActiveTab('overview')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'overview' ? '#f97316' : '#e5e5e5', color: activeTab === 'overview' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>Overview</button>
        <button onClick={() => setActiveTab('offers')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'offers' ? '#f97316' : '#e5e5e5', color: activeTab === 'offers' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>Offers & Weights</button>
        <button onClick={() => setActiveTab('users')} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', backgroundColor: activeTab === 'users' ? '#f97316' : '#e5e5e5', color: activeTab === 'users' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>User Assignments</button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {platformStats && (
            <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', border: `1px solid ${border}` }}>
              <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>Platform Overview</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}><div style={{ color: textSecondary, fontSize: '12px' }}>Users with Codes</div><div style={{ color: textPrimary, fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_users_with_codes}</div></div>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}><div style={{ color: textSecondary, fontSize: '12px' }}>Users Who Referred</div><div style={{ color: '#2563eb', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.users_who_referred}</div><div style={{ color: textSecondary, fontSize: '12px' }}>{platformStats.pct_users_referring || 0}% of users</div></div>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}><div style={{ color: textSecondary, fontSize: '12px' }}>Total Referrals Sent</div><div style={{ color: textPrimary, fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_referrals_sent}</div></div>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}><div style={{ color: textSecondary, fontSize: '12px' }}>Total Rewarded</div><div style={{ color: '#16a34a', fontSize: '28px', fontWeight: 'bold' }}>{platformStats.total_rewarded}</div></div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ textAlign: 'center', flex: 1 }}><div style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_referrals_sent}</div><div style={{ color: textSecondary, fontSize: '11px' }}>Sent</div></div>
                <div style={{ color: '#999' }}>→</div>
                <div style={{ textAlign: 'center', flex: 1 }}><div style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_opened}</div><div style={{ color: textSecondary, fontSize: '11px' }}>Opened</div><div style={{ color: '#ea580c', fontSize: '10px', fontWeight: 600 }}>{platformStats.total_referrals_sent > 0 ? Math.round(platformStats.total_opened / platformStats.total_referrals_sent * 100) : 0}%</div></div>
                <div style={{ color: '#999' }}>→</div>
                <div style={{ textAlign: 'center', flex: 1 }}><div style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_signed_up}</div><div style={{ color: textSecondary, fontSize: '11px' }}>Signed Up</div><div style={{ color: '#ea580c', fontSize: '10px', fontWeight: 600 }}>{platformStats.total_opened > 0 ? Math.round(platformStats.total_signed_up / platformStats.total_opened * 100) : 0}%</div></div>
                <div style={{ color: '#999' }}>→</div>
                <div style={{ textAlign: 'center', flex: 1 }}><div style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_subscribed}</div><div style={{ color: textSecondary, fontSize: '11px' }}>Subscribed</div><div style={{ color: '#ea580c', fontSize: '10px', fontWeight: 600 }}>{platformStats.total_signed_up > 0 ? Math.round(platformStats.total_subscribed / platformStats.total_signed_up * 100) : 0}%</div></div>
                <div style={{ color: '#999' }}>→</div>
                <div style={{ textAlign: 'center', flex: 1 }}><div style={{ color: '#16a34a', fontSize: '20px', fontWeight: 'bold' }}>{platformStats.total_rewarded}</div><div style={{ color: textSecondary, fontSize: '11px' }}>Rewarded</div></div>
              </div>
            </div>
          )}

          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}>A/B Test Comparison</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: `2px solid ${border}` }}><th style={{ color: textSecondary, textAlign: 'left', padding: '0.75rem 0.5rem' }}>Offer</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Type</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Reward</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Weight</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Sent</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Opened</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Open %</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Signed Up</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Signup %</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Subscribed</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Sub %</th><th style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>Rewarded</th></tr></thead>
                <tbody>{offerStats.map((stat, i) => { const offer = offers.find(o => o.id === stat.offer_id); return (<tr key={stat.offer_id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: i % 2 === 0 ? 'transparent' : '#fafafa' }}><td style={{ color: textPrimary, padding: '0.75rem 0.5rem', fontWeight: 500 }}>{stat.offer_name}</td><td style={{ color: textSecondary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.offer_type === 'free_days' ? '📅 Days' : '🎫 Credits'}</td><td style={{ color: '#ea580c', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.referrer_reward}/{stat.referred_reward}</td><td style={{ color: textPrimary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{offer?.weight || 100}{totalWeight > 0 && <span style={{ color: textSecondary, fontSize: '10px' }}> ({Math.round((offer?.weight || 100) / totalWeight * 100)}%)</span>}</td><td style={{ color: textPrimary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_referrals}</td><td style={{ color: textPrimary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_opened}</td><td style={{ color: stat.open_rate > 50 ? '#16a34a' : '#ea580c', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.open_rate || 0}%</td><td style={{ color: textPrimary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_signed_up}</td><td style={{ color: stat.signup_rate > 30 ? '#16a34a' : '#ea580c', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.signup_rate || 0}%</td><td style={{ color: textPrimary, textAlign: 'center', padding: '0.75rem 0.5rem' }}>{stat.total_subscribed}</td><td style={{ color: stat.subscribe_rate > 20 ? '#16a34a' : '#ea580c', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.subscribe_rate || 0}%</td><td style={{ color: '#16a34a', textAlign: 'center', padding: '0.75rem 0.5rem', fontWeight: 600 }}>{stat.total_rewarded}</td></tr>)})}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Offers Tab */}
      {activeTab === 'offers' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>Manage Offers & A/B Weights</h2>
            <div style={{ color: textSecondary, fontSize: '13px' }}>Total Weight: {totalWeight} (100%)</div>
          </div>
          <p style={{ color: textSecondary, fontSize: '13px', marginBottom: '1rem' }}>Set weights to control random assignment probability. Higher weight = more users get this offer.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {offers.map(offer => (
              <div key={offer.id} style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '1rem', border: offer.is_default ? '2px solid #16a34a' : `1px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: textPrimary, fontWeight: 600 }}>{offer.name}</span>
                      {offer.is_default && <span style={{ backgroundColor: '#16a34a', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>DEFAULT</span>}
                      {!offer.is_active && <span style={{ backgroundColor: '#dc2626', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>INACTIVE</span>}
                    </div>
                    <div style={{ color: textSecondary, fontSize: '13px', marginTop: '0.25rem' }}>{offer.offer_type === 'free_days' ? offer.referrer_reward + ' days free' : offer.referrer_reward + ' credits'} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ color: textSecondary, fontSize: '12px' }}>Weight:</label>
                      <input type="number" value={offer.weight || 100} onChange={(e) => updateWeight(offer.id, parseInt(e.target.value) || 0)} min="0" max="1000" style={{ width: '70px', padding: '0.4rem', borderRadius: '6px', border: `1px solid ${border}`, textAlign: 'center', color: textPrimary, backgroundColor: inputBg }} />
                      <span style={{ color: textSecondary, fontSize: '12px' }}>({totalWeight > 0 ? Math.round((offer.weight || 100) / totalWeight * 100) : 0}%)</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {!offer.is_default && <button onClick={() => setDefault(offer.id)} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Set Default</button>}
                      <button onClick={() => toggleActive(offer.id, offer.is_active)} style={{ backgroundColor: offer.is_active ? '#dc2626' : '#16a34a', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{offer.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1.25rem', border: `1px solid ${border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>User Offer Assignments</h2>
            <button onClick={bulkAssignRandom} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>🎲 Randomly Assign Unassigned</button>
          </div>
          <p style={{ color: textSecondary, fontSize: '13px', marginBottom: '1rem' }}>Assign specific offers to users or let them be randomly assigned based on weights.</p>
          <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by email, name, or code..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, marginBottom: '1rem', color: textPrimary, backgroundColor: inputBg }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
            {filteredUsers.map(user => (
              <div key={user.id} style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: textPrimary, fontWeight: 500 }}>{user.first_name || user.display_name || 'Unknown'} <span style={{ color: textSecondary, fontWeight: 400 }}>({user.email})</span></div>
                  <div style={{ color: textSecondary, fontSize: '12px' }}>Code: {user.referral_code} • {user.total_referrals} referrals • {user.rewarded_referrals} rewarded</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ backgroundColor: user.offer_name ? '#dbeafe' : '#fef3c7', color: user.offer_name ? '#1e40af' : '#92400e', padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>{user.offer_name || 'Random (weighted)'}</span>
                  <button onClick={() => { setSelectedUser(user); setShowAssignModal(true) }} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Change</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Offer Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', margin: '1rem', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold', marginBottom: '1.5rem' }}>Create New Offer</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Offer Name</label>
              <input type="text" value={newOffer.name} onChange={(e) => setNewOffer({...newOffer, name: e.target.value})} placeholder="e.g., 2 Weeks Free" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Description</label>
              <input type="text" value={newOffer.description} onChange={(e) => setNewOffer({...newOffer, description: e.target.value})} placeholder="Both get 2 weeks free" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Reward Type</label>
              <select value={newOffer.offer_type} onChange={(e) => setNewOffer({...newOffer, offer_type: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }}>
                <option value="free_days">Free Days</option>
                <option value="credits">Credits</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Referrer Reward</label>
                <input type="number" value={newOffer.referrer_reward} onChange={(e) => setNewOffer({...newOffer, referrer_reward: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Referred Reward</label>
                <input type="number" value={newOffer.referred_reward} onChange={(e) => setNewOffer({...newOffer, referred_reward: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }} />
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: textSecondary, fontSize: '14px', display: 'block', marginBottom: '0.5rem' }}>Weight (for random assignment)</label>
              <input type="number" value={newOffer.weight} onChange={(e) => setNewOffer({...newOffer, weight: parseInt(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, color: textPrimary, backgroundColor: inputBg }} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#e5e5e5', color: textPrimary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={createOffer} disabled={!newOffer.name} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: newOffer.name ? '#f97316' : '#ccc', color: 'white', cursor: newOffer.name ? 'pointer' : 'not-allowed', fontWeight: 600 }}>Create Offer</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Offer Modal */}
      {showAssignModal && selectedUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', margin: '1rem', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: textPrimary, fontSize: '20px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Assign Offer</h2>
            <p style={{ color: textSecondary, fontSize: '14px', marginBottom: '1.5rem' }}>{selectedUser.first_name || selectedUser.display_name} ({selectedUser.email})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button onClick={() => assignOfferToUser(selectedUser.id, null)} style={{ padding: '1rem', borderRadius: '8px', border: selectedUser.default_offer_id === null ? '2px solid #f97316' : `1px solid ${border}`, backgroundColor: selectedUser.default_offer_id === null ? '#fff7ed' : '#f5f5f5', color: textPrimary, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>🎲 Random (weighted)</div>
                <div style={{ fontSize: '12px', color: textSecondary }}>Assigned based on offer weights</div>
              </button>
              {offers.filter(o => o.is_active).map(offer => (
                <button key={offer.id} onClick={() => assignOfferToUser(selectedUser.id, offer.id)} style={{ padding: '1rem', borderRadius: '8px', border: selectedUser.default_offer_id === offer.id ? '2px solid #f97316' : `1px solid ${border}`, backgroundColor: selectedUser.default_offer_id === offer.id ? '#fff7ed' : '#f5f5f5', color: textPrimary, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{offer.name}</div>
                  <div style={{ fontSize: '12px', color: textSecondary }}>{offer.offer_type === 'free_days' ? offer.referrer_reward + ' days' : offer.referrer_reward + ' credits'} each</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowAssignModal(false); setSelectedUser(null) }} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#e5e5e5', color: textPrimary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
