'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Offer { id: string; name: string; description: string; offer_type: 'free_days' | 'credits'; referrer_reward: number; referred_reward: number; weight: number }
interface ReferralStats { total: number; opened: number; signed_up: number; subscribed: number; rewarded: number }
interface Referral { id: string; referred_email: string; status: string; created_at: string; opened_at: string | null }

export default function ReferPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [referralCode, setReferralCode] = useState('')
  const [userName, setUserName] = useState('Friend')
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null)
  const [stats, setStats] = useState<ReferralStats>({ total: 0, opened: 0, signed_up: 0, subscribed: 0, rewarded: 0 })
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user?.id) fetchReferralData() }, [user])

  async function fetchReferralData() {
    setLoading(true)
    const { data: userData } = await supabase.from('users').select('referral_code, first_name, display_name, default_offer_id').eq('id', user?.id).single()
    
    if (userData) {
      const firstName = userData.first_name || userData.display_name || 'Friend'
      setUserName(firstName)
      
      if (userData.referral_code) { 
        setReferralCode(userData.referral_code) 
      } else { 
        const rand3 = Math.random().toString(36).substring(2, 5).toUpperCase()
        const newCode = firstName + rand3
        await supabase.from('users').update({ referral_code: newCode }).eq('id', user?.id)
        setReferralCode(newCode) 
      }
      
      let offerId = userData.default_offer_id
      
      if (!offerId) {
        const { data: activeOffers } = await supabase.from('referral_offers').select('*').eq('is_active', true)
        
        if (activeOffers && activeOffers.length > 0) {
          const totalWeight = activeOffers.reduce((sum, o) => sum + (o.weight || 100), 0)
          let random = Math.random() * totalWeight
          
          for (const offer of activeOffers) {
            random -= (offer.weight || 100)
            if (random <= 0) {
              await supabase.from('users').update({ default_offer_id: offer.id }).eq('id', user?.id)
              setCurrentOffer(offer)
              break
            }
          }
          
          if (!currentOffer && activeOffers.length > 0) {
            await supabase.from('users').update({ default_offer_id: activeOffers[0].id }).eq('id', user?.id)
            setCurrentOffer(activeOffers[0])
          }
        } else {
          const { data: defaultOffer } = await supabase.from('referral_offers').select('*').eq('is_default', true).single()
          if (defaultOffer) {
            await supabase.from('users').update({ default_offer_id: defaultOffer.id }).eq('id', user?.id)
            setCurrentOffer(defaultOffer)
          }
        }
      } else {
        const { data: offerData } = await supabase.from('referral_offers').select('*').eq('id', offerId).single()
        if (offerData) setCurrentOffer(offerData)
      }
    }

    const { data: referralsData } = await supabase.from('referrals').select('id, referred_email, status, created_at, opened_at').eq('referrer_id', user?.id).order('created_at', { ascending: false })
    if (referralsData) {
      setReferrals(referralsData)
      const newStats = { total: 0, opened: 0, signed_up: 0, subscribed: 0, rewarded: 0 }
      referralsData.forEach(r => { newStats.total++; if (r.opened_at) newStats.opened++; if (['signed_up', 'subscribed', 'rewarded'].includes(r.status)) newStats.signed_up++; if (['subscribed', 'rewarded'].includes(r.status)) newStats.subscribed++; if (r.status === 'rewarded') newStats.rewarded++ })
      setStats(newStats)
    }
    setLoading(false)
  }

  const referralLink = 'https://drivetimetales.vercel.app/signup?ref=' + referralCode
  const rewardText = currentOffer ? (currentOffer.offer_type === 'free_days' ? currentOffer.referrer_reward + ' days free' : currentOffer.referrer_reward + ' credits') : '2 weeks free'
  const shareText = 'Join me on Drive Time Tales! Audio stories for your commute. Sign up with my link and we both get ' + rewardText + '!'
  const shareTextWithLink = shareText + ' ' + referralLink

  const copyLink = async () => { await navigator.clipboard.writeText(referralLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const shareViaSMS = () => { window.open('sms:?body=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaEmail = () => { window.open('mailto:?subject=' + encodeURIComponent(userName + ' invited you to Drive Time Tales') + '&body=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaWhatsApp = () => { window.open('https://wa.me/?text=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaTwitter = () => { window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(referralLink), '_blank') }
  const shareViaFacebook = () => { window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(referralLink) + '&quote=' + encodeURIComponent(shareText), '_blank') }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/home')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><span style={{ fontSize: '18px' }}>🚗</span><span style={{ fontSize: '18px' }}>🚙</span><span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span><span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span></div>
          <div onClick={() => router.push('/account')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span></div>
        </div>
      </div>
      
      <div style={{ padding: '1.5rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '0.5rem' }}>❤️</div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Help a Friend</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Share your link. When they subscribe, you <strong style={{ color: '#22c55e' }}>both</strong> get {rewardText}!</p>
        </div>
        
        {currentOffer && (<div style={{ backgroundColor: currentOffer.offer_type === 'free_days' ? '#3b82f6' : '#22c55e', borderRadius: '8px', padding: '0.5rem 1rem', marginBottom: '1rem', textAlign: 'center' }}><span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{currentOffer.offer_type === 'free_days' ? '📅' : '🎫'} {currentOffer.name}</span></div>)}
        
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.25rem' }}>Your Code</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: 'bold', letterSpacing: '2px' }}>{referralCode}</div>
        </div>
        
        {/* Copy Link Button */}
        <button onClick={copyLink} style={{ width: '100%', backgroundColor: copied ? '#22c55e' : '#f97316', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          {copied ? '✓ Link Copied!' : '🔗 Copy Referral Link'}
        </button>
        
        {/* Social Sharing Grid */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.75rem', textAlign: 'center' }}>Share via</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button onClick={shareViaWhatsApp} style={{ backgroundColor: '#25D366', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '20px' }}>💬</span>
              <span>WhatsApp</span>
            </button>
            <button onClick={shareViaTwitter} style={{ backgroundColor: '#1DA1F2', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '20px' }}>🐦</span>
              <span>Twitter</span>
            </button>
            <button onClick={shareViaFacebook} style={{ backgroundColor: '#4267B2', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '20px' }}>📘</span>
              <span>Facebook</span>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <button onClick={shareViaSMS} style={{ backgroundColor: '#22c55e', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span>📱</span> Text Message
            </button>
            <button onClick={shareViaEmail} style={{ backgroundColor: '#6366f1', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span>✉️</span> Email
            </button>
          </div>
        </div>
        
        {/* Stats */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.75rem', textAlign: 'center' }}>Your Referrals</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '1rem' }}>
            <div style={{ textAlign: 'center' }}><div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.total}</div><div style={{ color: '#94a3b8', fontSize: '11px' }}>Sent</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.opened}</div><div style={{ color: '#94a3b8', fontSize: '11px' }}>Opened</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.signed_up}</div><div style={{ color: '#94a3b8', fontSize: '11px' }}>Signed Up</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 'bold' }}>{stats.rewarded}</div><div style={{ color: '#94a3b8', fontSize: '11px' }}>Rewarded</div></div>
          </div>
          {stats.rewarded > 0 && currentOffer && (<div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}><div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>{currentOffer.offer_type === 'free_days' ? (stats.rewarded * currentOffer.referrer_reward) + ' days' : (stats.rewarded * currentOffer.referrer_reward) + ' credits'}</div><div style={{ color: '#94a3b8', fontSize: '11px' }}>Total Earned</div></div>)}
        </div>
        
        {/* Leaderboard Link */}
        <button onClick={() => router.push('/refer/leaderboard')} style={{ width: '100%', backgroundColor: '#334155', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          🏆 View Leaderboard
        </button>
        
        {/* Recent Activity */}
        {referrals.length > 0 && (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.75rem' }}>Recent Activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {referrals.slice(0, 5).map(ref => (
                <div key={ref.id} style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: 'white', fontSize: '13px' }}>{ref.referred_email || 'Pending...'}</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>{new Date(ref.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ backgroundColor: ref.status === 'rewarded' ? '#22c55e' : ref.status === 'subscribed' ? '#3b82f6' : ref.status === 'signed_up' ? '#f97316' : ref.opened_at ? '#eab308' : '#475569', color: ['rewarded', 'subscribed'].includes(ref.status) ? 'white' : 'black', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                    {ref.status === 'rewarded' ? '✓ REWARDED' : ref.status === 'subscribed' ? 'SUBSCRIBED' : ref.status === 'signed_up' ? 'SIGNED UP' : ref.opened_at ? 'OPENED' : 'SENT'}
                  </div>
                </div>
              ))}
            </div>
            {referrals.length > 5 && (
              <button onClick={() => router.push('/refer/dashboard')} style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                View All ({referrals.length}) →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
