'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import LibraryAuthOverlay from '@/components/LibraryAuthOverlay'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import StickyHeaderFull from '@/components/StickyHeaderFull'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import SeriesCard from '@/components/SeriesCard'
import PlaylistButton from '@/components/PlaylistButton'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'
import ReviewModal from '@/components/ReviewModal'

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
  // From story_analytics view
  avg_rating?: number | null
  review_count?: number
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
  description?: string | null
  completed_episodes?: number
  episode_ids: string[]
  earliest_created_at?: string
}

// Review modal target type
interface ReviewTarget {
  id: string
  title: string
  genre: string
  duration_mins: number
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function computeStoryFlags(story: Story, userLibraryEntry?: UserLibraryEntry | null): string[] {
  if (userLibraryEntry?.completed) return []
  const flags: string[] = []
  
  const isOwned = !!userLibraryEntry && !userLibraryEntry?.completed
  const isReserved = userLibraryEntry?.reserved === true
  const isContinue = (userLibraryEntry?.progress ?? 0) > 0 && !userLibraryEntry?.completed
  
  if (isContinue) {
    flags.push('continue')
  } else if (isReserved) {
    flags.push('reserved')
  } else if (isOwned) {
    flags.push('owned')
  }
  
  const userHasStory = isContinue || isOwned || isReserved
  
  if (story.series_number) {
    flags.push('series')
  }
  
  if (!userHasStory) {
    if (story.created_at) {
      const storyDate = new Date(story.created_at)
      const now = new Date()
      const daysDiff = (now.getTime() - storyDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff <= 25 && !isReserved) {
        flags.push('new')
      }
    }
    if (story.is_free) {
      flags.push('free')
    }
  }
  
  if (story.flag === 'editors-pick') {
    flags.push('editors-pick')
  } else if (story.flag === 'listeners-pick') {
    flags.push('listeners-pick')
  }
  
  const priorityOrder = [
    'continue', 'reserved', 'owned', 'series', 
    'trending', 'new', 'free', 'editors-pick', 'listeners-pick'
  ]
  
  flags.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
  return flags.slice(0, 3)
}

function LibraryContent() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<UserLibraryEntry[]>([])
  const [seriesTableData, setSeriesTableData] = useState<Record<string, { cover_image: string | null, description: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [userCredits, setUserCredits] = useState(4)
  
  // Review state
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [userReviewedIds, setUserReviewedIds] = useState<Set<string>>(new Set())
  const [justReviewed, setJustReviewed] = useState<Set<string>>(new Set())

  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')

  const showLowCreditsButton = userCredits <= 3

  useEffect(() => {
    async function fetchData() {
      // Fetch stories from story_analytics view to get avg_rating + review_count
      const { data: storiesData } = await supabase
        .from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, series_number, series_total, flag, is_free, created_at, avg_rating, review_count')
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
        
        // Fetch user library
        const { data: libraryData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', user.id)
        if (libraryData) {
          console.log('[Library] Loaded', libraryData.length, 'library entries for user', user.id)
          setUserLibrary(libraryData)
        }

        // Fetch which stories this user has already reviewed
        const { data: reviewsData } = await supabase
          .from('reviews')
          .select('story_id')
          .eq('user_id', user.id)
        if (reviewsData) {
          setUserReviewedIds(new Set(reviewsData.map((r: any) => r.story_id)))
        }
      }
      
      // Fetch series table data
      const { data: seriesRows } = await supabase
        .from('series')
        .select('title, cover_image, description')
      if (seriesRows) {
        const lookup: Record<string, { cover_image: string | null, description: string | null }> = {}
        seriesRows.forEach((s: any) => { lookup[s.title] = { cover_image: s.cover_image, description: s.description } })
        setSeriesTableData(lookup)
      }
      
      setLoading(false)
    }
    fetchData()
  }, [user, authLoading])

  const libraryLookup = useMemo(() => {
    const map = new Map<string, UserLibraryEntry>()
    userLibrary.forEach(entry => map.set(entry.story_id, entry))
    return map
  }, [userLibrary])

  // Filter stories
  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All Lengths') {
      if (selectedDuration === '~15 min' && story.duration_mins > 20) return false
      if (selectedDuration === '~30 min' && (story.duration_mins <= 20 || story.duration_mins > 45)) return false
      if (selectedDuration === '~1 hr' && story.duration_mins <= 45) return false
    }
    
    if (selectedGenre !== 'All Categories') {
      const genreLower = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !genreLower.includes('mystery')) return false
      if (selectedGenre === 'Romance' && !genreLower.includes('romance')) return false
      if (selectedGenre === 'Horror' && !genreLower.includes('horror')) return false
      if (selectedGenre === 'Thriller' && !genreLower.includes('thriller')) return false
      if (selectedGenre === 'Sci-Fi' && !genreLower.includes('sci')) return false
      if (selectedGenre === 'Western' && !genreLower.includes('western')) return false
      if (selectedGenre === 'Drama' && !genreLower.includes('drama')) return false
    }
    
    return true
  })

  // Build series groups
  const seriesMap = new Map<string, SeriesGroup>()
  filteredStories.forEach(story => {
    if (story.series_name) {
      const existing = seriesMap.get(story.series_name)
      if (existing) {
        existing.episode_count++
        existing.total_duration_mins += story.duration_mins || 0
        existing.episode_ids.push(story.id)
        if ((story.created_at || '') < (existing.earliest_created_at || '')) {
          existing.earliest_created_at = story.created_at
        }
      } else {
        const seriesInfo = seriesTableData[story.series_name]
        seriesMap.set(story.series_name, {
          id: story.series_id || story.id,
          series_name: story.series_name,
          genre: story.genre,
          author: story.author,
          episode_count: 1,
          total_duration_mins: story.duration_mins || 0,
          cover_url: seriesInfo?.cover_image || story.cover_url,
          description: seriesInfo?.description || null,
          episode_ids: [story.id],
          earliest_created_at: story.created_at
        })
      }
    }
  })
  const seriesGroups = Array.from(seriesMap.values())
  
  seriesGroups.forEach(group => {
    group.completed_episodes = group.episode_ids.filter(eid => 
      libraryLookup.get(eid)?.completed
    ).length
  })

  const singles = filteredStories.filter(s => !s.series_name)

  type DisplayItem = { type: 'single', story: Story, sortDate: string } | { type: 'series', group: SeriesGroup, sortDate: string }
  const mixedItems: DisplayItem[] = []
  singles.forEach(story => {
    mixedItems.push({ type: 'single', story, sortDate: story.created_at || '' })
  })
  seriesGroups.forEach(group => {
    mixedItems.push({ type: 'series', group, sortDate: group.earliest_created_at || '' })
  })
  mixedItems.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))

  // Helper to render a single HSC with review props
  function renderStoryCard(story: Story) {
    const libraryEntry = libraryLookup.get(story.id)
    const flags = computeStoryFlags(story, libraryEntry)
    const is_completed = libraryEntry?.completed === true
    const has_reviewed = userReviewedIds.has(story.id) || justReviewed.has(story.id)
    const progress_percent = is_completed
      ? undefined  // don't show progress bar on completed stories
      : libraryEntry?.progress && story.duration_mins
        ? Math.round((libraryEntry.progress / (story.duration_mins * 60)) * 100)
        : undefined

    return (
      <div
        key={story.id}
        onClick={() => {
          // Don't navigate if clicking the Rate It button
        }}
        className="cursor-pointer"
      >
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
          progress_percent={progress_percent}
          avg_rating={story.avg_rating}
          review_count={story.review_count}
          is_completed={is_completed}
          has_reviewed={has_reviewed}
          onReviewClick={(e) => {
            e.preventDefault()
            setReviewTarget({
              id: story.id,
              title: story.title,
              genre: story.genre,
              duration_mins: story.duration_mins,
            })
          }}
        />
      </div>
    )
  }

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
      
      <LibraryFiltersV2
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />
      
      <div className="px-3 py-2 flex flex-col gap-2">
        {selectedType === 'Singles & Series' && (
          <>
            {mixedItems.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">😔</div>
                <p className="text-white text-base mb-2">Sorry {userName}, no stories match your request.</p>
                <p className="text-white text-sm" style={{ opacity: 0.7 }}>Try a different filter</p>
              </div>
            ) : (
              mixedItems.map(item => {
                if (item.type === 'series') {
                  return (
                    <SeriesCard 
                      key={`series-${item.group.series_name}`} 
                      id={item.group.id} 
                      series_name={item.group.series_name} 
                      genre={item.group.genre} 
                      episode_count={item.group.episode_count} 
                      total_duration_mins={item.group.total_duration_mins} 
                      cover_url={item.group.cover_url} 
                      description={item.group.description}
                      completed_episodes={item.group.completed_episodes}
                    />
                  )
                } else {
                  return renderStoryCard(item.story)
                }
              })
            )}
          </>
        )}

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
                <SeriesCard 
                  key={series.series_name} 
                  id={series.id} 
                  series_name={series.series_name} 
                  genre={series.genre} 
                  episode_count={series.episode_count} 
                  total_duration_mins={series.total_duration_mins} 
                  cover_url={series.cover_url} 
                  description={series.description}
                  completed_episodes={series.completed_episodes}
                />
              ))
            )}
          </>
        )}

        {selectedType === 'Singles Only' && (
          <>
            {singles.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">😔</div>
                <p className="text-white text-base mb-2">Sorry {userName}, no stories match your request.</p>
                <p className="text-white text-sm" style={{ opacity: 0.7 }}>Try a different filter</p>
              </div>
            ) : (
              singles.map(story => renderStoryCard(story))
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-950 px-3 py-2 border-t border-slate-700 z-50">
        {selectedType === 'Series Only' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p className="text-white text-sm" style={{ margin: 0 }}>Select any series to expand</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="flex-1"><PlaylistButton /></div>
            <button onClick={() => router.push('/library-search')} style={{ background: "#f97316", color: "white", padding: "0.75rem 1rem", borderRadius: "10px", fontSize: "18px", fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Search</button>
          </div>
        )}
      </div>

      {/* Review Modal — single instance for all stories */}
      {reviewTarget && user?.id && (
        <ReviewModal
          storyId={reviewTarget.id}
          storyTitle={reviewTarget.title}
          userId={user.id}
          genre={reviewTarget.genre}
          duration_mins={reviewTarget.duration_mins}
          onClose={() => setReviewTarget(null)}
          onSubmitted={(rating) => {
            setJustReviewed(prev => { const s = new Set(prev); s.add(reviewTarget.id); return s })
            setReviewTarget(null)
          }}
        />
      )}
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LibraryContent />
      <LibraryAuthOverlay />
    </Suspense>
  )
}
