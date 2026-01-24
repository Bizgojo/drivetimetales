'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ReferralModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  userName: string
}

interface ReferralStats {
  invited: number
  signed_up: number
  subscribed: number
  rewarded: number
}

export default function ReferralModal({ isOpen, onClose, userId, userName }: ReferralModalProps) {
  const [referralCode, setReferralCode] = useState('')
  const [stats, setStats] = useState<ReferralStats>({ invited: 0, signed_up: 0, subscribed: 0, rewarded: 0 })
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen && userId) {
      fetchReferralData()
    }
  }, [isOpen, userId])

  async function fetchReferralData() {
    setLoading(true)
    
    // Get user's referral code
    const { data: userData } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .single()
    
    if (userData?.referral_code) {
      setReferralCode(userData.referral_code)
    } else {
      // Generate code if none exists
      const newCode = userName.substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase()
      await supabase.from('users').update({ referral_code: newCode }).eq('id', userId)
      setReferralCode(newCode)
    }

    // Get referral stats
    const { data: referrals } = await supabase
      .from('referrals')
      .select('status')
      .eq('referrer_id', userId)

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

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '360px', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>❤️ Help a Friend</span>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        {/* Description */}
        <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Share your link with friends. When they subscribe, you <strong style={{ color: '#22c55e' }}>both</strong> get 1 month free!
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '30px', height: '30px', border: '3px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          </div>
        ) : (
          <>
            {/* Referral Code */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.25rem' }}>Your Referral Code</div>
              <div style={{ color: '#f97316', fontSize: '24px', fontWeight: 'bold', letterSpacing: '2px' }}>{referralCode}</div>
            </div>

            {/* Share Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button onClick={copyLink} style={{ backgroundColor: copied ? '#22c55e' : '#334155', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {copied ? '✓ Copied!' : '🔗 Copy Link'}
              </button>
              <button onClick={shareViaSMS} style={{ backgroundColor: '#22c55e', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                💬 Text a Friend
              </button>
              <button onClick={shareViaEmail} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                ✉️ Send Email
              </button>
            </div>

            {/* Stats */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.5rem', textAlign: 'center' }}>Your Referrals</div>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>{stats.invited + stats.signed_up}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>Pending</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>{stats.rewarded}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>Rewarded</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold' }}>{stats.rewarded}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>Months Free</div>
                </div>
              </div>
            </div>
          </>
        )}

        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    </div>
  )
}
