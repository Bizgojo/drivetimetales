/*
================================================================================
🔒 PROTECTED MODULE - DO NOT MODIFY WITHOUT OWNER APPROVAL
================================================================================
Module: RecommendedForYou
Location: ~/DriveTimeFiles/WorkingCodeLibrary/02_HomePage/
File: RecommendedForYou.protected.tsx

Created: January 16, 2026
Owner: Marc (Wonder Books Press / Drive Time Tales)
Status: LOCKED - Universal Template

PURPOSE:
This is the official Recommended For You module for the DTT Home Page.
Shows 4 randomly selected stories that the user has not played, saved, or sampled.

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
⚠️  DO NOT GUESS OR CREATE ALTERNATIVE DESIGNS
⚠️  ALWAYS CALL THIS MODULE WHEN BUILDING THE HOME PAGE

DISPLAY RULES:
- Shows exactly 4 stories
- Random selection
- Excludes any stories in user's user_library (played/saved/sampled)
- Uses HorizontalStoryCard template (w-28 h-28 cover with glow)
- Star ratings displayed
- NO FLAGS (for now)

DATA SOURCE:
- Table: stories (excluding IDs in user_library for current user)
- Selection: Random
- Limit: 4

================================================================================
*/

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
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
}

// =============================================================================
// HELPER: Calculate credits from duration
// =============================================================================

function getCredits(duration_mins: number): number {
  return Math.max(1, Math.floor(duration_mins / 15))
}

// =============================================================================
// HELPER: Render star rating
// =============================================================================

function StarRating({ rating, reviewCount }: { rating?: number; reviewCount?: number }) {
  if (rating === undefined) return null
  
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)
  
  return (
    <p className="text-white text-xs flex items-center gap-1">
      {rating.toFixed(1)}/5{' '}
      <span className="text-yellow-400">{'★'.repeat(fullStars)}</span>
      {hasHalf && <span className="star-half">★</span>}
      {emptyStars > 0 && <span className="text-slate-600">{'★'.repeat(emptyStars)}</span>}
      {reviewCount !== undefined && <span>{reviewCount.toLocaleString()}</span>}
    </p>
  )
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function RecommendedForYou() {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        // Step 1: Get user's library story IDs (to exclude)
        let excludeIds: string[] = []
        
        if (user) {
          const { data: libraryData } = await supabase
            .from('user_library')
            .select('story_id')
            .eq('user_id', user.id)
          
          if (libraryData) {
            excludeIds = libraryData.map(item => item.story_id)
          }
        }

        // Step 2: Get all stories excluding user's library
        let query = supabase
          .from('stories')
          .select('id, title, genre, author, duration_mins, cover_url')
        
        if (excludeIds.length > 0) {
          query = query.not('id', 'in', `(${excludeIds.join(',')})`)
        }

        const { data, error } = await query

        if (error) {
          console.error('Error fetching recommendations:', error)
        } else if (data && data.length > 0) {
          // Step 3: Randomly select 4 stories
          const shuffled = data.sort(() => Math.random() - 0.5)
          const selected = shuffled.slice(0, 4)
          
          // Note: rating and review_count would come from a reviews table
          // For now, these fields may be undefined
          setStories(selected)
        }
      } catch (err) {
        console.error('Error in fetchRecommendations:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendations()
  }, [user])

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  if (loading) {
    return (
      <section className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-bold text-white mb-4">⭐ Recommended For You</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
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
    return null // Don't render section if no stories available
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
            {/* Cover: w-28 h-28 with p-2 padding */}
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
              <p className="text-white text-xs">
                {story.duration_mins} min • {getCredits(story.duration_mins)} credits
              </p>
              <StarRating rating={story.rating} reviewCount={story.review_count} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}


// =============================================================================
// REQUIRED CSS (add to globals.css)
// =============================================================================
/*
.cover-glow {
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.4);
}

.star-half {
  background: linear-gradient(90deg, #facc15 50%, #475569 50%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
*/


// =============================================================================
// SPECS REFERENCE (DO NOT CHANGE)
// =============================================================================
/*
SECTION CONTAINER:
- px-4 pt-6 pb-4

SECTION TITLE:
- text-lg font-bold text-white mb-4
- Emoji: ⭐

CARD CONTAINER:
- space-y-3

CARD (uses HorizontalStoryCard template):
- flex
- bg-slate-800
- rounded-xl
- overflow-hidden
- hover:bg-slate-700 transition
- Entire card wrapped in Link

COVER WRAPPER:
- w-28 h-28 (112px x 112px)
- flex-shrink-0
- p-2

COVER INNER:
- w-full h-full
- rounded-lg
- overflow-hidden
- cover-glow

INFO AREA:
- flex-1
- py-2 pr-3
- flex flex-col justify-center

TYPOGRAPHY:
- Title: text-sm font-bold text-white line-clamp-1
- Genre: text-white text-xs
- Author: text-white text-xs (prefixed with "by ")
- Duration: text-white text-xs ("{duration} min • {credits} credits")
- Rating: text-white text-xs with star display

STAR RATING:
- Full star: text-yellow-400 ★
- Half star: CSS gradient (yellow|slate-600)
- Empty star: text-slate-600 ★
- Format: "{rating}/5 ★★★★☆ {review_count}"

NO FLAGS ON RECOMMENDED FOR YOU (for now)

DATA QUERY:
- Table: stories
- Exclude: story IDs in user_library for current user
- Selection: Random (shuffle then slice)
- Limit: 4
*/


// =============================================================================
// USAGE IN HOME PAGE
// =============================================================================
/*
import ContinueListening from '@/components/ContinueListening'
import NewReleases from '@/components/NewReleases'
import RecommendedForYou from '@/components/RecommendedForYou'
import BottomStickyButtons from '@/components/BottomStickyButtons'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      
      <main className="pb-24">
        <ContinueListening />
        <NewReleases />
        <RecommendedForYou />
      </main>
      
      <BottomStickyButtons />
    </div>
  )
}
*/
