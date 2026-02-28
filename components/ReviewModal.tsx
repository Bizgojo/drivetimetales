'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ReviewModalProps {
  storyId: string
  storyTitle: string
  userId: string
  genre: string
  duration_mins: number
  onClose: () => void
  onSubmitted: (rating: number) => void
}

export default function ReviewModal({ storyId, storyTitle, userId, genre, duration_mins, onClose, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const displayRating = hovered || rating
  const ratingLabels: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Great', 5: 'Excellent!' }

  async function handleSubmit() {
    if (!rating) return
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('reviews').insert({ story_id: storyId, user_id: userId, rating, review_text: reviewText.trim() || null })
    if (insertError) { setError(insertError.message); setSubmitting(false); return }
    onSubmitted(rating)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: '480px', animation: 'slideUp 0.25s ease-out' }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        <div style={{ width: '36px', height: '4px', background: '#475569', borderRadius: '2px', margin: '0 auto 20px' }} />
        <p style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px', fontWeight: 600 }}>You finished it!</p>
        <h2 style={{ color: 'white', fontSize: '17px', fontWeight: 700, margin: '0 0 20px', lineHeight: 1.2 }}>{storyTitle}</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          {[1,2,3,4,5].map(star => (
            <button key={star} onClick={() => setRating(star)} onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '36px', lineHeight: 1, color: star <= displayRating ? '#f59e0b' : '#334155', transform: star <= displayRating ? 'scale(1.15)' : 'scale(1)' }}>★</button>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: displayRating ? '#f59e0b' : '#475569', fontSize: '13px', fontWeight: 600, minHeight: '20px', margin: '0 0 16px' }}>{displayRating ? ratingLabels[displayRating] : 'Tap to rate'}</p>
        <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Tell other listeners what you thought… (optional)" maxLength={500} rows={3} style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '10px', padding: '10px 12px', color: 'white', fontSize: '13px', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <p style={{ color: '#475569', fontSize: '10px', textAlign: 'right', margin: '4px 0 16px' }}>{reviewText.length}/500</p>
        {error && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>{error}</p>}
        <button onClick={handleSubmit} disabled={!rating || submitting} style={{ width: '100%', padding: '14px', background: rating ? '#22c55e' : '#1e3a2a', color: rating ? 'black' : '#334155', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: rating ? 'pointer' : 'default' }}>{submitting ? 'Submitting…' : 'Submit Review'}</button>
        <button onClick={onClose} style={{ display: 'block', width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#475569', fontSize: '13px', cursor: 'pointer', padding: '6px' }}>Maybe later</button>
      </div>
    </div>
  )
}
