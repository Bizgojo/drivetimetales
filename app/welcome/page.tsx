'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import GuestSignupPrompt from '@/components/GuestSignupPrompt'
import InstallAppBanner from '@/components/InstallAppBanner'

interface Story {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  cover_url: string | null
}

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')
  const partner = searchParams.get('partner')

  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [guestMinutes, setGuestMinutes] = useState(0)
  const [guestStories, setGuestStories] = useState(0)

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) { router.push('/home'); return }
      } catch (e) {}
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    const minutes = parseInt(localStorage.getItem('et_guest_minutes') || '0', 10)
    const storiesPlayed = parseInt(localStorage.getItem('et_guest_stories') || '0', 10)
    setGuestMinutes(minutes)
    setGuestStories(storiesPlayed)
    if (storiesPlayed >= 2 || minutes >= 30) setShowPrompt(true)
  }, [])

  useEffect(() => {
    async function fetchStories() {
      const { data, error } = await supabase
        .from('story_analytics')
        .select('id, title, genre, author, duration_mins, cover_url')
        .order('created_at', { ascending: false })
        .limit(20)
      console.log('[Welcome] stories:', data, 'error:', error)
      setStories(data || [])
      setLoading(false)
    }
    fetchStories()
  }, [])

  const handleStoryClick = (story: Story) => {
    const currentMinutes = parseInt(localStorage.getItem('et_guest_minutes') || '0', 10)
    const currentStories = parseInt(localStorage.getItem('et_guest_stories') || '0', 10)
    if (currentStories >= 2 || currentMinutes >= 30) { setShowPrompt(true); return }
    const newStories = currentStories + 1
    const newMinutes = currentMinutes + story.duration_mins
    localStorage.setItem('et_guest_stories', String(newStories))
    localStorage.setItem('et_guest_minutes', String(newMinutes))
    setGuestMinutes(newMinutes)
    setGuestStories(newStories)
    router.push('/player/' + story.id)
  }

  if (showPrompt) return <GuestSignupPrompt minutesPlayed={guestMinutes} storiesPlayed={guestStories} />

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: 'white' }}>
      <div style={{ padding: '14px 16px 12px', textAlign: 'center', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '2px' }}>
          <img src="/images/et-logo.png" alt="Endless Tales" style={{ height: '24px', objectFit: 'contain' }} />
          <span style={{ fontSize: '22px', fontWeight: 900, color: 'white' }}>Endless </span>
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#f97316' }}>Tales</span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '13px' }}>Audio stories for your me-time</div>
      </div>

      <main style={{ maxWidth: '480px', margin: '0 auto', paddingBottom: '100px' }}>
        {ref && (
          <div style={{ margin: '12px 16px', background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '14px', padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>🎁</div>
            <div style={{ color: 'white', fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>You've been given 2 Weeks Free!</div>
            <div style={{ color: 'white', fontSize: '12px' }}>A friend shared their Endless Tales link with you. Subscribe to claim your free 14 days.</div>
          </div>
        )}
        {partner && (
          <div style={{ margin: '12px 16px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px', padding: '10px 16px', textAlign: 'center', color: '#22c55e', fontSize: '13px' }}>
            Welcome from {partner.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} — enjoy your free stories!
          </div>
        )}

        <div style={{ margin: '12px 16px', textAlign: 'center', padding: '8px 0' }}>
          <img src="/images/og-share.png" alt="Endless Tales" style={{ width: '70px', height: '70px', objectFit: 'contain', marginBottom: '8px', mixBlendMode: 'multiply' } as any} />
          <h2 style={{ color: 'white', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Start Listening Free</h2>
          <p style={{ color: 'white', fontSize: '12px', lineHeight: 1.6 }}>Enjoy any two stories or at least 30 minutes free — no account needed.</p>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #1e293b' }}>
          <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 800 }}>👇 Tap any story to play for free</div>
        </div>

        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading stories...</div>
          ) : stories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No stories available right now.</div>
          ) : stories.map(story => (
            <div key={story.id} onClick={() => handleStoryClick(story)}
              style={{ background: '#1e293b', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', cursor: 'pointer', border: '1px solid rgba(148,163,184,0.06)', height: '134px' }}>
              <div style={{ width: '110px', height: '110px', borderRadius: '10px', flexShrink: 0, overflow: 'hidden', backgroundColor: '#334155' }}>
                {story.cover_url
                  ? <img src={story.cover_url} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>🎧</div>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
                <div style={{ color: 'white', fontSize: '14px', fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{story.title}</div>
                <div style={{ color: 'white', fontSize: '11px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1, margin: '4px 0' } as any}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px' }}>⏱ {story.duration_mins} min</span>
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>{story.genre}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0f172a', borderTop: '1px solid #1e293b', padding: '12px 16px 20px', zIndex: 50 }}>
        <div style={{ display: 'flex', gap: '10px', maxWidth: '480px', margin: '0 auto' }}>
          <Link href="/signup" style={{ flex: 1, background: '#22c55e', color: '#042013', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 800, textAlign: 'center', textDecoration: 'none', lineHeight: 1.3, display: 'block' }}>
            🎉 Subscribe — 2 Weeks Free!
          </Link>
          <Link href="/library" style={{ flex: 1, background: '#f97316', color: 'white', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', lineHeight: 1.3, display: 'block' }}>
            📚 100's More Stories in the Library
          </Link>
        </div>
      </div>

      <InstallAppBanner />
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  )
}
