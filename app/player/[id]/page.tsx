'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getStories, Story } from '@/lib/supabase'

function PlayerContent() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInLibrary, setIsInLibrary] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<string | null>(null)
  const [freeCredits, setFreeCredits] = useState(0)
  const [screenHeight, setScreenHeight] = useState(700)

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
        const storedCredits = localStorage.getItem('dtt_free_credits')
        if (storedCredits) {
          setFreeCredits(parseInt(storedCredits))
        }

        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const libraryItem = library.find((item: any) => item.storyId === storyId)
          if (libraryItem) {
            setIsInLibrary(true)
            setLastPlayed(libraryItem.lastPlayed)
          }
        }

        // Fetch story from Supabase
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
    if (!isInLibrary) {
      const libraryData = localStorage.getItem('dtt_library')
      const library = libraryData ? JSON.parse(libraryData) : []
      library.push({
        storyId: storyId,
        lastPlayed: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        progress: 0
      })
      localStorage.setItem('dtt_library', JSON.stringify(library))
    }
    router.push(`/player/${storyId}/play`)
  }

  const handlePreview = () => {
    router.push(`/player/${storyId}/preview`)
  }

  // Dynamic cover size - smaller to fit everything
  const coverSize = Math.min(screenHeight * 0.28, 180)

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

  const canPlayFree = freeCredits > 0

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      <div className="px-4 flex-1 flex flex-col">
        
        {/* Back button */}
        <button 
          onClick={() => router.back()}
          className="px-3 py-1.5 bg-slate-800 rounded-lg self-start mt-3 mb-2"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

        {/* Cover - centered */}
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
              <span className="text-4xl">🎧</span>
            </div>
          )}
        </div>

        {/* Title + Info - compact */}
        <div className="text-center mt-2">
          <h1 className="font-bold text-white text-lg leading-tight">{story.title}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {story.author} • {story.genre} • {story.duration_mins} min • {story.credits || 1} credit
          </p>
        </div>

        {/* Description - always show, truncated */}
        {story.description && (
          <p className="text-slate-300 text-xs leading-relaxed text-center mt-2 line-clamp-3 px-2">
            {story.description}
          </p>
        )}

        {/* Spacer - pushes buttons to bottom */}
        <div className="flex-1 min-h-4" />

        {/* Buttons - always at bottom */}
        <div className="pb-6">
          {/* Preview + Wishlist */}
          <div className="flex gap-2 mb-3">
            <button 
              onClick={handlePreview}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 rounded-xl transition-colors"
            >
              <span className="text-black font-semibold text-sm">Preview</span>
            </button>
            <button className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors">
              <span className="text-white font-semibold text-sm">Save to Wishlist</span>
            </button>
          </div>

          {/* Play button */}
          {canPlayFree ? (
            <button 
              onClick={handlePlay}
              className="w-full py-3 bg-green-500 hover:bg-green-400 rounded-xl transition-colors"
            >
              <span className="text-black font-bold text-base">
                {isInLibrary ? 'Resume Story' : 'Play Free'}
              </span>
            </button>
          ) : (
            <Link 
              href="/pricing"
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl transition-colors block text-center"
            >
              <span className="text-black font-bold text-sm">Subscribe to Listen</span>
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
