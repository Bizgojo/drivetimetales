'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Props {
  variant?: 'dark' | 'light'
  showCTA?: boolean
}

export default function FoundingMemberBanner({ variant = 'dark', showCTA = false }: Props) {
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/subscriber-count')
      .then(r => r.json())
      .then(d => { setSpotsLeft(d.spotsLeft); setLoading(false) })
      .catch(() => { setSpotsLeft(473); setLoading(false) })
  }, [])

  if (!loading && spotsLeft !== null && spotsLeft <= 0) return null

  const bg = variant === 'dark' ? '#1a0f00' : '#fff8f0'
  const textColor = variant === 'dark' ? 'white' : '#1a0f00'
  const subColor = variant === 'dark' ? 'rgba(240,236,228,0.7)' : '#7a5c2a'

  return (
    <div style={{ background: bg, border: '1px solid #f0a030', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f0a030', marginBottom: '4px' }}>
        🏆 Founding Member Price Lock
      </div>
      <div style={{ color: textColor, fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
        Lock in $7.99/mo forever
      </div>
      <div style={{ color: subColor, fontSize: '0.8rem', marginBottom: loading ? '0' : '8px' }}>
        {loading ? <span style={{ opacity: 0.5 }}>Checking availability...</span> : <>Only <strong style={{ color: '#f0a030' }}>{spotsLeft}</strong> of 500 founding spots remaining — price locked for life</>}
      </div>
      {!loading && spotsLeft !== null && (
        <div style={{ height: '4px', background: 'rgba(240,160,48,0.2)', borderRadius: '2px', margin: '8px 0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((500 - spotsLeft) / 500) * 100}%`, background: '#f0a030', borderRadius: '2px' }} />
        </div>
      )}
      {showCTA && (
        <Link href="/signup" style={{ display: 'inline-block', marginTop: '8px', background: '#f0a030', color: '#0a0a0f', padding: '10px 24px', borderRadius: '50px', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
          Claim Your Spot →
        </Link>
      )}
    </div>
  )
}
