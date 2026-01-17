'use client'

import StickyLogo1 from '@/components/StickyLogo1'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function HomePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('friend')

  useEffect(() => {
    async function fetchUserData() {
      if (!user) return
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('first_name')
          .eq('id', user.id)
          .single()
        if (profile) {
          setDisplayName(profile.first_name || user.email?.split('@')[0] || 'friend')
        }
      } catch (err) {
        console.error('Error fetching user:', err)
      }
    }
    fetchUserData()
  }, [user])

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-md mx-auto">
        <StickyLogo1 userName={displayName} />
        <main className="pb-24 px-4 pt-6">
          <p className="text-white">Module 02 loaded successfully.</p>
        </main>
      </div>
    </div>
  )
}
