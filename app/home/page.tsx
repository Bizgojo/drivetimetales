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
  rating: number
  release_date: string
  is_new: boolean
}

interface LibraryItem {
  story_id: string
  progress_seconds: number
  last_played_at: string
  story: Story
}

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [continueListening, setContinueListening] = useState<LibraryItem | null>(null)
  const [recentlyAdded, setRecentlyAdded] = useState<Story[]>([])
  const [recommendations, setRecommendations] = useState<Story[]>([])

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
      }

      // Get continue listening (most recent unfinished story - only 1)
      const { data: libraryData } = await supabase
        .from('user_library')
        .select(`
          story_id,
          progress_seconds,
          last_played_at,
          story:stories(*)
        `)
        .eq('user_id', session.user.id)
        .eq('completed', false)
        .gt('progress_seconds', 0)
        .order('last_played_at', { ascending: false })
        .limit(1)
      
      if (libraryData && libraryData.length > 0) {
        setContinueListening(libraryData[0] as any)
      }

      // Get recently added since last login (max 3)
      const lastLogin = userData?.last_login || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentData } = await supabase
        .from('stories')
        .select('*')
        .gt('created_at', lastLogin)
        .order('created_at', { ascending: false })
        .limit(3)
      
      if (recentData && recentData.length > 0) {
        setRecentlyAdded(recentData)
      }

      // Update last login after fetching recent stories
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', session.user.id)

      // Get recommendations (based on top rated, excluding already in progress)
      const { data: recData } = await supabase
        .from('stories')
        .select('*')
        .order('rating', { ascending: false })
        .limit(10)
      
      if (recData) {
        // Shuffle and take 3
        const shuffled = recData.sort(() => 0.5 - Math.random())
        setRecommendations(shuffled.slice(0, 3))
      }

      setLoading(false)
    }

    loadData()
  }, [router])

  const handleStoryClick = (storyId: string) => {
    router.push(`/player/${storyId}`)
  }

  const handleResume = (storyId: string) => {
    router.push(`/player/${storyId}/play?autoplay=true&resume=true`)
  }

  const formatTimeLeftOff = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const calculateProgress = (seconds: number, totalMins: number) => {
    const totalSeconds = totalMins * 60
    return Math.round((seconds / totalSeconds) * 100)
  }

  // Star rating component
  const StarRating = ({ rating, size = 'sm' }: { rating: number, size?: 'xs' | 'sm' }) => {
    const displayRating = rating || 4.0
    const starSize = size === 'xs' ? 'text-[10px]' : 'text-xs'
    const numSize = size === 'xs' ? 'text-[10px]' : 'text-xs'
    
    return (
      <span className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = displayRating >= star
          const halfFilled = !filled && displayRating >= star - 0.5
          return (
            <span key={star} className={`relative ${starSize}`}>
              <span className="text-slate-600">☆</span>
              {(filled || halfFilled) && (
                <span 
                  className="absolute left-0 top-0 text-yellow-400 overflow-hidden"
                  style={{ width: halfFilled ? '50%' : '100%' }}
                >
                  ★
                </span>
              )}
            </span>
          )
        })}
        <span className={`text-slate-400 ${numSize} ml-0.5`}>{displayRating.toFixed(1)}</span>
      </span>
    )
  }

  // Recommendation card component
  const RecommendationCard = ({ story, reason }: { story: Story, reason: string }) => (
    <div 
      onClick={() => handleStoryClick(story.id)}
      className="bg-slate-800/50 rounded-xl p-3 cursor-pointer hover:bg-slate-800 transition-colors active:scale-[0.98]"
    >
      <div className="flex gap-3">
        {/* Cover thumbnail */}
        <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center overflow-hidden">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl opacity-50">🎧</span>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm truncate">{story.title}</h3>
          <p className="text-slate-400 text-xs">{story.author} • {story.duration_mins} min</p>
          <div className="flex items-center justify-between mt-1">
            <StarRating rating={story.rating} size="xs" />
          </div>
          <p className="text-orange-400/80 text-[10px] mt-0.5 truncate">{reason}</p>
        </div>
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

  const firstName = user?.name?.split(' ')[0] || 'there'
  const credits = user?.credits_remaining
  const creditsDisplay = credits === -1 ? 'Unlimited' : credits

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Header - Logo + Avatar */}
        <div className="flex items-center justify-between mb-5">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-3xl">🚛</span>
            <span className="text-3xl">🚗</span>
            <div className="flex items-baseline ml-2">
              <span className="text-lg font-bold text-white">Drive Time </span>
              <span className="text-lg font-bold text-orange-500">Tales</span>
            </div>
          </div>
          
          {/* Avatar */}
          <Link 
            href="/account"
            className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-base ring-2 ring-orange-400/30"
          >
            {firstName[0]?.toUpperCase()}
          </Link>
        </div>

        {/* Welcome + Credits on same line */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-white text-lg">
            Welcome back, <span className="font-bold">{firstName}</span> 👋
          </p>
          <div className="px-3 py-1 bg-slate-800 rounded-full">
            <span className="text-orange-400 text-sm font-medium">{creditsDisplay} credits</span>
          </div>
        </div>

        {/* Continue Listening - Single tappable card */}
        {continueListening && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-orange-500">▶</span>
              <h2 className="text-base font-bold text-white">Continue Listening</h2>
            </div>
            
            <div 
              onClick={() => handleResume(continueListening.story_id)}
              className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-xl p-3 cursor-pointer hover:from-slate-700 hover:to-slate-800/50 transition-all active:scale-[0.99]"
            >
              <div className="flex gap-3">
                {/* Cover */}
                <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-gradient-to-br from-orange-900/50 to-slate-800 flex items-center justify-center relative overflow-hidden">
                  {continueListening.story.cover_url ? (
                    <img src={continueListening.story.cover_url} alt={continueListening.story.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl opacity-40">🎧</span>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-white text-sm truncate">{continueListening.story.title}</h3>
                      <p className="text-slate-400 text-xs">{continueListening.story.author} • {continueListening.story.genre}</p>
                      <StarRating rating={continueListening.story.rating} size="xs" />
                    </div>
                    <div className="flex items-center gap-1 text-orange-400 text-sm font-medium ml-2 flex-shrink-0">
                      <span>Resume</span>
                      <span>→</span>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${calculateProgress(continueListening.progress_seconds, continueListening.story.duration_mins)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>{formatTimeLeftOff(continueListening.progress_seconds)} left off</span>
                      <span>{calculateProgress(continueListening.progress_seconds, continueListening.story.duration_mins)}% complete</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recently Added - 3 cards in a row, no scrolling */}
        {recentlyAdded.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span>✨</span>
              <h2 className="text-base font-bold text-white">Recently Added</h2>
            </div>
            
            {/* 3 cards grid - equal width */}
            <div className="grid grid-cols-3 gap-2">
              {recentlyAdded.slice(0, 3).map((story) => (
                <div 
                  key={story.id} 
                  onClick={() => handleStoryClick(story.id)}
                  className="cursor-pointer active:scale-[0.97] transition-transform"
                >
                  {/* Cover - square, responsive */}
                  <div className="aspect-square rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative overflow-hidden mb-1.5">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-30">🎧</span>
                    )}
                    {story.is_new && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-orange-500 text-black text-[8px] font-bold rounded">
                        NEW
                      </div>
                    )}
                    <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/70 text-white text-[9px] rounded">
                      {story.duration_mins}m
                    </div>
                  </div>
                  {/* Info - compact */}
                  <h3 className="font-semibold text-white text-xs truncate leading-tight">{story.title}</h3>
                  <p className="text-slate-500 text-[10px] truncate">{story.author}</p>
                  <StarRating rating={story.rating} size="xs" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended For You - With thumbnails and ratings */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span>🎯</span>
              <h2 className="text-base font-bold text-white">Recommended For You</h2>
            </div>
            
            <div className="space-y-2">
              {recommendations.map((story, index) => {
                const reasons = [
                  'Based on your listening history',
                  'Popular with drivers',
                  'Highly rated'
                ]
                return (
                  <RecommendationCard 
                    key={story.id} 
                    story={story} 
                    reason={reasons[index % reasons.length]}
                  />
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* Bottom Action Buttons - Fixed */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-6 pb-4 px-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Link 
            href="/library"
            className="flex-1 py-3.5 bg-orange-500 hover:bg-orange-400 rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span className="text-lg">🔍</span>
            <span className="text-black font-semibold">Browse All</span>
          </Link>
          <Link 
            href="/wishlist"
            className="flex-1 py-3.5 bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span className="text-lg">❤️</span>
            <span className="text-white font-semibold">My Wishlist</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
