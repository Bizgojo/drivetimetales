'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'
import LibraryFilters from '@/components/LibraryFilters'
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

interface UserLibraryItem {
  story_id: string
  progress: number
  completed: boolean
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function WelcomeLibraryContent() {
  const [stories, setStories] = useState<Story[]>([])
  const [userLibrary, setUserLibrary] = useState<UserLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  
  const [selectedDuration, setSelectedDuration] = useState('All Lengths')
  const [selectedGenre, setSelectedGenre] = useState('All Categories')
  const [selectedType, setSelectedType] = useState('Singles & Series')

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
    // Duration filter
    if (selectedDuration !== 'All Lengths') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '~1 hr' && mins < 40) return false
    }
    // Genre filter
    if (selectedGenre !== 'All Categories') {
      if (!story.genre?.toLowerCase().includes(selectedGenre.toLowerCase())) return false
    }
    // Type filter
    if (selectedType === 'Singles Only') {
      if (story.series_number && story.series_total) return false
    }
    if (selectedType === 'Series Only') {
      if (!story.series_number || !story.series_total) return false
    }
    return true
  })

  // Build the empty state message
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
        <LibraryFilters
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
              <HorizontalStoryCard
                key={story.id}
                id={story.id}
                title={story.title}
                genre={story.genre}
                author={story.author || 'Drive Time Tales'}
                duration_mins={story.duration_mins}
                credits={storyCost}
                cover_url={story.cover_url}
                rating={4.0}
                review_count={0}
                flag={canAfford ? 'free' : null}
                series_number={story.series_number}
                series_total={story.series_total}
                play_status={playStatus}
              />
            )
          })
        )}
      </div>
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
