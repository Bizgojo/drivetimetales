'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Male)' },
]

const CATEGORIES = [
  { id: 'national', name: 'National News', icon: '🇺🇸' },
  { id: 'international', name: 'International News', icon: '🌍' },
  { id: 'business', name: 'Business & Finance', icon: '💼' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'science', name: 'Science & Technology', icon: '🔬' },
]

export default function AdminNewsPage() {
  const [generating, setGenerating] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function generate(categoryId: string) {
    setGenerating(categoryId)
    setMessage('')
    
    try {
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId })
      })
      const data = await res.json()
      
      if (data.success) {
        setMessage(`✅ ${categoryId} briefing generated!`)
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (err) {
      setMessage('❌ Failed to generate')
    }
    
    setGenerating(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/admin" className="text-orange-400 hover:text-orange-300">
          ← Back to Admin
        </Link>
        
        <h1 className="text-2xl font-bold mt-4 mb-6">📰 News Briefings</h1>
        
        {message && (
          <div className="mb-4 p-3 bg-slate-800 rounded-lg">{message}</div>
        )}
        
        <div className="space-y-3">
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="bg-slate-900 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <span className="font-medium">{cat.name}</span>
              </div>
              <button
                onClick={() => generate(cat.id)}
                disabled={generating !== null}
                className={`px-4 py-2 rounded-lg font-medium ${
                  generating === cat.id
                    ? 'bg-orange-500/50 text-white'
                    : 'bg-orange-500 hover:bg-orange-400 text-black'
                }`}
              >
                {generating === cat.id ? 'Generating...' : '▶ Generate'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
