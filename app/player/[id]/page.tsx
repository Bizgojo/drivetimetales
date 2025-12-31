'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function PlayerContent() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  
  const [story, setStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProgress, setHasProgress] = useState(false)
  const [savedProgress, setSavedProgress] = useState(0)
  const [freeCredits, setFreeCredits] = useState(0)

  useEffect(() => {
    async function loadStory() {
      try {
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
  }, [storyId])

  const handlePlay = () => {
    // Add to library if not already there
    const libraryData = localStorage.getItem('dtt_library')
    const library = libraryData ? JSON.parse(libraryData) : []
    const existingIndex = library.findIndex((item: any) => item.storyId === storyId)
    
    if (existingIndex === -1) {
      library.push({
        storyId: storyId,
        lastPlayed: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        progress: 0
      })
      localStorage.setItem('dtt_library', JSON.stringify(library))
    }
    
    // Go to play page with autoplay flag
    router.push(`/player/${storyId}/play?autoplay=true`)
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
    
    // Go to play page with autoplay and resume flags
    router.push(`/player/${storyId}/play?autoplay=true&resume=true`)
  }

  const handlePreview = () => {
    router.push(`/player/${storyId}/preview`)
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
          <Link href="/library" className="text-orange-400">← Back to Library</Link>
        </div>
      </div>
    )
  }

  const storyCredits = story.credits || 1
  const canPlayFree = storyCredits <= 2 && freeCredits > 0

  // Format saved progress for display
  const formatProgress = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="px-4 py-3">
        
        {/* Back button */}
        <button 
          onClick={() => router.back()}
          className="px-3 py-1.5 bg-slate-800 rounded-lg mb-3"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

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
          <p className="text-slate-300 text-sm leading-relaxed text-center mt-3 px-2">
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
          ) : canPlayFree ? (
            <button 
              onClick={handlePlay}
              className="w-full py-4 bg-green-500 hover:bg-green-400 rounded-xl transition-colors"
            >
              <span className="text-black font-bold text-lg">Play Free</span>
            </button>
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
    <div className="h-screen bg-slate-950 flex items-center justify-center">
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
