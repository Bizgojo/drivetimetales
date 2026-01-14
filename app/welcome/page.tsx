'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface SponsorData {
  sponsor_name: string
  sponsor_message: string
  sponsor_tagline: string
}

// News categories with colors - same as home page
const NEWS_CATEGORIES = [
  { id: 'state', name: 'Your State News', icon: '🏛️', color: 'from-red-500 to-red-700', borderColor: 'border-red-400', subscriberOnly: true },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700', borderColor: 'border-orange-400', subscriberOnly: false },
  { id: 'international', name: 'International', icon: '🌍', color: 'from-yellow-500 to-yellow-700', borderColor: 'border-yellow-400', subscriberOnly: false },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-500 to-green-700', borderColor: 'border-green-400', subscriberOnly: false },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-500 to-blue-700', borderColor: 'border-blue-400', subscriberOnly: false },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-500 to-purple-700', borderColor: 'border-purple-400', subscriberOnly: false },
]

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(0)
  
  // Sponsor banner from QR code
  const [sponsorData, setSponsorData] = useState<SponsorData | null>(null)
  
  // News briefing state
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [briefingProgress, setBriefingProgress] = useState<Record<string, number>>({})
  const [preGeneratedAudio, setPreGeneratedAudio] = useState<Record<string, string>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})
  
  // Subscribers only audio
  const [subscribersOnlyAudioUrl, setSubscribersOnlyAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    loadStories()
    loadPreGeneratedAudio()
    loadFreeCredits()
    checkForSponsor()
    checkAuthAndRedirect()
  }, [])

  // Cleanup audio on unmount
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
    // Load pre-generated news briefing audio URLs from Supabase
    try {
      const { data: episodes } = await supabase
        .from('news_episodes')
        .select('category, audio_url')
        .eq('is_live', true)
      
      if (episodes) {
        const audioMap: Record<string, string> = {}
        episodes.forEach(ep => {
          if (ep.audio_url) {
            audioMap[ep.category] = ep.audio_url
          }
        })
        setPreGeneratedAudio(audioMap)
        
        // Initialize all as 'new'
        const statusMap: Record<string, BriefingStatus> = {}
        NEWS_CATEGORIES.forEach(cat => {
          statusMap[cat.id] = 'new'
        })
        setBriefingStatus(statusMap)
      }
      
      // Load subscribers-only audio URL
      const { data: systemAudio } = await supabase
        .storage
        .from('system-audio')
        .getPublicUrl('subscribers-only-state.mp3')
      
      if (systemAudio?.publicUrl) {
        setSubscribersOnlyAudioUrl(systemAudio.publicUrl)
      }
    } catch (error) {
      console.error('[Welcome] Error loading pre-generated audio:', error)
    }
  }

  function loadFreeCredits() {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits === null) {
      localStorage.setItem('dtt_free_credits', '2')
      localStorage.setItem('dtt_credits_used', 'false')
      setFreeCredits(2)
    } else {
      setFreeCredits(parseInt(storedCredits))
    }
  }

  async function checkForSponsor() {
    const qrCode = searchParams.get('qr') || searchParams.get('source')
    if (qrCode) {
      try {
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
      } catch (err) {
        console.log('[Welcome] QR lookup failed:', err)
      }
    }
  }

  async function checkAuthAndRedirect() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/home')
      }
    } catch (err) {
      console.log('[Welcome] Auth check skipped:', err)
    }
  }

  function playSubscribersOnlyMessage() {
    // Play the "subscribers only" message for State News
    if (subscribersOnlyAudioUrl) {
      const audio = new Audio(subscribersOnlyAudioUrl)
      audio.play()
    } else {
      // Fallback: generate on the fly if pre-generated doesn't exist
      fetch('/api/news/subscribers-only-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: 'EXAVITQu4vr4xnSDxMaL' })
      })
        .then(res => res.blob())
        .then(blob => {
          const audioUrl = URL.createObjectURL(blob)
          const audio = new Audio(audioUrl)
          audio.play()
        })
        .catch(err => console.error('[Welcome] Error playing subscribers only message:', err))
    }
  }

  function handleBriefingClick(categoryId: string) {
    const category = NEWS_CATEGORIES.find(c => c.id === categoryId)
    
    // State News is subscribers only
    if (category?.subscriberOnly) {
      playSubscribersOnlyMessage()
      return
    }

    const audioUrl = preGeneratedAudio[categoryId]
    if (!audioUrl) {
      console.log('[Welcome] No audio available for', categoryId)
      return
    }

    const currentStatus = briefingStatus[categoryId] || 'new'

    // Get or create audio element
    if (!audioRefs.current[categoryId]) {
      const audio = new Audio(audioUrl)
      
      audio.onended = () => {
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'played' }))
      }
      
      audio.ontimeupdate = () => {
        const progress = (audio.currentTime / audio.duration) * 100
        setBriefingProgress(prev => ({ ...prev, [categoryId]: progress }))
      }
      
      audioRefs.current[categoryId] = audio
    }

    const audio = audioRefs.current[categoryId]

    switch (currentStatus) {
      case 'new':
      case 'played':
        // Start playing from beginning
        audio.currentTime = 0
        audio.play()
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
        // Pause other briefings
        Object.keys(audioRefs.current).forEach(key => {
          if (key !== categoryId && audioRefs.current[key]) {
            audioRefs.current[key].pause()
            if (briefingStatus[key] === 'playing') {
              setBriefingStatus(prev => ({ ...prev, [key]: 'paused' }))
            }
          }
        })
        break
      
      case 'playing':
        // Pause
        audio.pause()
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
        break
      
      case 'paused':
        // Resume
        audio.play()
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
        // Pause other briefings
        Object.keys(audioRefs.current).forEach(key => {
          if (key !== categoryId && audioRefs.current[key]) {
            audioRefs.current[key].pause()
            if (briefingStatus[key] === 'playing') {
              setBriefingStatus(prev => ({ ...prev, [key]: 'paused' }))
            }
          }
        })
        break
    }
  }

  function getStatusLabel(status: BriefingStatus): string {
    switch (status) {
      case 'new': return 'New'
      case 'playing': return 'Playing'
      case 'paused': return 'Paused'
      case 'played': return 'Played'
      default: return 'New'
    }
  }

  function getStatusColor(status: BriefingStatus): string {
    switch (status) {
      case 'new': return 'bg-orange-500'
      case 'playing': return 'bg-green-500 animate-pulse'
      case 'paused': return 'bg-yellow-500'
      case 'played': return 'bg-slate-500'
      default: return 'bg-orange-500'
    }
  }

  // Filter for free stories (1-2 credits)
  const freeStories = stories.filter(s => s.is_free || (s.credits && s.credits <= 2))
  
  // New releases - sorted by date, limited to 3
  const newReleases = [...stories]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3)
  
  // Recommended - only free stories (1-2 credits), sorted by rating
  const recommended = [...freeStories]
    .sort((a, b) => (b.average_rating || b.rating || 0) - (a.average_rating || a.rating || 0))
    .slice(0, 4)

  function formatDuration(story: Story) {
    if (story.duration_label) return story.duration_label
    const minutes = story.duration_mins
    if (!minutes) return ''
    if (minutes < 60) return `${minutes} min`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
  }

  function formatGenre(genre: string | null) {
    if (!genre || genre.includes('not set') || genre.includes('Tab')) {
      return 'Audio Drama'
    }
    return genre
  }

  function isFreeStory(story: Story): boolean {
    return story.is_free || (story.credits && story.credits <= 2)
  }

  function formatReleaseDate(dateStr: string) {
    const date = new Date(dateStr)
    return `Released ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  function renderStarRating(rating: number) {
    const fullStars = Math.floor(rating)
    const stars = []
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<span key={i} className="text-yellow-400">★</span>)
      } else {
        stars.push(<span key={i} className="text-slate-500">★</span>)
      }
    }
    return stars
  }

  // Logo component
  const Logo = () => (
    <div className="flex flex-col items-center">
      <p className="text-orange-400 italic mb-2">Welcome To</p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-4xl">🚛</span>
        <span className="text-4xl">🚗</span>
      </div>
      <div className="flex items-baseline">
        <span className="text-2xl font-bold text-white">Drive Time</span>
        <span className="text-2xl font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="pt-6 pb-4">
        <div className="max-w-4xl mx-auto px-4">
          <Logo />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 pb-40">
        
        {/* Start Listening Banner */}
        <section className="mb-6">
          <div className="bg-slate-800 rounded-2xl p-6 text-center border border-slate-700">
            <h1 className="text-2xl font-bold text-white mb-1">Start Listening</h1>
            <p className="text-xl font-bold text-orange-500 mb-2">To Your Free Story Now!</p>
            <p className="text-slate-400 text-sm">No Sign Up Required — Just Click & Listen</p>
          </div>
          
          {/* Free Credits Badge */}
          <div className="flex justify-center mt-3">
            <div className="flex items-center gap-2 text-orange-400">
              <span className="text-xl">🎁</span>
              <span>You have {freeCredits} free credits</span>
            </div>
          </div>
        </section>

        {/* Sponsor Banner (if applicable) */}
        {sponsorData && (
          <section className="mb-6">
            <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-xl p-4 border border-orange-500/30 text-center">
              <p className="text-orange-300 text-sm">{sponsorData.sponsor_message}</p>
              <p className="text-white font-bold text-lg">{sponsorData.sponsor_name}</p>
              <p className="text-orange-300 text-xs">{sponsorData.sponsor_tagline}</p>
            </div>
          </section>
        )}

        {/* News Briefings Section */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEWS BRIEFINGS</h2>
          <div className="grid grid-cols-3 gap-3">
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const hasAudio = !!preGeneratedAudio[cat.id] || cat.subscriberOnly
              
              return (
                <button
                  key={cat.id}
                  onClick={() => handleBriefingClick(cat.id)}
                  className={`relative bg-gradient-to-br ${cat.color} rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2 ${cat.borderColor} ${cat.subscriberOnly ? 'opacity-70' : ''}`}
                >
                  {/* Status Flag */}
                  <div className={`absolute -top-2 -right-2 ${getStatusColor(status)} text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg`}>
                    {getStatusLabel(status)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-bold text-sm text-white truncate">{cat.name}</span>
                  </div>
                  
                  {/* Progress bar (only show if playing or paused) */}
                  {(status === 'playing' || status === 'paused') && !cat.subscriberOnly && (
                    <div className="mt-2 h-1 bg-black/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white transition-all duration-300"
                        style={{ width: `${briefingProgress[cat.id] || 0}%` }}
                      />
                    </div>
                  )}
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
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : newReleases.length === 0 ? (
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {newReleases.map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div 
                    className="relative rounded-xl overflow-hidden"
                    style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)' }}
                  >
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url} 
                        alt={story.title}
                        className="w-full aspect-[3/4] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-slate-800 flex items-center justify-center text-4xl">📖</div>
                    )}
                    {/* FREE flag */}
                    {isFreeStory(story) && (
                      <div className="absolute top-2 right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">
                        FREE
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <h3 className="font-medium text-sm text-white line-clamp-1">{story.title}</h3>
                    <p className="text-slate-400 text-xs">{formatGenre(story.genre)}</p>
                    <p className="text-slate-400 text-xs">By {story.author || 'Drive Time Tales'}</p>
                    <p className="text-slate-400 text-xs">{formatDuration(story)}</p>
                    <p className="text-slate-500 text-xs">{formatReleaseDate(story.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recommended For You - FREE stories only */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : recommended.length === 0 ? (
            <p className="text-slate-400 text-sm">No free stories available yet.</p>
          ) : (
            <div className="space-y-3">
              {recommended.map((story) => (
                <Link
                  key={story.id}
                  href={`/story/${story.id}`}
                  className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition h-32"
                >
                  <div className="p-2 flex-shrink-0 w-28 relative">
                    <div 
                      className="rounded-lg overflow-hidden h-full w-full"
                      style={{ boxShadow: '0 0 12px rgba(255, 255, 255, 0.4), 0 0 24px rgba(255, 255, 255, 0.2)' }}
                    >
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-white text-sm line-clamp-1">{story.title}</h3>
                      <span className="bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded flex-shrink-0">FREE</span>
                    </div>
                    <p className="text-slate-400 text-xs mb-0.5">{formatGenre(story.genre)}</p>
                    <p className="text-slate-400 text-xs mb-0.5">By {story.author || 'Drive Time Tales'}</p>
                    <p className="text-slate-400 text-xs mb-1">{formatDuration(story)}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex text-xs">
                        {renderStarRating(story.average_rating || story.rating || 0)}
                      </div>
                      <span className="text-slate-400 text-xs">
                        {(story.average_rating || story.rating || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Sticky Bottom Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <Link 
            href="/library" 
            className="block w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-4 rounded-xl text-center transition"
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

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WelcomeContent />
    </Suspense>
  )
}
