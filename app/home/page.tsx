/**
 * ============================================================================
 * DTT Working Code Library - 02_HomePage/COMPLETE_HomePage.tsx
 * ============================================================================
 * 
 * CURRENT VERSION: 2026-01-16 8:30pm
 * STATUS: ASSEMBLED FROM PROTECTED MODULES
 * 
 * VERSION HISTORY:
 * - 2026-01-16 8:30pm - Rebuilt from all protected modules
 * - 2026-01-15 4:00pm - Previous working version
 * 
 * ASSEMBLED FROM:
 *   - 02_HomePage/b_WelcomeCredits.tsx (PROTECTED)
 *   - 02_HomePage/c_NewsBriefings.tsx (PROTECTED)
 *   - 02_HomePage/ContinueListening.protected.tsx (PROTECTED)
 *   - 02_HomePage/NewReleases.protected.tsx (PROTECTED)
 *   - 02_HomePage/HorizontalStoryCard.protected.tsx (PROTECTED)
 *   - 02_HomePage/BottomStickyButtons.protected.tsx (PROTECTED)
 * 
 * DEPENDS ON:
 *   - users table (first_name, display_name, credits, state)
 *   - stories table (id, title, author, genre, duration_mins, credits, cover_url, published_on)
 *   - user_library table (for Continue Listening)
 *   - news_episodes table
 * 
 * CRITICAL NOTES:
 *   - user_library table for Continue Listening (NOT play_history)
 *   - stories table does NOT have rating or created_at
 *   - News Briefings are FREE (no credit check)
 *   - All text is WHITE (not gray)
 * 
 * ============================================================================
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// SUPABASE CLIENT
// ============================================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================================================
// INTERFACES
// ============================================================================
interface Story {
  id: string
  title: string
  genre: string
  duration_mins: number
  cover_url: string | null
  credits: number
  author: string
  published_on: string | null
}

interface ContinueListeningItem {
  story_id: string
  progress: number
  last_played: string
  completed: boolean
  stories: {
    id: string
    title: string
    author: string
    genre: string
    duration_mins: number
    cover_url: string | null
  }
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

// ============================================================================
// PROTECTED: STATE NAME MAPPING
// ============================================================================
const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

// ============================================================================
// PROTECTED: NEWS CATEGORIES - FIXED ORDER AND COLORS - DO NOT CHANGE
// Order: State (red) → National (blue) → World (green) → Business (yellow) → Sports (orange) → Sci/Tech (purple)
// ============================================================================
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-blue-600 to-blue-800' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-green-600 to-green-800' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-yellow-600 to-yellow-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-600 to-orange-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

// ============================================================================
// HELPER: Format date as "Jan 16, 2026"
// ============================================================================
const formatDate = (dateString: string | null): string => {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  } catch {
    return ''
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function HomePage() {
  const router = useRouter()

  // Auth state
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('State')

  // Content state
  const [stories, setStories] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<ContinueListeningItem | null>(null)
  const [loading, setLoading] = useState(true)

  // News state
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [playingCategory, setPlayingCategory] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ============================================================================
  // AUTH & PROFILE LOADING
  // ============================================================================
  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session?.user) {
          router.push('/signin')
          return
        }

        setCurrentUser(session.user)

        // Load user profile
        const { data: profile, error } = await supabase
          .from('users')
          .select('first_name, display_name, credits, state')
          .eq('id', session.user.id)
          .single()
        
        if (profile && !error) {
          const name = profile.first_name 
            || profile.display_name?.split(' ')[0] 
            || session.user.email?.split('@')[0] 
            || 'friend'
          setDisplayName(name)
          setUserCredits(profile.credits || 0)
          
          if (profile.state) {
            if (profile.state.length === 2) {
              setUserState(STATE_NAMES[profile.state.toUpperCase()] || profile.state)
            } else {
              setUserState(profile.state)
            }
          }
        }

        // Load Continue Listening
        await loadContinueListening(session.user.id)

      } catch (err) {
        console.error('[Home] Auth error:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    init()
  }, [router])

  // ============================================================================
  // CONTINUE LISTENING - From user_library table (NOT play_history!)
  // ============================================================================
  async function loadContinueListening(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_library')
        .select(`
          story_id,
          progress,
          last_played,
          completed,
          stories (
            id,
            title,
            author,
            genre,
            duration_mins,
            cover_url
          )
        `)
        .eq('user_id', userId)
        .eq('completed', false)
        .gt('progress', 0)
        .order('last_played', { ascending: false })
        .limit(1)
        .single()

      if (data && !error) {
        setContinueListening(data as ContinueListeningItem)
        console.log('[Home] Continue listening loaded:', data)
      }
    } catch (err) {
      console.log('[Home] No continue listening story found')
    }
  }

  // ============================================================================
  // LOAD STORIES - Order by published_on DESC (newest first)
  // ============================================================================
  useEffect(() => {
    async function loadStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, duration_mins, cover_url, credits, author, published_on')
          .order('published_on', { ascending: false, nullsFirst: false })
          .limit(12)
        
        if (data && !error) {
          setStories(data)
        }
      } catch (err) {
        console.error('[Home] Stories error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadStories()
  }, [])

  // ============================================================================
  // LOAD NEWS EPISODES
  // ============================================================================
  useEffect(() => {
    async function loadNews() {
      try {
        const { data } = await supabase
          .from('news_episodes')
          .select('id, category, audio_url, is_live')
          .eq('is_live', true)
        
        if (data) {
          const episodeMap: Record<string, NewsEpisode> = {}
          data.forEach(ep => { episodeMap[ep.category] = ep })
          setNewsEpisodes(episodeMap)
        }
      } catch (err) {
        console.error('[Home] News error:', err)
      }
    }
    loadNews()
  }, [])

  // ============================================================================
  // NEWS BRIEFING PLAYBACK - News Briefings are FREE!
  // ============================================================================
  const handlePlayNews = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    if (!episode?.audio_url) return

    // Stop current audio if different category
    if (playingCategory && playingCategory !== categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }

    // Toggle play/pause for same category
    if (playingCategory === categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingCategory(null)
      return
    }

    // Play new category
    audioRef.current = new Audio(episode.audio_url)
    audioRef.current.onended = () => {
      setPlayingCategory(null)
      audioRef.current = null
    }
    audioRef.current.play()
    setPlayingCategory(categoryId)
  }

  // ============================================================================
  // HELPER: Get state display name
  // ============================================================================
  const getStateName = () => {
    if (!userState || userState === 'State') return 'State'
    return userState
  }

  // ============================================================================
  // HELPER: Calculate progress values for Continue Listening
  // ============================================================================
  const getProgressValues = () => {
    if (!continueListening || !continueListening.stories) return { percent: 0, minsRemaining: 0, resumePosition: 0 }
    
    const totalSeconds = continueListening.stories.duration_mins * 60
    const percent = totalSeconds > 0 ? Math.round((continueListening.progress / totalSeconds) * 100) : 0
    const secondsRemaining = totalSeconds - continueListening.progress
    const minsRemaining = Math.max(1, Math.ceil(secondsRemaining / 60))
    const resumePosition = Math.max(0, continueListening.progress - 5) // Rewind 5 seconds
    
    return { percent, minsRemaining, resumePosition }
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const progressValues = getProgressValues()

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ================================================================== */}
      {/* HEADER - No back button on Home Page */}
      {/* ================================================================== */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
        <div className="w-14"></div>
        <div className="flex items-center gap-1">
          <span className="text-2xl">🚗</span>
          <span className="font-bold text-white text-sm ml-1">
            Drive Time <span className="text-orange-400">Tales</span>
          </span>
        </div>
        <div className="w-14 flex justify-end">
          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* MAIN CONTENT - pb-24 for sticky buttons */}
      {/* ================================================================== */}
      <main className="pb-24">

        {/* ================================================================ */}
        {/* WELCOME + CREDITS (from b_WelcomeCredits.tsx) */}
        {/* ================================================================ */}
        <section className="px-4 py-6">
          <h1 className="text-2xl font-bold text-white text-left">Welcome back, {displayName}!</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-white text-left">
              You have <span className="text-orange-400 font-bold">{userCredits}</span> credits in your account.
            </p>
            {userCredits === 0 && (
              <Link 
                href="/pricing"
                className="bg-orange-500 hover:bg-orange-400 text-black font-bold px-4 py-2 rounded-lg transition whitespace-nowrap"
              >
                Get More Credits
              </Link>
            )}
          </div>
        </section>

        {/* ================================================================ */}
        {/* NEWS BRIEFINGS (from c_NewsBriefings.tsx) - PROTECTED */}
        {/* Order: State (red) → National (blue) → World (green) → Business (yellow) → Sports (orange) → Sci/Tech (purple) */}
        {/* ================================================================ */}
        <section className="px-4 pb-6">
          <h2 className="text-lg font-bold text-white mb-4">📰 News Briefings</h2>
          <p className="text-white text-sm mb-3">News Briefings are Free!</p>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map((cat) => {
              const episode = newsEpisodes[cat.id]
              const isAvailable = episode?.audio_url
              const isPlaying = playingCategory === cat.id
              const displayCatName = cat.id === 'state' ? getStateName() : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => isAvailable && handlePlayNews(cat.id)}
                  disabled={!isAvailable}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    isAvailable 
                      ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` 
                      : 'bg-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="text-2xl mb-1">{cat.icon}</div>
                  <div className="text-white text-xs font-medium">{displayCatName}</div>
                  {/* Status indicator: green dot = available, red dot = unavailable, pulsing green = playing */}
                  <div className="absolute top-2 right-2">
                    {isPlaying ? (
                      <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse inline-block"></span>
                    ) : isAvailable ? (
                      <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
                    ) : (
                      <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* ================================================================ */}
        {/* CONTINUE LISTENING (from ContinueListening.protected.tsx) - PROTECTED */}
        {/* Only shows if user has uncompleted story with progress > 0 */}
        {/* ================================================================ */}
        {continueListening && continueListening.stories && (
          <section className="px-4 pt-6 pb-4">
            <h2 className="text-lg font-bold text-white mb-4">▶️ Continue Listening</h2>
            
            <Link 
              href={`/player/${continueListening.story_id}/play?resume=${progressValues.resumePosition}`}
              className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
            >
              {/* Cover: w-28 h-28 with p-2 padding */}
              <div className="w-28 h-28 flex-shrink-0 p-2">
                <div className="w-full h-full rounded-lg overflow-hidden" style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}>
                  {continueListening.stories.cover_url ? (
                    <img 
                      src={continueListening.stories.cover_url} 
                      alt={continueListening.stories.title}
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                  )}
                </div>
              </div>
              
              {/* Info */}
              <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
                <h3 className="text-sm font-bold text-white line-clamp-1">{continueListening.stories.title}</h3>
                <p className="text-white text-xs">{continueListening.stories.genre}</p>
                <p className="text-white text-xs">by {continueListening.stories.author}</p>
                <p className="text-white text-xs">{continueListening.stories.duration_mins} min • {progressValues.minsRemaining} min left</p>
                
                {/* Progress bar */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full">
                    <div 
                      className="h-1.5 bg-orange-500 rounded-full" 
                      style={{ width: `${progressValues.percent}%` }}
                    />
                  </div>
                  <span className="text-white text-xs">{progressValues.percent}%</span>
                </div>
              </div>
              
              {/* Play button */}
              <div className="pr-3 flex items-center">
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center hover:bg-orange-400 transition">
                  <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* ================================================================ */}
        {/* NEW RELEASES (from NewReleases.protected.tsx) - PROTECTED */}
        {/* 3 columns grid, large covers with white glow, all white text */}
        {/* ================================================================ */}
        <section className="px-4 pt-6 pb-4">
          <h2 className="text-lg font-bold text-white mb-4">🆕 New Releases</h2>
          
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="rounded-xl bg-slate-800 aspect-square mb-2" />
                  <div className="h-3 bg-slate-800 rounded mb-1" />
                  <div className="h-2 bg-slate-800 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : stories.length === 0 ? (
            <p className="text-white text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {stories.slice(0, 3).map((story) => (
                <Link key={story.id} href={`/player/${story.id}`} className="block">
                  {/* Cover with glow */}
                  <div 
                    className="rounded-xl overflow-hidden" 
                    style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}
                  >
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url} 
                        alt={story.title}
                        className="w-full aspect-square object-cover" 
                      />
                    ) : (
                      <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  
                  {/* Metadata - ALL WHITE TEXT */}
                  <div className="mt-2">
                    <h3 className="text-xs font-bold text-white line-clamp-2 leading-tight">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre}</p>
                    <p className="text-white text-xs">by {story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} cr</p>
                    {story.published_on && (
                      <p className="text-white text-xs">{formatDate(story.published_on)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ================================================================ */}
        {/* RECOMMENDED FOR YOU (from HorizontalStoryCard.protected.tsx) */}
        {/* Horizontal cards: w-28 h-28 cover with p-2, info on right */}
        {/* ================================================================ */}
        <section className="px-4 pt-6 pb-4">
          <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex bg-slate-800 rounded-xl h-28 animate-pulse">
                  <div className="w-28 h-28 bg-slate-700 rounded-l-xl" />
                  <div className="flex-1 p-3">
                    <div className="h-4 bg-slate-700 rounded mb-2 w-3/4" />
                    <div className="h-3 bg-slate-700 rounded mb-1 w-1/2" />
                    <div className="h-3 bg-slate-700 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : stories.length <= 3 ? (
            <p className="text-white text-sm">More recommendations coming soon!</p>
          ) : (
            <div className="space-y-3">
              {stories.slice(3, 7).map((story) => (
                <Link 
                  key={story.id} 
                  href={`/player/${story.id}`}
                  className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
                >
                  {/* Cover: w-28 h-28 with p-2 padding */}
                  <div className="w-28 h-28 flex-shrink-0 p-2">
                    <div className="w-full h-full rounded-lg overflow-hidden" style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}>
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Info - ALL WHITE TEXT */}
                  <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre}</p>
                    <p className="text-white text-xs">by {story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credits</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* ================================================================== */}
      {/* BOTTOM STICKY BUTTONS (from BottomStickyButtons.protected.tsx) - PROTECTED */}
      {/* Two side-by-side: Library (orange) and Recommend (teal) */}
      {/* ================================================================== */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 py-3 z-50">
        <div className="flex gap-3 max-w-3xl mx-auto">
          
          {/* Left Button: Go to Library (Orange) */}
          <Link 
            href="/library" 
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm rounded-xl text-center transition"
          >
            📚 Go to Library
          </Link>
          
          {/* Right Button: Recommend a Friend (Teal with White Text) */}
          <Link 
            href="/refer" 
            className="flex-1 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm rounded-xl text-center transition leading-tight"
          >
            💌 Recommend a Friend<br />
            <span className="text-xs font-normal">It's a Win Win</span>
          </Link>
          
        </div>
      </div>
    </div>
  )
}
