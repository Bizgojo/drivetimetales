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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500"
                autoComplete="current-password"
              />
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
              {isSubmitting ? 'Signing In...' : 'Sign In'}
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
