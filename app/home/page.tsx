'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getStories, getUserProfile, getUserStories, Story, User, UserStory } from '@/lib/supabase'

interface UserStoryWithStory extends UserStory {
  story: Story
}

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [continueListening, setContinueListening] = useState<UserStoryWithStory | null>(null)
  const [newReleases, setNewReleases] = useState<Story[]>([])
  const [recommendations, setRecommendations] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  useEffect(() => {
    async function fetchData() {
      // Check auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/welcome')
        return
      }

      try {
        // Fetch user profile
        const userData = await getUserProfile(session.user.id)
        setUser(userData)
        
        // Show subscribe modal if credits = 0 and no active subscription
        if (userData.credits === 0 && userData.subscription_type === 'free') {
          setTimeout(() => setShowSubscribeModal(true), 2000)
        }

        // Fetch user's stories for continue listening
        const userStories = await getUserStories(session.user.id)
        if (userStories && userStories.length > 0) {
          // Find incomplete story with most recent play
          const incomplete = userStories.find((us: any) => !us.completed && us.progress_seconds > 0)
          if (incomplete) {
            setContinueListening(incomplete as UserStoryWithStory)
          }
        }

        // Fetch new releases
        const newStoriesData = await getStories({ limit: 4 })
        const newOnes = newStoriesData.filter(s => s.is_new)
        setNewReleases(newOnes.length > 0 ? newOnes.slice(0, 4) : newStoriesData.slice(0, 4))

        // Fetch recommendations
        const recsData = await getStories({ limit: 4 })
        setRecommendations(recsData)

      } catch (error) {
        console.error('Error fetching data:', error)
      }

      setLoading(false)
    }
    fetchData()
  }, [router])

  const formatProgress = (seconds: number, totalMins: number) => {
    const progressMins = Math.floor(seconds / 60)
    const remainingMins = totalMins - progressMins
    return `${remainingMins} min left`
  }

  const getProgressPercent = (seconds: number, totalMins: number) => {
    const totalSeconds = totalMins * 60
    return Math.min((seconds / totalSeconds) * 100, 100)
  }

  const hasSubscription = user?.subscription_type && user.subscription_type !== 'free'

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    )
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

            <div className="h-2 bg-gradient-to-r from-orange-500 to-orange-600" />

            <div className="p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center border border-orange-500/30">
                <span className="text-4xl">🎧</span>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-2">
                You're Out of Credits!
              </h3>
              <p className="text-slate-400 mb-6">
                Subscribe for unlimited listening or buy a credit pack to continue.
              </p>

              <div className="space-y-3 mb-6">
                <Link 
                  href="/pricing"
                  className="block w-full py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20"
                >
                  Subscribe — Unlimited Access
                </Link>
                <Link 
                  href="/pricing"
                  className="block w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl border border-slate-700 transition-all"
                >
                  Buy Credit Pack
                </Link>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
                <span>✓ Cancel anytime</span>
                <span>•</span>
                <span>✓ Credits never expire</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <span className="text-lg">🎧</span>
            </div>
            <span className="text-xl font-bold text-white hidden sm:block">Drive Time Tales</span>
          </Link>
          
          <nav className="flex items-center gap-4">
            <Link href="/library" className="text-slate-400 hover:text-white text-sm transition-colors">
              Library
            </Link>
            <Link href="/my-library" className="text-slate-400 hover:text-white text-sm transition-colors">
              My Library
            </Link>
            <Link href="/settings" className="text-slate-400 hover:text-white text-sm transition-colors">
              Settings
            </Link>
            
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              user?.credits === 0 
                ? 'bg-red-500/10 border-red-500/30' 
                : 'bg-slate-800/80 border-slate-700'
            }`}>
              <span className={user?.credits === 0 ? 'text-red-400' : 'text-orange-400'}>🪙</span>
              <span className={`text-sm font-medium ${user?.credits === 0 ? 'text-red-400' : 'text-white'}`}>
                {user?.credits || 0}
              </span>
              {user?.credits === 0 && (
                <Link href="/pricing" className="text-xs text-orange-400 hover:text-orange-300 ml-1">
                  Add
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Greeting */}
        <section className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            {getGreeting()}, {user?.display_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-slate-400">
            {user?.credits === 0 && !hasSubscription 
              ? 'Get credits or subscribe to continue listening'
              : 'What would you like to listen to today?'
            }
          </p>
        </section>

        {/* Zero Credits Alert */}
        {user?.credits === 0 && !hasSubscription && (
          <section className="mb-8">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600/20 via-orange-500/10 to-orange-600/20 border border-orange-500/30">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              
              <div className="relative p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🪙</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1">You're Out of Credits</h2>
                      <p className="text-slate-300 text-sm">
                        Subscribe for unlimited access or purchase credits to keep listening.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    <Link 
                      href="/pricing"
                      className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20 text-center whitespace-nowrap"
                    >
                      Subscribe Now
                    </Link>
                    <Link 
                      href="/pricing"
                      className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl border border-slate-600 transition-all text-center whitespace-nowrap"
                    >
                      Buy Credits
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Continue Listening */}
        {continueListening && continueListening.story && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-orange-400">▶</span> Continue Listening
            </h2>
            <Link 
              href={`/player/${continueListening.story.id}`}
              className="block group"
            >
              <div className="relative bg-gradient-to-r from-slate-800/80 to-slate-800/40 rounded-2xl overflow-hidden border border-slate-700/50 hover:border-orange-500/30 transition-all">
                <div className="flex flex-col sm:flex-row">
                  <div className="relative w-full sm:w-48 aspect-video sm:aspect-square flex-shrink-0">
                    {continueListening.story.cover_url ? (
                      <img 
                        src={continueListening.story.cover_url}
                        alt={continueListening.story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600/30 to-slate-800 flex items-center justify-center">
                        <span className="text-5xl opacity-50">🎧</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                      <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/50 group-hover:scale-110 transition-transform">
                        <div className="w-0 h-0 border-l-[16px] border-l-white border-y-[10px] border-y-transparent ml-1" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 p-5 sm:p-6">
                    <span className="inline-block px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded mb-2">
                      {continueListening.story.genre}
                    </span>
                    <h3 className="text-xl font-semibold text-white mb-1 group-hover:text-orange-400 transition-colors">
                      {continueListening.story.title}
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">{continueListening.story.author}</p>
                    
                    <div className="space-y-2">
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                          style={{ width: `${getProgressPercent(continueListening.progress_seconds, continueListening.story.duration_mins)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatProgress(continueListening.progress_seconds, continueListening.story.duration_mins)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* New Releases */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-green-400">✨</span> New Releases
            </h2>
            <Link href="/library" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
              View all →
            </Link>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {newReleases.map((story) => (
              <Link 
                key={story.id}
                href={`/story/${story.id}`}
                className="group"
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
                      <span className="text-4xl opacity-50">🎧</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  
                  {story.is_new && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500 text-black text-xs font-semibold rounded">
                      NEW
                    </div>
                  )}
                  
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                    {story.duration_mins} min
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 transition-colors line-clamp-1">
                  {story.title}
                </h3>
                <p className="text-xs text-slate-400">{story.genre}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Recommendations */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-purple-400">💜</span> Recommended For You
            </h2>
            <Link href="/library" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
              Browse all →
            </Link>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {recommendations.map((story) => (
              <Link 
                key={story.id}
                href={`/story/${story.id}`}
                className="group"
              >
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-slate-800">
                  {story.cover_url ? (
                    <img 
                      src={story.cover_url}
                      alt={story.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-slate-800 flex items-center justify-center">
                      <span className="text-4xl opacity-50">🎧</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-slate-900/80 text-white text-xs rounded">
                    {story.genre}
                  </div>
                  
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                    {story.duration_mins} min
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-white text-sm group-hover:text-orange-400 transition-colors line-clamp-1">
                  {story.title}
                </h3>
                <p className="text-xs text-slate-400">{story.author}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <Link 
              href="/library"
              className="p-5 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 hover:border-orange-500/30 transition-all group"
            >
              <span className="text-2xl mb-2 block">📚</span>
              <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">Browse Library</h3>
              <p className="text-sm text-slate-400">Explore all stories</p>
            </Link>
            
            <Link 
              href="/my-library"
              className="p-5 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 hover:border-orange-500/30 transition-all group"
            >
              <span className="text-2xl mb-2 block">❤️</span>
              <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">My Library</h3>
              <p className="text-sm text-slate-400">Your purchased stories</p>
            </Link>
            
            <Link 
              href="/pricing"
              className={`p-5 rounded-xl border transition-all group ${
                user?.credits === 0 
                  ? 'bg-gradient-to-br from-orange-500/20 to-slate-800/50 border-orange-500/30' 
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-orange-500/30'
              }`}
            >
              <span className="text-2xl mb-2 block">🪙</span>
              <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">
                {user?.credits === 0 ? 'Get Credits Now' : 'Get Credits'}
              </h3>
              <p className="text-sm text-slate-400">
                {user?.credits === 0 ? 'Subscribe or buy credits' : 'Buy more or subscribe'}
              </p>
            </Link>
          </div>
        </section>

        {/* Low credits warning (1-2 credits) */}
        {user && user.credits > 0 && user.credits <= 2 && !hasSubscription && (
          <section className="mb-8">
            <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🪙</span>
                  <div>
                    <h3 className="font-semibold text-white">Running low on credits</h3>
                    <p className="text-sm text-slate-400">You have {user.credits} credit{user.credits !== 1 ? 's' : ''} remaining.</p>
                  </div>
                </div>
                <Link 
                  href="/pricing"
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg transition-colors"
                >
                  Get More
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-800 mt-auto">
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
