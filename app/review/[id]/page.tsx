'use client'
import StickyHeaderFull from '@/components/StickyHeaderFull'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface Story {
  id: string
  title: string
  author: string
  cover_url: string
}

interface ReviewSettings {
  creditsPerReview: number
  maxReviews: number
}

export default function ReviewPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string

  const [story, setStory] = useState<Story | null>(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ReviewSettings>({ creditsPerReview: 2, maxReviews: 10 })
  const [userReviewCount, setUserReviewCount] = useState(0)
  const [creditsEarned, setCreditsEarned] = useState(0)

  useEffect(() => {
    if (storyId) {
      loadStory()
      loadSettings()
      if (user) {
        loadUserReviewStats()
      }
    }
  }, [storyId, user])

  async function loadStory() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) return

      const response = await fetch(
        `${url}/rest/v1/stories?id=eq.${storyId}&select=id,title,author,cover_url`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )

      if (response.ok) {
        const data = await response.json()
        if (data.length > 0) {
          setStory(data[0])
        }
      }
    } catch (error) {
      console.error('Error loading story:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadSettings() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) return

      const response = await fetch(
        `${url}/rest/v1/dtt_settings?key=in.(review_credits_per_review,review_credits_max_reviews)&select=key,value`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )

      if (response.ok) {
        const data = await response.json()
        const perReview = data.find((d: any) => d.key === 'review_credits_per_review')
        const maxReviews = data.find((d: any) => d.key === 'review_credits_max_reviews')
        setSettings({
          creditsPerReview: parseInt(perReview?.value || '2'),
          maxReviews: parseInt(maxReviews?.value || '10')
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  async function loadUserReviewStats() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key || !user) return

      const response = await fetch(
        `${url}/rest/v1/reviews?user_id=eq.${user.id}&select=id,credits_earned`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )

      if (response.ok) {
        const data = await response.json()
        setUserReviewCount(data.length)
        const totalEarned = data.reduce((sum: number, r: any) => sum + (r.credits_earned || 0), 0)
        setCreditsEarned(totalEarned)
      }
    } catch (error) {
      console.error('Error loading review stats:', error)
    }
  }

  async function submitReview() {
    if (!user || !storyId || rating === 0) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          storyId,
          rating,
          reviewText
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.creditsEarned > 0) {
          alert(`Thank you for your review! You earned ${data.creditsEarned} credits!`)
        } else {
          alert('Thank you for your review!')
        }
        router.push('/collection')
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to submit review')
      }
    } catch (error) {
      console.error('Error submitting review:', error)
      alert('Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  const canEarnCredits = userReviewCount < settings.maxReviews
  const remainingCreditReviews = Math.max(0, settings.maxReviews - userReviewCount)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Story not found</p>
          <button onClick={() => router.back()} className="text-orange-400">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <StickyHeaderFull />

      <div className="px-4 py-6 pb-32 max-w-lg mx-auto">
        {/* Story Info */}
        <div className="flex gap-4 mb-6">
          {story.cover_url && (
            <img 
              src={story.cover_url} 
              alt={story.title}
              className="w-20 h-28 object-cover rounded-lg"
            />
          )}
          <div>
            <h1 className="text-xl font-bold text-white mb-1">{story.title}</h1>
            <p className="text-gray-400 text-sm">{story.author}</p>
          </div>
        </div>

        {/* Review Prompt */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <p className="text-white mb-2">📝 Share Your Thoughts</p>
          <p className="text-gray-400 text-sm">
            Leave an honest review to help other listeners discover great stories. Your feedback matters!
          </p>
        </div>

        {/* Star Rating */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-3">Your Rating</label>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  fontSize: '40px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                  transform: (hoverRating >= star || rating >= star) ? 'scale(1.1)' : 'scale(1)'
                }}
              >
                {(hoverRating >= star || rating >= star) ? '⭐' : '☆'}
              </button>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-2">
            {rating === 0 ? 'Tap to rate' : `${rating} star${rating > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Review Text */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-2">Your Review (optional)</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="What did you enjoy about this story? Would you recommend it to others?"
            rows={4}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={submitReview}
          disabled={submitting || rating === 0}
          className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-bold rounded-xl transition-colors"
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>

        {rating === 0 && (
          <p className="text-center text-gray-500 text-sm mt-2">Please select a rating to submit</p>
        )}
      </div>

      {/* Credit Earnings Sticky Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1e293b',
        borderTop: '1px solid #334155',
        padding: '12px 16px',
        zIndex: 40
      }}>
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div>
            <p className="text-white text-sm font-medium">💰 Review Rewards</p>
            <p className="text-gray-400 text-xs">
              {canEarnCredits 
                ? `Earn ${settings.creditsPerReview} credits per review (${remainingCreditReviews} left)`
                : 'Maximum credit rewards reached'
              }
            </p>
          </div>
          <div className="text-right">
            <p className="text-orange-400 font-bold">{creditsEarned} credits</p>
            <p className="text-gray-500 text-xs">earned from reviews</p>
          </div>
        </div>
      </div>
    </div>
  )
}
