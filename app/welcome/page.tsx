'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getStories, Story } from '@/lib/supabase'

interface SponsorData {
  sponsor_name: string
  sponsor_message: string
  sponsor_tagline: string
}

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(0)
  const [genre, setGenre] = useState('All')
  const [duration, setDuration] = useState('All')
  
  // Promo banner from URL param
  const [showPromoBanner, setShowPromoBanner] = useState(false)
  const [promoBannerText, setPromoBannerText] = useState('')

  // Sponsor banner from QR code
  const [sponsorData, setSponsorData] = useState<SponsorData | null>(null)

  // Secret code modal
  const [logoTapCount, setLogoTapCount] = useState(0)
  const [lastTapTime, setLastTapTime] = useState(0)
  const [showSecretInput, setShowSecretInput] = useState(false)
  const [secretCode, setSecretCode] = useState('')
  const [codeMessage, setCodeMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const durationOptions = [
    { name: 'All', label: 'All' },
    { name: '15', label: '~15 min' },
    { name: '30', label: '~30 min' },
    { name: '60', label: '~1 hr' },
  ]

  useEffect(() => {
    async function initialize() {
      console.log('[DTT Debug] Welcome page initialize() started')
      
      // Load stories FIRST - don't wait for auth
      console.log('[DTT Debug] Loading stories...')
      try {
        const allStories = await getStories({})
        console.log('[DTT Debug] getStories() returned', allStories.length, 'stories')
        setStories(allStories)
        setLoading(false)
      } catch (error) {
        console.error('[DTT Debug] Error fetching stories:', error)
        setLoading(false)
      }

      // Load free credits from localStorage
      const storedCredits = localStorage.getItem('dtt_free_credits')
      if (storedCredits === null) {
        localStorage.setItem('dtt_free_credits', '2')
        localStorage.setItem('dtt_credits_used', 'false')
        setFreeCredits(2)
      } else {
        setFreeCredits(parseInt(storedCredits))
      }

      // Check for promo text in URL
      const promo = searchParams.get('promo')
      if (promo) {
        setShowPromoBanner(true)
        setPromoBannerText(decodeURIComponent(promo))
      }

      // Check for QR source sponsor
      const qrCode = searchParams.get('qr') || searchParams.get('source')
      if (qrCode) {
        console.log('[DTT Debug] Checking QR code:', qrCode)
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
        } catch (qrErr) {
          console.log('[DTT Debug] QR lookup failed (ok if no QR):', qrErr)
        }
      }
      
      // Check auth in background with timeout - don't block the page
      console.log('[DTT Debug] Checking auth session (with timeout)...')
      const authTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 3000)
      )
      
      try {
        const authPromise = supabase.auth.getSession()
        const { data: { session } } = await Promise.race([authPromise, authTimeout]) as any
        
        if (session) {
          console.log('[DTT Debug] User logged in, redirecting to /home')
          router.push('/home')
          return
        }
      } catch (authErr) {
        console.log('[DTT Debug] Auth check skipped (timeout or error):', authErr)
        // Continue without auth - this is the welcome page for non-logged-in users anyway
      }
    }
    
    console.log('[DTT Debug] Welcome page useEffect triggered')
    initialize()
  }, [router, searchParams])

  const handleLogoTap = () => {
    const now = Date.now()
    
    if (now - lastTapTime > 1000) {
      setLogoTapCount(1)
    } else {
      setLogoTapCount(prev => prev + 1)
    }
    
    setLastTapTime(now)
    
    if (logoTapCount >= 4) {
      setShowSecretInput(true)
      setLogoTapCount(0)
    }
  }

  const handleCodeSubmit = async () => {
    if (!secretCode.trim()) return
    
    setIsSubmitting(true)
    setCodeMessage(null)
    
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', secretCode.toUpperCase().trim())
        .eq('is_active', true)
        .eq('is_redeemed', false)
        .single()
      
      if (error || !data) {
        setCodeMessage({ type: 'error', text: 'Invalid, expired, or already used code' })
        setIsSubmitting(false)
        return
      }
      
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setCodeMessage({ type: 'error', text: 'This code has expired' })
        setIsSubmitting(false)
        return
      }
      
      const deviceId = localStorage.getItem('dtt_device_id') || crypto.randomUUID()
      localStorage.setItem('dtt_device_id', deviceId)
      
      const { error: updateError } = await supabase
        .from('promo_codes')
        .update({ 
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_by_device: deviceId
        })
        .eq('id', data.id)
      
      if (updateError) {
        setCodeMessage({ type: 'error', text: 'Error redeeming code. Please try again.' })
        setIsSubmitting(false)
        return
      }
      
      const subscriptionData = {
        code: data.code,
        type: data.subscription_type,
        days: data.subscription_days,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + data.subscription_days * 24 * 60 * 60 * 1000).toISOString(),
        deviceId: deviceId
      }
      localStorage.setItem('dtt_promo_subscription', JSON.stringify(subscriptionData))
      
      setCodeMessage({ 
        type: 'success', 
        text: `🎉 Success! Redirecting to create your account...` 
      })
      
      setTimeout(() => {
        setShowSecretInput(false)
        setSecretCode('')
        router.push('/register/promo')
      }, 1500)
    
    } catch (err) {
      setCodeMessage({ type: 'error', text: 'Error validating code. Please try again.' })
    }
    
    setIsSubmitting(false)
  }

  // Filter stories by genre and duration
  const filtered = stories.filter((s) => {
    if (genre !== 'All' && s.genre !== genre) return false
    if (duration === '15' && (s.duration_mins < 10 || s.duration_mins > 20)) return false
    if (duration === '30' && (s.duration_mins < 20 || s.duration_mins > 45)) return false
    if (duration === '60' && s.duration_mins < 45) return false
    return true
  })

  // Navigate to player details page
  const handleStoryClick = (story: Story) => {
    router.push(`/player/${story.id}`)
  }

  // Get flag for story based on its properties
  const getStoryFlag = (story: Story) => {
    if ((story.credits || 1) <= 2 && freeCredits > 0) {
      return { text: 'Free Story', color: 'green' }
    }
    if (story.is_featured) {
      return { text: "Listener's Choice", color: 'orange' }
    }
    if (story.is_new) {
      return { text: 'New Release', color: 'blue' }
    }
    return null
  }

  // Star rating component with half-star support
  const StarRating = ({ rating }: { rating: number }) => {
    const displayRating = rating || 4.0
    return (
      <span className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = displayRating >= star
          const halfFilled = !filled && displayRating >= star - 0.5
          return (
            <span key={star} className="relative text-sm">
              <span className="text-slate-600">☆</span>
              {(filled || halfFilled) && (
                <span 
                  className="absolute left-0 top-0 text-yellow-400 overflow-hidden"
                  style={{ width: halfFilled ? '50%' : '100%' }}
                >
                  ★
                </span>
              )}
            </span>
          )
        })}
        <span className="text-slate-400 text-xs ml-1">{displayRating.toFixed(1)}</span>
      </span>
    )
  }

  // Flag badge component
  const FlagBadge = ({ text, color }: { text: string, color: string }) => {
    const colorClasses: { [key: string]: string } = {
      green: 'bg-green-500/20 text-green-400 border-green-500/30',
      orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    }
    return (
      <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${colorClasses[color]}`}>
        {text}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20">
      
      {/* Secret Code Modal */}
      {showSecretInput && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-sm border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">🎁 Enter Promo Code</h2>
              <button 
                onClick={() => {
                  setShowSecretInput(false)
                  setSecretCode('')
                  setCodeMessage(null)
                }}
                className="text-slate-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            
            <input
              type="text"
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value.toUpperCase())}
              placeholder="Enter code..."
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-center text-lg tracking-widest uppercase focus:outline-none focus:border-orange-500 mb-4"
              maxLength={20}
              autoFocus
            />
            
            {codeMessage && (
              <div className={`p-3 rounded-lg mb-4 text-sm text-center ${
                codeMessage.type === 'success' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {codeMessage.text}
              </div>
            )}
            
            <button
              onClick={handleCodeSubmit}
              disabled={isSubmitting || !secretCode.trim()}
              className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                isSubmitting || !secretCode.trim()
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-400 text-black'
              }`}
            >
              {isSubmitting ? 'Validating...' : 'Redeem Code'}
            </button>
            
            <p className="text-slate-500 text-xs text-center mt-3">
              Each code can only be used once
            </p>
          </div>
        </div>
      )}

      {/* Sponsor Banner - Shows when user comes from sponsored QR code */}
      {sponsorData && (
        <div className="sticky top-0 z-40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 px-4 py-2 text-center shadow-lg">
          <p className="text-white text-sm font-medium">
            {sponsorData.sponsor_message} <span className="font-bold">{sponsorData.sponsor_name}</span> — {sponsorData.sponsor_tagline}
          </p>
        </div>
      )}

      {/* Promo Banner - Shows when ?promo= URL param exists */}
      {showPromoBanner && promoBannerText && !sponsorData && (
        <div className="sticky top-0 z-40 bg-gradient-to-r from-green-600 to-green-500 px-3 py-2">
          <p className="text-white text-xs text-center font-medium leading-tight">
            🎁 {promoBannerText}
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">
        
        {/* Welcome To Header */}
        <p className="text-center text-orange-400 italic text-xl mb-2">Welcome To</p>
        
        {/* LARGE CENTERED LOGO - Emoji Vehicles */}
        <button 
          onClick={handleLogoTap}
          className="w-full flex flex-col items-center justify-center mb-4 focus:outline-none"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-5xl">🚛</span>
            <span className="text-5xl">🚗</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-2xl font-bold text-white">Drive Time </span>
            <span className="text-2xl font-bold text-orange-500">Tales</span>
          </div>
        </button>

        {/* Tagline - EYE CATCHING */}
        <div className="text-center mb-4">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-4 px-3 rounded-xl border border-slate-700/50">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
              Start Listening
            </h1>
            <h2 className="text-xl sm:text-2xl font-extrabold text-orange-400 leading-tight">
              To Your Free Story Now!
            </h2>
            <p className="text-white text-sm mt-2 font-medium">
              No Sign Up Required — Just Click & Listen
            </p>
          </div>
          
          {freeCredits > 0 ? (
            <p className="text-green-400 text-sm mt-2">
              🎁 You have {freeCredits} free credit{freeCredits !== 1 ? 's' : ''}
            </p>
          ) : (
            <div className="mt-2">
              <p className="text-red-400 font-semibold text-sm">
                You have 0 free credits
              </p>
            </div>
          )}
        </div>

        {/* Genre Filters */}
        <div className="mb-2">
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

        {/* Duration Filters */}
        <div className="mb-3">
          <div className="flex justify-center gap-2">
            {durationOptions.map((d) => (
              <button
                key={d.name}
                onClick={() => setDuration(d.name)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  duration === d.name 
                    ? 'bg-orange-500 text-black' 
                    : 'bg-slate-800 text-white border border-slate-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-slate-400 text-xs mb-3">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'} found</p>

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
            <p className="text-white">Try selecting a different genre or duration</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((story, index) => {
              const flag = getStoryFlag(story)
              
              return (
                <div 
                  key={story.id}
                  onClick={() => handleStoryClick(story)}
                  className={`rounded-xl overflow-hidden cursor-pointer active:opacity-80 transition-opacity ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}
                >
                  <div className="flex">
                    {/* Cover */}
                    <div className="w-28 h-28 flex-shrink-0 relative">
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
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        {story.duration_mins} min
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
                      {/* Title */}
                      <h3 className="font-bold text-white text-base leading-tight truncate">{story.title}</h3>
                      
                      {/* Genre + Credits */}
                      <p className="text-slate-400 text-sm">{story.genre} • {story.credits || 1} credit{(story.credits || 1) !== 1 ? 's' : ''}</p>
                      
                      {/* Author */}
                      <p className="text-slate-300 text-sm">{story.author}</p>
                      
                      {/* Star Rating + Flag */}
                      <div className="flex items-center gap-2 flex-wrap">
                       <StarRating rating={story.rating} />
                        {flag && <FlagBadge text={flag.text} color={flag.color} />}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* STICKY SUBSCRIBE BUTTON */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-4 pb-3 px-4 z-30">
        <div className="max-w-2xl mx-auto">
          <button 
            onClick={() => router.push('/pricing')}
            className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold text-base rounded-xl transition-colors"
          >
            Subscribe Here
          </button>
        </div>
      </div>
    </div>
  )
}

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

export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <WelcomeContent />
    </Suspense>
  )
}
