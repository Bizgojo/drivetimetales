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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-950 text-white">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stories.map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="group">
                  <div className="aspect-square rounded-xl relative overflow-hidden mb-2 bg-gradient-to-br from-slate-700 to-slate-900">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl opacity-50">🎧</span>
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                      {story.duration_mins} min
                    </div>
                  </div>
                  <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 line-clamp-2">{story.title}</h3>
                  <p className="text-xs text-orange-400">{story.genre}</p>
                  <p className="text-xs text-slate-400">{story.author}</p>
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
