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

  if (!isOpen) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Invite a Friend" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '1.5rem', maxWidth: '360px', width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>🎁 Invite a Friend</span>
          <button aria-label="Close and return to Fun Facts" onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        {/* Description */}
        <p style={{ color: '#fff', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Your friend can try Endless Tales free for 14 days without a card. After their first paid subscription payment, you both receive 14 bonus days.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '30px', height: '30px', border: '3px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          </div>
        ) : !referralCode ? <div><p role="alert">{error}</p><button onClick={fetchReferralData}>Try Again</button></div> : (
          <>
            <div className="flex flex-col gap-4">
              <a href="/refer?mode=qr" className="block rounded-xl bg-orange-500 text-black p-4 font-bold">1. My friend is here — show QR code</a>
              <a href="/refer?mode=share" className="block rounded-xl bg-blue-500 text-white p-4 font-bold">2. My friend is elsewhere — send invitation</a>
            </div>
            {error && <p role="alert">{error}</p>}

          </>
        )}

        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    </div>
  )
}
