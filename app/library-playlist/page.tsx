'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'
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

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function getGenreEmoji(genre: string): string {
  const g = genre?.toLowerCase() || ''
  if (g.includes('mystery') || g.includes('thriller')) return '🔍'
  if (g.includes('romance')) return '💕'
  if (g.includes('sci-fi') || g.includes('scifi')) return '🚀'
  if (g.includes('horror')) return '👻'
  if (g.includes('comedy')) return '😂'
  if (g.includes('learn') || g.includes('education')) return '🧠'
  return '📖'
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(10)
  const [isSubscriber, setIsSubscriber] = useState(true)
  const [userName, setUserName] = useState('Friend')
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('Both')
  const [selectedGenre, setSelectedGenre] = useState('All')
  
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSelectingStories, setIsSelectingStories] = useState(false)
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_user_credits')
    if (storedCredits !== null) {
      setUserCredits(parseInt(storedCredits, 10))
    }
    const storedName = localStorage.getItem('dtt_user_name')
    if (storedName) setUserName(storedName)
    const storedSubscriber = localStorage.getItem('dtt_is_subscriber')
    setIsSubscriber(storedSubscriber === 'true')
    
    const savedPlaylist = localStorage.getItem('dtt_playlist')
    if (savedPlaylist) setPlaylist(JSON.parse(savedPlaylist))
    const savedIndex = localStorage.getItem('dtt_playlist_index')
    if (savedIndex) setCurrentIndex(parseInt(savedIndex, 10))
    const savedProgress = localStorage.getItem('dtt_playlist_progress')
    if (savedProgress) setCurrentProgress(parseInt(savedProgress, 10))
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData, error } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      
      if (error) {
        console.error('Stories query error:', error)
      }
      if (storiesData) setStories(storiesData)
      setLoading(false)
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!isPlaying || playlist.length === 0) return
    const interval = setInterval(() => {
      setCurrentProgress(prev => {
        const currentStory = playlist[currentIndex]
        if (!currentStory) return prev
        const storyDurationSecs = currentStory.duration_mins * 60
        const tenPercent = storyDurationSecs * 0.1
        
        if (prev >= tenPercent && !currentStory.credited) {
          const storyCost = getCredits(currentStory.duration_mins)
          setUserCredits(credits => {
            const newCredits = credits - storyCost
            localStorage.setItem('dtt_user_credits', String(newCredits))
            return newCredits
          })
          setPlaylist(pl => {
            const updated = [...pl]
            updated[currentIndex] = { ...updated[currentIndex], credited: true }
            localStorage.setItem('dtt_playlist', JSON.stringify(updated))
            return updated
          })
        }
        
        if (prev >= storyDurationSecs) {
          if (currentIndex < playlist.length - 1) {
            const nextStory = playlist[currentIndex + 1]
            console.log(`Next up: ${nextStory.title}, ${nextStory.genre}, by ${nextStory.author}, ${nextStory.duration_mins} minutes`)
            setCurrentIndex(currentIndex + 1)
            localStorage.setItem('dtt_playlist_index', String(currentIndex + 1))
            localStorage.setItem('dtt_playlist_progress', '0')
            return 0
          } else {
            console.log(`${userName}, your playlist has ended. Hope you enjoyed it!`)
            setIsPlaying(false)
            localStorage.removeItem('dtt_playlist')
            localStorage.removeItem('dtt_playlist_index')
            localStorage.removeItem('dtt_playlist_progress')
            setPlaylist([])
            setCurrentIndex(0)
            return 0
          }
        }
        localStorage.setItem('dtt_playlist_progress', String(prev + 1))
        return prev + 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, currentIndex, playlist, userName])

  const playlistCreditsUsed = playlist.reduce((sum, item) => sum + getCredits(item.duration_mins), 0)
  const creditsRemaining = userCredits - playlistCreditsUsed

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      const mins = story.duration_mins
      if (selectedDuration === '15m' && mins > 20) return false
      if (selectedDuration === '30m' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '1hr' && mins < 40) return false
    }
    if (selectedGenre !== 'All') {
      if (!story.genre?.toLowerCase().includes(selectedGenre.toLowerCase())) return false
    }
    if (selectedType === 'Singles') {
      if (story.series_number && story.series_total) return false
    }
    if (selectedType === 'Series') {
      if (!story.series_number || !story.series_total) return false
    }
    return true
  })

  const sortedStories = isSelectingStories 
    ? [...filteredStories].sort((a, b) => {
        const aIndex = playlist.findIndex(p => p.id === a.id)
        const bIndex = playlist.findIndex(p => p.id === b.id)
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
        if (aIndex >= 0) return -1
        if (bIndex >= 0) return 1
        return 0
      })
    : filteredStories

  const playlistTotal = playlist.reduce((sum, item) => sum + item.duration_mins, 0)
  const playedMins = playlist.slice(0, currentIndex).reduce((sum, item) => sum + item.duration_mins, 0) + Math.floor(currentProgress / 60)
  const remainingMins = playlistTotal - playedMins

  const handleCreatePlaylist = () => {
    if (!isSubscriber) {
      setShowSubscriberPopup(true)
      return
    }
    setIsSelectingStories(true)
    setPlaylist([])
  }

  const toggleStorySelection = (story: Story) => {
    const exists = playlist.find(p => p.id === story.id)
    if (exists) {
      setPlaylist(playlist.filter(p => p.id !== story.id))
    } else {
      const storyCost = getCredits(story.duration_mins)
      if (storyCost > creditsRemaining) return
      setPlaylist([...playlist, {
        id: story.id,
        title: story.title,
        duration_mins: story.duration_mins,
        genre: story.genre,
        author: story.author || 'Drive Time Tales',
        cover_url: story.cover_url,
        credited: false
      }])
    }
  }

  const savePlaylist = () => {
    localStorage.setItem('dtt_playlist', JSON.stringify(playlist))
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_progress', '0')
    setCurrentIndex(0)
    setCurrentProgress(0)
    setIsSelectingStories(false)
  }

  const handlePlay = () => setIsPlaying(true)
  const handlePause = () => setIsPlaying(false)
  const handleContinue = () => {
    setCurrentProgress(prev => Math.max(0, prev - 5))
    setIsPlaying(true)
  }

  const handleSkip = () => {
    if (currentIndex < playlist.length - 1) {
      const nextStory = playlist[currentIndex + 1]
      console.log(`Next up: ${nextStory.title}, ${nextStory.genre}, by ${nextStory.author}, ${nextStory.duration_mins} minutes`)
      setCurrentIndex(currentIndex + 1)
      setCurrentProgress(0)
      localStorage.setItem('dtt_playlist_index', String(currentIndex + 1))
      localStorage.setItem('dtt_playlist_progress', '0')
    } else {
      console.log(`${userName}, your playlist has ended. Hope you enjoyed it!`)
      setIsPlaying(false)
      localStorage.removeItem('dtt_playlist')
      localStorage.removeItem('dtt_playlist_index')
      localStorage.removeItem('dtt_playlist_progress')
      setPlaylist([])
      setCurrentIndex(0)
      setCurrentProgress(0)
    }
  }

  const handleLongPressStart = (index: number) => {
    longPressTimer.current = setTimeout(() => setDraggedIndex(index), 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newPlaylist = [...playlist]
      const [removed] = newPlaylist.splice(draggedIndex, 1)
      newPlaylist.splice(dragOverIndex, 0, removed)
      setPlaylist(newPlaylist)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hrs = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${hrs}hr ${m}min` : `${hrs}hr`
  }

  const formatSeconds = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}:${s.toString().padStart(2, '0')}`
  }

  const btnStyle = (isActive: boolean): React.CSSProperties => ({
    backgroundColor: isActive ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.5rem 0.6rem',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  })

  const getPlayStatus = (storyId: string): 'played' | 'continue' | null => {
    const playlistIdx = playlist.findIndex(p => p.id === storyId)
    if (playlistIdx < 0) return null
    if (playlistIdx < currentIndex) return 'played'
    if (playlistIdx === currentIndex && (currentIndex > 0 || currentProgress > 0)) return 'continue'
    return null
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  // PLAYING STATE
  if (isPlaying && playlist.length > 0) {
    const currentStory = playlist[currentIndex]
    const storyDurationSecs = currentStory ? currentStory.duration_mins * 60 : 0
    const progressPercent = storyDurationSecs > 0 ? (currentProgress / storyDurationSecs) * 100 : 0

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
        <div style={{ backgroundColor: '#1e293b', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', backgroundColor: '#22c55e', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
            <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>Now Playing</span>
          </div>
          <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>{formatTime(remainingMins)} remaining</div>
          <button onClick={handlePause} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', minHeight: '40px' }}>
            ⏸️ Pause
          </button>
        </div>

        <div style={{ padding: '1rem' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ width: '120px', height: '120px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#334155', flexShrink: 0 }}>
                {currentStory?.cover_url ? (
                  <img src={currentStory.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{getGenreEmoji(currentStory?.genre || '')}</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{currentStory?.title}</div>
                <div style={{ color: 'white', fontSize: '16px' }}>by {currentStory?.author}</div>
                <div style={{ color: 'white', fontSize: '16px' }}>{currentStory?.genre} • Story {currentIndex + 1} of {playlist.length}</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#334155', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
              <div style={{ backgroundColor: '#f97316', height: '100%', width: `${progressPercent}%`, borderRadius: '4px', transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontSize: '16px', fontWeight: 500 }}>
              <span>{formatSeconds(currentProgress)}</span>
              <span>-{formatSeconds(storyDurationSecs - currentProgress)}</span>
            </div>
          </div>

          <button onClick={handleSkip} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '1rem', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: '100%', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            ⏭️ Skip to Next Story
          </button>

          {currentIndex < playlist.length - 1 && (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ color: 'white', fontSize: '16px', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>Up Next</div>
              {playlist.slice(currentIndex + 1, currentIndex + 4).map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < Math.min(2, playlist.length - currentIndex - 2) ? '1px solid #334155' : 'none' }}>
                  <span style={{ color: 'white', fontSize: '16px', width: '24px' }}>{currentIndex + idx + 2}</span>
                  <div style={{ width: '50px', height: '50px', backgroundColor: '#334155', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                    {item.cover_url ? <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{getGenreEmoji(item.genre)}</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: 500 }}>{item.title}</div>
                    <div style={{ color: 'white', fontSize: '14px' }}>{item.genre} • {item.duration_mins} min</div>
                  </div>
                </div>
              ))}
              {playlist.length - currentIndex - 1 > 3 && <div style={{ color: 'white', fontSize: '14px', textAlign: 'center', marginTop: '0.5rem' }}>+ {playlist.length - currentIndex - 4} more</div>}
            </div>
          )}
        </div>
        <style jsx global>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // SELECTING STORIES STATE
  if (isSelectingStories) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '80px' }}>
        <div style={{ backgroundColor: '#1e293b', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => { setIsSelectingStories(false); setPlaylist([]) }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>←</button>
          <span style={{ color: 'white', fontWeight: 600, fontSize: '16px' }}>Select stories for your playlist</span>
        </div>

        <div style={{ padding: '0.75rem' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['All', '15m', '30m', '1hr'].map(d => <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>)}
              <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
              {['Both', 'Singles', 'Series'].map(t => <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>)}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
                <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                  {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{playlist.length} stories • {formatTime(playlistTotal)}</div>
            <div style={{ backgroundColor: creditsRemaining > 0 ? '#22c55e' : '#ef4444', color: '#0f172a', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>{creditsRemaining} credits left</div>
          </div>

          {sortedStories.map(story => {
            const isSelected = playlist.some(p => p.id === story.id)
            const storyCost = getCredits(story.duration_mins)
            const canAfford = storyCost <= creditsRemaining || isSelected
            const playlistIndex = playlist.findIndex(p => p.id === story.id)
            const isDragging = draggedIndex === playlistIndex
            const isDragOver = dragOverIndex === playlistIndex
            
            return (
              <div 
                key={story.id}
                onClick={() => canAfford && toggleStorySelection(story)}
                onTouchStart={() => isSelected && handleLongPressStart(playlistIndex)}
                onTouchEnd={handleLongPressEnd}
                onMouseDown={() => isSelected && handleLongPressStart(playlistIndex)}
                onMouseUp={handleLongPressEnd}
                onMouseEnter={() => draggedIndex !== null && setDragOverIndex(playlistIndex)}
                style={{ 
                  backgroundColor: isSelected ? '#1e3a2f' : '#1e293b',
                  border: isDragOver ? '2px dashed #f97316' : isSelected ? '2px solid #22c55e' : '2px solid transparent',
                  borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  cursor: canAfford ? 'pointer' : 'not-allowed', opacity: canAfford ? 1 : 0.5,
                  transform: isDragging ? 'scale(1.02)' : 'scale(1)', boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.4)' : 'none', transition: 'transform 0.15s, box-shadow 0.15s'
                }}
              >
                {isSelected && <div style={{ color: 'white', fontSize: '16px', cursor: 'grab' }}>☰</div>}
                {isSelected && <div style={{ backgroundColor: '#f97316', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>{playlistIndex + 1}</div>}
                <div style={{ width: '60px', height: '60px', backgroundColor: '#334155', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0, overflow: 'hidden' }}>
                  {story.cover_url ? <img src={story.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getGenreEmoji(story.genre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {story.title}
                    {story.series_number && story.series_total && <span style={{ color: '#3b82f6', fontSize: '12px', marginLeft: '6px' }}>[{story.series_number}/{story.series_total}]</span>}
                  </div>
                  <div style={{ color: 'white', fontSize: '14px' }}>{story.genre} • {story.duration_mins} min • {storyCost} {storyCost === 1 ? 'credit' : 'credits'}</div>
                </div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: isSelected ? 'none' : '2px solid #475569', backgroundColor: isSelected ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>{isSelected && '✓'}</div>
              </div>
            )
          })}
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.75rem', borderTop: '1px solid #334155' }}>
          <button onClick={savePlaylist} disabled={playlist.length === 0} style={{ backgroundColor: playlist.length > 0 ? '#22c55e' : '#475569', color: playlist.length > 0 ? '#0f172a' : 'white', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', border: 'none', cursor: playlist.length > 0 ? 'pointer' : 'not-allowed', width: '100%' }}>
            💾 Save My Playlist ({playlist.length} stories • {formatTime(playlistTotal)})
          </button>
        </div>
      </div>
    )
  }

  // MAIN LIBRARY STATE - Using HorizontalStoryCard
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <WL01StickyLogo credits={userCredits} />
      
      <div style={{ padding: '1rem 0.75rem 0.75rem' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>)}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
            {['Both', 'Singles', 'Series'].map(t => <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>)}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
              <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
              </button>
            ))}
          </div>

          {playlist.length === 0 ? (
            <button onClick={handleCreatePlaylist} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%', marginTop: '0.35rem' }}>
              ➕ Create a Playlist
            </button>
          ) : (
            <div style={{ marginTop: '0.35rem' }}>
              <div style={{ backgroundColor: '#334155', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>Your Playlist</span>
                  <span style={{ color: 'white', fontSize: '13px' }}>{playlist.length} stories • {formatTime(remainingMins)} left</span>
                </div>
                <div style={{ backgroundColor: '#1e293b', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f97316', height: '100%', width: `${playlistTotal > 0 ? ((playlistTotal - remainingMins) / playlistTotal) * 100 : 0}%`, borderRadius: '3px' }} />
                </div>
              </div>
              {currentIndex > 0 || currentProgress > 0 ? (
                <button onClick={handleContinue} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%' }}>
                  ▶️ Continue Playlist ({formatTime(remainingMins)} left)
                </button>
              ) : (
                <button onClick={handlePlay} style={{ backgroundColor: '#22c55e', color: '#0f172a', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'pointer', width: '100%' }}>
                  ▶️ Play Your Playlist ({formatTime(playlistTotal)})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.map(story => (
          <HorizontalStoryCard
            key={story.id}
            id={story.id}
            title={story.title}
            genre={story.genre}
            author={story.author || 'Drive Time Tales'}
            duration_mins={story.duration_mins}
            credits={getCredits(story.duration_mins)}
            cover_url={story.cover_url}
            series_number={story.series_number}
            series_total={story.series_total}
            play_status={getPlayStatus(story.id)}
          />
        ))}
      </div>

      {showSubscriberPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowSubscriberPopup(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>Playlists for Subscribers</h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1.5rem' }}>Playlists are only available for subscribers who have sufficient credits. Subscribe now to create your own driving playlists!</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowSubscriberPopup(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => setShowSubscriberPopup(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
