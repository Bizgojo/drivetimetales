'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'
import LibraryFiltersV2 from '@/components/LibraryFiltersV2'

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

interface UserLibraryItem {
  story_id: string
  progress: number
  completed: boolean
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function renderStars(rating: number) {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<span key={i} className="text-yellow-400">★</span>)
    } else if (i === fullStars && hasHalf) {
      stars.push(<span key={i} className="star-half">★</span>)
    } else {
      stars.push(<span key={i} className="text-slate-600">★</span>)
    }
  }
  return stars
}

function WelcomeLibraryContent() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<UserLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')
  
  const [showModal, setShowModal] = useState(false)
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits !== null) {
      setFreeCredits(parseInt(storedCredits, 10))
    }
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, title, genre, author, duration_mins, cover_url, series_name, series_number, series_total')
        .not('cover_url', 'is', null)
        .order('published_on', { ascending: false })

      if (storiesData) setStories(storiesData)

      const userId = localStorage.getItem('dtt_user_id')
      if (userId) {
        const { data: libraryData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', userId)
        
        if (libraryData) setUserLibrary(libraryData)
      }

      setLoading(false)
    }
    fetchData()
  }, [])

  const getPlayStatus = (storyId: string): 'played' | 'continue' | null => {
    const item = userLibrary.find(lib => lib.story_id === storyId)
    if (!item) return null
    if (item.completed) return 'played'
    if (item.progress > 0) return 'continue'
    return null
  }

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'All Lengths') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '~1 hr' && mins < 40) return false
    }
    if (selectedGenre !== 'All Categories') {
      if (!story.genre?.toLowerCase().includes(selectedGenre.toLowerCase())) return false
    }
    if (selectedType === 'Singles Only') {
      if (story.series_number && story.series_total) return false
    }
    if (selectedType === 'Series Only') {
      if (!story.series_number || !story.series_total) return false
    }
    return true
  })

  const getEmptyMessage = () => {
    const parts = []
    if (selectedDuration !== 'All Lengths') parts.push(selectedDuration)
    if (selectedGenre !== 'All Categories') parts.push(selectedGenre)
    if (selectedType !== 'Singles & Series') parts.push(selectedType.toLowerCase())
    
    if (parts.length === 0) {
      return 'Sorry, we have no stories available right now.'
    }
    return `Sorry, we have no stories for your ${parts.join(', ')} selection.`
  }

  const handleStoryClick = (story: Story) => {
    const storyCost = getCredits(story.duration_mins)
    const canAfford = freeCredits >= storyCost
    
    if (canAfford) {
      localStorage.setItem('dtt_return_path', '/welcome-library')
      router.push('/player/' + story.id)
    } else {
      setSelectedStory(story)
      setShowModal(true)
    }
  }

  const handlePurchase = () => {
    localStorage.setItem('dtt_return_path', '/welcome-library')
    router.push('/subscribe')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <WL01StickyLogo credits={freeCredits} />
      
      <div style={{ paddingTop: '1rem' }}>
        <LibraryFiltersV2
          selectedDuration={selectedDuration}
          setSelectedDuration={setSelectedDuration}
          selectedGenre={selectedGenre}
          setSelectedGenre={setSelectedGenre}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
        />
      </div>

      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredStories.length === 0 ? (
          <div style={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '12px', 
            padding: '2rem', 
            textAlign: 'center' 
          }}>
            <p style={{ color: '#e2e8f0', fontSize: '18px', marginBottom: '0.75rem' }}>
              {getEmptyMessage()}
            </p>
            <p style={{ color: '#e2e8f0', fontSize: '16px' }}>
              We will make a request to our writers for this category.
            </p>
          </div>
        ) : (
          filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost
            const playStatus = getPlayStatus(story.id)
            
            return (
              <div 
                key={story.id}
                onClick={() => handleStoryClick(story)}
                className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition cursor-pointer"
              >
                <div style={{ width: '155px', height: '155px', flexShrink: 0, padding: '0.5rem' }}>
                  <div className="rounded-lg overflow-hidden cover-glow" style={{ width: '100%', height: '100%' }}>
                    <img 
                      src={story.cover_url || '/images/default-cover.png'} 
                      alt={story.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                </div>
                <div style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h3 className="text-white font-bold line-clamp-1" style={{ fontSize: '20px', margin: 0 }}>{story.title}</h3>
                  <p className="text-white" style={{ fontSize: '17px', margin: '3px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {story.genre}
                    {story.series_number && story.series_total && (
                      <span 
                        className="font-bold rounded"
                        style={{ 
                          backgroundColor: '#3b82f6', 
                          color: 'white', 
                          fontSize: '11px',
                          padding: '2px 8px'
                        }}
                      >
                        Series {story.series_number} of {story.series_total}
                      </span>
                    )}
                    {playStatus && (
                      <span 
                        className="font-bold rounded"
                        style={{ 
                          backgroundColor: playStatus === 'played' ? '#6b7280' : '#f59e0b', 
                          color: 'white', 
                          fontSize: '11px',
                          padding: '2px 8px'
                        }}
                      >
                        {playStatus === 'played' ? 'Played' : 'Continue'}
                      </span>
                    )}
                  </p>
                  <p className="text-white" style={{ fontSize: '17px', margin: '3px 0' }}>by {story.author || 'Drive Time Tales'}</p>
                  <p className="text-white" style={{ fontSize: '17px', margin: '3px 0' }}>{story.duration_mins} min • {storyCost} credits</p>
                  <p className="text-white" style={{ fontSize: '17px', margin: '3px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    4.0/5 {renderStars(4.0)} 0
                    {canAfford && (
                      <span 
                        className="font-bold rounded"
                        style={{ 
                          backgroundColor: '#22c55e', 
                          color: 'white', 
                          fontSize: '12px',
                          padding: '3px 10px',
                          marginLeft: '6px'
                        }}
                      >
                        FREE
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showModal && selectedStory && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}
          onClick={() => setShowModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>
              Not Enough Credits
            </h2>
            <p style={{ color: '#e2e8f0', fontSize: '16px', marginBottom: '0.5rem' }}>
              <strong>{selectedStory.title}</strong> requires {getCredits(selectedStory.duration_mins)} credits.
            </p>
            <p style={{ color: '#e2e8f0', fontSize: '16px', marginBottom: '1.5rem' }}>
              You have {freeCredits} credits remaining.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={handlePurchase}
                style={{
                  backgroundColor: '#f97316',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Get More Credits
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  backgroundColor: '#475569',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Choose Another Story
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WelcomeLibraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <WelcomeLibraryContent />
    </Suspense>
  )
}
