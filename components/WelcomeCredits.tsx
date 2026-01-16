/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: WelcomeCredits
Location: /components/WelcomeCredits.tsx
Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED

PURPOSE:
Welcome message and credits display for Home Page.
- "Welcome back, {first_name}!"
- "You have {credits} credits in your account."
- If credits = 0, shows orange [Get More Credits] button
================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface WelcomeCreditsProps {
  onUserLoaded?: (name: string, credits: number) => void
}

export default function WelcomeCredits({ onUserLoaded }: WelcomeCreditsProps) {
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          setLoading(false)
          return
        }

        const { data: profile, error } = await supabase
          .from('users')
          .select('first_name, display_name, credits')
          .eq('id', session.user.id)
          .single()
        
        if (profile && !error) {
          const name = profile.first_name 
            || profile.display_name?.split(' ')[0] 
            || session.user.email?.split('@')[0] 
            || 'friend'
          setDisplayName(name)
          setUserCredits(profile.credits || 0)
          
          // Callback to parent if needed
          if (onUserLoaded) {
            onUserLoaded(name, profile.credits || 0)
          }
        }
      } catch (err) {
        console.error('[WelcomeCredits] Error:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadUserProfile()
  }, [onUserLoaded])

  if (loading) {
    return (
      <section className="px-4 py-6">
        <div className="h-8 bg-slate-800 rounded w-48 animate-pulse mb-2"></div>
        <div className="h-5 bg-slate-800 rounded w-64 animate-pulse"></div>
      </section>
    )
  }

  return (
    <section className="px-4 py-6">
      <h1 className="text-2xl font-bold text-white text-left">Welcome back, {displayName}!</h1>
      <div className="flex items-center gap-3 mt-2">
        <p className="text-white text-left">
          You have <span className="text-orange-400 font-bold">{userCredits}</span> credits in your account.
        </p>
        {userCredits === 0 && (
          <Link 
            href="/pricing"
            className="bg-orange-500 hover:bg-orange-400 text-black font-bold px-4 py-2 rounded-lg transition whitespace-nowrap"
          >
            Get More Credits
          </Link>
        )}
      </div>
    </section>
  )
}
