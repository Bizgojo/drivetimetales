'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url: string
  credits: number
}

function PlayContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const { user } = useAuth()
  
  const autoplay = searchParams.get('autoplay') === 'true'
  const resumeTime = searchParams.get('resume')
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isComplete, setIsComplete] = useState(false)
  const [rating, setRating] = useState(0)
  const [showResumeIndicator, setShowResumeIndicator] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressSaveInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function loadStory() {
      try {
        const { data, error: err } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single()
        
        if (err) throw err
        setStory(data)
      } catch (err) {
        console.error('Error loading story:', err)
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }
    loadStory()
  }, [storyId])

  useEffect(() => {
    if (story && audioRef.current) {
      // Set resume position if provided
      if (resumeTime) {
        const time = parseInt(resumeTime)
        if (!isNaN(time) && time > 0) {
          audioRef.current.currentTime = time
          setCurrentTime(time)
          setShowResumeIndicator(true)
          setTimeout(() => setShowResumeIndicator(false), 3000)
        }
      }
      
      // Auto-play if requested
      if (autoplay) {
        audioRef.current.play().catch(console.error)
        setIsPlaying(true)
      }
    }
  }, [story, autoplay, resumeTime])

  // Save progress periodically
  useEffect(() => {
    if (user && isPlaying) {
      progressSaveInterval.current = setInterval(() => {
        saveProgress()
      }, 10000) // Save every 10 seconds
    }
    
    return () => {
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current)
      }
    }
  }, [user, isPlaying, currentTime])

  const saveProgress = async () => {
    if (!user || !audioRef.current) return
    
    try {
      await supabase
        .from('user_library')
        .update({
          progress: Math.floor(audioRef.current.currentTime),
          last_played: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('story_id', storyId)
    } catch (err) {
      console.error('Error saving progress:', err)
    }
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
      saveProgress()
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
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

  const handleEnded = async () => {
    setIsPlaying(false)
    setIsComplete(true)
    
    // Mark as completed in database
    if (user) {
      try {
        await supabase
          .from('user_library')
          .update({
            progress: Math.floor(duration),
            completed: true,
            last_played: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('story_id', storyId)
      } catch (err) {
        console.error('Error marking complete:', err)
      }
    }
  }

  const handleSpeedChange = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2]
    const currentIndex = speeds.indexOf(playbackSpeed)
    const nextIndex = (currentIndex + 1) % speeds.length
    const newSpeed = speeds[nextIndex]
    
    setPlaybackSpeed(newSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handleBack = () => {
    saveProgress()
    router.push(`/player/${storyId}`)
  }

  const handleRating = async (stars: number) => {
    setRating(stars)
    
    if (user) {
      try {
        await supabase
          .from('reviews')
          .upsert({
            user_id: user.id,
            story_id: storyId,
            rating: stars,
            created_at: new Date().toISOString()
          })
      } catch (err) {
        console.error('Error saving rating:', err)
      }
    }
  }

  const handlePlaySimilar = () => {
    router.push(`/library?genre=${encodeURIComponent(story?.genre || '')}`)
  }

  const handlePlayAgain = () => {
    setIsComplete(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const displayName = user?.display_name || user?.email?.split('@')[0]
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl text-white mb-4">Story not found</h1>
          <Link href="/library" className="text-orange-400 hover:text-orange-300">
            ← Back to Library
          </Link>
        </div>
      </div>
    )
  }

  // Completion screen
  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-950 to-slate-950 text-white flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-green-800/50">
          <button onClick={() => router.push('/home')} className="text-green-300 hover:text-white flex items-center gap-2">
            <span>←</span>
            <span className="text-sm">Home</span>
          </button>
          
          <div className="text-center">
            <span className="text-xs text-green-400 font-medium">COMPLETE!</span>
          </div>
          
          {user && (
            <Link href="/account" className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-sm">
              {displayName?.charAt(0).toUpperCase() || 'U'}
            </Link>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-8 flex flex-col items-center justify-center">
          {/* Celebration */}
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-center mb-2">Story Complete!</h1>
          <p className="text-slate-400 text-center mb-8">
            You finished "{story.title}"
          </p>

          {/* Cover */}
          <div className="w-32 h-32 rounded-xl overflow-hidden bg-slate-800 mb-6 shadow-lg shadow-green-500/20">
            {story.cover_url ? (
              <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-600 to-green-900">
                <span className="text-4xl opacity-50">🎧</span>
              </div>
            )}
          </div>

          {/* Rating */}
          <p className="text-slate-400 text-sm mb-3">How would you rate this story?</p>
          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRating(star)}
                className={`text-3xl transition ${
                  star <= rating ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                ★
              </button>
            ))}
          </div>

          {rating > 0 && (
            <p className="text-green-400 text-sm mb-6">Thanks for rating!</p>
          )}
        </main>

        {/* Action Buttons */}
        <div className="px-4 pb-8 space-y-3">
          <button
            onClick={handlePlaySimilar}
            className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition"
          >
            🎧 Find Similar Stories
          </button>
          <button
            onClick={handlePlayAgain}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
          >
            ↺ Play Again
          </button>
        </div>
      </div>
    )
  }

  // Now playing screen
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white flex flex-col">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <button onClick={handleBack} className="text-slate-400 hover:text-white flex items-center gap-2">
          <span>←</span>
          <span className="text-sm">Back</span>
        </button>
        
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-lg">🚛🚗</span>
          <span className="font-bold text-white text-sm">Drive Time<span className="text-orange-400">Tales</span></span>
        </Link>
        
        {user && (
          <Link href="/account" className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        )}
      </header>

      {/* Resume Indicator */}
      {showResumeIndicator && (
        <div className="bg-orange-500/20 border-b border-orange-500/30 px-4 py-2 text-center">
          <p className="text-orange-400 text-sm">↳ Resumed from {formatTime(parseInt(resumeTime || '0'))}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 flex flex-col">
        {/* Cover */}
        <div className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-slate-800 mb-4 shadow-xl">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
              <span className="text-6xl opacity-50">🎧</span>
            </div>
          )}
        </div>

        {/* Story Info */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold mb-1">{story.title}</h1>
          <p className="text-orange-400 text-sm">{story.author || 'Drive Time Tales'}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full"
            style={{
              background: `linear-gradient(to right, #f97316 0%, #f97316 ${progressPercent}%, #334155 ${progressPercent}%, #334155 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-white mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-6 my-8">
          {/* Skip Back */}
          <button
            onClick={() => handleSkip(-15)}
            className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition"
          >
            <span className="text-white text-xs font-bold">-15</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="w-20 h-20 bg-orange-500 hover:bg-orange-400 rounded-full flex items-center justify-center transition shadow-lg shadow-orange-500/30"
          >
            {isPlaying ? (
              <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Skip Forward */}
          <button
            onClick={() => handleSkip(30)}
            className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition"
          >
            <span className="text-white text-xs font-bold">+30</span>
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex justify-center">
          <button
            onClick={handleSpeedChange}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-white transition"
          >
            {playbackSpeed}x Speed
          </button>
        </div>
      </main>
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PlayContent />
    </Suspense>
  )
}
