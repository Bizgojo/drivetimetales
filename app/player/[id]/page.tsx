'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAudioCache } from '@/hooks/useAudioCache'
import StickyHeaderFull from '@/components/StickyHeaderFull'

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

interface LibraryEntry {
  story_id: string
  progress: number
  completed: boolean
}

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user, refreshUser } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntry | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showButtons, setShowButtons] = useState(true)
  const [charged, setCharged] = useState(false)
  
  const { audioSrc, isCached, isDownloading, downloadProgress } = useAudioCache(story?.audio_url)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressSaveInterval = useRef<NodeJS.Timeout | null>(null)
  const chargeTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single()
        
        if (storyError) throw storyError
        setStory(storyData)

        if (user) {
          const { data: libData } = await supabase
            .from('user_library')
            .select('story_id, progress, completed')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()
          
          if (libData) {
            setLibraryEntry(libData)
            setShowButtons(false)
            setCharged(true)
          }
        }
      } catch (err) {
        console.error('Error loading story:', err)
        setError('Story not found')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [storyId, user])

  useEffect(() => {
    if (audioSrc && audioRef.current && story) {
      if (libraryEntry && libraryEntry.progress > 0) {
        audioRef.current.currentTime = libraryEntry.progress
        setCurrentTime(libraryEntry.progress)
      }
      audioRef.current.play().catch(console.error)
      setIsPlaying(true)
    }
  }, [audioSrc, story, libraryEntry])

  useEffect(() => {
    if (isPlaying && !charged && user && showButtons) {
      chargeTimeout.current = setTimeout(async () => {
        await chargeCredits()
      }, 180000)
    }
    return () => {
      if (chargeTimeout.current) clearTimeout(chargeTimeout.current)
    }
  }, [isPlaying, charged, user, showButtons])

  useEffect(() => {
    if (user && isPlaying && charged) {
      progressSaveInterval.current = setInterval(() => saveProgress(), 10000)
    }
    return () => {
      if (progressSaveInterval.current) clearInterval(progressSaveInterval.current)
    }
  }, [user, isPlaying, charged])

  const chargeCredits = async () => {
    if (!user || !story || charged) return
    const creditCost = story.credits || 1
    if (user.credits < creditCost && user.credits !== -1) {
      if (audioRef.current) audioRef.current.pause()
      setIsPlaying(false)
      alert('Not enough credits. Please purchase more credits.')
      router.push('/pricing')
      return
    }
    try {
      const newCredits = user.credits === -1 ? -1 : user.credits - creditCost
      await supabase.from('users').update({ credits: newCredits }).eq('id', user.id)
      await supabase.from('user_library').insert({ user_id: user.id, story_id: storyId, progress: Math.floor(currentTime), completed: false })
      await refreshUser()
      setCharged(true)
      setShowButtons(false)
    } catch (err) {
      console.error('Error charging credits:', err)
    }
  }

  const saveProgress = async () => {
    if (!user || !audioRef.current || !charged) return
    try {
      await supabase.from('user_library').update({ progress: Math.floor(audioRef.current.currentTime), last_played: new Date().toISOString() }).eq('user_id', user.id).eq('story_id', storyId)
    } catch (err) { console.error('Error saving progress:', err) }
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); if (charged) saveProgress() }
    else { audioRef.current.play(); setIsPlaying(true) }
  }

  const handleTimeUpdate = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime) }
  const handleLoadedMetadata = () => { if (audioRef.current) setDuration(audioRef.current.duration) }

  const handleEnded = async () => {
    setIsPlaying(false)
    if (user && charged) {
      try { await supabase.from('user_library').update({ progress: Math.floor(duration), completed: true, last_played: new Date().toISOString() }).eq('user_id', user.id).eq('story_id', storyId) }
      catch (err) { console.error('Error marking complete:', err) }
    }
  }

  const handleReserve = async () => {
    if (!user) { router.push('/signin'); return }
    try {
      await supabase.from('user_preferences').upsert({ user_id: user.id, story_id: storyId, wishlisted: true, not_for_me: false })
      if (audioRef.current) audioRef.current.pause()
      router.push('/wishlist?toast=reserved')
    } catch (err) { console.error('Error reserving:', err) }
  }

  const handleNotForMe = async () => {
    if (!user) { router.push('/signin'); return }
    try {
      await supabase.from('user_preferences').upsert({ user_id: user.id, story_id: storyId, wishlisted: false, not_for_me: true })
      if (audioRef.current) audioRef.current.pause()
      router.push('/library')
    } catch (err) { console.error('Error:', err) }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const truncateDescription = (text: string, wordLimit: number = 30) => {
    const words = text?.split(' ') || []
    if (words.length <= wordLimit) return text
    return words.slice(0, wordLimit).join(' ') + '...'
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const creditCost = story?.credits || 1

  if (loading) return (
    <div className="h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !story) return (
    <div className="h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-xl text-white mb-4">Story not found</h1>
        <button onClick={() => router.push('/library')} className="text-orange-400">← Back to Library</button>
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      <audio ref={audioRef} src={audioSrc || undefined} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} preload="auto" />
      <StickyHeaderFull />
      <main className="flex-1 px-4 py-3 flex flex-col" style={{ maxHeight: 'calc(100vh - 60px)' }}>
        <div className="flex-1 min-h-0 mb-2">
          <div className="w-full h-full max-h-[45vh] mx-auto aspect-square rounded-xl overflow-hidden bg-slate-800 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
            {story.cover_url ? (
              <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
                <span className="text-6xl opacity-50">🎧</span>
              </div>
            )}
          </div>
        </div>
        <h1 className="text-lg font-bold text-center mb-1 line-clamp-1">{story.title}</h1>
        <p className="text-slate-400 text-xs text-center mb-2">
          {story.genre} • {story.author || 'Unknown'} • {story.duration_mins} min • {charged ? '✓ Owned' : `${creditCost} credit${creditCost > 1 ? 's' : ''}`}
        </p>
        <p className="text-slate-300 text-xs text-center mb-3 line-clamp-2">{truncateDescription(story.description)}</p>
        <div className="mb-3">
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{isCached ? '📥' : isDownloading ? `⬇️ ${downloadProgress}%` : '📡'}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <button onClick={handlePlayPause} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold text-lg mb-3 transition flex items-center justify-center gap-2">
          {isPlaying ? <>❚❚ Pause</> : <>▶ {libraryEntry && libraryEntry.progress > 0 ? 'Continue' : 'Play'}</>}
        </button>
        <div className="h-12" style={{ visibility: showButtons ? 'visible' : 'hidden' }}>
          <div className="flex gap-3">
            <button onClick={handleReserve} className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-semibold text-sm transition">📖 Reserve for Later</button>
            <button onClick={handleNotForMe} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition">👎 Not For Me</button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-slate-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <PlayerContent />
    </Suspense>
  )
}
