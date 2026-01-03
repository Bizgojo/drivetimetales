'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

function PlayContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const audioRef = useRef<HTMLAudioElement>(null)
  const { user, refreshCredits } = useAuth()
  
  const [story, setStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [creditsDeducted, setCreditsDeducted] = useState(false)

  const speedOptions = [0.85, 1, 1.15]
  
  // Get URL params
  const shouldAutoplay = searchParams.get('autoplay') === 'true'
  const shouldResume = searchParams.get('resume') === 'true'

  useEffect(() => {
    async function loadStory() {
      try {
        // Check if user is logged in
        const { data: { session } } = await supabase.auth.getSession()
        const loggedIn = !!session
        setIsLoggedIn(loggedIn)
        
        // Only check user_library for logged-in members
        if (loggedIn && session?.user?.id) {
          const { data: libraryItem } = await supabase
            .from('user_library')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('story_id', storyId)
            .single()
          
          if (libraryItem) {
            // Format last played date from database
            if (libraryItem.last_played_at) {
              const date = new Date(libraryItem.last_played_at)
              setLastPlayed(date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
            }
            // If resuming, set the saved progress
            if (shouldResume && libraryItem.progress_seconds > 0) {
              setCurrentTime(libraryItem.progress_seconds)
            }
          }
        } else {
          // Newcomer - check localStorage for progress only (no "Last played" shown)
          const libraryData = localStorage.getItem('dtt_library')
          if (libraryData) {
            const library = JSON.parse(libraryData)
            const libraryItem = library.find((item: any) => item.storyId === storyId)
            if (libraryItem && shouldResume && libraryItem.progress > 0) {
              setCurrentTime(libraryItem.progress)
            }
            // Don't set lastPlayed for newcomers
          }
        }

        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single()
        
        if (error || !data) {
          setError('Story not found')
        } else {
          setStory(data)
        }
      } catch (err) {
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }
    
    if (storyId) {
      loadStory()
    }
  }, [storyId, shouldResume])

  // Handle autoplay and resume when audio is ready
  useEffect(() => {
    if (story && audioRef.current && !hasStartedPlaying) {
      const audio = audioRef.current
      
      const handleCanPlay = () => {
        // If resuming, seek to saved position
        if (shouldResume) {
          const libraryData = localStorage.getItem('dtt_library')
          if (libraryData) {
            const library = JSON.parse(libraryData)
            const libraryItem = library.find((item: any) => item.storyId === storyId)
            if (libraryItem && libraryItem.progress > 0) {
              audio.currentTime = libraryItem.progress
            }
          }
        }
        
        // Autoplay if flag is set
        if (shouldAutoplay) {
          audio.play().then(() => {
            setIsPlaying(true)
            setHasStartedPlaying(true)
          }).catch(() => {
            // Autoplay blocked, user will need to tap play
            setHasStartedPlaying(true)
          })
        } else {
          setHasStartedPlaying(true)
        }
      }
      
      audio.addEventListener('canplay', handleCanPlay)
      return () => audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [story, shouldAutoplay, shouldResume, storyId, hasStartedPlaying])

  // Save progress periodically
  useEffect(() => {
    if (!isPlaying || currentTime === 0) return
    
    const saveProgress = async () => {
      if (isLoggedIn) {
        // Save to database for logged-in members
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          await supabase
            .from('user_library')
            .update({
              progress: Math.floor(currentTime),
              last_played: new Date().toISOString()
            })
            .eq('user_id', session.user.id)
            .eq('story_id', storyId)
        }
      } else {
        // Save to localStorage for newcomers
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const existingIndex = library.findIndex((item: any) => item.storyId === storyId)
          if (existingIndex !== -1) {
            library[existingIndex].progress = currentTime
            localStorage.setItem('dtt_library', JSON.stringify(library))
          }
        }
      }
    }
    
    const interval = setInterval(saveProgress, 5000) // Save every 5 seconds
    return () => clearInterval(interval)
  }, [isPlaying, currentTime, storyId, isLoggedIn])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  const handlePlayPause = async () => {
    if (!audioRef.current) return
    
    // Deduct credits on first play (not resume)
    if (!isPlaying && !creditsDeducted && user && story) {
      const storyCredits = story.credits || 1
      
      // Check if user already owns this story (has it in library with progress)
      const { data: libraryItem } = await supabase
        .from('user_library')
        .select('id')
        .eq('user_id', user.id)
        .eq('story_id', storyId)
        .single()
      
      // Only deduct if not already in library (first time playing this story)
      if (!libraryItem) {
        // Road Warrior has unlimited (-1)
        if (user.credits !== -1) {
          // Deduct credits
          const newCredits = Math.max(0, (user.credits || 0) - storyCredits)
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ credits: newCredits })
            .eq('id', user.id)
          
          if (updateError) {
            console.error('Failed to deduct credits:', updateError)
          } else {
            console.log(`Deducted ${storyCredits} credits. New balance: ${newCredits}`)
            // Refresh user data to update UI
            if (refreshCredits) refreshCredits()
          }
        }
        
        // Add to user's library
        await supabase
          .from('user_library')
          .insert({
            user_id: user.id,
            story_id: storyId,
            progress_seconds: 0,
            last_played_at: new Date().toISOString()
          })
      }
      
      setCreditsDeducted(true)
    }
    
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

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleBack = async () => {
    // Save progress before leaving
    if (currentTime > 0) {
      if (isLoggedIn) {
        // Save to database for logged-in members
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          await supabase
            .from('user_library')
            .update({
              progress: Math.floor(currentTime),
              last_played: new Date().toISOString()
            })
            .eq('user_id', session.user.id)
            .eq('story_id', storyId)
        }
      } else {
        // Save to localStorage for newcomers
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const existingIndex = library.findIndex((item: any) => item.storyId === storyId)
          if (existingIndex !== -1) {
            library[existingIndex].progress = currentTime
            localStorage.setItem('dtt_library', JSON.stringify(library))
          }
        }
      }
    }
    
    if (audioRef.current) {
      audioRef.current.pause()
    }
    router.push(`/player/${storyId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">Story not found</p>
          <button onClick={() => router.push('/welcome')} className="text-orange-400">← Back to Stories</button>
        </div>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="max-w-md mx-auto px-4 py-4">
        
        {/* Logo + Back Button + Avatar Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo */}
          <div className="flex items-center gap-1">
            <span className="text-2xl">🚛</span>
            <span className="text-2xl">🚗</span>
            <div className="flex items-baseline ml-1">
              <span className="text-sm font-bold text-white">Drive Time </span>
              <span className="text-sm font-bold text-orange-500">Tales</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Back button */}
            <button 
              onClick={handleBack}
              className="px-3 py-1.5 bg-slate-800 rounded-lg"
            >
              <span className="text-orange-400 text-sm font-medium">← Back</span>
            </button>
            
            {/* User avatar */}
            {user && (
              <Link 
                href="/account"
                className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm"
              >
                {(user.display_name || user.email || 'U').charAt(0).toUpperCase()}
              </Link>
            )}
          </div>
        </div>

        {/* In Library notice */}
        {lastPlayed && (
          <div className="bg-slate-800 rounded-lg py-1.5 px-3 mb-3 border border-slate-700 text-center">
            <p className="text-green-400 text-xs font-medium">
              📚 Last played {lastPlayed}
            </p>
          </div>
        )}

        {/* Cover - large */}
        <div className="w-56 h-56 mx-auto rounded-xl overflow-hidden border-4 border-white">
          {story.cover_url ? (
            <img 
              src={story.cover_url} 
              alt={story.title} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
              <span className="text-3xl">🎧</span>
            </div>
          )}
        </div>

        {/* Title + Author */}
        <div className="text-center mt-3 mb-4">
          <h1 className="font-bold text-white text-lg">{story.title}</h1>
          <p className="text-slate-300 text-sm">{story.author}</p>
        </div>

        {/* Compact Player */}
        <div className="bg-orange-500 rounded-xl p-3">
          
          {/* Time display */}
          <div className="flex justify-between text-black text-xs font-medium mb-1">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
          </div>

          {/* Progress slider */}
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 rounded-full appearance-none cursor-pointer mb-4"
            style={{ 
              background: `linear-gradient(to right, #000 ${progress}%, #fdba74 ${progress}%)` 
            }}
          />

          {/* Controls - larger play button, wider spacing */}
          <div className="flex items-center justify-center gap-8 mb-3">
            {/* Rewind 15s */}
            <button 
              onClick={() => handleSkip(-15)}
              className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-white text-base">⏪</span>
              <span className="text-white text-[8px]">15s</span>
            </button>

            {/* Play/Pause - Extra Large */}
            <button 
              onClick={handlePlayPause}
              className="w-20 h-20 rounded-full bg-black hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <span className="text-white text-4xl">{isPlaying ? '⏸' : '▶'}</span>
            </button>

            {/* Forward 15s */}
            <button 
              onClick={() => handleSkip(15)}
              className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-white text-base">⏩</span>
              <span className="text-white text-[8px]">15s</span>
            </button>
          </div>

          {/* Speed controls */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-black text-xs font-medium">Speed:</span>
            {speedOptions.map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  playbackSpeed === speed 
                    ? 'bg-black text-white' 
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PlayContent />
    </Suspense>
  )
}
