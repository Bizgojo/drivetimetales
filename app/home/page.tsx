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
// Order: State → National → World → Business → Sports → Sci/Tech
// Colors: Color wheel (60° apart) - Red → Orange → Yellow → Green → Blue → Purple
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
  const [continueStory, setContinueStory] = useState<Story | null>(null)
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

        // Load user profile - only select columns that exist
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
          
          // Handle state - convert abbreviation to full name if needed
          if (profile.state) {
            if (profile.state.length === 2) {
              setUserState(STATE_NAMES[profile.state.toUpperCase()] || profile.state)
            } else {
              setUserState(profile.state)
            }
          }
        }
      } catch (err) {
        console.error('[Home] Auth error:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    init()
  }, [router])

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
  // LOAD CONTINUE LISTENING
  // ============================================
  useEffect(() => {
    async function loadContinueListening() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Get user's most recent uncompleted story
        const { data: userStory, error: userStoryError } = await supabase
          .from('user_stories')
          .select('story_id, progress_seconds')
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress_seconds', 0)
          .order('purchased_at', { ascending: false })
          .limit(1)
          .single()

        if (userStoryError || !userStory) {
          return
        }

        // Get the full story details
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
          .eq('id', userStory.story_id)
          .single()

        if (storyData && !storyError) {
          setContinueStory(storyData)
        }
      } catch (err) {
        console.error('[Home] Continue listening error:', err)
      }
    }
    loadContinueListening()
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
          
          // Initialize all statuses to 'new'
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
  // PROTECTED: NEWS BRIEFING PLAYBACK HANDLER
  // Status badge colors: Amber=New, Emerald=Playing, Sky=Paused, Rose=Played
  // ============================================
  const handleBriefingClick = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    const currentStatus = briefingStatuses[categoryId]

    // Check credits
    if (userCredits <= 0) {
      // Play spoken no-credits message instead of locking
      const msg = new SpeechSynthesisUtterance("You don't have enough credits to play this briefing. Please purchase more credits.")
      window.speechSynthesis.speak(msg)
      return
    }

    if (!episode?.audio_url) {
      return
    }

    // If something else is playing, stop it
    if (currentlyPlaying && currentlyPlaying !== categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setBriefingStatuses(prev => ({ ...prev, [currentlyPlaying]: 'paused' }))
    }

    if (currentStatus === 'playing') {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'paused' }))
      setCurrentlyPlaying(null)
    } else {
      // Play or resume
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

  // Get status badge style
  const getStatusBadgeStyle = (status: BriefingStatus) => {
    switch (status) {
      case 'new': return 'bg-amber-400 text-black'
      case 'playing': return 'bg-emerald-400 text-black'
      case 'paused': return 'bg-sky-400 text-black'
      case 'played': return 'bg-rose-400 text-black'
      default: return 'bg-amber-400 text-black'
    }
  }

  // Get status label
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

        {/* ============================================ */}
        {/* PROTECTED: NEWS BRIEFINGS SECTION */}
        {/* ============================================ */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-1">NEWS BRIEFINGS</h2>
          <p className="text-white text-xs mb-4">Top stories updated throughout the day</p>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map((cat) => {
              const status = briefingStatuses[cat.id] || 'new'
              const hasEpisode = !!newsEpisodes[cat.id]?.audio_url
              const catName = cat.id === 'state' ? `${userState} News` : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => handleBriefingClick(cat.id)}
                  className={`relative p-4 rounded-xl text-center transition bg-gradient-to-br ${cat.color} hover:opacity-90`}
                >
                  {/* Status Badge */}
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

        {/* ============================================ */}
        {/* CONTINUE LISTENING */}
        {/* ============================================ */}
        {continueStory && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
            <Link href={`/story/${continueStory.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition">
              <div className="w-24 h-24 flex-shrink-0">
                {continueStory.cover_url ? (
                  <img src={continueStory.cover_url} alt={continueStory.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                )}
              </div>
              <div className="flex-1 p-3 flex flex-col justify-center">
                <h3 className="text-sm font-bold text-white line-clamp-1">{continueStory.title}</h3>
                <p className="text-white text-xs">{continueStory.genre} • {continueStory.author}</p>
                <p className="text-orange-400 text-xs font-medium">▶ Resume where you left off</p>
              </div>
            </Link>
          </section>
        )}

        {/* ============================================ */}
        {/* NEW RELEASES - 3 horizontal cards */}
        {/* ============================================ */}
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

        {/* ============================================ */}
        {/* RECOMMENDED FOR YOU - 4 vertical blocks */}
        {/* Cover on left, Title/Genre/Author/Duration+Credits on right */}
        {/* ============================================ */}
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
