'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
  preview_audio_url?: string // Optional separate preview file
  preview_end_time?: number // Seconds where preview ends
  credits: number
}

function PreviewContent() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [previewEnded, setPreviewEnded] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)

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

  // Calculate preview duration (10% of story)
  const previewDuration = story 
    ? (story.preview_end_time || Math.floor(story.duration_mins * 60 * 0.1))
    : 0

  useEffect(() => {
    // Auto-play when story loads
    if (story && audioRef.current && !previewEnded) {
      audioRef.current.play().catch(console.error)
      setIsPlaying(true)
    }
  }, [story, previewEnded])

  useEffect(() => {
    // Check if preview should end
    if (currentTime >= previewDuration && previewDuration > 0 && !previewEnded) {
      handlePreviewEnd()
    }
  }, [currentTime, previewDuration, previewEnded])

  const handlePreviewEnd = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    setPreviewEnded(true)
    
    // Save preview completed status
    localStorage.setItem(`preview_${storyId}`, 'completed')
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
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
    if (audioRef.current && time < previewDuration) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleBack = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    router.push(`/player/${storyId}?fromPreview=true`)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const displayName = user?.display_name || user?.email?.split('@')[0]
  const progressPercent = previewDuration > 0 ? (currentTime / previewDuration) * 100 : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading preview...</p>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl text-white mb-4">Story not found</h1>
          <Link href="/library" className="text-blue-400 hover:text-blue-300">
            ← Back to Library
          </Link>
        </div>
      </div>
    )
  }

  // Preview ended state
  if (previewEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-slate-950 text-white flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-blue-800/50">
          <button onClick={handleBack} className="text-blue-300 hover:text-white flex items-center gap-2">
            <span>←</span>
            <span className="text-sm">Back</span>
          </button>
          
          <div className="text-center">
            <span className="text-xs text-blue-400 font-medium">PREVIEW ENDED</span>
          </div>
          
          {user && (
            <Link href="/account" className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
              {displayName?.charAt(0).toUpperCase() || 'U'}
            </Link>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-8 flex flex-col items-center justify-center">
          {/* Small Cover */}
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-800 mb-6 shadow-lg shadow-blue-500/20">
            {story.cover_url ? (
              <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900">
                <span className="text-3xl opacity-50">🎧</span>
              </div>
            )}
          </div>

          {/* Announcer Message */}
          <div className="text-center max-w-sm mb-8">
            <p className="text-blue-200 text-lg leading-relaxed">
              I hope you enjoyed this preview of <span className="text-white font-semibold">"{story.title}"</span>.
            </p>
            <p className="text-slate-400 mt-3 text-sm">
              The full story is <span className="text-white">{story.duration_mins} minutes</span> long 
              and you've heard the first 10%.
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-slate-400 mb-8">
            <span className="flex items-center gap-1">
              <span>🎧</span>
              <span>{formatTime(previewDuration)} preview</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span>📖</span>
              <span>{story.duration_mins} min full</span>
            </span>
          </div>

          {/* Call to Action */}
          <div className="text-center text-slate-400 text-sm">
            <p>If you like this story, you can:</p>
          </div>
        </main>

        {/* Bottom Action Buttons */}
        <div className="px-4 pb-8 space-y-3">
          <button
            onClick={handleBack}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition"
          >
            See My Options →
          </button>
          <p className="text-slate-500 text-xs text-center">
            Resume, save to wishlist, or skip this story
          </p>
        </div>
      </div>
    )
  }

  // Playing preview state
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-slate-950 text-white flex flex-col">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={story.preview_audio_url || story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handlePreviewEnd}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-blue-800/50">
        <button onClick={handleBack} className="text-blue-300 hover:text-white flex items-center gap-2">
          <span>←</span>
          <span className="text-sm">Stop</span>
        </button>
        
        <div className="text-center">
          <span className="text-xs text-blue-400 font-medium">PREVIEW MODE</span>
        </div>
        
        {user && (
          <Link href="/account" className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 flex flex-col">
        {/* Cover - Smaller for preview */}
        <div className="w-40 h-40 mx-auto rounded-xl overflow-hidden bg-slate-800 mb-4 shadow-lg shadow-blue-500/20">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900">
              <span className="text-5xl opacity-50">🎧</span>
            </div>
          )}
        </div>

        {/* Story Info */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold mb-1">{story.title}</h1>
          <p className="text-blue-400 text-sm">{story.genre} • Preview</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={previewDuration}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-blue-900 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #1e3a5f ${progressPercent}%, #1e3a5f 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(previewDuration)}</span>
          </div>
        </div>

        {/* Preview indicator */}
        <div className="bg-blue-900/30 rounded-lg p-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-300">Preview Progress</span>
            <span className="text-white font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-1 bg-blue-900 rounded-full mt-2 overflow-hidden">
            <div 
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Play/Pause Control */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={handlePlayPause}
            className="w-20 h-20 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center transition shadow-lg shadow-blue-500/30"
          >
            {isPlaying ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Skip Preview */}
        <button
          onClick={handlePreviewEnd}
          className="text-slate-400 hover:text-white text-sm py-3 transition"
        >
          Skip to end →
        </button>
      </main>
    </div>
  )
}

export default function PreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PreviewContent />
    </Suspense>
  )
}
