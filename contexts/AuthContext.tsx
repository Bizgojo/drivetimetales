'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface DbUser {
  id: string
  email: string
  first_name: string | null
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
    const { data } = await supabase
      .from('users')
      .select('first_name, display_name, credits, subscription_type, subscription_status, subscription_ends_at')
      .eq('id', authUser.id)
      .single()
    
    if (data) {
      setUser({ ...authUser, ...data })
    } else {
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
      // Insert user with BOTH first_name and display_name for compatibility
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        email: email,
        first_name: firstName,
        display_name: firstName,
      })
      if (insertError) console.error("User insert failed:", insertError)        credits: 0,
        subscription_status: 'none'
      })
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
