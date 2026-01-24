'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

interface Story { id: string; title: string; genre: string; author: string; duration_mins: number; cover_url: string | null; series_name?: string | null; series_number?: number | null; series_total?: number | null }

function getCredits(duration_mins: number): number { return Math.max(1, Math.floor(duration_mins / 15)) }

function LibrarySearchContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Friend')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'title' | 'author'>('title')
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase.from('stories').select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total').not('cover_url', 'is', null).order('published_on', { ascending: false })
      if (storiesData) setStories(storiesData)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('first_name, display_name').eq('id', user.id).single()
        if (userData) setUserName(userData.first_name || userData.display_name || 'Friend')
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const handleSearch = () => { if (searchQuery.trim()) setHasSearched(true) }
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }

  const filteredStories = stories.filter(story => {
    if (!searchQuery.trim()) return false
    const query = searchQuery.toLowerCase()
    if (searchType === 'title') return story.title.toLowerCase().includes(query)
    return (story.author || '').toLowerCase().includes(query)
  })

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/library')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><span style={{ fontSize: '18px' }}>🚗</span><span style={{ fontSize: '18px' }}>🚙</span><span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Drive Time</span><span style={{ color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>Tales</span></div>
          <div onClick={() => router.push('/profile')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f97316', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</span></div>
        </div>
        <div style={{ padding: '1rem 0.75rem', backgroundColor: '#000000' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}><span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Search Stories</span></div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', justifyContent: 'center' }}>
            <button onClick={() => setSearchType('title')} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: searchType === 'title' ? '3px solid #f97316' : '3px solid #475569', backgroundColor: searchType === 'title' ? '#f97316' : 'transparent', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Title</button>
            <button onClick={() => setSearchType('author')} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: searchType === 'author' ? '3px solid #f97316' : '3px solid #475569', backgroundColor: searchType === 'author' ? '#f97316' : 'transparent', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Author</button>
          </div>
          <div style={{ marginBottom: '1rem' }}><input type="text" placeholder={'Type ' + searchType + ' here...'} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={handleKeyPress} autoFocus style={{ width: '100%', padding: '1rem', borderRadius: '10px', border: 'none', backgroundColor: '#ffffff', color: '#000000', fontSize: '18px', fontWeight: 500, outline: 'none' }} /></div>
          <button onClick={handleSearch} disabled={!searchQuery.trim()} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: 'none', backgroundColor: searchQuery.trim() ? '#22c55e' : '#334155', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: searchQuery.trim() ? 'pointer' : 'not-allowed' }}>🔍 Search</button>
        </div>
      </div>
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {hasSearched && filteredStories.length === 0 ? <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '2rem 1rem', textAlign: 'center' }}><div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>🔍</div><p style={{ color: 'white', fontSize: '16px', marginBottom: '0.5rem' }}>No stories found for "{searchQuery}"</p><p style={{ color: '#94a3b8', fontSize: '14px' }}>Try a different {searchType} search</p></div> : filteredStories.map(story => <div key={story.id} onClick={() => router.push('/player/' + story.id)} style={{ cursor: 'pointer' }}><HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={getCredits(story.duration_mins)} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} /></div>)}
      </div>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function LibrarySearchPage() { return <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}><LibrarySearchContent /></Suspense> }
