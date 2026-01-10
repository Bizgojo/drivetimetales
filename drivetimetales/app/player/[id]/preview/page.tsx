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
  preview_audio_url?: string
  preview_end_time?: number
  credits: number
}

function PreviewContent() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user, refreshCredits } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buying, setBuying] = useState(false)
  
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

  const previewDuration = story 
    ? (story.preview_end_time || Math.floor(story.duration_mins * 60 * 0.1))
    : 0

  useEffect(() => {
    if (story && audioRef.current) {
      audioRef.current.play().catch(console.error)
      setIsPlaying(true)
    }
  }, [story])

  useEffect(() => {
    if (currentTime >= previewDuration && previewDuration > 0 && isPlaying) {
      handlePreviewEnd()
    }
  }, [currentTime, previewDuration, isPlaying])

  const handlePreviewEnd = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    localStorage.setItem(`preview_${storyId}`, 'completed')
    router.push(`/player/${storyId}?fromPreview=true`)
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

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(previewDuration, audioRef.current.currentTime + seconds))
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handleBack = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    router.push(`/player/${storyId}?fromPreview=true`)
  }

  const handleExit = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    localStorage.setItem(`preview_${storyId}`, 'completed')
    router.push(`/player/${storyId}?fromPreview=true`)
  }

  const handleBuyNow = async () => {
    if (!user || !story) return
    
    const creditCost = story.credits || 1
    
    if (user.credits < creditCost && user.credits !== -1) {
      alert('Not enough credits. Please purchase more credits.')
      return
    }
    
    setBuying(true)
    try {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      
      const newCredits = user.credits === -1 ? -1 : user.credits - creditCost
      const { error: creditError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('id', user.id)
      
      if (creditError) throw creditError
      
      const { error: libError } = await supabase
        .from('user_library')
        .insert({
          user_id: user.id,
          story_id: storyId,
          progress: Math.floor(currentTime),
          completed: false
        })
      
      if (libError) throw libError
      
      await refreshCredits()
      localStorage.removeItem(`preview_${storyId}`)
      router.push(`/player/${storyId}/play?autoplay=true&resume=${Math.floor(currentTime)}`)
    } catch (err) {
      console.error('Error purchasing:', err)
      alert('Failed to purchase. Please try again.')
    } finally {
      setBuying(false)
    }
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
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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
          <Link href="/library" className="text-orange-400 hover:text-orange-300">
            ← Back to Library
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={story.preview_audio_url || story.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handlePreviewEnd}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <button onClick={handleBack} className="text-white hover:text-orange-400 flex items-center gap-2 font-medium">
          <span className="text-lg">←</span>
          <span>Back</span>
        </button>
        
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-lg">🚛</span>
          <span className="text-lg">🚗</span>
          <span className="font-bold text-white ml-1">Drive Time</span>
          <span className="font-bold text-orange-400">Tales</span>
        </Link>
        
        {user ? (
          <Link href="/account" className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        ) : (
          <div className="w-8" />
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pt-4 pb-6 flex flex-col">
        {/* Full Width Cover with Glow */}
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-800 mb-3 shadow-[0_0_30px_rgba(255,255,255,0.5)]">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
              <span className="text-8xl opacity-50">🎧</span>
            </div>
          )}
        </div>

        {/* Story Info - Author under title */}
        <div className="text-center mb-3">
          <h1 className="text-lg font-bold mb-1">{story.title}</h1>
          <p className="text-white text-sm mb-1">by {story.author || 'Unknown Author'}</p>
          <p className="text-orange-400 text-sm">{story.genre} • Preview</p>
        </div>

        {/* Orange Player Controls Box */}
        <div className="bg-orange-500 rounded-2xl p-4 mb-3">
          {/* Progress Bar - Larger slider thumb */}
          <div className="mb-4">
            <input
              type="range"
              min="0"
              max={previewDuration}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-3 bg-orange-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-300"
              style={{
                background: `linear-gradient(to right, #fff 0%, #fff ${progressPercent}%, #c2410c ${progressPercent}%, #c2410c 100%)`
              }}
            />
            <div className="flex justify-between text-xs text-black font-medium mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(previewDuration)}</span>
            </div>
          </div>

          {/* Preview progress indicator */}
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-black/70">Preview Progress</span>
            <span className="text-black font-bold">{Math.round(progressPercent)}%</span>
          </div>

          {/* Play/Pause - Separated with more space */}
          <div className="flex justify-center mb-4">
            <button
              onClick={handlePlayPause}
              className="w-20 h-20 bg-black hover:bg-slate-900 rounded-full flex items-center justify-center transition shadow-lg"
            >
              {isPlaying ? (
                <svg className="w-9 h-9 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-9 h-9 text-orange-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Skip buttons - Separated row */}
          <div className="flex items-center justify-center gap-8">
            {/* Skip Back 15 */}
            <button
              onClick={() => handleSkip(-15)}
              className="w-12 h-12 bg-black hover:bg-slate-900 rounded-full flex items-center justify-center transition"
            >
              <span className="text-orange-500 text-xs font-bold">-15</span>
            </button>

            {/* Skip Forward 15 */}
            <button
              onClick={() => handleSkip(15)}
              className="w-12 h-12 bg-black hover:bg-slate-900 rounded-full flex items-center justify-center transition"
            >
              <span className="text-orange-500 text-xs font-bold">+15</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {user && (
            <button
              onClick={handleBuyNow}
              disabled={buying || (user.credits < (story.credits || 1) && user.credits !== -1)}
              className="w-full py-4 bg-green-500 hover:bg-green-400 text-black rounded-xl font-bold text-base transition disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400"
            >
              {buying ? 'Processing...' : `▶ Buy Now & Continue (${story.credits || 1} credit${(story.credits || 1) > 1 ? 's' : ''})`}
            </button>
          )}

          <button
            onClick={handleExit}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium text-sm transition"
          >
            ← Exit Preview
          </button>
        </div>
      </main>
    </div>
  )
}

export default function PreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PreviewContent />
    </Suspense>
  )
}
