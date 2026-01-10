'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RootPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkAuthAndRedirect() {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        )
        
        const sessionPromise = supabase.auth.getSession()
        
        const result = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: any } }
        
        if (result?.data?.session) {
          router.replace('/home')
        } else {
          router.replace('/welcome')
        }
      } catch (error) {
        console.error('Error checking user:', error)
        router.replace('/welcome')
      }
    }
    
    checkAuthAndRedirect()
  }, [router])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center animate-pulse">
          <span className="text-2xl">🎧</span>
        </div>
        <div className="animate-spin w-6 h-6 mx-auto border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    </div>
  )
}
