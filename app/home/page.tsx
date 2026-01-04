'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  credits: number
  rating: number | null
  review_count: number | null
  is_free: boolean
  is_new: boolean
  is_dtt_pick: boolean
  is_best_seller: boolean
}

interface LibraryItem {
  story_id: string
  progress: number
  last_played: string
  completed: boolean
  story: Story
}

interface UserPreference {
  story_id: string
  wishlisted: boolean
  not_for_me: boolean
}

// Star Rating Component
function StarRating({ rating, count }: { rating: number | null, count: number | null }) {
  const r = rating || 0
  const fullStars = Math.floor(r)
  const hasHalf = r - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-orange-400 text-[10px]">{r.toFixed(1)}</span>
      <span className="text-yellow-400 text-[10px]">{'★'.repeat(fullStars)}</span>
      {hasHalf && <span className="text-yellow-400/50 text-[10px]">★</span>}
      <span className="text-slate-500 text-[10px]">{'★'.repeat(emptyStars)}</span>
      <span className="text-white text-[10px]">({count || 0})</span>
    </div>
  )
}

// Flag Badge Component
function FlagBadge({ type }: { type: 'free' | 'new' | 'dtt_pick' | 'best_seller' | 'owned' | 'wishlist' | 'pass' }) {
  const config = {
    free: { bg: 'bg-green-500', text: 'text-black', label: 'FREE' },
    new: { bg: 'bg-yellow-500', text: 'text-black', label: 'NEW' },
    dtt_pick: { bg: 'bg-orange-500', text: 'text-black', label: '⭐ DTT PICK' },
    best_seller: { bg: 'bg-blue-500', text: 'text-white', label: '🔥 BEST SELLER' },
    owned: { bg: 'bg-green-500', text: 'text-black', label: 'OWNED' },
    wishlist: { bg: 'bg-pink-500', text: 'text-white', label: '❤️ WISHLIST' },
    pass: { bg: 'bg-slate-500', text: 'text-white', label: '👎 PASS' },
  }
  const c = config[type]
  return <span className={`${c.bg} ${c.text} text-[8px] font-bold px-1 py-0.5 rounded`}>{c.label}</span>
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

  useEffect(() => {
    loadStories()
  }, [])

  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user])

  async function loadStories() {
    try {
      // Get new releases (3 most recent)
      const { data: newStories } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)

      if (newStories) setNewReleases(newStories)

      // Get recommended (next 6 stories for variety)
      const { data: recStories } = await supabase
        .from('stories')
        .select('*')
        .order('rating', { ascending: false })
        .limit(10)

      if (recStories) setRecommended(recStories)
    } catch (error) {
      console.error('Error loading stories:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserData() {
    if (!user) return

    try {
      // Get user's library (owned stories)
      const { data: library } = await supabase
        .from('user_library')
        .select('story_id, progress, last_played, completed, story:stories(*)')
        .eq('user_id', user.id)

      if (library) {
        const owned = new Set(library.map(item => item.story_id))
        setOwnedStoryIds(owned)

        // Find most recent unfinished story for "Continue Listening"
        const unfinished = library
          .filter(item => !item.completed && item.progress > 0 && item.story)
          .sort((a, b) => new Date(b.last_played).getTime() - new Date(a.last_played).getTime())[0]

        if (unfinished && unfinished.story && typeof unfinished.story === 'object' && !Array.isArray(unfinished.story)) {
          const storyData = unfinished.story as unknown as Record<string, unknown>
          setContinueListening({
            story_id: unfinished.story_id,
            progress: unfinished.progress,
            last_played: unfinished.last_played,
            completed: unfinished.completed,
            story: {
              id: String(storyData.id || ''),
              title: String(storyData.title || ''),
              author: storyData.author ? String(storyData.author) : null,
              genre: String(storyData.genre || ''),
              duration_mins: Number(storyData.duration_mins) || 0,
              cover_url: storyData.cover_url ? String(storyData.cover_url) : null,
              credits: Number(storyData.credits) || 1,
              rating: storyData.rating ? Number(storyData.rating) : null,
              review_count: storyData.review_count ? Number(storyData.review_count) : null,
              is_free: Boolean(storyData.is_free),
              is_new: Boolean(storyData.is_new),
              is_dtt_pick: Boolean(storyData.is_dtt_pick),
              is_best_seller: Boolean(storyData.is_best_seller),
            }
          })
        }
      }

      // Get user preferences (wishlist, not for me)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('story_id, wishlisted, not_for_me')
        .eq('user_id', user.id)

      if (prefs) setUserPrefs(prefs)
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  // Filter recommended stories (exclude owned, wishlist, pass) - but show all if no user
  const filteredRecommended = recommended.filter(story => {
    if (!user) return true // Show all if not logged in
    const pref = userPrefs.find(p => p.story_id === story.id)
    if (ownedStoryIds.has(story.id)) return false
    if (pref?.wishlisted) return false
    if (pref?.not_for_me) return false
    return true
  }).slice(0, 5)

  // Get flag for a story
  const getFlag = (story: Story): 'free' | 'new' | 'dtt_pick' | 'best_seller' | null => {
    if (story.is_free || story.credits === 0) return 'free'
    if (story.is_dtt_pick) return 'dtt_pick'
    if (story.is_best_seller) return 'best_seller'
    if (story.is_new) return 'new'
    return null
  }

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'there'
  const credits = user?.credits ?? 0
  const isLowCredits = user && credits !== -1 && credits <= 3

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-xl">🚛</span>
          <span className="text-xl">🚗</span>
          <span className="font-bold text-white ml-1">Drive</span>
          <span className="font-bold text-white">Time</span>
          <span className="font-bold text-orange-400">Tales</span>
        </Link>
        {user ? (
          <Link href="/account" className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold hover:bg-orange-400 transition">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        ) : (
          <Link href="/signin" className="text-orange-400 hover:text-orange-300 font-medium transition">Sign In</Link>
        )}
      </header>

      {/* Welcome Section */}
      <div className="px-4 py-3 bg-slate-900/50">
        <h1 className="text-xl font-bold text-white">Welcome back, {displayName}!</h1>
        {user && (
          <p className="text-white text-sm">
            You have <span className="text-orange-400 font-bold">{credits === -1 ? 'unlimited' : credits} credits</span>
          </p>
        )}
      </div>

      {/* Low Credits Warning */}
      {isLowCredits && (
        <Link 
          href="/pricing" 
          className="mx-4 mt-3 bg-orange-500/20 border border-orange-500/50 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-orange-500/30 transition"
        >
          <div>
            <p className="text-orange-400 font-medium">Running low on credits!</p>
            <p className="text-white text-sm">Get more to keep listening</p>
          </div>
          <span className="text-orange-400 font-bold">Buy More →</span>
        </Link>
      )}

      {/* Continue Listening */}
      {continueListening && (
        <section className="px-4 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Continue Listening</h2>
          <Link 
            href={`/player/${continueListening.story_id}/play?autoplay=true&resume=${continueListening.progress}`}
            className="bg-slate-700 rounded-xl p-3 flex items-center gap-3 hover:bg-slate-600 transition"
          >
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-600 flex-shrink-0">
              {continueListening.story.cover_url ? (
                <img src={continueListening.story.cover_url} alt={continueListening.story.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-orange-600 to-red-900 flex items-center justify-center">
                  <span className="text-xl">🎧</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{continueListening.story.title}</p>
              <p className="text-white text-xs">
                {Math.round((continueListening.progress / (continueListening.story.duration_mins * 60)) * 100)}% • {formatTime((continueListening.story.duration_mins * 60) - continueListening.progress)} remaining
              </p>
              <div className="h-1 bg-slate-600 rounded-full mt-1">
                <div 
                  className="h-full bg-orange-500 rounded-full" 
                  style={{ width: `${(continueListening.progress / (continueListening.story.duration_mins * 60)) * 100}%` }} 
                />
              </div>
            </div>
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-black text-lg ml-0.5">▶</span>
            </div>
          </Link>
        </section>
      )}

      {/* New Releases - 3 equal columns with light background */}
      <section className="px-4 py-4 border-b border-slate-800">
        <h2 className="text-sm font-bold text-white mb-3 uppercase tracking-wide">New Releases</h2>
        <div className="bg-slate-700 rounded-xl p-3">
          <div className="grid grid-cols-3 gap-3">
            {newReleases.map(story => (
              <Link key={story.id} href={`/player/${story.id}`} className="group">
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-600 mb-1">
                  {story.cover_url ? (
                    <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                      <span className="text-2xl opacity-50">🎧</span>
                    </div>
                  )}
                </div>
                <p className="text-white text-xs font-medium truncate">{story.title}</p>
                <p className="text-white text-[10px]">{story.duration_mins} min</p>
                <StarRating rating={story.rating} count={story.review_count} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended For You - Story blocks */}
      <section className="px-4 py-4 flex-1">
        <h2 className="text-sm font-bold text-white mb-3 uppercase tracking-wide">Recommended For You</h2>
        <div className="space-y-3">
          {filteredRecommended.map(story => {
            const flag = getFlag(story)
            return (
              <Link 
                key={story.id} 
                href={`/player/${story.id}`}
                className="bg-slate-700 rounded-xl p-3 flex gap-3 hover:bg-slate-600 transition"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-600 flex-shrink-0 relative">
                  {story.cover_url ? (
                    <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                      <span className="text-xl">🎧</span>
                    </div>
                  )}
                  <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                    {story.duration_mins}m
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{story.title}</p>
                  <p className="text-white text-xs">{story.genre} • {story.credits || 1} credit{(story.credits || 1) > 1 ? 's' : ''}</p>
                  <p className="text-white text-[10px]">by {story.author || 'Drive Time Tales'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StarRating rating={story.rating} count={story.review_count} />
                    {flag && <FlagBadge type={flag} />}
                  </div>
                </div>
              </Link>
            )
          })}
          {filteredRecommended.length === 0 && !loading && (
            <div className="bg-slate-700 rounded-xl p-6 text-center">
              <p className="text-white">No recommendations yet</p>
              <p className="text-white text-sm mt-1">Browse the library to discover stories!</p>
            </div>
          )}
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Sticky Bottom Buttons */}
      <div className="sticky bottom-0 px-4 py-3 bg-slate-950 border-t border-slate-800">
        <div className="flex gap-3">
          <Link 
            href="/library" 
            className="flex-1 py-3 bg-orange-500 text-black rounded-xl font-bold text-sm text-center hover:bg-orange-400 transition"
          >
            📚 Story Library
          </Link>
          <Link 
            href="/wishlist" 
            className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-bold text-sm text-center hover:bg-pink-400 transition"
          >
            ❤️ My Wishlist
          </Link>
        </div>
      </div>
    </div>
  )
}
