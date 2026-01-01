'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    // Check for error in URL hash first
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('error=')) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const errorDescription = hashParams.get('error_description')
        setLinkError(errorDescription || 'This password reset link has expired or is invalid.')
        setIsReady(true)
        return
      }
    }

    // Listen for auth state changes - Supabase handles the token exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the recovery link and is ready to reset password
        setIsReady(true)
      } else if (event === 'SIGNED_IN' && session) {
        // Session established
        setIsReady(true)
      }
    })

    // Also check if there's already a session (in case event already fired)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsReady(true)
      } else {
        // Give it a moment for the auth state change to fire
        setTimeout(() => {
          setIsReady(true)
        }, 2000)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Password validation
  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 6) {
      return 'Password must be at least 6 characters'
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least 1 capital letter'
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least 1 number'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Validate password
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })
      
      if (error) {
        if (error.message.includes('session')) {
          setError('Your reset link has expired. Please request a new one.')
        } else {
          setError(error.message)
        }
        setIsSubmitting(false)
        return
      }
      
      setSuccess(true)
      
      // Redirect to home after 1.5 seconds
      setTimeout(() => {
        router.push('/home')
      }, 1500)
      
    } catch (err) {
      setError('An error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Password Updated!</h1>
          <p className="text-slate-400">Taking you to your stories...</p>
        </div>
      </div>
    )
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Link href="/welcome" className="flex items-center gap-2">
              <span className="text-3xl">🚛</span>
              <span className="text-3xl">🚗</span>
              <div className="flex items-baseline ml-1">
                <span className="text-lg font-bold text-white">Drive Time </span>
                <span className="text-lg font-bold text-orange-500">Tales</span>
              </div>
            </Link>
          </div>
          
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">Link Expired</h1>
            <p className="text-slate-400 mb-6">{linkError}</p>
            <Link 
              href="/signin"
              className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl inline-block"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto px-4 py-8">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href="/welcome" className="flex items-center gap-2">
            <span className="text-3xl">🚛</span>
            <span className="text-3xl">🚗</span>
            <div className="flex items-baseline ml-1">
              <span className="text-lg font-bold text-white">Drive Time </span>
              <span className="text-lg font-bold text-orange-500">Tales</span>
            </div>
          </Link>
        </div>

        {/* Reset Password Form */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h1 className="text-xl font-bold text-white text-center mb-2">
            Reset Your Password
          </h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            Enter your new password below
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="new-password"
              />
              <p className="text-slate-500 text-xs mt-1">
                Must be 6+ characters with 1 capital letter and 1 number
              </p>
            </div>
            
            {/* Confirm Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="new-password"
              />
            </div>
            
            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 rounded-xl font-bold text-base transition-colors ${
                isSubmitting
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-400 text-black'
              }`}
            >
              {isSubmitting ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Back to sign in */}
        <p className="text-center mt-6">
          <Link href="/signin" className="text-slate-500 text-sm hover:text-white">
            ← Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
