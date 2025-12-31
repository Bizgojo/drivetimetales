'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function PlayContent() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  const audioRef = useRef<HTMLAudioElement>(null)
  
  const [story, setStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isInLibrary, setIsInLibrary] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)

  const speedOptions = [0.85, 1, 1.15]

  useEffect(() => {
    async function loadStory() {
      try {
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const libraryItem = library.find((item: any) => item.storyId === storyId)
          if (libraryItem) {
            setIsInLibrary(true)
            setLastPlayed(libraryItem.lastPlayed)
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
  }, [storyId])

  // Auto-play when story loads (if not returning from library)
  useEffect(() => {
    if (story && audioRef.current && !isInLibrary) {
      audioRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
  }, [story, isInLibrary])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

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
    if (audioRef.current) {
      audioRef.current.pause()
    }
    router.push(`/player/${storyId}`)
  }

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
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
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="px-4 py-3">
        
        {/* Back button */}
        <button 
          onClick={handleBack}
          className="px-3 py-1.5 bg-slate-800 rounded-lg mb-3"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

        {/* In Library notice */}
        {isInLibrary && lastPlayed && (
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

        {/* Compact Player - moved up close to title */}
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
