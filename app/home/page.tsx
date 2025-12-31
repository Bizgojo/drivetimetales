'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string
  description: string
  credits: number
  ai_rating: number
  release_date: string
}

interface LibraryItem {
  story_id: string
  progress: number
  last_played: string
  story: Story
}

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [continueListening, setContinueListening] = useState<LibraryItem[]>([])
  const [newReleases, setNewReleases] = useState<Story[]>([])
  const [recommendations, setRecommendations] = useState<Story[]>([])
  const [allStories, setAllStories] = useState<Story[]>([])
  const [genre, setGenre] = useState('All')
  const [duration, setDuration] = useState('All')

  const genreOptions = [
    { name: 'All', icon: '📚' },
    { name: 'Mystery', icon: '🔍' },
    { name: 'Drama', icon: '🎭' },
    { name: 'Sci-Fi', icon: '🚀' },
    { name: 'Horror', icon: '👻' },
    { name: 'Comedy', icon: '😂' },
    { name: 'Romance', icon: '💕' },
    { name: 'Trucker Stories', icon: '🚛' },
    { name: 'Thriller', icon: '😱' },
  ]

  const durationOptions = [
    { name: 'All', label: 'All' },
    { name: '15 min', label: '~15 min' },
    { name: '30 min', label: '~30 min' },
    { name: '1 hr', label: '~1 hr' },
  ]

  useEffect(() => {
    async function loadData() {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/signin')
        return
      }

      // Get user profile
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
      
      if (userData) {
        setUser(userData)
        
        // Update last login
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', session.user.id)
      }

      // Get continue listening (stories with progress > 0 and not completed)
      const { data: libraryData } = await supabase
        .from('user_library')
        .select(`
          story_id,
          progress,
          last_played,
          story:stories(*)
        `)
        .eq('user_id', session.user.id)
        .eq('completed', false)
        .gt('progress', 0)
        .order('last_played', { ascending: false })
        .limit(4)
      
      if (libraryData) {
        setContinueListening(libraryData as any)
      }

      // Get new releases since last login (up to 4)
      const lastLogin = userData?.last_login || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: newReleasesData } = await supabase
        .from('stories')
        .select('*')
        .gt('release_date', lastLogin)
        .order('release_date', { ascending: false })
        .limit(4)
      
      if (newReleasesData && newReleasesData.length > 0) {
        setNewReleases(newReleasesData)
      } else {
        // If no new releases, show most recent stories
        const { data: recentData } = await supabase
          .from('stories')
          .select('*')
          .order('release_date', { ascending: false })
          .limit(4)
        
        if (recentData) {
          setNewReleases(recentData)
        }
      }

      // Get recommendations (based on top rated)
      const { data: recData } = await supabase
        .from('stories')
        .select('*')
        .order('ai_rating', { ascending: false })
        .limit(10)
      
      if (recData) {
        // Shuffle and take 3
        const shuffled = recData.sort(() => 0.5 - Math.random())
        setRecommendations(shuffled.slice(0, 3))
      }

      // Get all stories for browsing
      const { data: storiesData } = await supabase
        .from('stories')
        .select('*')
        .order('release_date', { ascending: false })
      
      if (storiesData) {
        setAllStories(storiesData)
      }

      setLoading(false)
    }

    loadData()
  }, [router])

  // Filter stories
  const filteredStories = allStories.filter((s) => {
    if (genre !== 'All' && s.genre !== genre) return false
    if (duration === '15 min' && (s.duration_mins < 10 || s.duration_mins > 20)) return false
    if (duration === '30 min' && (s.duration_mins < 20 || s.duration_mins > 45)) return false
    if (duration === '1 hr' && s.duration_mins < 45) return false
    return true
  })

  const handleStoryClick = (storyId: string) => {
    router.push(`/player/${storyId}`)
  }

  const formatProgress = (seconds: number, totalMins: number) => {
    const totalSeconds = totalMins * 60
    const percent = Math.round((seconds / totalSeconds) * 100)
    return `${percent}%`
  }

  // Star rating component
  const StarRating = ({ rating, storyId }: { rating: number, storyId: string }) => {
    const displayRating = rating || 4.5
    const fullStars = Math.floor(displayRating)
    const hasHalf = displayRating % 1 >= 0.5
    
    return (
      <button 
        onClick={(e) => {
          e.stopPropagation()
          router.push(`/reviews/${storyId}`)
        }}
        className="flex items-center gap-1"
      >
        <div className="flex text-yellow-400">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="text-xs">
              {i < fullStars ? '★' : i === fullStars && hasHalf ? '★' : '☆'}
            </span>
          ))}
        </div>
        <span className="text-xs text-slate-400">{displayRating.toFixed(1)}</span>
      </button>
    )
  }

  // Story card component
  const StoryCard = ({ story, progress, showProgress = false }: { story: Story, progress?: number, showProgress?: boolean }) => (
    <div 
      onClick={() => handleStoryClick(story.id)}
      className="bg-slate-800 rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
    >
      <div className="flex">
        {/* Cover */}
        <div className="w-24 h-24 flex-shrink-0 relative">
          {story.cover_url ? (
            <img 
              src={story.cover_url}
              alt={story.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
              <span className="text-2xl opacity-50">🎧</span>
            </div>
          )}
          {/* Duration badge */}
          <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 text-white text-[9px] rounded">
            {story.duration_mins}m
          </div>
          {/* Progress bar */}
          {showProgress && progress !== undefined && progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
              <div 
                className="h-full bg-orange-500"
                style={{ width: formatProgress(progress, story.duration_mins) }}
              />
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-bold text-white text-sm leading-tight truncate">{story.title}</h3>
            <p className="text-slate-400 text-xs truncate">{story.author}</p>
            <StarRating rating={story.ai_rating} storyId={story.id} />
          </div>
        </div>
      </div>
    </div>
  )

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="40" height="24" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <span className="text-base font-bold text-white">Drive Time </span>
        <span className="text-base font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const firstName = user?.display_name?.split(' ')[0] || 'there'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Logo />
          <Link 
            href="/account"
            className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm"
          >
            {firstName[0]?.toUpperCase()}
          </Link>
        </div>

        {/* Welcome */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white">Welcome back, {firstName}!</h1>
          {user?.credits !== undefined && (
            <p className="text-slate-400 text-sm mt-1">
              {user.credits === -1 ? 'Unlimited' : user.credits} credits available
            </p>
          )}
        </div>

        {/* Continue Listening */}
        {continueListening.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white mb-3">Continue Listening</h2>
            <div className="space-y-2">
              {continueListening.map((item) => (
                <StoryCard 
                  key={item.story_id} 
                  story={item.story} 
                  progress={item.progress}
                  showProgress={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* New Releases */}
        {newReleases.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white mb-3">
              {continueListening.length > 0 ? 'New Since You Were Here' : 'New Releases'}
            </h2>
            <div className="space-y-2">
              {newReleases.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white mb-3">Recommended For You</h2>
            <div className="space-y-2">
              {recommendations.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <Link 
            href="/library"
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 rounded-xl text-center transition-colors"
          >
            <span className="text-black font-semibold">Search Library</span>
          </Link>
          <Link 
            href="/wishlist"
            className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 rounded-xl text-center transition-colors"
          >
            <span className="text-white font-semibold">My Wishlist</span>
          </Link>
        </div>

        {/* Browse All Stories */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white mb-3">Browse All Stories</h2>
          
          {/* Genre Icons */}
          <div className="mb-3">
            <div className="flex flex-wrap justify-center gap-1">
              {genreOptions.map((g) => (
                <button
                  key={g.name}
                  onClick={() => setGenre(g.name)}
                  className={`flex flex-col items-center px-2 py-1 rounded-lg transition-all ${
                    genre === g.name 
                      ? 'bg-orange-500 text-black' 
                      : 'bg-slate-800 text-white'
                  }`}
                >
                  <span className="text-sm">{g.icon}</span>
                  <span className="text-[9px] mt-0.5">{g.name === 'Trucker Stories' ? 'Trucker' : g.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration Filter */}
          <div className="mb-4">
            <div className="flex justify-center gap-2">
              {durationOptions.map((d) => (
                <button
                  key={d.name}
                  onClick={() => setDuration(d.name)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    duration === d.name 
                      ? 'bg-orange-500 text-black' 
                      : 'bg-slate-800 text-white border border-slate-700'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          <p className="text-white text-xs mb-3">{filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'} found</p>

          {/* Filtered Stories */}
          <div className="space-y-2">
            {filteredStories.slice(0, 10).map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>

          {filteredStories.length > 10 && (
            <Link 
              href="/library"
              className="block text-center text-orange-400 text-sm mt-4 hover:underline"
            >
              View all {filteredStories.length} stories →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
