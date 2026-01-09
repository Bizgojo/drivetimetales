'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getStories, Story } from '@/lib/supabase'
import { LiveNewsBanner } from '@/components/news'

export default function WelcomePage() {
  const router = useRouter()
  const [featuredStories, setFeaturedStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(0)
  const [hasUsedFreeCredits, setHasUsedFreeCredits] = useState(false)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)

  const genres = ['Mystery', 'Sci-Fi', 'Romance', 'Thriller', 'Fantasy', 'Drama', 'Horror', 'Comedy']

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
        setHasUsedFreeCredits(false)
      } else {
        const credits = parseInt(storedCredits)
        setFreeCredits(credits)
        setHasUsedFreeCredits(creditsUsed === 'true' && credits === 0)
        
        // If they've used all credits, show subscribe modal after a delay
        if (credits === 0 && creditsUsed === 'true') {
          setTimeout(() => setShowSubscribeModal(true), 1500)
        }
      }

      // Fetch featured stories using the helper function
      try {
        const stories = await getStories({ limit: 4 })
        setFeaturedStories(stories)
      } catch (error) {
        console.error('Error fetching stories:', error)
      }
      
      setLoading(false)
    }
    initialize()
  }, [router])

  // Handle story click for newcomers
  const handleStoryClick = (storyId: string) => {
    if (freeCredits > 0) {
      router.push(`/story/${storyId}`)
    } else {
      setShowSubscribeModal(true)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      
      {/* Subscribe Modal */}
      {showSubscribeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
            <button 
              onClick={() => setShowSubscribeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                <span className="text-3xl">🎧</span>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-2">
                Enjoyed Your Free Stories?
              </h3>
              <p className="text-slate-400 mb-6">
                You've used your 2 free credits. Subscribe or buy credits to keep listening!
              </p>

              <div className="space-y-3">
                <Link 
                  href="/auth/signup"
                  className="block w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all"
                >
                  Create Free Account
                </Link>
                <Link 
                  href="/pricing"
                  className="block w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl border border-slate-700 transition-all"
                >
                  View Subscription Plans
                </Link>
              </div>

              <p className="text-xs text-slate-500 mt-4">
                Get unlimited access starting at $9.99/month
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Free Credits Banner */}
      {freeCredits > 0 && (
        <div className="bg-gradient-to-r from-green-600/20 via-green-500/10 to-green-600/20 border-b border-green-500/20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
            <span className="text-green-400">🎁</span>
            <p className="text-sm text-green-300">
              <span className="font-semibold">Welcome!</span> You have <span className="font-bold text-white">{freeCredits} free credit{freeCredits !== 1 ? 's' : ''}</span> to start listening!
            </p>
          </div>
        </div>
      )}

      {/* No Credits Banner */}
      {hasUsedFreeCredits && freeCredits === 0 && (
        <div className="bg-gradient-to-r from-orange-600/20 via-orange-500/10 to-orange-600/20 border-b border-orange-500/20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <p className="text-sm text-orange-300">
              You've used your free credits!
            </p>
            <Link 
              href="/pricing"
              className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              Subscribe Now
            </Link>
          </div>
        </div>
      )}


      {/* Daily News Banner */}
      <LiveNewsBanner />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
                <span className="text-2xl">🎧</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Drive Time Tales
              </h1>
            </div>
          </div>

          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Turn Your Commute Into
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-500">
                Story Time
              </span>
            </h2>
            <p className="text-lg sm:text-xl text-slate-300 mb-10 leading-relaxed">
              Premium audio stories crafted for your drive. Mystery, romance, sci-fi, and more — 
              each tale perfectly timed for your journey.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
              {freeCredits > 0 ? (
                <Link 
                  href="/library"
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 text-center"
                >
                  🎧 Start Listening Free
                </Link>
              ) : (
                <Link 
                  href="/pricing"
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 text-center"
                >
                  🎧 Subscribe Now
                </Link>
              )}
              <Link 
                href="/auth/signin"
                className="w-full sm:w-auto px-8 py-4 bg-slate-800/80 hover:bg-slate-700 text-white font-medium rounded-xl transition-all border border-slate-700 hover:border-slate-600 text-center"
              >
                Sign In
              </Link>
            </div>

            {freeCredits > 0 ? (
              <p className="text-sm text-slate-500">
                No signup required • Start listening in seconds
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Already have an account? <Link href="/auth/signin" className="text-orange-400 hover:text-orange-300">Sign in</Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
            How It Works
          </h3>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: '📱', title: 'Pick a Story', desc: 'Browse our library of professionally narrated tales across every genre' },
              { icon: '🚗', title: 'Start Driving', desc: 'Hit play and enjoy crystal-clear audio optimized for your car speakers' },
              { icon: '🎧', title: 'Resume Anywhere', desc: 'Pause anytime and pick up right where you left off on your next trip' }
            ].map((step, i) => (
              <div key={i} className="text-center group">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-3xl group-hover:border-orange-500/50 transition-all">
                  {step.icon}
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">{step.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Stories */}
      <section className="py-16 px-4 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Popular Stories
            </h3>
            <p className="text-slate-400">
              {freeCredits > 0 
                ? `Pick a story and start listening — you have ${freeCredits} free credit${freeCredits !== 1 ? 's' : ''}!`
                : 'Subscribe to access our full library'
              }
            </p>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-slate-800 rounded-xl mb-3" />
                  <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : featuredStories.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredStories.map((story) => (
                <div 
                  key={story.id} 
                  className="group cursor-pointer" 
                  onClick={() => handleStoryClick(story.id)}
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-slate-800">
                    {story.cover_url ? (
                      <img 
                        src={story.cover_url} 
                        alt={story.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600/30 to-slate-800 flex items-center justify-center">
                        <span className="text-5xl opacity-50">🎧</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-block px-2 py-1 bg-orange-500/90 text-white text-xs font-medium rounded">
                        {story.genre}
                      </span>
                    </div>
                    
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                      <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
                        <div className="w-0 h-0 border-l-[16px] border-l-white border-y-[10px] border-y-transparent ml-1" />
                      </div>
                    </div>
                    
                    {/* Lock overlay if no credits */}
                    {freeCredits === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="text-center">
                          <span className="text-3xl">🔒</span>
                          <p className="text-white text-xs mt-1">Subscribe to listen</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <h4 className="font-semibold text-white group-hover:text-orange-400 transition-colors line-clamp-1">
                    {story.title}
                  </h4>
                  <p className="text-sm text-slate-400">{story.author} • {story.duration_mins} min</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              <p>No stories available</p>
            </div>
          )}

          <div className="text-center mt-10">
            <Link 
              href={freeCredits > 0 ? "/library" : "/pricing"}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-all border border-slate-700"
            >
              {freeCredits > 0 ? 'Browse All Stories' : 'View Subscription Plans'}
              <span className="text-orange-400">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Genres */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">
            Every Genre You Love
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {genres.map((genre) => (
              <span 
                key={genre}
                className="px-5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full border border-slate-700 hover:border-orange-500/50 transition-all cursor-pointer"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-16 px-4 bg-slate-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Simple, Flexible Plans
            </h3>
            <p className="text-slate-400">Choose the plan that fits your commute</p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
              <h4 className="font-semibold text-white mb-1">Free Trial</h4>
              <p className="text-3xl font-bold text-white mb-4">2 <span className="text-base font-normal text-slate-400">credits</span></p>
              <ul className="space-y-2 text-sm text-slate-400 mb-6">
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> No signup required</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Listen to 2 stories</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Full audio quality</li>
              </ul>
              {freeCredits > 0 ? (
                <div className="py-2 text-center text-green-400 text-sm font-medium">
                  ✓ You have {freeCredits} credit{freeCredits !== 1 ? 's' : ''}!
                </div>
              ) : (
                <div className="py-2 text-center text-slate-500 text-sm">Credits used</div>
              )}
            </div>

            <div className="p-6 bg-gradient-to-b from-orange-500/10 to-slate-800/50 rounded-2xl border border-orange-500/30 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-black text-xs font-semibold rounded-full">
                POPULAR
              </div>
              <h4 className="font-semibold text-white mb-1">Monthly</h4>
              <p className="text-3xl font-bold text-white mb-4">$9.99<span className="text-base font-normal text-slate-400">/mo</span></p>
              <ul className="space-y-2 text-sm text-slate-300 mb-6">
                <li className="flex items-center gap-2"><span className="text-orange-400">✓</span> Unlimited stories</li>
                <li className="flex items-center gap-2"><span className="text-orange-400">✓</span> New releases weekly</li>
                <li className="flex items-center gap-2"><span className="text-orange-400">✓</span> Cancel anytime</li>
              </ul>
              <Link 
                href="/pricing"
                className="block w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold rounded-lg text-center transition-colors"
              >
                Subscribe
              </Link>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
              <h4 className="font-semibold text-white mb-1">Credit Packs</h4>
              <p className="text-3xl font-bold text-white mb-4">$4.99<span className="text-base font-normal text-slate-400">+</span></p>
              <ul className="space-y-2 text-sm text-slate-400 mb-6">
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Buy credits as needed</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Credits never expire</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> No commitment</li>
              </ul>
              <Link 
                href="/pricing"
                className="block w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg text-center transition-colors"
              >
                Buy Credits
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {freeCredits > 0 ? 'Ready to Start Listening?' : 'Ready to Continue?'}
          </h3>
          <p className="text-slate-400 mb-8">
            {freeCredits > 0 
              ? 'Jump right in — no signup required for your first 2 stories.'
              : 'Subscribe now and get unlimited access to our entire library.'
            }
          </p>
          <Link 
            href={freeCredits > 0 ? "/library" : "/pricing"}
            className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:scale-105"
          >
            🎧 {freeCredits > 0 ? 'Browse Stories' : 'View Plans & Subscribe'}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎧</span>
            <span className="text-slate-400 text-sm">Drive Time Tales</span>
          </div>
          <div className="flex gap-6">
            <Link href="/about" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">About</Link>
            <Link href="/privacy" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Privacy</Link>
            <Link href="/terms" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Terms</Link>
          </div>
          <p className="text-slate-600 text-sm">© 2024 Drive Time Tales</p>
        </div>
      </footer>
    </div>
  )
}
