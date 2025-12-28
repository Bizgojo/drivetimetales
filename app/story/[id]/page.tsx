'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useStory } from '../../hooks/useStories'

const PROMO_MESSAGE = "You're listening to Drive Time Tales - audio stories for the road. Visit drivetimetales.com to hear the full story."

// Price mapping by duration
const getPriceForDuration = (mins: number): number => {
  if (mins <= 15) return 0.69
  if (mins <= 30) return 1.29
  if (mins <= 60) return 2.49
  return 6.99
}

function StoryContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const { story, loading, error } = useStory(storyId)
  const { 
    user, 


  } = useAuth()
  
  const [showPromo, setShowPromo] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [autoPlayTriggered, setAutoPlayTriggered] = useState(false)

  // Check for auto-play params
  useEffect(() => {
    if (!story || autoPlayTriggered) return
    
    const playParam = searchParams.get('play')
    if (playParam && playParam !== 'none') {
      setAutoPlayTriggered(true)
      handlePlay(playParam)
    }
  }, [story, autoPlayTriggered])

  if (loading) {
    return (
      <div className="py-12 px-4 text-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Loading story...</p>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="py-12 px-4 text-center">
        <h1 className="text-xl text-white mb-4">Story not found</h1>
        <Link href="/library" className="text-orange-400">← Back to Library</Link>
      </div>
    )
  }

  const access = checkAccess(story.durationMins, story.id)
  const isWishlisted = user?.wishlist?.includes(storyId)
  const savedProgress = listeningHistory[story.id]
  const isCurrentlyPlaying = nowPlaying?.id === story.id
  const creditsNeeded = story.durationMins / 15
  const buyPrice = getPriceForDuration(story.durationMins)

  const startPlayback = (isSample: boolean = false) => {
    const currentTime = !isSample && savedProgress ? savedProgress.currentTime : 0
    const progress = !isSample && savedProgress ? savedProgress.progress : 0
    
    setNowPlaying({
      id: story.id,
      title: story.title,
      author: story.author,
      duration: story.duration,
      durationMins: isSample ? 2 : story.durationMins,
      color: story.color,
      progress,
      currentTime
    })
    setIsPlaying(true)
  }

  const handlePlay = (accessType: string) => {
    // Show promo for non-subscribers
    const showPromoMessage = !user?.isLoggedIn || 
      (user.subscriptionTier !== 'commuter' && user.subscriptionTier !== 'road_warrior')
    
    if (showPromoMessage && accessType !== 'sample') {
      setPendingAction(accessType)
      setShowPromo(true)
      
      setTimeout(() => {
        setShowPromo(false)
        executePlayback(accessType)
        setPendingAction(null)
      }, 3000)
    } else {
      executePlayback(accessType)
    }
  }

  const executePlayback = (accessType: string) => {
    if (accessType === 'sample') {
      startPlayback(true)
    } else if (accessType === 'free_tier') {
      useFreeSeconds(story.durationMins * 60)
      startPlayback(false)
    } else if (accessType === 'credits') {
      useCredits(creditsNeeded)
      startPlayback(false)
    } else {
      // subscription or owned - just play
      startPlayback(false)
    }
  }

  const handlePlaySample = () => handlePlay('sample')

  return (
    <div className="py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/library" className="text-slate-400 hover:text-white text-sm mb-6 inline-block">← Back to Library</Link>
        
        <div className="flex flex-col md:flex-row gap-6">
          {/* Cover */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className={`aspect-square rounded-xl relative overflow-hidden ${story.coverUrl ? '' : `bg-gradient-to-br ${story.color}`}`}>
              {story.coverUrl ? (
                <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[20px] border-l-white border-y-[12px] border-y-transparent ml-1" />
                  </div>
                </div>
              )}
              {story.promo && (
                <div className="absolute top-3 left-3 px-3 py-1 bg-orange-500 text-black text-sm font-bold rounded">{story.promo}</div>
              )}
              {story.isNew && !story.promo && (
                <div className="absolute top-3 left-3 px-3 py-1 bg-green-500 text-black text-sm font-bold rounded">NEW</div>
              )}
              {isWishlisted && (
                <div className="absolute top-3 right-3 text-yellow-400 text-xl">💫</div>
              )}
            </div>

            {/* Promo Message */}
            {showPromo && (
              <div className="mt-4 bg-slate-800 rounded-lg p-3">
                <div className="text-center">
                  <p className="text-orange-400 text-xs mb-2">📢 Promotional Message</p>
                  <p className="text-slate-300 text-sm italic">"{PROMO_MESSAGE}"</p>
                  <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 animate-pulse" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {savedProgress && savedProgress.progress > 0 && savedProgress.progress < 100 && !isCurrentlyPlaying && (
              <div className="mt-4 bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Continue where you left off</p>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${savedProgress.progress}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{Math.round(savedProgress.progress)}% complete</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            {story.promo && (
              <span className="inline-block px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded mb-2">{story.promo}</span>
            )}
            {story.isNew && !story.promo && (
              <span className="inline-block px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded mb-2">NEW</span>
            )}
            <h1 className="text-2xl font-bold text-white mb-1">{story.title}</h1>
            <p className="text-orange-400 mb-1">{story.genre}</p>
            <p className="text-slate-400 mb-1">by {story.author}</p>
            <p className="text-slate-500 text-sm mb-4">{story.duration} • {creditsNeeded.toFixed(1)} credits</p>

            <p className="text-slate-300 mb-6">{story.description}</p>

            <div className="space-y-3">
              {/* Currently Playing */}
              {isCurrentlyPlaying && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
                  <p className="text-green-400 font-semibold">🎧 Now Playing</p>
                </div>
              )}

              {/* Sample Button */}
              {!isCurrentlyPlaying && (
                <button 
                  onClick={handlePlaySample} 
                  disabled={showPromo}
                  className={`w-full py-3 rounded-xl font-semibold ${showPromo && pendingAction === 'sample' ? 'bg-slate-700 text-slate-400' : 'bg-slate-600 hover:bg-slate-500 text-white'}`}
                >
                  {showPromo && pendingAction === 'sample' ? '📢 Playing promo...' : '▶ Play Sample (2 min)'}
                </button>
              )}

              {/* Primary Play Button */}
              {!isCurrentlyPlaying && access.canPlay && (
                <button 
                  onClick={() => handlePlay(access.accessType)}
                  disabled={showPromo}
                  className={`w-full py-3 rounded-xl font-semibold ${showPromo ? 'bg-slate-700 text-slate-400' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {showPromo ? '📢 Playing promo...' : (
                    access.accessType === 'owned' ? '▶ Play (Owned)' :
                    access.accessType === 'subscription' ? (savedProgress ? '▶ Continue' : '▶ Play Full Story') :
                    access.accessType === 'credits' ? `▶ Play (${creditsNeeded.toFixed(1)} credits)` :
                    savedProgress ? '▶ Continue Free' : '▶ Play Free'
                  )}
                </button>
              )}

              {/* Upgrade Prompt */}
              {!isCurrentlyPlaying && !access.canPlay && (
                <Link href="/pricing" className="block w-full py-3 bg-slate-700 text-slate-400 text-center font-semibold rounded-xl">
                  🔒 Subscribe or Buy Credits
                </Link>
              )}

              {/* Buy Button */}
              {!user?.ownedStories?.includes(storyId) && (
                <button className="w-full py-3 rounded-xl font-semibold border border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
                  🎁 Buy & Own Forever — ${buyPrice.toFixed(2)}
                </button>
              )}

              {/* Wishlist Button */}
              {user?.isLoggedIn && (
                <button 
                  onClick={() => toggleWishlist(storyId)}
                  className={`w-full py-3 rounded-xl font-semibold border ${
                    isWishlisted 
                      ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' 
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-yellow-500/50'
                  }`}
                >
                  {isWishlisted ? '💫 On Wishlist' : '💫 Add to Wishlist'}
                </button>
              )}
            </div>

            {/* Access Status */}
            <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-500">
                {user?.isLoggedIn ? (
                  user.subscriptionTier === 'commuter' || user.subscriptionTier === 'road_warrior' ? (
                    <span className="text-green-400">✓ Unlimited streaming with your {user.subscriptionTier === 'road_warrior' ? 'Road Warrior' : 'Commuter'} plan</span>
                  ) : user.creditBalance > 0 ? (
                    <>Credit balance: <span className="text-green-400">{user.creditBalance.toFixed(1)} credits</span></>
                  ) : (
                    <>Free time: <span className="text-green-400">{Math.floor(user.freeSecondsRemaining / 60)} min</span> remaining this month</>
                  )
                ) : (
                  <>Free tier: Stream any story with your 2 hours/month</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StoryPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading...</div>}>
      <StoryContent />
    </Suspense>
  )
}
