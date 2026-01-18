'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import WL01StickyLogo from '@/components/WL01StickyLogo'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
}

function WelcomeLibraryContent() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [freeCredits, setFreeCredits] = useState(2)

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* WL01: Sticky Logo Header */}
      <WL01StickyLogo credits={freeCredits} />

      {/* Placeholder for remaining modules */}
      <div style={{ padding: '1rem' }}>
        <p className="text-white">WL02_Genres - coming next</p>
        <p className="text-white">WL03_Duration - coming next</p>
        <p className="text-white">WL04_StoryCards - coming next</p>
        <p className="text-white" style={{ marginTop: '1rem' }}>Stories loaded: {stories.length}</p>
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
