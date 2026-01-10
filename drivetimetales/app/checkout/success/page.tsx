'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function verifyAndRedirect() {
      const sessionId = searchParams.get('session_id')
      
      // Get current user
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          setUserName(userData.display_name?.split(' ')[0] || 'there')
        }
      }
      
      setLoading(false)
      
      // Auto redirect to home after 5 seconds
      setTimeout(() => {
        router.push('/home')
      }, 5000)
    }
    
    verifyAndRedirect()
  }, [searchParams, router])

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="60" height="36" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-xl font-bold text-white">Drive Time </span>
        <span className="text-xl font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center">
          <span className="text-4xl">✓</span>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-white mb-2">
          Welcome to Drive Time Tales!
        </h1>
        <p className="text-slate-400 mb-6">
          {userName ? `Thanks ${userName}! ` : ''}Your subscription is now active. Time to start your audio journey!
        </p>

        {/* Features unlocked */}
        <div className="bg-slate-900 rounded-xl p-4 mb-6 text-left">
          <h3 className="text-sm font-semibold text-white mb-3">You now have access to:</h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-green-400">✓</span> Full story library
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-green-400">✓</span> Save stories to your wishlist
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-green-400">✓</span> Track your listening progress
            </li>
            <li className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-green-400">✓</span> Leave reviews
            </li>
          </ul>
        </div>

        {/* CTA Button */}
        <Link 
          href="/home"
          className="block w-full py-4 bg-orange-500 hover:bg-orange-400 rounded-xl transition-colors"
        >
          <span className="text-black font-bold text-lg">Start Listening</span>
        </Link>

        <p className="text-slate-500 text-sm mt-4">
          Redirecting automatically in 5 seconds...
        </p>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SuccessContent />
    </Suspense>
  )
}
