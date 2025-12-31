'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RootPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkAuthAndRedirect() {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        router.replace('/home')
      } else {
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
