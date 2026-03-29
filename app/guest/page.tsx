'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import GuestSignupPrompt from '@/components/GuestSignupPrompt'
import Link from 'next/link'
import FoundingMemberBanner from '@/components/FoundingMemberBanner'

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
        .gte('duration_mins', 10)
        .lte('duration_mins', 45)
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
      <div style={{ padding: '1.25rem 1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="28" height="16" viewBox="0 0 28 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 8C7 5.24 9.24 3 12 3C13.93 3 15.6 4.07 16.5 5.65L14.5 7C14.05 6.1 13.09 5.5 12 5.5C10.62 5.5 9.5 6.62 9.5 8C9.5 9.38 10.62 10.5 12 10.5C13.09 10.5 14.05 9.9 14.5 9L16.5 10.35C15.6 11.93 13.93 13 12 13C9.24 13 7 10.76 7 8Z" fill="#e8541a"/>
            <path d="M21 8C21 10.76 18.76 13 16 13C14.07 13 12.4 11.93 11.5 10.35L13.5 9C13.95 9.9 14.91 10.5 16 10.5C17.38 10.5 18.5 9.38 18.5 8C18.5 6.62 17.38 5.5 16 5.5C14.91 5.5 13.95 6.1 13.5 7L11.5 5.65C12.4 4.07 14.07 3 16 3C18.76 3 21 5.24 21 8Z" fill="#e8541a"/>
          </svg>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>
            Endless <span style={{ color: '#f0a030' }}>Tales</span>
          </span>
        </div>
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
          🎉 Get 2 Weeks Free — Cancel Anytime
        </Link>
        <p style={{ color: 'rgba(240,236,228,0.4)', fontSize: '0.72rem' }}>Free for 14 days · then $7.99/mo · cancel anytime</p>
      </div>
    </div>
  )
}
