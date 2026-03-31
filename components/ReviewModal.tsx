'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ReviewModalProps {
  storyId: string; storyTitle: string; userId: string
  genre: string; duration_mins: number
  onClose: () => void; onSubmitted: (rating: number) => void
}

export default function ReviewModal({ storyId, storyTitle, userId, genre, duration_mins, onClose, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const displayRating = hovered || rating
  const ratingLabels: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Great', 5: 'Excellent!' }

  async function handleSubmit() {
    if (!rating) return
    setSubmitting(true); setError(null)
    const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: storyId, user_id: userId, rating, review_text: reviewText.trim() || null }) })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed to submit'); setSubmitting(false); return }
    setSubmitted(true); onSubmitted(rating)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {submitted ? (
        <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(0,0,0,0.85)', position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: '#f2ede8', borderRadius: '24px', padding: '36px 28px', margin: '20px', textAlign: 'center', maxWidth: '340px', width: '100%' }}>
            <div style={{ width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px solid rgba(34,197,94,0.3)', color: '#16a34a', fontWeight: 700, fontSize: '28px' }}>✓</div>
            <h2 style={{ fontWeight: 800, fontSize: '20px', color: '#1c1917', marginBottom: '8px' }}>Thank you!</h2>
            <p style={{ fontSize: '13px', color: '#78716c', lineHeight: 1.5, marginBottom: '20px' }}>Your review helps other listeners find their next great listen.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '24px' }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: '28px', color: i <= rating ? '#f59e0b' : '#d6cfc8' }}>★</span>)}
            </div>
            <button onClick={onClose} style={{ width: '100%', padding: '14px', background: '#1c1917', color: '#f2ede8', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>Back to Library</button>
          </div>
        </div>
      ) : (
        <div onClick={e => e.stopPropagation()} style={{ background: '#f2ede8', borderRadius: '24px 24px 0 0', padding: '0 0 40px', width: '100%', maxWidth: '480px', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)', animation: 'slideUp 0.25s ease-out' }}>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
            <div style={{ width: '40px', height: '4px', background: '#c8c0b8', borderRadius: '2px' }} />
          </div>
          <div style={{ background: '#e8e2d9', margin: '12px 20px 0', borderRadius: '10px', padding: '10px 14px', borderLeft: '3px solid #f97316' }}>
            <p style={{ fontSize: '12px', color: '#57534e', lineHeight: 1.5, margin: 0 }}>Your voice matters to our community. Reviews help fellow listeners discover great stories — and help our authors grow. <span style={{ fontWeight: 700, color: '#78716c' }}>— The Endless Tales Team</span></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px 0' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: 'linear-gradient(135deg,#1a2744,#2d1b4e)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>🎧</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#16a34a', marginBottom: '3px' }}>✓ You finished it!</p>
              <h2 style={{ fontWeight: 800, fontSize: '16px', color: '#1c1917', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storyTitle}</h2>
              <p style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>{genre} · {duration_mins} min</p>
            </div>
          </div>
          <div style={{ padding: '18px 20px 0' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Your Rating</p>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => setRating(star)} onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '44px', lineHeight: 1, color: star <= displayRating ? '#f59e0b' : '#d6cfc8', transform: star <= displayRating ? 'scale(1.1)' : 'scale(1)', transition: 'color 0.1s, transform 0.1s' }}>★</button>
              ))}
            </div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: displayRating ? '#d97706' : '#a8a29e', minHeight: '20px', marginBottom: '16px', transition: 'color 0.15s' }}>{displayRating ? ratingLabels[displayRating] : 'Tap a star to rate'}</p>
          </div>
          <div style={{ height: '1px', background: 'rgba(0,0,0,0.08)', margin: '0 20px 16px' }} />
          <div style={{ padding: '0 20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Tell other listeners (optional)</p>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="What did you think of this story?" maxLength={500} rows={3}
              style={{ width: '100%', background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', padding: '12px 14px', color: '#1c1917', fontSize: '14px', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }} />
            <p style={{ textAlign: 'right', fontSize: '10px', color: '#a8a29e', marginTop: '5px', marginBottom: '16px' }}>{reviewText.length}/500</p>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', textAlign: 'center', padding: '0 20px' }}>{error}</p>}
          <div style={{ padding: '0 20px' }}>
            <button onClick={handleSubmit} disabled={!rating || submitting}
              style={{ width: '100%', padding: '15px', background: rating ? '#22c55e' : '#d1ead9', color: rating ? '#042013' : '#a3c9ab', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 800, cursor: rating ? 'pointer' : 'default', marginBottom: '10px', transition: 'background 0.2s, color 0.2s' }}>
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
            <button onClick={onClose} style={{ display: 'block', width: '100%', padding: '10px', background: 'none', border: 'none', color: '#a8a29e', fontSize: '13px', cursor: 'pointer' }}>Maybe later</button>
          </div>
        </div>
      )}
    </div>
  )
}
