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
  episode_title?: string | null
  description?: string | null
  flag?: string | null
  is_free?: boolean
  group_name?: string | null
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
  
  // Review state
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [userReviewedIds, setUserReviewedIds] = useState<Set<string>>(new Set())
  const [justReviewed, setJustReviewed] = useState<Set<string>>(new Set())

  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedType, setSelectedType] = useState('Singles & Series')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)


  useEffect(() => {
    async function fetchData() {
      // Fetch stories from story_analytics view to get avg_rating + review_count
      const { data: storiesData } = await supabase
        .from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url, series_id, series_name, episode_title, description, is_hidden, series_number, series_total, flag, is_free, created_at, avg_rating, review_count')
        .not('cover_url', 'is', null).eq('is_hidden', false)
        .order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      
      if (user?.id) {
        // Fetch user data
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, display_name')
          .eq('id', user.id)
          .single()
        if (userData) {
          setUserName(userData.first_name || userData.display_name || 'Friend')
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
    
    if (selectedGroup) {
      if (!story.group_name || story.group_name !== selectedGroup) return false
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
  // Any story with a series_name shows as a series card (even if user only has 1 ep)
  const seriesGroups = Array.from(seriesMap.values())
  const singleEpSeriesStories: Story[] = []  // no longer demoted to singles

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
  // Sort shortest to longest (singles by duration; series by total duration)
  mixedItems.sort((a, b) => {
    const aDur = a.type === 'single' ? (a.story.duration_mins || 0) : (a.group.total_duration_mins || 0)
    const bDur = b.type === 'single' ? (b.story.duration_mins || 0) : (b.group.total_duration_mins || 0)
    return aDur - bDur
  })

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
          cover_url={story.cover_url}
          series_number={story.series_number}
          series_total={story.series_total}
          episode_title={story.episode_title}
          series_name={story.series_name}
          description={story.description}
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
        selectedGroup={selectedGroup}
        setSelectedGroup={setSelectedGroup}
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
            <button onClick={() => setShowSearch(true)} style={{ background: "#f97316", color: "white", padding: "0.5rem 1rem", borderRadius: "10px", fontSize: "18px", fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Search</button>
          </div>
        )}
      </div>

      {/* Search Overlay */}
      {showSearch && (
        <div onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} style={{ position: 'fixed', inset: 0, background: 'transparent', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '80px', pointerEvents: 'none' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#f2ede8', borderRadius: '16px', width: '90%', maxWidth: '420px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', pointerEvents: 'auto' }}>
            <div style={{ padding: '12px', position: 'relative' }}>
              <input autoFocus value={searchQuery} onChange={async e => { const q = e.target.value; setSearchQuery(q); if (!q.trim()) { setSearchResults([]); return } setSearchLoading(true); const { data } = await supabase.from('story_analytics').select('id, title, genre, author, duration_mins, cover_url, avg_rating, review_count').or(`title.ilike.%${q}%,author.ilike.%${q}%`).limit(15); setSearchResults(data || []); setSearchLoading(false) }} placeholder="Search by title or author…" style={{ width: '100%', background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', padding: '10px 36px 10px 36px', color: '#1c1917', fontSize: '15px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }} />
              <svg style={{ position: 'absolute', left: '22px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
              {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} style={{ position: 'absolute', right: '22px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#a8a29e', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>}
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0 12px 12px', background: '#f2ede8' }}>
              {searchLoading && <p style={{ color: '#78716c', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Searching…</p>}
              {!searchLoading && searchQuery && searchResults.length === 0 && <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No results for "{searchQuery}"</p>}
              {!searchLoading && searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {searchResults.map(story => (
                    <div key={story.id} onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); router.push(`/player/${story.id}`) }}>
                      <HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author} duration_mins={story.duration_mins} cover_url={story.cover_url} avg_rating={story.avg_rating} review_count={(story as any).review_count} />
                    </div>
                  ))}
                </div>
              )}
              {!searchQuery && <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} style={{ display: 'block', width: '100%', padding: '12px', background: 'none', border: 'none', color: '#a8a29e', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}>Dismiss</button>}
            </div>
          </div>
        </div>
      )}

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
