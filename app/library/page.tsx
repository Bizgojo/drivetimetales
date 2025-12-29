'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useStories } from '@/hooks/useData'

function MyLibraryContent() {
  const params = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'library')
  const { user } = useAuth()
  const { stories, loading, error } = useStories()
 const storyLookup: Record<string, any> = {}
   stories.forEach((story: any) => { storyLookup[story.id] = story })

  if (!user) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl block mb-3">🔐</span>
        <h2 className="text-xl font-bold text-white mb-3">Sign In Required</h2>
        <Link href="/signin" className="px-6 py-2 bg-orange-500 text-black font-semibold rounded-lg inline-block">Sign In</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return <div className="py-12 text-center text-red-400">Error: {error}</div>
  }

  // Mock data for demo - replace with actual user data when available
  const listeningHistory: Record<string, { progress: number }> = {}
  const wishlistIds: string[] = []

  // Get stories from listening history
  const myStoryIds = Object.keys(listeningHistory)
  const myStories = myStoryIds
    .map(id => {
      const story = storyLookup[id]
      if (!story) return null
      return {
        ...story,
        progress: listeningHistory[id].progress
      }
    })
    .filter(Boolean)

  // Get wishlist stories
  const wishlistStories = wishlistIds
    .map(id => storyLookup[id])
    .filter(Boolean)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">My Library</h1>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('library')}
            className={`px-4 py-2 rounded-lg font-medium ${
              tab === 'library' 
                ? 'bg-orange-500 text-black' 
                : 'bg-slate-800 text-white'
            }`}
          >
            📚 My Stories
          </button>
          <button
            onClick={() => setTab('wishlist')}
            className={`px-4 py-2 rounded-lg font-medium ${
              tab === 'wishlist' 
                ? 'bg-orange-500 text-black' 
                : 'bg-slate-800 text-white'
            }`}
          >
            ❤️ Wishlist
          </button>
        </div>

        {/* Library Tab */}
        {tab === 'library' && (
          <div>
            {myStories.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-5xl block mb-4">📖</span>
                <h2 className="text-xl font-bold text-white mb-2">No Stories Yet</h2>
                <p className="text-slate-400 mb-6">Start listening to build your library!</p>
                <Link 
                  href="/library" 
                  className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block"
                >
                  Browse Stories
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {myStories.map((story: any) => (
                  <div key={story.id} className="bg-slate-800 rounded-xl p-4">
                    <h3 className="font-bold text-white">{story.title}</h3>
                    <p className="text-slate-400 text-sm">{story.author}</p>
                    <div className="mt-2 bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-orange-500 h-2 rounded-full" 
                        style={{ width: `${story.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{story.progress}% complete</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wishlist Tab */}
        {tab === 'wishlist' && (
          <div>
            {wishlistStories.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-5xl block mb-4">❤️</span>
                <h2 className="text-xl font-bold text-white mb-2">Wishlist Empty</h2>
                <p className="text-slate-400 mb-6">Save stories you want to listen to later!</p>
                <Link 
                  href="/library" 
                  className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block"
                >
                  Browse Stories
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {wishlistStories.map((story: any) => (
                  <div key={story.id} className="bg-slate-800 rounded-xl p-4">
                    <h3 className="font-bold text-white">{story.title}</h3>
                    <p className="text-slate-400 text-sm">{story.author}</p>
                    <p className="text-xs text-slate-500 mt-1">{story.duration} min • {story.category}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MyLibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-white">Loading...</div></div>}>
      <MyLibraryContent />
    </Suspense>
  )
}
