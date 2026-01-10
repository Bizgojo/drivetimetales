'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

interface Referral {
  id: string
  status: string
  created_at: string
  completed_at: string | null
  referred: {
    display_name: string | null
    email: string
    created_at: string
  }
}

interface Tier {
  id: number
  tier_name: string
  min_referrals: number
  badge_emoji: string
  badge_name: string
  bonus_credits: number
  description: string
}

interface ReferralData {
  referral_code: string
  referral_count: number
  referral_tier: string
  credits_earned: number
  referrals: Referral[]
  current_tier: Tier | null
  next_tier: Tier | null
  tiers: Tier[]
}

export default function ReferralPage() {
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')

  useEffect(() => {
    if (user) {
      loadReferralData()
    }
  }, [user])

  async function loadReferralData() {
    try {
      const res = await fetch(`/api/referral?userId=${user?.id}`)
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setData(result)
    } catch (error) {
      console.error('Error loading referral data:', error)
    } finally {
      setLoading(false)
    }
  }

  function copyCode() {
    if (data?.referral_code) {
      navigator.clipboard.writeText(data.referral_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function copyLink() {
    if (data?.referral_code) {
      const link = `https://drivetimetales.vercel.app/signup?ref=${data.referral_code}`
      navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function shareNative() {
    if (!data?.referral_code) return
    
    const shareData = {
      title: 'Drive Time Tales',
      text: `I've been enjoying Drive Time Tales - audio stories perfect for driving! Use my code ${data.referral_code} for 3 FREE credits.`,
      url: `https://drivetimetales.vercel.app/signup?ref=${data.referral_code}`
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        copyLink()
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setShareError('Could not share. Link copied instead!')
        copyLink()
      }
    }
  }

  function shareVia(platform: string) {
    if (!data?.referral_code) return
    
    const text = encodeURIComponent(`I've been enjoying Drive Time Tales - audio stories perfect for driving! Use my code ${data.referral_code} for 3 FREE credits.`)
    const url = encodeURIComponent(`https://drivetimetales.vercel.app/signup?ref=${data.referral_code}`)
    
    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      sms: `sms:?body=${text}%20${decodeURIComponent(url)}`,
      email: `mailto:?subject=${encodeURIComponent('Check out Drive Time Tales!')}&body=${text}%20${decodeURIComponent(url)}`
    }
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank')
    }
  }

  // Not logged in
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <span className="text-6xl mb-4 block">🚗</span>
          <h1 className="text-2xl font-bold text-white mb-2">Share the Road</h1>
          <p className="text-slate-400 mb-6">Sign in to access your referral code</p>
          <Link href="/signin" className="bg-orange-500 text-black px-6 py-3 rounded-xl font-bold">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  // Loading
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const progressToNext = data?.next_tier 
    ? ((data.referral_count || 0) / data.next_tier.min_referrals) * 100
    : 100

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <Link href="/home" className="text-slate-400 hover:text-white">
          ← Back
        </Link>
        <h1 className="text-lg font-bold text-white flex-1">🚗 Share the Road</h1>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-orange-600 to-red-700 px-4 py-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Give 3, Get 3</h2>
        <p className="text-orange-100">
          Share Drive Time Tales with friends.<br />
          They get 3 free credits, you get 3 free credits!
        </p>
      </div>

      {/* Referral Code Card */}
      <div className="px-4 -mt-6">
        <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
          <p className="text-slate-400 text-sm text-center mb-2">Your referral code</p>
          <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl font-mono font-bold text-orange-400 tracking-wider">
              {data?.referral_code || '...'}
            </span>
            <button 
              onClick={copyCode}
              className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
          
          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button 
              onClick={shareNative}
              className="bg-orange-500 hover:bg-orange-400 text-black font-bold py-3 rounded-xl transition"
            >
              📤 Share
            </button>
            <button 
              onClick={copyLink}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition"
            >
              🔗 Copy Link
            </button>
          </div>

          {/* Social Share Icons */}
          <div className="flex justify-center gap-3">
            <button 
              onClick={() => shareVia('whatsapp')}
              className="w-12 h-12 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center text-xl transition"
              title="Share via WhatsApp"
            >
              💬
            </button>
            <button 
              onClick={() => shareVia('sms')}
              className="w-12 h-12 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-xl transition"
              title="Share via SMS"
            >
              📱
            </button>
            <button 
              onClick={() => shareVia('email')}
              className="w-12 h-12 bg-slate-600 hover:bg-slate-500 rounded-full flex items-center justify-center text-xl transition"
              title="Share via Email"
            >
              ✉️
            </button>
            <button 
              onClick={() => shareVia('twitter')}
              className="w-12 h-12 bg-sky-500 hover:bg-sky-400 rounded-full flex items-center justify-center text-xl transition"
              title="Share on X/Twitter"
            >
              𝕏
            </button>
            <button 
              onClick={() => shareVia('facebook')}
              className="w-12 h-12 bg-blue-700 hover:bg-blue-600 rounded-full flex items-center justify-center text-xl transition"
              title="Share on Facebook"
            >
              f
            </button>
          </div>

          {shareError && (
            <p className="text-green-400 text-sm text-center mt-3">{shareError}</p>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="px-4 py-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-orange-400">{data?.referral_count || 0}</p>
            <p className="text-slate-400 text-xs">Referrals</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{data?.credits_earned || 0}</p>
            <p className="text-slate-400 text-xs">Credits Earned</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <p className="text-3xl">{data?.current_tier?.badge_emoji || '🚗'}</p>
            <p className="text-slate-400 text-xs">{data?.current_tier?.badge_name || 'Starter'}</p>
          </div>
        </div>

        {/* Progress to Next Tier */}
        {data?.next_tier && (
          <div className="bg-slate-800 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400 text-sm">Progress to {data.next_tier.badge_name}</span>
              <span className="text-orange-400 font-bold">
                {data.referral_count}/{data.next_tier.min_referrals}
              </span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(progressToNext, 100)}%` }}
              />
            </div>
            <p className="text-slate-500 text-xs mt-2">
              {data.next_tier.min_referrals - data.referral_count} more referral{data.next_tier.min_referrals - data.referral_count !== 1 ? 's' : ''} to earn +{data.next_tier.bonus_credits} bonus credits!
            </p>
          </div>
        )}

        {/* Tier Legend */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6">
          <h3 className="text-white font-bold mb-3">🏆 Referral Tiers</h3>
          <div className="space-y-3">
            {data?.tiers?.map(tier => {
              const isCurrentTier = tier.tier_name === data.referral_tier
              const isUnlocked = (data.referral_count || 0) >= tier.min_referrals
              
              return (
                <div 
                  key={tier.id}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    isCurrentTier ? 'bg-orange-500/20 border border-orange-500/50' : ''
                  }`}
                >
                  <span className={`text-2xl ${isUnlocked ? '' : 'grayscale opacity-50'}`}>
                    {tier.badge_emoji}
                  </span>
                  <div className="flex-1">
                    <p className={`font-bold ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>
                      {tier.badge_name}
                      {isCurrentTier && <span className="text-orange-400 text-xs ml-2">← You</span>}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {tier.min_referrals === 0 ? 'Starting tier' : `${tier.min_referrals} referrals`}
                      {tier.bonus_credits > 0 && ` • +${tier.bonus_credits} bonus credits`}
                    </p>
                  </div>
                  {isUnlocked && <span className="text-green-400">✓</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Referral History */}
        {data?.referrals && data.referrals.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-white font-bold mb-3">📜 Your Referrals</h3>
            <div className="space-y-2">
              {data.referrals.map(ref => (
                <div 
                  key={ref.id}
                  className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
                >
                  <div>
                    <p className="text-white">
                      {ref.referred?.display_name || ref.referred?.email?.split('@')[0] || 'Friend'}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {new Date(ref.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ref.status === 'completed' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {ref.status === 'completed' ? '+3 credits' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!data?.referrals || data.referrals.length === 0) && (
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            <span className="text-4xl block mb-3">🚗</span>
            <p className="text-white font-bold mb-1">No referrals yet</p>
            <p className="text-slate-400 text-sm">Share your code and start earning!</p>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="px-4 pb-8">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
          <h3 className="text-white font-bold mb-4">📖 How It Works</h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0">1</div>
              <div>
                <p className="text-white font-medium">Share your code</p>
                <p className="text-slate-400 text-sm">Send your code to friends via text, email, or social media</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0">2</div>
              <div>
                <p className="text-white font-medium">They sign up</p>
                <p className="text-slate-400 text-sm">Your friend creates an account using your code</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold flex-shrink-0">3</div>
              <div>
                <p className="text-white font-medium">You both get rewarded!</p>
                <p className="text-slate-400 text-sm">They get 3 free credits, you get 3 free credits</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
