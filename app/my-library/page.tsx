'use client'

import { useState, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useStories } from '@/hooks/useData'

function MyLibraryContent() {
  const params = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'library')
  const { user } = useAuth()
  const { stories, loading, error } = useStories()
  
  const storyLookup = useMemo(() => {
    const lookup: Record<string, typeof stories[0]> = {}
    stories.forEach(story => {
      lookup[story.id] = story
    })
    return lookup
  }, [stories])

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-white mb-3">Sign In Required</h2>
        <Link href="/signin" className="px-6 py-2 bg-orange-500 text-black font-semibold rounded-lg inline-block">Sign In</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return <div className="py-12 text-center text-red-400">Error loading stories</div>
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">My Library</h1>
        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setTab('library')} 
            className={tab === 'library' ? 'px-4 py-2 rounded-lg font-medium bg-orange-500 text-black' : 'px-4 py-2 rounded-lg font-medium bg-slate-800 text-white'}
          >
            My Stories
          </button>
          <button 
            onClick={() => setTab('wishlist')} 
            className={tab === 'wishlist' ? 'px-4 py-2 rounded-lg font-medium bg-orange-500 text-black' : 'px-4 py-2 rounded-lg font-medium bg-slate-800 text-white'}
          >
            Wishlist
          </button>
        </div>
        {tab === 'library' && (
          <div className="text-center py-12">
            <h2 className="text-xl font-bold text-white mb-2">No Stories Yet</h2>
            <p className="text-slate-400 mb-6">Start listening to build your library!</p>
            <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Browse Stories</Link>
          </div>
        )}
        {tab === 'wishlist' && (
          <div className="text-center py-12">
            <h2 className="text-xl font-bold text-white mb-2">Wishlist Empty</h2>
            <p className="text-slate-400 mb-6">Save stories you want to listen to later!</p>
            <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Browse Stories</Link>
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
