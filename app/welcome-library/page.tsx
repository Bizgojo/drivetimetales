'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  const [showPopup, setShowPopup] = useState(false)
  
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
          .select('id, title, genre, author, duration_mins, cover_url, rating, review_count')
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

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'Any Length') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '~1 hr' && mins < 40) return false
    }
    
    if (selectedGenre !== '📚 All') {
      const storyGenre = story.genre?.toLowerCase() || ''
      const filterGenre = selectedGenre.replace(/^[^\s]+\s/, '').toLowerCase()
      if (!storyGenre.includes(filterGenre)) return false
    }
    
    return true
  })

  const handleStoryClick = (e: React.MouseEvent, story: Story) => {
    e.preventDefault()
    const storyCost = getCredits(story.duration_mins)
    if (freeCredits >= storyCost) {
      router.push(`/player/${story.id}`)
    } else {
      setShowPopup(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <WL01StickyLogo credits={freeCredits} />

      <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
        <h2 className="text-xl font-bold text-white">LIBRARY (Pick a duration, genre and type)</h2>
      </div>

      <LibraryFilters
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />

      <div style={{ padding: '0 1rem 6rem 1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost
            
            return (
              <div key={story.id} onClick={(e) => handleStoryClick(e, story)}>
                <HorizontalStoryCard
                  id={story.id}
                  title={story.title}
                  genre={story.genre}
                  author={story.author || 'Drive Time Tales'}
                  duration_mins={story.duration_mins}
                  credits={storyCost}
                  cover_
cat > ~/Projects/drivetimetales/app/welcome-library/page.tsx << 'EOF'
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)
  const [showPopup, setShowPopup] = useState(false)
  
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
          .select('id, title, genre, author, duration_mins, cover_url, rating, review_count')
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

  const filteredStories = stories.filter(story => {
    if (selectedDuration !== 'Any Length') {
      const mins = story.duration_mins
      if (selectedDuration === '~15 min' && mins > 20) return false
      if (selectedDuration === '~30 min' && (mins < 20 || mins > 40)) return false
      if (selectedDuration === '~1 hr' && mins < 40) return false
    }
    
    if (selectedGenre !== '📚 All') {
      const storyGenre = story.genre?.toLowerCase() || ''
      const filterGenre = selectedGenre.replace(/^[^\s]+\s/, '').toLowerCase()
      if (!storyGenre.includes(filterGenre)) return false
    }
    
    return true
  })

  const handleStoryClick = (e: React.MouseEvent, story: Story) => {
    e.preventDefault()
    const storyCost = getCredits(story.duration_mins)
    if (freeCredits >= storyCost) {
      router.push(`/player/${story.id}`)
    } else {
      setShowPopup(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <WL01StickyLogo credits={freeCredits} />

      <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
        <h2 className="text-xl font-bold text-white">LIBRARY (Pick a duration, genre and type)</h2>
      </div>

      <LibraryFilters
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />

      <div style={{ padding: '0 1rem 6rem 1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredStories.map((story) => {
            const storyCost = getCredits(story.duration_mins)
            const canAfford = freeCredits >= storyCost
            
            return (
              <div key={story.id} onClick={(e) => handleStoryClick(e, story)}>
                <HorizontalStoryCard
                  id={story.id}
                  title={story.title}
                  genre={story.genre}
                  author={story.author || 'Drive Time Tales'}
                  duration_mins={story.duration_mins}
                  credits={storyCost}
                  cover_url={story.cover_url}
                  rating={story.rating || 4.0}
                  review_count={story.review_count || 0}
                  flag={canAfford ? 'free' : null}
                />
              </div>
            )
          })}
        </div>
      </div>

      {showPopup && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          onClick={() => setShowPopup(false)}
        >
          <div 
            className="bg-slate-800 rounded-xl"
            style={{ padding: '1.5rem', maxWidth: '20rem', textAlign: 'center', position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPopup(false)}
              className="text-slate-400"
              style={{ position: 'absolute', top: '0.5rem', right: '0.75rem', background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
            >
              ✕
            </button>
            <p className="text-white font-bold" style={{ marginBottom: '1rem' }}>
              Sorry, you do not have enough credits for this story
            </p>
            <button
              onClick={() => router.push('/subscribe')}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl"
              style={{ padding: '0.75rem 1.5rem', border: 'none', cursor: 'pointer' }}
            >
              Get More Credits
            </button>
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
