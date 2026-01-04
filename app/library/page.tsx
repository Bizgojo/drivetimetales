'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
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

// Star Rating Component
function StarRating({ rating, count, dark = false }: { rating: number | null, count: number | null, dark?: boolean }) {
  const r = rating || 0
  const fullStars = Math.floor(r)
  const hasHalf = r - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  
  return (
    <div className="flex items-center gap-0.5">
      <span className={`${dark ? 'text-orange-600' : 'text-orange-400'} text-[10px]`}>{r.toFixed(1)}</span>
      <span className="text-yellow-500 text-[10px]">{'★'.repeat(fullStars)}</span>
      {hasHalf && <span className="text-yellow-500/50 text-[10px]">★</span>}
      <span className={`${dark ? 'text-slate-400' : 'text-slate-500'} text-[10px]`}>{'★'.repeat(emptyStars)}</span>
      <span className={`${dark ? 'text-slate-700' : 'text-white'} text-[10px]`}>({count || 0})</span>
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

const genreOptions = [
  { name: 'All', icon: '📚' },
  { name: 'Mystery', icon: '🔍' },
  { name: 'Drama', icon: '🎭' },
  { name: 'Sci-Fi', icon: '🚀' },
  { name: 'Horror', icon: '👻' },
  { name: 'Thriller', icon: '😱' },
  { name: 'Non-Fiction', icon: '📖' },
  { name: 'Children', icon: '👶' },
  { name: 'Comedy', icon: '😂' },
  { name: 'Romance', icon: '💕' },
]

const durationOptions = [
  { name: 'All', label: 'All' },
  { name: '15', label: '~15 min' },
  { name: '30', label: '~30 min' },
  { name: '60', label: '~1 hr' },
]

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  
  const [stories, setStories] = useState<Story[]>([])
  const [preferences, setPreferences] = useState<Map<string, UserPreference>>(new Map())
  const [library, setLibrary] = useState<Map<string, LibraryEntry>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedGenre, setSelectedGenre] = useState<string>('All')
  const [selectedDuration, setSelectedDuration] = useState<string>('All')

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    try {
      // Load all stories
      const { data: storiesData } = await supabase
        .from('stories')
        .select('*')
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

  // Filter stories
  const filteredStories = stories.filter(story => {
    // Genre filter
    if (selectedGenre !== 'All') {
      const storyGenre = story.genre?.toLowerCase() || ''
      const filterGenre = selectedGenre.toLowerCase()
      if (!storyGenre.includes(filterGenre) && filterGenre !== 'all') return false
    }
    
    // Duration filter
    if (selectedDuration !== 'All') {
      const mins = story.duration_mins
      if (selectedDuration === '15' && mins > 20) return false
      if (selectedDuration === '30' && (mins < 20 || mins > 45)) return false
      if (selectedDuration === '60' && mins < 45) return false
    }
    
    return true
  })

  // Get flag for a story
  const getFlag = (story: Story): 'free' | 'new' | 'dtt_pick' | 'best_seller' | 'owned' | 'wishlist' | 'pass' | null => {
    const pref = preferences.get(story.id)
    const libEntry = library.get(story.id)
    
    // User status flags take priority
    if (libEntry) return 'owned'
    if (pref?.wishlisted) return 'wishlist'
    if (pref?.not_for_me) return 'pass'
    
    // Story flags
    if (story.is_free || story.credits === 0) return 'free'
    if (story.is_dtt_pick) return 'dtt_pick'
    if (story.is_best_seller) return 'best_seller'
    if (story.is_new) return 'new'
    
    return null
  }

  const displayName = user?.display_name || user?.email?.split('@')[0]
  const credits = user?.credits ?? 0
  const isLowCredits = user && credits !== -1 && credits <= 3

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <button onClick={() => router.back()} className="text-white flex items-center gap-1">
          <span>←</span>
          <span className="text-sm">Back</span>
        </button>
        <div className="text-center">
          <div className="flex items-center gap-1 justify-center">
            <span className="text-lg">🚛</span>
            <span className="text-lg">🚗</span>
            <span className="font-bold text-white text-sm ml-1">Drive</span>
            <span className="font-bold text-white text-sm">Time</span>
            <span className="font-bold text-orange-400 text-sm">Tales</span>
          </div>
          {user && (
            <p className="text-white text-[10px]">
              <span className="text-orange-400 font-bold">{credits === -1 ? 'unlimited' : credits} credits</span>
            </p>
          )}
        </div>
        {user ? (
          <Link href="/account" className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm hover:bg-orange-400 transition">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        ) : (
          <Link href="/signin" className="text-orange-400 text-sm">Sign In</Link>
        )}
      </header>

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

      {/* Genre Filter */}
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="flex flex-wrap justify-center gap-1">
          {genreOptions.map(g => (
            <button
              key={g.name}
              onClick={() => setSelectedGenre(g.name)}
              className={`flex flex-col items-center px-2 py-1 rounded-lg transition ${
                selectedGenre === g.name
                  ? 'bg-orange-500 text-black'
                  : 'bg-slate-700 text-white'
              }`}
            >
              <span className="text-sm">{g.icon}</span>
              <span className="text-[9px]">{g.name === 'Non-Fiction' ? 'Non-Fic' : g.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration Filter */}
      <div className="px-4 py-2 border-b border-slate-800">
        <div className="flex justify-center gap-2">
          {durationOptions.map(d => (
            <button
              key={d.name}
              onClick={() => setSelectedDuration(d.name)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                selectedDuration === d.name
                  ? 'bg-orange-500 text-black'
                  : 'bg-slate-700 text-white border border-slate-600'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Story List */}
      <div className="px-4 py-4 flex-1 space-y-3">
        {filteredStories.map(story => {
          const flag = getFlag(story)
          const pref = preferences.get(story.id)
          const isPass = pref?.not_for_me
          
          return (
            <Link
              key={story.id}
              href={`/player/${story.id}`}
              className={`bg-gray-400 rounded-xl p-3 flex gap-3 hover:bg-gray-300 transition ${isPass ? 'opacity-60' : ''}`}
            >
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-500 flex-shrink-0 relative">
                {story.cover_url ? (
                  <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                    <span className="text-2xl">🎧</span>
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                  {story.duration_mins}m
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black font-bold text-sm truncate">{story.title}</p>
                <p className="text-slate-800 text-xs">{story.genre} • {story.credits || 1} credit{(story.credits || 1) > 1 ? 's' : ''}</p>
                <p className="text-slate-700 text-[10px]">by {story.author || 'Drive Time Tales'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating rating={story.rating} count={story.review_count} dark />
                  {flag && <FlagBadge type={flag} />}
                </div>
              </div>
            </Link>
          )
        })}

        {filteredStories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white">No stories found</p>
            <p className="text-white text-sm mt-2">Try a different filter</p>
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
