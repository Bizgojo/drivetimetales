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
  subscription_type: string | null
  subscription_status: string | null
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

  async function loadDbUser(authUser: User) {
    // Use direct fetch to bypass Supabase client issues
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
      console.error('[AuthContext] Missing Supabase env vars')
      setUser(authUser)
      return
    }
    
    try {
      const apiUrl = `${url}/rest/v1/users?id=eq.${authUser.id}&select=first_name,last_name,display_name,credits,subscription_type,subscription_status,subscription_ends_at`
      console.log('[AuthContext] Fetching user data from:', apiUrl.substring(0, 80) + '...')
      
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
      console.log('[AuthContext] User data received:', data)
      
      if (data && data.length > 0) {
        const dbUser = data[0]
        console.log('[AuthContext] Setting user with:', { 
          first_name: dbUser.first_name, 
          last_name: dbUser.last_name,
          display_name: dbUser.display_name 
        })
        setUser({ ...authUser, ...dbUser })
      } else {
        console.log('[AuthContext] No user data found in DB')
        setUser(authUser)
      }
    } catch (err) {
      console.error('[AuthContext] Exception:', err)
      setUser(authUser)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadDbUser(session.user)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadDbUser(session.user)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
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
