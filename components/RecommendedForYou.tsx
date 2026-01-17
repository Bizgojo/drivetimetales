/*
================================================================================
🔒 PROTECTED MODULE 08 - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: 08_RecommendedForYou
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: 08_RecommendedForYou.protected.tsx

Created: January 15, 2026
Updated: January 17, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: PROTECTED

PURPOSE:
This is the official Recommended For You module for the DTT Home Page.
Shows 3 randomly selected stories using HorizontalStoryCard format (Module 01).

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Shows exactly 3 stories (random selection)
- Uses HorizontalStoryCard layout (Module 01)
- Includes star ratings, review counts, and optional flags
- Entire card is clickable → /player/[id]

DATA SOURCE:
- Table: stories
- Query: Random selection, LIMIT 3

CHANGE LOG:
- 2026-01-15: Initial version (JSX fragment, 4 stories)
- 2026-01-17: Changed to standalone component, 3 stories, uses HorizontalStoryCard format

================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
  rating?: number
  review_count?: number
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// FLAG STYLES (matches Module 01 HorizontalStoryCard)
// =============================================================================

const FLAG_STYLES: Record<string, string> = {
  'free': 'bg-green-500 text-white',
  'editors-pick': 'bg-purple-500 text-white',
  'readers-choice': 'bg-blue-500 text-white',
  'trending': 'bg-pink-500 text-white',
}

const FLAG_LABELS: Record<string, string> = {
  'free': 'Free',
  'editors-pick': "Editor's Pick",
  'readers-choice': "Reader's Choice",
  'trending': 'Trending',
}

// =============================================================================
// STAR RATING RENDERER (matches Module 01 HorizontalStoryCard)
// =============================================================================

function renderStars(rating: number) {
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  
  return (
    <>
      <span className="text-yellow-400">{'★'.repeat(fullStars)}</span>
      {hasHalf && <span className="star-half">★</span>}
      {emptyStars > 0 && <span className="text-slate-600">{'★'.repeat(emptyStars)}</span>}
    </>
  )
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function RecommendedForYou() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Fetch random stories for recommendations
        const { data, error } = await supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url, rating, review_count, flag')
          .limit(3)

        if (error) {
          console.error('Error fetching recommendations:', error)
        } else if (data) {
          setStories(data)
        }
      } catch (err) {
        console.error('Error in fetchRecommendations:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendations()
  }, [])

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (loading) {
    return (
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex bg-slate-800 rounded-xl overflow-hidden animate-pulse">
              <div className="w-28 h-28 flex-shrink-0 p-2">
                <div className="w-full h-full rounded-lg bg-slate-700" />
              </div>
              <div className="flex-1 py-2 pr-3 flex flex-col justify-center gap-2">
                <div className="h-4 bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-700 rounded w-1/2" />
                <div className="h-3 bg-slate-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // =============================================================================
  // EMPTY STATE
  // =============================================================================

  if (stories.length === 0) {
    return (
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
        <p className="text-white text-sm">No recommendations yet.</p>
      </section>
    )
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <section className="px-4 pt-6 pb-4">
      <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
      
      <div className="space-y-3">
        {stories.map((story) => (
          <Link 
            key={story.id}
            href={`/player/${story.id}`}
            className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
          >
            {/* Cover: w-28 h-28 (112px) with p-2 padding */}
            <div className="w-28 h-28 flex-shrink-0 p-2">
              <div className="w-full h-full rounded-lg overflow-hidden cover-glow">
                <img 
                  src={story.cover_url || '/images/default-cover.png'} 
                  alt={story.title}
                  className="w-full h-full object-cover" 
                />
              </div>
            </div>
            
            {/* Info */}
            <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
              <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
              <p className="text-white text-xs">{story.genre}</p>
              <p className="text-white text-xs">by {story.author}</p>
              <p className="text-white text-xs">{story.duration_mins} min • {getCredits(story.duration_mins)} credits</p>
              
              {/* Rating line with optional flag */}
              {story.rating !== undefined && (
                <p className="text-white text-xs flex items-center gap-1">
                  {story.rating.toFixed(1)}/5 {renderStars(story.rating)} <span>{story.review_count?.toLocaleString()}</span>
                  {story.flag && (
                    <span className={`ml-1 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded ${FLAG_STYLES[story.flag]}`}>
                      {FLAG_LABELS[story.flag]}
                    </span>
                  )}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
