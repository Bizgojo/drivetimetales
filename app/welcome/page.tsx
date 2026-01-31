'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  is_free?: boolean
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string
  is_live: boolean
}

interface PlaylistItem {
  type: 'intro' | 'news' | 'outro'
  url: string
  text?: string
}

type BriefingStatus = 'new' | 'loading' | 'playing' | 'paused' | 'listened' | 'locked'

// =============================================================================
// NEWS CATEGORIES - Colors from MASTER_RULES
// =============================================================================

const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: '#dc2626', locked: true },      // Red - LOCKED for non-subscribers
  { id: 'national', name: 'National', icon: '🇺🇸', color: '#f97316', locked: false },   // Orange
  { id: 'international', name: 'World', icon: '🌍', color: '#eab308', locked: false },  // Yellow
  { id: 'business', name: 'Business', icon: '💼', color: '#16a34a', locked: false },    // Green
  { id: 'sports', name: 'Sports', icon: '⚽', color: '#2563eb', locked: false },        // Blue
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: '#9333ea', locked: false },     // Purple
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function WelcomePage() {
  const router = useRouter()
  
  // State
  const [freeCredits, setFreeCredits] = useState(2)
  const [hasUsedFreeCredits, setHasUsedFreeCredits] = useState(false)
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [currentPlaylist, setCurrentPlaylist] = useState<PlaylistItem[]>([])
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  
  // Audio ref for playlist playback
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  useEffect(() => {
    async function initialize() {
      // Check if user is already logged in
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Redirect logged-in users to home
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
      
      // Fetch news episodes
      const { data: episodes } = await supabase
        .from('news_episodes')
        .select('*')
        .eq('is_live', true)
      
      if (episodes) {
        const episodeMap: Record<string, NewsEpisode> = {}
        episodes.forEach(ep => {
          episodeMap[ep.category] = ep
        })
        setNewsEpisodes(episodeMap)
      }
      
      // Fetch featured stories (1-2 credits only for welcome page)
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, is_free')
        .lte('duration_mins', 30) // Only stories up to 30 min (1-2 credits)
        .limit(4)
      
      if (storiesData) {
        setStories(storiesData)
      }
      
      setLoading(false)
    }
    
    initialize()
  }, [router])

  // =============================================================================
  // AUDIO PLAYLIST HANDLER
  // =============================================================================

  useEffect(() => {
    if (currentPlaylist.length > 0 && currentPlaylistIndex === 0) {
      playCurrentTrack()
    }
  }, [currentPlaylist])

  useEffect(() => {
    if (currentPlaylist.length > 0 && currentPlaylistIndex > 0) {
      playCurrentTrack()
    }
  }, [currentPlaylistIndex])

  function playCurrentTrack() {
    if (currentPlaylistIndex >= currentPlaylist.length) {
      // Playlist finished
      if (activeBriefingId) {
        setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'listened' }))
      }
      setActiveBriefingId(null)
      setCurrentPlaylist([])
      setCurrentPlaylistIndex(0)
      return
    }

    const track = currentPlaylist[currentPlaylistIndex]
    
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    const audio = new Audio(track.url)
    audioRef.current = audio
    
    audio.onended = () => {
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.onerror = () => {
      console.error('[Welcome] Audio error, skipping to next track')
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.play().catch(err => {
      console.error('[Welcome] Play error:', err)
      setCurrentPlaylistIndex(prev => prev + 1)
    })
  }

  // =============================================================================
  // PLAY BRIEFING - CALLS STITCH API (GENERIC/WELCOME CLIPS)
  // =============================================================================

  async function handlePlayBriefing(categoryId: string) {
    const category = NEWS_CATEGORIES.find(c => c.id === categoryId)
    
    // State news is locked for non-subscribers
    if (category?.locked) {
      playSubscribersOnlyMessage()
      return
    }
    
    const currentStatus = briefingStatus[categoryId]
    
    // If this briefing is already playing, pause it
    if (currentStatus === 'playing' && activeBriefingId === categoryId) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'paused' }))
      return
    }
    
    // If this briefing is paused, resume it
    if (currentStatus === 'paused' && activeBriefingId === categoryId) {
      if (audioRef.current) {
        audioRef.current.play()
      }
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      return
    }
    
    // Check if episode exists
    if (!newsEpisodes[categoryId]?.audio_url) {
      alert('No briefing available for this category yet')
      return
    }
    
    // Stop any currently playing briefing
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (activeBriefingId) {
      setBriefingStatus(prev => ({ ...prev, [activeBriefingId]: 'paused' }))
    }
    
    // Set loading state
    setBriefingStatus(prev => ({ ...prev, [categoryId]: 'loading' }))
    setActiveBriefingId(categoryId)
    
    try {
      // Call stitch API for GENERIC (welcome) clips - no userId
      const response = await fetch(
        `/api/audio/stitch?type=welcome&category=${categoryId}`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch audio playlist')
      }
      
      const data = await response.json()
      
      if (!data.playlist || data.playlist.length === 0) {
        throw new Error('Empty playlist returned')
      }
      
      // Set playlist and start playing
      setCurrentPlaylist(data.playlist)
      setCurrentPlaylistIndex(0)
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
      
    } catch (error) {
      console.error('[Welcome] Error fetching playlist:', error)
      setBriefingStatus(prev => ({ ...prev, [categoryId]: 'new' }))
      setActiveBriefingId(null)
      
      // Fallback: play just the news body directly
      const episode = newsEpisodes[categoryId]
      if (episode?.audio_url) {
        const audio = new Audio(episode.audio_url)
        audioRef.current = audio
        audio.onended = () => {
          setBriefingStatus(prev => ({ ...prev, [categoryId]: 'listened' }))
          setActiveBriefingId(null)
        }
        audio.play()
        setBriefingStatus(prev => ({ ...prev, [categoryId]: 'playing' }))
        setActiveBriefingId(categoryId)
      }
    }
  }

  // =============================================================================
  // SUBSCRIBERS ONLY MESSAGE
  // =============================================================================

  function playSubscribersOnlyMessage() {
    const message = `State news is available exclusively for Drive Time Tales subscribers. Subscribe today to get personalized news briefings for your state, plus access to our full library of audio stories. Visit our subscribe page to learn more!`
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 1.0
      speechSynthesis.speak(utterance)
    } else {
      setShowSubscribeModal(true)
    }
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  function getStatusBadge(status: BriefingStatus, hasEpisode: boolean, isLocked: boolean) {
    const badgeStyle: React.CSSProperties = {
      position: 'absolute',
      top: '4px',
      right: '4px',
      fontSize: '10px',
      padding: '2px 6px',
      borderRadius: '9999px',
      fontWeight: 'bold',
    }
    
    if (isLocked) {
      return <span style={{ ...badgeStyle, backgroundColor: '#64748b', color: 'white' }}>🔒</span>
    }
    
    if (!hasEpisode) return null
    
    switch (status) {
      case 'new':
        return <span style={{ ...badgeStyle, backgroundColor: '#f97316', color: 'black' }}>NEW</span>
      case 'loading':
        return <span style={{ ...badgeStyle, backgroundColor: '#64748b', color: 'white' }}>...</span>
      case 'playing':
        return <span style={{ ...badgeStyle, backgroundColor: '#22c55e', color: 'black' }}>▶</span>
      case 'paused':
        return <span style={{ ...badgeStyle, backgroundColor: '#eab308', color: 'black' }}>❚❚</span>
      case 'listened':
        return <span style={{ ...badgeStyle, backgroundColor: '#64748b', color: 'white' }}>✓</span>
      default:
        return null
    }
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white' }}>
      
      {/* Subscribe Modal */}
      {showSubscribeModal && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 100, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ 
            position: 'relative',
            width: '100%',
            maxWidth: '400px',
            backgroundColor: '#0f172a',
            borderRadius: '16px',
            border: '1px solid #334155',
            padding: '24px',
            textAlign: 'center',
          }}>
            <button 
              onClick={() => setShowSubscribeModal(false)}
              style={{ 
                position: 'absolute', 
                top: '16px', 
                right: '16px', 
                background: 'none', 
                border: 'none', 
                color: '#94a3b8', 
                cursor: 'pointer',
                fontSize: '20px',
              }}
            >
              ✕
            </button>
            
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎧</div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: 'white' }}>
              Unlock Full Access
            </h2>
            <p style={{ color: 'white', marginBottom: '24px' }}>
              Subscribe to get personalized state news, unlimited briefings, and our complete story library.
            </p>
            
            <Link 
              href="/subscribe"
              style={{ 
                display: 'block',
                backgroundColor: '#f97316', 
                color: 'black', 
                padding: '16px 32px', 
                borderRadius: '12px', 
                fontWeight: 'bold', 
                textDecoration: 'none',
                marginBottom: '12px',
              }}
            >
              Subscribe Now
            </Link>
            
            <button
              onClick={() => setShowSubscribeModal(false)}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#94a3b8', 
                cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 50, 
        backgroundColor: 'rgba(2, 6, 23, 0.95)', 
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ maxWidth: '896px', margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🚗</span>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
              Drive Time <span style={{ color: '#f97316' }}>Tales</span>
            </span>
          </div>
          
          <Link 
            href="/signin"
            style={{ 
              color: '#f97316', 
              fontWeight: '500',
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '896px', margin: '0 auto', padding: '24px 16px', paddingBottom: '160px' }}>
        
        {/* Welcome Message */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', margin: 0 }}>
            Welcome to Drive Time Tales!
          </h1>
          <p style={{ color: 'white', marginTop: '8px' }}>
            Audio stories and news briefings for your commute.
          </p>
          {freeCredits > 0 && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px 16px', 
              backgroundColor: '#1e3a2f', 
              borderRadius: '8px',
              border: '1px solid #22c55e',
            }}>
              <span style={{ color: 'white' }}>
                🎁 You have <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{freeCredits} free credits</span> to try our stories!
              </span>
            </div>
          )}
        </div>

        {/* News Briefings Section */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>NEWS BRIEFINGS</h2>
          <p style={{ color: 'white', fontSize: '14px', marginBottom: '16px' }}>Top stories updated throughout the day</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const hasEpisode = !!newsEpisodes[cat.id]?.audio_url
              const catName = cat.id === 'state' ? 'Your State\nNews' : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => handlePlayBriefing(cat.id)}
                  style={{
                    position: 'relative',
                    padding: '16px',
                    borderRadius: '12px',
                    textAlign: 'center',
                    backgroundColor: cat.locked ? '#475569' : cat.color,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                    minHeight: '80px',
                    opacity: cat.locked ? 0.7 : 1,
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = cat.locked ? '0.7' : '0.9'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = cat.locked ? '0.7' : '1'}
                >
                  {getStatusBadge(status, hasEpisode, cat.locked)}
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{cat.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: 'white', whiteSpace: 'pre-line' }}>{catName}</div>
                  {status === 'playing' && (
                    <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8, color: 'white' }}>▶ Now Playing</div>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Featured Stories Section */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>TRY A FREE STORY</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stories.map(story => {
              const credits = Math.max(1, Math.floor(story.duration_mins / 15))
              return (
                <Link 
                  key={story.id} 
                  href={`/story/${story.id}`}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    padding: '12px',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ 
                    width: '80px', 
                    height: '80px', 
                    borderRadius: '8px', 
                    backgroundColor: '#334155',
                    backgroundImage: story.cover_url ? `url(${story.cover_url})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {story.title}
                    </div>
                    <div style={{ fontSize: '14px', color: 'white', marginBottom: '4px' }}>
                      {story.genre} • {credits} credit{credits !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '14px', color: 'white' }}>
                      by {story.author}
                    </div>
                    {story.is_free && (
                      <span style={{ 
                        display: 'inline-block',
                        marginTop: '4px',
                        backgroundColor: '#22c55e',
                        color: 'black',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}>
                        FREE
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

      </main>

      {/* Bottom Sticky Buttons */}
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #1e293b',
        padding: '16px',
      }}>
        <div style={{ maxWidth: '896px', margin: '0 auto', display: 'flex', gap: '12px' }}>
          <Link 
            href="/library" 
            style={{ 
              flex: 1, 
              backgroundColor: '#334155', 
              color: 'white', 
              fontWeight: 'bold', 
              padding: '16px', 
              borderRadius: '12px', 
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: '16px',
            }}
          >
            📚 Go To Library
          </Link>
          <Link 
            href="/subscribe" 
            style={{ 
              flex: 1, 
              backgroundColor: '#f97316', 
              color: 'black', 
              fontWeight: 'bold', 
              padding: '16px', 
              borderRadius: '12px', 
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: '16px',
            }}
          >
            ⭐ Subscribe
          </Link>
        </div>
      </div>
    </div>
  )
}
