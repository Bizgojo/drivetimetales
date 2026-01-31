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

interface UserProfile {
  id: string
  first_name: string | null
  display_name: string | null
  credits: number
  state: string | null
}

interface PlaylistItem {
  type: 'intro' | 'news' | 'outro'
  url: string
  text?: string
}

type BriefingStatus = 'new' | 'loading' | 'playing' | 'paused' | 'listened'

// =============================================================================
// NEWS CATEGORIES - Colors from MASTER_RULES
// =============================================================================

const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: '#dc2626' },      // Red
  { id: 'national', name: 'National', icon: '🇺🇸', color: '#f97316' },    // Orange
  { id: 'international', name: 'World', icon: '🌍', color: '#eab308' },   // Yellow
  { id: 'business', name: 'Business', icon: '💼', color: '#16a34a' },     // Green
  { id: 'sports', name: 'Sports', icon: '⚽', color: '#2563eb' },         // Blue
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: '#9333ea' },      // Purple
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function HomePage() {
  const router = useRouter()
  
  // Auth state
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  
  // News briefings state
  const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
  const [briefingStatus, setBriefingStatus] = useState<Record<string, BriefingStatus>>({})
  const [currentPlaylist, setCurrentPlaylist] = useState<PlaylistItem[]>([])
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(null)
  
  // Stories state
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  
  // Audio ref for playlist playback
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  useEffect(() => {
    async function initialize() {
      // Check auth
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/welcome')
        return
      }
      
      setCurrentUser(user)
      setAuthChecked(true)
      
      // Fetch user profile
      const { data: profile } = await supabase
        .from('users')
        .select('id, first_name, display_name, credits, state')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        setUserProfile(profile)
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
      
      // Fetch stories for New Releases
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, is_free')
        .limit(6)
      
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
    // When playlist changes, start playing from index 0
    if (currentPlaylist.length > 0 && currentPlaylistIndex === 0) {
      playCurrentTrack()
    }
  }, [currentPlaylist])

  useEffect(() => {
    // When index changes (after a track ends), play next track
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
      console.error('[Home] Audio error, skipping to next track')
      setCurrentPlaylistIndex(prev => prev + 1)
    }
    
    audio.play().catch(err => {
      console.error('[Home] Play error:', err)
      setCurrentPlaylistIndex(prev => prev + 1)
    })
  }

  // =============================================================================
  // PLAY BRIEFING - CALLS STITCH API
  // =============================================================================

  async function handlePlayBriefing(categoryId: string) {
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
    
    // Check if user has credits (need at least 1 to play briefings)
    if ((userProfile?.credits || 0) < 1) {
      playNoCreditsMessage()
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
      // Call stitch API for personalized clips
      const state = userProfile?.state || 'South Carolina'
      const response = await fetch(
        `/api/audio/stitch?type=user&userId=${userProfile?.id}&category=${categoryId}&state=${encodeURIComponent(state)}`
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
      console.error('[Home] Error fetching playlist:', error)
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
  // NO CREDITS MESSAGE
  // =============================================================================

  function playNoCreditsMessage() {
    const displayName = userProfile?.first_name || userProfile?.display_name?.split(' ')[0] || 'friend'
    const message = `Hey ${displayName}! I'm glad you're back, but I'm sorry to inform you that you must have at least one credit in your account to hear the recent news briefings. Please buy more credits or upgrade your subscription. I look forward to seeing you soon. Goodbye!`
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 1.0
      speechSynthesis.speak(utterance)
    } else {
      alert(message)
    }
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  const displayName = userProfile?.first_name || userProfile?.display_name?.split(' ')[0] || 'friend'
  const userCredits = userProfile?.credits || 0
  const userState = userProfile?.state || 'Your State'

  function getStatusBadge(status: BriefingStatus, hasEpisode: boolean) {
    if (!hasEpisode) return null
    
    const badgeStyle: React.CSSProperties = {
      position: 'absolute',
      top: '4px',
      right: '4px',
      fontSize: '10px',
      padding: '2px 6px',
      borderRadius: '9999px',
      fontWeight: 'bold',
    }
    
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

  if (!authChecked || loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white' }}>
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
          <Link href="/home" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <span style={{ fontSize: '24px' }}>🚗</span>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
              Drive Time <span style={{ color: '#f97316' }}>Tales</span>
            </span>
          </Link>
          
          <Link 
            href="/account" 
            style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%', 
              backgroundColor: '#f97316', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'black', 
              fontWeight: 'bold',
              textDecoration: 'none'
            }}
          >
            {displayName[0]?.toUpperCase() || '?'}
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '896px', margin: '0 auto', padding: '24px 16px', paddingBottom: '160px' }}>
        
        {/* Welcome Message */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', margin: 0 }}>
            Welcome back, {displayName}!
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <span style={{ color: 'white' }}>
              You have <span style={{ color: userCredits > 0 ? '#22c55e' : '#ef4444' }}>{userCredits}</span> credit{userCredits !== 1 ? 's' : ''}
            </span>
            {userCredits === 0 && (
              <Link 
                href="/pricing" 
                style={{ 
                  backgroundColor: '#f97316', 
                  color: 'black', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  padding: '4px 12px', 
                  borderRadius: '8px',
                  textDecoration: 'none'
                }}
              >
                Buy More Credits
              </Link>
            )}
          </div>
        </div>

        {/* News Briefings Section */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>NEWS BRIEFINGS</h2>
          <p style={{ color: 'white', fontSize: '14px', marginBottom: '16px' }}>Top stories updated throughout the day</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {NEWS_CATEGORIES.map(cat => {
              const status = briefingStatus[cat.id] || 'new'
              const hasEpisode = !!newsEpisodes[cat.id]?.audio_url
              const catName = cat.id === 'state' ? `${userState}\nNews` : cat.name

              return (
                <button
                  key={cat.id}
                  onClick={() => handlePlayBriefing(cat.id)}
                  style={{
                    position: 'relative',
                    padding: '16px',
                    borderRadius: '12px',
                    textAlign: 'center',
                    backgroundColor: cat.color,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                    minHeight: '80px',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                >
                  {getStatusBadge(status, hasEpisode)}
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

        {/* New Releases Section */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>NEW RELEASES</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stories.map(story => (
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
                    {story.genre} • {Math.max(1, Math.floor(story.duration_mins / 15))} credit{Math.max(1, Math.floor(story.duration_mins / 15)) !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '14px', color: 'white' }}>
                    by {story.author}
                  </div>
                </div>
              </Link>
            ))}
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
            📚 Story Library
          </Link>
          <Link 
            href="/wishlist" 
            style={{ 
              flex: 1, 
              backgroundColor: '#ec4899', 
              color: 'white', 
              fontWeight: 'bold', 
              padding: '16px', 
              borderRadius: '12px', 
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: '16px',
            }}
          >
            ❤️ My Wishlist
          </Link>
        </div>
      </div>
    </div>
  )
}
