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

  // Handle story click
  const handleStoryClick = (story: Story) => {
    if (story.credits <= 2 && freeCredits > 0) {
      // Free story - they can play it
      router.push(`/story/${story.id}`)
    } else {
      // Need subscription
      router.push('/pricing')
    }
  }

  // Logo component with cartoon truck and car
  const Logo = () => (
    <div className="flex items-center gap-3">
      <svg width="80" height="48" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Car (front) */}
        <g>
          {/* Car body */}
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          {/* Car top */}
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          {/* Car windows */}
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          {/* Wheels */}
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          {/* Headlight */}
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        
        {/* Truck (back) */}
        <g>
          {/* Truck cab */}
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          {/* Truck cab top */}
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          {/* Truck window */}
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          {/* Truck cargo */}
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          {/* Cargo lines */}
          <line x1="26" y1="18" x2="26" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          <line x1="32" y1="18" x2="32" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          <line x1="38" y1="18" x2="38" y2="38" stroke="#3b82f6" strokeWidth="1"/>
          {/* Wheels */}
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
        
        {/* Motion lines */}
        <line x1="0" y1="30" x2="0" y2="30" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div className="flex items-baseline">
        <span className="text-2xl sm:text-3xl font-bold text-white">Drive Time </span>
        <span className="text-2xl sm:text-3xl font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-20">
      
      {/* Out of Credits Notice */}
      {showOutOfCredits && (
        <div className="bg-gradient-to-r from-red-600/20 via-red-500/10 to-red-600/20 border-b border-red-500/20">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-red-400">⚠️</span>
              <p className="text-red-300 font-medium">
                You're out of free credits!
              </p>
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

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-8 sm:pt-16 sm:pb-12">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <Logo />
          </div>

          {/* Hero Content */}
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Start Listening to Your Free Story Now
            </h1>
            <p className="text-xl sm:text-2xl text-slate-300 mb-2">
              No Sign Up Required
            </p>
            {freeCredits > 0 && (
              <p className="text-lg text-green-400 font-medium">
                🎁 You have {freeCredits} free credit{freeCredits !== 1 ? 's' : ''}!
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Story Library */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Choose Your Story
          </h2>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-slate-800 rounded-xl mb-3" />
                  <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : stories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {stories.map((story) => {
                const isFreeStory = story.credits <= 2
                const canPlay = isFreeStory && freeCredits > 0
                
                return (
                  <div 
                    key={story.id} 
                    className="group cursor-pointer" 
                    onClick={() => handleStoryClick(story)}
                  >
                    <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-slate-800">
                      {story.cover_url ? (
                        <img 
                          src={story.cover_url} 
                          alt={story.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                          <span className="text-5xl opacity-50">🎧</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      
                      {/* Free Story or Subscribe Flag */}
                      <div className={`absolute top-2 left-2 px-3 py-1 text-xs font-bold rounded ${
                        isFreeStory 
                          ? 'bg-green-500 text-black' 
                          : 'bg-yellow-500 text-black'
                      }`}>
                        {isFreeStory ? 'Free Story' : 'Subscribe'}
                      </div>
                      
                      {/* Duration badge */}
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                        {story.duration_mins} min
                      </div>

                      {/* Play overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                          canPlay ? 'bg-green-500' : 'bg-orange-500'
                        }`}>
                          {canPlay ? (
                            <div className="w-0 h-0 border-l-[16px] border-l-white border-y-[10px] border-y-transparent ml-1" />
                          ) : (
                            <span className="text-white text-lg">🔒</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors line-clamp-2">
                      {story.title}
                    </h3>
                    <p className="text-sm text-slate-400">{story.author}</p>
                    <p className="text-xs text-slate-500">{story.genre} • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              <p>No stories available</p>
            </div>
          )}
        </div>
      </section>

      {/* Sticky Footer - Subscribe Link */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-orange-400">🪙</span>
            <span className="text-slate-300 text-sm sm:text-base">
              {freeCredits > 0 
                ? `${freeCredits} free credit${freeCredits !== 1 ? 's' : ''} remaining`
                : 'Out of credits'
              }
            </span>
          </div>
          <Link 
            href="/pricing"
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors text-sm sm:text-base"
          >
            Get Unlimited Access
          </Link>
        </div>
      </div>
    </div>
  )
}
