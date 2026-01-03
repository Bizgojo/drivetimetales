'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStory, Story } from '@/lib/supabase'
import { Header } from '@/components/ui/Header'

const genreColors: Record<string, string> = {
  'Mystery': 'from-purple-600 to-purple-900',
  'Drama': 'from-orange-600 to-orange-900',
  'Sci-Fi': 'from-cyan-600 to-cyan-900',
  'Horror': 'from-red-600 to-red-900',
  'Comedy': 'from-yellow-600 to-yellow-900',
  'Romance': 'from-pink-600 to-pink-900',
  'Adventure': 'from-green-600 to-green-900',
  'Trucker Stories': 'from-amber-600 to-amber-900',
  'Thriller': 'from-indigo-600 to-indigo-900',
}

function StoryContent() {
  const params = useParams()
  const storyId = params.id as string
  const { user } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    async function loadStory() {
      try {
        const data = await getStory(storyId)
        setStory(data)
      } catch (err) {
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }
    loadStory()
  }, [storyId])

  const handlePlayPause = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white py-12 px-4 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Loading story...</p>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 text-white py-12 px-4 text-center">
        <h1 className="text-xl text-white mb-4">Story not found</h1>
        <Link href="/library" className="text-orange-400">← Back to Library</Link>
      </div>
    )
  }

  const creditsNeeded = Math.ceil(story.duration_mins / 15)
  const canPlay = user && (
    user.subscription_type === 'road_warrior' || 
    user.subscription_type === 'commuter' || 
    user.credits >= creditsNeeded
  )
  const gradientColor = genreColors[story.genre] || 'from-slate-600 to-slate-800'
  const displayName = user?.display_name || user?.email?.split('@')[0]

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header isLoggedIn={!!user} showBack userName={displayName} userCredits={user?.credits} />
      
      <div className="py-4 px-4">
        <div className="max-w-3xl mx-auto">
        
        <div className="flex flex-col md:flex-row gap-6">
          {/* Cover */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className={`aspect-square rounded-xl relative overflow-hidden ${story.cover_url ? '' : `bg-gradient-to-br ${gradientColor}`}`}>
              {story.cover_url ? (
                <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl opacity-50">🎧</span>
                </div>
              )}
              {story.is_new && (
                <div className="absolute top-3 left-3 px-3 py-1 bg-green-500 text-black text-sm font-bold rounded">NEW</div>
              )}
            </div>

            {/* Audio Player */}
            {story.audio_url && (
              <div className="mt-4 bg-slate-800 rounded-xl p-4">
                <audio
                  ref={audioRef}
                  src={story.audio_url}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
                
                {/* Progress bar */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                
                {/* Time display */}
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                
                {/* Play button */}
                <button
                  onClick={handlePlayPause}
                  className="w-full mt-3 py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-xl"
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            {story.is_new && (
              <span className="inline-block px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded mb-2">NEW</span>
            )}
            {story.is_featured && (
              <span className="inline-block px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded mb-2 ml-2">FEATURED</span>
            )}
            <h1 className="text-2xl font-bold text-white mb-1">{story.title}</h1>
            <p className="text-orange-400 mb-1">{story.genre}</p>
            <p className="text-slate-400 mb-1">by {story.author}</p>
            <p className="text-slate-500 text-sm mb-4">{story.duration_mins} min • {creditsNeeded} credits</p>

            {story.description && (
              <p className="text-slate-300 mb-6">{story.description}</p>
            )}

            {/* Stats */}
            <div className="flex gap-4 mb-6 text-sm">
              <div className="text-slate-400">
                <span className="text-white font-semibold">{story.play_count}</span> plays
              </div>
              {story.rating > 0 && (
                <div className="text-slate-400">
                  <span className="text-yellow-400">★</span> {story.rating.toFixed(1)}
                </div>
              )}
            </div>

            {/* Access Status */}
            <div className="p-4 bg-slate-800/50 rounded-xl mb-4">
              {!user ? (
                <div>
                  <p className="text-slate-300 mb-3">Sign in to listen to this story</p>
                  <Link href="/signin" className="inline-block px-6 py-2 bg-orange-500 text-black font-semibold rounded-lg">
                    Sign In
                  </Link>
                </div>
              ) : canPlay ? (
                <div>
                  <p className="text-green-400 mb-1">✓ You can play this story</p>
                  <p className="text-slate-400 text-sm">
                    {user.subscription_type === 'road_warrior' || user.subscription_type === 'commuter' 
                      ? `Included with your ${user.subscription_type === 'road_warrior' ? 'Road Warrior' : 'Commuter'} plan`
                      : `Uses ${creditsNeeded} of your ${user.credits} credits`
                    }
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-slate-300 mb-1">You need {creditsNeeded} credits to play</p>
                  <p className="text-slate-400 text-sm mb-3">You have {user.credits} credits</p>
                  <Link href="/pricing" className="inline-block px-6 py-2 bg-orange-500 text-black font-semibold rounded-lg">
                    Get More Credits
                  </Link>
                </div>
              )}
            </div>

            {/* Sample URL if available */}
            {story.sample_url && (
              <div className="p-4 bg-slate-800/50 rounded-xl">
                <p className="text-slate-400 text-sm mb-2">Free sample available</p>
                <audio controls src={story.sample_url} className="w-full" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StoryPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading...</div>}>
      <StoryContent />
    </Suspense>
  )
}
