'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SignedOutPage() {
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    // Get the remembered user name from localStorage
    const rememberedName = localStorage.getItem('dtt_remembered_name')
    if (rememberedName) {
      setUserName(rememberedName)
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-center px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-5xl">🚛</span>
          <span className="text-5xl">🚗</span>
        </div>
        
        <div className="flex items-baseline justify-center mb-8">
          <span className="text-2xl font-bold text-white">Drive Time </span>
          <span className="text-2xl font-bold text-orange-500">Tales</span>
        </div>

        {/* Goodbye Message */}
        <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 max-w-sm mx-auto">
          <span className="text-6xl block mb-4">👋</span>
          <h1 className="text-2xl font-bold text-white mb-2">
            {userName ? `Goodbye, ${userName}!` : 'You\'ve Been Signed Out'}
          </h1>
          <p className="text-slate-400 mb-6">
            Thanks for listening! We hope to see you back on the road soon.
          </p>
          
          <div className="space-y-3">
            <Link 
              href="/signin"
              className="block w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl transition-colors text-center"
            >
              Sign In Again
            </Link>
            
            <button
              onClick={() => window.close()}
              className="block w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
            >
              Close This Tab
            </button>
          </div>
          
          <p className="text-slate-500 text-xs mt-4">
            (If the tab doesn't close, you can close it manually)
          </p>
        </div>
      </div>
    </div>
  )
}
