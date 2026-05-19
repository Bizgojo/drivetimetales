'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  genre_secondary: string | null
  genre_third: string | null
  duration_mins: number
  cover_url: string | null
  series_name: string | null
  series_number: number | null
  series_total: number | null
  episode_title: string | null
  flag: string | null
  description: string | null
  is_hidden: boolean
  group_name: string | null
  is_free: boolean
  rating: number
  review_count: number
  downloads_day: number
  downloads_week: number
  downloads_month: number
  downloads_ytd: number
  downloads_total: number
  started_count: number
  finished_count: number
  skipped_count: number
  total_plays: number
  pct_started: number
  pct_finished: number
  pct_skipped: number
  created_at?: string
  status?: string | null
  audio_url?: string | null
  story_audio_url?: string | null
  series_id?: string | null
  episode_number?: number | null
  review_status?: 'pending' | 'approved' | 'not_approved' | null
  reviewed_at?: string | null
  review_notes?: string | null
}

interface Genre {
  id: string
  name: string
  display_order: number
}

interface Group {
  id: string
  name: string
  display_order: number
}

type ReviewTab = 'review' | 'approved' | 'not_approved' | 'published'
type StoryGroup =
  | { type: 'standalone'; key: string; story: Story }
  | { type: 'series'; key: string; title: string; stories: Story[] }

const FLAG_OPTIONS = [
  { value: null, label: 'No Flag', color: '#6b7280' },
  { value: 'free', label: 'Free Today', color: '#22c55e' },
  { value: 'editors-pick', label: "Editor's Pick", color: '#a855f7' },
  { value: 'readers-choice', label: "Reader's Choice", color: '#3b82f6' },
  { value: 'trending', label: 'Trending', color: '#ec4899' },
  { value: 'new', label: 'New', color: '#f97316' },
  { value: 'staff-favorite', label: 'Staff Favorite', color: '#eab308' },
]

const bg = '#FAF9F6'
const cardBg = '#FFFFFF'
const textPrimary = '#1a1a1a'
const textSecondary = '#4a4a4a'
const border = '#e0e0e0'

function isReviewReady(story: Story) {
  return !!(
    story.is_hidden &&
    story.status === 'audio_ready' &&
    (story.review_status || 'pending') === 'pending' &&
    hasRequiredStoryFields(story) &&
    story.audio_url &&
    story.cover_url
  )
}

function isApprovedReady(story: Story) {
  return !!(
    story.is_hidden &&
    story.status === 'audio_ready' &&
    story.review_status === 'approved' &&
    hasRequiredStoryFields(story) &&
    story.audio_url &&
    story.cover_url
  )
}

function isNotApproved(story: Story) {
  return story.review_status === 'not_approved'
}

function isPublicPlayable(story: Story) {
  return !!(
    story.status === 'published' &&
    story.is_hidden === false &&
    story.cover_url
  )
}

function isPublicCatalogCandidate(story: Partial<Story>) {
  return story.status === 'published' && story.is_hidden === false
}

function isPublishedToApp(story: Story) {
  return isPublicPlayable(story) && Boolean(story.cover_url)
}

function hasRequiredStoryFields(story: Partial<Story>) {
  return !!(
    story.title &&
    story.author &&
    story.genre &&
    story.description &&
    story.duration_mins &&
    story.created_at
  )
}

function canonicalStoryKey(story: Partial<Story>) {
  if (hasRealSeriesRelationship(story)) return `series:${String(story.series_id || '').trim()}:${story.episode_number}`
  return `standalone:${String(story.title || '').trim().toLowerCase()}::${String(story.author || '').trim().toLowerCase()}`
}

function hasRealSeriesRelationship(story: Partial<Story>) {
  const seriesId = String(story.series_id || '').trim()
  const episodeNumber = story.episode_number
  return !!seriesId && episodeNumber != null && String(episodeNumber).trim() !== ''
}

function newestStory(a: Partial<Story>, b: Partial<Story>) {
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
  return bTime > aTime ? b : a
}

function canonicalizeEligibleStories(rows: Partial<Story>[]) {
  const byKey = new Map<string, Partial<Story>>()
  rows.forEach((story) => {
    const key = canonicalStoryKey(story)
    const existing = byKey.get(key)
    byKey.set(key, existing ? newestStory(existing, story) : story)
  })
  return Array.from(byKey.values())
}

function storyMatchesTab(story: Story, tab: ReviewTab) {
  if (tab === 'review') return isReviewReady(story)
  if (tab === 'approved') return isApprovedReady(story)
  if (tab === 'not_approved') return isNotApproved(story)
  return isPublishedToApp(story)
}

function displaySeriesTitle(stories: Story[]) {
  const story = stories[0]
  const name = String(story?.series_name || '').trim()
  if (name && name.toLowerCase() !== 'none') return name
  return story?.title || 'Untitled Series'
}

function groupStoriesForReview(stories: Story[]) {
  const groups: StoryGroup[] = []
  const series = new Map<string, Story[]>()

  stories.forEach((story) => {
    if (hasRealSeriesRelationship(story)) {
      const key = String(story.series_id)
      const list = series.get(key) || []
      list.push(story)
      series.set(key, list)
    } else {
      groups.push({ type: 'standalone', key: `story:${story.id}`, story })
    }
  })

  series.forEach((items, seriesId) => {
    const sorted = [...items].sort((a, b) => Number(a.episode_number || 0) - Number(b.episode_number || 0))
    groups.push({ type: 'series', key: `series:${seriesId}`, title: displaySeriesTitle(sorted), stories: sorted })
  })

  return groups.sort((a, b) => {
    const aDate = a.type === 'series' ? a.stories[0]?.created_at : a.story.created_at
    const bDate = b.type === 'series' ? b.stories[0]?.created_at : b.story.created_at
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime()
  })
}

function StoryVisibilityBadges({ story }: { story: Story }) {
  const reviewReady = isReviewReady(story)
  const approvedReady = isApprovedReady(story)
  const notApproved = isNotApproved(story)
  const published = isPublishedToApp(story)
  return (
    <>
      {reviewReady && <span style={{ backgroundColor: '#f59e0b', color: '#000000', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>READY FOR REVIEW</span>}
      {approvedReady && <span style={{ backgroundColor: '#16a34a', color: '#ffffff', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>APPROVED</span>}
      {notApproved && <span style={{ backgroundColor: '#991b1b', color: '#ffffff', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>NOT APPROVED</span>}
      {published && <span style={{ backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>PUBLISHED</span>}
      {story.is_hidden && <span style={{ backgroundColor: '#dc2626', color: '#ffffff', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>HIDDEN</span>}
      {story.is_hidden && <span style={{ backgroundColor: '#111827', color: '#ffffff', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>NOT PUBLIC</span>}
    </>
  )
}

function PlayStoryButton({ storyId, title }: { storyId: string; title: string }) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    window.open(`/player/${storyId}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Play ${title}`}
      style={{ padding: '4px 8px', borderRadius: '999px', border: 'none', backgroundColor: '#f97316', color: '#ffffff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      ▶ Play
    </button>
  )
}

// ── Story Editor Panel ────────────────────────────────────────────────────────

function StoryEditorPanel({
  story,
  genres,
  onClose,
  onSaved,
  onDelete,
}: {
  story: Story
  genres: Genre[]
  onClose: () => void
  onSaved: (story: Story) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState(story.title)
  const [author, setAuthor] = useState(story.author || '')
  const [episodeTitle, setEpisodeTitle] = useState(story.episode_title || '')
  const [description, setDescription] = useState(story.description || '')
  const [primaryGenre, setPrimaryGenre] = useState((story as any).primary_genre || story.genre || '')
  const [secondaryGenre, setSecondaryGenre] = useState(story.genre_secondary || '')
  const [thirdGenre, setThirdGenre] = useState(story.genre_third || '')
  const [flag, setFlag] = useState<string | null>(story.flag)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [generatingCover, setGeneratingCover] = useState(false)
  const [coverUrl, setCoverUrl] = useState(story.cover_url || '')
  const [coverPreviewVersion, setCoverPreviewVersion] = useState(0)
  const [candidateCoverUrl, setCandidateCoverUrl] = useState('')
  const [candidatePromptPreview, setCandidatePromptPreview] = useState('')
  const [coverFeedback, setCoverFeedback] = useState('')
  const [isHidden, setIsHidden] = useState(story.is_hidden || false)
  const [groupName, setGroupName] = useState(story.group_name || '')
  const [groups, setGroups] = useState<Group[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [productionCost, setProductionCost] = useState<Record<string, string>>(() => {
    const c = (story as any).production_cost || {}
    return {
      claude: c.claude?.toString() || '',
      elevenlabs: c.elevenlabs?.toString() || '',
      openai: c.openai?.toString() || '',
      suno: c.suno?.toString() || '',
      other: c.other?.toString() || '',
    }
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('groups').select('*').order('display_order', { ascending: true }).then(({ data }) => {
      if (data) setGroups(data)
    })
  }, [])

  const wordCount = description.trim() === '' ? 0 : description.trim().split(/\s+/).length
  const overLimit = wordCount > 24
  const coverPreviewSrc = coverUrl
    ? `${coverUrl}${coverUrl.includes('?') ? '&' : '?'}adminCoverPreview=${coverPreviewVersion}`
    : '/images/default-cover.png'

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `Covers/${story.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('audio-stories')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('audio-stories').getPublicUrl(path)
      setCoverUrl(data.publicUrl)
      setCoverPreviewVersion(v => v + 1)
    } catch (err) {
      alert('Cover upload failed: ' + String(err))
    }
    setUploadingCover(false)
  }

  async function generateCoverCandidate() {
    if (generatingCover) return
    setGeneratingCover(true)
    try {
      const res = await fetch('/api/asc3/regenerate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          candidateOnly: true,
          coverFeedback: coverFeedback.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success || !data?.candidateCoverUrl) {
        throw new Error(data?.error || 'Cover candidate generation failed')
      }
      setCandidateCoverUrl(data.candidateCoverUrl)
      setCandidatePromptPreview(data.promptPreview || '')
    } catch (err) {
      alert('Cover generation failed: ' + (err instanceof Error ? err.message : String(err)))
    }
    setGeneratingCover(false)
  }

  function acceptCoverCandidate() {
    if (!candidateCoverUrl) return
    setCoverUrl(candidateCoverUrl)
    setCoverPreviewVersion(v => v + 1)
    setCandidateCoverUrl('')
    setCandidatePromptPreview('')
  }

  function rejectAndGenerateAnotherCover() {
    setCandidateCoverUrl('')
    setCandidatePromptPreview('')
    generateCoverCandidate()
  }

  async function handleSave() {
    setSaving(true)
    console.log('Saving story:', story.id, { title, author, primaryGenre })
    const { data, error } = await supabase
      .from('stories')
      .update({
        title: title.trim(),
        author: author.trim() || null,
        episode_title: episodeTitle.trim() || null,
        description: description.trim() || null,
        genre: primaryGenre || null,
        primary_genre: primaryGenre || null,
        genre_secondary: secondaryGenre || null,
        genre_third: thirdGenre || null,
        flag: flag,
        is_free: flag === 'free',
        is_hidden: isHidden,
        group_name: groupName || null,
        cover_url: coverUrl || null,
        production_cost: Object.fromEntries(
          Object.entries(productionCost)
            .filter(([_, v]) => v !== '' && !isNaN(parseFloat(v)))
            .map(([k, v]) => [k, parseFloat(v)])
        ),
      })
      .eq('id', story.id)
      .select()
    console.log('Save result:', { data, error })
    if (error) {
      alert('Save failed: ' + error.message)
    } else {
      const savedStory = (data?.[0] ? { ...story, ...data[0] } : { ...story, cover_url: coverUrl || null }) as Story
      setCoverUrl(savedStory.cover_url || '')
      setCoverPreviewVersion(v => v + 1)
      setSaved(true)
      onSaved(savedStory)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', zIndex: 51,
        width: '420px', height: '100vh',
        backgroundColor: cardBg,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Panel Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: textPrimary }}>Edit Story</div>
            <div style={{ fontSize: '11px', color: textSecondary, marginTop: '2px' }}>Changes update the app immediately</div>
          </div>
          <button onClick={onClose} style={{ background: '#e5e5e5', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: textPrimary }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>

          {/* Cover */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '8px' }}>COVER IMAGE</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e5e5e5', flexShrink: 0, border: `1px solid ${border}` }}>
                <img src={coverPreviewSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingCover}
                  style={{ padding: '8px 14px', backgroundColor: '#f97316', color: '#000000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  {uploadingCover ? 'Uploading...' : '📁 Upload New Cover'}
                </button>
                <button
                  onClick={generateCoverCandidate}
                  disabled={generatingCover}
                  style={{ padding: '8px 14px', backgroundColor: '#111827', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: generatingCover ? 'default' : 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  {generatingCover ? 'Generating...' : '✨ Generate New Cover'}
                </button>
                <div style={{ fontSize: '10px', color: textSecondary }}>JPG or PNG recommended<br />Square or portrait ratio</div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
              </div>
            </div>
            {candidateCoverUrl && (
              <div style={{ marginTop: '12px', border: `1px solid ${border}`, borderRadius: '8px', padding: '10px', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textPrimary, marginBottom: '8px' }}>AI Cover Candidate</div>
                <img src={candidateCoverUrl} alt="Generated cover candidate" style={{ width: '160px', height: '160px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${border}`, display: 'block', marginBottom: '10px' }} />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: candidatePromptPreview ? '8px' : 0 }}>
                  <button
                    onClick={acceptCoverCandidate}
                    style={{ padding: '7px 12px', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                  >
                    Accept Cover
                  </button>
                  <button
                    onClick={rejectAndGenerateAnotherCover}
                    disabled={generatingCover}
                    style={{ padding: '7px 12px', backgroundColor: '#e5e7eb', color: '#111827', border: 'none', borderRadius: '6px', cursor: generatingCover ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700 }}
                  >
                    {generatingCover ? 'Generating...' : 'Reject / Generate Another'}
                  </button>
                </div>
                {candidatePromptPreview && (
                  <details>
                    <summary style={{ fontSize: '11px', color: textSecondary, cursor: 'pointer' }}>Prompt preview</summary>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: textSecondary, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{candidatePromptPreview}</div>
                  </details>
                )}
                <div style={{ marginTop: '8px', fontSize: '10px', color: textSecondary }}>Accept updates this editor preview only. Click Save to persist.</div>
              </div>
            )}
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: textSecondary, display: 'block', marginBottom: '6px' }}>Cover Feedback / Fix Instructions</label>
              <textarea
                value={coverFeedback}
                onChange={(e) => setCoverFeedback(e.target.value)}
                placeholder={'too dark\nbrighter lighting\nclearer silhouette\nface larger\nmore western\nless horror\nstronger thumbnail readability'}
                rows={4}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  border: `1px solid ${border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: textPrimary,
                  backgroundColor: '#ffffff',
                  resize: 'vertical',
                  lineHeight: 1.4,
                }}
              />
              <div style={{ fontSize: '10px', color: textSecondary, marginTop: '5px', lineHeight: 1.35 }}>
                Optional guidance for the next generated cover candidate.
              </div>
            </div>
          </div>

          {/* Audio Player */}
          {story.audio_url && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '8px' }}>PREVIEW AUDIO</label>
              <audio
                controls
                src={story.audio_url}
                style={{ width: '100%', borderRadius: '6px', accentColor: '#f97316' }}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '6px' }}>TITLE</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${border}`, fontSize: '13px', color: '#000000', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
            />
          </div>

          {/* Author */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '6px' }}>AUTHOR</label>
            <input
              value={author}
              onChange={e => setAuthor(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${border}`, fontSize: '13px', color: '#000000', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
            />
          </div>

          {/* Episode Title (only show if part of a series) */}
          {story.series_name && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '6px' }}>EPISODE TITLE</label>
              <input
                value={episodeTitle}
                onChange={e => setEpisodeTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${border}`, fontSize: '13px', color: '#000000', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Description */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary }}>DESCRIPTION (APP CARD HOOK)</label>
              <span style={{ fontSize: '11px', color: overLimit ? '#dc2626' : wordCount >= 20 ? '#f97316' : textSecondary, fontWeight: overLimit ? 700 : 400 }}>
                {wordCount}/24 words
              </span>
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="A punchy hook that makes a driver press play. Present tense, no spoilers."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '6px',
                border: `1px solid ${overLimit ? '#dc2626' : border}`,
                fontSize: '13px', color: '#000000', backgroundColor: '#ffffff', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            {overLimit && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>⚠ Must be 24 words or fewer</div>}
          </div>

          {/* Genres */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '8px' }}>GENRES</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Primary*', value: primaryGenre, setter: setPrimaryGenre, required: true },
                { label: '2nd', value: secondaryGenre, setter: setSecondaryGenre, required: false },
                { label: '3rd', value: thirdGenre, setter: setThirdGenre, required: false },
              ].map(({ label, value, setter, required }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: textSecondary, width: '55px', flexShrink: 0 }}>{label}</span>
                  <select
                    value={value}
                    onChange={e => setter(e.target.value)}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: '6px',
                      border: `1px solid ${required && !value ? '#f97316' : border}`,
                      fontSize: '12px', color: '#000', backgroundColor: '#fff',
                    }}
                  >
                    <option value="">{required ? '— Select —' : '— None —'}</option>
                    {/* If current value isn't in the genres list, show it anyway so it doesn't appear blank */}
                    {value && !genres.find(g => g.name === value) && (
                      <option key="__current__" value={value}>{value}</option>
                    )}
                    {genres
                      .filter(g => g.name === value || (g.name !== primaryGenre && g.name !== secondaryGenre && g.name !== thirdGenre))
                      .map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Flag */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '8px' }}>FLAG</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {FLAG_OPTIONS.map(opt => (
                <button
                  key={opt.value || 'none'}
                  onClick={() => setFlag(opt.value)}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    border: `2px solid ${flag === opt.value ? opt.color : 'transparent'}`,
                    backgroundColor: flag === opt.value ? opt.color : '#f0f0f0',
                    color: flag === opt.value ? 'white' : textSecondary,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Group */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, display: 'block', marginBottom: '8px' }}>GROUP / COLLECTION</label>
            <select
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${border}`, fontSize: '13px', color: '#000000', backgroundColor: '#ffffff', boxSizing: 'border-box' as 'border-box' }}
            >
              <option value="">— No group —</option>
              {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </div>

          {/* Production Cost */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: textSecondary }}>PRODUCTION COST</label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
                Total: ${Object.values(productionCost).reduce((sum, v) => sum + (parseFloat(v) || 0), 0).toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { key: 'claude', label: 'Claude (Anthropic)', icon: '🤖' },
                { key: 'elevenlabs', label: 'ElevenLabs', icon: '🎙️' },
                { key: 'openai', label: 'OpenAI', icon: '🧠' },
                { key: 'suno', label: 'Suno', icon: '🎵' },
                { key: 'other', label: 'Other', icon: '💰' },
              ].map(({ key, label, icon }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', width: '20px' }}>{icon}</span>
                  <span style={{ fontSize: '11px', color: textSecondary, width: '120px', flexShrink: 0 }}>{label}</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: textSecondary }}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={productionCost[key]}
                      onChange={e => setProductionCost(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '6px 8px 6px 20px', borderRadius: '6px', border: `1px solid ${border}`, fontSize: '12px', color: '#000000', backgroundColor: '#ffffff', boxSizing: 'border-box' as 'border-box' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', backgroundColor: isHidden ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isHidden ? '#fecaca' : '#bbf7d0'}` }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: textPrimary }}>{isHidden ? '🙈 Hidden from app' : '👁 Visible in app'}</div>
              <div style={{ fontSize: '11px', color: textSecondary, marginTop: '2px' }}>{isHidden ? 'Users cannot see or play this story' : 'Story appears in library'}</div>
            </div>
            <button
              onClick={() => setIsHidden(!isHidden)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer',
                backgroundColor: isHidden ? '#dc2626' : '#16a34a',
                color: '#000000',
              }}
            >
              {isHidden ? 'Unhide' : 'Hide'}
            </button>
          </div>

          {/* Danger Zone — Delete */}
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: '1rem' }}>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                🗑 Delete This Story
              </button>
            ) : (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Delete permanently?</div>
                <div style={{ fontSize: '11px', color: textSecondary, marginBottom: '10px' }}>This removes the story, all user progress, and reviews. Cannot be undone.</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { onDelete(story.id); onClose() }}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#000000', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#e5e5e5', color: textPrimary, border: 'none', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

        {/* Live Card Preview */}
        <div style={{ padding: '1rem 1.25rem', borderTop: `1px solid ${border}` }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: textSecondary, marginBottom: '10px', letterSpacing: '0.05em' }}>CARD PREVIEW</div>
          <div style={{ background: '#f5f5f5', borderRadius: '14px', padding: '12px' }}>
            <div style={{ display: 'flex', background: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.06)', alignItems: 'stretch', minHeight: '130px' }}>
              {/* Cover */}
              <div style={{ flexShrink: 0, border: '10px solid #1e293b', borderRight: 'none', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '110px', height: '110px', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 0 15px rgba(255,255,255,0.4)', position: 'relative', flexShrink: 0 }}>
                  <img src={coverPreviewSrc} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* Play pill */}
                  <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(249,115,22,0.88)', borderRadius: '20px', padding: '3px 8px 3px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <svg width="6" height="8" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
                    <span style={{ color: '#000000', fontSize: '8px', fontWeight: 800, letterSpacing: '0.05em' }}>PLAY</span>
                  </div>
                </div>
              </div>
              {/* Info */}
              <div style={{ flex: 1, padding: '10px 12px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                {/* Flag */}
                <div style={{ minHeight: '18px' }}>
                  {flag && (
                    <span style={{
                      background: flag === 'new' ? '#3b82f6' : flag === 'free' ? '#9333ea' : flag === 'trending' ? '#14b8a6' : flag === 'editors-pick' ? '#9333ea' : '#f97316',
                      color: '#000000', padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em'
                    }}>
                      {flag === 'new' ? 'NEW' : flag === 'free' ? 'FREE' : flag === 'editors-pick' ? "Editor's Pick" : flag === 'trending' ? 'Trending' : flag}
                    </span>
                  )}
                </div>
                {/* Title */}
                {story.series_name && episodeTitle ? (
                  <div>
                    <div style={{ color: '#333333', fontSize: '10px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.series_name}</div>
                    <div style={{ color: '#000000', fontSize: '14px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{episodeTitle}</div>
                  </div>
                ) : (
                  <div style={{ color: '#000000', fontSize: '14px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{title || 'Title'}</div>
                )}
                {/* Author + genre + duration */}
                <div style={{ fontSize: '11px', lineHeight: 1.3 }}>
                  <div style={{ color: '#333333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author || 'Author'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#333333' }}>{primaryGenre || '—'}</span>
                    <span style={{ color: '#000000', fontWeight: 600 }}>{story.duration_mins} min</span>
                  </div>
                </div>
                {/* Description */}
                {description && (
                  <p style={{ color: '#333333', fontSize: '11px', lineHeight: 1.35, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{description}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save / Cancel */}
        <div style={{ padding: '1rem 1.25rem', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))', borderTop: `1px solid ${border}`, display: 'flex', gap: '0.75rem', position: 'sticky', bottom: 0, backgroundColor: '#fff', zIndex: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '14px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '14px',
              backgroundColor: saved ? '#2563eb' : saving ? '#9ca3af' : '#22c55e',
              color: '#000000', border: 'none',
              cursor: saving ? 'default' : 'pointer',
              touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving...' : '✓ Save Changes'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: '#e5e5e5', color: textPrimary, border: 'none', cursor: 'pointer', fontSize: '14px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
  )
}

// ── Review Cards ──────────────────────────────────────────────────────────────

function actionButtonStyle(kind: 'primary' | 'success' | 'danger' | 'muted' = 'muted') {
  const colors = {
    primary: ['#2563eb', '#ffffff'],
    success: ['#16a34a', '#ffffff'],
    danger: ['#dc2626', '#ffffff'],
    muted: ['#f3f4f6', '#111827'],
  }[kind]
  return {
    padding: '7px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: colors[0],
    color: colors[1],
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }
}

function StoryReviewCard({
  story,
  onEditClick,
  onDelete,
  onApproveForLater,
  onReject,
  onMoveToReview,
  onPublish,
  onUnpublish,
}: {
  story: Story
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  onApproveForLater: (story: Story) => void
  onReject: (story: Story) => void
  onMoveToReview: (story: Story) => void
  onPublish: (story: Story) => void
  onUnpublish: (story: Story) => void
}) {
  const isSeriesEpisode = hasRealSeriesRelationship(story)
  const rawSeriesName = String(story.series_name || '').trim()
  const seriesTitle = rawSeriesName && rawSeriesName.toLowerCase() !== 'none' ? rawSeriesName : ''

  function handleDeleteClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (!window.confirm(`Delete "${story.title}"?\n\nThis will permanently delete this published story and its related progress/review records.`)) return
    onDelete(story.id)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 16px', border: `1px solid ${border}`, borderRadius: '8px', backgroundColor: '#ffffff' }}>
      <div
        onClick={() => onEditClick(story)}
        title="Click to edit"
        style={{ width: 'clamp(180px, 16vw, 220px)', height: 'clamp(180px, 16vw, 220px)', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e5e5e5', cursor: 'pointer', border: `1px solid ${border}`, flexShrink: 0, boxShadow: '0 10px 24px rgba(15,23,42,0.12)' }}
      >
        <img src={story.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ minWidth: '260px', flex: '1 1 420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ color: textPrimary, fontWeight: 900, fontSize: '28px', lineHeight: 1.08 }}>{story.title}</div>
        </div>
        {story.episode_title && <div style={{ color: textSecondary, fontSize: '16px', fontStyle: 'italic', marginTop: '5px' }}>{story.episode_title}</div>}
        <div style={{ color: textSecondary, fontSize: '15px', marginTop: '8px', lineHeight: 1.35, fontWeight: 600 }}>
          {isSeriesEpisode ? `${seriesTitle || 'Series'} · Episode ${story.episode_number}` : 'Standalone'} · by {story.author || 'Unknown'} · {story.genre || 'No genre'} · {story.duration_mins || 0}m
        </div>
        {story.description && <div style={{ color: '#374151', fontSize: '14px', marginTop: '8px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{story.description}</div>}
        <div style={{ color: textSecondary, fontSize: '13px', marginTop: '8px', lineHeight: 1.35 }}>
          Created {story.created_at ? new Date(story.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown'} · Plays {story.downloads_total || 0} · Finish {story.pct_finished || 0}%
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch', marginLeft: 'auto', minWidth: '132px' }}>
        <PlayStoryButton storyId={story.id} title={story.title} />
        <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit</button>
        {isReviewReady(story) && <button onClick={() => onApproveForLater(story)} style={actionButtonStyle('success')}>Approve for Later</button>}
        {isReviewReady(story) && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
        {(isReviewReady(story) || isApprovedReady(story)) && <button onClick={() => onReject(story)} style={actionButtonStyle('danger')}>Not Approved</button>}
        {(isApprovedReady(story) || isNotApproved(story)) && <button onClick={() => onMoveToReview(story)} style={actionButtonStyle('muted')}>Move to Review</button>}
        {isApprovedReady(story) && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish to App</button>}
        {isPublishedToApp(story) && <button onClick={() => onUnpublish(story)} style={actionButtonStyle('danger')}>Unpublish</button>}
        <button onClick={handleDeleteClick} style={{ ...actionButtonStyle('muted'), color: '#dc2626' }}>Delete</button>
      </div>
    </div>
  )
}

function EpisodeReviewRow({
  story,
  onEditClick,
  onApproveForLater,
  onReject,
  onMoveToReview,
  onPublish,
  onUnpublish,
}: {
  story: Story
  onEditClick: (s: Story) => void
  onApproveForLater: (story: Story) => void
  onReject: (story: Story) => void
  onMoveToReview: (story: Story) => void
  onPublish: (story: Story) => void
  onUnpublish: (story: Story) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', gap: '10px', alignItems: 'center', padding: '10px', border: `1px solid ${border}`, borderRadius: '8px', backgroundColor: '#ffffff' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#1d4ed8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Episode</div>
        <div style={{ color: textPrimary, fontSize: '20px', fontWeight: 900 }}>{story.episode_number || '-'}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ color: textPrimary, fontWeight: 800, fontSize: '14px', lineHeight: 1.2 }}>{story.episode_title || story.title}</div>
        </div>
        <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px' }}>
          {story.duration_mins || 0}m · {story.genre || 'No genre'} · {story.author || 'Unknown'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <PlayStoryButton storyId={story.id} title={story.title} />
        <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit</button>
        {isReviewReady(story) && <button onClick={() => onApproveForLater(story)} style={actionButtonStyle('success')}>Approve</button>}
        {isReviewReady(story) && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
        {(isReviewReady(story) || isApprovedReady(story)) && <button onClick={() => onReject(story)} style={actionButtonStyle('danger')}>Not Approved</button>}
        {(isApprovedReady(story) || isNotApproved(story)) && <button onClick={() => onMoveToReview(story)} style={actionButtonStyle('muted')}>Move to Review</button>}
        {isApprovedReady(story) && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish</button>}
        {isPublishedToApp(story) && <button onClick={() => onUnpublish(story)} style={actionButtonStyle('danger')}>Unpublish</button>}
      </div>
    </div>
  )
}

function SeriesReviewGroup({
  group,
  expanded,
  onToggle,
  onArchiveSeries,
  onEditClick,
  onDelete,
  onApproveForLater,
  onReject,
  onMoveToReview,
  onPublish,
  onUnpublish,
}: {
  group: Extract<StoryGroup, { type: 'series' }>
  expanded: boolean
  onToggle: () => void
  onArchiveSeries: (group: Extract<StoryGroup, { type: 'series' }>) => void
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  onApproveForLater: (story: Story) => void
  onReject: (story: Story) => void
  onMoveToReview: (story: Story) => void
  onPublish: (story: Story) => void
  onUnpublish: (story: Story) => void
}) {
  const first = group.stories[0]
  const approvedCount = group.stories.filter(isApprovedReady).length
  const publishedCount = group.stories.filter(isPublishedToApp).length
  const reviewCount = group.stories.filter(isReviewReady).length

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: '#ffffff', overflow: 'hidden' }}>
      <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 16px', backgroundColor: '#ffffff' }}>
        <div style={{ width: 'clamp(180px, 16vw, 220px)', height: 'clamp(180px, 16vw, 220px)', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e5e5e5', border: `1px solid ${border}`, flexShrink: 0, boxShadow: '0 10px 24px rgba(15,23,42,0.12)' }}>
          <img src={first?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <button type="button" onClick={onToggle} style={{ minWidth: '260px', flex: '1 1 420px', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Series</div>
          <div style={{ color: textPrimary, fontWeight: 900, fontSize: '28px', lineHeight: 1.08 }}>{group.title}</div>
          <div style={{ color: textSecondary, fontSize: '15px', marginTop: '8px', lineHeight: 1.35, fontWeight: 600 }}>
            {group.stories.length} episodes · {first?.genre || 'No genre'} · by {first?.author || 'Unknown'}
          </div>
          <div style={{ color: textSecondary, fontSize: '13px', marginTop: '8px', lineHeight: 1.35 }}>
            {reviewCount} ready · {approvedCount} approved · {publishedCount} published
          </div>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', alignItems: 'stretch', marginLeft: 'auto', minWidth: '160px' }}>
          <button type="button" onClick={onToggle} style={actionButtonStyle('muted')}>{expanded ? 'Collapse' : 'Expand'}</button>
          <button type="button" onClick={() => onArchiveSeries(group)} style={actionButtonStyle('danger')}>
            {publishedCount > 0 ? 'Unpublish / Archive Series' : 'Archive Series'}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 14px 14px 14px', backgroundColor: '#f8fafc' }}>
          {group.stories.map((story) => (
            <EpisodeReviewRow
              key={story.id}
              story={story}
              onEditClick={onEditClick}
              onApproveForLater={onApproveForLater}
              onReject={onReject}
              onMoveToReview={onMoveToReview}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminStoriesPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [viewMode, setViewMode] = useState<'all' | 'series' | 'standalone'>('all')
  const [activeTab, setActiveTab] = useState<ReviewTab>('review')
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({})
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const editingStoryRef = useRef<Story | null>(null)

  useEffect(() => {
    fetchStories()
    fetchGenres()
  }, [])

  async function fetchStories() {
    setLoading(true)
    const { data: readinessRows, error: readinessError } = await supabase
      .from('stories')
      .select('id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,status,is_hidden,created_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,production_cost')
      .order('created_at', { ascending: false })

    if (readinessError) {
      console.error('Error fetching story readiness rows:', readinessError)
      setStories([])
      setLoading(false)
      return
    }

    const storyRows = (readinessRows || []) as Partial<Story>[]
    const publicCandidateIds = new Set(
      storyRows
        .filter(isPublicCatalogCandidate)
        .map((story) => story.id)
        .filter(Boolean) as string[]
    )
    const reviewWorkflowRows = storyRows.filter((story) =>
      story.status === 'audio_ready' ||
      story.status === 'published' ||
      story.review_status === 'approved' ||
      story.review_status === 'not_approved'
    )
    const eligibleIds = Array.from(new Set([
      ...reviewWorkflowRows.map((story) => story.id).filter(Boolean) as string[],
    ]))
    const readinessById = new Map(
      storyRows
        .filter((story) => story.id && eligibleIds.includes(story.id))
        .map((story) => [story.id, story])
    )

    if (eligibleIds.length === 0) {
      setStories([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('story_analytics')
      .select('*')
      .in('id', eligibleIds)
      .order('created_at', { ascending: false })

    const analyticsById = new Map((data || []).map((story: any) => [story.id, story]))
    const analyticsPublicIds = new Set(
      (data || [])
        .filter((story: any) => publicCandidateIds.has(story.id) && story.is_hidden === false && story.cover_url)
        .map((story: any) => story.id)
    )
    const loadedStories = eligibleIds
      .map((id) => ({ ...(analyticsById.get(id) || {}), ...(readinessById.get(id) || {}) }) as Story)
      .filter((story) => {
        if (isPublishedToApp(story)) return analyticsPublicIds.has(story.id)
        return isReviewReady(story) || isApprovedReady(story) || isNotApproved(story)
      })
    setStories(loadedStories)
    if (error) console.error('Error fetching story analytics:', error)
    setLoading(false)
  }

  async function fetchGenres() {
    const { data } = await supabase
      .from('genres')
      .select('*')
      .eq('active', true)
      .order('display_order', { ascending: true })
    if (data) setGenres(data)
  }

  async function setReviewStatus(story: Story, reviewStatus: 'approved' | 'not_approved') {
    const notes = reviewStatus === 'not_approved'
      ? window.prompt(`Optional review note for "${story.title}"`, story.review_notes || '') || ''
      : story.review_notes || ''
    const { error } = await supabase
      .from('stories')
      .update({
        review_status: reviewStatus,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq('id', story.id)
    if (error) {
      alert(`Review update failed: ${error.message}`)
      return
    }
    await fetchStories()
  }

  async function moveToReview(story: Story) {
    const { error } = await supabase
      .from('stories')
      .update({
        review_status: 'pending',
        reviewed_at: null,
        review_notes: null,
      })
      .eq('id', story.id)
    if (error) {
      alert(`Move to Review failed: ${error.message}`)
      return
    }
    await fetchStories()
  }

  const publishStory = async (story: Story) => {
    if (!window.confirm(`Publish "${story.title}" to the app?`)) return
    try {
      const res = await fetch('/api/admin/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          is_free: story.is_free,
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) {
        alert('Publish failed: ' + (result.error || `HTTP ${res.status}`))
        return
      }
      await fetchStories()
    } catch (err) {
      alert('Publish failed: ' + String(err))
    }
  }

  async function unpublishStory(story: Story) {
    if (!window.confirm(`Unpublish "${story.title}" and return it to Approved and Ready?`)) return
    const { error } = await supabase
      .from('stories')
      .update({
        status: 'audio_ready',
        is_hidden: true,
        published_on: null,
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', story.id)
    if (error) {
      alert(`Unpublish failed: ${error.message}`)
      return
    }
    await fetchStories()
  }

  async function archiveSeries(group: Extract<StoryGroup, { type: 'series' }>) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return

    const hasPublishedEpisode = group.stories.some(isPublishedToApp)
    const warning = hasPublishedEpisode
      ? `Unpublish and archive the entire series "${group.title}"?\n\nThis will remove all published episodes from the public app and move every episode to Not Approved. No files or story rows will be deleted.`
      : `Archive the entire series "${group.title}" from the review workflow?\n\nThis will move every episode to Not Approved. No files or story rows will be deleted.`

    if (!window.confirm(warning)) return

    const updates: Record<string, unknown> = hasPublishedEpisode
      ? {
          status: 'audio_ready',
          is_hidden: true,
          published_on: null,
          review_status: 'not_approved',
          reviewed_at: new Date().toISOString(),
          review_notes: 'Unpublished and archived from admin review workflow',
        }
      : {
          review_status: 'not_approved',
          reviewed_at: new Date().toISOString(),
          review_notes: 'Archived from admin review workflow',
        }

    const { error } = await supabase
      .from('stories')
      .update(updates)
      .eq('series_id', seriesId)

    if (error) {
      alert(`Series archive failed: ${error.message}`)
      return
    }

    setExpandedSeries(prev => ({ ...prev, [group.key]: false }))
    await fetchStories()
  }

  async function publishAllApproved() {
    const approved = stories.filter(isApprovedReady)
    if (approved.length === 0) return
    if (!window.confirm(`Publish ${approved.length} approved item(s) to the app?`)) return
    for (const story of approved) {
      const res = await fetch('/api/admin/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, is_free: story.is_free }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        alert(`Publish stopped at "${story.title}": ${result.error || `HTTP ${res.status}`}`)
        await fetchStories()
        return
      }
    }
    await fetchStories()
  }

  async function deleteStory(storyId: string) {
    try {
      const res = await fetch('/api/admin/delete-story', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const result = await res.json()
      if (!result.success) alert('Delete failed: ' + (result.error || 'Unknown error'))
    } catch (err) {
      alert('Delete failed: ' + String(err))
    }
    fetchStories()
  }

  const genreNames = ['All', ...genres.map(g => g.name)]
  const tabOptions: Array<{ id: ReviewTab; label: string; description: string }> = [
    { id: 'review', label: 'Ready For Review', description: 'Hidden from the app and waiting for Marc.' },
    { id: 'approved', label: 'Approved and Ready to Publish', description: 'Approved by Marc, still hidden.' },
    { id: 'not_approved', label: 'Not Approved', description: 'Rejected or held for revision history.' },
    { id: 'published', label: 'Published to App', description: 'Mirrors the public library eligibility.' },
  ]

  const filteredStories = stories
    .filter(s => {
      const matchesSearch = search === '' ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.author.toLowerCase().includes(search.toLowerCase()) ||
        (s.series_name || '').toLowerCase().includes(search.toLowerCase())
      const matchesGenre = genreFilter === 'All' ||
        s.genre === genreFilter ||
        s.genre_secondary === genreFilter ||
        s.genre_third === genreFilter
      const matchesView = viewMode === 'all' ||
        (viewMode === 'series' && hasRealSeriesRelationship(s)) ||
        (viewMode === 'standalone' && !hasRealSeriesRelationship(s))
      return matchesSearch && matchesGenre && matchesView && storyMatchesTab(s, activeTab)
    })
  const visibleStories = canonicalizeEligibleStories(filteredStories) as Story[]
  const groupedStories = groupStoriesForReview(visibleStories)
  const seriesEpisodeCount = visibleStories.filter(s => hasRealSeriesRelationship(s)).length
  const standaloneCount = visibleStories.length - seriesEpisodeCount

  const totalStories = visibleStories.length
  const totalDownloads = visibleStories.reduce((sum, s) => sum + (s.downloads_total || 0), 0)
  const avgCompletion = visibleStories.length > 0
    ? Math.round(visibleStories.reduce((sum, s) => sum + (s.pct_finished || 0), 0) / visibleStories.length)
    : 0
  const tabCounts = tabOptions.reduce((counts, tab) => {
    counts[tab.id] = stories.filter((story) => storyMatchesTab(story, tab.id)).length
    return counts
  }, {} as Record<ReviewTab, number>)

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: textPrimary, margin: 0 }}>
            Content Approval ({totalStories})
          </h1>
          <p style={{ color: textSecondary, fontSize: '13px', margin: '4px 0 0 0' }}>
            {seriesEpisodeCount} series episodes · {standaloneCount} standalone · {totalDownloads} total downloads · {avgCompletion}% avg completion
          </p>
        </div>
        {activeTab === 'approved' && (
          <button onClick={publishAllApproved} disabled={tabCounts.approved === 0} style={{ ...actionButtonStyle('primary'), opacity: tabCounts.approved === 0 ? 0.45 : 1 }}>
            Publish All Approved
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {tabOptions.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.9rem',
              borderRadius: '8px',
              border: `1px solid ${activeTab === tab.id ? '#f97316' : border}`,
              backgroundColor: activeTab === tab.id ? '#fff7ed' : '#ffffff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: textPrimary, fontSize: '13px', fontWeight: 800 }}>{tab.label}</span>
              <span style={{ color: activeTab === tab.id ? '#f97316' : textSecondary, fontSize: '18px', fontWeight: 900 }}>{tabCounts[tab.id] || 0}</span>
            </div>
            <div style={{ color: textSecondary, fontSize: '11px', lineHeight: 1.35, marginTop: '5px' }}>{tab.description}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search title, author, or series..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, flex: 1, minWidth: '200px', color: '#000000', backgroundColor: '#ffffff', fontSize: '14px' }}
        />
        <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, color: '#000000', backgroundColor: '#ffffff', fontSize: '14px' }}>
          {genreNames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'series', 'standalone'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: viewMode === mode ? '#1a1a1a' : '#ffffff', color: viewMode === mode ? '#ffffff' : '#000000', fontSize: '13px', fontWeight: viewMode === mode ? 700 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
            {mode === 'all' ? '📋 All' : mode === 'series' ? '📺 Series' : '🎯 Standalone'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', padding: '0.4rem 0.75rem', fontSize: '12px', color: textSecondary }}>
          {visibleStories.length} episodes/stories · {groupedStories.length} top-level cards
        </div>
      </div>

      {/* Review cards */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}`, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {groupedStories.map((group) => {
          if (group.type === 'standalone') {
            return (
              <StoryReviewCard
                key={group.key}
                story={group.story}
                onEditClick={s => { editingStoryRef.current = s; setEditingStory(s) }}
                onDelete={deleteStory}
                onApproveForLater={(story) => setReviewStatus(story, 'approved')}
                onReject={(story) => setReviewStatus(story, 'not_approved')}
                onMoveToReview={moveToReview}
                onPublish={publishStory}
                onUnpublish={unpublishStory}
              />
            )
          }
          return (
            <SeriesReviewGroup
              key={group.key}
              group={group}
              expanded={Boolean(expandedSeries[group.key])}
              onToggle={() => setExpandedSeries(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
              onArchiveSeries={archiveSeries}
              onEditClick={s => { editingStoryRef.current = s; setEditingStory(s) }}
              onDelete={deleteStory}
              onApproveForLater={(story) => setReviewStatus(story, 'approved')}
              onReject={(story) => setReviewStatus(story, 'not_approved')}
              onMoveToReview={moveToReview}
              onPublish={publishStory}
              onUnpublish={unpublishStory}
            />
          )
        })}
        {groupedStories.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: textSecondary }}>
            No stories found matching this review section.
          </div>
        )}
      </div>

      {/* Story Editor Panel */}
      {editingStory && (
        <StoryEditorPanel
          story={editingStoryRef.current!}
          genres={genres}
          onClose={() => { setEditingStory(null); editingStoryRef.current = null }}
          onDelete={async (storyId) => {
            try {
              const res = await fetch('/api/admin/delete-story', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId }) })
              const result = await res.json()
              if (!result.success) alert('Delete failed: ' + (result.error || 'Unknown error'))
            } catch (err) { alert('Delete failed: ' + String(err)) }
            fetchStories()
          }}
          onSaved={(savedStory) => {
            editingStoryRef.current = savedStory
            setEditingStory(savedStory)
            setStories(prev => prev.map(story => story.id === savedStory.id ? { ...story, ...savedStory } : story))
            fetchStories()
          }}
        />
      )}
    </div>
  )
}
