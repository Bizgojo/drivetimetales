'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface WelcomeHeaderProps {
  credits: number
}

export default function WelcomeHeader({ credits }: WelcomeHeaderProps) {
  const router = useRouter()
  const [logoTapCount, setLogoTapCount] = useState(0)
  const [lastTapTime, setLastTapTime] = useState(0)
  const [showSecretInput, setShowSecretInput] = useState(false)
  const [secretCode, setSecretCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [codeMessage, setCodeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [carsFinished, setCarsFinished] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setCarsFinished(true)
    }, 30000)
    return () => clearTimeout(timer)
  }, [])

  const handleLogoTap = () => {
    const now = Date.now()
    if (now - lastTapTime > 1000) {
      setLogoTapCount(1)
    } else {
      setLogoTapCount(prev => prev + 1)
    }
    setLastTapTime(now)
    if (logoTapCount >= 4) {
      setShowSecretInput(true)
      setLogoTapCount(0)
    }
  }

  const handleCodeSubmit = async () => {
    if (!secretCode.trim()) return
    setIsSubmitting(true)
    setCodeMessage(null)
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', secretCode.toUpperCase().trim())
        .eq('is_active', true)
        .eq('is_redeemed', false)
        .single()
      if (error || !data) {
        setCodeMessage({ type: 'error', text: 'Invalid, expired, or already used code' })
        setIsSubmitting(false)
        return
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setCodeMessage({ type: 'error', text: 'This code has expired' })
        setIsSubmitting(false)
        return
      }
      const deviceId = localStorage.getItem('dtt_device_id') || crypto.randomUUID()
      localStorage.setItem('dtt_device_id', deviceId)
      const { error: updateError } = await supabase
        .from('promo_codes')
        .update({ 
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_by_device: deviceId
        })
        .eq('id', data.id)
      if (updateError) {
        setCodeMessage({ type: 'error', text: 'Error redeeming code. Please try again.' })
        setIsSubmitting(false)
        return
      }
      const subscriptionData = {
        code: data.code,
        type: data.subscription_type,
        days: data.subscription_days,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + data.subscription_days * 24 * 60 * 60 * 1000).toISOString(),
        deviceId: deviceId
      }
      localStorage.setItem('dtt_promo_subscription', JSON.stringify(subscriptionData))
      setCodeMessage({ type: 'success', text: 'Success! Redirecting to create your account...' })
      setTimeout(() => {
        setShowSecretInput(false)
        setSecretCode('')
        router.push('/register/promo')
      }, 1500)
    } catch (err) {
      setCodeMessage({ type: 'error', text: 'Error validating code. Please try again.' })
      setIsSubmitting(false)
    }
  }

  const keyframesStyle = `
    @keyframes driveLeft {
      0% { transform: translateX(100vw); }
      100% { transform: translateX(-100%); }
    }
  `

  return (
    <div style={{ textAlign: 'center', paddingTop: '1.5rem', paddingBottom: '0.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: keyframesStyle }} />

      <h1 className="text-2xl font-bold text-white" style={{ marginBottom: '0.5rem' }}>Welcome To</h1>
      
      <div 
        onClick={handleLogoTap}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '0.5rem', 
          marginBottom: '0.25rem',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '1.875rem' }}>🚛</span>
        <span style={{ fontSize: '1.875rem' }}>🚗</span>
        <span className="font-bold text-white" style={{ fontSize: '1.5rem', fontStyle: 'italic' }}>
          Drive Time <span className="text-orange-400">Tales</span>
        </span>
      </div>
      
      {!carsFinished && (
        <div style={{ position: 'relative', height: '2.5rem', overflow: 'hidden', marginBottom: '0.25rem' }}>
          <div style={{ position: 'absolute', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8rem', animation: 'driveLeft 15s linear 2' }}>
            <span style={{ fontSize: '2rem' }}>🛻</span>
            <span style={{ fontSize: '2rem' }}>🚕</span>
            <span style={{ fontSize: '2rem' }}>🚚</span>
            <span style={{ fontSize: '2rem' }}>🚙</span>
            <span style={{ fontSize: '2rem' }}>🚐</span>
            <span style={{ fontSize: '2rem' }}>🏎️</span>
          </div>
        </div>
      )}

      {showSecretInput && (
        <div style={{ background: '#1e293b', borderRadius: '0.75rem', padding: '1rem', margin: '0.75rem 0' }}>
          <p className="text-white font-bold" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Enter Secret Code</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="Enter code..."
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              className="bg-slate-700 text-white rounded-lg"
              style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.875rem', border: '1px solid #475569' }}
            />
            <button 
              onClick={handleCodeSubmit}
              disabled={isSubmitting}
              className="bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              {isSubmitting ? '...' : 'Redeem'}
            </button>
          </div>
          {codeMessage && (
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: codeMessage.type === 'success' ? '#4ade80' : '#f87171' }}>
              {codeMessage.text}
            </p>
          )}
          <button 
            onClick={() => { setShowSecretInput(false); setSecretCode(''); setCodeMessage(null); }}
            className="text-slate-400 hover:text-white"
            style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}
          >
            Cancel
          </button>
        </div>
      )}
      
      <p className="text-lg text-orange-400 font-semibold" style={{ marginBottom: '0.75rem' }}>
        Start Listening To Your Free Story Now!
      </p>
      
      {credits >= 2 && (
        <>
          <p className="text-white" style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
            You have <span className="text-orange-400 font-bold" style={{ fontSize: '1.5rem' }}>{credits}</span> free credits
          </p>
          <p className="text-white font-bold" style={{ fontSize: '1.25rem', lineHeight: '1.5' }}>
            Select Any <span className="bg-green-500 text-black font-bold rounded uppercase" style={{ fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>Free</span> Story
            <br />
            or any News Briefing and play for free.
          </p>
        </>
      )}

      {credits === 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <p className="text-white" style={{ fontSize: '1.125rem', lineHeight: '1.3' }}>
              You have only <span className="text-orange-400 font-bold" style={{ fontSize: '1.5rem' }}>1</span><br/>free credit left
            </p>
            <Link href="/subscribe" className="bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg transition" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Get More Credits
            </Link>
          </div>
          <p className="text-white font-bold" style={{ fontSize: '1.25rem', lineHeight: '1.5' }}>
            Select Any <span className="bg-green-500 text-black font-bold rounded uppercase" style={{ fontSize: '0.875rem', padding: '0.125rem 0.5rem' }}>Free</span> Story
            <br />
            or any News Briefing and play for free.
          </p>
        </>
      )}

      {credits <= 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <p className="text-white" style={{ fontSize: '1.125rem' }}>You have used all your free credits</p>
          <Link href="/subscribe" className="bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg transition" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            Get More Credits
          </Link>
        </div>
      )}
    </div>
  )
}
