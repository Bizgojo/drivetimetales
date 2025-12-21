'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser } from '../layout'
import { useStories, createStoryLookup } from '../hooks/useStories'

function Content() {
  const params = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'library')
  const { user, toggleWishlist, listeningHistory } = useUser()
  const { stories, loading, error } = useStories()
  const storyLookup = createStoryLookup(stories)

  if (!user?.isLoggedIn) {
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

  // Get stories from listening history (purchased/played stories)
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
  const wishlistStories = (user.wishlist || [])
    .map(id => storyLookup[id])
    .filter(Boolean)

  return (
    <>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('library')} className={`px-4 py-2 rounded-lg font-semibold text-sm ${tab === 'library' ? 'bg-orange-500 text-black' : 'bg-slate-800 text-slate-300'}`}>My Library ({myStories.length})</button>
        <button onClick={() => setTab('wishlist')} className={`px-4 py-2 rounded-lg font-semibold text-sm ${tab === 'wishlist' ? 'bg-orange-500 text-black' : 'bg-slate-800 text-slate-300'}`}>Wishlist ({wishlistStories.length})</button>
      </div>

      {tab === 'library' && (
        myStories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {myStories.map(s => s && (
              <Link key={s.id} href={`/story/${s.id}`} className="group">
                <div className={`aspect-square rounded-lg bg-gradient-to-br ${s.color} relative overflow-hidden mb-2`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                    </div>
                  </div>
                  {s.progress !== undefined && s.progress < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                      <div className="h-full bg-green-500" style={{width:`${s.progress}%`}}/>
                    </div>
                  )}
                  {s.progress === 100 && (
                    <div className="absolute top-2 right-2 text-green-400">✓</div>
                  )}
                </div>
                <h3 className="font-semibold text-white text-sm group-hover:text-orange-400">{s.title}</h3>
                <p className="text-xs text-orange-400">{s.genre}</p>
                <p className="text-xs text-slate-400">{s.author}</p>
                <p className="text-xs text-slate-500">{s.duration}</p>
                {s.progress !== undefined && s.progress > 0 && s.progress < 100 && (
                  <p className="text-xs text-green-400 mt-1">{Math.round(s.progress)}% complete</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-800/30 rounded-xl">
            <p className="text-slate-400">Your library is empty</p>
            <Link href="/library" className="text-orange-400 text-sm">Browse stories →</Link>
          </div>
        )
      )}

      {tab === 'wishlist' && (
        wishlistStories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {wishlistStories.map(s => (
              <div key={s.id} className="group">
                <Link href={`/story/${s.id}`}>
                  <div className={`aspect-square rounded-lg bg-gradient-to-br ${s.color} relative overflow-hidden mb-2`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[7px] border-y-transparent ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 text-yellow-400">💫</div>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">{s.credits}cr</div>
                  </div>
                </Link>
                <Link href={`/story/${s.id}`}>
                  <h3 className="font-semibold text-white text-sm group-hover:text-orange-400">{s.title}</h3>
                </Link>
                <p className="text-xs text-orange-400">{s.genre}</p>
                <p className="text-xs text-slate-400">{s.author}</p>
                <p className="text-xs text-slate-500 mb-2">{s.duration}</p>
                <button 
                  onClick={() => toggleWishlist(s.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-800/30 rounded-xl">
            <p className="text-slate-400 mb-2">Your wishlist is empty</p>
            <p className="text-slate-500 text-sm">Browse stories and click 💫 to add them here</p>
            <Link href="/library" className="text-orange-400 text-sm block mt-2">Browse library →</Link>
          </div>
        )
      )}
    </>
  )
}

export default function MyLibraryPage() {
  return (
    <div className="py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">My Library</h1>
        <Suspense fallback={<div className="text-slate-400">Loading...</div>}>
          <Content />
        </Suspense>
      </div>
    </div>
  )
}
