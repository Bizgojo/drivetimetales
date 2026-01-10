'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, Story } from '@/lib/supabase'

export default function WishlistPage() {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For now, wishlist is empty since we don't have wishlist functionality yet
    setLoading(false)
  }, [])

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl block mb-4">🔐</span>
          <p className="text-white mb-4">Please sign in to view your wishlist</p>
          <Link href="/signin" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-xl inline-block">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/library" className="text-slate-400 hover:text-white text-sm mb-6 inline-block">
            ← Back to Library
          </Link>
          
          <h1 className="text-2xl font-bold text-white mb-1">💫 Wishlist</h1>
          <p className="text-slate-400 text-sm mb-6">{stories.length} stories saved</p>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-400">Loading...</p>
            </div>
          ) : stories.length > 0 ? (
            <div className="space-y-3">
              {stories.map((story) => (
                <Link key={story.id} href={`/player/${story.id}`} className="bg-slate-700 rounded-xl p-3 flex gap-3 hover:bg-slate-600 transition block">
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 relative shadow-[0_0_20px_rgba(255,255,255,0.6)]">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                        <span className="text-2xl">🎧</span>
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                      {story.duration_mins}m
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{story.title}</p>
                    <p className="text-white text-xs">{story.genre} • {story.credits || 1} credit{(story.credits || 1) > 1 ? 's' : ''}</p>
                    <p className="text-slate-300 text-[10px]">by {story.author || 'Drive Time Tales'}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="text-5xl block mb-4">💫</span>
              <h2 className="text-xl font-bold text-white mb-2">No Stories Saved</h2>
              <p className="text-slate-400 mb-6">Add stories to your wishlist to listen later.</p>
              <Link href="/library" className="inline-block px-6 py-3 bg-orange-500 text-black font-semibold rounded-xl">
                Browse Stories
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
