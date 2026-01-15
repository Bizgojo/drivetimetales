'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Create supabase client directly
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  
  // Auth state
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('friend')
  const [userCredits, setUserCredits] = useState(0)
  const [userState, setUserState] = useState('Your State')
  
  // Stories state
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  
  // News state
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  // Check auth and load profile - optimized for speed
  useEffect(() => {
    async function init() {
      try {
        // Get session
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setCurrentUser(session.user)
          
          // Load profile with minimal fields - no timeout wrapper needed
          const { data: profile, error } = await supabase
            .from('users')
            .select('first_name, display_name, credits, state')
            .eq('id', session.user.id)
            .single()
          
          if (profile && !error) {
            // Use first_name (nickname) first, then first word of display_name, then email
            const name = profile.first_name 
              || profile.display_name?.split(' ')[0] 
              || session.user.email?.split('@')[0] 
              || 'friend'
            setDisplayName(name)
            setUserCredits(profile.credits || 0)
            setUserState(profile.state || 'Your State')
          } else {
            // Fallback to email if profile load fails
            setDisplayName(session.user.email?.split('@')[0] || 'friend')
          }
        }
      } catch (err) {
        console.error('[Home] Init error:', err)
      } finally {
        setAuthChecked(true)
      }
    }
    
    init()
  }, [])

  // Load stories - separate effect for parallel loading
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

  // Load news episodes - separate effect for parallel loading
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

  // Play no credits message
  const playNoCreditsMessage = () => {
    const message = `Hi ${displayName}, this is your news briefing host. I'm glad you're back, but I'm sorry to inform you that you must have at least one credit in your account to hear the recent news briefings. Please buy more credits or upgrade your subscription. I look forward to seeing you soon. Goodbye!`
    
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
    if (userCredits === 0) {
      playNoCreditsMessage()
      return
    }
    
    const episode = newsEpisodes[categoryId]
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
              {displayName[0]?.toUpperCase() || '?'}
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
        
        {/* Welcome Message */}
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

        {/* News Briefings */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEWS BRIEFINGS</h2>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const hasEpisode = !!newsEpisodes[cat.id]?.audio_url
              const catName = cat.id === 'state' ? `${userState} News` : cat.name

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
                  <div className="text-xs font-medium">{catName}</div>
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

        {/* Stories */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 6).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
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
          ) : stories.length === 0 ? (
            <p className="text-slate-400 text-sm">No recommendations yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 6).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
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
