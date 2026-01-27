'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'
import PlaylistButton from '@/components/PlaylistButton'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

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

interface SeriesGroup {
  id: string
  series_name: string
  genre: string
  author: string
  episode_count: number
  total_duration_mins: number
  cover_url: string | null
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(4)
  const [isUnlimited, setIsUnlimited] = useState(false)
  
  // Filter states - matching LibraryFiltersV2 expected values
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')

  const showLowCreditsButton = !isUnlimited && userCredits <= 3

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, series_total, flag')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      
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

  // Filter stories
  const filteredStories = stories.filter(story => {
    // Duration filter
    if (selectedDuration !== 'All Lengths') {
      if (selectedDuration === '~15 min' && story.duration_mins > 20) return false
      if (selectedDuration === '~30 min' && (story.duration_mins <= 20 || story.duration_mins > 45)) return false
      if (selectedDuration === '~1 hr' && story.duration_mins <= 45) return false
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

  // Group stories by series_name
  const seriesGroups: SeriesGroup[] = []
  if (selectedType === 'Series Only') {
    const seriesMap = new Map<string, SeriesGroup>()
    filteredStories.forEach(story => {
      if (story.series_name) {
        const existing = seriesMap.get(story.series_name)
        if (existing) {
          existing.episode_count += 1
          existing.total_duration_mins += story.duration_mins || 0
        } else {
          seriesMap.set(story.series_name, {
            id: story.series_id || story.id,
            series_name: story.series_name,
            genre: story.genre || '',
            author: story.author || 'Drive Time Tales',
            episode_count: 1,
            total_duration_mins: story.duration_mins || 0,
            cover_url: story.cover_url
          })
        }
      }
    })
    seriesMap.forEach(series => seriesGroups.push(series))
  }

  // Type filter for display
  const displayStories = selectedType === 'Series Only' 
    ? [] 
    : selectedType === 'Singles Only'
      ? filteredStories.filter(s => !s.series_name)
      : filteredStories

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
      
      {/* Use shared LibraryFiltersV2 component */}
      <LibraryFiltersV2
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />
      
      {/* Credits, Playlist, Search row */}
      <div className="px-4 py-2">
        <div className="flex gap-2 items-center">
          <div className="bg-slate-950 px-2 py-1 rounded-md text-center leading-tight border border-slate-700">
            <div className="text-white text-[10px]">Credits</div>
            <div className="text-white text-sm">{isUnlimited ? '∞' : userCredits}</div>
          </div>
          <div className="flex-1"><PlaylistButton /></div>
          <button onClick={() => router.push('/library-search')} className="bg-slate-700 text-white px-3 py-2 rounded-md text-sm font-medium">Search</button>
        </div>
      </div>
      
      <div className="px-3 py-2 flex flex-col gap-2">
        {selectedType === 'Series Only' && (
          <>
            {seriesGroups.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">📺</div>
                <p className="text-white text-base mb-2">No series found</p>
                <p className="text-slate-400 text-sm">Try a different filter</p>
              </div>
            ) : (
              seriesGroups.map(series => (
                <SeriesCard key={series.series_name} id={series.id} series_name={series.series_name} genre={series.genre} author={series.author} episode_count={series.episode_count} total_duration_mins={series.total_duration_mins} cover_url={series.cover_url} />
              ))
            )}
          </>
        )}
        {selectedType !== 'Series Only' && (
          <>
            {displayStories.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">😔</div>
                <p className="text-white text-base mb-2">Sorry {userName}, no stories match your request.</p>
                <p className="text-slate-400 text-sm">Try a different filter</p>
              </div>
            ) : (
              displayStories.map(story => (
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
