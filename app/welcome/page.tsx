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
  const [genre, setGenre] = useState('All')

  const genreOptions = [
    { name: 'All', icon: '📚' },
    { name: 'Mystery', icon: '🔍' },
    { name: 'Drama', icon: '🎭' },
    { name: 'Sci-Fi', icon: '🚀' },
    { name: 'Horror', icon: '👻' },
    { name: 'Comedy', icon: '😂' },
    { name: 'Romance', icon: '💕' },
    { name: 'Adventure', icon: '⚔️' },
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
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        
        {/* Welcome Header in Script */}
        <div className="text-center mb-4">
          <h1 className="text-4xl sm:text-5xl font-serif italic text-orange-400 mb-4">Welcome</h1>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Start Listening to Your Free Story Now
          </h2>
          <p className="text-lg text-white mb-3">No Sign Up Required</p>
          
          {/* Credits Display */}
          {freeCredits > 0 ? (
            <p className="text-green-400 font-semibold text-lg">
              🎁 You have {freeCredits} free credit{freeCredits !== 1 ? 's' : ''}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-red-400 font-semibold text-lg">
                You have 0 free credits
              </p>
              <Link 
                href="/pricing"
                className="inline-block px-6 py-2 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors"
              >
                Subscribe Now & Get 17% Discount
              </Link>
            </div>
          )}
        </div>

        {/* Genre Icons */}
        <div className="mb-6">
          <div className="flex flex-wrap justify-center gap-2">
            {genreOptions.map((g) => (
              <button
                key={g.name}
                onClick={() => setGenre(g.name)}
                className={`flex flex-col items-center px-3 py-2 rounded-lg transition-all ${
                  genre === g.name 
                    ? 'bg-orange-500 text-black' 
                    : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
              >
                <span className="text-xl">{g.icon}</span>
                <span className="text-xs mt-1">{g.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-white text-sm mb-4">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

        {/* Stories List - Horizontal Cards */}
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
          <div className="space-y-4">
            {filtered.map((story) => {
              const isFreeStory = story.credits <= 2
              const canPlay = isFreeStory && freeCredits > 0
              
              return (
                <div 
                  key={story.id} 
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                >
                  {/* Horizontal Card Layout */}
                  <div className="flex">
                    {/* Cover - Left Half (no flags) */}
                    <div className="w-2/5 aspect-square relative flex-shrink-0">
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                          <span className="text-4xl opacity-50">🎧</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Info - Right Side */}
                    <div className="flex-1 p-4 flex flex-col">
                      {/* Title */}
                      <h3 className="font-bold text-white text-base mb-1 line-clamp-2">{story.title}</h3>
                      
                      {/* Genre + Credits */}
                      <p className="text-sm text-orange-400 mb-1">
                        {story.genre} • {story.credits} {story.credits === 1 ? 'Credit' : 'Credits'}
                      </p>
                      
                      {/* Author */}
                      <p className="text-sm text-white mb-2">{story.author}</p>
                      
                      {/* Description */}
                      <p className="text-sm text-white line-clamp-2 mb-3 flex-grow">
                        {story.description || 'An exciting audio story for your journey.'}
                      </p>
                      
                      {/* Play Free or Subscribe Button */}
                      <button
                        onClick={() => handleStoryClick(story)}
                        className={`w-full py-2 text-sm font-semibold rounded-lg transition-all ${
                          canPlay 
                            ? 'bg-green-500 hover:bg-green-400 text-black' 
                            : 'bg-orange-500 hover:bg-orange-400 text-black'
                        }`}
                      >
                        {canPlay ? '▶ Play Free' : 'Subscribe'}
                      </button>
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
