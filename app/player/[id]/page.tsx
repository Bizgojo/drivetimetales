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
  credit_cost: number
  preview_end_time?: number // Seconds where preview ends (at voice break)
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
  
  // Check if returning from preview
  const fromPreview = searchParams.get('fromPreview') === 'true'

  useEffect(() => {
    async function loadData() {
      try {
        // Load story
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('*')
          .eq('id', storyId)
          .single()
        
        if (storyError) throw storyError
        setStory(storyData)

        // Check if user owns this story
        if (user) {
          const { data: libData } = await supabase
            .from('user_library')
            .select('story_id, progress, last_played, completed')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()
          
          if (libData) setLibraryEntry(libData)

          // Check user preferences (wishlist/not for me)
          const { data: prefData } = await supabase
            .from('user_preferences')
            .select('story_id, wishlisted, not_for_me')
            .eq('user_id', user.id)
            .eq('story_id', storyId)
            .single()
          
          if (prefData) setUserPreference(prefData)

          // Check if preview was completed
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
      // Check if user already owns this story
      if (!libraryEntry) {
        // Deduct credits
        const creditCost = story.credit_cost || 1
        
        if (user.credits < creditCost && user.credits !== -1) {
          alert('Not enough credits. Please purchase more credits.')
          setActionLoading(false)
          return
        }

        // Update user credits
        const newCredits = user.credits === -1 ? -1 : user.credits - creditCost
        const { error: creditError } = await supabase
          .from('users')
          .update({ credits: newCredits })
          .eq('id', user.id)

        if (creditError) throw creditError

        // Add to library
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

      // Navigate to play page
      router.push(`/player/${storyId}/play?autoplay=true`)
    } catch (err) {
      console.error('Error starting playback:', err)
      alert('Failed to start playback. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResume = async () => {
    if (!user || !story) return
    
    setActionLoading(true)
    try {
      // Check if user already owns this story
      if (!libraryEntry) {
        // Deduct credits
        const creditCost = story.credit_cost || 1
        
        if (user.credits < creditCost && user.credits !== -1) {
          alert('Not enough credits. Please purchase more credits.')
          setActionLoading(false)
          return
        }

        // Update user credits
        const newCredits = user.credits === -1 ? -1 : user.credits - creditCost
        const { error: creditError } = await supabase
          .from('users')
          .update({ credits: newCredits })
          .eq('id', user.id)

        if (creditError) throw creditError

        // Add to library with preview position
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

      // Navigate to play page with resume flag
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
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          story_id: storyId,
          wishlisted: true,
          not_for_me: false
        })

      if (error) throw error
      
      // Clear preview status
      localStorage.removeItem(`preview_${storyId}`)
      
      // Navigate back to library with toast
      router.push('/library?toast=wishlisted')
    } catch (err) {
      console.error('Error adding to wishlist:', err)
      alert('Failed to add to wishlist. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleNotForMe = async () => {
    if (!user) return
    
    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          story_id: storyId,
          wishlisted: false,
          not_for_me: true
        })

      if (error) throw error
      
      // Clear preview status
      localStorage.removeItem(`preview_${storyId}`)
      
      // Navigate back to library with toast
      router.push('/library?toast=notforme')
    } catch (err) {
      console.error('Error marking not for me:', err)
      alert('Failed to update preference. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleContinue = () => {
    if (libraryEntry) {
      router.push(`/player/${storyId}/play?autoplay=true&resume=${libraryEntry.progress}`)
    }
  }

  const handleStartOver = () => {
    router.push(`/player/${storyId}/play?autoplay=true&resume=0`)
  }

  // Calculate preview duration (10% of story)
  const previewMins = story ? Math.ceil(story.duration_mins * 0.1) : 0

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
  const creditCost = story.credit_cost || 1
  const hasEnoughCredits = user && (user.credits >= creditCost || user.credits === -1)
  const ownsStory = !!libraryEntry
  const progressPercent = libraryEntry 
    ? Math.round((libraryEntry.progress / (story.duration_mins * 60)) * 100) 
    : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header with Logo */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <Link href="/library" className="text-slate-400 hover:text-white flex items-center gap-2">
          <span>←</span>
          <span className="text-sm">Back</span>
        </Link>
        
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-lg">🚛🚗</span>
          <span className="font-bold text-white">Drive Time<span className="text-orange-400">Tales</span></span>
        </Link>
        
        {user && (
          <Link href="/account" className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </Link>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 flex flex-col">
        {/* Cover Image */}
        <div className="w-full max-w-xs mx-auto aspect-square rounded-xl overflow-hidden bg-slate-800 mb-4 relative">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-600 to-orange-900">
              <span className="text-6xl opacity-50">🎧</span>
            </div>
          )}
          
          {/* Badges */}
          {ownsStory && (
            <div className="absolute top-2 right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">
              IN LIBRARY
            </div>
          )}
          {userPreference?.wishlisted && (
            <div className="absolute top-2 left-2 bg-pink-500 text-white text-xs font-bold px-2 py-1 rounded">
              ❤️ WISHLISTED
            </div>
          )}
        </div>

        {/* Story Info */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold mb-1">{story.title}</h1>
          <p className="text-orange-400 text-sm mb-1">{story.genre}</p>
          <p className="text-slate-400 text-sm">
            {story.duration_mins} min • {ownsStory ? 'Owned' : `${creditCost} credit${creditCost > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Progress Bar (if owned and has progress) */}
        {ownsStory && libraryEntry && libraryEntry.progress > 0 && (
          <div className="mb-4 px-4">
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-slate-500 text-xs text-center mt-1">{progressPercent}% complete</p>
          </div>
        )}

        {/* Description - Justified 25-30 words */}
        <p className="text-slate-300 text-sm leading-relaxed mb-6 px-2 text-justify">
          {story.description}
        </p>

        {/* Action Buttons - Different states */}
        <div className="mt-auto space-y-3">
          
          {/* STATE 1: User owns story - show Continue/Start Over */}
          {ownsStory && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={handleContinue}
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold transition disabled:opacity-50"
                >
                  {libraryEntry.progress > 0 ? '▶️ Continue' : '▶️ Play'}
                </button>
                {libraryEntry.progress > 0 && (
                  <button
                    onClick={handleStartOver}
                    disabled={actionLoading}
                    className="px-4 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition disabled:opacity-50"
                  >
                    ↺
                  </button>
                )}
              </div>
              <p className="text-slate-500 text-xs text-center">No additional credits needed</p>
            </>
          )}

          {/* STATE 2: Preview completed but not owned - show Wishlist/NotForMe/Resume */}
          {!ownsStory && previewCompleted && (
            <>
              <div className="flex gap-3 mb-3">
                <button
                  onClick={handleWishlist}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-medium transition disabled:opacity-50"
                >
                  ❤️ Save to Wishlist
                </button>
                <button
                  onClick={handleNotForMe}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition disabled:opacity-50"
                >
                  👎 Not For Me
                </button>
              </div>
              <button
                onClick={handleResume}
                disabled={actionLoading || !hasEnoughCredits}
                className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold transition disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400"
              >
                {actionLoading ? 'Processing...' : `▶️ Resume Story (${creditCost} credit${creditCost > 1 ? 's' : ''})`}
              </button>
              {!hasEnoughCredits && (
                <p className="text-red-400 text-xs text-center">Not enough credits</p>
              )}
            </>
          )}

          {/* STATE 3: New story - show Preview/Play Now */}
          {!ownsStory && !previewCompleted && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition"
                >
                  🎧 Preview ({previewMins} min)
                </button>
                <button
                  onClick={handlePlayNow}
                  disabled={actionLoading || !hasEnoughCredits}
                  className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold transition disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400"
                >
                  {actionLoading ? '...' : `▶️ Play (${creditCost} cr)`}
                </button>
              </div>
              {!user && (
                <p className="text-slate-500 text-xs text-center">
                  <Link href="/auth/login" className="text-orange-400 hover:underline">Sign in</Link> to purchase
                </p>
              )}
              {user && !hasEnoughCredits && (
                <p className="text-red-400 text-xs text-center">
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
