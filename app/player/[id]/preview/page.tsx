'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getStory, Story } from '@/lib/supabase'

function PreviewContent() {
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
  const [previewEnded, setPreviewEnded] = useState(false)
  const [screenHeight, setScreenHeight] = useState(0)
  const [freeCredits, setFreeCredits] = useState(0)

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
        // Check free credits
        const storedCredits = localStorage.getItem('dtt_free_credits')
        if (storedCredits) {
          setFreeCredits(parseInt(storedCredits))
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

  // Calculate preview limit (10% of duration)
  const previewLimit = duration * 0.1

  // Check if preview time exceeded
  useEffect(() => {
    if (duration > 0 && currentTime >= previewLimit && !previewEnded) {
      setPreviewEnded(true)
      setIsPlaying(false)
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [currentTime, previewLimit, duration, previewEnded])

  const handlePlayPause = () => {
    if (!audioRef.current || previewEnded) return
    
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
    // Only allow seeking within preview limit
    if (time <= previewLimit && audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      setPreviewEnded(false)
      audioRef.current.play()
      setIsPlaying(true)
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

  const handlePlayFull = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    // Add to library
    const libraryData = localStorage.getItem('dtt_library')
    const library = libraryData ? JSON.parse(libraryData) : []
    const exists = library.find((item: any) => item.storyId === storyId)
    
    if (!exists) {
      library.push({
        storyId: storyId,
        lastPlayed: new Date().toLocaleDateString('en-US', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        }),
        progress: 0
      })
      localStorage.setItem('dtt_library', JSON.stringify(library))
    }
    
    router.push(`/player/${storyId}/play`)
  }

  // Calculate cover size
  const coverSize = Math.max(80, Math.min(screenHeight - 420, 160))

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white">Loading preview...</p>
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

  const progress = previewLimit > 0 ? (currentTime / previewLimit) * 100 : 0
  const canPlayFree = story.credits <= 2 && freeCredits > 0

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />

      <div className="px-4 h-full flex flex-col">
        
        {/* Back button */}
        <button 
          onClick={handleBack}
          className="px-3 py-1.5 bg-slate-800 rounded-lg self-start mt-3 mb-2"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

        {/* Preview badge */}
        <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg p-2 mb-2 text-center">
          <p className="text-orange-400 text-xs font-medium">
            🎧 Preview Mode - First 10% of story
          </p>
        </div>

        {/* Cover */}
        <div 
          className="mx-auto rounded-xl overflow-hidden border-4 border-orange-500 flex-shrink-0"
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

        {/* Preview Player */}
        <div className="bg-slate-800 rounded-xl p-4 flex-1 flex flex-col justify-center mb-3">
          
          {/* Preview ended overlay */}
          {previewEnded && (
            <div className="absolute inset-0 bg-slate-900/90 rounded-xl flex flex-col items-center justify-center z-10">
              <p className="text-white text-lg font-bold mb-2">Preview Complete!</p>
              <p className="text-slate-400 text-sm mb-4">Enjoyed the story?</p>
              <div className="flex gap-2">
                <button 
                  onClick={handleRestart}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <span className="text-white text-sm">🔄 Replay Preview</span>
                </button>
              </div>
            </div>
          )}

          {/* Time display */}
          <div className="flex justify-between text-slate-400 text-sm font-medium mb-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(previewLimit)}</span>
          </div>

          {/* Progress slider - limited to preview */}
          <input
            type="range"
            min="0"
            max={previewLimit || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 rounded-full appearance-none cursor-pointer mb-4"
            style={{ 
              background: `linear-gradient(to right, #f97316 ${progress}%, #334155 ${progress}%)` 
            }}
          />

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mb-2">
            {/* Play/Pause */}
            <button 
              onClick={handlePlayPause}
              disabled={previewEnded}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                previewEnded 
                  ? 'bg-slate-700 cursor-not-allowed' 
                  : 'bg-orange-500 hover:bg-orange-400'
              }`}
            >
              <span className={`text-3xl ${previewEnded ? 'text-slate-500' : 'text-black'}`}>
                {isPlaying ? '⏸' : '▶'}
              </span>
            </button>
          </div>

          {/* Preview info */}
          <p className="text-slate-500 text-[10px] text-center">
            Preview: {formatTime(previewLimit)} of {formatTime(duration)} total
          </p>
        </div>

        {/* Full story button */}
        {canPlayFree ? (
          <button 
            onClick={handlePlayFull}
            className="w-full py-3 bg-green-500 hover:bg-green-400 rounded-xl transition-colors mb-4"
          >
            <span className="text-black font-bold text-base">▶ Play Full Story Free</span>
          </button>
        ) : freeCredits > 0 ? (
          <button 
            onClick={handlePlayFull}
            className="w-full py-3 bg-green-500 hover:bg-green-400 rounded-xl transition-colors mb-4"
          >
            <span className="text-black font-bold text-base">▶ Play Full Story</span>
          </button>
        ) : (
          <button 
            onClick={() => router.push('/pricing')}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl transition-colors mb-4"
          >
            <span className="text-black font-bold text-sm">Subscribe to Listen to Full Story</span>
          </button>
        )}
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

export default function PreviewPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PreviewContent />
    </Suspense>
  )
}
