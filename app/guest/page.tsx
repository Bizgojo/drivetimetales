'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import GuestSignupPrompt from '@/components/GuestSignupPrompt'
import Link from 'next/link'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
  description: string | null
}

const GUEST_STORY_GATE = 2
const GUEST_MINUTE_GATE = 30

export default function GuestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [guestStories, setGuestStories] = useState(0)
  const [guestMinutes, setGuestMinutes] = useState(0)

  useEffect(() => {
    if (user) router.replace('/home')
  }, [user, router])

  useEffect(() => {
    const s = parseInt(localStorage.getItem('et_guest_stories') || '0', 10)
    const m = parseFloat(localStorage.getItem('et_guest_minutes') || '0')
    setGuestStories(s)
    setGuestMinutes(m)
    if (s >= GUEST_STORY_GATE || m >= GUEST_MINUTE_GATE) {
      setShowPrompt(true)
    }
  }, [])

  useEffect(() => {
    async function fetchStories() {
      const { data } = await supabase
        .from('story_analytics')
        .select('id, title, author, genre, duration_mins, cover_url, description, series_name')
        .not('cover_url', 'is', null)
        .lte('duration_mins', 60)
        .order('duration_mins', { ascending: true })
        .limit(50)
      // Only show standalone stories — no series episodes
      const standalone = (data || []).filter(s =>
        !s.series_name || s.series_name === 'None'
      ).slice(0, 12)
      setStories(standalone)
      setLoading(false)
    }
    fetchStories()
  }, [])

  const handleStoryClick = (story: Story) => {
    if (guestStories >= GUEST_STORY_GATE || guestMinutes >= GUEST_MINUTE_GATE) {
      setShowPrompt(true)
      return
    }
    const newCount = guestStories + 1
    localStorage.setItem('et_guest_stories', String(newCount))
    setGuestStories(newCount)
    router.push(`/player/${story.id}`)
  }

  if (showPrompt) {
    return (
      <GuestSignupPrompt
        minutesPlayed={Math.round(guestMinutes)}
        storiesPlayed={guestStories}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'white' }}>
      <div style={{ padding: '1.25rem 1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.4rem' }}>🎧</span>
          Endless <span style={{ color: '#f0a030', fontStyle: 'italic', marginLeft: '4px' }}>Tales</span>
        </div>
        <Link href="/signin" style={{ color: '#f0a030', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', padding: '6px 14px', border: '1px solid rgba(240,160,48,0.3)', borderRadius: '20px' }}>Sign In</Link>
      </div>

      <div style={{ padding: '2rem 1rem 1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: '#f0a030', marginBottom: '0.75rem' }}>No account needed</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', fontWeight: 700, lineHeight: 1.2, marginBottom: '0.75rem' }}>
          Pick a story.<br />Press play. Drive.
        </h1>
        <p style={{ color: 'rgba(240,236,228,0.7)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto 1rem', lineHeight: 1.5 }}>
          {GUEST_STORY_GATE - guestStories > 0
            ? `You have ${GUEST_STORY_GATE - guestStories} free ${GUEST_STORY_GATE - guestStories === 1 ? 'story' : 'stories'} left — no signup required.`
            : 'Create a free account to keep listening.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {Array.from({ length: GUEST_STORY_GATE }).map((_, i) => (
            <div key={i} style={{ width: '32px', height: '6px', borderRadius: '3px', background: i < guestStories ? '#f0a030' : 'rgba(240,160,48,0.2)' }} />
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: '#12121a', borderRadius: '12px', aspectRatio: '3/4' }} />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(240,236,228,0.5)' }}>
          <p>No stories available right now. Check back soon!</p>
        </div>
      ) : (
        <div style={{ padding: '0.5rem 1rem 6rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {stories.map(story => (
            <button key={story.id} onClick={() => handleStoryClick(story)} style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.5rem', cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}>
              <div style={{ borderRadius: '8px', overflow: 'hidden', marginBottom: '0.5rem', position: 'relative' }}>
                <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: '#f0a030', borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#0a0a0f' }}>▶ Play</div>
              </div>
              <div>
                <p style={{ color: '#f0a030', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '2px' }}>{story.genre}</p>
                <h3 style={{ color: 'white', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.25, marginBottom: '4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{story.title}</h3>
                <p style={{ color: 'rgba(240,236,228,0.5)', fontSize: '0.7rem' }}>{story.duration_mins} min · {story.author || 'Endless Tales'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '1rem', background: 'linear-gradient(to top, #0a0a0f 80%, transparent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <Link href="/signup" style={{ display: 'block', width: '100%', maxWidth: '380px', background: '#f0a030', color: '#0a0a0f', padding: '14px', borderRadius: '50px', fontSize: '0.95rem', fontWeight: 700, textAlign: 'center', textDecoration: 'none', boxShadow: '0 0 30px rgba(240,160,48,0.3)' }}>
          🎉 Get 2 Weeks Free — No Credit Card
        </Link>
        <p style={{ color: 'rgba(240,236,228,0.4)', fontSize: '0.72rem' }}>Cancel anytime · $7.99/month after trial</p>
      </div>
    </div>
  )
}
