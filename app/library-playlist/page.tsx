'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
}

interface PlaylistItem {
  id: string
  title: string
  duration_mins: number
  genre: string
  author: string
  cover_url: string | null
  credited: boolean
}

const ALL_GENRES = [
  { key: 'mystery', label: 'Myst', emoji: '🔍' },
  { key: 'thriller', label: 'Thri', emoji: '😱' },
  { key: 'romance', label: 'Rom', emoji: '💕' },
  { key: 'horror', label: 'Horr', emoji: '👻' },
  { key: 'comedy', label: 'Com', emoji: '😂' },
  { key: 'truckers', label: 'Truc', emoji: '🚛' },
  { key: 'scifi', label: 'Sci-', emoji: '🚀' },
  { key: 'children', label: 'Kids', emoji: '🧒' },
  { key: 'learn', label: 'Lear', emoji: '🧠' }
]

const DEFAULT_VISIBLE = ['mystery', 'romance', 'horror']

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(4)
  const [userName, setUserName] = useState('')
  const [isSubscriber, setIsSubscriber] = useState(true)
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [showCreditsPopup, setShowCreditsPopup] = useState(false)

  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) {
      try {
        const parsed = JSON.parse(storedGenres)
        if (Array.isArray(parsed) && parsed.length >= 3) setVisibleGenres(parsed.slice(0, 3))
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase.from('stories').select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total').not('cover_url', 'is', null).order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('credits, first_name, subscription_status').eq('id', user.id).single()
        if (userData) {
          setUserName(userData.first_name || '')
          const isActiveSub = userData.subscription_status === 'active' || userData.subscription_status === 'trialing'
          setIsSubscriber(isActiveSub)
          if (!isActiveSub) setShowSubscriberPopup(true)
        }
      }
      setLoading(false)
    }
    fetchData()
  }, [user])

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey)
    setShowMoreDropdown(false)
    if (genreKey !== 'All') {
      const newVisible = [genreKey, ...visibleGenres.filter(g => g !== genreKey)].slice(0, 3)
      setVisibleGenres(newVisible)
      localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible))
    }
  }

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  const sortedStories = [...filteredStories].sort((a, b) => {
    const aIndex = playlist.findIndex(p => p.id === a.id)
    const bIndex = playlist.findIndex(p => p.id === b.id)
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1
    return 0
  })

  const playlistCreditsUsed = playlist.reduce((sum, item) => sum + getCredits(item.duration_mins), 0)
  const creditsRemaining = userCredits - playlistCreditsUsed
  const playlistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)

  const toggleStorySelection = (story: Story) => {
    const exists = playlist.find(p => p.id === story.id)
    if (exists) {
      setPlaylist(playlist.filter(p => p.id !== story.id))
    } else {
      const storyCost = getCredits(story.duration_mins)
      if (storyCost > creditsRemaining) {
        setShowCreditsPopup(true)
        return
      }
      setPlaylist([...playlist, { id: story.id, title: story.title, duration_mins: story.duration_mins, genre: story.genre, author: story.author || 'Drive Time Tales', cover_url: story.cover_url, credited: false }])
    }
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index - 1], newPlaylist[index]] = [newPlaylist[index], newPlaylist[index - 1]]
    setPlaylist(newPlaylist)
  }

  const moveDown = (index: number) => {
    if (index >= playlist.length - 1) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index], newPlaylist[index + 1]] = [newPlaylist[index + 1], newPlaylist[index]]
    setPlaylist(newPlaylist)
  }

  const savePlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    router.push('/library')
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}hr ${m}min` : `${hrs}hr`
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label : key }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '90px' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b' }}>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: 500 }}><span>←</span><span>Back</span></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '24px' }}>🚛</span><span style={{ fontSize: '24px' }}>🚗</span><span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Drive Time <span style={{ color: '#fb923c' }}>Tales</span></span></div>
          <div onClick={() => router.push('/profile')} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><span style={{ color: 'black', fontSize: '18px', fontWeight: 'bold' }}>{userName?.charAt(0)?.toUpperCase() || '?'}</span></div>
        </div>
        
        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#1e293b' }}>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
            <button onClick={() => setSelectedDuration('All')} style={allBtnStyle(selectedDuration === 'All')}>All</button>
            <button onClick={() => setSelectedDuration('15m')} style={btnStyle(selectedDuration === '15m')}>15m</button>
            <button onClick={() => setSelectedDuration('30m')} style={btnStyle(selectedDuration === '30m')}>30m</button>
            <button onClick={() => setSelectedDuration('1hr')} style={btnStyle(selectedDuration === '1hr')}>1hr</button>
            <span style={{ color: '#475569', display: 'flex', alignItems: 'center', padding: '0 2px' }}>|</span>
            <button onClick={() => setSelectedType('All')} style={btnStyle(selectedType === 'All')}>All</button>
            <button onClick={() => setSelectedType('Series')} style={btnStyle(selectedType === 'Series')}>Series</button>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>)}
            <div style={{ position: 'relative', flex: 1.5 }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
              {showMoreDropdown && <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', marginTop: '4px', minWidth: '140px', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>{ALL_GENRES.map(g => <button key={g.key} onClick={() => selectGenre(g.key)} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}>{g.emoji} {g.label}</button>)}</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: '0.75rem', backgroundColor: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>{playlist.length} stories • {formatTime(playlistTotal)}</span>
          <span style={{ backgroundColor: creditsRemaining >= 0 ? '#22c55e' : '#ef4444', color: creditsRemaining >= 0 ? '#0f172a' : 'white', padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '15px', fontWeight: 700 }}>{creditsRemaining} credits left</span>
        </div>
      </div>

      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}

      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sortedStories.map(story => {
          const isSelected = playlist.some(p => p.id === story.id)
          const storyCost = getCredits(story.duration_mins)
          const playlistIndex = playlist.findIndex(p => p.id === story.id)

          return (
            <div key={story.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isSelected && playlist.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); playlistIndex === 0 ? moveDown(0) : moveUp(playlistIndex) }} style={{ backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>{playlistIndex === 0 ? '▼' : '▲'}</button>
              )}
              {isSelected && <div style={{ backgroundColor: '#f97316', color: 'white', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }}>{playlistIndex + 1}</div>}
              <div onClick={() => toggleStorySelection(story)} style={{ flex: 1, cursor: 'pointer', borderRadius: '10px', border: isSelected ? '2px solid #22c55e' : '2px solid transparent', backgroundColor: isSelected ? '#1e3a2f' : 'transparent' }}>
                <HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={storyCost} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} />
              </div>
              <div onClick={() => toggleStorySelection(story)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: isSelected ? 'none' : '2px solid #475569', backgroundColor: isSelected ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, fontSize: '16px', cursor: 'pointer' }}>{isSelected && '✓'}</div>
            </div>
          )
        })}
      </div>

      {/* GREEN STICKY SAVE BUTTON */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '1rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        <button onClick={savePlaylist} disabled={playlist.length === 0} style={{ backgroundColor: playlist.length > 0 ? '#22c55e' : '#475569', color: playlist.length > 0 ? '#0f172a' : 'white', padding: '1rem', borderRadius: '10px', border: 'none', cursor: playlist.length > 0 ? 'pointer' : 'not-allowed', width: '100%', fontSize: '17px', fontWeight: 'bold' }}>
          💾 Save My Playlist ({playlist.length} stories • {formatTime(playlistTotal)})
        </button>
      </div>

      {showCreditsPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowCreditsPopup(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '340px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '1rem' }}>😔</div>
            <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '0.75rem', textAlign: 'center' }}>Not Enough Credits</h2>
            <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.5 }}>You don't have enough credits to add this story. You have <strong style={{ color: '#f97316' }}>{creditsRemaining} credits</strong> remaining.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowCreditsPopup(false); router.push('/buy-credits') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Get More Credits</button>
              <button onClick={() => setShowCreditsPopup(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Keep Building Playlist</button>
            </div>
          </div>
        </div>
      )}

      {showSubscriberPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => { setShowSubscriberPopup(false); router.push('/library') }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '380px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '1rem' }}>🎧</div>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>Playlists for Subscribers</h2>
            <p style={{ color: '#cbd5e1', fontSize: '15px', marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.6 }}>Playlists are only available for subscribers who have sufficient credits. Subscribe now to create your own driving playlists!</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowSubscriberPopup(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => { setShowSubscriberPopup(false); router.push('/library') }} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPlaylistPage() { return <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}><LibraryPlaylistContent /></Suspense> }
