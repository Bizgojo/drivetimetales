'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  email: string
  display_name: string | null
  credits: number
  subscription_type: string | null
  subscription_ends_at: string | null
  created_at: string | null
  referral_code: string | null
  referral_count: number
  referral_tier: string | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshCredits: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    try {
      // Add timeout to prevent hanging - increased to 10 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 10000)
      )
      
      const sessionPromise = supabase.auth.getSession()
      
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
      
      if (session?.user) {
        await loadUserProfile(session.user.id)
      }
    } catch (error) {
      console.error('Error checking user:', error)
      // Don't block the app - just continue without user
    } finally {
      setLoading(false)
    }
  }

  async function loadUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, display_name, credits, subscription_type, subscription_ends_at, created_at')
        .eq('id', userId)
        .single()

      if (error) throw error
      
      // Set user with default values for referral fields (may not exist yet)
      setUser({
        ...data,
        referral_code: (data as any).referral_code || null,
        referral_count: (data as any).referral_count || 0,
        referral_tier: (data as any).referral_tier || null
      })
    } catch (error) {
      console.error('Error loading user profile:', error)
      setLoading(false)
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) return { error: error.message }
      return {}
    } catch (error: any) {
      return { error: error.message || 'Sign in failed' }
    }
  }

  async function signUp(email: string, password: string, name: string) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name }
        }
      })

      if (error) return { error: error.message }

      // Create user profile
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          email,
          display_name: name,
          credits: 0,
          subscription_type: null
        })
      }

      return {}
    } catch (error: any) {
      return { error: error.message || 'Sign up failed' }
    }
  }

  async function signOut() {
    // Save user name for "Welcome back" feature
    if (user?.display_name) {
      localStorage.setItem('dtt_last_user_name', user.display_name)
      localStorage.setItem('dtt_last_user_email', user.email)
    }
    
    await supabase.auth.signOut()
    setUser(null)
  }

  async function refreshCredits() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('credits')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setUser(prev => prev ? { ...prev, credits: data.credits } : null)
    } catch (error) {
      console.error('Error refreshing credits:', error)
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signUp,
      signOut,
      refreshCredits
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
