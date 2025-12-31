'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getStories, Story } from '@/lib/supabase'

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(0)
  const [genre, setGenre] = useState('All')
  
  // Promo banner from QR code
  const [showPromoBanner, setShowPromoBanner] = useState(false)
  const [promoBannerText, setPromoBannerText] = useState('')

  const genreOptions = [
    { name: 'All', icon: '📚' },
    { name: 'Mystery', icon: '🔍' },
    { name: 'Drama', icon: '🎭' },
    { name: 'Sci-Fi', icon: '🚀' },
    { name: 'Horror', icon: '👻' },
    { name: 'Comedy', icon: '😂' },
    { name: 'Romance', icon: '💕' },
    { name: 'Trucker Stories', icon: '🚛' },
    { name: 'Thriller', icon: '😱' },
  ]

  useEffect(() => {
    async function initialize() {
      // Check if user is already logged in - redirect to home
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/home')
        return
      }

      // Check for promo code in URL (from QR code)
      const promo = searchParams.get('promo')
      if (promo) {
        setShowPromoBanner(true)
        setPromoBannerText(decodeURIComponent(promo))
      }

      // Check for existing free credits in localStorage
      const storedCredits = localStorage.getItem('dtt_free_credits')
      const creditsUsed = localStorage.getItem('dtt_credits_used')
      
      if (storedCredits === null) {
        localStorage.setItem('dtt_free_credits', '2')
        localStorage.setItem('dtt_credits_used', 'false')
        setFreeCredits(2)
      } else {
        const credits = parseInt(storedCredits)
        setFreeCredits(credits)
      }

      // Fetch all stories
      try {
        const allStories = await getStories({})
        setStories(allStories)
      } catch (error) {
        console.error('Error fetching stories:', error)
      }
      
      setLoading(false)
    }
    initialize()
  }, [router, searchParams])

  // Filter stories by genre
  const filtered = stories.filter((s) => {
    if (genre !== 'All' && s.genre !== genre) return false
    return true
  })

  // Handle story click
  const handleStoryClick = (story: Story) => {
    if (story.credits <= 2 && freeCredits > 0) {
      router.push(`/player/${story.id}`)
    } else {
      router.push('/pricing')
    }
  }

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="50" height="30" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <span className="text-lg font-bold text-white">Drive Time </span>
        <span className="text-lg font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      
      {/* Promo Banner - sticky at top */}
      {showPromoBanner && promoBannerText && (
        <div className="sticky top-0 z-20 bg-gradient-to-r from-green-600 to-green-500 px-3 py-2">
          <p className="text-white text-xs text-center font-medium leading-tight">
            🎁 {promoBannerText}
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Welcome To Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-serif italic text-orange-400 mb-2">Welcome To</h1>
          <Logo />
        </div>

        {/* CTA Text - two lines */}
        <div className="text-center my-4">
          <h2 className="text-2xl font-bold text-white">Start Listening</h2>
          <h2 className="text-2xl font-bold text-white">To Your Free Story Now!</h2>
          <p className="text-white text-sm mt-2">No Sign Up Required</p>
          
          {/* Credits Display */}
          {freeCredits > 0 ? (
            <p className="text-green-400 font-semibold text-sm mt-1">
              🎁 You have {freeCredits} free credit{freeCredits !== 1 ? 's' : ''}
            </p>
          ) : (
            <div className="mt-2">
              <p className="text-red-400 font-semibold text-sm">
                You have 0 free credits
              </p>
              <Link 
                href="/pricing"
                className="inline-block mt-2 px-6 py-2 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors text-sm"
              >
                Subscribe Now & Get 17% Discount
              </Link>
            </div>
          )}
        </div>

        {/* Genre Icons */}
        <div className="mb-3">
          <div className="flex flex-wrap justify-center gap-1">
            {genreOptions.map((g) => (
              <button
                key={g.name}
                onClick={() => setGenre(g.name)}
                className={`flex flex-col items-center px-2 py-1 rounded-lg transition-all ${
                  genre === g.name 
                    ? 'bg-orange-500 text-black' 
                    : 'bg-slate-800 text-white'
                }`}
              >
                <span className="text-sm">{g.icon}</span>
                <span className="text-[9px] mt-0.5">{g.name === 'Trucker Stories' ? 'Trucker' : g.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-white text-xs mb-3">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white">Loading stories...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-white">Try selecting a different genre</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((story, index) => {
              const isFreeStory = story.credits <= 2
              
              return (
                <div 
                  key={story.id}
                  className={`rounded-xl overflow-hidden ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}
                >
                  <div className="flex">
                    {/* Cover - Larger */}
                    <div className="w-32 h-32 flex-shrink-0 relative">
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url}
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                          <span className="text-3xl opacity-50">🎧</span>
                        </div>
                      )}
                      {/* Duration badge */}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        {story.duration_mins} min
                      </div>
                    </div>
                    
                    {/* Spacer */}
                    <div className="w-3" />
                    
                    {/* Info */}
                    <div className="flex-1 py-3 pr-3 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-white text-sm leading-tight">{story.title}</h3>
                        <p className="text-white text-xs mt-1">{story.genre} • {story.credits} {story.credits === 1 ? 'credit' : 'credits'}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{story.author}</p>
                      </div>
                      
                      {/* Buttons row */}
                      <div className="flex items-center gap-2 mt-2">
                        {/* Free Story or Subscribe tag */}
                        {isFreeStory ? (
                          <button 
                            onClick={() => handleStoryClick(story)}
                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-green-500/20 text-green-400 border border-green-500/30"
                          >
                            Free Story
                          </button>
                        ) : (
                          <button 
                            onClick={() => router.push('/pricing')}
                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500/20 text-orange-400 border border-orange-500/30"
                          >
                            Subscribe
                          </button>
                        )}
                        
                        {/* Preview Story button - shorter */}
                        <button 
                          onClick={() => handleStoryClick(story)}
                          className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 rounded-lg transition-colors"
                        >
                          <span className="text-black text-xs font-semibold">Preview Story</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white">Loading...</p>
      </div>
    </div>
  )
}

// Main export with Suspense wrapper
export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WelcomeContent />
    </Suspense>
  )
}
