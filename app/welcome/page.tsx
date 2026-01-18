'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WelcomeHeader from '@/components/WelcomeHeader'

interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  duration_label: string
  cover_url: string
  audio_url: string
  rating: number
  price: number
  price_cents: number
  credits: number
  is_free: boolean
  created_at: string
  average_rating: number
  author: string
  is_new: boolean
}

const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: 'from-red-500 to-red-700', borderColor: 'border-red-400' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700', borderColor: 'border-orange-400' },
  { id: 'international', name: 'International', icon: '🌍', color: 'from-yellow-500 to-yellow-700', borderColor: 'border-yellow-400' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-500 to-green-700', borderColor: 'border-green-400' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-500 to-blue-700', borderColor: 'border-blue-400' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-500 to-purple-700', borderColor: 'border-purple-400' },
]

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

function WelcomeContent() {
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits] = useState(2)
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [briefingProgress, setBriefingProgress] = useState<Record<string, number>>({})
  const [preGeneratedAudio, setPreGeneratedAudio] = useState<Record<string, string>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  useEffect(() => {
    loadStories()
    loadPreGeneratedAudio()
  }, [])

  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause()
        audio.src = ''
      })
    }
  }, [])

  async function loadStories() {
    try {
      const response = await fetch('/api/stories')
      if (response.ok) {
        const allStories = await response.json()
        setStories(allStories)
      }
    } catch (error) {
      console.error('[Welcome] Error fetching stories:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadPreGeneratedAudio() {
    try {
      // Load live episodes from news_episodes table
      const { data: episodes, error } = await supabase
        .from('news_episodes')
        .select('category, audio_url')
        .eq('is_live', true)

      if (error) {
        console.error('[Welcome] Error querying news_episodes:', error)
        return
      }

      if (episodes && episodes.length > 0) {
        const audioMap: Record<string, string> = {}
        episodes.forEach((ep: { category: string; audio_url: string | null }) => {
          if (ep.audio_url) {
            audioMap[ep.category] = ep.audio_url
          }
        })
        setPreGeneratedAudio(audioMap)
        console.log('[Welcome] Loaded audio for:', Object.keys(audioMap))
      }

      const statusMap: Record<string, BriefingStatus> = {}
      NEWS_CATEGORIES.forEach(cat => {
        statusMap[cat.id] = 'new'
      })
      setBriefingStatus(statusMap)
    } catch (error) {
      console.error('[Welcome] Error loading audio:', error)
    }
  }

  function handleBriefingClick(categoryId: string) {
    const audioUrl = preGeneratedAudio[categoryId]
    if (!audioUrl) {
      console.log('[Welcome] No audio available for', categoryId)
      alert('This briefing is not yet available. Please check back later!')
      return
    }

    const currentStatus = briefingStatus[categoryId] || 'new'

    if (!audioRefs.current[categoryId]) {
      const audio = new Audio(audioUrl)
      audio.onended = () => setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
      audio.ontimeupdate = () => {
        const progress = (audio.currentTime / audio.duration) * 100
        setBriefingProgress(prev => ({ ...prev, [categoryId]: progress }))
      }
      audioRefs.current[categoryId] = audio
    }

    const audio = audioRefs.current[categoryId]

    if (currentStatus === 'new' || currentStatus === 'played') {
      audio.currentTime = 0
      audio.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      Object.keys(audioRefs.current).forEach(key => {
        if (key !== categoryId) {
          audioRefs.current[key].pause()
          if (briefingStatus[key] === 'playing') {
            setBriefingStatus(prev => ({ ...prev, [key]: 'paused' }))
          }
        }
      })
    } else if (currentStatus === 'playing') {
      audio.pause()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
    } else if (currentStatus === 'paused') {
      audio.play()
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
    }
  }

  function getStatusLabel(status: BriefingStatus): string {
    switch (status) {
      case 'playing': return 'Playing'
      case 'paused': return 'Paused'
      case 'played': return 'Played'
      default: return 'New'
    }
  }

  function getStatusColor(status: BriefingStatus): string {
    switch (status) {
      case 'playing': return 'bg-green-500'
      case 'paused': return 'bg-yellow-500'
      case 'played': return 'bg-slate-500'
      default: return 'bg-orange-500'
    }
  }

  const freeStories = stories.filter(s => s.is_free || (s.credits && s.credits <= 2))
  const newReleases = [...stories]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3)

  function isFreeStory(story: Story) {
    return story.is_free || (story.credits && story.credits <= 2)
  }

  function formatDuration(story: Story) {
    if (story.duration_label) return story.duration_label
    const mins = story.duration_mins
    if (!mins) return ''
    if (mins < 60) return `${mins} min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`
  }

  function formatCredits(story: Story) {
    if (story.is_free) return 'FREE'
    const credits = story.credits || 0
    if (credits === 0) return 'FREE'
    return `${credits} credit${credits > 1 ? 's' : ''}`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2">
            <span className="text-2xl">🚗</span>
            <span className="text-lg font-bold">Drive Time <span className="text-orange-500">Tales</span></span>
          </Link>
          <Link href="/signin" className="text-orange-400 hover:text-orange-300 font-medium">
            Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-48">
        {/* Welcome Header */}
        <WelcomeHeader credits={freeCredits} />
        </div>

        {/* Daily News Briefings - 3x2 Grid */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📰</span>
            <h2 className="text-lg font-bold">DAILY NEWS BRIEFINGS</h2>
          </div>
          <p className="text-slate-400 text-sm mb-4">Top stories updated throughout the day</p>
          
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const progress = briefingProgress[cat.id] || 0
              
              return (
                <button
                  key={cat.id}
                  onClick={() => handleBriefingClick(cat.id)}
                  className={`relative bg-gradient-to-br ${cat.color} rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2 ${cat.borderColor}`}
                >
                  {/* Status Flag */}
                  <div className={`absolute -top-1 -right-1 ${getStatusColor(status)} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                    {getStatusLabel(status)}
                  </div>
                  
                  {/* Progress bar when playing/paused */}
                  {(status === 'playing' || status === 'paused') && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 rounded-b-xl overflow-hidden">
                      <div 
                        className="h-full bg-white/80 transition-all duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-white">{cat.name}</span>
                      {status === 'playing' && (
                        <span className="block text-[10px] text-white/80">▶ Now Playing</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* New Releases */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : newReleases.length === 0 ? (
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map(story => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-[3/4] object-cover" />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-slate-800 flex items-center justify-center text-4xl">📖</div>
                    )}
                    {isFreeStory(story) && (
                      <div className="absolute top-2 right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">
                        FREE
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <h3 className="font-medium text-sm text-white line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{story.genre || 'Audio Drama'}</p>
                    <p className="text-slate-400 text-xs">{formatDuration(story)} • {formatCredits(story)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recommended For You */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : freeStories.length === 0 ? (
            <p className="text-slate-400 text-sm">No recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {freeStories.slice(0, 4).map(story => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}`}
                  className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-24"
                >
                  <div className="p-2 flex-shrink-0 w-20">
                    <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255,255,255,0.3)' }}>
                      {story.cover_url ? (
                        <img src={story.cover_url} alt={story.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-slate-700 flex items-center justify-center text-xl">📖</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{story.genre || 'Audio Drama'}</p>
                    <p className="text-slate-400 text-xs">{formatDuration(story)} • {formatCredits(story)}</p>
                    {isFreeStory(story) && (
                      <span className="inline-block mt-1 bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded w-fit">
                        FREE
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <Link 
            href="/library" 
            className="block w-full bg-orange-500 hover:bg-orange-400 text-black font-bold py-3 px-4 rounded-xl text-center transition"
          >
            Check Out Hundreds of Stories in Our Library
          </Link>
          <Link 
            href="/pricing" 
            className="block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl text-center transition"
          >
            Subscribe Now and Get Two Months Free
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <WelcomeContent />
    </Suspense>
  )
}
