'use client'

import StickyLogo1 from '@/components/StickyLogo1'
import { WelcomeCredits } from '@/components/WelcomeCredits'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function HomePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)

  useEffect(() => {
    async function fetchUserData() {
      if (!user) return
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('first_name, credits')
          .eq('id', user.id)
          .single()
        if (profile) {
          setDisplayName(profile.first_name || user.email?.split('@')[0] || 'friend')
          setUserCredits(profile.credits || 0)
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUserData()
  }, [user])

  return (
    <div className="min-h-screen bg-slate-950 w-full">
      <StickyLogo1 userName={displayName} />
      <main className="pb-24">
        <WelcomeCredits displayName={displayName} userCredits={userCredits} />
        <p className="text-white text-lg px-4">Modules 02 + 04 loaded successfully.</p>
      </main>
    </div>
  )
}
