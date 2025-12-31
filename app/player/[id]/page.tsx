'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getStory, Story } from '@/lib/supabase'

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
  const [screenHeight, setScreenHeight] = useState(0)
  const [screenWidth, setScreenWidth] = useState(0)

  useEffect(() => {
    // Get screen dimensions
    const updateDimensions = () => {
      setScreenHeight(window.innerHeight)
      setScreenWidth(window.innerWidth)
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    async function loadStory() {
      try {
        // Check free credits from localStorage
        const storedCredits = localStorage.getItem('dtt_free_credits')
        if (storedCredits) {
          setFreeCredits(parseInt(storedCredits))
        }

        // Check if story is in user's library
        const libraryData = localStorage.getItem('dtt_library')
        if (libraryData) {
          const library = JSON.parse(libraryData)
          const libraryItem = library.find((item: any) => item.storyId === storyId)
          if (libraryItem) {
            setIsInLibrary(true)
            setLastPlayed(libraryItem.lastPlayed)
          }
        }

        // Fetch story details
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

  // Calculate cover size dynamically
  // Fixed elements: back button (~50px) + title/info (~70px) + buttons (~120px) + padding (~60px) = ~300px
  const availableForCover = Math.min(screenWidth - 32, screenHeight - 300)
  const coverSize = Math.max(120, Math.min(availableForCover, 320))

  const handlePlay = () => {
    // Add to library if not already there
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
    
    // Navigate to player screen
    router.push(`/player/${storyId}/play`)
  }

  const handlePreview = () => {
    router.push(`/player/${storyId}/preview`)
  }

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="40" height="24" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-sm font-bold text-white">Drive Time </span>
        <span className="text-sm font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white">Loading story...</p>
        </div>
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

  const canPlayFree = story.credits <= 2 && freeCredits > 0

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      <div className="px-4 h-full flex flex-col">
        
        {/* Back button */}
        <button 
          onClick={() => router.back()}
          className="px-3 py-1.5 bg-slate-800 rounded-lg self-start mt-3 mb-3"
        >
          <span className="text-orange-400 text-sm font-medium">← Back</span>
        </button>

        {/* Large centered cover */}
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

        {/* Title + Info */}
        <div className="text-center mt-3 mb-2">
          <h1 className="font-bold text-white text-lg leading-tight">{story.title}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {story.author} • {story.genre} • {story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Description - only show if enough space */}
        {screenHeight > 600 && story.description && (
          <p className="text-white text-xs leading-relaxed text-center px-2 line-clamp-2 mb-2">
            {story.description}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Buttons */}
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

          {/* Play button - varies based on user status */}
          {canPlayFree ? (
            <button 
              onClick={handlePlay}
              className="w-full py-3 bg-green-500 hover:bg-green-400 rounded-xl transition-colors"
            >
              <span className="text-black font-bold text-base">
                {isInLibrary ? 'Resume Story' : 'Play Free'}
              </span>
            </button>
          ) : freeCredits > 0 ? (
            <button 
              onClick={handlePlay}
              className="w-full py-3 bg-green-500 hover:bg-green-400 rounded-xl transition-colors"
            >
              <span className="text-black font-bold text-base">
                {isInLibrary ? 'Resume Story' : 'Play Story'}
              </span>
            </button>
          ) : (
            <Link 
              href="/pricing"
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl transition-colors block text-center"
            >
              <span className="text-black font-bold text-sm">Insufficient credits - Subscribe</span>
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
