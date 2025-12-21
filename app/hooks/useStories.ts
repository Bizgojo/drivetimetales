'use client'

import { useState, useEffect } from 'react'

// Story type from database
export interface DBStory {
  id: string
  title: string
  author: string
  genre: string
  description: string | null
  duration_mins: number
  duration_label: string
  credits: number
  color: string
  promo_text: string | null
  is_new: boolean
  is_featured: boolean
  play_count: number
  audio_url: string | null
  sample_url: string | null
  cover_url: string | null
  price_cents: number | null
  created_at: string
  updated_at: string
}

// Transformed story for components
export interface Story {
  id: string
  title: string
  author: string
  genre: string
  description: string
  duration: string
  durationMins: number
  credits: number
  color: string
  promo?: string
  isNew: boolean
  isFeatured: boolean
  plays: number
  audioUrl: string | null
  sampleUrl: string | null
  coverUrl: string | null
  priceCents: number | null
}

// Transform database story to component format
export function transformStory(dbStory: DBStory): Story {
  return {
    id: dbStory.id,
    title: dbStory.title,
    author: dbStory.author,
    genre: dbStory.genre,
    description: dbStory.description || '',
    duration: dbStory.duration_label,
    durationMins: dbStory.duration_mins,
    credits: dbStory.credits,
    color: dbStory.color,
    promo: dbStory.promo_text || undefined,
    isNew: dbStory.is_new,
    isFeatured: dbStory.is_featured,
    plays: dbStory.play_count,
    audioUrl: dbStory.audio_url,
    sampleUrl: dbStory.sample_url,
    coverUrl: dbStory.cover_url,
    priceCents: dbStory.price_cents,
  }
}

// Hook to fetch all stories
export function useStories() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStories() {
      try {
        const res = await fetch('/api/stories')
        if (!res.ok) throw new Error('Failed to fetch stories')
        const data: DBStory[] = await res.json()
        setStories(data.map(transformStory))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchStories()
  }, [])

  return { stories, loading, error }
}

// Hook to fetch a single story
export function useStory(id: string) {
  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStory() {
      try {
        const res = await fetch('/api/stories')
        if (!res.ok) throw new Error('Failed to fetch stories')
        const data: DBStory[] = await res.json()
        const found = data.find(s => s.id === id)
        if (found) {
          setStory(transformStory(found))
        } else {
          setError('Story not found')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchStory()
  }, [id])

  return { story, loading, error }
}

// Create a lookup map for stories by ID
export function createStoryLookup(stories: Story[]): Record<string, Story> {
  return stories.reduce((acc, story) => {
    acc[story.id] = story
    return acc
  }, {} as Record<string, Story>)
}
