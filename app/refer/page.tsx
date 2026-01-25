'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ReferralStats {
  invited: number
  signed_up: number
  subscribed: number
  rewarded: number
}

export default function ReferPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [referralCode, setReferralCode] = useState('')
  const [userName, setUserName] = useState('Friend')
  const [stats, setStats] = useState<ReferralStats>({ invited: 0, signed_up: 0, subscribed: 0, rewarded: 0 })
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) {
      fetchReferralData()
    }
  }, [user])

  async function fetchReferralData() {
    setLoading(true)
    
    // Get user data and referral code
    const { data: userData } = await supabase
      .from('users')
      .select('referral_code, first_name, display_name')
      .eq('id', user?.id)
      .single()
    
    if (userData) {
      setUserName(userData.first_name || userData.display_name || 'Friend')
      
      if (userData.referral_code) {
        setReferralCode(userData.referral_code)
      } else {
        // Generate code if none exists
        const name = userData.first_name || userData.display_name || 'USER'
        const newCode = name.substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase()
        await supabase.from('users').update({ referral_code: newCode }).eq('id', user?.id)
        setReferralCode(newCode)
      }
    }

    // Get referral stats
    const { data: referrals } = await supabase
      .from('referrals')
      .select('status')
      .eq('referrer_id', user?.id)

    if (referrals) {
      const newStats = { invited: 0, signed_up: 0, subscribed: 0, rewarded: 0 }
      referrals.forEach(r => {
        if (r.status === 'invited') newStats.invited++
        if (r.status === 'signed_up') newStats.signed_up++
        if (r.status === 'subscribed') newStats.subscribed++
        if (r.status === 'rewarded') newStats.rewarded++
      })
      setStats(newStats)
    }

    setLoading(false)
  }

  const referralLink = `https://drivetimetales.vercel.app/signup?ref=${referralCode}`
  const shareText = `Join me on Drive Time Tales! Audio stories for your commute. Use my link to sign up and we both get 1 month free when you subscribe: ${referralLink}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareViaSMS = () => {
    window.open(`sms:?body=${encodeURIComponent(shareText)}`, '_blank')
  }

  const shareViaEmail = () => {
    const subject = `${userName} invited you to Drive Time Tales`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText)}`, '_blank')
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
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/home')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '18px' }}>🚗</span>
            <span style={{ fontSize: '18px' }}>🚙</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
            <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
          </div>
          <div onClick={() => router.push('/account')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '1.5rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '0.5rem' }}>❤️</div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '0.5rem' }}>Help a Friend</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>
            Share your link with friends. When they subscribe, you <strong style={{ color: '#22c55e' }}>both</strong> get 1 month free!
          </p>
        </div>

        {/* Referral Code */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.25rem' }}>Your Referral Code</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: 'bold', letterSpacing: '3px' }}>{referralCode}</div>
        </div>

        {/* Share Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={copyLink} style={{ backgroundColor: copied ? '#22c55e' : '#334155', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
          <button onClick={shareViaSMS} style={{ backgroundColor: '#22c55e', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            💬 Text a Friend
          </button>
          <button onClick={shareViaEmail} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            ✉️ Send Email
          </button>
        </div>

        {/* Stats */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.75rem', textAlign: 'center' }}>Your Referral Stats</div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{stats.invited + stats.signed_up}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Pending</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 'bold' }}>{stats.rewarded}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Rewarded</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#f97316', fontSize: '24px', fontWeight: 'bold' }}>{stats.rewarded}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Months Free</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
