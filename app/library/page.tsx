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
  is_free?: boolean
  created_at?: string
}

interface UserLibraryEntry {
  story_id: string
  progress?: number
  completed?: boolean
  reserved?: boolean
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

/**
 * Compute flags for a story based on FLAG_RULES.md v1.1
 */
function computeStoryFlags(story: Story, userLibraryEntry?: UserLibraryEntry | null): string[] {
  const flags: string[] = []
  
  // Determine user's relationship to story
  const isOwned = !!userLibraryEntry
  const isReserved = userLibraryEntry?.reserved === true
  const isContinue = (userLibraryEntry?.progress ?? 0) > 0 && !userLibraryEntry?.completed
  
  // User status flags (mutually exclusive)
  // Continue implies Owned, so don't show both
  if (isContinue) {
    flags.push('continue')
  } else if (isReserved) {
    flags.push('reserved')
  } else if (isOwned) {
    flags.push('owned')
  }
  
  const userHasStory = isContinue || isOwned || isReserved
  
  // Series flag
  if (story.series_number) {
    flags.push('series')
  }
  
  // Content flags (only if user doesn't have story)
  if (!userHasStory) {
    // TODO: Add trending logic when implemented
    // if (story.is_trending) flags.push('trending')
    
    // NEW: stories added within last 25 days
    if (story.created_at) {
      const storyDate = new Date(story.created_at)
      const now = new Date()
      const daysDiff = (now.getTime() - storyDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff <= 25 && !isReserved) {
        flags.push('new')
      }
    }
    
    // FREE
    if (story.is_free) {
      flags.push('free')
    }
  }
  
  // Editorial flags (mutually exclusive)
  if (story.flag === 'editors-pick') {
    flags.push('editors-pick')
  } else if (story.flag === 'listeners-pick') {
    flags.push('listeners-pick')
  }
  
  // Sort by priority and return top 3
  const priorityOrder = [
    'continue', 'reserved', 'owned', 'series', 
    'trending', 'new', 'free', 'editors-pick', 'listeners-pick'
  ]
  
  flags.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
  
  return flags.slice(0, 3)
}

function LibraryContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<UserLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(4)
  
  // Filter states - matching LibraryFiltersV2 expected values
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')

  const showLowCreditsButton = userCredits <= 3

  useEffect(() => {
    async function fetchData() {
      // Fetch stories with is_free and created_at for flag calculation
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, series_total, flag, is_free, created_at')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      
      if (user?.id) {
        // Fetch user data
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, display_name, credits')
          .eq('id', user.id)
          .single()
        if (userData) {
          setUserName(userData.first_name || userData.display_name || 'Friend')
          setUserCredits(userData.credits || 0)
        }
        
        // Fetch user library for flag calculation
        const { data: libraryData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed, reserved')
          .eq('user_id', user.id)
        if (libraryData) setUserLibrary(libraryData)
      }
      setLoading(false)
    }
    fetchData()
  }, [user])

  // Create lookup for user library
  const libraryLookup = new Map<string, UserLibraryEntry>()
  userLibrary.forEach(entry => {
    libraryLookup.set(entry.story_id, entry)
  })

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
    <div className="min-h-screen bg-slate-950" style={{ paddingBottom: '55px' }}>
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
      
      <div className="px-3 py-2 flex flex-col gap-2">
        {selectedType === 'Series Only' && (
          <>
            {seriesGroups.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">📺</div>
                <p className="text-white text-base mb-2">No series found</p>
                <p className="text-white text-sm" style={{ opacity: 0.7 }}>Try a different filter</p>
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
                <p className="text-white text-sm" style={{ opacity: 0.7 }}>Try a different filter</p>
              </div>
            ) : (
              displayStories.map(story => {
                const libraryEntry = libraryLookup.get(story.id)
                const flags = computeStoryFlags(story, libraryEntry)
                return (
                  <div key={story.id} onClick={() => router.push('/player/' + story.id)} className="cursor-pointer">
                    <HorizontalStoryCard 
                      id={story.id} 
                      title={story.title} 
                      genre={story.genre} 
                      author={story.author || 'Drive Time Tales'} 
                      duration_mins={story.duration_mins} 
                      credits={getCredits(story.duration_mins)} 
                      cover_url={story.cover_url} 
                      series_number={story.series_number} 
                      series_total={story.series_total} 
                      flags={flags}
                    />
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      {/* Sticky bottom bar: Credits + Playlist/Search OR Series instruction OR Low Credits */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950 px-3 py-2 border-t border-slate-700 z-50">
        {showLowCreditsButton ? (
          <button onClick={() => router.push('/buy-credits')} className="w-full bg-orange-500 text-white py-2 rounded-lg text-base font-bold">Low On Credits - Get More</button>
        ) : selectedType === 'Series Only' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="bg-slate-950 px-2 py-1 rounded-md text-center leading-tight border border-slate-700">
              <div className="text-white text-[10px]">Credits</div>
              <div className="text-white text-sm">{userCredits}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p className="text-white text-sm" style={{ margin: 0 }}>Select any series to expand</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="bg-slate-950 px-2 py-1 rounded-md text-center leading-tight border border-slate-700">
              <div className="text-white text-[10px]">Credits</div>
              <div className="text-white text-sm">{userCredits}</div>
            </div>
            <div className="flex-1"><PlaylistButton /></div>
            <button onClick={() => router.push('/library-search')} className="bg-slate-700 text-white px-3 py-2 rounded-md text-sm font-medium">Search</button>
          </div>
        )}
      </div>
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
