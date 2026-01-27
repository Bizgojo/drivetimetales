'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  description?: string | null
  credits?: number
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (remaining === 0) return `${hours} hr`
  return `${hours} hr ${remaining} min`
}

function LibraryPlaylistContent() {
  const router = useRouter()
  const { user } = useAuth()
  
  const [stories, setStories] = useState<Story[]>([])
  const [playlist, setPlaylist] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  
  // Filter states - matching LibraryFiltersV2 expected values
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')
  
  const [userCredits, setUserCredits] = useState(0)

  // Load stories and existing playlist
  useEffect(() => {
    async function loadData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('*')
        .order('title')
      
      if (storiesData) setStories(storiesData)
      
      const savedPlaylist = localStorage.getItem('dtt_playlist')
      if (savedPlaylist) {
        try {
          setPlaylist(JSON.parse(savedPlaylist))
        } catch (e) {
          console.error('Failed to parse playlist:', e)
        }
      }
      
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single()
        if (userData) setUserCredits(userData.credits || 0)
      }
      
      setLoading(false)
    }
    loadData()
  }, [user])

  // Calculate playlist duration
  const playlistDuration = playlist.reduce((sum, s) => sum + (s.duration_mins || 0), 0)
  const playlistCredits = playlist.reduce((sum, s) => sum + (s.credits || Math.max(1, Math.floor(s.duration_mins / 15))), 0)

  const addToPlaylist = (story: Story) => {
    if (!playlist.find(s => s.id === story.id)) {
      const newPlaylist = [...playlist, story]
      setPlaylist(newPlaylist)
      localStorage.setItem('dtt_playlist', JSON.stringify(newPlaylist))
    }
    setSelectedStory(null)
  }

  const removeFromPlaylist = (storyId: string) => {
    const newPlaylist = playlist.filter(s => s.id !== storyId)
    setPlaylist(newPlaylist)
    localStorage.setItem('dtt_playlist', JSON.stringify(newPlaylist))
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index - 1], newPlaylist[index]] = [newPlaylist[index], newPlaylist[index - 1]]
    setPlaylist(newPlaylist)
    localStorage.setItem('dtt_playlist', JSON.stringify(newPlaylist))
  }

  const moveDown = (index: number) => {
    if (index === playlist.length - 1) return
    const newPlaylist = [...playlist]
    ;[newPlaylist[index], newPlaylist[index + 1]] = [newPlaylist[index + 1], newPlaylist[index]]
    setPlaylist(newPlaylist)
    localStorage.setItem('dtt_playlist', JSON.stringify(newPlaylist))
  }

  const beginPlaylist = async () => {
    if (user) {
      for (const story of playlist) {
        await supabase
          .from('user_library')
          .upsert({
            user_id: user.id,
            story_id: story.id,
            progress: 0,
            completed: false,
            last_played: new Date().toISOString()
          }, { onConflict: 'user_id,story_id' })
      }
    }
    
    localStorage.setItem('dtt_playlist_index', '0')
    localStorage.setItem('dtt_playlist_autoplay', 'true')
    router.push('/player/playlist')
  }

  const saveTilLater = () => {
    router.push('/home')
  }

  // Filter stories using LibraryFiltersV2 values
  const filteredStories = stories.filter(story => {
    if (playlist.find(s => s.id === story.id)) return false
    
    // Type filter
    if (selectedType === 'Singles Only' && story.series_name) return false
    if (selectedType === 'Series Only' && !story.series_name) return false
    
    // Duration filter
    if (selectedDuration !== 'All Lengths') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 45)) return false
      if (selectedDuration === '~1 hr' && mins < 45) return false
    }
    
    // Genre filter
    if (selectedGenre !== 'All Categories') {
      const genreLower = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !genreLower.includes('mystery')) return false
      if (selectedGenre === 'Romance' && !genreLower.includes('romance')) return false
      if (selectedGenre === 'Sci-Fi' && !genreLower.includes('sci-fi') && !genreLower.includes('scifi')) return false
      if (selectedGenre === 'Horror' && !genreLower.includes('horror')) return false
      if (selectedGenre === 'Comedy' && !genreLower.includes('comedy')) return false
      if (selectedGenre === 'Learn' && !genreLower.includes('learn') && !genreLower.includes('educational')) return false
      if (selectedGenre === 'Thriller' && !genreLower.includes('thriller')) return false
      if (selectedGenre === 'Truckers' && !genreLower.includes('trucker')) return false
      if (selectedGenre === 'Children' && !genreLower.includes('child') && !genreLower.includes('kids')) return false
    }
    
    return true
  })

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <StickyHeaderFull />
      
      {/* Use the shared LibraryFiltersV2 component */}
      <LibraryFiltersV2
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />
      
      <main style={{ flex: 1, padding: '12px 16px', paddingBottom: '140px' }}>
        {/* Credits and Duration */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px' }}>Credits <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{playlistCredits}</span> of {userCredits}</span>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{formatDuration(playlistDuration)} ({playlist.length} {playlist.length === 1 ? 'story' : 'stories'})</span>
        </div>

        {/* Playlist */}
        {playlist.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {playlist.map((story, index) => (
              <div
                key={story.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#1e3a2f',
                  border: '2px solid #22c55e',
                  borderRadius: '12px',
                  padding: '8px',
                  marginBottom: '8px'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#f97316',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: 'black',
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>
                
                <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</p>
                  <p style={{ fontSize: '12px', color: '#94a3b8' }}>{story.genre}</p>
                  <p style={{ fontSize: '12px', color: '#94a3b8' }}>by {story.author}</p>
                  <p style={{ fontSize: '12px', color: 'white' }}>
                    {story.duration_mins} min • {story.credits || Math.max(1, Math.floor(story.duration_mins / 15))} credit{(story.credits || 1) !== 1 ? 's' : ''}
                    {story.series_name && <span style={{ color: '#f97316' }}> • Part {story.series_number}/{story.series_total}</span>}
                  </p>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button onClick={() => moveUp(index)} style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#334155', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>▲</button>
                  <button onClick={() => moveDown(index)} style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#334155', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>▼</button>
                </div>
                <button onClick={() => removeFromPlaylist(story.id)} style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#dc2626', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Available Stories */}
        <div>
          {filteredStories.map(story => (
            <div
              key={story.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                padding: '8px',
                marginBottom: '8px'
              }}
            >
              <button
                onClick={() => addToPlaylist(story)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#334155',
                  border: '2px solid #475569',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                +
              </button>
              
              <div
                onClick={() => setSelectedStory(story)}
                style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
              >
                <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              
              <div onClick={() => setSelectedStory(story)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <p style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>{story.genre}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>by {story.author}</p>
                <p style={{ fontSize: '12px', color: 'white' }}>
                  {story.duration_mins} min • {story.credits || Math.max(1, Math.floor(story.duration_mins / 15))} credit{(story.credits || 1) !== 1 ? 's' : ''}
                  {story.series_name && <span style={{ color: '#f97316' }}> • Part {story.series_number}/{story.series_total}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bottom Buttons */}
      {playlist.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px',
          backgroundColor: '#020617',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={beginPlaylist}
            style={{
              flex: 1,
              padding: '16px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: '12px',
              color: 'black',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            🚗 Begin Playlist
          </button>
          <button
            onClick={saveTilLater}
            style={{
              flex: 1,
              padding: '16px',
              backgroundColor: '#334155',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Save Til Later
          </button>
        </div>
      )}

      {/* Description Modal */}
      {selectedStory && (
        <div
          onClick={() => setSelectedStory(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              padding: '20px',
              maxWidth: '360px',
              width: '100%'
            }}
          >
            <div style={{ width: '160px', height: '160px', margin: '0 auto 16px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 0 20px rgba(255,255,255,0.2)' }}>
              <img src={selectedStory.cover_url || '/images/default-cover.png'} alt={selectedStory.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>{selectedStory.title}</h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginBottom: '12px' }}>
              {selectedStory.genre} • {selectedStory.author} • {selectedStory.duration_mins} min • {selectedStory.credits || Math.max(1, Math.floor(selectedStory.duration_mins / 15))} credit
              {selectedStory.series_name && <><br /><span style={{ color: '#f97316' }}>Part {selectedStory.series_number} of {selectedStory.series_total}</span></>}
            </p>
            <p style={{ fontSize: '15px', color: 'white', textAlign: 'center', marginBottom: '20px', lineHeight: '1.5' }}>
              {selectedStory.description || 'A gripping tale of mystery and suspense that will keep you on the edge of your seat during your commute.'}
            </p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => addToPlaylist(selectedStory)}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: '#22c55e',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'black',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                Add to Playlist
              </button>
              <button
                onClick={() => setSelectedStory(null)}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <LibraryPlaylistContent />
    </Suspense>
  )
}
