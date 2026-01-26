'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'
import PlaylistButton from '@/components/PlaylistButton'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_id?: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
  flag?: string | null
}

interface Series {
  id: string
  title: string
  description: string
  author: string
  category: string
  cover_image: string | null
  total_episodes: number
}

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

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(4)
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [visibleGenres, setVisibleGenres] = useState<string[]>(DEFAULT_VISIBLE)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)

  const showLowCreditsButton = !isUnlimited && userCredits <= 3

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
      // Fetch stories
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, series_total, flag')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      
      // Fetch series from series table
      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title, description, author, category, cover_image, total_episodes')
        .order('created_at', { ascending: false })
      if (seriesData) setSeriesList(seriesData)
      
      if (user?.id) {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, display_name, credits')
          .eq('id', user.id)
          .single()
        if (userData) {
          setUserName(userData.first_name || userData.display_name || 'Friend')
          setIsUnlimited(userData.credits >= 9999)
          setUserCredits(userData.credits || 0)
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

  // Filter stories
  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedGenre !== 'All' && !(story.genre?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  // Filter series by genre
  const filteredSeries = seriesList.filter(series => {
    if (selectedGenre !== 'All' && !(series.category?.toLowerCase() || '').includes(selectedGenre.toLowerCase())) return false
    return true
  })

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.3rem 0',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center'
  })

  const allBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle(active),
    flex: 'none',
    width: '42px'
  })

  const getGenreLabel = (key: string) => {
    const genre = ALL_GENRES.find(g => g.key === key)
    return genre ? genre.emoji + genre.label.substring(0, 4) : key
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950" style={{ paddingBottom: showLowCreditsButton ? '55px' : '0' }}>
      <StickyHeaderFull />
      <div className="sticky top-[60px] z-40 bg-slate-800 px-3 py-2">
        <div className="flex gap-1.5 mb-1.5">
          <button onClick={() => setSelectedDuration('All')} style={allBtnStyle(selectedDuration === 'All')}>All</button>
          <button onClick={() => setSelectedDuration('15m')} style={btnStyle(selectedDuration === '15m')}>15m</button>
          <button onClick={() => setSelectedDuration('30m')} style={btnStyle(selectedDuration === '30m')}>30m</button>
          <button onClick={() => setSelectedDuration('1hr')} style={btnStyle(selectedDuration === '1hr')}>1hr</button>
          <span className="text-slate-600 flex items-center px-0.5">|</span>
          <button onClick={() => setSelectedType('All')} style={btnStyle(selectedType === 'All')}>All</button>
          <button onClick={() => setSelectedType('Series')} style={btnStyle(selectedType === 'Series')}>Series</button>
        </div>
        <div className="flex gap-1.5 mb-1.5 relative">
          <button onClick={() => selectGenre('All')} style={allBtnStyle(selectedGenre === 'All')}>All</button>
          {visibleGenres.map(g => (
            <button key={g} onClick={() => selectGenre(g)} style={btnStyle(selectedGenre === g)}>{getGenreLabel(g)}</button>
          ))}
          <div className="relative flex-[1.5]">
            <button onClick={() => setShowMoreDropdown(!showMoreDropdown)} style={{ ...btnStyle(showMoreDropdown), width: '100%' }}>More ▼</button>
            {showMoreDropdown && (
              <div className="absolute top-full right-0 bg-slate-800 border border-slate-600 rounded-lg mt-1 min-w-[140px] z-60 shadow-lg">
                {ALL_GENRES.map(g => (
                  <button key={g.key} onClick={() => selectGenre(g.key)} className="block w-full px-3 py-2 text-left text-white text-sm hover:bg-slate-700" style={{ backgroundColor: selectedGenre === g.key ? '#f97316' : 'transparent' }}>{g.emoji} {g.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="bg-slate-950 px-2 py-1 rounded-md text-center leading-tight">
            <div className="text-white text-[10px]">Credits</div>
            <div className="text-white text-sm">{isUnlimited ? '∞' : userCredits}</div>
          </div>
          <div className="flex-1"><PlaylistButton /></div>
          <button onClick={() => router.push('/library-search')} className="bg-slate-700 text-white px-3 py-2 rounded-md text-sm font-medium">Search</button>
        </div>
      </div>
      {showMoreDropdown && <div className="fixed inset-0 z-30" onClick={() => setShowMoreDropdown(false)} />}
      <div className="px-3 py-2 flex flex-col gap-2">
        {selectedType === 'Series' && (
          <>
            {filteredSeries.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">📺</div>
                <p className="text-white text-base mb-2">No series found</p>
                <p className="text-slate-400 text-sm">Try a different filter</p>
              </div>
            ) : (
              filteredSeries.map(series => (
                <SeriesCard 
                  key={series.id} 
                  id={series.id} 
                  series_name={series.title} 
                  genre={series.category} 
                  author={series.author} 
                  episode_count={series.total_episodes || 0} 
                  total_duration_mins={series.total_episodes * 15} 
                  cover_url={series.cover_image} 
                />
              ))
            )}
          </>
        )}
        {selectedType === 'All' && (
          <>
            {filteredStories.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">😔</div>
                <p className="text-white text-base mb-2">Sorry {userName}, no stories match your request.</p>
                <p className="text-slate-400 text-sm">Try a different filter</p>
              </div>
            ) : (
              filteredStories.map(story => (
                <div key={story.id} onClick={() => router.push('/player/' + story.id)} className="cursor-pointer">
                  <HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={getCredits(story.duration_mins)} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} flag={story.flag as 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null} />
                </div>
              ))
            )}
          </>
        )}
      </div>
      {showLowCreditsButton && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950 px-3 py-2 border-t border-slate-700 z-50">
          <button onClick={() => router.push('/buy-credits')} className="w-full bg-orange-500 text-white py-2 rounded-lg text-base font-bold">Low On Credits - Get More</button>
        </div>
      )}
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LibraryContent />
    </Suspense>
  )
}
