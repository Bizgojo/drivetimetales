'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
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
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (user?.id) fetchCollection()
  }, [user])

  const fetchCollection = async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key || !user?.id) return

      // Fetch user library
      const libraryResponse = await fetch(
        `${url}/rest/v1/user_library?user_id=eq.${user.id}&select=story_id,progress,completed,last_played&order=last_played.desc`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )

      if (!libraryResponse.ok) return
      const libraryData = await libraryResponse.json()

      if (libraryData && libraryData.length > 0) {
        const progressLookup: Record<string, UserStory> = {}
        libraryData.forEach((p: any) => {
          progressLookup[p.story_id] = { ...p, reviewed: false }
        })

        // Fetch reviews for these stories
        const storyIds = libraryData.map((l: any) => l.story_id)
        const reviewsResponse = await fetch(
          `${url}/rest/v1/reviews?user_id=eq.${user.id}&select=story_id`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )

        if (reviewsResponse.ok) {
          const reviewsData = await reviewsResponse.json()
          console.log('[Collection] Reviews found:', reviewsData)
          reviewsData.forEach((r: any) => {
            if (progressLookup[r.story_id]) {
              progressLookup[r.story_id].reviewed = true
            }
          })
        }

        setUserProgress(progressLookup)

        // Fetch story details
        const storiesResponse = await fetch(
          `${url}/rest/v1/stories?id=in.(${storyIds.map((id: string) => `"${id}"`).join(',')})&select=id,title,genre,author,duration_mins,cover_url`,
          { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
        )

        if (storiesResponse.ok) {
          const storiesData = await storiesResponse.json()
          const sorted = storiesData.sort((a: Story, b: Story) => a.title.localeCompare(b.title))
          setStories(sorted)
          
          const counts: Record<string, number> = {}
          storiesData.forEach((s: Story) => {
            if (s.genre && !s.genre.includes('not set') && !s.genre.includes('Tab')) {
              counts[s.genre] = (counts[s.genre] || 0) + 1
            }
          })
          setGenreCounts(counts)
        }
      }
    } catch (err) {
      console.error('Error fetching collection:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredStories = stories.filter(story => {
    const progress = userProgress[story.id]
    if (filter === 'In Progress' && !(progress && !progress.completed && progress.progress > 0)) return false
    if (filter === 'Completed' && !progress?.completed) return false
    if (filter === 'Not Started' && progress && progress.progress > 0) return false
    if (genreFilter !== 'All' && story.genre !== genreFilter) return false
    if (search) {
      const searchLower = search.toLowerCase()
      if (!story.title.toLowerCase().includes(searchLower) && !story.author.toLowerCase().includes(searchLower)) return false
    }
    return true
  })

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.4rem 0.6rem',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
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

  const sortedGenres = Object.entries(genreCounts).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        #collection-search::placeholder {
          color: rgba(255, 255, 255, 0.7) !important;
        }
      `}} />
      <StickyHeaderFull />
      
      <div className="sticky top-[60px] z-40 bg-slate-800 px-4 py-3">
        <h1 className="text-xl font-bold text-white mb-3">📚 My Collection</h1>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            id="collection-search"
            type="text"
            placeholder="Search title/author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: 'white', backgroundColor: '#334155', border: '1px solid #475569', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', flex: 1, outline: 'none' }}
          />
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            style={{ color: 'white', backgroundColor: '#334155', border: '1px solid #475569', borderRadius: '8px', padding: '8px', fontSize: '14px', minWidth: '110px' }}
          >
            <option value="All">All ({stories.length})</option>
            {sortedGenres.map(([genre, count]) => (
              <option key={genre} value={genre}>{genre} ({count})</option>
            ))}
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
          <button onClick={() => setFilter('All')} style={btnStyle(filter === 'All')}>All ({stories.length})</button>
          <button onClick={() => setFilter('In Progress')} style={btnStyle(filter === 'In Progress')}>In Progress</button>
          <button onClick={() => setFilter('Completed')} style={btnStyle(filter === 'Completed')}>Completed</button>
          <button onClick={() => setFilter('Not Started')} style={btnStyle(filter === 'Not Started')}>Not Started</button>
        </div>
      </div>

      <div className="px-4 py-4">
        {filteredStories.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-xl">
            <span className="text-5xl block mb-4">📚</span>
            <h2 className="text-xl font-bold text-white mb-2">{stories.length === 0 ? 'No Stories Yet' : 'No Matches Found'}</h2>
            <p className="text-slate-400 mb-6">{stories.length === 0 ? 'Start listening to build your collection!' : 'Try a different filter or search'}</p>
            {stories.length === 0 && <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Browse Stories</Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStories.map(story => {
              const progress = userProgress[story.id]
              const progressPercent = progress ? progress.completed ? 100 : Math.round((progress.progress / (story.duration_mins * 60)) * 100) : 0
              const hasReviewed = progress?.reviewed
              const displayGenre = story.genre && !story.genre.includes('not set') ? story.genre : 'Drama'

              return (
                <div key={story.id} className="bg-slate-800 rounded-xl overflow-hidden">
                  <div 
                    onClick={() => router.push(`/player/${story.id}`)} 
                    className="hover:bg-slate-700 transition cursor-pointer"
                    style={{ display: 'flex' }}
                  >
                    <div style={{ width: '90px', height: '90px', flexShrink: 0, padding: '0.5rem' }}>
                      <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%', position: 'relative' }}>
                        {story.cover_url ? (
                          <img src={story.cover_url} alt={story.title} className="object-cover" style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center"><span className="text-2xl">🎧</span></div>
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
                      <p className="text-slate-400 text-xs mb-1">{displayGenre} • {story.author}</p>
                      <p className="text-white text-xs mb-2">{story.duration_mins} min</p>
                      
                      <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                        <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: progress?.completed ? '#22c55e' : '#f97316', borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      
                      <span className="text-slate-400 text-xs">{progress?.completed ? 'Completed' : `${progressPercent}% complete`}</span>
                    </div>
                  </div>
                  
                  {/* Review Button - More Prominent */}
                  {progress?.completed && (
                    <div 
                      onClick={(e) => { e.stopPropagation(); router.push(`/review/${story.id}`) }}
                      style={{ 
                        borderTop: '1px solid #334155',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        backgroundColor: hasReviewed ? '#1e3a2f' : '#3d2814',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      {hasReviewed ? (
                        <>
                          <span style={{ color: '#22c55e', fontSize: '14px' }}>✓ Reviewed</span>
                          <span style={{ color: '#22c55e' }}>⭐⭐⭐⭐⭐</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: '#f97316', fontWeight: 600, fontSize: '14px' }}>⭐ Leave a Review</span>
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>• Earn 2 credits!</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
