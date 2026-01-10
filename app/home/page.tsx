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
  price_cents: number
  credits: number
  is_free: boolean
  created_at: string
  average_rating: number
  author: string
  is_new: boolean
}

interface LibraryItem {
  id: string
  story_id: string
  progress: number
  updated_at: string
  stories: Story
}

// News categories
const NEWS_CATEGORIES = [
  { id: 'local', name: 'Local & Weather', icon: '📍', color: 'from-sky-500 to-sky-700' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-red-700 to-red-900' },
  { id: 'world', name: 'World', icon: '🌍', color: 'from-blue-700 to-blue-900' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-amber-600 to-amber-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-emerald-600 to-emerald-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-violet-600 to-violet-800' },
]

export default function HomePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [newReleases, setNewReleases] = useState<Story[]>([])
  const [recommended, setRecommended] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<LibraryItem | null>(null)
  const [libraryCount, setLibraryCount] = useState(0)
  const [wishlistCount, setWishlistCount] = useState(0)
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
    
    const timeout = setTimeout(() => {
      console.log('[Home] Stories loading timeout')
      setLoading(false)
      setStoriesError('Stories took too long to load. Please refresh.')
    }, 10000)
    
    try {
      const response = await fetch('/api/stories')
      const allStories = await response.json()
      
      console.log('[Home] API returned', allStories.length, 'stories')
      
      if (allStories && allStories.length > 0) {
        const sortedByDate = [...allStories].sort((a: Story, b: Story) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setNewReleases(sortedByDate.slice(0, 3))
        
        const sortedByRating = [...allStories].sort((a: Story, b: Story) => 
          (b.average_rating || b.rating || 0) - (a.average_rating || a.rating || 0)
        )
        setRecommended(sortedByRating.slice(0, 4))
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

      const { count: libCount } = await supabase
        .from('library')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setLibraryCount(libCount || 0)

      const { count: wishCount } = await supabase
        .from('wishlist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setWishlistCount(wishCount || 0)

    } catch (error) {
      console.error('[Home] Error loading user data:', error)
    }
  }

  function formatDuration(story: Story) {
    if (story.duration_label) return story.duration_label
    const minutes = story.duration_mins
    if (!minutes) return ''
    if (minutes < 60) return `${minutes} min`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
  }

  function formatGenre(genre: string | null) {
    if (!genre || genre.includes('not set') || genre.includes('Tab')) {
      return 'Audio Drama'
    }
    return genre
  }

  function formatCredits(story: Story) {
    if (story.is_free) return 'FREE'
    const credits = story.credits || Math.ceil((story.price_cents || 0) / 100)
    if (credits === 0) return 'FREE'
    return `${credits} credit${credits > 1 ? 's' : ''}`
  }

  function formatReleaseDate(dateStr: string) {
    const date = new Date(dateStr)
    return `Released ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  function renderStarRating(rating: number) {
    const fullStars = Math.floor(rating)
    const stars = []
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<span key={i} className="text-yellow-400">★</span>)
      } else {
        stars.push(<span key={i} className="text-slate-500">★</span>)
      }
    }
    return stars
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <span className="text-2xl">🚗</span>
            <span className="text-lg font-bold">Drive Time <span className="text-orange-500">Tales</span></span>
          </Link>
          
          {user ? (
            <Link href="/account" className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold">
              {user.display_name?.[0] || user.email?.[0]?.toUpperCase() || '?'}
            </Link>
          ) : (
            <Link href="/signin" className="text-orange-400 hover:text-orange-300 font-medium">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-48">
        
        {/* Welcome + Credits */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            Welcome back{user?.display_name ? `, ${user.display_name}` : ''}!
          </h1>
          {user && (
            <p className="text-white text-sm">
              {user.subscription_type === 'unlimited' 
                ? 'You have unlimited credits' 
                : `You have ${user.credits || 0} credits`}
            </p>
          )}
        </div>

        {/* Daily News Briefings */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📰</span>
            <h2 className="text-lg font-bold">DAILY NEWS BRIEFINGS</h2>
          </div>
          <p className="text-white text-sm mb-4">Top stories updated thrice daily (no credits required)</p>
          
          {/* Row 1 */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {NEWS_CATEGORIES.slice(0, 3).map((cat) => (
              <Link
                key={cat.id}
                href={`/news/${cat.id}`}
                className={`bg-gradient-to-br ${cat.color} rounded-lg py-2 px-3 flex items-center gap-2 hover:scale-105 transition-transform`}
              >
                <span className="text-xl bg-white/20 rounded-full p-1">{cat.icon}</span>
                <span className="text-sm font-medium text-white">{cat.name}</span>
              </Link>
            ))}
          </div>
          {/* Row 2 */}
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.slice(3, 6).map((cat) => (
              <Link
                key={cat.id}
                href={`/news/${cat.id}`}
                className={`bg-gradient-to-br ${cat.color} rounded-lg py-2 px-3 flex items-center gap-2 hover:scale-105 transition-transform`}
              >
                <span className="text-xl bg-white/20 rounded-full p-1">{cat.icon}</span>
                <span className="text-sm font-medium text-white">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Continue Listening - always show (placeholder if no unfinished) */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
          {continueListening ? (
            <Link
              href={`/player/${continueListening.story_id}`}
              className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-28"
            >
              <div className="p-2 flex-shrink-0 w-24">
                <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4), 0 0 24px rgba(255, 255, 255, 0.2)' }}>
                  {continueListening.stories?.cover_url ? (
                    <img 
                      src={continueListening.stories.cover_url} 
                      alt={continueListening.stories.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                  )}
                </div>
              </div>
              <div className="flex-1 p-3 flex flex-col justify-center">
                <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1">{continueListening.stories?.title}</h3>
                <p className="text-white text-xs mb-0.5">{formatGenre(continueListening.stories?.genre)}</p>
                <p className="text-white text-xs mb-2">{formatDuration(continueListening.stories as Story)} • {formatCredits(continueListening.stories as Story)}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-600 rounded-full">
                    <div 
                      className="h-1.5 bg-orange-500 rounded-full" 
                      style={{ width: `${continueListening.progress}%` }}
                    ></div>
                  </div>
                  <span className="text-white text-xs">{continueListening.progress}%</span>
                </div>
              </div>
              <div className="p-3 flex items-center">
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex bg-slate-800 rounded-xl overflow-hidden h-28">
              <div className="p-2 flex-shrink-0 w-24">
                <div className="rounded-lg overflow-hidden h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
              </div>
              <div className="flex-1 p-3 flex flex-col justify-center">
                <p className="text-slate-400 text-sm">No stories in progress</p>
                <p className="text-slate-500 text-xs">Start listening to see your progress here</p>
              </div>
            </div>
          )}
        </section>

        {/* New Releases */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : storiesError ? (
            <p className="text-red-400 text-sm">{storiesError}</p>
          ) : newReleases.length === 0 ? (
            <p className="text-white text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div 
                    className="rounded-xl overflow-hidden"
                    style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)' }}
                  >
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url} 
                        alt={story.title}
                        className="w-full aspect-[3/4] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-slate-800 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  <div className="mt-2">
                    <h3 className="font-medium text-sm text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{formatGenre(story.genre)}</p>
                    <p className="text-white text-xs">By {story.author || 'Drive Time Tales'}</p>
                    <p className="text-white text-xs">{formatDuration(story)} • {formatCredits(story)}</p>
                    <p className="text-white text-xs opacity-70">{formatReleaseDate(story.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recommended For You */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : storiesError ? (
            <p className="text-red-400 text-sm">{storiesError}</p>
          ) : recommended.length === 0 ? (
            <p className="text-white text-sm">No recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {recommended.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}`}
                  className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-32"
                >
                  <div className="p-2 flex-shrink-0 w-28">
                    <div 
                      className="rounded-lg overflow-hidden h-full w-full"
                      style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4), 0 0 24px rgba(255, 255, 255, 0.2)' }}
                    >
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs mb-0.5">{formatGenre(story.genre)}</p>
                    <p className="text-white text-xs mb-0.5">By {story.author || 'Drive Time Tales'}</p>
                    <p className="text-white text-xs mb-1">{formatDuration(story)} • {formatCredits(story)}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex text-xs">
                        {renderStarRating(story.average_rating || story.rating || 0)}
                      </div>
                      <span className="text-white text-xs">
                        {(story.average_rating || story.rating || 0).toFixed(1)}
                      </span>
                      {story.is_free && (
                        <span className="ml-auto bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded">FREE</span>
                      )}
                      {story.is_new && !story.is_free && (
                        <span className="ml-auto bg-orange-500 text-black text-xs font-bold px-2 py-0.5 rounded">NEW</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Sticky Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 mb-3">
            <Link 
              href="/library" 
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition"
            >
              Go To Library ({libraryCount})
            </Link>
            {wishlistCount > 0 && (
              <Link 
                href="/wishlist" 
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition"
              >
                Go To Wishlist ({wishlistCount})
              </Link>
            )}
          </div>
          <Link 
            href="/share" 
            className="block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl text-center transition"
          >
            Share With A Friend - Its A Win Win
          </Link>
        </div>
      </div>

    </div>
  )
}
