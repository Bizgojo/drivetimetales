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
  const [sessionReady, setSessionReady] = useState(false)

  // Handle the token from URL on mount
  useEffect(() => {
    async function handleTokenFromUrl() {
      if (typeof window === 'undefined') return

      const hash = window.location.hash
      
      // Check for error in URL
      if (hash.includes('error=')) {
        setError('This password reset link has expired. Please request a new one.')
        setSessionReady(true)
        return
      }

      // Extract tokens from hash
      if (hash.includes('access_token=')) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          // Set the session manually
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            console.error('Session error:', error)
            setError('This password reset link has expired. Please request a new one.')
          }
        }
      }
      
      setSessionReady(true)
    }

    handleTokenFromUrl()
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
      // Check if we have a session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setError('Your reset link has expired. Please request a new one from the Sign In page.')
        setIsSubmitting(false)
        return
      }

      const { error } = await supabase.auth.updateUser({
        password: password
      })
      
      if (error) {
        console.error('Update error:', error)
        if (error.message.includes('session') || error.message.includes('logged in')) {
          setError('Your reset link has expired. Please request a new one from the Sign In page.')
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
      console.error('Catch error:', err)
      setError('An error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  // Show loading while setting up session
  if (!sessionReady) {
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
                {error.includes('expired') && (
                  <Link 
                    href="/signin" 
                    className="block text-center text-orange-400 text-sm mt-2 hover:underline"
                  >
                    Go to Sign In to request a new link →
                  </Link>
                )}
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
