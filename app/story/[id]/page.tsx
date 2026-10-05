'use client'

/*
================================================================================
Single-story detail page (SS2-equivalent for singles) — Marc 2026-10-04
================================================================================
"More Info" on a single-story LibraryStoryCard routes here. Mirrors the
series detail page (app/series/[id]/page.tsx) layout — hero, author/narrator
pills, action row — but for exactly one story instead of an episode list.
Action row is two equal-width buttons: Play Now/Continue/Play Again on the
left, "Read eBook" on the right (hidden entirely when the story has no
prose_text yet). "Read eBook" navigates to the player with ?openReader=1,
which opens the one canonical prose reader already built into
CanonicalPlayer (its "Read It" pill) — this page does not reimplement it.
================================================================================
*/

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface StoryRow {
  id: string
  title: string
  description?: string
  duration_mins: number
  cover_url?: string
  genre: string
  author: string
  author_id?: string
  narrator_voice_id?: string
  narrator_voice_name?: string
  prose_text?: string
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

  const [story, setStory] = useState<StoryRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [authorProfile, setAuthorProfile] = useState<Profile | null>(null)
  const [narratorProfile, setNarratorProfile] = useState<Profile | null>(null)
  const [activeProfile, setActiveProfile] = useState<'author' | 'narrator' | null>(null)

  useEffect(() => { if (storyId) fetchStoryData() }, [storyId, user?.id])

  const fetchStoryData = async () => {
    try {
      setUnavailable(false)
      const { data: storyRow } = await supabase
        .from('stories')
        .select('id, title, description, duration_mins, cover_url, genre, author, author_id, narrator_voice_id, narrator_voice_name, prose_text')
        .eq('id', storyId)
        .eq('status', 'published')
        .eq('is_hidden', false)
        .maybeSingle()

      if (!storyRow) { setUnavailable(true); return }
      setStory(storyRow)

      if (storyRow.author_id) {
        const { data: authorRow } = await supabase
          .from('authors')
          .select('name, description, bio, photo_url')
          .eq('id', storyRow.author_id)
          .maybeSingle()
        setAuthorProfile(authorRow || null)
      }

      if (storyRow.narrator_voice_id) {
        const { data: narratorRow } = await supabase
          .from('narrator_voices')
          .select('name, description, bio, photo_url')
          .eq('elevenlabs_voice_id', storyRow.narrator_voice_id)
          .maybeSingle()
        setNarratorProfile(narratorRow || null)
      } else if (storyRow.narrator_voice_name) {
        const { data: narratorRow } = await supabase
          .from('narrator_voices')
          .select('name, description, bio, photo_url')
          .eq('name', storyRow.narrator_voice_name)
          .maybeSingle()
        setNarratorProfile(narratorRow || null)
      }

      if (user?.id) {
        const { data: progressRow } = await supabase
          .from('user_library')
          .select('progress, completed')
          .eq('user_id', user.id)
          .eq('story_id', storyId)
          .maybeSingle()
        if (progressRow) {
          setProgressSeconds(progressRow.progress || 0)
          setCompleted(!!progressRow.completed)
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
    const resumeAt = (!completed && progressSeconds > 15) ? Math.max(0, progressSeconds - 15) : 0
    const urlParams = new URLSearchParams({ autoplay: '1', playNow: '1' })
    if (resumeAt > 0) urlParams.set('resume', String(resumeAt))
    router.push(`/player/${story.id}?${urlParams.toString()}`)
  }

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins === 0 ? `${hours}hs` : `${hours}hs-${remMins}min`
  }

  const narratorName = narratorProfile?.name || story?.narrator_voice_name || ''
  const modalProfile = activeProfile === 'author' ? authorProfile : activeProfile === 'narrator' ? narratorProfile : null
  const inProgress = !completed && progressSeconds > 0
  const hasEbook = !!story?.prose_text

  if (loading) return <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'white', fontSize: '14px' }}>Loading...</div></div>
  if (unavailable || !story) return <div style={{ background: '#020617', minHeight: '100vh', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}><p style={{ marginBottom: 16 }}>This story isn’t available yet.</p><button onClick={() => router.push('/library')} style={{ color: '#f97316', background: 'none', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 }}>Back to Library</button></div>

  const btnLabel = completed ? 'Play Again' : inProgress ? 'Continue' : 'Play Now'
  const btnColor = completed ? '#3b82f6' : inProgress ? '#22c55e' : '#f97316'
  const btnShadow = completed ? '0 4px 12px rgba(59,130,246,0.35)' : inProgress ? '0 4px 12px rgba(34,197,94,0.35)' : '0 4px 12px rgba(249,115,22,0.35)'

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
            <span style={{ background: '#2563eb', color: 'white', fontSize: 13, padding: '3px 10px', borderRadius: 8, fontWeight: 900, boxShadow: '0 0 0 1px rgba(255,255,255,0.25)' }}>1 Episode</span>
            <span style={{ color: '#334155' }}>•</span>
            <span style={{ color: '#f97316', fontWeight: 800 }}>{formatDuration(story.duration_mins || 0)}</span>
            {story.author && (
              <>
                <span style={{ color: '#334155' }}>•</span>
                <span>by {story.author}</span>
              </>
            )}
          </div>
          {story.description && (
            <p style={{ color: 'white', fontSize: 12, lineHeight: 1.5, margin: '10px 0 0' }}>{story.description}</p>
          )}
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

      {/* Play + Read eBook row */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10 }}>
        <button
          onClick={handlePlay}
          style={{ flex: 1, padding: '14px', background: btnColor, color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: btnShadow }}
        >
          <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
          {btnLabel}
        </button>
        {hasEbook && (
          <button
            onClick={() => router.push(`/player/${story.id}?openReader=1`)}
            style={{ flex: 1, padding: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 12px rgba(59,130,246,0.35)' }}
          >
            📖 Read the eBook
          </button>
        )}
      </div>

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

    </div>
  )
}
