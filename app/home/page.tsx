'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Create supabase client directly to avoid any import issues
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
  state?: string
}

interface UserProfile {
  id: string
  display_name: string
  first_name?: string
  credits: number
  state?: string
}

type BriefingStatus = 'new' | 'playing' | 'paused' | 'listened'

const NEWS_CATEGORIES = [
  { id: 'national', name: 'National', icon: '🇺🇸' },
  { id: 'international', name: 'International', icon: '🌍' },
  { id: 'state', name: 'State News', icon: '🏛️' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'science', name: 'Science & Tech', icon: '🔬' },
]

export default function HomePage() {
  const router = useRouter()
  
  // Auth state - check directly, bypass AuthContext
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  
  // Stories state
  const [newReleases, setNewReleases] = useState<Story[]>([])
  const [recommended, setRecommended] = useState<Story[]>([])
  const [continueListening, setContinueListening] = useState<LibraryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [storiesError, setStoriesError] = useState<string | null>(null)
  
  // News state
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  // Check auth on mount - directly with supabase
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('[Home] Auth session check:', session ? 'Found user' : 'No session', error)
        
        if (session?.user) {
          setCurrentUser(session.user)
          // Load user profile
          const { data: profile } = await supabase
            .from('users')
            .select('id, display_name, first_name, credits, state')
            .eq('id', session.user.id)
            .single()
          
          if (profile) {
            setUserProfile(profile)
            console.log('[Home] User profile loaded:', profile.display_name)
          }
        }
      } catch (err) {
        console.error('[Home] Auth check error:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    
    checkAuth()
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Home] Auth state changed:', event)
      if (session?.user) {
        setCurrentUser(session.user)
        const { data: profile } = await supabase
          .from('users')
          .select('id, display_name, first_name, credits, state')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserProfile(profile)
      } else {
        setCurrentUser(null)
        setUserProfile(null)
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])

  // Load stories
  useEffect(() => {
    async function loadStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (error) throw error
        
        if (data) {
          setNewReleases(data.slice(0, 6))
          setRecommended(data.slice(0, 6))
        }
      } catch (err) {
        console.error('[Home] Error loading stories:', err)
        setStoriesError('Failed to load stories')
      } finally {
        setLoading(false)
      }
    }
    loadStories()
  }, [])

  // Load news episodes
  useEffect(() => {
    async function loadNews() {
      try {
        const { data } = await supabase
          .from('news_episodes')
          .select('*')
          .eq('is_live', true)
        
        if (data) {
          const episodeMap: Record<string, NewsEpisode> = {}
          data.forEach(ep => {
            episodeMap[ep.category] = ep
          })
          setNewsEpisodes(episodeMap)
        }
      } catch (err) {
        console.error('[Home] Error loading news:', err)
      }
    }
    loadNews()
  }, [])

  // Load continue listening if user is logged in
  useEffect(() => {
    if (!currentUser) return
    
    async function loadContinueListening() {
      try {
        const { data } = await supabase
          .from('user_library')
          .select('*, stories(*)')
          .eq('user_id', currentUser.id)
          .eq('completed', false)
          .order('last_played', { ascending: false })
          .limit(1)
          .single()
        
        if (data) {
          setContinueListening(data)
        }
      } catch (err) {
        // No story in progress - that's fine
      }
    }
    loadContinueListening()
  }, [currentUser])

  // Play no credits message
  const playNoCreditsMessage = (category: string) => {
    const userName = userProfile?.first_name || userProfile?.display_name?.split(' ')[0] || 'friend'
    const message = `Hi ${userName}, this is your news briefing host. I'm glad you're back, but I'm sorry to inform you that you must have at least one credit in your account to hear the recent news briefings. Please buy more credits or upgrade your subscription. I look forward to seeing you soon. Goodbye!`
    
    // Use speech synthesis for the no-credits message
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 1.0
      speechSynthesis.speak(utterance)
    } else {
      alert(message)
    }
  }

  // Handle news briefing play
  const handlePlayBriefing = (categoryId: string) => {
    const episode = newsEpisodes[categoryId]
    
    // Check credits - if 0, play no credits message instead
    if ((userProfile?.credits || 0) === 0) {
      playNoCreditsMessage(categoryId)
      return
    }
    
    if (!episode?.audio_url) {
      alert('No briefing available for this category yet')
      return
    }
    
    // Pause any other playing audio
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== categoryId) {
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [id]: 'paused' }))
      }
    })
    
    // Get or create audio element
    if (!audioRefs.current[categoryId]) {
      audioRefs.current[categoryId] = new Audio(episode.audio_url)
      audioRefs.current[categoryId].onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'listened' }))
      }
    }
    
    const audio = audioRefs.current[categoryId]
    
    if (briefingStatus[categoryId] === 'playing') {
      audio.pause()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
    } else {
      audio.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  // Get display name for welcome message
  const displayName = userProfile?.first_name || userProfile?.display_name?.split(' ')[0] || 'friend'
  const userCredits = userProfile?.credits || 0
  const userStateName = userProfile?.state || 'Your State'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <span className="text-2xl">🚗</span>
            <span className="text-lg font-bold">Drive Time <span className="text-orange-500">Tales</span></span>
          </Link>

          {!authChecked ? (
            <div className="w-9 h-9 rounded-full bg-slate-700 animate-pulse" />
          ) : currentUser ? (
            <Link href="/account" className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold">
              {userProfile?.display_name?.[0] || currentUser.email?.[0]?.toUpperCase() || '?'}
            </Link>
          ) : (
            <Link href="/signin" className="text-orange-400 hover:text-orange-300 font-medium">
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-40">
        
        {/* Welcome Message - only for logged in users */}
        {currentUser && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Welcome back, {displayName}!</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-slate-400">
                You have <span className={userCredits > 0 ? 'text-green-400' : 'text-red-400'}>{userCredits}</span> credit{userCredits !== 1 ? 's' : ''}
              </span>
              {userCredits === 0 && (
                <Link 
                  href="/pricing" 
                  className="bg-orange-500 hover:bg-orange-400 text-black text-sm font-bold px-3 py-1 rounded-lg transition"
                >
                  Buy More Credits
                </Link>
              )}
            </div>
          </div>
        )}

        {/* News Briefings Section */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEWS BRIEFINGS</h2>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const hasEpisode = !!newsEpisodes[cat.id]?.audio_url
              const categoryDisplayName = cat.id === 'state' ? `${userStateName} News` : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => handlePlayBriefing(cat.id)}
                  className={`relative p-4 rounded-xl text-center transition ${
                    status === 'playing' 
                      ? 'bg-orange-500 text-black' 
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="text-2xl mb-1">{cat.icon}</div>
                  <div className="text-xs font-medium">{categoryDisplayName}</div>
                  {status === 'new' && hasEpisode && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                  {status === 'playing' && (
                    <span className="absolute top-1 right-1 text-black text-sm">▶</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Continue Listening - only show if there's a story in progress */}
        {continueListening && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
            <Link
              href={`/player/${continueListening.story_id}`}
              className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-28"
            >
              <div className="p-2 flex-shrink-0 w-24">
                <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4)' }}>
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
                <h3 className="font-bold text-white text-sm line-clamp-1">{continueListening.stories?.title}</h3>
                <p className="text-slate-400 text-xs line-clamp-1">{continueListening.stories?.author}</p>
                <div className="mt-2 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-orange-500 h-full" 
                    style={{ width: `${Math.min(100, (continueListening.progress / (continueListening.stories?.duration_mins * 60 || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          </section>
        )}

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
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div 
                    className="rounded-xl overflow-hidden"
                    style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}
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
                  <h3 className="mt-2 text-sm font-medium line-clamp-1">{story.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-1">{story.author}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recommended */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : recommended.length === 0 ? (
            <p className="text-slate-400 text-sm">No recommendations yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {recommended.map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div 
                    className="rounded-xl overflow-hidden"
                    style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}
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
                  <h3 className="mt-2 text-sm font-medium line-clamp-1">{story.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-1">{story.author}</p>
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
              Go To Library
            </Link>
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
