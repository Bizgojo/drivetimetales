'use client'

import { useState, useEffect } from 'react'


interface ReferralModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  userName: string
}

export default function ReferralModal({ isOpen, onClose, userId, userName }: ReferralModalProps) {
  const [referralCode, setReferralCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && userId) {
      fetchReferralData()
    }
  }, [isOpen, userId])

  async function fetchReferralData() {
    setLoading(true)
    
    setError('')
    try {
      const response = await fetch('/api/user/invite', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setReferralCode(data.code)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load your link.') }
    finally { setLoading(false) }
  }

  const referralLink = typeof window === 'undefined' ? '' : `${window.location.origin}/signup?ref=${referralCode}`
  const shareText = `Join me on Endless Tales! Use my invitation link before signing up. After your first paid subscription payment, we’ll each get two free weeks: ${referralLink}`

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(referralLink); setCopied(true) } catch { setError('Copy the invitation link shown below.') }
    setTimeout(() => setCopied(false), 2000)
  }

  const shareViaSMS = () => {
    window.open(`sms:?body=${encodeURIComponent(shareText)}`, '_blank')
  }

  const shareViaEmail = () => {
    const subject = `${userName} invited you to Endless Tales`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText)}`, '_blank')
  }

  if (!isOpen) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Invite a Friend" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '360px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>🎁 Invite a Friend</span>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        {/* Description */}
        <p style={{ color: '#fff', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Share your personal link. After your friend’s first paid subscription payment, you both receive 14 free days. Free signups and trial payments do not qualify.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '30px', height: '30px', border: '3px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          </div>
        ) : !referralCode ? <div><p role="alert">{error}</p><button onClick={fetchReferralData}>Try Again</button></div> : (
          <>
            {/* Referral Code */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: '12px', marginBottom: '0.25rem' }}>Your Referral Code</div>
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

            <label style={{ display: 'block', color: 'white', fontSize: 13 }}>Your invitation link<input readOnly value={referralLink} onFocus={e => e.target.select()} style={{ width: '100%', color: 'white', background: '#0f172a', padding: 10, marginTop: 6, borderRadius: 8 }} /></label>
            {error && <p role="alert">{error}</p>}

          </>
        )}

        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    </div>
  )
}
