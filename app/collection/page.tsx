'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import StickyHeaderFull from '@/components/StickyHeaderFull'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
}

interface UserStory {
  story_id: string
  progress: number
  completed: boolean
  last_played: string
  reviewed: boolean
}

export default function CollectionPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [userProgress, setUserProgress] = useState<Record<string, UserStory>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [genres, setGenres] = useState<string[]>([])

  useEffect(() => {
    if (user?.id) fetchCollection()
  }, [user])

  const fetchCollection = async () => {
    try {
      const { data: libraryData } = await supabase
        .from('user_library')
        .select('story_id, progress, completed, last_played')
        .eq('user_id', user?.id)
        .order('last_played', { ascending: false })

      if (libraryData && libraryData.length > 0) {
        const progressLookup: Record<string, UserStory> = {}
        libraryData.forEach(p => {
          progressLookup[p.story_id] = { ...p, reviewed: false }
        })

        const { data: reviewsData } = await supabase
          .from('reviews')
          .select('story_id')
          .eq('user_id', user?.id)
          .in('story_id', libraryData.map(l => l.story_id))

        if (reviewsData) {
          reviewsData.forEach(r => {
            if (progressLookup[r.story_id]) {
              progressLookup[r.story_id].reviewed = true
            }
          })
        }

        setUserProgress(progressLookup)

        const storyIds = libraryData.map(p => p.story_id)
        const { data: storiesData } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .in('id', storyIds)

        if (storiesData) {
          // Sort alphabetically by title
          const sorted = storiesData.sort((a, b) => a.title.localeCompare(b.title))
          setStories(sorted)
          
          // Extract unique genres
          const uniqueGenres = [...new Set(storiesData.map(s => s.genre).filter(Boolean))]
          setGenres(uniqueGenres.sort())
        }
      }
    } catch (err) {
      console.error('Error fetching collection:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter stories
  const filteredStories = stories.filter(story => {
    const progress = userProgress[story.id]
    
    // Status filter
    if (filter === 'In Progress' && !(progress && !progress.completed && progress.progress > 0)) return false
    if (filter === 'Completed' && !progress?.completed) return false
    if (filter === 'Not Started' && progress && progress.progress > 0) return false
    
    // Genre filter
    if (genreFilter !== 'All' && story.genre !== genreFilter) return false
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      if (!story.title.toLowerCase().includes(searchLower) && 
          !story.author.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    
    return true
  })

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.4rem 0.75rem',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer'
  })

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <StickyHeaderFull />
        <div className="text-center py-12 px-4">
          <span className="text-5xl block mb-4">🔒</span>
          <h2 className="text-xl font-bold mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">Sign in to see your collection</p>
          <Link href="/signin" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Sign In</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="py-12 flex justify-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <StickyHeaderFull />
      
      {/* Sticky Filters */}
      <div className="sticky top-[60px] z-40 bg-slate-800 px-4 py-3">
        <h1 className="text-xl font-bold text-white mb-3">📚 My Collection</h1>
        
        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search by title or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:border-orange-500"
          />
        </div>
        
        {/* Genre Dropdown */}
        <div className="mb-3">
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
          >
            <option value="All">All Genres</option>
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        
        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter('All')} style={btnStyle(filter === 'All')}>All ({stories.length})</button>
          <button onClick={() => setFilter('In Progress')} style={btnStyle(filter === 'In Progress')}>In Progress</button>
          <button onClick={() => setFilter('Completed')} style={btnStyle(filter === 'Completed')}>Completed</button>
          <button onClick={() => setFilter('Not Started')} style={btnStyle(filter === 'Not Started')}>Not Started</button>
        </div>
      </div>

      {/* Stories List */}
      <div className="px-4 py-4">
        {filteredStories.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-xl">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">
              {stories.length === 0 ? 'No Stories Yet' : 'No Matches Found'}
            </h2>
            <p className="text-slate-400 mb-6">
              {stories.length === 0 ? 'Start listening to build your collection!' : 'Try a different filter or search'}
            </p>
            {stories.length === 0 && (
              <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Browse Stories</Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStories.map(story => {
              const progress = userProgress[story.id]
              const progressPercent = progress 
                ? progress.completed ? 100 : Math.round((progress.progress / (story.duration_mins * 60)) * 100)
                : 0
              const hasReviewed = progress?.reviewed

              return (
                <div
                  key={story.id}
                  onClick={() => router.push(`/player/${story.id}`)}
                  className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition cursor-pointer"
                >
                  <div style={{ display: 'flex' }}>
                    <div style={{ width: '90px', height: '90px', flexShrink: 0, padding: '0.5rem' }}>
                      <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%', position: 'relative' }}>
                        {story.cover_url ? (
                          <img src={story.cover_url} alt={story.title} className="object-cover" style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center">
                            <span className="text-2xl">🎧</span>
                          </div>
                        )}
                        {progress?.completed && (
                          <div style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: '#22c55e', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ flex: 1, padding: '0.5rem 0.75rem 0.5rem 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <h3 className="text-white font-bold text-sm line-clamp-1 mb-1">{story.title}</h3>
                      <p className="text-slate-400 text-xs mb-1">{story.genre} • {story.author}</p>
                      <p className="text-white text-xs mb-2">{story.duration_mins} min</p>
                      
                      <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                        <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: progress?.completed ? '#22c55e' : '#f97316', borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-slate-400 text-xs">
                          {progress?.completed ? 'Completed' : `${progressPercent}% complete`}
                        </span>
                        
                        {progress?.completed && (
                          <span 
                            onClick={(e) => { e.stopPropagation(); router.push(`/review/${story.id}`) }}
                            className="text-xs"
                            style={{ color: hasReviewed ? '#22c55e' : '#f97316', cursor: 'pointer' }}
                          >
                            {hasReviewed ? '⭐ Reviewed' : '⭐ Leave Review'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
