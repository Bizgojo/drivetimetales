'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  duration_label: string
  cover_url: string
  audio_url: string
  rating: number
  price: number
  is_free: boolean
  created_at: string
  average_rating: number
}

interface LibraryItem {
  id: string
  story_id: string
  progress: number
  stories: Story
}

interface UserPreference {
  genre: string
}

// News categories
const NEWS_CATEGORIES = [
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-red-600 to-red-800' },
  { id: 'world', name: 'World', icon: '🌍', color: 'from-blue-600 to-blue-800' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-amber-700 to-amber-900' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-green-600 to-green-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

// Logo component
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="50" height="30" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-lg font-bold text-white">Drive Time </span>
        <span className="text-lg font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [newReleases, setNewReleases] = useState<Story[]>([])
  const [recommended, setRecommended] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<LibraryItem | null>(null)
  const [userPrefs, setUserPrefs] = useState<UserPreference[]>([])
  const [ownedStoryIds, setOwnedStoryIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [storiesError, setStoriesError] = useState<string | null>(null)

  useEffect(() => {
    loadStories()
  }, [])

  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user])

  async function loadStories() {
    console.log('[Home] Loading stories via API...')
    
    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('[Home] Stories loading timeout')
      setLoading(false)
      setStoriesError('Stories took too long to load. Please refresh.')
    }, 10000)
    
    try {
      // Use API route instead of direct Supabase (bypasses RLS issues)
      const response = await fetch('/api/stories')
      const allStories = await response.json()
      
      console.log('[Home] API returned', allStories.length, 'stories')
      
      if (allStories && allStories.length > 0) {
        // Sort by created_at for new releases (3 most recent)
        const sortedByDate = [...allStories].sort((a: Story, b: Story) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setNewReleases(sortedByDate.slice(0, 3))
        
        // Sort by rating for recommended (top 10)
        const sortedByRating = [...allStories].sort((a: Story, b: Story) => 
          (b.rating || 0) - (a.rating || 0)
        )
        setRecommended(sortedByRating.slice(0, 10))
      }
      
      clearTimeout(timeout)
    } catch (error) {
      console.error('[Home] Error loading stories:', error)
      clearTimeout(timeout)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserData() {
    if (!user) return
    
    console.log('[Home] Loading user data...')

    try {
      // Get continue listening
      const { data: libraryData } = await supabase
        .from('library')
        .select('*, stories(*)')
        .eq('user_id', user.id)
        .gt('progress', 0)
        .lt('progress', 100)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (libraryData) setContinueListening(libraryData)

      // Get user preferences
      const { data: prefsData } = await supabase
        .from('user_preferences')
        .select('genre')
        .eq('user_id', user.id)

      if (prefsData) setUserPrefs(prefsData)

      // Get owned stories
      const { data: purchasedData } = await supabase
        .from('purchases')
        .select('story_id')
        .eq('user_id', user.id)

      if (purchasedData) {
        setOwnedStoryIds(new Set(purchasedData.map(p => p.story_id)))
      }
    } catch (error) {
      console.error('[Home] Error loading user data:', error)
    }
  }

  function formatDuration(story: Story) {
    // Use duration_label if available, otherwise format duration_mins
    if (story.duration_label) return story.duration_label
    const minutes = story.duration_mins
    if (!minutes) return ''
    if (minutes < 60) return `${minutes}m`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/home">
            <Logo />
          </Link>
          
          <div className="flex items-center gap-4">
            {user ? (
              <Link href="/account" className="flex items-center gap-2 text-slate-300 hover:text-white">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold">
                  {user.display_name?.[0] || user.email?.[0]?.toUpperCase() || '?'}
                </div>
              </Link>
            ) : (
              <Link href="/signin" className="text-orange-400 hover:text-orange-300 font-medium">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Welcome */}
        <h1 className="text-2xl font-bold mb-6">
          Welcome back{user?.display_name ? `, ${user.display_name}` : ', there'}!
        </h1>

        {/* Daily News Briefings */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📰</span>
            <h2 className="text-lg font-bold">DAILY NEWS BRIEFINGS</h2>
          </div>
          <p className="text-slate-400 text-sm mb-4">Top 5 stories • Updated twice daily</p>
          
          <div className="grid grid-cols-5 gap-3">
            {NEWS_CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                href={`/news/${cat.id}`}
                className={`bg-gradient-to-br ${cat.color} rounded-xl p-4 text-center hover:scale-105 transition-transform`}
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-sm font-medium">{cat.name}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* New Releases */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="h-2 bg-orange-500 rounded animate-pulse"></div>
          ) : storiesError ? (
            <p className="text-red-400 text-sm">{storiesError}</p>
          ) : newReleases.length === 0 ? (
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}`}
                  className="bg-slate-900 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500 transition"
                >
                  <div className="aspect-[3/4] bg-slate-800 relative">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">📖</div>
                    )}
                    {story.is_free && (
                      <span className="absolute top-2 left-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">
                        FREE
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-sm line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{story.genre} • {formatDuration(story)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recommended */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : storiesError ? (
            <p className="text-red-400 text-sm">{storiesError}</p>
          ) : recommended.length === 0 ? (
            <p className="text-slate-400 text-sm">No recommendations yet. Browse our <Link href="/browse" className="text-orange-400 hover:underline">library</Link>.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {recommended.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}`}
                  className="bg-slate-900 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500 transition"
                >
                  <div className="aspect-[3/4] bg-slate-800 relative">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">📖</div>
                    )}
                    {ownedStoryIds.has(story.id) && (
                      <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                        OWNED
                      </span>
                    )}
                    {story.is_free && !ownedStoryIds.has(story.id) && (
                      <span className="absolute top-2 left-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">
                        FREE
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-sm line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{story.genre} • {formatDuration(story)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-yellow-400 text-xs">★</span>
                      <span className="text-xs text-slate-400">{story.average_rating?.toFixed(1) || story.rating?.toFixed(1) || '—'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Continue Listening */}
        {continueListening && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
            <Link
              href={`/player/${continueListening.story_id}/play`}
              className="flex items-center gap-4 bg-slate-900 rounded-xl p-4 hover:bg-slate-800 transition"
            >
              <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center">
                {continueListening.stories?.cover_url ? (
                  <img src={continueListening.stories.cover_url} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-2xl">📖</span>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{continueListening.stories?.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 bg-slate-700 rounded-full">
                    <div 
                      className="h-1 bg-orange-500 rounded-full" 
                      style={{ width: `${continueListening.progress}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-slate-400">{continueListening.progress}%</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            </Link>
          </section>
        )}

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-4 py-2">
          <div className="max-w-7xl mx-auto flex justify-around">
            <Link href="/home" className="flex flex-col items-center text-orange-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              <span className="text-xs mt-1">Home</span>
            </Link>
            <Link href="/browse" className="flex flex-col items-center text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-xs mt-1">Browse</span>
            </Link>
            <Link href="/library" className="flex flex-col items-center text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="text-xs mt-1">Library</span>
            </Link>
            <Link href="/account" className="flex flex-col items-center text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-1">Account</span>
            </Link>
          </div>
        </nav>
        
        {/* Spacer for bottom nav */}
        <div className="h-20"></div>
      </main>
    </div>
  )
}
