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
  credits: number
}

export default function ReservedPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [genreCounts, setGenreCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (user?.id) fetchReserved()
  }, [user])

  const fetchReserved = async () => {
    try {
      // Get wishlisted story IDs
      const { data: prefData } = await supabase
        .from('user_preferences')
        .select('story_id')
        .eq('user_id', user?.id)
        .eq('wishlisted', true)

      if (prefData && prefData.length > 0) {
        const storyIds = prefData.map(p => p.story_id)
        
        // Get story details
        const { data: storiesData } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, credits')
          .in('id', storyIds)

        if (storiesData) {
          const sorted = storiesData.sort((a, b) => a.title.localeCompare(b.title))
          setStories(sorted)
          
          // Count genres
          const counts: Record<string, number> = {}
          storiesData.forEach(s => {
            if (s.genre && !s.genre.includes('not set') && !s.genre.includes('Tab')) {
              counts[s.genre] = (counts[s.genre] || 0) + 1
            }
          })
          setGenreCounts(counts)
        }
      }
    } catch (err) {
      console.error('Error fetching reserved:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUnreserve = async (storyId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) return
    
    try {
      await supabase
        .from('user_preferences')
        .update({ wishlisted: false })
        .eq('user_id', user.id)
        .eq('story_id', storyId)
      
      setStories(stories.filter(s => s.id !== storyId))
    } catch (err) {
      console.error('Error unreserving:', err)
    }
  }

  const filteredStories = stories.filter(story => {
    if (genreFilter !== 'All' && story.genre !== genreFilter) return false
    if (search) {
      const searchLower = search.toLowerCase()
      if (!story.title.toLowerCase().includes(searchLower) && !story.author.toLowerCase().includes(searchLower)) return false
    }
    return true
  })

  const getCredits = (mins: number) => Math.max(1, Math.floor(mins / 15))
  const sortedGenres = Object.entries(genreCounts).sort((a, b) => a[0].localeCompare(b[0]))

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <StickyHeaderFull />
        <div className="text-center py-12 px-4">
          <span className="text-5xl block mb-4">📚</span>
          <h2 className="text-xl font-bold mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">Sign in to see your reserved stories</p>
          <Link href="/signin" className="px-6 py-3 bg-pink-500 text-white font-semibold rounded-lg inline-block">Sign In</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <StickyHeaderFull />
        <div className="py-12 flex justify-center">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <StickyHeaderFull />
      
      {/* Sticky Filters - Pink theme to distinguish from Collection */}
      <div className="sticky top-[60px] z-40 bg-slate-800 px-4 py-3 border-b-2 border-pink-500">
        <h1 className="text-xl font-bold text-white mb-3">📖 Reserved</h1>
        <p className="text-pink-400 text-sm mb-3">Stories saved for later • {stories.length} total</p>
        
        {/* Search & Genre */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Search title/author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: 'white', backgroundColor: '#334155', border: '1px solid #ec4899', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', flex: 1, outline: 'none' }}
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
      </div>

      {/* Stories List */}
      <div className="px-4 py-4">
        {filteredStories.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-xl">
            <span className="text-5xl block mb-4">📖</span>
            <h2 className="text-xl font-bold text-white mb-2">{stories.length === 0 ? 'No Reserved Stories' : 'No Matches Found'}</h2>
            <p className="text-slate-400 mb-6">{stories.length === 0 ? 'Browse the library and reserve stories for later!' : 'Try a different filter or search'}</p>
            {stories.length === 0 && <Link href="/library" className="px-6 py-3 bg-pink-500 text-white font-semibold rounded-lg inline-block">Browse Library</Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStories.map(story => {
              const credits = story.credits || getCredits(story.duration_mins)
              const displayGenre = story.genre && !story.genre.includes('not set') ? story.genre : 'Drama'

              return (
                <div
                  key={story.id}
                  onClick={() => router.push(`/player/${story.id}`)}
                  className="bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition cursor-pointer border-l-4 border-pink-500"
                >
                  <div style={{ display: 'flex' }}>
                    {/* Cover */}
                    <div style={{ width: '90px', height: '90px', flexShrink: 0, padding: '0.5rem' }}>
                      <div className="rounded-lg overflow-hidden" style={{ width: '100%', height: '100%', position: 'relative' }}>
                        {story.cover_url ? (
                          <img src={story.cover_url} alt={story.title} className="object-cover" style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-pink-600 to-pink-900 flex items-center justify-center">
                            <span className="text-2xl">📖</span>
                          </div>
                        )}
                        {/* Reserved badge */}
                        <div style={{ position: 'absolute', top: '4px', left: '4px', backgroundColor: '#ec4899', borderRadius: '4px', padding: '2px 6px' }}>
                          <span style={{ color: 'white', fontSize: '9px', fontWeight: 700 }}>RESERVED</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div style={{ flex: 1, padding: '0.5rem 0.75rem 0.5rem 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <h3 className="text-white font-bold text-sm line-clamp-1 mb-1">{story.title}</h3>
                      <p className="text-slate-400 text-xs mb-1">{displayGenre} • {story.author}</p>
                      <p className="text-white text-xs mb-2">{story.duration_mins} min • {credits} credit{credits !== 1 ? 's' : ''}</p>
                      
                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-pink-400 text-xs">Tap to preview</span>
                        <button
                          onClick={(e) => handleUnreserve(story.id, e)}
                          className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-600 rounded transition"
                          style={{ color: 'white' }}
                        >
                          ✕ Remove
                        </button>
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
