'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string | null
  genre: string
  duration_mins: number
  cover_url: string | null
}

interface LibraryItem {
  story_id: string
  progress: number
  last_played: string
  completed: boolean
  story: Story
}

export default function HomePage() {
  const { user } = useAuth()
  const [recentStories, setRecentStories] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    try {
      const { data: stories } = await supabase
        .from('stories')
        .select('id, title, author, genre, duration_mins, cover_url')
        .order('created_at', { ascending: false })
        .limit(10)

      if (stories) setRecentStories(stories)

      if (user) {
        const { data: library } = await supabase
          .from('user_library')
          .select('story_id, progress, last_played, completed, story:stories(id, title, author, genre, duration_mins, cover_url)')
          .eq('user_id', user.id)
          .eq('completed', false)
          .gt('progress', 0)
          .order('last_played', { ascending: false })
          .limit(5)

        if (library) {
          const items: LibraryItem[] = []
          for (const item of library) {
            if (item.story && typeof item.story === 'object' && !Array.isArray(item.story)) {
              const storyData = item.story as Record<string, unknown>
              items.push({
                story_id: item.story_id,
                progress: item.progress,
                last_played: item.last_played,
                completed: item.completed,
                story: {
                  id: storyData.id as string,
                  title: storyData.title as string,
                  author: storyData.author as string | null,
                  genre: storyData.genre as string,
                  duration_mins: storyData.duration_mins as number,
                  cover_url: storyData.cover_url as string | null
                }
              })
            }
          }
          setContinueListening(items)
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'there'
  const displayCredits = user?.credits === -1 ? 'unlimited' : user?.credits

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-xl">🚛🚗</span>
          <span className="font-bold text-lg">Drive Time<span className="text-orange-400">Tales</span></span>
        </Link>
        {user ? (
          <Link href="/account" className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold hover:bg-orange-400 transition">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        ) : (
          <Link href="/auth/login" className="text-orange-400 hover:text-orange-300 font-medium transition">Sign In</Link>
        )}
      </header>

      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">Welcome back, {displayName}!</h1>
        {user && <p className="text-slate-400">You have <span className="text-orange-400 font-medium">{displayCredits} credits</span></p>}
      </div>

      {continueListening.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between px-4 mb-4">
            <h2 className="text-lg font-bold">Continue Listening</h2>
          </div>
          <div className="overflow-x-auto px-4">
            <div className="flex gap-4 min-w-max">
              {continueListening.map(item => {
                const progressPercent = Math.round((item.progress / (item.story.duration_mins * 60)) * 100)
                return (
                  <Link key={item.story_id} href={`/player/${item.story_id}/play?autoplay=true&resume=${item.progress}`} className="w-40 flex-shrink-0 group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-slate-800 relative mb-2">
                      {item.story.cover_url ? (
                        <img src={item.story.cover_url} alt={item.story.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
                          <span className="text-4xl opacity-50">🎧</span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
                        <div className="h-full bg-orange-500" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                    <h3 className="text-white text-sm font-medium line-clamp-2 group-hover:text-orange-400 transition">{item.story.title}</h3>
                    <p className="text-slate-400 text-xs mt-1">{progressPercent}% complete</p>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between px-4 mb-4">
          <h2 className="text-lg font-bold">Recently Added</h2>
          <Link href="/library" className="text-orange-400 hover:text-orange-300 text-sm">Browse All</Link>
        </div>
        <div className="overflow-x-auto px-4">
          <div className="flex gap-4 min-w-max">
            {recentStories.map(story => (
              <Link key={story.id} href={`/player/${story.id}`} className="w-40 flex-shrink-0 group">
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-800 relative mb-2">
                  {story.cover_url ? (
                    <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
                      <span className="text-4xl opacity-50">🎧</span>
                    </div>
                  )}
                </div>
                <h3 className="text-white text-sm font-medium line-clamp-2 group-hover:text-orange-400 transition">{story.title}</h3>
                <p className="text-slate-400 text-xs mt-1">{story.genre} - {story.duration_mins} min</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
