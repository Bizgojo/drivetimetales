'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getStory, Story } from '@/lib/supabase'

function PlayContent() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  const audioRef = useRef<HTMLAudioElement>(null)
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isInLibrary, setIsInLibrary] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)
  const [screenHeight, setScreenHeight] = useState(0)

  const speedOptions = [1, 1.25, 1.5, 2]

  useEffect(() => {
    const updateDimensions = () => {
      setScreenHeight(window.innerHeight)
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    async function loadStory() {
      try {
        // Check if story is in user's library
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const libraryItem = library.find((item: any) => item.storyId === storyId)
          if (libraryItem) {
            setIsInLibrary(true)
            setLastPlayed(libraryItem.lastPlayed)
            // Restore progress if available
            if (libraryItem.progress && audioRef.current) {
              audioRef.current.currentTime = libraryItem.progress
            }
          }
        }

        const storyData = await getStory(storyId)
        setStory(storyData)
      } catch (err) {
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }
    
    if (storyId) {
      loadStory()
    }
  }, [storyId])

  // Auto-play when story loads (coming from Screen A)
  useEffect(() => {
    if (story && audioRef.current && !isInLibrary) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [story, isInLibrary])

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Save progress periodically
  useEffect(() => {
    const saveProgress = () => {
      if (currentTime > 0) {
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const index = library.findIndex((item: any) => item.storyId === storyId)
          if (index !== -1) {
            library[index].progress = currentTime
            library[index].lastPlayed = new Date().toLocaleDateString('en-US', { 
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            })
            localStorage.setItem('dtt_library', JSON.stringify(library))
          }
        }
      }
    }

    const interval = setInterval(saveProgress, 5000) // Save every 5 seconds
    return () => clearInterval(interval)
  }, [currentTime, storyId])

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

  const handleBack = () => {
    // Save progress before leaving
    if (audioRef.current && currentTime > 0) {
      const libraryData = localStorage.getItem('dtt_library')
      if (libraryData) {
        const library = JSON.parse(libraryData)
        const index = library.findIndex((item: any) => item.storyId === storyId)
        if (index !== -1) {
          library[index].progress = currentTime
          localStorage.setItem('dtt_library', JSON.stringify(library))
        }
      }
    }
    router.push(`/player/${storyId}`)
  }

  // Calculate cover size for player screen
  // Fixed elements: back + library notice (~80px) + title (~50px) + player (~220px) + padding (~50px) = ~400px
  const coverSize = Math.max(80, Math.min(screenHeight - 400, 180))

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white">Loading player...</p>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">Story not found</p>
          <button onClick={() => router.push('/library')} className="text-orange-400">← Back to Library</button>
        </div>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="px-4 h-full flex flex-col">
        
        {/* Back button */}
        <button 
          onClick={handleBack}
          className="px-3 py-1.5 bg-slate-800 rounded-lg self-start mt-3 mb-2"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

        {/* In Library notice */}
        {isInLibrary && lastPlayed && (
          <div className="bg-slate-800 rounded-lg p-2 mb-2 border border-slate-700 text-center">
            <p className="text-green-400 text-xs font-medium">
              📚 In your library • Last played {lastPlayed}
            </p>
          </div>
        )}

        {/* Cover */}
        <div 
          className="mx-auto rounded-xl overflow-hidden border-4 border-white flex-shrink-0"
          style={{ width: coverSize, height: coverSize }}
        >
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
        <div className="text-center mt-2 mb-2">
          <h1 className="font-bold text-white text-base">{story.title}</h1>
          <p className="text-slate-300 text-xs">{story.author}</p>
        </div>

        {/* Player */}
        <div className="bg-orange-500 rounded-xl p-4 flex-1 flex flex-col justify-center mb-4">
          
          {/* Time display */}
          <div className="flex justify-between text-black text-sm font-medium mb-1">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(duration - currentTime)}</span>
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

          {/* Large Controls */}
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Rewind 15s */}
            <button 
              onClick={() => handleSkip(-15)}
              className="w-14 h-14 rounded-full bg-orange-600 hover:bg-orange-700 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-white text-lg">⏪</span>
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
              className="w-14 h-14 rounded-full bg-orange-600 hover:bg-orange-700 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-white text-lg">⏩</span>
              <span className="text-white text-[8px]">15s</span>
            </button>
          </div>

          {/* Speed controls */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-black text-xs font-medium mr-1">Speed:</span>
            {speedOptions.map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
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
    <div className="h-screen bg-slate-950 flex items-center justify-center">
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
