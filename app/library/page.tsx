'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'
import LibraryFiltersWithSearch from '@/components/LibraryFiltersWithSearch'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  series_name?: string | null
  series_number?: number | null
  series_total?: number | null
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  
  // Filter state from component
  const [filters, setFilters] = useState({
    duration: 'All',
    type: 'All',
    genre: 'All',
    searchQuery: '',
    searchType: 'title' as 'title' | 'author'
  })

  const showLowCreditsButton = !isUnlimited && userCredits <= 3

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
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
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters)
  }, [])

  const filteredStories = stories.filter(story => {
    // Search filter
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase()
      if (filters.searchType === 'title' && !story.title.toLowerCase().includes(query)) return false
      if (filters.searchType === 'author' && !(story.author || '').toLowerCase().includes(query)) return false
    }
    // Duration filter
    if (filters.duration !== 'All') {
      if (filters.duration === '15m' && story.duration_mins > 15) return false
      if (filters.duration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (filters.duration === '1hr' && story.duration_mins <= 30) return false
    }
    if (filters.type === 'Series' && !story.series_name) return false
    if (filters.genre !== 'All' && !(story.genre?.toLowerCase() || '').includes(filters.genre.toLowerCase())) return false
    return true
  })

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: showLowCreditsButton ? '55px' : '0' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        {/* Header row */}
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/home')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '18px' }}>🚗</span>
            <span style={{ fontSize: '18px' }}>🚙</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span>
            <span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span>
          </div>
          <div onClick={() => router.push('/profile')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span>}
          </div>
        </div>

        {/* Filters with search */}
        <LibraryFiltersWithSearch
          userCredits={userCredits}
          isUnlimited={isUnlimited}
          showPlaylistButton={true}
          onFilterChange={handleFilterChange}
        />
      </div>

      {/* Story list */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.length === 0 ? (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>😔</div>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '0.5rem' }}>Sorry {userName}, we have no stories to match your request.</p>
            <p style={{ color: 'white', fontSize: '14px' }}>Try a different search or filter!</p>
          </div>
        ) : (
          filteredStories.map(story => (
            <div key={story.id} onClick={() => router.push('/player/' + story.id)} style={{ cursor: 'pointer' }}>
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
              />
            </div>
          ))
        )}
      </div>

      {/* Low credits button */}
      {showLowCreditsButton && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.5rem 0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
          <button onClick={() => router.push('/buy-credits')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', width: '100%', fontSize: '15px', fontWeight: 'bold' }}>
            You're Low On Credits - Click Here to Get More
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <LibraryContent />
    </Suspense>
  )
}
