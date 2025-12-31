'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getStories, Story } from '@/lib/supabase'

export default function WelcomePage() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(0)
  const [showOutOfCredits, setShowOutOfCredits] = useState(false)
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('All')

  const genres = ['All', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Comedy', 'Romance', 'Adventure', 'Trucker Stories', 'Thriller']

  useEffect(() => {
    async function initialize() {
      // Check if user is already logged in - redirect to home
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/home')
        return
      }

      // Check for existing free credits in localStorage
      const storedCredits = localStorage.getItem('dtt_free_credits')
      const creditsUsed = localStorage.getItem('dtt_credits_used')
      
      if (storedCredits === null) {
        // First time visitor - give 2 free credits
        localStorage.setItem('dtt_free_credits', '2')
        localStorage.setItem('dtt_credits_used', 'false')
        setFreeCredits(2)
      } else {
        const credits = parseInt(storedCredits)
        setFreeCredits(credits)
        
        // If they've used all credits, show out of credits notice
        if (credits === 0 && creditsUsed === 'true') {
          setShowOutOfCredits(true)
        }
      }

      // Fetch all stories for the library
      try {
        const allStories = await getStories({})
        setStories(allStories)
      } catch (error) {
        console.error('Error fetching stories:', error)
      }
      
      setLoading(false)
    }
    initialize()
  }, [router])

  // Filter stories
  const filtered = stories.filter((s) => {
    if (genre !== 'All' && s.genre !== genre) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.author.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Handle story click
  const handleStoryClick = (story: Story) => {
    if (story.credits <= 2 && freeCredits > 0) {
      router.push(`/story/${story.id}`)
    } else {
      router.push('/pricing')
    }
  }

  // Logo component with cartoon truck and car
  const Logo = () => (
    <div className="flex items-center gap-3">
      <svg width="80" height="48" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Car (front) */}
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
        {/* Truck (back) */}
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <line x1="26" y1="18" x2="26" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          <line x1="32" y1="18" x2="32" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          <line x1="38" y1="18" x2="38" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-2xl sm:text-3xl font-bold text-white">Drive Time </span>
        <span className="text-2xl sm:text-3xl font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      
      {/* Out of Credits Notice */}
      {showOutOfCredits && (
        <div className="bg-gradient-to-r from-red-600/20 via-red-500/10 to-red-600/20 border-b border-red-500/20">
          <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-red-400">⚠️</span>
              <p className="text-red-300 font-medium">You're out of free credits!</p>
            </div>
            <Link 
              href="/pricing"
              className="px-6 py-2 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors"
            >
              Subscribe Now
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header with Logo */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Start Listening to Your Free Story Now
          </h1>
          <p className="text-lg text-slate-400 mb-2">No Sign Up Required</p>
          {freeCredits > 0 && (
            <p className="text-green-400 font-medium">
              🎁 You have {freeCredits} free credit{freeCredits !== 1 ? 's' : ''}!
            </p>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
          />
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white cursor-pointer text-sm"
          >
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Results count */}
        <p className="text-slate-500 text-sm mb-4">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories List - Horizontal Cards */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-400">Loading stories...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">No Stories Found</h2>
            <p className="text-slate-400">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((story) => {
              const isFreeStory = story.credits <= 2
              const canPlay = isFreeStory && freeCredits > 0
              
              return (
                <div 
                  key={story.id} 
                  onClick={() => handleStoryClick(story)}
                  className="block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all cursor-pointer"
                >
                  {/* Horizontal Card Layout */}
                  <div className="flex">
                    {/* Cover - Left Half */}
                    <div className="w-1/2 aspect-square relative flex-shrink-0">
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                          <span className="text-4xl opacity-50">🎧</span>
                        </div>
                      )}
                      
                      {/* Free Story or Subscribe Flag */}
                      <div className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-bold rounded ${
                        isFreeStory 
                          ? 'bg-green-500 text-black' 
                          : 'bg-yellow-500 text-black'
                      }`}>
                        {isFreeStory ? 'Free Story' : 'Subscribe'}
                      </div>
                      
                      {/* Duration badge */}
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                        {story.duration_mins} min
                      </div>
                    </div>
                    
                    {/* Info - Right Half */}
                    <div className="w-1/2 p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-white text-sm line-clamp-2 mb-1">{story.title}</h3>
                        <p className="text-xs text-orange-400 mb-1">{story.genre}</p>
                        <p className="text-xs text-slate-400 mb-2">{story.author}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{story.duration_mins} min</span>
                          <span className="text-xs text-slate-600">•</span>
                          <span className="text-xs text-slate-500">{story.credits} {story.credits === 1 ? 'credit' : 'credits'}</span>
                        </div>
                      </div>
                      
                      {/* Play button */}
                      <div className={`mt-3 w-full py-2 text-sm font-semibold rounded-lg transition-all text-center ${
                        canPlay 
                          ? 'bg-green-500 hover:bg-green-400 text-black' 
                          : 'bg-orange-500 hover:bg-orange-400 text-black'
                      }`}>
                        {canPlay ? '▶ Play Free' : '🔒 Subscribe'}
                      </div>
                    </div>
                  </div>

                  {/* Description - Below the block */}
                  {story.description && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800">
                      <p className="text-slate-400 text-sm line-clamp-2">{story.description}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sticky Footer - Subscribe Link */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-orange-400">🪙</span>
            <span className="text-slate-300 text-sm">
              {freeCredits > 0 
                ? `${freeCredits} free credit${freeCredits !== 1 ? 's' : ''} remaining`
                : 'Out of credits'
              }
            </span>
          </div>
          <Link 
            href="/pricing"
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors text-sm"
          >
            Get Unlimited Access
          </Link>
        </div>
      </div>
    </div>
  )
}
