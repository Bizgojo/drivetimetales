'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HorizontalStoryCard from '@/components/HorizontalStoryCard'

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

function WelcomeLibraryContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(2)
  
  const [selectedDuration, setSelectedDuration] = useState('All')
  const [selectedType, setSelectedType] = useState('Both')
  const [selectedGenre, setSelectedGenre] = useState('All')
  
  const [showSubscriberPopup, setShowSubscriberPopup] = useState(false)
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_user_credits')
    if (storedCredits !== null) setUserCredits(parseInt(storedCredits, 10))
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData, error } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })
      if (error) console.error('Stories query error:', error)
      if (storiesData) setStories(storiesData)
      setLoading(false)
    }
    fetchData()
  }, [])

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All') {
      if (selectedDuration === '15m' && story.duration_mins > 15) return false
      if (selectedDuration === '30m' && (story.duration_mins <= 15 || story.duration_mins > 30)) return false
      if (selectedDuration === '1hr' && story.duration_mins <= 30) return false
    }
    if (selectedType === 'Singles' && story.series_name) return false
    if (selectedType === 'Series' && !story.series_name) return false
    if (selectedGenre !== 'All') {
      const g = story.genre?.toLowerCase() || ''
      if (selectedGenre === 'Mystery' && !g.includes('mystery') && !g.includes('thriller')) return false
      if (selectedGenre === 'Romance' && !g.includes('romance')) return false
      if (selectedGenre === 'Sci-Fi' && !g.includes('sci-fi') && !g.includes('scifi')) return false
      if (selectedGenre === 'Horror' && !g.includes('horror')) return false
      if (selectedGenre === 'Comedy' && !g.includes('comedy')) return false
      if (selectedGenre === 'Learn' && !g.includes('learn') && !g.includes('education')) return false
    }
    return true
  })

  const handleStoryClick = (story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    if (storyCost <= userCredits) router.push('/player/' + story.id)
    else { setSelectedStory(story); setShowCreditModal(true) }
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#f97316' : '#334155',
    color: 'white',
    padding: '0.35rem 0.6rem',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer'
  })

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', paddingBottom: '70px' }}>
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', zIndex: 50 }}>
        <button onClick={() => router.push('/welcome')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '20px' }}>🚗</span><span style={{ fontSize: '20px' }}>🚙</span>
          <span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Drive Time</span>
          <span style={{ color: '#f97316', fontSize: '18px', fontWeight: 'bold' }}>Tales</span>
        </div>
        <div style={{ color: 'white', fontSize: '13px', textAlign: 'right' }}>You Have<br /><span style={{ color: '#f97316', fontWeight: 'bold' }}>{userCredits} Credits</span></div>
      </div>
      
      <div style={{ padding: '0.75rem' }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', '15m', '30m', '1hr'].map(d => <button key={d} onClick={() => setSelectedDuration(d)} style={btnStyle(selectedDuration === d)}>{d}</button>)}
            <span style={{ color: '#475569', padding: '0 2px', display: 'flex', alignItems: 'center' }}>|</span>
            {['Both', 'Singles', 'Series'].map(t => <button key={t} onClick={() => setSelectedType(t)} style={btnStyle(selectedType === t)}>{t}</button>)}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['All', 'Mystery', 'Romance', 'Sci-Fi', 'Horror', 'Comedy', 'Learn'].map(g => (
              <button key={g} onClick={() => setSelectedGenre(g)} style={btnStyle(selectedGenre === g)}>
                {g === 'All' ? 'All' : g === 'Mystery' ? '🔍Myst' : g === 'Romance' ? '💕Rom' : g === 'Sci-Fi' ? '🚀SciFi' : g === 'Horror' ? '👻Horr' : g === 'Comedy' ? '😂Com' : '🧠Learn'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSubscriberPopup(true)} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer', width: '100%', marginTop: '0.35rem' }}>➕ Create a Playlist</button>
        </div>
      </div>

      <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredStories.map(story => (
          <div key={story.id} onClick={() => handleStoryClick(story)} style={{ cursor: 'pointer' }}>
            <HorizontalStoryCard id={story.id} title={story.title} genre={story.genre} author={story.author || 'Drive Time Tales'} duration_mins={story.duration_mins} credits={getCredits(story.duration_mins)} cover_url={story.cover_url} series_number={story.series_number} series_total={story.series_total} />
          </div>
        ))}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: '0.75rem', borderTop: '1px solid #334155', zIndex: 50 }}>
        <button onClick={() => router.push('/subscribe')} style={{ backgroundColor: '#22c55e', color: '#0f172a', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: '100%' }}>Subscribe or Buy More Credits</button>
      </div>

      {showSubscriberPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowSubscriberPopup(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>Playlists for Subscribers</h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1.5rem' }}>Playlists are only available for subscribers. Subscribe now to create your own hands-free driving playlists!</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowSubscriberPopup(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => setShowSubscriberPopup(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}

      {showCreditModal && selectedStory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setShowCreditModal(false)}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>Not Enough Credits</h2>
            <p style={{ color: 'white', fontSize: '16px', marginBottom: '1rem' }}>This story requires {getCredits(selectedStory.duration_mins)} credits, but you only have {userCredits}.</p>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '1.5rem' }}>Subscribe or buy more credits to listen to this story.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { setShowCreditModal(false); router.push('/subscribe') }} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Subscribe Now</button>
              <button onClick={() => setShowCreditModal(false)} style={{ backgroundColor: '#475569', color: 'white', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '16px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

export default function WelcomeLibraryPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>}>
      <WelcomeLibraryContent />
    </Suspense>
  )
}
