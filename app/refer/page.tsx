'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'

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
  const [facebookCopied, setFacebookCopied] = useState(false)
  const [twitterCopied, setTwitterCopied] = useState(false)
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

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://endless-tales.com').trim().replace(/\/+$/, '')
  const referralLink = baseUrl + '/welcome?ref=' + referralCode
  const rewardText = currentOffer ? (currentOffer.offer_type === 'free_days' ? currentOffer.referrer_reward + ' days free' : 'a referral reward') : '2 weeks free'
  const shareText = 'Hey! ' + userName + ' is giving you 2 weeks free on Endless Tales — audio stories for your commute, road trip, or downtime. ' + userName + ' says you\'ll love it! Click the link and you both get ' + rewardText + ':'
  const shareTextWithLink = shareText + ' ' + referralLink

  const copyLink = async () => { await navigator.clipboard.writeText(shareTextWithLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const shareViaSMS = () => { window.open('sms:?body=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaEmail = () => { window.open('mailto:?subject=' + encodeURIComponent(userName + ' is giving you 2 weeks free on Endless Tales!') + '&body=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaWhatsApp = () => { window.open('https://wa.me/?text=' + encodeURIComponent(shareTextWithLink), '_blank') }
  const shareViaTwitter = async () => { try { await navigator.clipboard.writeText(shareTextWithLink) } catch(e) {} setTwitterCopied(true); setTimeout(() => setTwitterCopied(false), 4000) }
  const shareViaFacebook = () => { window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(referralLink) + '&quote=' + encodeURIComponent(shareText), '_blank') }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <StickyHeaderFull />
      
      <div style={{ padding: '24px 16px', maxWidth: '400px', margin: '0 auto' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 900, lineHeight: 1.2, marginBottom: '10px' }}>
            Give 2 Weeks Free.<br /><span style={{ color: '#f97316' }}>Get 2 Weeks Free.</span>
          </h1>
          <p style={{ color: 'white', fontSize: '14px', lineHeight: 1.6 }}>Share with anyone. Every person who subscribes earns you both 14 free days.</p>
          <div style={{ color: '#f97316', fontSize: '13px', fontWeight: 700, marginTop: '8px' }}>♾️ No limit — the more you share, the more you earn!</div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>

          {/* Step 1 */}
          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f97316', color: 'white', fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'white', fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Copy your personal invite link</div>
              <button onClick={copyLink} style={{ width: '100%', background: copied ? '#22c55e' : '#f97316', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {copied ? '✓ Link Copied!' : '📋 Copy My Invite Link'}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ background: '#1e293b', borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f97316', color: 'white', fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>2</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'white', fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Open any messenger and paste the link</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={shareViaSMS} style={{ width: '100%', background: '#22c55e', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>📱 Text Message</button>
                <button onClick={shareViaEmail} style={{ width: '100%', background: '#6366f1', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>✉️ Email</button>
                <button onClick={shareViaFacebook} style={{ width: '100%', background: '#4267B2', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>📘 Facebook</button>
                <button onClick={shareViaTwitter} style={{ width: '100%', background: '#1DA1F2', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>🐦 Twitter / X</button>
                <button onClick={shareViaWhatsApp} style={{ width: '100%', background: '#25D366', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>💬 WhatsApp</button>
              </div>
            </div>
          </div>

        </div>

        {/* Stats - Free Days Earned */}
        <div style={{ background: '#1e293b', borderRadius: '16px', padding: '20px' }}>
          <div style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginBottom: '16px' }}>Your Free Days Earned</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 900 }}>{stats.rewarded * (currentOffer?.referrer_reward || 14)}</div>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>Days Earned</div>
            </div>
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 900 }}>{stats.rewarded}</div>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>Friends Referred</div>
            </div>
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 900 }}>{stats.opened}</div>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>Links Opened</div>
            </div>
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 900 }}>{stats.signed_up}</div>
              <div style={{ color: 'white', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>Subscribed</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
