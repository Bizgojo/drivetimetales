'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  { id: 'state', name: 'Your State News', icon: '🏛️', color: 'from-red-500 to-red-700', borderColor: 'border-red-400' },
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
      const { data: settings } = await supabase
        .from('news_episodes')
        .select('*')
        .eq('is_live', true)
      
      if (settings) {
        const audioMap: Record<string, string> = {}
        NEWS_CATEGORIES.forEach(cat => {
          const audioUrl = settings[`${cat.id}_audio_url`]
          if (audioUrl) {
            audioMap[cat.id] = audioUrl
          }
        })
        setPreGeneratedAudio(audioMap)
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
    const category = NEWS_CATEGORIES.find(c => c.id === categoryId)
    
    if (false) {
      alert('State news is only available for subscribers. Subscribe to get access!')
      return
    }

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
    const labels = { new: 'New', playing: 'Playing', paused: 'Paused', played: 'Played' }
    return labels[status] || 'New'
  }

  function getStatusColor(status: BriefingStatus): string {
    const colors = { new: 'bg-orange-500', playing: 'bg-green-500 animate-pulse', paused: 'bg-yellow-500', played: 'bg-slate-500' }
    return colors[status] || 'bg-orange-500'
  }

  const freeStories = stories.filter(s => s.is_free || (s.credits && s.credits <= 2))
  const newReleases = [...stories].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3)
  const recommended = [...freeStories].sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)).slice(0, 4)

  function formatDuration(story: Story) {
    if (story.duration_label) return story.duration_label
    const mins = story.duration_mins
    if (!mins) return ''
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  function isFreeStory(story: Story): boolean {
    return story.is_free || (story.credits && story.credits <= 2)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="pt-6 pb-4">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-orange-400 italic mb-2">Welcome To</p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-4xl">🚛</span>
            <span className="text-4xl">🚗</span>
          </div>
          <div className="flex items-baseline justify-center">
            <span className="text-2xl font-bold text-white">Drive Time</span>
            <span className="text-2xl font-bold text-orange-500">Tales</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-40">
        <section className="mb-6">
          <div className="bg-slate-800 rounded-2xl p-6 text-center border border-slate-700">
            <h1 className="text-2xl font-bold text-white mb-1">Start Listening</h1>
            <p className="text-xl font-bold text-orange-500 mb-2">To Your Free Story Now!</p>
            <p className="text-slate-400 text-sm">No Sign Up Required — Just Click & Listen</p>
          </div>
          <div className="flex justify-center mt-3">
            <div className="flex items-center gap-2 text-orange-400">
              <span className="text-xl">🎁</span>
              <span>You have {freeCredits} free credits (News Briefings are Free)</span>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEWS BRIEFINGS</h2>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              return (
                <button
                  key={cat.id}
                  onClick={() => handleBriefingClick(cat.id)}
                  className={`relative bg-gradient-to-br ${cat.color} rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2 ${cat.borderColor} `}
                >
                  <div className={`absolute -top-2 -right-2 ${getStatusColor(status)} text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg`}>
                    {getStatusLabel(status)}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-bold text-xs text-white">{cat.name}</span>
                  </div>
                  {(status === 'playing' || status === 'paused')  && (
                    <div className="mt-2 h-1 bg-black/30 rounded-full overflow-hidden">
                      <div className="h-full bg-white transition-all" style={{ width: `${briefingProgress[cat.id] || 0}%` }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map(story => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255,255,255,0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-[3/4] object-cover" />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-slate-800 flex items-center justify-center text-4xl">📖</div>
                    )}
                    {isFreeStory(story) && (
                      <div className="absolute top-2 right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">FREE</div>
                    )}
                  </div>
                  <div className="mt-2">
                    <h3 className="font-medium text-sm text-white line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{formatDuration(story)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {recommended.map(story => (
                <Link key={story.id} href={`/story/${story.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-32">
                  <div className="p-2 flex-shrink-0 w-28">
                    <div className="rounded-lg overflow-hidden h-full w-full" style={{ boxShadow: '0 0 12px rgba(255,255,255,0.4)' }}>
                      {story.cover_url ? (
                        <img src={story.cover_url} alt={story.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-white text-sm line-clamp-1">{story.title}</h3>
                      <span className="bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded">FREE</span>
                    </div>
                    <p className="text-slate-400 text-xs">{formatDuration(story)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <Link href="/library" className="block w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition">
            Check Out Hundreds of Stories in Our Library
          </Link>
          <Link href="/pricing" className="block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl text-center transition">
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
