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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto px-4 py-8">
        
        {/* Logo - NEW EMOJI VERSION */}
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
