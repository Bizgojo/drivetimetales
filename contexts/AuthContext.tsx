'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface DbUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  credits: number
  plan: string | null
  subscription_type: string | null
  subscription_ends_at: string | null
}

interface AuthContextType {
  user: (User & Partial<DbUser>) | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, firstName: string) => Promise<{ error: Error | null, user: User | null }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<(User & Partial<DbUser>) | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadDbUser(authUser: User): Promise<void> {
    // Use direct fetch to bypass Supabase client issues
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
      console.error('[AuthContext] Missing Supabase env vars')
      setUser(authUser)
      return
    }
    
    try {
      const apiUrl = `${url}/rest/v1/users?id=eq.${authUser.id}&select=first_name,last_name,display_name,credits,plan,subscription_type,subscription_ends_at`
      
      const response = await fetch(apiUrl, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.error('[AuthContext] Fetch error:', response.status)
        setUser(authUser)
        return
      }
      
      const data = await response.json()
      
      if (data && data.length > 0) {
        const dbUser = data[0]
        setUser({ ...authUser, ...dbUser })
      } else {
        setUser(authUser)
      }
    } catch (err) {
      console.error('[AuthContext] Exception:', err)
      setUser(authUser)
    }
  }

  useEffect(() => {
    let isMounted = true
    
    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!isMounted) return
        
        setSession(session)
        
        if (session?.user) {
          await loadDbUser(session.user)
        } else {
          setUser(null)
        }
      } catch (err) {
        console.error('[AuthContext] Init error:', err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    
    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      
      setSession(session)
      
      if (session?.user) {
        await loadDbUser(session.user)
      } else {
        setUser(null)
      }
      
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await loadDbUser(session.user)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string, firstName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName }
      }
    })
    
    if (!error && data.user) {
      // Use API route with service role key to bypass RLS
      try {
        const response = await fetch('/api/user/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            email: email,
            firstName: firstName
          })
        })
        
        if (!response.ok) {
          const result = await response.json()
          console.error('User profile creation failed:', result.error)
        }
      } catch (err) {
        console.error('User profile creation error:', err)
      }
    }
    
    return { error, user: data.user ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, refreshUser }}>
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
