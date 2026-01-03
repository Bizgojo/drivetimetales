'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Generate UUID for library entries
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function PlayerContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const { user, refreshCredits } = useAuth()
  
  const [story, setStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProgress, setHasProgress] = useState(false)
  const [savedProgress, setSavedProgress] = useState(0)
  const [freeCredits, setFreeCredits] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Sponsor banner from QR code
  const [sponsorData, setSponsorData] = useState<{
    sponsor_name: string
    sponsor_message: string
    sponsor_tagline: string
  } | null>(null)

  useEffect(() => {
    async function loadStory() {
      try {
        // Check for QR source sponsor
        const qrCode = searchParams.get('qr') || searchParams.get('source') || localStorage.getItem('dtt_qr_source')
        if (qrCode) {
          // Save QR source for future pages
          localStorage.setItem('dtt_qr_source', qrCode)
          
          const { data } = await supabase
            .from('qr_sources')
            .select('sponsor_name, sponsor_message, sponsor_tagline, is_sponsored')
            .eq('code', qrCode)
            .eq('is_active', true)
            .single()
          
          if (data && data.is_sponsored && data.sponsor_name) {
            setSponsorData({
              sponsor_name: data.sponsor_name,
              sponsor_message: data.sponsor_message || 'This Free Story brought to you courtesy of',
              sponsor_tagline: data.sponsor_tagline || 'We appreciate your business'
            })
          }
        }

        const storedCredits = localStorage.getItem('dtt_free_credits')
        if (storedCredits) {
          setFreeCredits(parseInt(storedCredits))
        } else {
          localStorage.setItem('dtt_free_credits', '2')
          setFreeCredits(2)
        }

        // Check library for progress
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const libraryItem = library.find((item: any) => item.storyId === storyId)
          if (libraryItem && libraryItem.progress > 0) {
            setHasProgress(true)
            setSavedProgress(libraryItem.progress)
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
  }, [storyId, searchParams])

  const handlePlay = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    
    try {
      const storyCredits = story?.credits || 1
      
      // For logged-in subscribers, deduct credits and add to library
      if (user) {
        // Check if already in user's library (already paid for)
        const { data: existingLibraryItem } = await supabase
          .from('user_library')
          .select('id')
          .eq('user_id', user.id)
          .eq('story_id', storyId)
          .single()
        
        if (!existingLibraryItem) {
          // Deduct credits (unless unlimited)
          if (user.credits !== -1) {
            const newCredits = Math.max(0, (user.credits || 0) - storyCredits)
            
            const { error: updateError } = await supabase
              .from('users')
              .update({ credits: newCredits })
              .eq('id', user.id)
            
            if (updateError) {
              console.error('Failed to deduct credits:', updateError)
              setIsProcessing(false)
              return
            }
            
            console.log(`Deducted ${storyCredits} credits. New balance: ${newCredits}`)
          }
          
          // Add to user's library in database
          const { error: libraryError } = await supabase
            .from('user_library')
            .insert({
              id: generateUUID(),
              user_id: user.id,
              story_id: storyId,
              progress: 0,
              last_played: new Date().toISOString(),
              completed: false
            })
          
          if (libraryError) {
            console.error('Failed to add to library:', libraryError)
          }
          
          // Refresh user credits in UI
          if (refreshCredits) await refreshCredits()
        }
      } else {
        // Non-logged-in user - use localStorage
        const libraryData = localStorage.getItem('dtt_library')
        const library = libraryData ? JSON.parse(libraryData) : []
        const existingIndex = library.findIndex((item: any) => item.storyId === storyId)
        
        if (existingIndex === -1) {
          // Deduct free credits
          const currentFreeCredits = parseInt(localStorage.getItem('dtt_free_credits') || '2')
          if (currentFreeCredits > 0) {
            localStorage.setItem('dtt_free_credits', String(currentFreeCredits - 1))
          }
          
          library.push({
            storyId: storyId,
            lastPlayed: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            progress: 0
          })
          localStorage.setItem('dtt_library', JSON.stringify(library))
        }
      }
      
      // Go to play page
      router.push(`/player/${storyId}/play?autoplay=true`)
    } catch (error) {
      console.error('Error starting playback:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleResume = () => {
    // Update last played date
    const libraryData = localStorage.getItem('dtt_library')
    if (libraryData) {
      const library = JSON.parse(libraryData)
      const existingIndex = library.findIndex((item: any) => item.storyId === storyId)
      if (existingIndex !== -1) {
        library[existingIndex].lastPlayed = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        localStorage.setItem('dtt_library', JSON.stringify(library))
      }
    }
    
    // Go to play page with autoplay and resume flags - FIXED SYNTAX
    router.push(`/player/${storyId}/play?autoplay=true&resume=true`)
  }

  const handlePreview = () => {
    // FIXED SYNTAX
    router.push(`/player/${storyId}/preview`)
  }

  const handleBack = () => {
    router.push('/welcome')
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
          <Link href="/welcome" className="text-orange-400">← Back to Stories</Link>
        </div>
      </div>
    )
  }

  const storyCredits = story.credits || 1
  
  // Check if user is a subscriber with credits
  const isSubscriber = user && (
    user.subscription_type === 'road_warrior' ||
    user.subscription_type === 'commuter' ||
    user.subscription_type === 'test_driver'
  )
  const hasEnoughCredits = user && (user.credits === -1 || user.credits >= storyCredits)
  const canPlayAsSubscriber = isSubscriber && hasEnoughCredits
  
  // For non-logged-in users, check localStorage free credits
  const canPlayFree = !user && storyCredits <= 2 && freeCredits > 0

  // Format saved progress for display
  const formatProgress = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      
      {/* Sponsor Banner - Shows when user comes from sponsored QR code */}
      {sponsorData && (
        <div className="sticky top-0 z-40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 px-4 py-2 text-center shadow-lg">
          <p className="text-white text-sm font-medium">
            {sponsorData.sponsor_message} <span className="font-bold">{sponsorData.sponsor_name}</span> — {sponsorData.sponsor_tagline}
          </p>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-4">
        
        {/* Logo + Back Button + User Avatar Row */}
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
            
            {/* User avatar or Sign In */}
            {user ? (
              <Link 
                href="/account"
                className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm"
              >
                {(user.display_name || user.email || 'U').charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link 
                href="/auth/login"
                className="px-3 py-1.5 bg-orange-500 rounded-lg"
              >
                <span className="text-black text-sm font-medium">Sign In</span>
              </Link>
            )}
          </div>
        </div>

        {/* Cover - large */}
        <div className="w-64 h-64 mx-auto rounded-xl overflow-hidden border-4 border-white">
          {story.cover_url ? (
            <img 
              src={story.cover_url} 
              alt={story.title} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
              <span className="text-4xl">🎧</span>
            </div>
          )}
        </div>

        {/* Title + Info */}
        <div className="text-center mt-4">
          <h1 className="font-bold text-white text-xl leading-tight">{story.title}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {story.author} • {story.genre} • {story.duration_mins} min • {storyCredits} credit{storyCredits !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Description */}
        {story.description && (
          <p className="text-slate-300 text-sm leading-relaxed text-center mt-3">
            {story.description}
          </p>
        )}

        {/* Progress indicator if resuming */}
        {hasProgress && (
          <div className="text-center mt-3">
            <p className="text-green-400 text-sm">
              📚 Resume from {formatProgress(savedProgress)}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6">
          {/* Preview + Wishlist */}
          <div className="flex gap-2 mb-3">
            <button 
              onClick={handlePreview}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 rounded-xl transition-colors"
            >
              <span className="text-black font-semibold">Preview</span>
            </button>
            <button className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors">
              <span className="text-white font-semibold">Save to Wishlist</span>
            </button>
          </div>

          {/* Play/Resume button */}
          {hasProgress ? (
            <button 
              onClick={handleResume}
              className="w-full py-4 bg-green-500 hover:bg-green-400 rounded-xl transition-colors"
            >
              <span className="text-black font-bold text-lg">Resume Story</span>
            </button>
          ) : canPlayAsSubscriber ? (
            <button 
              onClick={handlePlay}
              disabled={isProcessing}
              className={`w-full py-4 rounded-xl transition-colors ${
                isProcessing 
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-400'
              }`}
            >
              <span className="text-black font-bold text-lg">
                {isProcessing 
                  ? 'Processing...' 
                  : user?.credits === -1 
                    ? 'Play Now (Unlimited)' 
                    : `Play Now (${storyCredits} credit${storyCredits !== 1 ? 's' : ''})`
                }
              </span>
            </button>
          ) : canPlayFree ? (
            <button 
              onClick={handlePlay}
              disabled={isProcessing}
              className={`w-full py-4 rounded-xl transition-colors ${
                isProcessing 
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-400'
              }`}
            >
              <span className="text-black font-bold text-lg">
                {isProcessing ? 'Processing...' : 'Play Free'}
              </span>
            </button>
          ) : user ? (
            <Link 
              href="/pricing"
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 rounded-xl transition-colors block text-center"
            >
              <span className="text-black font-bold text-lg">Need More Credits</span>
            </Link>
          ) : (
            <Link 
              href="/pricing"
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 rounded-xl transition-colors block text-center"
            >
              <span className="text-black font-bold text-lg">Subscribe to Listen</span>
            </Link>
          )}
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

export default function PlayerPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PlayerContent />
    </Suspense>
  )
}
