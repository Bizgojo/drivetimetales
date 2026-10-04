'use client'
// ATL UI-CARDS Item 1: NEW single-story detail page. Same layout as SS2
// (app/series/[id]/page.tsx) but populated with just one story/episode. Reached
// from the "More Info" button on a single-story card. DTT/ET site styling:
// dark bg / white text only.
import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  description?: string
  duration_mins: number
  cover_url?: string
  episode_number?: number
  series_name?: string
  genre: string
  author: string
  author_id?: string
  narrator_voice_id?: string
  narrator_voice_name?: string
  prose_text?: string
}

interface UserProgress {
  story_id: string
  progress_seconds: number
  completed: boolean
}

interface Profile {
  name: string
  description?: string
  bio?: string
  photo_url?: string
}

export default function StoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string
  const { user } = useAuth()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [authorProfile, setAuthorProfile] = useState<Profile | null>(null)
  const [narratorProfile, setNarratorProfile] = useState<Profile | null>(null)
  const [activeProfile, setActiveProfile] = useState<'author' | 'narrator' | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => { if (storyId) fetchStoryData() }, [storyId, user?.id])

  const fetchStoryData = async () => {
    try {
      setUnavailable(false)
      const { data: storyData } = await supabase
        .from('stories')
        .select('id, title, description, duration_mins, cover_url, episode_number, series_name, genre, author, author_id, narrator_voice_id, narrator_voice_name, prose_text')
        .eq('id', storyId)
        .eq('status', 'published')
        .eq('is_hidden', false)
        .maybeSingle()

      if (!storyData) { setUnavailable(true); return }
      setStory(storyData)

      if (storyData.author_id) {
        const { data: authorRow } = await supabase
          .from('authors')
          .select('name, description, bio, photo_url')
          .eq('id', storyData.author_id)
          .maybeSingle()
        setAuthorProfile(authorRow || null)
      } else {
        setAuthorProfile(null)
      }

      if (storyData.narrator_voice_id) {
        const { data: narratorRow } = await supabase
          .from('narrator_voices')
          .select('name, description, bio, photo_url')
          .eq('elevenlabs_voice_id', storyData.narrator_voice_id)
          .maybeSingle()
        setNarratorProfile(narratorRow || null)
      } else if (storyData.narrator_voice_name) {
        const { data: narratorRow } = await supabase
          .from('narrator_voices')
          .select('name, description, bio, photo_url')
          .eq('name', storyData.narrator_voice_name)
          .maybeSingle()
        setNarratorProfile(narratorRow || null)
      } else {
        setNarratorProfile(null)
      }

      if (user?.id) {
        const { data: progressData } = await supabase
          .from('user_library')
          .select('story_id, progress, completed')
          .eq('user_id', user.id)
          .eq('story_id', storyId)
          .maybeSingle()
        if (progressData) {
          setProgress({ story_id: progressData.story_id, progress_seconds: progressData.progress || 0, completed: progressData.completed || false })
        }
      }
    } catch (err) {
      console.error('fetchStoryData error:', err)
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = () => {
    if (!story) return
    const resumeAt = (progress && !progress.completed && progress.progress_seconds > 15)
      ? Math.max(0, progress.progress_seconds - 15) : 0
    const qp = new URLSearchParams({ autoplay: '1', playNow: '1' })
    if (resumeAt > 0) qp.set('resume', String(resumeAt))
    router.push(`/player/${story.id}?${qp.toString()}`)
  }

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins === 0 ? `${hours}hs` : `${hours}hs-${remMins}min`
  }

  if (loading) return <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'white', fontSize: '14px' }}>Loading...</div></div>
  if (unavailable) return <div style={{ background: '#020617', minHeight: '100vh', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}><p style={{ marginBottom: 16 }}>This story isn’t available yet.</p><button onClick={() => router.push('/library')} style={{ color: '#f97316', background: 'none', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 }}>Back to Library</button></div>
  if (!story) return null

  const isCompleted = progress?.completed || false
  const isInProgress = !!progress && progress.progress_seconds > 0 && !isCompleted
  const progressPct = progress ? isCompleted ? 100 : Math.round((progress.progress_seconds / (story.duration_mins * 60)) * 100) : 0
  const hasEbook = !!(story.prose_text && story.prose_text.trim().length > 0)

  let actionLabel = 'Play'
  let actionColor = '#f97316'
  if (isCompleted) { actionLabel = 'Play Again'; actionColor = '#3b82f6' }
  else if (isInProgress) { actionLabel = 'Continue'; actionColor = '#22c55e' }

  const playLabel = isCompleted ? 'Play Again' : isInProgress ? 'Continue Where You Left Off' : 'Play Now'
  const playColor = isCompleted ? '#3b82f6' : isInProgress ? '#22c55e' : '#f97316'
  const playShadow = isCompleted ? '0 4px 12px rgba(59,130,246,0.35)' : isInProgress ? '0 4px 12px rgba(34,197,94,0.35)' : '0 4px 12px rgba(249,115,22,0.35)'
  const narratorName = narratorProfile?.name || story.narrator_voice_name || ''
  const modalProfile = activeProfile === 'author' ? authorProfile : activeProfile === 'narrator' ? narratorProfile : null

  return (
    <div style={{ background: '#020617', minHeight: '100vh', paddingBottom: '40px' }}>

      {/* Hero */}
      <div style={{ padding: '18px 16px 0', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: 112, height: 112, borderRadius: 12, overflow: 'hidden', flexShrink: 0, backgroundColor: '#1e1b4b', boxShadow: '0 0 0 1px rgba(255,255,255,0.45), 0 16px 36px rgba(0,0,0,0.35), 0 0 18px rgba(255,255,255,0.18)' }}>
          <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 10, color: '#f97316', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>{story.genre || 'Story'}</div>
          <h1 style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 900, fontSize: 24, color: 'white', lineHeight: 1.05, margin: '0 0 10px' }}>{story.title}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center', color: 'white', fontSize: 11, lineHeight: 1.35 }}>
            <span>1 Episode</span>
            <span style={{ color: '#334155' }}>•</span>
            <span style={{ color: '#f97316', fontWeight: 800 }}>{formatDuration(story.duration_mins)}</span>
            {story.author && (
              <>
                <span style={{ color: '#334155' }}>•</span>
                <span>by {story.author}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Profile pills */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(authorProfile || story.author) && (
          <button
            onClick={() => authorProfile && setActiveProfile('author')}
            disabled={!authorProfile}
            style={{ flex: '1 1 140px', minWidth: 0, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.9)', color: 'white', borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: authorProfile ? 'pointer' : 'default' }}
          >
            {authorProfile?.photo_url && <img src={authorProfile.photo_url} alt={authorProfile.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ fontSize: 9, color: 'white', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>Author</span>
              <span style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{authorProfile?.name || story.author}</span>
            </span>
          </button>
        )}
        {(narratorProfile || narratorName) && (
          <button
            onClick={() => narratorProfile && setActiveProfile('narrator')}
            disabled={!narratorProfile}
            style={{ flex: '1 1 140px', minWidth: 0, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.9)', color: 'white', borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: narratorProfile ? 'pointer' : 'default' }}
          >
            {narratorProfile?.photo_url && <img src={narratorProfile.photo_url} alt={narratorProfile.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ fontSize: 9, color: 'white', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>Narrator</span>
              <span style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{narratorProfile?.name || narratorName}</span>
            </span>
          </button>
        )}
      </div>

      {/* Action row — Play (+ Read eBook when story has eBook content) */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10 }}>
        <button
          onClick={handlePlay}
          style={{ flex: 1, padding: '14px', background: playColor, color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: playShadow }}
        >
          <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
          {playLabel}
        </button>
        {hasEbook && (
          <button
            onClick={() => setReaderOpen(true)}
            style={{ flex: 1, padding: '14px', background: 'rgba(15,23,42,0.9)', color: 'white', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            📖 Read eBook
          </button>
        )}
      </div>

      {/* Episode list (single entry, SS2 episode-row layout) */}
      <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Episode</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{formatDuration(story.duration_mins)} total</div>
        </div>
        <div
          onClick={handlePlay}
          style={{
            borderRadius: 12,
            border: `1px solid ${isInProgress ? 'rgba(34,197,94,0.2)' : isCompleted ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.06)'}`,
            display: 'flex',
            overflow: 'hidden',
            position: 'relative',
            cursor: 'pointer',
            minHeight: 118,
            background: '#1e293b',
          }}
        >
          {/* Cover */}
          <div style={{ width: 96, height: 96, flexShrink: 0, margin: '12px 0 12px 12px', borderRadius: 8, overflow: 'hidden', backgroundColor: '#1e1b4b', boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 0 12px rgba(255,255,255,0.2)' }}>
            <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {/* Body */}
          <div style={{ flex: 1, padding: '12px 70px 12px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 10, color: isInProgress ? '#22c55e' : isCompleted ? '#3b82f6' : 'white', fontWeight: 700, marginBottom: 2 }}>
              {story.duration_mins} min
              {isInProgress && <span style={{ marginLeft: 6 }}>· In progress</span>}
              {isCompleted && <span style={{ marginLeft: 6 }}>· Completed</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 13, color: 'white', lineHeight: 1.2, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</div>
            {story.description && (
              <p style={{ fontSize: 10, color: 'white', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{story.description}</p>
            )}
          </div>

          {/* Action pill — right side */}
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ background: actionColor, borderRadius: 20, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="6" height="8" viewBox="0 0 12 14" fill={isInProgress ? '#042013' : 'white'}><path d="M1 1l10 6-10 6V1z"/></svg>
              <span style={{ color: isInProgress ? '#042013' : 'white', fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{actionLabel}</span>
            </div>
          </div>

          {/* Progress bar */}
          {progressPct > 0 && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#334155' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: isCompleted ? '#22c55e' : '#f97316', transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      </div>

      {/* Profile modal */}
      {activeProfile && modalProfile && (
        <div
          onClick={() => setActiveProfile(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.82)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, borderRadius: 16, background: '#0f172a', border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: 18 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', background: '#1e293b', flexShrink: 0 }}>
                  {modalProfile.photo_url ? (
                    <img src={modalProfile.photo_url} alt={modalProfile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 800 }}>{modalProfile.name.slice(0, 1)}</div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#f97316', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{activeProfile}</div>
                  <div style={{ fontFamily: 'var(--font-outfit, sans-serif)', color: 'white', fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{modalProfile.name}</div>
                  {modalProfile.description && <div style={{ color: 'white', fontSize: 12, marginTop: 4 }}>{modalProfile.description}</div>}
                </div>
              </div>
              <button
                onClick={() => setActiveProfile(null)}
                aria-label="Close profile"
                style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid rgba(148,163,184,0.18)', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 18, lineHeight: '30px' }}
              >
                ×
              </button>
            </div>
            {modalProfile.bio && <p style={{ color: 'white', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{modalProfile.bio}</p>}
          </div>
        </div>
      )}

      {/* eBook reader (SS3 layout) */}
      {readerOpen && hasEbook && (
        <div
          onClick={() => setReaderOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.88)', zIndex: 60, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '18px 14px' }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, background: '#faf7f2', color: '#1f2933', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.55)', fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            <div style={{ flexShrink: 0, padding: '14px 16px', borderBottom: '1px solid rgba(15,23,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fffaf2' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#9a3412', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Read eBook</div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, lineHeight: 1.15, fontWeight: 900, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</div>
              </div>
              <button
                onClick={() => setReaderOpen(false)}
                aria-label="Close reader"
                style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid rgba(15,23,42,0.12)', background: 'rgba(15,23,42,0.04)', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: '30px', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '26px 24px 40px', fontFamily: 'Literata, Georgia, "Times New Roman", serif' }}>
              <h1 style={{ color: '#111827', fontSize: 28, lineHeight: 1.08, margin: '0 0 28px', fontWeight: 700, letterSpacing: 0 }}>{story.title}</h1>
              {story.prose_text?.split('\n\n').map((para, paraIndex) => (
                <p key={paraIndex} style={{ color: '#2c2c2c', fontSize: 17, lineHeight: 1.86, margin: paraIndex === 0 ? '0 0 20px' : '0 0 18px', textIndent: paraIndex === 0 ? 0 : '1.4em' }}>
                  {para}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
