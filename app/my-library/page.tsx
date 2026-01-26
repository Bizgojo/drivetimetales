'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  credits?: number
}

interface UserStory {
  story_id: string
  progress_seconds: number
  completed: boolean
  last_played_at: string
}

function MyLibraryContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'library')
  const { user } = useAuth()
  const [ownedStories, setOwnedStories] = useState<Story[]>([])
  const [userProgress, setUserProgress] = useState<Record<string, UserStory>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUserLibrary() {
      if (!user?.id) {
        setLoading(false)
        return
      }

      try {
        // Fetch user's story progress/history
        const { data: progressData } = await supabase
          .from('user_stories')
          .select('story_id, progress_seconds, completed, last_played_at')
          .eq('user_id', user.id)
          .order('last_played_at', { ascending: false })

        if (progressData && progressData.length > 0) {
          // Build progress lookup
          const progressLookup: Record<string, UserStory> = {}
          progressData.forEach(p => {
            progressLookup[p.story_id] = p
          })
          setUserProgress(progressLookup)

          // Fetch story details for owned stories
          const storyIds = progressData.map(p => p.story_id)
          const { data: storiesData } = await supabase
            .from('stories')
            .select('id, title, genre, author, duration_mins, cover_url, credits')
            .in('id', storyIds)

          if (storiesData) {
            // Sort by last played
            const sorted = storiesData.sort((a, b) => {
              const aTime = progressLookup[a.id]?.last_played_at || ''
              const bTime = progressLookup[b.id]?.last_played_at || ''
              return bTime.localeCompare(aTime)
            })
            setOwnedStories(sorted)
          }
        }
      } catch (err) {
        console.error('Error fetching library:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchUserLibrary()
  }, [user])

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <StickyHeaderFull />
        <div className="text-center py-12">
          <span className="text-4xl block mb-4">🔒</span>
          <h2 className="text-xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">Sign in to access your library</p>
          <Link href="/signin" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="py-12 flex justify-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const inProgressStories = ownedStories.filter(s => {
    const progress = userProgress[s.id]
    return progress && !progress.completed && progress.progress_seconds > 0
  })

  const completedStories = ownedStories.filter(s => {
    const progress = userProgress[s.id]
    return progress?.completed
  })

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <StickyHeaderFull />
      
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">My Library</h1>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setTab('library')} 
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'library' ? 'bg-orange-500 text-black' : 'bg-slate-700 text-white'
            }`}
          >
            My Stories
          </button>
          <button 
            onClick={() => router.push('/wishlist')} 
            className="px-4 py-2 rounded-lg font-medium bg-slate-700 text-white"
          >
            Wishlist
          </button>
        </div>

        {/* In Progress Section */}
        {inProgressStories.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">📖 Continue Listening</h2>
            <div className="space-y-3">
              {inProgressStories.map(story => {
                const progress = userProgress[story.id]
                const progressPercent = Math.round((progress.progress_seconds / (story.duration_mins * 60)) * 100)
                return (
                  <Link 
                    key={story.id} 
                    href={`/player/${story.id}`}
                    className="bg-slate-800 rounded-xl p-3 flex gap-3 hover:bg-slate-700 transition block"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative">
                      {story.cover_url ? (
                        <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                          <span className="text-2xl">🎧</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{story.title}</p>
                      <p className="text-slate-400 text-xs">{story.genre} • {story.duration_mins}m</p>
                      <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 rounded-full" 
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-slate-500 text-[10px] mt-1">{progressPercent}% complete</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Completed Section */}
        {completedStories.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">✅ Completed</h2>
            <div className="space-y-3">
              {completedStories.map(story => (
                <Link 
                  key={story.id} 
                  href={`/player/${story.id}`}
                  className="bg-slate-800 rounded-xl p-3 flex gap-3 hover:bg-slate-700 transition block"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                        <span className="text-2xl">🎧</span>
                      </div>
                    )}
                    <div className="absolute top-1 right-1 bg-green-500 rounded-full w-5 h-5 flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{story.title}</p>
                    <p className="text-slate-400 text-xs">{story.genre} • {story.duration_mins}m</p>
                    <p className="text-green-400 text-xs mt-1">Completed</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {ownedStories.length === 0 && (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Yet</h2>
            <p className="text-slate-400 mb-6">Start listening to build your library!</p>
            <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">
              Browse Stories
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MyLibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MyLibraryContent />
    </Suspense>
  )
}
