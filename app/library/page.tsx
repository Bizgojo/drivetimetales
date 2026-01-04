'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/ui/Header'

interface Story {
  id: string
  title: string
  author: string | null
  genre: string
  duration_mins: number
  cover_url: string | null
  credit_cost: number
}

interface UserPreference {
  story_id: string
  wishlisted: boolean
  not_for_me: boolean
}

interface LibraryEntry {
  story_id: string
  progress: number
  completed: boolean
}

function LibraryContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  
  const [stories, setStories] = useState<Story[]>([])
  const [preferences, setPreferences] = useState<Map<string, UserPreference>>(new Map())
  const [library, setLibrary] = useState<Map<string, LibraryEntry>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedGenre, setSelectedGenre] = useState<string>('All')
  const [toast, setToast] = useState<string | null>(null)
  
  const genres = ['All', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Comedy', 'Romance', 'Adventure', 'Thriller']

  useEffect(() => {
    loadData()
    
    // Check for toast message
    const toastParam = searchParams.get('toast')
    if (toastParam === 'wishlisted') {
      setToast('❤️ Added to Wishlist')
    } else if (toastParam === 'notforme') {
      setToast('👎 Marked as Not For Me')
    }
    
    // Clear toast after 3 seconds
    if (toastParam) {
      setTimeout(() => setToast(null), 3000)
    }
  }, [searchParams])

  async function loadData() {
    try {
      // Load stories
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, author, genre, duration_mins, cover_url, credit_cost')
        .order('created_at', { ascending: false })

      if (storiesData) setStories(storiesData)

      // Load user preferences and library
      if (user) {
        const { data: prefsData } = await supabase
          .from('user_preferences')
          .select('story_id, wishlisted, not_for_me')
          .eq('user_id', user.id)

        if (prefsData) {
          const prefsMap = new Map<string, UserPreference>()
          prefsData.forEach(p => prefsMap.set(p.story_id, p))
          setPreferences(prefsMap)
        }

        const { data: libData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', user.id)

        if (libData) {
          const libMap = new Map<string, LibraryEntry>()
          libData.forEach(l => libMap.set(l.story_id, l))
          setLibrary(libMap)
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter stories by genre and hide "not for me"
  const filteredStories = stories.filter(story => {
    const pref = preferences.get(story.id)
    // Hide stories marked as "not for me" unless specifically filtered
    if (pref?.not_for_me) return false
    // Filter by genre
    if (selectedGenre !== 'All' && story.genre !== selectedGenre) return false
    return true
  })

  const displayName = user?.display_name || user?.email?.split('@')[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header 
        isLoggedIn={!!user} 
        showBack 
        userName={displayName} 
        userCredits={user?.credits} 
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Genre Filter */}
      <div className="px-4 py-4 border-b border-slate-800 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {genres.map(genre => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                selectedGenre === genre
                  ? 'bg-orange-500 text-black'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Stories Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredStories.map(story => {
            const pref = preferences.get(story.id)
            const libEntry = library.get(story.id)
            const isOwned = !!libEntry
            const isWishlisted = pref?.wishlisted
            const progressPercent = libEntry && story.duration_mins 
              ? Math.round((libEntry.progress / (story.duration_mins * 60)) * 100)
              : 0

            return (
              <Link
                key={story.id}
                href={`/player/${story.id}`}
                className="group"
              >
                {/* Cover */}
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-800 relative mb-2">
                  {story.cover_url ? (
                    <img 
                      src={story.cover_url} 
                      alt={story.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
                      <span className="text-4xl opacity-50">🎧</span>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    {isOwned && (
                      <span className="bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded">
                        ✓
                      </span>
                    )}
                    {isWishlisted && !isOwned && (
                      <span className="bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                        ❤️
                      </span>
                    )}
                  </div>

                  {/* Progress bar for owned stories */}
                  {isOwned && progressPercent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
                      <div 
                        className="h-full bg-orange-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}

                  {/* Completed badge */}
                  {libEntry?.completed && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <h3 className="text-white text-sm font-medium line-clamp-2 group-hover:text-orange-400 transition">
                  {story.title}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  {story.genre} • {story.duration_mins} min
                  {!isOwned && <span className="text-orange-400"> • {story.credit_cost} cr</span>}
                </p>
              </Link>
            )
          })}
        </div>

        {filteredStories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400">No stories found</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LibraryContent />
    </Suspense>
  )
}
