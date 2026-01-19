/**
 * DTT Working Code Library - 02_HomePage/COMPLETE_HomePage.tsx
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: WORKING ✓
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Complete page assembled from working chunks
 * 
 * ASSEMBLED FROM:
 *   - 02_HomePage/b_WelcomeBack.tsx
 *   - 02_HomePage/c_NewsBriefings.tsx (PROTECTED)
 *   - 02_HomePage/d_ContinueListening.tsx
 *   - 02_HomePage/e_NewReleases.tsx
 *   - 02_HomePage/f_RecommendedForYou.tsx
 *   - 02_HomePage/g_StickyBottom.tsx
 * 
 * DEPENDS ON:
 *   - users table (first_name, display_name, credits, state)
 *   - stories table
 *   - user_library table (for Continue Listening)
 *   - news_episodes table
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Create supabase client directly
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================
// INTERFACES
// ============================================
interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string
  audio_url: string
  credits: number
  author: string
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

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

// ============================================
// PROTECTED: STATE NAME MAPPING
// ============================================
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

// ============================================
// PROTECTED: NEWS CATEGORIES - DO NOT CHANGE WITHOUT EXPLICIT REQUEST
// ============================================
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-yellow-500 to-yellow-700' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-600 to-green-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-600 to-blue-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

// ============================================
// MAIN COMPONENT
// ============================================
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
  const [briefingStatuses, setBriefingStatuses] = useState<Record<string, BriefingStatus>>({})
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ============================================
  // AUTH & PROFILE LOADING
  // ============================================
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

  // ============================================
  // CONTINUE LISTENING - From user_library table
  // ============================================
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

  // ============================================
  // LOAD STORIES
  // ============================================
  useEffect(() => {
    async function loadStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
          .order('created_at', { ascending: false })
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

  // ============================================
  // LOAD NEWS EPISODES
  // ============================================
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
          
          const initialStatuses: Record<string, BriefingStatus> = {}
          NEWS_CATEGORIES.forEach(cat => { initialStatuses[cat.id] = 'new' })
          setBriefingStatuses(initialStatuses)
        }
      } catch (err) {
        console.error('[Home] News error:', err)
      }
    }
    loadNews()
  }, [])

  // ============================================
  // NEWS BRIEFING PLAYBACK HANDLER
  // ============================================
  const handleBriefingClick = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    const currentStatus = briefingStatuses[categoryId]

    if (userCredits <= 0) {
      const msg = new SpeechSynthesisUtterance("You don't have enough credits to play this briefing. Please purchase more credits.")
      window.speechSynthesis.speak(msg)
      return
    }

    if (!episode?.audio_url) return

    if (currentlyPlaying && currentlyPlaying !== categoryId) {
      if (audioRef.current) audioRef.current.pause()
      setBriefingStatuses(prev => ({ ...prev, [currentlyPlaying]: 'paused' }))
    }

    if (currentStatus === 'playing') {
      if (audioRef.current) audioRef.current.pause()
      setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'paused' }))
      setCurrentlyPlaying(null)
    } else {
      if (!audioRef.current || audioRef.current.src !== episode.audio_url) {
        audioRef.current = new Audio(episode.audio_url)
        audioRef.current.onended = () => {
          setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'played' }))
          setCurrentlyPlaying(null)
        }
      }
      audioRef.current.play()
      setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'playing' }))
      setCurrentlyPlaying(categoryId)
    }
  }

  const getStatusBadgeStyle = (status: BriefingStatus) => {
    switch (status) {
      case 'new': return 'bg-amber-400 text-black'
      case 'playing': return 'bg-emerald-400 text-black'
      case 'paused': return 'bg-sky-400 text-black'
      case 'played': return 'bg-rose-400 text-black'
      default: return 'bg-amber-400 text-black'
    }
  }

  const getStatusLabel = (status: BriefingStatus) => {
    switch (status) {
      case 'new': return 'New'
      case 'playing': return 'Playing'
      case 'paused': return 'Paused'
      case 'played': return 'Played'
      default: return 'New'
    }
  }

  // ============================================
  // RENDER
  // ============================================
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-40">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚗</span>
          <span className="font-bold text-white">Drive Time <span className="text-orange-500">Tales</span></span>
        </div>
        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold">
          {displayName.charAt(0).toUpperCase()}
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        {/* Welcome */}
        <section className="mb-6">
          <h1 className="text-2xl font-bold">Welcome back, {displayName}!</h1>
          <p className="text-white text-sm">You have {userCredits} credits</p>
          {userCredits === 0 && (
            <Link href="/credits" className="inline-block mt-2 bg-orange-500 text-black px-4 py-2 rounded-lg font-bold text-sm">
              Buy More Credits
            </Link>
          )}
        </section>

        {/* NEWS BRIEFINGS */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-1">NEWS BRIEFINGS</h2>
          <p className="text-white text-xs mb-4">Top stories updated throughout the day</p>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map((cat) => {
              const status = briefingStatuses[cat.id] || 'new'
              const catName = cat.id === 'state' ? `${userState} News` : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => handleBriefingClick(cat.id)}
                  className={`relative p-4 rounded-xl text-center transition bg-gradient-to-br ${cat.color} hover:opacity-90`}
                >
                  <span className={`absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeStyle(status)}`}>
                    {getStatusLabel(status)}
                  </span>
                  <div className="text-2xl mb-1">{cat.icon}</div>
                  <div className="text-xs font-medium text-white">{catName}</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* CONTINUE LISTENING */}
        {continueListening && continueListening.stories && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
            <Link
              href={`/story/${continueListening.story_id}`}
              className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-28"
            >
              <div className="p-2 flex-shrink-0 w-24">
                <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4)' }}>
                  {continueListening.stories.cover_url ? (
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
                <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1">{continueListening.stories.title}</h3>
                <p className="text-white text-xs mb-0.5">{continueListening.stories.genre} • {continueListening.stories.author}</p>
                <p className="text-white text-xs mb-2">{continueListening.stories.duration_mins} min</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-600 rounded-full">
                    <div 
                      className="h-1.5 bg-orange-500 rounded-full" 
                      style={{ width: `${Math.min(100, Math.round((continueListening.progress / (continueListening.stories.duration_mins * 60)) * 100))}%` }}
                    ></div>
                  </div>
                  <span className="text-white text-xs">
                    {Math.round((continueListening.progress / (continueListening.stories.duration_mins * 60)) * 100)}%
                  </span>
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
          </section>
        )}

        {/* NEW RELEASES */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-white text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 3).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                  <p className="text-white text-xs">{story.genre}</p>
                  <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* RECOMMENDED FOR YOU */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-white text-sm">No recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {stories.slice(3, 7).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition">
                  <div className="w-24 h-24 flex-shrink-0">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre}</p>
                    <p className="text-white text-xs">{story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 mb-3">
            <Link href="/library" className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition">
              Go To Library
            </Link>
          </div>
          <Link href="/share" className="block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl text-center transition">
            Share With A Friend - Its A Win Win
          </Link>
        </div>
      </div>
    </div>
  )
}
