'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  email: string
  display_name: string | null
  credits: number
  subscription_type: string
  subscription_ends_at: string | null
  created_at: string
  referral_code: string | null
  referral_count: number
  first_name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  refreshCredits: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session on mount
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event, session?.user?.id)
      
      if (event === 'SIGNED_IN' && session?.user) {
        await loadUserProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Refresh user data on token refresh
        await loadUserProfile(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    console.log('[Auth] Checking user session...')
    
    try {
      // Increased timeout to 30 seconds for slow connections
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 30000)
      )
      
      const sessionPromise = supabase.auth.getSession()
      
      const result = await Promise.race([sessionPromise, timeoutPromise]) as any
      const session = result?.data?.session
      
      console.log('[Auth] Session check result:', session ? 'Has session' : 'No session')
      
      if (session?.user) {
        await loadUserProfile(session.user.id)
      }
    } catch (error) {
      console.error('[Auth] Error checking user:', error)
      // Don't block the app - just continue without user
      // User can try signing in again
    } finally {
      setLoading(false)
    }
  }

  async function loadUserProfile(userId: string) {
    console.log('[Auth] Loading profile for:', userId)
    
    try {
      // Add timeout for profile loading too
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile load timeout')), 10000)
      )
      
      const profilePromise = supabase
        .from('users')
        .select('id, email, display_name, credits, subscription_type, subscription_ends_at, created_at, first_name, address, city, state, zip')
        .eq('id', userId)
        .single()
      
      const { data, error } = await Promise.race([profilePromise, timeoutPromise]) as any

      if (error) {
        console.error('[Auth] Profile load error:', error)
        // If user doesn't exist in users table, create minimal entry
        if (error.code === 'PGRST116') {
          console.log('[Auth] User not in users table, will be created on next action')
        }
        throw error
      }
      
      console.log('[Auth] Profile loaded:', data?.email)
      
      // Set user with default values for optional fields
      setUser({
        ...data,
        referral_code: (data as any).referral_code || null,
        referral_count: (data as any).referral_count || 0,
      })
    } catch (error) {
      console.error('[Auth] Error loading profile:', error)
      // Still set loading to false so the app can continue
    }
  }

  async function signIn(email: string, password: string): Promise<{ error: any }> {
    console.log('[Auth] signIn called for:', email)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })
      
      if (error) {
        console.error('[Auth] signIn error:', error)
        return { error }
      }
      
      if (data.user) {
        await loadUserProfile(data.user.id)
      }
      
      return { error: null }
    } catch (err) {
      console.error('[Auth] signIn catch:', err)
      return { error: err }
    }
  }

  async function signOut() {
    console.log('[Auth] Signing out...')
    try {
      await supabase.auth.signOut()
      setUser(null)
      // Force redirect to welcome
      window.location.href = '/welcome'
    } catch (error) {
      console.error('[Auth] Sign out error:', error)
      // Force clear anyway
      setUser(null)
      window.location.href = '/welcome'
    }
  }

  async function refreshUser() {
    console.log('[Auth] Refreshing user...')
    if (user?.id) {
      await loadUserProfile(user.id)
    }
  }

  async function refreshCredits() {
    console.log('[Auth] Refreshing credits...')
    if (user?.id) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single()
        
        if (!error && data) {
          setUser(prev => prev ? { ...prev, credits: data.credits } : null)
        }
      } catch (err) {
        console.error('[Auth] Error refreshing credits:', err)
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshUser, refreshCredits }}>
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
