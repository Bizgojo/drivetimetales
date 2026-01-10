'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SignInPage() {
  const router = useRouter()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    
    if (!password) {
      setError('Please enter your password')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })
      
      if (authError) {
        if (authError.message.includes('Invalid login')) {
          setError('Invalid email or password')
        } else {
          setError(authError.message)
        }
        setIsSubmitting(false)
        return
      }
      
      if (!data.user) {
        setError('Login failed. Please try again.')
        setIsSubmitting(false)
        return
      }
      
      // Update last login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)
      
      // Redirect to home
      router.push('/home')
      
    } catch (err) {
      setError('An error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsSubmitting(true)
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      })
      
      if (error) {
        setError(error.message)
        setIsSubmitting(false)
      }
    } catch (err) {
      setError('Google sign in failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleAppleSignIn = async () => {
    setError(null)
    setIsSubmitting(true)
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      })
      
      if (error) {
        setError(error.message)
        setIsSubmitting(false)
      }
    } catch (err) {
      setError('Apple sign in failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email first')
      return
    }
    
    setIsSubmitting(true)
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    
    if (error) {
      setError(error.message)
    } else {
      setError(null)
      alert('Password reset email sent! Check your inbox.')
    }
    
    setIsSubmitting(false)
  }

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="50" height="30" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <span className="text-lg font-bold text-white">Drive Time </span>
        <span className="text-lg font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto px-4 py-8">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href="/welcome">
            <Logo />
          </Link>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h1 className="text-xl font-bold text-white text-center mb-2">
            Welcome Back
          </h1>
          <p className="text-slate-400 text-sm text-center mb-6">
            Sign in to continue listening
          </p>

          {/* Social Login Buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 rounded-xl font-medium flex items-center justify-center gap-3 transition disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-black hover:bg-gray-900 text-white rounded-xl font-medium flex items-center justify-center gap-3 transition border border-slate-700 disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span className="text-slate-500 text-sm">or</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="email"
              />
            </div>
            
            {/* Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500 pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            
            {/* Forgot Password */}
            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-orange-400 text-sm hover:underline"
              >
                Forgot password?
              </button>
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
              {isSubmitting ? 'Signing In...' : 'Sign In with Email'}
            </button>
          </form>
        </div>

        {/* Create account */}
        <p className="text-slate-400 text-sm text-center mt-6">
          Don't have an account?{' '}
          <Link href="/pricing" className="text-orange-400 hover:underline font-medium">
            View Plans
          </Link>
        </p>

        {/* Back to stories */}
        <p className="text-center mt-4">
          <Link href="/welcome" className="text-slate-500 text-sm hover:text-white">
            ← Back to free stories
          </Link>
        </p>
      </div>
    </div>
  )
}
