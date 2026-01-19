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
  rating?: number
  review_count?: number
}

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

function WelcomeLibraryContent() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  
  // Filter states
  const [selectedDuration, setSelectedDuration] = useState('Any Length')
  const [selectedGenre, setSelectedGenre] = useState('📚 All')
  const [selectedType, setSelectedType] = useState('All')

  useEffect(() => {
    const storedCredits = localStorage.getItem('dtt_free_credits')
    if (storedCredits !== null) {
      setFreeCredits(parseInt(storedCredits, 10))
    }
  }, [])

  useEffect(() => {
    async function fetchStories() {
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
          .not('cover_url', 'is', null)
          .order('published_on', { ascending: false })

        if (error) {
          console.error('Error fetching stories:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchStories:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStories()
  }, [])

  // Filter stories based on selections
  const filteredStories = stories.filter(story => {
    // Duration filter
    if (selectedDuration !== 'Any Length') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '~1 hr' && mins < 40) return false
    }
    
    // Genre filter
    if (selectedGenre !== '📚 All') {
      const storyGenre = story.genre?.toLowerCase() || ''
      if (!storyGenre.includes(selectedGenre.toLowerCase())) return false
    }
    
    // Type filter would need series data in DB - placeholder for now
    
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* WL00: Sticky Logo Header */}
      <WL01StickyLogo credits={freeCredits} />

      {/* Page Title */}
      <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
        <h2 className="text-xl font-bold text-white">LIBRARY (Pick a duration, genre and type)</h2>
      </div>

      {/* WL01: Library Filters */}
      <LibraryFilters
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />


      {/* Story List - placeholder for WL02 */}
      <div style={{ padding: '0 1rem 6rem 1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost

            return (
              <HorizontalStoryCard
                key={story.id}
                id={story.id}
                title={story.title}
                genre={story.genre}
                author={story.author || "Drive Time Tales"}
                duration_mins={story.duration_mins}
                credits={storyCost}
                cover_url={story.cover_url}
                rating={story.rating || 4.0}
                review_count={story.review_count || 0}
                flag={canAfford ? "free" : null}
              />
            )
          })}
        </div>
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
