/**
 * DTT Home Page - COMPLETE WORKING VERSION
 * 
 * VERSION: 2026-01-16
 * STATUS: WORKING
 * 
 * DATABASE TABLES USED:
 * - users: first_name, display_name, credits, state
 * - stories: id, title, author, genre, duration_mins, cover_url, audio_url, credits, description
 * - user_library: user_id, story_id, progress, last_played, completed
 * - news_episodes: id, category, audio_url, is_live
 * 
 * SECTIONS:
 * 1. Header with avatar
 * 2. Welcome message with credits
 * 3. News Briefings (6 categories)
 * 4. Continue Listening (from user_library where completed=false, progress>0)
 * 5. New Releases (3 horizontal cards)
 * 6. Recommended For You (4 vertical blocks)
 * 7. Sticky bottom buttons
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
import { Header } from '@/components/ui/Header'

// Create supabase client directly
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Story interface - ONLY columns that exist in stories table
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

// Continue story with progress info
interface ContinueStory extends Story {
  progress: number
  last_played: string
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

// News categories - PROTECTED DESIGN
// Order: State (red) → National (blue) → International (green) → Business (yellow) → Sports (orange) → Science (purple)
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-blue-600 to-blue-800' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-green-600 to-green-800' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-yellow-600 to-yellow-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-600 to-orange-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

export default function HomePage() {
  const router = useRouter()
  const { user } = useAuth()
  
  // State variables
  const [displayName, setDisplayName] = useState<string>('')
  const [userCredits, setUserCredits] = useState<number>(0)
  const [userState, setUserState] = useState<string>('')
  const [stories, setStories] = useState<Story[]>([])
  const [continueStory, setContinueStory] = useState<ContinueStory | null>(null)
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [loading, setLoading] = useState(true)
  const [playingCategory, setPlayingCategory] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

  // Load user profile
  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          router.push('/signin')
          return
        }

        // Query users table - ONLY columns that exist
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
          setUserState(profile.state || '')
        }
      } catch (err) {
        console.error('[Home] Auth error:', err)
      }
    }
    init()
  }, [router])

  // Load stories
  useEffect(() => {
    async function loadStories() {
      try {
        // Query stories table - ONLY columns that exist (NO rating, NO created_at)
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
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

  // Load Continue Listening from user_library
  useEffect(() => {
    async function loadContinueListening() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Query user_library with join to stories
        // CORRECT COLUMNS: progress (not progress_seconds), last_played (not last_played_at)
        const { data: libraryEntry, error: libraryError } = await supabase
          .from('user_library')
          .select('story_id, progress, last_played, completed')
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress', 0)
          .order('last_played', { ascending: false })
          .limit(1)
          .single()

        if (libraryError || !libraryEntry) {
          console.log('[Home] No uncompleted story in user_library')
          return
        }

        // Get story details
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')
          .eq('id', libraryEntry.story_id)
          .single()

        if (storyData && !storyError) {
          setContinueStory({
            ...storyData,
            progress: libraryEntry.progress,
            last_played: libraryEntry.last_played
          })
          console.log('[Home] Continue story loaded:', storyData.title, 'at', libraryEntry.progress, 'seconds')
        }
      } catch (err) {
        console.error('[Home] Continue listening error:', err)
      }
    }
    loadContinueListening()
  }, [])

  // Load news episodes
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

  // Format time for display
  const formatProgress = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Play news briefing
  const playNews = (category: string) => {
    const episode = newsEpisodes[category]
    if (!episode?.audio_url) return

    if (audioElement) {
      audioElement.pause()
    }

    if (playingCategory === category) {
      setPlayingCategory(null)
      return
    }

    const audio = new Audio(episode.audio_url)
    audio.play()
    audio.onended = () => setPlayingCategory(null)
    setAudioElement(audio)
    setPlayingCategory(category)
  }

  // Get state display name
  const getStateDisplayName = () => {
    if (!userState) return 'State'
    // Map abbreviations to full names
    const stateMap: Record<string, string> = {
      'SC': 'South Carolina', 'NC': 'North Carolina', 'GA': 'Georgia',
      'FL': 'Florida', 'TX': 'Texas', 'CA': 'California', 'NY': 'New York',
    }
    return stateMap[userState.toUpperCase()] || userState
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-36">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Welcome Section */}
        <section className="text-center">
          <h1 className="text-2xl font-bold text-white">Welcome back, {displayName}!</h1>
          <p className="text-white mt-2">
            <span className="text-3xl font-bold text-orange-400">{userCredits}</span> Credits
            {userCredits === 0 && (
              <Link href="/pricing" className="ml-3 text-orange-400 underline">Get more credits</Link>
            )}
          </p>
        </section>

        {/* News Briefings Section - PROTECTED DESIGN */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">📰 News Briefings</h2>
          <p className="text-white text-sm mb-3">News Briefings are Free!</p>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map((cat) => {
              const episode = newsEpisodes[cat.id]
              const isAvailable = episode?.audio_url
              const isPlaying = playingCategory === cat.id
              const displayName = cat.id === 'state' ? getStateDisplayName() : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => isAvailable && playNews(cat.id)}
                  disabled={!isAvailable}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    isAvailable 
                      ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` 
                      : 'bg-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="text-2xl mb-1">{cat.icon}</div>
                  <div className="text-white text-xs font-medium">{displayName}</div>
                  {/* Status indicator */}
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

        {/* Continue Listening Section - Only shows when there's an uncompleted story */}
        {continueStory && (
          <section>
            <h2 className="text-lg font-bold text-white mb-4">▶️ Continue Listening</h2>
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
                <p className="text-orange-400 text-xs mt-1">
                  Resume at {formatProgress(continueStory.progress)} • {continueStory.duration_mins} min total
                </p>
              </div>
            </Link>
          </section>
        )}

        {/* New Releases Section - 3 horizontal cards */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">🆕 New Releases</h2>
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

        {/* Recommended For You Section - 4 vertical blocks */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
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
                    <p className="text-white text-xs">{story.genre} • {story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
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
            <Link href="/library" className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition">
              Go To Library
            </Link>
          </div>
          <Link href="/share" className="block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl text-center transition">
            Share With A Friend - It's A Win Win
          </Link>
        </div>
      </div>
    </div>
  )
}
