'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { supabase } from '@/lib/supabase'
import { mergeLocalReadingProgress } from '@/lib/readingProgress'

// Use cookie-aware client for all auth operations so middleware can read the session
const authClient = supabaseBrowser

// ORION-ENTITLE-SYNC-001 (launch blocker, 2026-07-12): the app has TWO browser
// clients — this cookie-based auth client, and the plain localStorage client in
// lib/supabase.ts that 40+ data components query through. Sessions created by
// this app's signup/signin are cookie-ONLY, so every per-user query through
// the plain client silently ran as ANON: RLS returned no users row, the player
// paywall bounced PAYING subscribers to /subscribe, and user_library reads
// came back empty. Mirror every cookie session into the data client so all
// data queries carry the user's JWT. The data client never refreshes tokens
// itself (autoRefreshToken:false) — it is a pure follower of this client.
async function mirrorSessionToDataClient(session: Session | null) {
  try {
    if (session?.access_token && session?.refresh_token) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    } else {
      await supabase.auth.signOut({ scope: 'local' })
    }
  } catch (err) {
    console.error('[AuthContext] data-client session mirror failed:', err)
  }
}

interface DbUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  credits: number
  signup_source: string | null
  plan: string | null
  subscription_type: string | null
  subscription_ends_at: string | null
  is_founding_member: boolean | null
  is_test_account: boolean | null
}

interface AuthContextType {
  user: (User & Partial<DbUser>) | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, firstName: string, heardAbout?: string) => Promise<{ error: Error | null, user: User | null }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<(User & Partial<DbUser>) | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const mergedReadingProgressForRef = useRef<string | null>(null)

  const authRevisionRef = useRef(0)

  async function loadDbUser(authUser: User, accessToken?: string | null): Promise<void> {
    const revision = authRevisionRef.current
    const publishUser = (next: User & Partial<DbUser>) => {
      if (revision === authRevisionRef.current) setUser(next)
    }
    // Use direct fetch to bypass Supabase client issues
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
      console.error('[AuthContext] Missing Supabase env vars')
      publishUser(authUser)
      return
    }
    
    try {
      const apiUrl = `${url}/rest/v1/users?id=eq.${authUser.id}&select=first_name,last_name,display_name,credits,signup_source,plan,subscription_type,subscription_ends_at,is_founding_member,is_test_account`
      
      // ORION-ENTITLE-SYNC-001: authorize as the USER, not the anon key — RLS
      // returns nothing for anon, which silently stripped subscription fields
      // from the context user (same defect class as the player paywall bounce).
      // The token is PASSED IN: calling authClient.auth.getSession() here
      // deadlocks — this runs inside onAuthStateChange, and GoTrue holds its
      // client lock while dispatching callbacks (re-entrant call never returns).
      const response = await fetch(apiUrl, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${accessToken || key}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.error('[AuthContext] Fetch error:', response.status)
        publishUser(authUser)
        return
      }
      
      const data = await response.json()
      
      if (data && data.length > 0) {
        const dbUser = data[0]
        publishUser({ ...authUser, ...dbUser })
        // AMENDMENT-1 Gap 8.4b: logged-in test accounts suppress browser
        // pixels even with no et_test in the URL (trackClientEvent +
        // pixel guards read these flags). Best-effort, never throws.
        if (dbUser.is_test_account === true && typeof window !== 'undefined') {
          try { window.localStorage.setItem('et_test_account', '1') } catch {}
          try { (window as any).__etTestSession = true } catch {}
        }
      } else {
        publishUser(authUser)
      }
    } catch (err) {
      console.error('[AuthContext] Exception:', err)
      publishUser(authUser)
    }
  }

  useEffect(() => {
    let isMounted = true
    let observedEvent = false
    let mirrorTail = Promise.resolve()

    const acceptSession = (next: Session | null) => {
      const revision = ++authRevisionRef.current
      // Publish the authenticated identity immediately, independently of profile I/O.
      setSession(next)
      setUser(next?.user || null)
      setLoading(true)
      // Leave the auth callback before calling another auth client. Serialize
      // mirrors so an older session can never overwrite a newer one.
      mirrorTail = mirrorTail.then(async () => {
        if (!isMounted || revision !== authRevisionRef.current) return
        await mirrorSessionToDataClient(next)
        if (!isMounted || revision !== authRevisionRef.current) return
        setLoading(false)
        if (next?.user) void loadDbUser(next.user, next.access_token)
      }).catch(err => {
        console.error('[AuthContext] session restore failed:', err)
        if (isMounted && revision === authRevisionRef.current) setLoading(false)
      })
    }

    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, next) => {
      if (!isMounted) return
      observedEvent = true
      acceptSession(next)
    })
    // Fallback for clients that don't emit INITIAL_SESSION. A later result
    // must not overwrite a sign-in or sign-out already observed above.
    void authClient.auth.getSession().then(({ data: { session: initial } }) => {
      if (isMounted && !observedEvent) acceptSession(initial)
    }).catch(err => {
      console.error('[AuthContext] Init error:', err)
      if (isMounted && !observedEvent) setLoading(false)
    })

    return () => {
      isMounted = false
      ++authRevisionRef.current
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user?.id || mergedReadingProgressForRef.current === user.id) return
    mergedReadingProgressForRef.current = user.id
    mergeLocalReadingProgress(authClient, user.id).catch((err) => {
      console.warn('[AuthContext] Reading progress merge failed:', err)
      mergedReadingProgressForRef.current = null
    })
  }, [user?.id])

  const refreshUser = async () => {
    const { data: { session } } = await authClient.auth.getSession()
    if (session?.user) {
      await loadDbUser(session.user, session.access_token)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await authClient.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string, firstName: string, heardAbout?: string) => {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, heard_about_us: heardAbout || null }
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
            firstName: firstName,
            heardAbout: heardAbout || null,
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
    await authClient.auth.signOut()
    setUser(null)
    setSession(null)
    // Redirect to landing page — never to signin
    window.location.href = '/signin'
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
