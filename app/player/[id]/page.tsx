'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
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
  preview_end_time?: number
}

interface LibraryEntry {
  story_id: string
  progress: number
  last_played: string
  completed: boolean
}

interface UserPreference {
  story_id: string
  wishlisted: boolean
  not_for_me: boolean
}

function PlayerContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const { user, refreshCredits } = useAuth()
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntry | null>(null)
  const [userPreference, setUserPreference] = useState<UserPreference | null>(null)
  const [previewCompleted, setPreviewCompleted] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  
  const fromPreview = searchParams.get('fromPreview') === 'true'

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
            .select('story_id, progress, last_played, completed')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()
          
          if (libData) setLibraryEntry(libData)

          const { data: prefData } = await supabase
            .from('user_preferences')
            .select('story_id, wishlisted, not_for_me')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()
          
          if (prefData) setUserPreference(prefData)

          const previewKey = `preview_${storyId}`
          const previewStatus = localStorage.getItem(previewKey)
          if (previewStatus === 'completed' || fromPreview) {
            setPreviewCompleted(true)
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
  }, [storyId, user, fromPreview])

  const handlePreview = () => {
    router.push(`/player/${storyId}/preview`)
  }

  const handlePlayNow = async () => {
    if (!user || !story) return
    
    setActionLoading(true)
    try {
      if (!libraryEntry) {
        const creditCost = story.credits || 1
        
        if (user.credits < creditCost && user.credits !== -1) {
          alert('Not enough credits. Please purchase more credits.')
          setActionLoading(false)
          return
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
            progress: 0,
            completed: false
          })

        if (libError) throw libError

        await refreshCredits()
      }

      router.push(`/player/${storyId}/play?autoplay=true`)
    } catch (err) {
      console.error('Error starting playback:', err)
      alert('Failed to start playback. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleContinue = () => {
    const resumeTime = libraryEntry?.progress || 0
    router.push(`/player/${storyId}/play?autoplay=true&resume=${resumeTime}`)
  }

  const handleStartOver = () => {
    router.push(`/player/${storyId}/play?autoplay=true`)
  }

  const handleResume = async () => {
    if (!user || !story) return
    
    setActionLoading(true)
    try {
      if (!libraryEntry) {
        const creditCost = story.credits || 1
        
        if (user.credits < creditCost && user.credits !== -1) {
          alert('Not enough credits. Please purchase more credits.')
          setActionLoading(false)
          return
        }

        const newCredits = user.credits === -1 ? -1 : user.credits - creditCost
        const { error: creditError } = await supabase
          .from('users')
          .update({ credits: newCredits })
          .eq('id', user.id)

        if (creditError) throw creditError

        const previewEnd = story.preview_end_time || Math.floor(story.duration_mins * 60 * 0.1)
        const { error: libError } = await supabase
          .from('user_library')
          .insert({
            user_id: user.id,
            story_id: storyId,
            progress: previewEnd,
            completed: false
          })

        if (libError) throw libError

        await refreshCredits()
      }

      const resumeTime = story.preview_end_time || Math.floor(story.duration_mins * 60 * 0.1)
      router.push(`/player/${storyId}/play?autoplay=true&resume=${resumeTime}`)
    } catch (err) {
      console.error('Error resuming:', err)
      alert('Failed to resume. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleWishlist = async () => {
    if (!user) return
    
    setActionLoading(true)
    try {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          story_id: storyId,
          wishlisted: true,
          not_for_me: false
        })
      
      router.push('/library?toast=wishlisted')
    } catch (err) {
      console.error('Error adding to wishlist:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleNotForMe = async () => {
    if (!user) return
    
    setActionLoading(true)
    try {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          story_id: storyId,
          wishlisted: false,
          not_for_me: true
        })
      
      router.push('/library?toast=notforme')
    } catch (err) {
      console.error('Error marking not for me:', err)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading story...</p>
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

  const displayName = user?.display_name || user?.email?.split('@')[0]
  const creditCost = story.credits || 1
  const hasEnoughCredits = user && (user.credits >= creditCost || user.credits === -1)
  const ownsStory = !!libraryEntry
  const progressPercent = libraryEntry 
    ? Math.round((libraryEntry.progress / (story.duration_mins * 60)) * 100) 
    : 0
  const previewMins = Math.ceil((story.preview_end_time || story.duration_mins * 60 * 0.1) / 60)

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <Link href="/library" className="text-white hover:text-orange-400 flex items-center gap-2 font-medium">
          <span className="text-lg">←</span>
          <span>Back</span>
        </Link>
        
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

      {/* Main Content - Everything under logo */}
      <main className="flex-1 px-4 pt-4 pb-6 flex flex-col">
        {/* Full Width Cover Image with Glow */}
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-800 mb-4 shadow-[0_0_30px_rgba(255,255,255,0.5)]">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
              <span className="text-8xl opacity-50">🎧</span>
            </div>
          )}
        </div>

        {/* Story Info */}
        <div className="text-center mb-3">
          <h1 className="text-xl font-bold mb-1">{story.title}</h1>
          
          {/* Genre and Flags on same line */}
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-orange-400 text-sm">{story.genre}</span>
            {ownsStory && (
              <span className="bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded">OWNED</span>
            )}
            {userPreference?.wishlisted && !ownsStory && (
              <span className="bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded">❤️ WISHLIST</span>
            )}
          </div>
          
          <p className="text-white text-sm">
            {story.duration_mins} min • {ownsStory ? 'In Library' : `${creditCost} credit${creditCost > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Progress Bar (if owned and has progress) */}
        {ownsStory && libraryEntry && libraryEntry.progress > 0 && (
          <div className="mb-3">
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-slate-400 text-xs text-center mt-1">{progressPercent}% complete</p>
          </div>
        )}

        {/* Description */}
        <p className="text-slate-300 text-sm leading-relaxed mb-4 text-center">
          {story.description}
        </p>

        {/* Action Buttons */}
        <div className="space-y-3 mt-auto">
          
          {/* STATE 1: User owns story */}
          {ownsStory && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={handleContinue}
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold text-lg transition disabled:opacity-50"
                >
                  {libraryEntry.progress > 0 ? '▶ Continue' : '▶ Play'}
                </button>
                {libraryEntry.progress > 0 && (
                  <button
                    onClick={handleStartOver}
                    disabled={actionLoading}
                    className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition disabled:opacity-50"
                  >
                    ↺ Start Over
                  </button>
                )}
              </div>
              <p className="text-slate-500 text-sm text-center">No additional credits needed</p>
            </>
          )}

          {/* STATE 2: Preview completed but not owned */}
          {!ownsStory && previewCompleted && (
            <>
              <div className="flex gap-3 mb-3">
                <button
                  onClick={handleWishlist}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-pink-500 hover:bg-pink-400 text-white rounded-xl font-semibold transition disabled:opacity-50"
                >
                  ❤️ Wishlist
                </button>
                <button
                  onClick={handleNotForMe}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
                >
                  👎 Pass
                </button>
              </div>
              <button
                onClick={handleResume}
                disabled={actionLoading || !hasEnoughCredits}
                className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold transition disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400 mb-2"
              >
                {actionLoading ? 'Processing...' : `▶ Resume (${creditCost} credit${creditCost > 1 ? 's' : ''})`}
              </button>
              <button
                onClick={handlePlayNow}
                disabled={actionLoading || !hasEnoughCredits}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition disabled:opacity-50"
              >
                ↺ Start from Beginning
              </button>
              {!hasEnoughCredits && (
                <p className="text-red-400 text-sm text-center mt-2">
                  Not enough credits. <Link href="/pricing" className="text-orange-400 hover:underline">Get more</Link>
                </p>
              )}
            </>
          )}

          {/* STATE 3: New story */}
          {!ownsStory && !previewCompleted && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  className="flex-1 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-base transition"
                >
                  🎧 Preview<br/>
                  <span className="text-sm font-normal opacity-80">{previewMins} min sample</span>
                </button>
                <button
                  onClick={handlePlayNow}
                  disabled={actionLoading || !hasEnoughCredits}
                  className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold text-base transition disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400"
                >
                  ▶ Play Now<br/>
                  <span className="text-sm font-normal opacity-80">{creditCost} credit{creditCost > 1 ? 's' : ''}</span>
                </button>
              </div>
              {!user && (
                <p className="text-slate-500 text-sm text-center">
                  <Link href="/signin" className="text-orange-400 hover:underline">Sign in</Link> to purchase
                </p>
              )}
              {user && !hasEnoughCredits && (
                <p className="text-red-400 text-sm text-center">
                  Not enough credits. <Link href="/pricing" className="text-orange-400 hover:underline">Get more</Link>
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PlayerContent />
    </Suspense>
  )
}
