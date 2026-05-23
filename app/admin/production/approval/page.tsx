'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
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
  expected_episode_count?: number | null
  present_episode_count?: number | null
  approval_ready?: boolean
  approval_blocking_reasons?: string[]
  approval_entry_reason?: string | null
  source_job_id?: string | null
  audio_ready?: boolean
  story_audio_ready?: boolean
  cover_ready?: boolean
  prose_ready?: boolean
  author_ready?: boolean
  narrator_voice_ready?: boolean
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
  | { type: 'series'; key: string; title: string; stories: Story[]; expectedEpisodeCount?: number; presentEpisodeCount?: number; missingEpisodes?: number[]; approvalBlockingReasons?: string[]; sourceJobId?: string | null }

type ApprovalEpisode = {
  storyId: string
  title: string | null
  episodeNumber: number | null
  status: string | null
  reviewStatus: 'pending' | 'approved' | 'not_approved' | null
  isHidden: boolean | null
  publishedOn: string | null
  audioReadiness: {
    audioUrl: boolean
    storyAudioUrl: boolean
    finalMix?: boolean
  }
  packagingReadiness: {
    coverUrl: boolean
    proseText: boolean
    authorId: boolean
    narratorVoiceId: boolean
    narratorVoiceName?: boolean
  }
  approvalReady: boolean
  approvalBlockingReasons: string[]
  approvalEntryReason: string
  sourceJobId: string | null
}

type ApprovalItem =
  | {
      type: 'series'
      seriesId: string
      title: string
      expectedEpisodeCount: number
      presentEpisodeCount: number
      missingEpisodes: number[]
      approvalReady: boolean
      approvalEntryReason: string
      approvalBlockingReasons: string[]
      sourceJobId: string | null
      episodes: ApprovalEpisode[]
    }
  | {
      type: 'story'
      storyId: string
      title: string
      approvalReady: boolean
      approvalEntryReason: string
      approvalBlockingReasons: string[]
      sourceJobId: string | null
      episode: ApprovalEpisode
    }

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

function storyBelongsInTab(story: Story, tab: ReviewTab) {
  if (storyMatchesTab(story, tab)) return true
  if (tab !== 'review') return false
  return !!(
    story.is_hidden &&
    (story.review_status || 'pending') === 'pending' &&
    (
      story.audio_ready ||
      story.story_audio_ready ||
      story.audio_url ||
      story.story_audio_url ||
      story.status === 'audio_ready'
    )
  )
}

function groupMatchesTab(group: StoryGroup, tab: ReviewTab) {
  if (group.type === 'standalone') return storyBelongsInTab(group.story, tab)
  return group.stories.some((story) => storyBelongsInTab(story, tab))
}

function approvalStatusLabel(story: Story) {
  if (isPublishedToApp(story)) return 'Published'
  if (isApprovedReady(story)) return 'Approved'
  if (isNotApproved(story)) return 'Not Approved'
  if (!story.audio_ready && !story.story_audio_ready && !story.audio_url && !story.story_audio_url) return 'Missing Audio'
  if (!story.cover_ready || !story.prose_ready || !story.author_ready || !story.narrator_voice_ready) return 'Missing Packaging'
  if (isReviewReady(story) || story.approval_ready) return 'Ready for Review'
  return 'Blocked'
}

function approvalStatusColor(label: string) {
  if (label === 'Ready for Review') return ['#f59e0b', '#000000']
  if (label === 'Approved') return ['#16a34a', '#ffffff']
  if (label === 'Not Approved') return ['#991b1b', '#ffffff']
  if (label === 'Missing Audio') return ['#7c2d12', '#ffffff']
  if (label === 'Missing Packaging') return ['#92400e', '#ffffff']
  if (label === 'Published') return ['#2563eb', '#ffffff']
  return ['#374151', '#ffffff']
}

function seriesBlockedExplanation(title: string, renderedCount: number, expected: number, missingAudioCount: number, missingPackagingCount: number, statusBlockedCount: number, notApprovedCount: number) {
  if (notApprovedCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review because ${notApprovedCount} episode${notApprovedCount === 1 ? ' is' : 's are'} Not Approved.`
  if (missingAudioCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review due to missing audio.`
  if (missingPackagingCount > 0 && statusBlockedCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review due to status and missing packaging metadata.`
  if (missingPackagingCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review due to missing packaging metadata.`
  if (statusBlockedCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review due to production status.`
  return `${title}: ${renderedCount}/${expected} rendered • blocked from review.`
}

function SeriesStatChip({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'ready' | 'blocked' | 'danger' }) {
  const colors = tone === 'ready'
    ? ['#ecfdf5', '#047857', '#a7f3d0']
    : tone === 'blocked'
      ? ['#fff7ed', '#9a3412', '#fed7aa']
      : tone === 'danger'
        ? ['#fef2f2', '#991b1b', '#fecaca']
        : ['#f8fafc', '#334155', '#e2e8f0']
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px', padding: '5px 8px', borderRadius: '6px', backgroundColor: colors[0], color: colors[1], border: `1px solid ${colors[2]}`, fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap' }}>
      <span>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 900 }}>{value}</span>
    </span>
  )
}

function SeriesReadinessSummary({
  title,
  expected,
  present,
  readyCount,
  notApprovedCount,
  blockedCount,
  missing,
  renderedCount,
  missingPackagingCount,
  missingAudioCount,
  approvedCount,
  publishedCount,
  blockedExplanation,
  approvalBlockingReasons,
}: {
  title: string
  expected: number
  present: number
  readyCount: number
  notApprovedCount: number
  blockedCount: number
  missing: number[]
  renderedCount: number
  missingPackagingCount: number
  missingAudioCount: number
  approvedCount: number
  publishedCount: number
  blockedExplanation: string
  approvalBlockingReasons?: string[]
}) {
  return (
    <div style={{ margin: '0 14px 14px 14px', padding: '12px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #dbe4ef' }}>
      <div style={{ color: '#0f172a', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        Approval readiness
      </div>
      <div style={{ color: '#334155', fontSize: '13px', lineHeight: 1.35, fontWeight: 800, marginBottom: '9px' }}>
        {title}: {expected} total episodes • {present} present • {renderedCount}/{expected} rendered
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <SeriesStatChip label="Total" value={expected} />
        <SeriesStatChip label="Ready" value={readyCount} tone="ready" />
        <SeriesStatChip label="Not Approved" value={notApprovedCount} tone={notApprovedCount > 0 ? 'danger' : 'neutral'} />
        <SeriesStatChip label="Blocked" value={blockedCount} tone={blockedCount > 0 ? 'blocked' : 'neutral'} />
        <SeriesStatChip label="Missing" value={missing.length ? missing.join(', ') : 0} tone={missing.length ? 'danger' : 'neutral'} />
        <SeriesStatChip label="Rendered" value={`${renderedCount}/${expected}`} tone={missingAudioCount > 0 ? 'danger' : 'ready'} />
      </div>
      <div style={{ color: '#374151', fontSize: '12px', marginTop: '8px', lineHeight: 1.35 }}>
        Missing packaging {missingPackagingCount} • Missing audio {missingAudioCount} • Approved {approvedCount} • Published {publishedCount}
      </div>
      {blockedExplanation && (
        <div style={{ marginTop: '10px', padding: '9px 10px', borderRadius: '8px', backgroundColor: missingAudioCount > 0 ? '#fef2f2' : '#fff7ed', border: `1px solid ${missingAudioCount > 0 ? '#fecaca' : '#fed7aa'}`, color: missingAudioCount > 0 ? '#991b1b' : '#9a3412', fontSize: '12px', lineHeight: 1.35, fontWeight: 800 }}>
          {blockedExplanation}
        </div>
      )}
      {Boolean(approvalBlockingReasons?.length) && (
        <div style={{ color: '#7f1d1d', fontSize: '11px', marginTop: '7px', lineHeight: 1.35 }}>
          Details: {approvalBlockingReasons!.slice(0, 3).join('; ')}
          {approvalBlockingReasons!.length > 3 ? `; +${approvalBlockingReasons!.length - 3} more` : ''}
        </div>
      )}
    </div>
  )
}

function mergeReadiness(story: Partial<Story>, episode: ApprovalEpisode, series?: Extract<ApprovalItem, { type: 'series' }>): Story {
  return {
    ...story,
    id: episode.storyId,
    title: story.title || episode.title || 'Untitled',
    author: story.author || '',
    genre: story.genre || '',
    genre_secondary: story.genre_secondary || null,
    genre_third: story.genre_third || null,
    duration_mins: story.duration_mins || 0,
    cover_url: story.cover_url || null,
    series_name: story.series_name || series?.title || null,
    series_number: story.series_number || null,
    series_total: story.series_total || series?.expectedEpisodeCount || null,
    episode_title: story.episode_title || null,
    flag: story.flag || null,
    description: story.description || null,
    is_hidden: episode.isHidden === true,
    group_name: story.group_name || null,
    is_free: Boolean(story.is_free),
    rating: story.rating || 0,
    review_count: story.review_count || 0,
    downloads_day: story.downloads_day || 0,
    downloads_week: story.downloads_week || 0,
    downloads_month: story.downloads_month || 0,
    downloads_ytd: story.downloads_ytd || 0,
    downloads_total: story.downloads_total || 0,
    started_count: story.started_count || 0,
    finished_count: story.finished_count || 0,
    skipped_count: story.skipped_count || 0,
    total_plays: story.total_plays || 0,
    pct_started: story.pct_started || 0,
    pct_finished: story.pct_finished || 0,
    pct_skipped: story.pct_skipped || 0,
    created_at: story.created_at,
    status: episode.status,
    audio_url: story.audio_url || (episode.audioReadiness.audioUrl ? 'present' : null),
    story_audio_url: story.story_audio_url || (episode.audioReadiness.storyAudioUrl ? 'present' : null),
    series_id: series?.seriesId || story.series_id || null,
    episode_number: episode.episodeNumber || story.episode_number || null,
    expected_episode_count: series?.expectedEpisodeCount || null,
    present_episode_count: series?.presentEpisodeCount || null,
    approval_ready: episode.approvalReady,
    approval_blocking_reasons: episode.approvalBlockingReasons || [],
    approval_entry_reason: episode.approvalEntryReason,
    source_job_id: episode.sourceJobId || series?.sourceJobId || null,
    audio_ready: episode.audioReadiness.audioUrl,
    story_audio_ready: episode.audioReadiness.storyAudioUrl,
    cover_ready: episode.packagingReadiness.coverUrl,
    prose_ready: episode.packagingReadiness.proseText,
    author_ready: episode.packagingReadiness.authorId,
    narrator_voice_ready: episode.packagingReadiness.narratorVoiceId,
    review_status: episode.reviewStatus || 'pending',
    reviewed_at: story.reviewed_at || null,
    review_notes: story.review_notes || null,
  } as Story
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
  const approvalLabel = approvalStatusLabel(story)
  const approvalColors = approvalStatusColor(approvalLabel)
  return (
    <>
      <span style={{ backgroundColor: approvalColors[0], color: approvalColors[1], borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>{approvalLabel.toUpperCase()}</span>
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
          <StoryVisibilityBadges story={story} />
        </div>
        {story.episode_title && <div style={{ color: textSecondary, fontSize: '16px', fontStyle: 'italic', marginTop: '5px' }}>{story.episode_title}</div>}
        <div style={{ color: textSecondary, fontSize: '15px', marginTop: '8px', lineHeight: 1.35, fontWeight: 600 }}>
          {isSeriesEpisode ? `${seriesTitle || 'Series'} · Episode ${story.episode_number}` : 'Standalone'} · by {story.author || 'Unknown'} · {story.genre || 'No genre'} · {story.duration_mins || 0}m
        </div>
        {story.description && <div style={{ color: '#374151', fontSize: '14px', marginTop: '8px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{story.description}</div>}
        <div style={{ color: textSecondary, fontSize: '13px', marginTop: '8px', lineHeight: 1.35 }}>
          Created {story.created_at ? new Date(story.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown'} · Plays {story.downloads_total || 0} · Finish {story.pct_finished || 0}%
        </div>
        {story.approval_entry_reason && (
          <div style={{ color: '#374151', fontSize: '12px', marginTop: '8px', lineHeight: 1.35 }}>
            {story.approval_entry_reason}
          </div>
        )}
        {Boolean(story.approval_blocking_reasons?.length) && (
          <div style={{ color: '#7f1d1d', fontSize: '12px', marginTop: '8px', lineHeight: 1.35 }}>
            Blocked: {story.approval_blocking_reasons!.slice(0, 3).join('; ')}
            {story.approval_blocking_reasons!.length > 3 ? `; +${story.approval_blocking_reasons!.length - 3} more` : ''}
          </div>
        )}
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
          <StoryVisibilityBadges story={story} />
        </div>
        <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px' }}>
          {story.duration_mins || 0}m · {story.genre || 'No genre'} · {story.author || 'Unknown'}
        </div>
        <div style={{ color: '#374151', fontSize: '11px', marginTop: '4px', lineHeight: 1.35 }}>
          Audio {story.audio_ready ? 'ready' : 'missing'} · Story audio {story.story_audio_ready ? 'ready' : 'missing'} · Cover {story.cover_ready ? 'ready' : 'missing'} · Prose {story.prose_ready ? 'ready' : 'missing'}
        </div>
        {Boolean(story.approval_blocking_reasons?.length) && (
          <div style={{ color: '#7f1d1d', fontSize: '11px', marginTop: '4px', lineHeight: 1.35 }}>
            Blocked: {story.approval_blocking_reasons!.slice(0, 2).join('; ')}
            {story.approval_blocking_reasons!.length > 2 ? `; +${story.approval_blocking_reasons!.length - 2} more` : ''}
          </div>
        )}
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
  onMoveSeriesToColdStorage,
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
  onMoveSeriesToColdStorage: (group: Extract<StoryGroup, { type: 'series' }>) => void
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
  const readyCount = group.stories.filter((story) => story.approval_ready).length
  const notApprovedCount = group.stories.filter(isNotApproved).length
  const blockedCount = group.stories.filter((story) => !story.approval_ready).length
  const missingAudioCount = group.stories.filter((story) => !story.audio_ready && !story.story_audio_ready).length
  const missingPackagingCount = group.stories.filter((story) => !story.cover_ready || !story.prose_ready || !story.author_ready || !story.narrator_voice_ready).length
  const statusBlockedCount = group.stories.filter((story) => story.approval_blocking_reasons?.some((reason) => reason.startsWith('status is'))).length
  const renderedCount = group.stories.filter((story) => story.audio_ready || story.story_audio_ready).length
  const expected = group.expectedEpisodeCount || group.stories[0]?.expected_episode_count || group.stories.length
  const present = group.presentEpisodeCount || group.stories[0]?.present_episode_count || group.stories.length
  const missing = group.missingEpisodes || []
  const blockedExplanation = blockedCount > 0
    ? seriesBlockedExplanation(group.title, renderedCount, expected, missingAudioCount, missingPackagingCount, statusBlockedCount, notApprovedCount)
    : ''

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
            {expected} total episodes · {present} present · {first?.genre || 'No genre'} · by {first?.author || 'Unknown'}
          </div>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', alignItems: 'stretch', marginLeft: 'auto', minWidth: '160px' }}>
          <button type="button" onClick={onToggle} style={actionButtonStyle('muted')}>{expanded ? 'Collapse' : 'Expand'}</button>
          <button type="button" onClick={() => onMoveSeriesToColdStorage(group)} style={actionButtonStyle('danger')}>
            Move Series to Cold Storage
          </button>
        </div>
      </div>
      <SeriesReadinessSummary
        title={group.title}
        expected={expected}
        present={present}
        readyCount={readyCount}
        notApprovedCount={notApprovedCount}
        blockedCount={blockedCount}
        missing={missing}
        renderedCount={renderedCount}
        missingPackagingCount={missingPackagingCount}
        missingAudioCount={missingAudioCount}
        approvedCount={approvedCount}
        publishedCount={publishedCount}
        blockedExplanation={blockedExplanation}
        approvalBlockingReasons={group.approvalBlockingReasons}
      />
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
  const [approvalItems, setApprovalItems] = useState<ApprovalItem[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [viewMode, setViewMode] = useState<'all' | 'series' | 'standalone'>('all')
  const [activeTab, setActiveTab] = useState<ReviewTab>('review')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({})
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const editingStoryRef = useRef<Story | null>(null)

  useEffect(() => {
    fetchStories()
    fetchGenres()
  }, [])

  async function fetchStories() {
    setLoading(true)
    const readinessRes = await fetch('/api/admin/content-approval?tab=all&includeBlocked=true', { cache: 'no-store' })
    const readinessPayload = await readinessRes.json()
    if (!readinessRes.ok || !readinessPayload.success) {
      console.error('Error fetching content approval readiness:', readinessPayload.error || readinessRes.status)
      setStories([])
      setApprovalItems([])
      setLoading(false)
      return
    }

    const items = (readinessPayload.items || []) as ApprovalItem[]
    setApprovalItems(items)
    setExpandedSeries((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        if (item.type !== 'series') return
        const key = `series:${item.seriesId}`
        if (next[key] === undefined) next[key] = true
      })
      return next
    })
    const eligibleIds = Array.from(new Set(items.flatMap((item) =>
      item.type === 'series'
        ? item.episodes.map((episode) => episode.storyId)
        : [item.episode.storyId]
    ).filter(Boolean)))

    if (eligibleIds.length === 0) {
      setStories([])
      setLoading(false)
      return
    }

    const { data: storyRows, error: storyRowsError } = await supabase
      .from('stories')
      .select('id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,status,is_hidden,created_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,production_cost')
      .in('id', eligibleIds)
      .order('created_at', { ascending: false })

    if (storyRowsError) {
      console.error('Error fetching story detail rows:', storyRowsError)
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
    const storyById = new Map(((storyRows || []) as Partial<Story>[]).map((story) => [story.id, story]))
    const loadedStories = items.flatMap((item) => {
      if (item.type === 'series') {
        return item.episodes.map((episode) => mergeReadiness({ ...((analyticsById.get(episode.storyId) || {}) as Partial<Story>), ...((storyById.get(episode.storyId) || {}) as Partial<Story>) }, episode, item))
      }
      return [mergeReadiness({ ...((analyticsById.get(item.episode.storyId) || {}) as Partial<Story>), ...((storyById.get(item.episode.storyId) || {}) as Partial<Story>) }, item.episode)]
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

  async function moveSeriesToColdStorage(group: Extract<StoryGroup, { type: 'series' }>) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return

    const hasPublishedEpisode = group.stories.some(isPublishedToApp)
    const warning = hasPublishedEpisode
      ? `Move the entire series "${group.title}" to Cold Storage?\n\nThis will remove published episodes from the public app and hold every episode outside review. No files or story rows will be deleted.`
      : `Move the entire series "${group.title}" to Cold Storage?\n\nThis will hold every episode outside review. No files or story rows will be deleted.`

    if (!window.confirm(warning)) return

    const updates: Record<string, unknown> = hasPublishedEpisode
      ? {
          status: 'audio_ready',
          is_hidden: true,
          published_on: null,
          review_status: 'not_approved',
          reviewed_at: new Date().toISOString(),
          review_notes: 'Moved to Cold Storage from admin review workflow',
        }
      : {
          review_status: 'not_approved',
          reviewed_at: new Date().toISOString(),
          review_notes: 'Moved to Cold Storage from admin review workflow',
        }

    const { error } = await supabase
      .from('stories')
      .update(updates)
      .eq('series_id', seriesId)

    if (error) {
      alert(`Move to Cold Storage failed: ${error.message}`)
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

  const storiesById = new Map(stories.map((story) => [story.id, story]))
  const groupsFromReadiness = approvalItems.flatMap((item): StoryGroup[] => {
    if (item.type === 'series') {
      const seriesStories = item.episodes
        .map((episode) => storiesById.get(episode.storyId))
        .filter(Boolean) as Story[]
      if (seriesStories.length === 0) return []
      return [{
        type: 'series',
        key: `series:${item.seriesId}`,
        title: item.title,
        stories: seriesStories,
        expectedEpisodeCount: item.expectedEpisodeCount,
        presentEpisodeCount: item.presentEpisodeCount,
        missingEpisodes: item.missingEpisodes,
        approvalBlockingReasons: item.approvalBlockingReasons,
        sourceJobId: item.sourceJobId,
      }]
    }
    const story = storiesById.get(item.episode.storyId)
    return story ? [{ type: 'standalone', key: `story:${story.id}`, story }] : []
  })

  const groupedStories = groupsFromReadiness.filter((group) => {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    const matchesSearch = search === '' || groupStories.some((s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.author.toLowerCase().includes(search.toLowerCase()) ||
      (s.series_name || '').toLowerCase().includes(search.toLowerCase())
    ) || (group.type === 'series' && group.title.toLowerCase().includes(search.toLowerCase()))
    const matchesGenre = genreFilter === 'All' || groupStories.some((s) =>
      s.genre === genreFilter ||
      s.genre_secondary === genreFilter ||
      s.genre_third === genreFilter
    )
    const matchesView = viewMode === 'all' ||
      (viewMode === 'series' && group.type === 'series') ||
      (viewMode === 'standalone' && group.type === 'standalone')
    return matchesSearch && matchesGenre && matchesView && groupMatchesTab(group, activeTab)
  })
  const selectedGroup = groupedStories.find((group) => group.key === selectedGroupKey) || groupedStories[0] || null
  useEffect(() => {
    if (selectedGroupKey && groupedStories.some((group) => group.key === selectedGroupKey)) return
    setSelectedGroupKey(groupedStories[0]?.key || null)
  }, [selectedGroupKey, groupedStories.map((group) => group.key).join('|')])

  const visibleStories = groupedStories.flatMap((group) => group.type === 'series' ? group.stories : [group.story])
  const seriesEpisodeCount = visibleStories.filter(s => hasRealSeriesRelationship(s)).length
  const standaloneCount = visibleStories.length - seriesEpisodeCount

  const totalStories = visibleStories.length
  const totalDownloads = visibleStories.reduce((sum, s) => sum + (s.downloads_total || 0), 0)
  const avgCompletion = visibleStories.length > 0
    ? Math.round(visibleStories.reduce((sum, s) => sum + (s.pct_finished || 0), 0) / visibleStories.length)
    : 0
  const tabCounts = tabOptions.reduce((counts, tab) => {
    counts[tab.id] = groupsFromReadiness.filter((group) => groupMatchesTab(group, tab.id)).length
    return counts
  }, {} as Record<ReviewTab, number>)
  const workflowCards: Array<{ key: string; label: string; sub: string; count: number; color: string; soft: string; tab: ReviewTab }> = [
    { key: 'review', label: 'Review Queue', sub: 'Ready for review', count: tabCounts.review || 0, color: '#f97316', soft: '#fff7ed', tab: 'review' },
    { key: 'approved', label: 'Approved', sub: 'Ready to publish', count: tabCounts.approved || 0, color: '#16a34a', soft: '#ecfdf5', tab: 'approved' },
    { key: 'repair', label: 'Repair Queue', sub: 'Needs attention', count: tabCounts.not_approved || 0, color: '#f97316', soft: '#fff7ed', tab: 'not_approved' },
    { key: 'being_repaired', label: 'Being Repaired', sub: 'In progress', count: 0, color: '#3b82f6', soft: '#eff6ff', tab: 'not_approved' },
    { key: 'cold_storage', label: 'Cold Storage', sub: 'Not moving forward', count: tabCounts.not_approved || 0, color: '#8b5cf6', soft: '#f5f3ff', tab: 'not_approved' },
    { key: 'published', label: 'Published', sub: 'Live in app', count: tabCounts.published || 0, color: '#2563eb', soft: '#eff6ff', tab: 'published' },
  ]
  const pipelineCards = [...workflowCards, { key: 'all', label: 'All Stories', sub: 'All content', count: groupsFromReadiness.length, color: '#64748b', soft: '#f8fafc', tab: activeTab }]
  const selectedStories = selectedGroup ? (selectedGroup.type === 'series' ? selectedGroup.stories : [selectedGroup.story]) : []
  const selectedFirst = selectedStories[0]
  const selectedTitle = selectedGroup?.type === 'series' ? selectedGroup.title : selectedFirst?.title || ''
  const selectedExpected = selectedGroup?.type === 'series' ? selectedGroup.expectedEpisodeCount || selectedFirst?.expected_episode_count || selectedStories.length : selectedStories.length
  const selectedPresent = selectedGroup?.type === 'series' ? selectedGroup.presentEpisodeCount || selectedFirst?.present_episode_count || selectedStories.length : selectedStories.length
  const selectedTotalMinutes = selectedStories.reduce((sum, story) => sum + (story.duration_mins || 0), 0)

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '24px 28px', color: '#111827' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .approval-preview-panels { grid-template-columns: 1fr !important; }
          .approval-preview-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .approval-preview-pipeline { overflow-x: auto !important; }
        }
      ` }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, letterSpacing: '-0.01em', color: '#111827' }}>
            Content Approval & Workflow
          </h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280', fontSize: '13px', fontWeight: 600 }}>
            Manage the complete content lifecycle from review to publication
          </p>
        </div>
        {activeTab === 'approved' && (
          <button onClick={publishAllApproved} disabled={tabCounts.approved === 0} style={{ ...actionButtonStyle('primary'), opacity: tabCounts.approved === 0 ? 0.45 : 1 }}>
            Publish All Approved
          </button>
        )}
      </div>

      <div className="approval-preview-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '12px', marginTop: '20px' }}>
        {workflowCards.map((item) => {
          const active = activeTab === item.tab
          return (
            <button key={item.key} type="button" onClick={() => setActiveTab(item.tab)} style={{ minHeight: '92px', padding: '14px', borderRadius: '10px', border: `1px solid ${active ? item.color : '#e5e7eb'}`, backgroundColor: '#ffffff', boxShadow: active ? `0 8px 22px ${item.color}22` : '0 1px 3px rgba(15,23,42,0.08)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: item.soft, color: item.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{item.label[0]}</span>
                <span style={{ color: '#111827', fontSize: '25px', fontWeight: 900, lineHeight: 1 }}>{item.count}</span>
              </div>
              <div style={{ marginTop: '9px', color: '#111827', fontSize: '12px', fontWeight: 900 }}>{item.label}</div>
              <div style={{ marginTop: '2px', color: '#6b7280', fontSize: '10px', fontWeight: 600 }}>{item.sub}</div>
            </button>
          )
        })}
      </div>

      <section style={{ marginTop: '16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(15,23,42,0.08)', padding: '12px 14px' }}>
        <div style={{ color: '#374151', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '9px' }}>Workflow Pipeline</div>
        <div className="approval-preview-pipeline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pipelineCards.map((item, index) => (
            <Fragment key={item.key}>
              <button type="button" onClick={() => item.key !== 'all' ? setActiveTab(item.tab) : undefined} style={{ minWidth: '114px', padding: '9px 10px', borderRadius: '9px', border: `1px solid ${activeTab === item.tab && item.key !== 'all' ? item.color : '#e5e7eb'}`, backgroundColor: '#ffffff', cursor: item.key === 'all' ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#111827', fontSize: '10px', fontWeight: 900 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: item.color, flex: '0 0 auto' }} />
                    {item.label}
                  </span>
                  <span style={{ display: 'block', paddingLeft: '14px', color: '#6b7280', fontSize: '8px', fontWeight: 700, marginTop: '3px' }}>{item.sub}</span>
                </span>
                <span style={{ width: '20px', height: '20px', borderRadius: '999px', backgroundColor: `${item.color}18`, color: item.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900 }}>{item.count}</span>
              </button>
              {index < pipelineCards.length - 1 && <span style={{ color: '#d1d5db', fontSize: '18px' }}>›</span>}
            </Fragment>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search title, author, or series..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #e5e7eb', flex: '1 1 280px', color: '#111827', backgroundColor: '#ffffff', fontSize: '13px' }}
        />
        <select value={genreFilter} onChange={e => setGenreFilter(e.target.value)} style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#111827', backgroundColor: '#ffffff', fontSize: '13px' }}>
          {genreNames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {(['all', 'series', 'standalone'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: viewMode === mode ? '#111827' : '#ffffff', color: viewMode === mode ? '#ffffff' : '#111827', fontSize: '12px', fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>
            {mode}
          </button>
        ))}
      </div>

      <div className="approval-preview-panels" style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: '16px', alignItems: 'start', marginTop: '16px' }}>
        <aside style={{ borderRadius: '10px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(15,23,42,0.08)', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ color: '#111827', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Series ({groupedStories.length})</div>
            <div style={{ color: '#6b7280', fontSize: '10px', fontWeight: 700 }}>{visibleStories.length} episodes</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groupedStories.map((group) => {
              const groupStories = group.type === 'series' ? group.stories : [group.story]
              const firstStory = groupStories[0]
              const groupTitle = group.type === 'series' ? group.title : group.story.title
              const expected = group.type === 'series' ? group.expectedEpisodeCount || firstStory?.expected_episode_count || groupStories.length : groupStories.length
              const present = group.type === 'series' ? group.presentEpisodeCount || firstStory?.present_episode_count || groupStories.length : groupStories.length
              const selected = selectedGroup?.key === group.key
              const currentCount = groupStories.filter((story) => storyBelongsInTab(story, activeTab)).length
              return (
                <button key={group.key} type="button" onClick={() => setSelectedGroupKey(group.key)} style={{ minHeight: '66px', width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', border: `1px solid ${selected ? '#fed7aa' : '#f3f4f6'}`, borderLeft: selected ? '3px solid #f97316' : '3px solid transparent', backgroundColor: selected ? '#fff7ed' : '#ffffff', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '7px', overflow: 'hidden', backgroundColor: '#e5e7eb', flex: '0 0 auto' }}>
                    <img src={firstStory?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupTitle}</div>
                    <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstStory?.genre || 'No genre'} · {firstStory?.author || 'Unknown'}</div>
                    <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '3px' }}>{expected} episodes · {present} present</div>
                  </div>
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', backgroundColor: currentCount > 0 ? '#f97316' : '#f3f4f6', color: currentCount > 0 ? '#ffffff' : '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>{currentCount}</span>
                </button>
              )
            })}
            {groupedStories.length === 0 && <div style={{ padding: '30px 8px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>No series match this filter.</div>}
          </div>
        </aside>

        <main style={{ borderRadius: '10px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(15,23,42,0.08)', padding: '16px', minWidth: 0 }}>
          {!selectedGroup || !selectedFirst ? (
            <div style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>Select a series to view episodes</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '112px', height: '78px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e5e7eb', flex: '0 0 auto' }}>
                  <img src={selectedFirst.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ color: '#111827', fontSize: '21px', fontWeight: 900, lineHeight: 1.12 }}>{selectedTitle}</div>
                  <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '12px', fontWeight: 700 }}>{selectedFirst.genre || 'No genre'} · by {selectedFirst.author || 'Unknown'}</div>
                  <div style={{ marginTop: '4px', color: '#9ca3af', fontSize: '11px' }}>{selectedExpected} total episodes · {selectedPresent} present</div>
                </div>
                <button type="button" onClick={() => { editingStoryRef.current = selectedFirst; setEditingStory(selectedFirst) }} style={{ height: '32px', padding: '0 12px', borderRadius: '7px', border: '1px solid #e5e7eb', backgroundColor: '#ffffff', color: '#374151', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                  Edit Packaging
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#374151', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Episodes in this series</span>
                  <span style={{ color: '#047857', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#ecfdf5', fontWeight: 800 }}>Total {selectedStories.length}</span>
                  <span style={{ color: '#374151', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#f3f4f6', fontWeight: 800 }}>{selectedTotalMinutes}m total audio</span>
                  <span style={{ color: '#047857', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#ecfdf5', fontWeight: 800 }}>{selectedPresent} present</span>
                </div>
              </div>

              <div style={{ marginTop: '10px', overflowX: 'auto', border: '1px solid #f3f4f6', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ height: '38px', backgroundColor: '#f9fafb' }}>
                      {['Episode', 'Title', 'Narrator', 'Duration', 'Workflow State', 'Actions'].map((head) => (
                        <th key={head} style={{ padding: '0 10px', color: '#6b7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', textAlign: head === 'Actions' ? 'right' : 'left' }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStories.map((story) => {
                      const label = approvalStatusLabel(story)
                      const isReady = isReviewReady(story) || story.approval_ready
                      const statusColor = isPublishedToApp(story) ? ['#dbeafe', '#1d4ed8'] : isApprovedReady(story) ? ['#dcfce7', '#166534'] : isNotApproved(story) ? ['#f5f3ff', '#6d28d9'] : isReady ? ['#fff7ed', '#c2410c'] : ['#f3f4f6', '#374151']
                      return (
                        <tr key={story.id} style={{ height: '62px', borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px', color: '#111827', fontSize: '18px', fontWeight: 900 }}>{story.episode_number || '-'}</td>
                          <td style={{ padding: '10px', minWidth: 0 }}>
                            <div style={{ color: '#111827', fontSize: '13px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.episode_title || story.title}</div>
                            <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '4px' }}>Episode {story.episode_number || '-'}</div>
                          </td>
                          <td style={{ padding: '10px', color: '#374151', fontSize: '12px', fontWeight: 700 }}>{story.narrator_voice_ready ? 'Assigned' : 'Unassigned'}</td>
                          <td style={{ padding: '10px', color: '#374151', fontSize: '12px', fontWeight: 700 }}>{story.duration_mins ? `${story.duration_mins}m` : '-'}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '5px 9px', backgroundColor: statusColor[0], color: statusColor[1], fontSize: '10px', fontWeight: 900 }}>{label}</span>
                            <div style={{ marginTop: '4px', color: '#9ca3af', fontSize: '9px' }}>{story.approval_ready ? 'Ready' : story.approval_blocking_reasons?.[0] || 'Needs review'}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {story.audio_url && <PlayStoryButton storyId={story.id} title={story.title} />}
                              {isReviewReady(story) && <button onClick={() => setReviewStatus(story, 'approved')} style={actionButtonStyle('success')}>Approve</button>}
                              {isReviewReady(story) && <button onClick={() => publishStory(story)} style={actionButtonStyle('primary')}>Publish</button>}
                              {(isReviewReady(story) || isApprovedReady(story)) && <button onClick={() => setReviewStatus(story, 'not_approved')} style={actionButtonStyle('danger')}>Hold</button>}
                              {(isApprovedReady(story) || isNotApproved(story)) && <button onClick={() => moveToReview(story)} style={actionButtonStyle('muted')}>Review</button>}
                              {isPublishedToApp(story) && <button onClick={() => unpublishStory(story)} style={actionButtonStyle('danger')}>Unpublish</button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '12px', color: '#9ca3af', fontSize: '10px' }}>Showing 1 to {selectedStories.length} of {selectedStories.length} episodes</div>
            </>
          )}
        </main>
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
