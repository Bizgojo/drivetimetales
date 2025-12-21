'use client'

import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'

// ============================================
// TYPES
// ============================================
type SubscriptionTier = 'test_driver' | 'commuter' | 'road_warrior'

interface User {
  isLoggedIn: boolean
  name: string
  email: string
  // New pricing model
  subscriptionTier: SubscriptionTier
  subscriptionInterval?: 'monthly' | 'annual'
  creditBalance: number // 1 credit = 15 min
  freeSecondsRemaining: number // 7200 = 2 hours
  ownedStories: string[] // Story IDs purchased individually
  wishlist: string[]
  storeCreditCents: number // For referral rewards
  // Legacy (for backward compatibility)
  plan?: string
  creditsRemaining?: number
}

interface PlayingStory {
  id: string
  title: string
  author: string
  duration: string
  durationMins: number
  color: string
  progress: number
  currentTime: number
}

interface ListeningHistory {
  [storyId: string]: {
    progress: number
    currentTime: number
    lastPlayed: number
  }
}

// Access result type
interface AccessResult {
  canPlay: boolean
  accessType: 'owned' | 'subscription' | 'credits' | 'free_tier' | 'none'
  message?: string
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null) => void
  // Access checking
  checkAccess: (storyDurationMins: number, storyId: string) => AccessResult
  // Usage functions
  useFreeSeconds: (seconds: number) => void
  useCredits: (credits: number) => void
  // Utility
  toggleWishlist: (storyId: string) => void
  logout: () => void
  // Audio player
  nowPlaying: PlayingStory | null
  setNowPlaying: (story: PlayingStory | null) => void
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
  listeningHistory: ListeningHistory
  updateProgress: (storyId: string, progress: number, currentTime: number) => void
  // Legacy compatibility
  freeMinutesRemaining: number
  useFreeMinutes: (mins: number) => void
}

// ============================================
// CONTEXT
// ============================================
const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  checkAccess: () => ({ canPlay: false, accessType: 'none' }),
  useFreeSeconds: () => {},
  useCredits: () => {},
  toggleWishlist: () => {},
  logout: () => {},
  nowPlaying: null,
  setNowPlaying: () => {},
  isPlaying: false,
  setIsPlaying: () => {},
  listeningHistory: {},
  updateProgress: () => {},
  freeMinutesRemaining: 120, // 2 hours
  useFreeMinutes: () => {},
})

export function useUser() {
  return useContext(UserContext)
}

// Categories
export const categories = [
  { name: 'Mystery', icon: '🔍', slug: 'mystery' },
  { name: 'Drama', icon: '🎭', slug: 'drama' },
  { name: 'Sci-Fi', icon: '🚀', slug: 'sci-fi' },
  { name: 'Horror', icon: '👻', slug: 'horror' },
  { name: 'Comedy', icon: '😄', slug: 'comedy' },
  { name: 'Romance', icon: '💕', slug: 'romance' },
  { name: 'Trucker Stories', icon: '🚛', slug: 'trucker' },
]

// Tier display names
const tierNames: Record<SubscriptionTier, string> = {
  test_driver: 'Test Driver',
  commuter: 'Commuter',
  road_warrior: 'Road Warrior',
}

// ============================================
// AUDIO PLAYER COMPONENT
// ============================================
function AudioPlayer() {
  const { nowPlaying, setNowPlaying, isPlaying, setIsPlaying, updateProgress } = useUser()
  const [currentTime, setCurrentTime] = useState(0)
  const progressRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!nowPlaying || !isPlaying) return
    
    const totalSeconds = nowPlaying.durationMins * 60
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 1
        if (next >= totalSeconds) {
          setIsPlaying(false)
          return totalSeconds
        }
        if (next % 5 === 0) {
          const progress = (next / totalSeconds) * 100
          updateProgress(nowPlaying.id, progress, next)
        }
        return next
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [nowPlaying, isPlaying])

  useEffect(() => {
    if (nowPlaying?.currentTime) {
      setCurrentTime(nowPlaying.currentTime)
    } else {
      setCurrentTime(0)
    }
  }, [nowPlaying?.id])

  if (!nowPlaying) return null

  const totalSeconds = nowPlaying.durationMins * 60
  const progress = (currentTime / totalSeconds) * 100

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = (x / rect.width) * 100
    const newTime = (percent / 100) * totalSeconds
    setCurrentTime(Math.max(0, Math.min(newTime, totalSeconds)))
    updateProgress(nowPlaying.id, percent, newTime)
  }

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, totalSeconds))
    setCurrentTime(newTime)
    updateProgress(nowPlaying.id, (newTime / totalSeconds) * 100, newTime)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 px-4 py-3 z-50">
      <div className="max-w-4xl mx-auto">
        <div 
          ref={progressRef}
          className="h-1 bg-slate-700 rounded-full mb-3 cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-orange-500 rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-12 h-12 rounded bg-gradient-to-br ${nowPlaying.color} flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{nowPlaying.title}</p>
              <p className="text-slate-400 text-xs truncate">{nowPlaying.author}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => skip(-15)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white" title="Back 15s">
              <span className="text-xs">-15</span>
            </button>
            
            <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 bg-orange-500 hover:bg-orange-400 rounded-full flex items-center justify-center text-black">
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            
            <button onClick={() => skip(30)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white" title="Forward 30s">
              <span className="text-xs">+30</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 w-24 justify-end">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(totalSeconds)}</span>
          </div>

          <button 
            onClick={() => {
              updateProgress(nowPlaying.id, progress, currentTime)
              setNowPlaying(null)
              setIsPlaying(false)
            }}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// NAVIGATION COMPONENT
// ============================================
function Nav() {
  const pathname = usePathname()
  const { user, logout } = useUser()
  const [showMenu, setShowMenu] = useState(false)
  
  const links = [
    { href: '/', label: 'Home' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
    { href: '/library', label: 'DTT Library' },
    { href: '/my-library', label: 'My Library' },
  ]

  // Format display for subscription tier
  const getStatusDisplay = () => {
    if (!user?.isLoggedIn) return null
    
    const tier = user.subscriptionTier || 'test_driver'
    
    if (tier === 'commuter' || tier === 'road_warrior') {
      return (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800 rounded text-sm">
          <span className={tier === 'road_warrior' ? 'text-purple-400' : 'text-orange-400'}>
            {tier === 'road_warrior' ? '🚛' : '🚙'}
          </span>
          <span className="text-slate-300">{tierNames[tier]}</span>
        </div>
      )
    }
    
    // Test Driver - show free time or credits
    if (user.creditBalance > 0) {
      return (
        <div className="hidden sm:block px-3 py-1 bg-slate-800 rounded text-sm">
          <span className="text-green-400 font-semibold">{user.creditBalance.toFixed(1)}</span>
          <span className="text-slate-400 ml-1">credits</span>
        </div>
      )
    }
    
    const freeMinutes = Math.floor(user.freeSecondsRemaining / 60)
    return (
      <div className="hidden sm:block px-3 py-1 bg-slate-800 rounded text-sm">
        <span className="text-green-400 font-semibold">{freeMinutes}</span>
        <span className="text-slate-400 ml-1">min free</span>
      </div>
    )
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🚛</span>
          <span className="font-bold">
            <span className="text-orange-400">Drive Time</span>
            <span className="text-white"> Tales</span>
          </span>
        </Link>
        
        <div className="hidden md:flex items-center gap-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded text-sm ${
                pathname === link.href ? 'bg-orange-500/20 text-orange-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        
        <div className="flex items-center gap-3">
          {user?.isLoggedIn ? (
            <>
              {getStatusDisplay()}
              
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
                  <span className="text-sm text-slate-300 hidden sm:block">{user.name}</span>
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                </button>
                
                {showMenu && (
                  <div className="absolute right-0 top-10 bg-slate-800 border border-slate-700 rounded-lg py-2 min-w-[180px]">
                    <div className="px-4 py-2 border-b border-slate-700">
                      <p className="text-white font-semibold">{user.name}</p>
                      <p className="text-xs text-slate-400">{tierNames[user.subscriptionTier || 'test_driver']}</p>
                    </div>
                    <Link href="/settings" onClick={() => setShowMenu(false)} className="block w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      ⚙️ Settings
                    </Link>
                    <Link href="/my-library" onClick={() => setShowMenu(false)} className="block w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      🎧 My Library
                    </Link>
                    <Link href="/pricing" onClick={() => setShowMenu(false)} className="block w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      💳 Upgrade Plan
                    </Link>
                    <button onClick={() => { logout(); setShowMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700">
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/signin" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
              <Link href="/pricing" className="px-3 py-1.5 bg-orange-500 text-black text-sm font-semibold rounded">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
      
      <div className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
              pathname === link.href ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

// ============================================
// FOOTER COMPONENT
// ============================================
function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-8 px-4 mt-12">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🚛</span>
              <span className="font-bold text-sm">
                <span className="text-orange-400">Drive Time</span>
                <span className="text-white"> Tales</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">Audio stories for the road</p>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Browse</h4>
            <ul className="space-y-1">
              <li><a href="/library" className="text-xs text-slate-400 hover:text-orange-400">All Stories</a></li>
              <li><a href="/library?genre=trucker" className="text-xs text-slate-400 hover:text-orange-400">Trucker Stories</a></li>
              <li><a href="/library?genre=mystery" className="text-xs text-slate-400 hover:text-orange-400">Mystery</a></li>
              <li><a href="/library?genre=horror" className="text-xs text-slate-400 hover:text-orange-400">Horror</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Company</h4>
            <ul className="space-y-1">
              <li><a href="/about" className="text-xs text-slate-400 hover:text-orange-400">About Us</a></li>
              <li><a href="/pricing" className="text-xs text-slate-400 hover:text-orange-400">Pricing</a></li>
              <li><a href="#" className="text-xs text-slate-400 hover:text-orange-400">Contact</a></li>
              <li><a href="#" className="text-xs text-slate-400 hover:text-orange-400">FAQ</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Legal</h4>
            <ul className="space-y-1">
              <li><a href="#" className="text-xs text-slate-400 hover:text-orange-400">Terms of Service</a></li>
              <li><a href="#" className="text-xs text-slate-400 hover:text-orange-400">Privacy Policy</a></li>
              <li><a href="#" className="text-xs text-slate-400 hover:text-orange-400">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">© 2024 Drive Time Tales. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="text-slate-400 hover:text-orange-400 text-lg">📘</a>
            <a href="#" className="text-slate-400 hover:text-orange-400 text-lg">🐦</a>
            <a href="#" className="text-slate-400 hover:text-orange-400 text-lg">📷</a>
            <a href="#" className="text-slate-400 hover:text-orange-400 text-lg">▶️</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ============================================
// ROOT LAYOUT
// ============================================
export default function RootLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<PlayingStory | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [listeningHistory, setListeningHistory] = useState<ListeningHistory>({})

  // Load saved state on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('dtt_device_user')
    const savedHistory = localStorage.getItem('dtt_listening_history')
    
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      // Migrate old format to new
      if (parsed.plan && !parsed.subscriptionTier) {
        parsed.subscriptionTier = parsed.plan === 'longhaul' ? 'road_warrior' 
          : parsed.plan === 'commuter' || parsed.plan === 'roadtripper' ? 'commuter' 
          : 'test_driver'
        parsed.freeSecondsRemaining = parsed.freeSecondsRemaining || 7200
        parsed.creditBalance = parsed.creditBalance || 0
        parsed.ownedStories = parsed.ownedStories || []
        parsed.storeCreditCents = parsed.storeCreditCents || 0
      }
      setUser(parsed)
    }
    if (savedHistory) {
      setListeningHistory(JSON.parse(savedHistory))
    }
    setLoaded(true)
  }, [])

  // Save user when changed
  useEffect(() => {
    if (user) {
      localStorage.setItem('dtt_device_user', JSON.stringify(user))
    }
  }, [user])

  // Save listening history
  useEffect(() => {
    if (Object.keys(listeningHistory).length > 0) {
      localStorage.setItem('dtt_listening_history', JSON.stringify(listeningHistory))
    }
  }, [listeningHistory])

  // ============================================
  // ACCESS CHECKING LOGIC
  // Priority: Owned > Subscription > Credits > Free Tier
  // ============================================
  const checkAccess = (storyDurationMins: number, storyId: string): AccessResult => {
    // 1. Check if owned
    if (user?.ownedStories?.includes(storyId)) {
      return { canPlay: true, accessType: 'owned' }
    }
    
    // 2. Check subscription tier
    if (user?.isLoggedIn) {
      if (user.subscriptionTier === 'commuter' || user.subscriptionTier === 'road_warrior') {
        return { canPlay: true, accessType: 'subscription' }
      }
    }
    
    // 3. Check credits (1 credit = 15 min)
    const creditsNeeded = storyDurationMins / 15
    if (user?.creditBalance && user.creditBalance >= creditsNeeded) {
      return { canPlay: true, accessType: 'credits', message: `Use ${creditsNeeded.toFixed(1)} credits` }
    }
    
    // 4. Check free tier seconds
    const secondsNeeded = storyDurationMins * 60
    const freeSeconds = user?.freeSecondsRemaining ?? 7200
    if (freeSeconds >= secondsNeeded) {
      return { canPlay: true, accessType: 'free_tier' }
    }
    
    // 5. No access
    return { 
      canPlay: false, 
      accessType: 'none',
      message: 'Subscribe or buy credits to listen'
    }
  }

  // Use free seconds
  const useFreeSeconds = (seconds: number) => {
    if (!user) {
      // For non-logged-in visitors, track in localStorage directly
      const current = parseInt(localStorage.getItem('dtt_free_seconds') || '7200')
      localStorage.setItem('dtt_free_seconds', Math.max(0, current - seconds).toString())
    } else {
      setUser({
        ...user,
        freeSecondsRemaining: Math.max(0, user.freeSecondsRemaining - seconds)
      })
    }
  }

  // Use credits
  const useCredits = (credits: number) => {
    if (user) {
      setUser({
        ...user,
        creditBalance: Math.max(0, user.creditBalance - credits)
      })
    }
  }

  // Legacy: use free minutes
  const useFreeMinutes = (mins: number) => {
    useFreeSeconds(mins * 60)
  }

  // Get free minutes remaining (for legacy compatibility)
  const getFreeMinutesRemaining = () => {
    if (user) {
      return Math.floor(user.freeSecondsRemaining / 60)
    }
    const stored = localStorage.getItem('dtt_free_seconds')
    return Math.floor((stored ? parseInt(stored) : 7200) / 60)
  }

  // Toggle wishlist
  const toggleWishlist = (storyId: string) => {
    if (!user) return
    const newWishlist = user.wishlist.includes(storyId)
      ? user.wishlist.filter(id => id !== storyId)
      : [...user.wishlist, storyId]
    setUser({ ...user, wishlist: newWishlist })
  }

  // Update progress
  const updateProgress = (storyId: string, progress: number, currentTime: number) => {
    setListeningHistory(prev => ({
      ...prev,
      [storyId]: { progress, currentTime, lastPlayed: Date.now() }
    }))
  }

  // Logout
  const logout = () => {
    localStorage.removeItem('dtt_device_user')
    setUser(null)
  }

  if (!loaded) {
    return (
      <html lang="en">
        <head><title>Drive Time Tales</title></head>
        <body>
          <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <span className="text-2xl animate-bounce">🚛</span>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <head><title>Drive Time Tales</title></head>
      <body>
        <UserContext.Provider value={{ 
          user, setUser, 
          checkAccess,
          useFreeSeconds, useCredits,
          freeMinutesRemaining: getFreeMinutesRemaining(),
          useFreeMinutes,
          toggleWishlist, logout,
          nowPlaying, setNowPlaying,
          isPlaying, setIsPlaying,
          listeningHistory, updateProgress
        }}>
          <Nav />
          <main className={`pt-14 md:pt-14 min-h-screen ${nowPlaying ? 'pb-24' : ''}`}>{children}</main>
          <Footer />
          <AudioPlayer />
        </UserContext.Provider>
      </body>
    </html>
  )
}
