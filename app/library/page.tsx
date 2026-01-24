'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import PlaylistButton from '@/components/PlaylistButton'

interface Story { id: string; title: string; genre: string; author: string; duration_mins: number; cover_url: string | null; series_name?: string | null; series_number?: number | null; series_total?: number | null }

const ALL_GENRES = [
  { key: 'mystery', label: 'Mystery', emoji: '🔍' },
  { key: 'thriller', label: 'Thriller', emoji: '😱' },
  { key: 'romance', label: 'Romance', emoji: '💕' },
  { key: 'horror', label: 'Horror', emoji: '👻' },
  { key: 'comedy', label: 'Comedy', emoji: '😂' },
  { key: 'truckers', label: 'Truckers', emoji: '🚛' },
  { key: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { key: 'children', label: 'Children', emoji: '🧒' },
  { key: 'learn', label: 'Learn', emoji: '🧠' }
]

const DEFAULT_VISIBLE = ['mystery', 'romance', 'horror']

function getCredits(duration_mins: number): number { return Math.max(1, Math.floor(duration_mins / 15)) }

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(4)
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)

  const showLowCreditsButton = !isUnlimited && userCredits <= 3

  useEffect(() => {
    const storedGenres = localStorage.getItem('dtt_recent_genres')
    if (storedGenres) { try { const parsed = JSON.parse(storedGenres); if (Array.isArray(parsed) && parsed.length >= 3) setVisibleGenres(parsed.slice(0, 3)) } catch (e) {} }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase.from('stories').select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total').not('cover_url', 'is', null).order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('first_name, display_name, credits').eq('id', user.id).single()
        if (userData) { setUserName(userData.first_name || userData.display_name || 'Friend'); setIsUnlimited(userData.credits >= 9999); setUserCredits(userData.credits || 0) }
      }
      if (user?.id) setLoading(false)
    }
    fetchData()
  }, [user])

  const selectGenre = (genreKey: string) => {
    setSelectedGenre(genreKey); setShowMoreDropdown(false)
    if (genreKey !== 'All') { const newVisible = [genreKey, ...visibleGenres.filter(g => g !== genreKey)].slice(0, 3); setVisibleGenres(newVisible); localStorage.setItem('dtt_recent_genres', JSON.stringify(newVisible)) }
  }

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') { if (selectedDuration === '15m' && story.duration_mins > 15) return false; if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false; if (selectedDuration === '1hr' && story.duration_mins <= 30) return false }
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  const btnStyle = (active: boolean): React.CSSProperties => ({ backgroundColor: active ? '#f97316' : '#334155', color: 'white', padding: '0.3rem 0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', flex: 1, textAlign: 'center' })
  const allBtnStyle = (active: boolean): React.CSSProperties => ({ ...btnStyle(active), flex: 'none', width: '42px' })
  const getGenreLabel = (key: string) => { const genre = ALL_GENRES.find(g => g.key === key); return genre ? genre.emoji + genre.label.substring(0, 4) : key }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: showLowCreditsButton ? '55px' : '0' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/home')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><span style={{ fontSize: '18px' }}>🚗</span><span style={{ fontSize: '18px' }}>🚙</span><span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span><span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span></div>
          <div onClick={() => router.push('/account')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span>}</div>
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
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', position: 'relative' }}>
            <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
            {visibleGenres.map(g => <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>)}
            <div style={{ position: 'relative', flex: 1.5 }}>
              <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
              {showMoreDropdown && <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', marginTop: '4px', minWidth: '140px', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>{ALL_GENRES.map(g => <button key={g.key} onClick={() => selectGenre(g.key)} style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent', color: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}>{g.emoji} {g.label}</button>)}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '6px', textAlign: 'center', lineHeight: 1.2 }}>
              <div style={{ color: 'white', fontSize: '10px', fontWeight: 'normal' }}>Credits</div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 'normal' }}>{isUnlimited ? '∞' : userCredits}</div>
            </div>
            <div style={{ flex: 1 }}><PlaylistButton /></div>
            <button onClick={() => router.push('/library-search')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Search</button>
          </div>
        </div>
      </div>
      {showMoreDropdown && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setShowMoreDropdown(false)} />}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.length === 0 ? <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center' }}><div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>😔</div><p style={{ color: 'white', fontSize: '16px', marginBottom: '0.5rem' }}>Sorry {userName}, we have no stories to match your request.</p><p style={{ color: '#94a3b8', fontSize: '14px' }}>But we will request this category to our writers!</p></div> : filteredStories.map(story => <div key={story.id} onClick={() => router.push('/player/' + story.id)} style={{ cursor: 'pointer' }}><HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={getCredits(story.duration_mins)} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} /></div>)}
      </div>
      {showLowCreditsButton && <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}><button onClick={() => router.push('/buy-credits')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', width: '100%', fontSize: '15px', fontWeight: 'bold' }}>You're Low On Credits - Click Here to Get More</button></div>}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPage() { return <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}><LibraryContent /></Suspense> }
