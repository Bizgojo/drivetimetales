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
  intro_audio_url?: string | null
  intro_before_url?: string | null
  intro_after_url?: string | null
  outro_audio_url?: string | null
  background_music_url?: string | null
  narrator_voice_name?: string | null
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
  workflow_state?: string | null
  repair_checklist?: RepairChecklistValue | null
  repair_notes?: string | null
  script_version?: number | null
  is_v2?: boolean | null
  script_json?: any
  brief_json?: any
  script?: string | null
  story_type?: string | null
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

type WorkflowTab = 'ready_for_review' | 'approved_ready' | 'repair_queue' | 'being_repaired' | 'unpublished_library' | 'cold_storage' | 'published'
type WorkflowLane = 'ready_for_review' | 'repair_shop' | 'approved_ready' | 'cold_storage' | 'published'
type WorkflowFilter = WorkflowLane | 'all'
type RepairGroup = 'story_script' | 'audio_asc' | 'packaging'
type RepairChecklistValue = Record<RepairGroup, string[]>
type StoryGroup =
  | { type: 'standalone'; key: string; story: Story }
  | { type: 'series'; key: string; title: string; stories: Story[]; expectedEpisodeCount?: number; presentEpisodeCount?: number; missingEpisodes?: number[]; approvalBlockingReasons?: string[]; sourceJobId?: string | null }

type ApprovalEpisode = {
  storyId: string
  title: string | null
  episodeNumber: number | null
  status: string | null
  reviewStatus: 'pending' | 'approved' | 'not_approved' | null
  workflowState: WorkflowTab
  repairChecklist: RepairChecklistValue | null
  repairNotes: string | null
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

const bg = '#0b1020'
const cardBg = '#FFFFFF'
const textPrimary = '#1a1a1a'
const textSecondary = '#4a4a4a'
const border = '#e0e0e0'

const TAB_CONFIG: Array<{
  id: WorkflowLane
  label: string
  description: string
  color: string
  softColor: string
  glowColor: string
}> = [
  { id: 'ready_for_review', label: 'Ready for Review', description: 'Ready for review.', color: '#f59e0b', softColor: '#fef3c7', glowColor: 'rgba(245,158,11,0.30)' },
  { id: 'repair_shop', label: 'Repair Shop', description: 'Active repair work.', color: '#f97316', softColor: '#ffedd5', glowColor: 'rgba(249,115,22,0.30)' },
  { id: 'approved_ready', label: 'Ready to Publish', description: 'Cleared by Marc.', color: '#22c55e', softColor: '#dcfce7', glowColor: 'rgba(34,197,94,0.28)' },
  { id: 'cold_storage', label: 'Cold Storage / Training Archive', description: 'Preserved artifacts.', color: '#8b5cf6', softColor: '#ede9fe', glowColor: 'rgba(139,92,246,0.28)' },
  { id: 'published', label: 'Published', description: 'Live in app.', color: '#2563eb', softColor: '#dbeafe', glowColor: 'rgba(37,99,235,0.34)' },
]

const WORKFLOW_LABELS = {
  ...Object.fromEntries(TAB_CONFIG.map((tab) => [tab.id, tab.label])),
  repair_queue: 'Repair Shop',
  being_repaired: 'Repair Shop',
  unpublished_library: 'Cold Storage / Training Archive',
} as Record<WorkflowTab, string>

const WORKFLOW_VISUALS = Object.fromEntries(TAB_CONFIG.map((tab) => [tab.id, tab])) as Record<WorkflowLane, typeof TAB_CONFIG[number]>

const WORKFLOW_COLORS: Record<string, { bg: string; text: string; badge: string; dot: string }> = {
  ready_for_review: { bg: '#FEF3C7', text: '#92400E', badge: '#F59E0B', dot: '#F59E0B' },
  approved_ready: { bg: '#D1FAE5', text: '#065F46', badge: '#10B981', dot: '#10B981' },
  repair_shop: { bg: '#FEE2E2', text: '#991B1B', badge: '#EF4444', dot: '#EF4444' },
  repair_queue: { bg: '#FEE2E2', text: '#991B1B', badge: '#EF4444', dot: '#EF4444' },
  being_repaired: { bg: '#DBEAFE', text: '#1E40AF', badge: '#3B82F6', dot: '#3B82F6' },
  cold_storage: { bg: '#EDE9FE', text: '#5B21B6', badge: '#8B5CF6', dot: '#8B5CF6' },
  published: { bg: '#D1FAE5', text: '#065F46', badge: '#059669', dot: '#059669' },
  unpublished_library: { bg: '#FEF9C3', text: '#713F12', badge: '#EAB308', dot: '#EAB308' },
}

const STREAMING_PIPELINE: Array<{ id: WorkflowLane; label: string; sub: string; color: string }> = [
  { id: 'ready_for_review', label: 'Ready for Review', sub: 'Ready for review', color: '#F59E0B' },
  { id: 'repair_shop', label: 'Repair Shop', sub: 'Active repair work', color: '#EF4444' },
  { id: 'approved_ready', label: 'Ready to Publish', sub: 'Cleared by Marc', color: '#10B981' },
  { id: 'cold_storage', label: 'Cold Storage / Training Archive', sub: 'Preserved artifacts', color: '#8B5CF6' },
  { id: 'published', label: 'Published', sub: 'Live in app', color: '#059669' },
]

function effectiveWorkflowState(story: Story): WorkflowTab {
  if (story.workflow_state === 'live') return 'published'
  if (story.workflow_state && ['ready_for_review', 'approved_ready', 'repair_queue', 'being_repaired', 'unpublished_library', 'cold_storage', 'published'].includes(story.workflow_state)) return story.workflow_state as WorkflowTab
  if (!story.is_hidden && story.status === 'published') return 'published'
  if (story.is_hidden && story.status === 'published') return 'unpublished_library'
  if (story.review_status === 'approved') return 'approved_ready'
  if (story.review_status === 'not_approved') return 'cold_storage'
  return 'ready_for_review'
}

function isReviewReady(story: Story) {
  return effectiveWorkflowState(story) === 'ready_for_review'
}

function isApprovedReady(story: Story) {
  return effectiveWorkflowState(story) === 'approved_ready'
}

function isNotApproved(story: Story) {
  return effectiveWorkflowState(story) === 'cold_storage'
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
  return story.status === 'published' && story.is_hidden === false && ['published', 'live', null, undefined].includes(story.workflow_state as any)
}

function visualWorkflowLane(story: Story): WorkflowLane {
  const state = effectiveWorkflowState(story)
  if (state === 'repair_queue' || state === 'being_repaired') return 'repair_shop'
  if (state === 'published') return isPublishedToApp(story) ? 'published' : 'cold_storage'
  return state === 'unpublished_library' ? 'cold_storage' : state
}

function storyMatchesWorkflowLane(story: Story, lane: WorkflowLane) {
  const state = effectiveWorkflowState(story)
  if (lane === 'repair_shop') return state === 'repair_queue' || state === 'being_repaired'
  if (lane === 'cold_storage') return state === 'cold_storage' || state === 'unpublished_library'
  if (lane === 'published') return isPublishedToApp(story)
  return state === lane
}

function storiesForWorkflowLane(stories: Story[], lane: WorkflowLane) {
  return stories.filter((story) => storyMatchesWorkflowLane(story, lane))
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

function storyMatchesTab(story: Story, tab: WorkflowTab) {
  return effectiveWorkflowState(story) === tab
}

function storyBelongsInTab(story: Story, tab: WorkflowTab) {
  if (storyMatchesTab(story, tab)) return true
  if (tab !== 'ready_for_review') return false
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

function groupMatchesTab(group: StoryGroup, tab: WorkflowTab) {
  if (group.type === 'standalone') return storyBelongsInTab(group.story, tab)
  return group.stories.some((story) => storyBelongsInTab(story, tab))
}

function storyMatchesLane(story: Story, lane: WorkflowLane) {
  if (visualWorkflowLane(story) === lane) return true
  if (lane !== 'ready_for_review') return false
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

function groupMatchesLane(group: StoryGroup, lane: WorkflowLane) {
  if (group.type === 'standalone') return storyMatchesLane(group.story, lane)
  return group.stories.some((story) => storyMatchesLane(story, lane))
}

function repairSubstate(story: Story) {
  const notes = `${story.repair_notes || ''} ${story.review_notes || ''}`.toLowerCase()
  if (notes.includes('awaiting verification')) return 'Awaiting Verification'
  if (effectiveWorkflowState(story) === 'being_repaired') return 'Being Repaired'
  return 'Needs Repair Intake'
}

function topLevelWorkflowLabel(story: Story) {
  return WORKFLOW_LABELS[effectiveWorkflowState(story)]
}

function seriesBlockedExplanation(title: string, renderedCount: number, expected: number, missingAudioCount: number, missingPackagingCount: number, statusBlockedCount: number, coldStorageCount: number) {
  if (coldStorageCount > 0) return `${title}: ${renderedCount}/${expected} rendered • blocked from review because ${coldStorageCount} episode${coldStorageCount === 1 ? ' is' : 's are'} in Cold Storage.`
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
  coldStorageCount,
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
  coldStorageCount: number
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
        <SeriesStatChip label="Cold Storage" value={coldStorageCount} tone={coldStorageCount > 0 ? 'danger' : 'neutral'} />
        <SeriesStatChip label="Blocked" value={blockedCount} tone={blockedCount > 0 ? 'blocked' : 'neutral'} />
        <SeriesStatChip label="Missing" value={missing.length ? missing.join(', ') : 0} tone={missing.length ? 'danger' : 'neutral'} />
        <SeriesStatChip label="Rendered" value={`${renderedCount}/${expected}`} tone={missingAudioCount > 0 ? 'danger' : 'ready'} />
      </div>
      <div style={{ color: '#374151', fontSize: '12px', marginTop: '8px', lineHeight: 1.35 }}>
        Missing packaging {missingPackagingCount} • Missing audio {missingAudioCount} • Ready to Publish {approvedCount} • Published {publishedCount}
      </div>
      {blockedExplanation && (
        <div style={{ marginTop: '10px', padding: '9px 10px', borderRadius: '8px', backgroundColor: missingAudioCount > 0 ? '#fef2f2' : '#fff7ed', border: `1px solid ${missingAudioCount > 0 ? '#fecaca' : '#fed7aa'}`, color: missingAudioCount > 0 ? '#991b1b' : '#9a3412', fontSize: '12px', lineHeight: 1.35, fontWeight: 800 }}>
          {blockedExplanation}
        </div>
      )}
      {Boolean(approvalBlockingReasons?.length) && (
        <div style={{ color: '#7f1d1d', fontSize: '11px', marginTop: '7px', lineHeight: 1.35 }}>
          Details: {approvalBlockingSummary(approvalBlockingReasons)}
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
    intro_audio_url: story.intro_audio_url || null,
    intro_before_url: story.intro_before_url || null,
    intro_after_url: story.intro_after_url || null,
    outro_audio_url: story.outro_audio_url || null,
    background_music_url: story.background_music_url || null,
    narrator_voice_name: story.narrator_voice_name || null,
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
    workflow_state: episode.workflowState,
    repair_checklist: episode.repairChecklist,
    repair_notes: episode.repairNotes,
    reviewed_at: story.reviewed_at || null,
    review_notes: story.review_notes || null,
    script_version: story.script_version || null,
    is_v2: story.is_v2 ?? null,
    script_json: story.script_json || null,
    brief_json: story.brief_json || null,
    script: story.script || null,
    story_type: story.story_type || null,
  } as Story
}

function displaySeriesTitle(stories: Story[]) {
  const story = stories[0]
  const name = String(story?.series_name || '').trim()
  if (name && name.toLowerCase() !== 'none') return name
  return story?.title || 'Untitled Series'
}

function narratorLabel(story: Story) {
  const narrator = String(story.narrator_voice_name || '').trim()
  return narrator || 'Narrator pending'
}

function approvalBlockingSummary(reasons?: string[]) {
  if (!reasons?.length) return ''
  const text = reasons.join(' ').toLowerCase()
  if (text.includes('audio')) return 'Missing Audio'
  if (text.includes('cover') || text.includes('prose') || text.includes('author') || text.includes('narrator') || text.includes('packaging')) return 'Missing Packaging'
  if (text.includes('review_status') || text.includes('status')) return 'Needs Review'
  return 'Needs Review'
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

function groupExpectedCount(group: StoryGroup) {
  if (group.type === 'standalone') return 1
  return group.expectedEpisodeCount || group.stories[0]?.expected_episode_count || group.stories.length
}

function groupPresentCount(group: StoryGroup) {
  if (group.type === 'standalone') return 1
  return group.presentEpisodeCount || group.stories[0]?.present_episode_count || group.stories.length
}

function isTrueSeriesGroup(group: StoryGroup) {
  return group.type === 'series' && (groupExpectedCount(group) > 1 || groupPresentCount(group) > 1 || group.stories.length > 1)
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: textPrimary }}>{isHidden ? 'Outside listener app' : 'Available in listener app'}</div>
              <div style={{ fontSize: '11px', color: textSecondary, marginTop: '2px' }}>{isHidden ? 'Story is held for editorial workflow' : 'Story appears in library'}</div>
            </div>
            <button
              onClick={() => setIsHidden(!isHidden)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer',
                backgroundColor: isHidden ? '#dc2626' : '#16a34a',
                color: '#000000',
              }}
            >
              {isHidden ? 'Make Available' : 'Remove from App'}
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
    minHeight: '30px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: colors[0],
    color: colors[1],
    fontSize: '12px',
    lineHeight: 1.15,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'normal' as const,
  }
}

function isRemasterCandidateState(state: WorkflowTab) {
  return state === 'approved_ready' || state === 'published'
}

type ProductionStandard = 'current' | 'remaster_candidate' | 'unknown'
type AIRecommendation = 'preserve' | 'remaster_candidate' | 'repair_candidate' | 'delete_candidate' | 'needs_review'
type TrainingValue = 'high' | 'medium' | 'low' | 'none'

const AI_RECOMMENDATION_LABELS: Record<AIRecommendation, string> = {
  preserve: 'Preserve',
  remaster_candidate: 'Remaster Candidate',
  repair_candidate: 'Repair Candidate',
  delete_candidate: 'Delete Candidate',
  needs_review: 'Needs Marc Review',
}

function productionStandardForStory(story: Story): { standard: ProductionStandard; label: string; note: string } {
  const scriptJson = story.script_json || {}
  const briefJson = story.brief_json || {}
  const audioText = [
    story.audio_url,
    story.story_audio_url,
    story.intro_audio_url,
    story.intro_before_url,
    story.intro_after_url,
    story.outro_audio_url,
    story.background_music_url,
  ].filter(Boolean).join(' ').toLowerCase()
  const metadataText = JSON.stringify({
    script_json: scriptJson,
    brief_json: briefJson,
  }).toLowerCase()
  const hasV2Evidence = story.is_v2 === true || metadataText.includes('"is_v2":true') || metadataText.includes('/api/v2/') || metadataText.includes('canonical v2')
  const hasAscEvidence = metadataText.includes('asc') || metadataText.includes('asc3') || metadataText.includes('audio pipeline') || audioText.includes('/asc3/')
  const hasProductionJobEvidence = Boolean(story.source_job_id || scriptJson.production_job_id || briefJson.production_job_id)

  if (hasV2Evidence && (hasAscEvidence || hasProductionJobEvidence)) {
    return {
      standard: 'current',
      label: 'Current Standard',
      note: 'V2 / ASC metadata found.',
    }
  }

  if (isRemasterCandidateState(effectiveWorkflowState(story))) {
    return {
      standard: 'remaster_candidate',
      label: 'Remaster Candidate',
      note: 'Ready/live item lacks V2 / ASC proof.',
    }
  }

  return {
    standard: 'unknown',
    label: 'Unknown Standard',
    note: 'Unknown Standard — verify before publishing.',
  }
}

function hasStoryAudio(story: Story) {
  return Boolean(story.audio_url || story.story_audio_url || story.audio_ready || story.story_audio_ready)
}

function hasStoryScript(story: Story) {
  const scriptJson = story.script_json || {}
  return Boolean(
    String(story.script || '').trim() ||
    String(scriptJson.raw_script || '').trim() ||
    story.script_version
  )
}

function hasPlaceholderIdentity(story: Story) {
  const title = String(story.title || '').trim().toLowerCase()
  const author = String(story.author || '').trim().toLowerCase()
  return (
    !title ||
    title === 'untitled' ||
    title === 'untitled draft' ||
    title.includes('test story') ||
    title.includes('placeholder') ||
    author === 'unknown' ||
    author === 'test'
  )
}

function hasMalformedOrSparseMetadata(story: Story) {
  return !story.genre || !story.description || !story.cover_url
}

function preservationClassificationForStory(story: Story): {
  productionStandard: ReturnType<typeof productionStandardForStory>
  recommendation: AIRecommendation
  trainingValue: TrainingValue
  rationale: string
} {
  const state = effectiveWorkflowState(story)
  const productionStandard = productionStandardForStory(story)
  const hasAudio = hasStoryAudio(story)
  const hasScript = hasStoryScript(story)
  const placeholder = hasPlaceholderIdentity(story)
  const sparseMetadata = hasMalformedOrSparseMetadata(story)
  const failedOrIncomplete = ['failed', 'production_failed', 'error', 'draft', 'brief_complete', 'script_drafted'].includes(String(story.status || '').toLowerCase())

  if (state === 'repair_queue' || state === 'being_repaired') {
    return { productionStandard, recommendation: 'repair_candidate', trainingValue: 'medium', rationale: 'Repair workflow is active or queued.' }
  }

  if (state === 'published' || state === 'approved_ready') {
    if (productionStandard.standard === 'current') {
      return { productionStandard, recommendation: 'preserve', trainingValue: 'high', rationale: 'Live or approved item with current V2 / ASC evidence.' }
    }
    return { productionStandard, recommendation: 'remaster_candidate', trainingValue: 'high', rationale: 'Live or approved item lacks current-standard proof.' }
  }

  if ((state === 'cold_storage' || story.review_status === 'not_approved') && (hasAudio || hasScript)) {
    return { productionStandard, recommendation: 'preserve', trainingValue: 'medium', rationale: 'Rejected or archived item still has usable training/reference value.' }
  }

  if ((placeholder || failedOrIncomplete) && !hasAudio && !hasScript) {
    return { productionStandard, recommendation: 'delete_candidate', trainingValue: 'none', rationale: 'Incomplete placeholder-like row with no usable script or audio evidence.' }
  }

  if (!hasAudio || !hasScript || sparseMetadata || productionStandard.standard === 'unknown') {
    return { productionStandard, recommendation: 'needs_review', trainingValue: hasAudio || hasScript ? 'low' : 'none', rationale: 'Metadata is incomplete, so Marc should verify before action.' }
  }

  return { productionStandard, recommendation: 'preserve', trainingValue: 'medium', rationale: 'Usable completed record without destructive action needed.' }
}

function aggregatePreservationClassification(stories: Story[]) {
  const classifications = stories.map(preservationClassificationForStory)
  const recommendationOrder: AIRecommendation[] = ['delete_candidate', 'repair_candidate', 'remaster_candidate', 'needs_review', 'preserve']
  const trainingOrder: TrainingValue[] = ['none', 'low', 'medium', 'high']
  const standardOrder: ProductionStandard[] = ['unknown', 'remaster_candidate', 'current']
  const selected = classifications.sort((a, b) =>
    recommendationOrder.indexOf(a.recommendation) - recommendationOrder.indexOf(b.recommendation)
  )[0] || preservationClassificationForStory(stories[0])
  const weakestTraining = classifications.map((item) => item.trainingValue).sort((a, b) =>
    trainingOrder.indexOf(a) - trainingOrder.indexOf(b)
  )[0] || 'none'
  const weakestStandard = classifications.map((item) => item.productionStandard.standard).sort((a, b) =>
    standardOrder.indexOf(a) - standardOrder.indexOf(b)
  )[0] || 'unknown'
  const representativeStandard = classifications.find((item) => item.productionStandard.standard === weakestStandard)?.productionStandard || selected.productionStandard

  return {
    productionStandard: representativeStandard,
    recommendation: selected.recommendation,
    trainingValue: weakestTraining,
    rationale: stories.length > 1 ? `Series-level view: ${selected.rationale}` : selected.rationale,
  }
}

function ProductionStandardBadge({ story }: { story: Story }) {
  const standard = productionStandardForStory(story)
  const styles: Record<ProductionStandard, { bg: string; text: string; border: string }> = {
    current: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    remaster_candidate: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
    unknown: { bg: '#F9FAFB', text: '#4B5563', border: '#D1D5DB' },
  }
  const colors = styles[standard.standard]
  return (
    <span title={standard.note} style={{ display: 'inline-flex', borderRadius: '999px', padding: '4px 9px', border: `1px solid ${colors.border}`, backgroundColor: colors.bg, color: colors.text, fontSize: '10px', fontWeight: 900, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
      {standard.label}
    </span>
  )
}

function RemasterCopyUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'flex-end' : 'stretch', gap: '4px', minWidth: 0 }}>
      <button
        type="button"
        disabled
        title="Remaster copy requires clone endpoint."
        style={{
          ...actionButtonStyle('muted'),
          border: '1px solid #D1D5DB',
          backgroundColor: '#F9FAFB',
          color: '#6B7280',
          cursor: 'not-allowed',
          opacity: 0.75,
        }}
      >
        Create Remaster Copy
      </button>
      <span style={{ color: '#9CA3AF', fontSize: compact ? '10px' : '9px', fontWeight: 700, lineHeight: 1.2, textAlign: compact ? 'right' : 'center' }}>
        Legacy candidate lacks V2 / ASC proof. Remaster copy requires clone endpoint.
      </span>
    </div>
  )
}

function StoryIntelligenceStrip({
  stories,
  deletionMarked,
  onMoveToColdStorage,
  onMoveToRepairShop,
  onMarkForDeletion,
}: {
  stories: Story[]
  deletionMarked: boolean
  onMoveToColdStorage: () => void
  onMoveToRepairShop: () => void
  onMarkForDeletion: () => void
}) {
  const classification = aggregatePreservationClassification(stories)
  const recommendation = AI_RECOMMENDATION_LABELS[classification.recommendation]
  const trainingStyles: Record<TrainingValue, { bg: string; text: string; border: string }> = {
    high: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    medium: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    low: { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
    none: { bg: '#F9FAFB', text: '#4B5563', border: '#D1D5DB' },
  }
  const recommendationStyles: Record<AIRecommendation, { bg: string; text: string; border: string }> = {
    preserve: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    remaster_candidate: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
    repair_candidate: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
    delete_candidate: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
    needs_review: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  }
  const production = classification.productionStandard
  const training = trainingStyles[classification.trainingValue]
  const rec = recommendationStyles[classification.recommendation]
  const productionStyles: Record<ProductionStandard, { bg: string; text: string; border: string }> = {
    current: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    remaster_candidate: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
    unknown: { bg: '#F9FAFB', text: '#4B5563', border: '#D1D5DB' },
  }
  const productionColors = productionStyles[production.standard]
  const compactActionStyle = {
    ...actionButtonStyle('muted'),
    minHeight: '22px',
    padding: '3px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    lineHeight: 1.1,
  } as React.CSSProperties

  return (
    <div style={{ marginTop: '8px', padding: '2px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ color: '#9CA3AF', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Story Intelligence</span>
        <span title={`Production Standard: ${production.note}`} style={{ display: 'inline-flex', borderRadius: '999px', padding: '2px 7px', border: `1px solid ${productionColors.border}`, backgroundColor: productionColors.bg, color: productionColors.text, fontSize: '10px', fontWeight: 900 }}>{production.label}</span>
        <span title={`AI Recommendation: ${classification.rationale}`} style={{ display: 'inline-flex', borderRadius: '999px', padding: '2px 7px', border: `1px solid ${rec.border}`, backgroundColor: rec.bg, color: rec.text, fontSize: '10px', fontWeight: 900 }}>{recommendation}</span>
        <span title="Training Value" style={{ display: 'inline-flex', borderRadius: '999px', padding: '2px 7px', border: `1px solid ${training.border}`, backgroundColor: training.bg, color: training.text, fontSize: '10px', fontWeight: 900 }}>
          Training: {classification.trainingValue[0].toUpperCase() + classification.trainingValue.slice(1)}
        </span>
        {production.standard === 'unknown' && (
          <span title="Unknown Standard — verify before publishing." style={{ color: '#92400E', fontSize: '10px', fontWeight: 700 }}>
            Verify before publishing
          </span>
        )}
        {deletionMarked && (
          <span style={{ color: '#6B7280', fontSize: '10px', fontWeight: 800 }}>
            Marked for deletion review
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' }}>
        {classification.recommendation === 'preserve' && <button type="button" onClick={onMoveToColdStorage} style={{ ...compactActionStyle, color: '#B91C1C' }}>Move to Cold Storage</button>}
        {classification.recommendation === 'remaster_candidate' && (
          <span style={{ color: '#C2410C', fontSize: '10px', fontWeight: 800 }}>
            Use Create Remaster Copy
          </span>
        )}
        {classification.recommendation === 'repair_candidate' && <button type="button" onClick={onMoveToRepairShop} style={compactActionStyle}>Move to Repair Shop</button>}
        {classification.recommendation === 'delete_candidate' && (
          <button type="button" onClick={onMarkForDeletion} style={{ ...compactActionStyle, border: '1px solid #D1D5DB', backgroundColor: deletionMarked ? '#E5E7EB' : '#F9FAFB' }}>
            {deletionMarked ? 'Marked for Deletion' : 'Mark for Deletion'}
          </button>
        )}
        {classification.recommendation === 'needs_review' && <button type="button" disabled style={{ ...compactActionStyle, cursor: 'not-allowed', opacity: 0.65 }}>Review Required</button>}
      </div>
    </div>
  )
}

const REPAIR_ISSUE_OPTIONS: Array<{ id: string; label: string; group: RepairGroup }> = [
  { id: 'intro_timing_problem', label: 'Intro timing problem', group: 'audio_asc' },
  { id: 'outro_timing_problem', label: 'Outro timing problem', group: 'audio_asc' },
  { id: 'outro_missing_title_original', label: 'Outro missing title / Endless Tales Original', group: 'audio_asc' },
  { id: 'outro_weak_cliffhanger', label: 'Outro weak cliffhanger', group: 'story_script' },
  { id: 'audio_cuts_off_fade_buries_voice', label: 'Audio cuts off / fade buries voice', group: 'audio_asc' },
  { id: 'low_voice_ghost_voice', label: 'Low voice / ghost voice', group: 'audio_asc' },
  { id: 'qc_mismatch', label: 'QC mismatch', group: 'audio_asc' },
  { id: 'wrong_narrator_or_character_voice', label: 'Wrong narrator or character voice', group: 'audio_asc' },
  { id: 'cover_problem', label: 'Cover problem', group: 'packaging' },
  { id: 'weak_ending', label: 'Weak ending', group: 'story_script' },
  { id: 'other', label: 'Other', group: 'story_script' },
]

const REPAIR_OPTIONS: Array<{ group: RepairGroup; title: string; items: Array<{ id: string; label: string }> }> = [
  { group: 'story_script', title: 'STORY / SCRIPT', items: REPAIR_ISSUE_OPTIONS.filter((item) => item.group === 'story_script') },
  { group: 'audio_asc', title: 'AUDIO / ASC', items: REPAIR_ISSUE_OPTIONS.filter((item) => item.group === 'audio_asc') },
  { group: 'packaging', title: 'PACKAGING', items: REPAIR_ISSUE_OPTIONS.filter((item) => item.group === 'packaging') },
]

function emptyRepairChecklist(): RepairChecklistValue {
  return { story_script: [], audio_asc: [], packaging: [] }
}

function normalizeRepairChecklist(value: unknown): RepairChecklistValue {
  const input = (value || {}) as Partial<RepairChecklistValue>
  return {
    story_script: Array.isArray(input.story_script) ? input.story_script : [],
    audio_asc: Array.isArray(input.audio_asc) ? input.audio_asc : [],
    packaging: Array.isArray(input.packaging) ? input.packaging : [],
  }
}

function repairChecklistCount(checklist: RepairChecklistValue) {
  return checklist.story_script.length + checklist.audio_asc.length + checklist.packaging.length
}

function firstRepairIssueLabel(checklist?: RepairChecklistValue | null) {
  const normalized = normalizeRepairChecklist(checklist)
  const selected = [...normalized.audio_asc, ...normalized.story_script, ...normalized.packaging]
  const first = REPAIR_ISSUE_OPTIONS.find((item) => selected.includes(item.id))
  return first?.label || ''
}

function repairRoutingNote(checklist: RepairChecklistValue) {
  const hasScript = checklist.story_script.length > 0
  const hasAudio = checklist.audio_asc.length > 0
  const hasPackaging = checklist.packaging.length > 0
  if (hasScript && hasAudio) return 'Full repair (V2 + ASC)'
  if (hasAudio) return 'Audio repair (ASC)'
  if (hasScript) return 'Script repair (V2)'
  if (hasPackaging) return 'Packaging repair'
  return ''
}

function RepairChecklistPanel({
  title,
  initialChecklist,
  initialNotes,
  onCancel,
  onSendToRepair,
  onMarkComplete,
  onReturnToReview,
  onMoveToColdStorage,
  showSeriesScope = false,
  repairEntireSeries = false,
  onRepairEntireSeriesChange,
}: {
  title: string
  initialChecklist?: RepairChecklistValue | null
  initialNotes?: string | null
  onCancel: () => void
  onSendToRepair: (checklist: RepairChecklistValue, notes: string) => void
  onMarkComplete: (checklist: RepairChecklistValue, notes: string) => void
  onReturnToReview: () => void
  onMoveToColdStorage: () => void
  showSeriesScope?: boolean
  repairEntireSeries?: boolean
  onRepairEntireSeriesChange?: (value: boolean) => void
}) {
  const [checklist, setChecklist] = useState<RepairChecklistValue>(() => normalizeRepairChecklist(initialChecklist))
  const [notes, setNotes] = useState(initialNotes || '')
  const count = repairChecklistCount(checklist)
  const routeNote = repairRoutingNote(checklist)

  function toggle(group: RepairGroup, id: string) {
    setChecklist((prev) => {
      const exists = prev[group].includes(id)
      return {
        ...prev,
        [group]: exists ? prev[group].filter((item) => item !== id) : [...prev[group], id],
      }
    })
  }

  return (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ color: textPrimary, fontSize: '14px', fontWeight: 900 }}>Repair intake for {title}</div>
          <div style={{ color: '#9a3412', fontSize: '11px', marginTop: '3px', fontWeight: 700 }}>Default scope is episode-level.</div>
        </div>
        {showSeriesScope && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#7c2d12', fontSize: '12px', fontWeight: 800 }}>
            <input type="checkbox" checked={repairEntireSeries} onChange={(event) => onRepairEntireSeriesChange?.(event.target.checked)} />
            Repair entire series
          </label>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {REPAIR_OPTIONS.map((section) => (
          <div key={section.group}>
            <div style={{ color: '#9a3412', fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', marginBottom: '7px' }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {section.items.map((item) => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', color: textPrimary, fontSize: '12px', fontWeight: 700 }}>
                  <input type="checkbox" checked={checklist[section.group].includes(item.id)} onChange={() => toggle(section.group, item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {routeNote && (
        <div style={{ display: 'inline-flex', marginTop: '12px', padding: '5px 8px', borderRadius: '999px', backgroundColor: '#ffedd5', color: '#9a3412', fontSize: '11px', fontWeight: 900 }}>
          {routeNote}
        </div>
      )}
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Repair notes for this episode or story..."
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box', marginTop: '12px', borderRadius: '8px', border: '1px solid #fed7aa', backgroundColor: '#ffffff', color: '#111827', padding: '9px 10px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} style={actionButtonStyle('muted')}>Cancel</button>
        <button type="button" onClick={() => onSendToRepair(checklist, notes)} disabled={count === 0} style={{ ...actionButtonStyle('primary'), opacity: count === 0 ? 0.45 : 1, cursor: count === 0 ? 'default' : 'pointer' }}>Send to Being Repaired</button>
        <button type="button" onClick={() => onMarkComplete(checklist, notes)} style={actionButtonStyle('success')}>Mark Repair Complete</button>
        <button type="button" onClick={onReturnToReview} style={actionButtonStyle('muted')}>Return to Ready for Review</button>
        <button type="button" onClick={onMoveToColdStorage} style={actionButtonStyle('danger')}>Move to Cold Storage</button>
      </div>
    </div>
  )
}

function BeingRepairedPanel({ story, onAbandon }: { story: Story; onAbandon: (story: Story) => void }) {
  const checklist = normalizeRepairChecklist(story.repair_checklist)
  const nextVersion = story.script_version ? `v${story.script_version + 1}` : 'v2'

  return (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #e9d5ff', backgroundColor: '#faf5ff' }}>
      <div style={{ color: textPrimary, fontSize: '13px', fontWeight: 900, marginBottom: '10px' }}>Current repair stage</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
        {REPAIR_OPTIONS.map((section) => (
          <div key={section.group}>
            <div style={{ color: '#7e22ce', fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', marginBottom: '6px' }}>{section.title}</div>
            {section.items.filter((item) => checklist[section.group].includes(item.id)).map((item) => (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', color: textPrimary, fontSize: '12px', fontWeight: 700, marginBottom: '5px' }}>
                <input type="checkbox" checked disabled />
                {item.label}
              </label>
            ))}
            {checklist[section.group].length === 0 && <div style={{ color: textSecondary, fontSize: '12px' }}>None selected</div>}
          </div>
        ))}
      </div>
      <div style={{ color: textSecondary, fontSize: '12px', marginTop: '10px', lineHeight: 1.5 }}>
        Completed: Repairs in progress...<br />
        Remaining: all selected items<br />
        Version: {nextVersion}<br />
        Estimated completion: TBD
      </div>
      <div style={{ marginTop: '10px' }}>
        <button type="button" onClick={() => onAbandon(story)} style={actionButtonStyle('danger')}>Abandon Repair</button>
      </div>
    </div>
  )
}

function StoryReviewCard({
  story,
  onEditClick,
  onDelete,
  onSetWorkflowState,
  onPublish,
  onOpenRepair,
  repairOpen,
  onCloseRepair,
}: {
  story: Story
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  onSetWorkflowState: (story: Story, state: WorkflowTab, options?: { repairChecklist?: RepairChecklistValue; repairNotes?: string; retire?: boolean }) => void
  onPublish: (story: Story) => void
  onOpenRepair: (story: Story, prefill?: RepairChecklistValue) => void
  repairOpen: boolean
  onCloseRepair: () => void
}) {
  const isSeriesEpisode = hasRealSeriesRelationship(story)
  const rawSeriesName = String(story.series_name || '').trim()
  const seriesTitle = rawSeriesName && rawSeriesName.toLowerCase() !== 'none' ? rawSeriesName : ''
  const workflowState = effectiveWorkflowState(story)
  const lane = visualWorkflowLane(story)
  const visual = WORKFLOW_VISUALS[lane]

  return (
    <div style={{ padding: '16px', border: '1px solid rgba(148,163,184,0.20)', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(17,24,39,0.94))', boxShadow: `0 18px 44px ${visual.glowColor}`, color: '#f8fafc' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) minmax(0, 1fr) auto', gap: '18px', alignItems: 'stretch' }}>
        <div
          onClick={() => onEditClick(story)}
          title="Open packaging editor"
          style={{ minHeight: '220px', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#111827', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 16px 36px rgba(0,0,0,0.35)' }}
        >
          <img src={story.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
          <div>
            <div style={{ color: visual.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{isSeriesEpisode ? 'Series Episode' : 'Standalone Title'}</div>
            <div style={{ color: '#ffffff', fontWeight: 950, fontSize: 'clamp(26px, 3vw, 40px)', lineHeight: 1.02, marginTop: '6px' }}>{story.title}</div>
            {story.episode_title && <div style={{ color: '#cbd5e1', fontSize: '16px', marginTop: '6px', fontStyle: 'italic' }}>{story.episode_title}</div>}
            <div style={{ color: '#cbd5e1', fontSize: '14px', marginTop: '10px', lineHeight: 1.45, fontWeight: 700 }}>
              {isSeriesEpisode ? `${seriesTitle || 'Series'} · Episode ${story.episode_number}` : 'Standalone'} · {story.genre || 'No genre'} · {story.duration_mins || 0}m · by {story.author || 'Unknown'}
            </div>
            {story.description && <div style={{ color: '#e5e7eb', fontSize: '14px', marginTop: '12px', lineHeight: 1.45, maxWidth: '760px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{story.description}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workflow</div>
              <div style={{ color: visual.color, fontSize: '13px', fontWeight: 900, marginTop: '4px' }}>{WORKFLOW_LABELS[workflowState]}</div>
            </div>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Audio</div>
              <div style={{ color: story.audio_ready || story.story_audio_ready ? '#86efac' : '#fdba74', fontSize: '13px', fontWeight: 900, marginTop: '4px' }}>{story.audio_ready || story.story_audio_ready ? 'Rendered' : 'Missing'}</div>
            </div>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Packaging</div>
              <div style={{ color: story.cover_ready && story.prose_ready && story.author_ready && story.narrator_voice_ready ? '#86efac' : '#fdba74', fontSize: '13px', fontWeight: 900, marginTop: '4px' }}>{story.cover_ready && story.prose_ready && story.author_ready && story.narrator_voice_ready ? 'Complete' : 'Needs Metadata'}</div>
            </div>
          </div>
          {(story.approval_entry_reason || Boolean(story.approval_blocking_reasons?.length)) && (
            <div style={{ padding: '11px 12px', borderRadius: '10px', backgroundColor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(148,163,184,0.22)', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.45 }}>
              {story.approval_entry_reason && <div>{story.approval_entry_reason}</div>}
              {Boolean(story.approval_blocking_reasons?.length) && <div style={{ color: '#fed7aa', marginTop: story.approval_entry_reason ? '5px' : 0 }}>Blocked: {approvalBlockingSummary(story.approval_blocking_reasons)}</div>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', minWidth: '170px', justifyContent: 'center' }}>
          {workflowState !== 'cold_storage' && story.audio_url && <PlayStoryButton storyId={story.id} title={story.title} />}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit Cover</button>}
          {workflowState === 'ready_for_review' && <button onClick={() => onSetWorkflowState(story, 'approved_ready')} style={actionButtonStyle('success')}>Approve for Later</button>}
          {workflowState === 'approved_ready' && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onOpenRepair(story)} style={actionButtonStyle('muted')}>Move to Repair Shop</button>}
          {workflowState === 'repair_queue' && <button onClick={() => onSetWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('muted')}>Return to Ready for Review</button>}
          {workflowState === 'being_repaired' && <BeingRepairedPanel story={story} onAbandon={(s) => {
            if (window.confirm(`Abandon repair for "${s.title}" and return it to review?`)) onSetWorkflowState(s, 'ready_for_review')
          }} />}
          {workflowState === 'unpublished_library' && <button onClick={() => onSetWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('muted')}>Return to Review</button>}
          {workflowState === 'published' && <button onClick={() => {
            if (window.confirm(`Pull "${story.title}" from the app and place it in Cold Storage?`)) onSetWorkflowState(story, 'unpublished_library')
          }} style={actionButtonStyle('danger')}>Unpublish</button>}
          {['ready_for_review', 'approved_ready', 'unpublished_library'].includes(workflowState) && <button onClick={() => {
            if (window.confirm(`Move "${story.title}" to Cold Storage?`)) onSetWorkflowState(story, 'cold_storage')
          }} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}
          {workflowState === 'cold_storage' && (
            <button type="button" onClick={() => {
              if (window.confirm(`Retrieve "${story.title}" from Cold Storage and return it to review?`)) onSetWorkflowState(story, 'ready_for_review')
            }} style={{ border: 'none', background: 'transparent', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>
              Retrieve from Cold Storage
            </button>
          )}
          {workflowState === 'published' && <button onClick={() => {
            if (window.confirm(`This retires the story permanently from the app.\n\nMove "${story.title}" to Cold Storage?`)) onSetWorkflowState(story, 'cold_storage', { retire: true })
          }} style={{ ...actionButtonStyle('danger'), marginTop: '12px' }}>Retire this story</button>}
        </div>
      </div>
      {(repairOpen || workflowState === 'repair_queue') && (
        <RepairChecklistPanel
          title={story.title}
          initialChecklist={story.repair_checklist}
          initialNotes={story.repair_notes}
          onCancel={onCloseRepair}
          onSendToRepair={(repairChecklist, repairNotes) => onSetWorkflowState(story, 'being_repaired', { repairChecklist, repairNotes })}
          onMarkComplete={(repairChecklist, repairNotes) => onSetWorkflowState(story, 'ready_for_review', { repairChecklist, repairNotes })}
          onReturnToReview={() => onSetWorkflowState(story, 'ready_for_review')}
          onMoveToColdStorage={() => onSetWorkflowState(story, 'cold_storage')}
        />
      )}
    </div>
  )
}

function EpisodeReviewRow({
  story,
  onEditClick,
  onSetWorkflowState,
  onPublish,
  onOpenRepair,
  repairOpen,
  onCloseRepair,
}: {
  story: Story
  onEditClick: (s: Story) => void
  onSetWorkflowState: (story: Story, state: WorkflowTab, options?: { repairChecklist?: RepairChecklistValue; repairNotes?: string; retire?: boolean }) => void
  onPublish: (story: Story) => void
  onOpenRepair: (story: Story, prefill?: RepairChecklistValue) => void
  repairOpen: boolean
  onCloseRepair: () => void
}) {
  const workflowState = effectiveWorkflowState(story)
  const lane = visualWorkflowLane(story)
  const visual = WORKFLOW_VISUALS[lane]
  return (
    <div style={{ padding: '0', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '12px', backgroundColor: '#ffffff', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '70px minmax(180px, 1.45fr) minmax(120px, 0.7fr) minmax(90px, 0.45fr) minmax(130px, 0.65fr) auto', gap: '0', alignItems: 'center' }}>
        <div style={{ height: '100%', minHeight: '76px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: visual.softColor, borderRight: '1px solid rgba(148,163,184,0.24)' }}>
          <div style={{ color: visual.color, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ep</div>
          <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 950 }}>{story.episode_number || '-'}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: textPrimary, fontWeight: 900, fontSize: '14px', lineHeight: 1.2, padding: '14px 12px 4px' }}>{story.episode_title || story.title}</div>
          <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px' }}>
            <span style={{ paddingLeft: '12px' }}>{story.genre || 'No genre'} · by {story.author || 'Unknown'}</span>
          </div>
          {Boolean(story.approval_blocking_reasons?.length) && <div style={{ color: '#9a3412', fontSize: '11px', padding: '5px 12px 12px', lineHeight: 1.35 }}>Blocked: {approvalBlockingSummary(story.approval_blocking_reasons)}</div>}
        </div>
        <div style={{ color: textSecondary, fontSize: '12px', fontWeight: 700, padding: '12px' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Narrator</div>
          <div style={{ color: story.narrator_voice_name ? '#166534' : '#9a3412', marginTop: '5px', fontWeight: 900 }}>{narratorLabel(story)}</div>
        </div>
        <div style={{ color: textPrimary, fontSize: '13px', fontWeight: 900, padding: '12px' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Runtime</div>
          <div style={{ marginTop: '5px' }}>{story.duration_mins || 0}m</div>
        </div>
        <div style={{ padding: '12px' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workflow</div>
          <div style={{ display: 'inline-flex', marginTop: '6px', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '999px', backgroundColor: visual.softColor, color: visual.color, fontSize: '11px', fontWeight: 900 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: visual.color }} />
            {WORKFLOW_LABELS[workflowState]}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {workflowState !== 'cold_storage' && story.audio_url && <PlayStoryButton storyId={story.id} title={story.title} />}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit Cover</button>}
          {workflowState === 'ready_for_review' && <button onClick={() => onSetWorkflowState(story, 'approved_ready')} style={actionButtonStyle('success')}>Approve for Later</button>}
          {workflowState === 'approved_ready' && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onOpenRepair(story)} style={actionButtonStyle('muted')}>Move to Repair Shop</button>}
          {workflowState === 'repair_queue' && <button onClick={() => onSetWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('muted')}>Cancel</button>}
          {workflowState === 'unpublished_library' && <button onClick={() => onSetWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('muted')}>Return to Review</button>}
          {workflowState === 'published' && <button onClick={() => {
            if (window.confirm(`Pull "${story.title}" from the app and place it in Cold Storage?`)) onSetWorkflowState(story, 'unpublished_library')
          }} style={actionButtonStyle('danger')}>Unpublish</button>}
          {['ready_for_review', 'approved_ready', 'unpublished_library'].includes(workflowState) && <button onClick={() => {
            if (window.confirm(`Move "${story.title}" to Cold Storage?`)) onSetWorkflowState(story, 'cold_storage')
          }} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}
          {workflowState === 'published' && <button onClick={() => {
            if (window.confirm(`This retires the story permanently from the app.\n\nMove "${story.title}" to Cold Storage?`)) onSetWorkflowState(story, 'cold_storage', { retire: true })
          }} style={actionButtonStyle('danger')}>Retire this story</button>}
          {workflowState === 'cold_storage' && (
            <button type="button" onClick={() => {
              if (window.confirm(`Retrieve "${story.title}" from Cold Storage and return it to review?`)) onSetWorkflowState(story, 'ready_for_review')
            }} style={{ border: 'none', background: 'transparent', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: '4px' }}>
              Retrieve from Cold Storage
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 12px 12px 82px', backgroundColor: '#f8fafc', borderTop: '1px solid rgba(148,163,184,0.18)', color: '#475569', fontSize: '11px', fontWeight: 800 }}>
        <span>Audio {story.audio_ready ? 'ready' : 'missing'}</span>
        <span>Story audio {story.story_audio_ready ? 'ready' : 'missing'}</span>
        <span>Cover {story.cover_ready ? 'ready' : 'missing'}</span>
        <span>Prose {story.prose_ready ? 'ready' : 'missing'}</span>
      </div>
      {workflowState === 'being_repaired' && <BeingRepairedPanel story={story} onAbandon={(s) => {
        if (window.confirm(`Abandon repair for "${s.title}" and return it to review?`)) onSetWorkflowState(s, 'ready_for_review')
      }} />}
      {(repairOpen || workflowState === 'repair_queue') && (
        <RepairChecklistPanel
          title={story.title}
          initialChecklist={story.repair_checklist}
          initialNotes={story.repair_notes}
          onCancel={onCloseRepair}
          onSendToRepair={(repairChecklist, repairNotes) => onSetWorkflowState(story, 'being_repaired', { repairChecklist, repairNotes })}
          onMarkComplete={(repairChecklist, repairNotes) => onSetWorkflowState(story, 'ready_for_review', { repairChecklist, repairNotes })}
          onReturnToReview={() => onSetWorkflowState(story, 'ready_for_review')}
          onMoveToColdStorage={() => onSetWorkflowState(story, 'cold_storage')}
        />
      )}
    </div>
  )
}

function SeriesReviewGroup({
  group,
  expanded,
  onToggle,
  onApproveAllReady,
  onMoveSeriesToColdStorage,
  onOpenSeriesRepair,
  seriesRepairOpen,
  onSendSeriesRepair,
  onCloseSeriesRepair,
  onEditClick,
  onDelete,
  onSetWorkflowState,
  onPublish,
  onOpenRepair,
  openRepairStoryId,
  onCloseRepair,
}: {
  group: Extract<StoryGroup, { type: 'series' }>
  expanded: boolean
  onToggle: () => void
  onApproveAllReady: (group: Extract<StoryGroup, { type: 'series' }>) => void
  onMoveSeriesToColdStorage: (group: Extract<StoryGroup, { type: 'series' }>) => void
  onOpenSeriesRepair: (group: Extract<StoryGroup, { type: 'series' }>) => void
  seriesRepairOpen: boolean
  onSendSeriesRepair: (group: Extract<StoryGroup, { type: 'series' }>, checklist: RepairChecklistValue, notes: string, entireSeries: boolean) => void
  onCloseSeriesRepair: () => void
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  onSetWorkflowState: (story: Story, state: WorkflowTab, options?: { repairChecklist?: RepairChecklistValue; repairNotes?: string; retire?: boolean }) => void
  onPublish: (story: Story) => void
  onOpenRepair: (story: Story, prefill?: RepairChecklistValue) => void
  openRepairStoryId: string | null
  onCloseRepair: () => void
}) {
  const first = group.stories[0]
  const approvedCount = group.stories.filter(isApprovedReady).length
  const publishedCount = group.stories.filter(isPublishedToApp).length
  const readyCount = group.stories.filter((story) => effectiveWorkflowState(story) === 'ready_for_review').length
  const coldStorageCount = group.stories.filter(isNotApproved).length
  const repairCount = group.stories.filter((story) => ['repair_queue', 'being_repaired'].includes(effectiveWorkflowState(story))).length
  const blockedCount = group.stories.filter((story) => !story.approval_ready || ['repair_queue', 'being_repaired'].includes(effectiveWorkflowState(story))).length
  const missingAudioCount = group.stories.filter((story) => !story.audio_ready && !story.story_audio_ready).length
  const missingPackagingCount = group.stories.filter((story) => !story.cover_ready || !story.prose_ready || !story.author_ready || !story.narrator_voice_ready).length
  const statusBlockedCount = group.stories.filter((story) => approvalBlockingSummary(story.approval_blocking_reasons) === 'Needs Review').length
  const renderedCount = group.stories.filter((story) => story.audio_ready || story.story_audio_ready).length
  const expected = group.expectedEpisodeCount || group.stories[0]?.expected_episode_count || group.stories.length
  const present = group.presentEpisodeCount || group.stories[0]?.present_episode_count || group.stories.length
  const missing = group.missingEpisodes || []
  const blockedExplanation = blockedCount > 0
    ? seriesBlockedExplanation(group.title, renderedCount, expected, missingAudioCount, missingPackagingCount, statusBlockedCount, coldStorageCount)
    : ''
  const dominantLane = (['repair_shop', 'ready_for_review', 'approved_ready', 'published', 'cold_storage'] as WorkflowLane[])
    .find((lane) => group.stories.some((story) => visualWorkflowLane(story) === lane)) || 'ready_for_review'
  const visual = WORKFLOW_VISUALS[dominantLane]

  return (
    <div style={{ border: '1px solid rgba(148,163,184,0.24)', borderRadius: '18px', backgroundColor: '#ffffff', overflow: 'hidden', boxShadow: `0 24px 70px ${visual.glowColor}` }}>
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(190px, 260px) minmax(0, 1fr) auto', gap: '20px', alignItems: 'stretch', padding: '18px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #eef2ff 100%)' }}>
        <div style={{ minHeight: '260px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#e5e5e5', border: '1px solid rgba(15,23,42,0.10)', flexShrink: 0, boxShadow: '0 18px 40px rgba(15,23,42,0.22)' }}>
          <img src={first?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <button type="button" onClick={onToggle} style={{ minWidth: '260px', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ color: visual.color, fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.16em' }}>Series Operations</div>
            <div style={{ color: '#0f172a', fontWeight: 950, fontSize: 'clamp(32px, 4vw, 54px)', lineHeight: 0.98, marginTop: '8px' }}>{group.title}</div>
            <div style={{ color: '#475569', fontSize: '15px', marginTop: '12px', lineHeight: 1.4, fontWeight: 700 }}>
              {first?.genre || 'No genre'} · by {first?.author || 'Unknown'} · {expected} expected episodes
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '10px' }}>
            <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#0f172a', color: '#ffffff' }}>
              <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Episodes</div>
              <div style={{ fontSize: '24px', fontWeight: 950, marginTop: '4px' }}>{present}/{expected}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: visual.softColor, color: visual.color }}>
              <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Primary State</div>
              <div style={{ fontSize: '14px', fontWeight: 950, marginTop: '7px' }}>{WORKFLOW_VISUALS[dominantLane].label}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: missingAudioCount > 0 || missingPackagingCount > 0 ? '#fff7ed' : '#ecfdf5', color: missingAudioCount > 0 || missingPackagingCount > 0 ? '#9a3412' : '#047857' }}>
              <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Health</div>
              <div style={{ fontSize: '14px', fontWeight: 950, marginTop: '7px' }}>{missingAudioCount > 0 || missingPackagingCount > 0 ? 'Needs Attention' : 'Production Ready'}</div>
            </div>
          </div>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', minWidth: '176px', justifyContent: 'center' }}>
          <button type="button" onClick={onToggle} style={actionButtonStyle('muted')}>{expanded ? 'Collapse' : 'Expand'}</button>
          <button type="button" onClick={() => onApproveAllReady(group)} disabled={readyCount === 0} style={{ ...actionButtonStyle('success'), opacity: readyCount === 0 ? 0.45 : 1 }}>Approve All for Later</button>
          <button type="button" onClick={() => onOpenSeriesRepair(group)} style={actionButtonStyle('muted')}>Open Repair Shop Intake</button>
          <button type="button" onClick={() => onMoveSeriesToColdStorage(group)} style={actionButtonStyle('danger')}>Move Series to Cold Storage</button>
        </div>
      </div>
      <SeriesReadinessSummary
        title={group.title}
        expected={expected}
        present={present}
        readyCount={readyCount}
        coldStorageCount={coldStorageCount}
        blockedCount={blockedCount}
        missing={missing}
        renderedCount={renderedCount}
        missingPackagingCount={missingPackagingCount}
        missingAudioCount={missingAudioCount}
        approvedCount={approvedCount}
        publishedCount={publishedCount}
        blockedExplanation={repairCount > 0 ? `${group.title}: repair work is active or queued for ${repairCount} episode${repairCount === 1 ? '' : 's'}.` : blockedExplanation}
        approvalBlockingReasons={group.approvalBlockingReasons}
      />
      {seriesRepairOpen && (
        <div style={{ padding: '0 14px 14px 14px' }}>
          <RepairChecklistPanel
            title={group.title}
            initialChecklist={{ ...emptyRepairChecklist(), story_script: ['series_continuity_problem'] }}
            onCancel={onCloseSeriesRepair}
            onSendToRepair={(checklist, notes) => onSendSeriesRepair(group, checklist, notes, true)}
            onMarkComplete={(checklist, notes) => onSendSeriesRepair(group, checklist, notes, true)}
            onReturnToReview={onCloseSeriesRepair}
            onMoveToColdStorage={() => onMoveSeriesToColdStorage(group)}
            showSeriesScope
            repairEntireSeries
          />
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 18px 18px 18px', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px minmax(180px, 1.45fr) minmax(120px, 0.7fr) minmax(90px, 0.45fr) minmax(130px, 0.65fr) auto', gap: 0, alignItems: 'center', padding: '8px 0', color: '#64748b', fontSize: '10px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <div />
            <div>Episode</div>
            <div>Narrator</div>
            <div>Runtime</div>
            <div>Workflow</div>
            <div style={{ textAlign: 'right' }}>Controls</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {group.stories.map((story) => (
            <EpisodeReviewRow
              key={story.id}
              story={story}
              onEditClick={onEditClick}
              onSetWorkflowState={onSetWorkflowState}
              onPublish={onPublish}
              onOpenRepair={onOpenRepair}
              repairOpen={openRepairStoryId === story.id}
              onCloseRepair={onCloseRepair}
            />
          ))}
          </div>
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
  const [activeTab, setActiveTab] = useState<WorkflowLane>('ready_for_review')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({})
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const [openRepairStoryId, setOpenRepairStoryId] = useState<string | null>(null)
  const [openRepairSeriesKey, setOpenRepairSeriesKey] = useState<string | null>(null)
  const [activePipelineTab, setActivePipelineTab] = useState<WorkflowLane>('ready_for_review')
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null)
  const [seriesSearch, setSeriesSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState<WorkflowFilter>('all')
  const [repairOpenForStoryId, setRepairOpenForStoryId] = useState<string | null>(null)
  const [seriesActionsOpen, setSeriesActionsOpen] = useState(false)
  const [repairEntireSeries, setRepairEntireSeries] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [markedForDeletionIds, setMarkedForDeletionIds] = useState<Record<string, boolean>>({})
  const editingStoryRef = useRef<Story | null>(null)
  const pipelineRef = useRef<HTMLDivElement>(null)
  const seriesActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchStories()
    fetchGenres()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (seriesActionsRef.current && !seriesActionsRef.current.contains(target)) setSeriesActionsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

    const detailColumns = 'id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,intro_audio_url,intro_before_url,intro_after_url,outro_audio_url,background_music_url,status,is_hidden,created_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,narrator_voice_name,workflow_state,repair_checklist,repair_notes,script_version,is_v2,script_json,brief_json,script,story_type,production_cost'
    const legacyDetailColumns = 'id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,status,is_hidden,created_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,narrator_voice_name,production_cost'
    let storyRowsResult: any = await supabase
      .from('stories')
      .select(detailColumns)
      .in('id', eligibleIds)
      .order('created_at', { ascending: false })

    if (storyRowsResult.error && /workflow_state|repair_checklist|repair_notes|script_version|is_v2|script_json|brief_json|script|story_type|intro_audio_url|intro_before_url|intro_after_url|outro_audio_url|background_music_url|schema cache|column/i.test(storyRowsResult.error.message || '')) {
      storyRowsResult = await supabase
        .from('stories')
        .select(legacyDetailColumns)
        .in('id', eligibleIds)
        .order('created_at', { ascending: false })
      if (storyRowsResult.data) {
        storyRowsResult.data = storyRowsResult.data.map((story: any) => ({
          ...story,
          workflow_state: null,
          repair_checklist: null,
          repair_notes: null,
          script_version: null,
          is_v2: null,
          script_json: null,
          brief_json: null,
          script: null,
          story_type: null,
          intro_audio_url: null,
          intro_before_url: null,
          intro_after_url: null,
          outro_audio_url: null,
          background_music_url: null,
        }))
      }
    }

    const { data: storyRows, error: storyRowsError } = storyRowsResult

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
    setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
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

  async function setWorkflowState(story: Story, state: WorkflowTab, options: { repairChecklist?: RepairChecklistValue; repairNotes?: string; retire?: boolean } = {}) {
    try {
      const res = await fetch('/api/admin/content-approval?action=set_workflow_state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          state,
          repairChecklist: options.repairChecklist,
          repairNotes: options.repairNotes,
          retire: options.retire,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        alert(`Workflow update failed: ${result.error || `HTTP ${res.status}`}`)
        return
      }
      setOpenRepairStoryId(null)
      await fetchStories()
    } catch (err) {
      alert('Workflow update failed: ' + String(err))
    }
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
    if (!window.confirm(`Unpublish "${story.title}" and move it to Ready to Publish?`)) return
    await setWorkflowState(story, 'unpublished_library')
    await setWorkflowState({ ...story, status: 'audio_ready', is_hidden: true, workflow_state: 'unpublished_library' }, 'ready_for_review')
    await setWorkflowState({ ...story, status: 'audio_ready', is_hidden: true, workflow_state: 'ready_for_review' }, 'approved_ready')
  }

  async function moveSeriesToColdStorage(group: Extract<StoryGroup, { type: 'series' }>) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return
    const hasPublishedEpisode = group.stories.some(isPublishedToApp)
    const warning = hasPublishedEpisode
      ? `Move the entire series "${group.title}" to Cold Storage?\n\nPublished episodes will be unpublished first. No files or story rows will be deleted.`
      : `Move the entire series "${group.title}" to Cold Storage?\n\nNo files or story rows will be deleted.`
    if (!window.confirm(warning)) return
    for (const story of group.stories.filter((item) => effectiveWorkflowState(item) !== 'cold_storage')) {
      await setWorkflowState(story, 'cold_storage', { retire: effectiveWorkflowState(story) === 'published' })
    }
    await fetchStories()
  }

  async function approveAllReady(group: Extract<StoryGroup, { type: 'series' }>) {
    const ready = group.stories.filter((story) => effectiveWorkflowState(story) === 'ready_for_review')
    if (ready.length === 0) return
    if (!window.confirm(`Approve ${ready.length} ready episode(s) in "${group.title}" for later publishing?`)) return
    for (const story of ready) {
      await setWorkflowState(story, 'approved_ready')
    }
    await fetchStories()
  }

  function openStoryRepair(story: Story, prefill?: RepairChecklistValue) {
    if (prefill) {
      setStories((prev) => prev.map((item) => item.id === story.id ? { ...item, repair_checklist: prefill } : item))
    }
    setOpenRepairStoryId(story.id)
    setRepairOpenForStoryId(story.id)
  }

  function openSeriesRepair(group: Extract<StoryGroup, { type: 'series' }>) {
    setOpenRepairSeriesKey(group.key)
    setRepairEntireSeries(false)
    setExpandedSeries(prev => ({ ...prev, [group.key]: true }))
  }

  async function sendSeriesRepair(group: Extract<StoryGroup, { type: 'series' }>, checklist: RepairChecklistValue, repairNotes = '', entireSeries = false) {
    const candidateStories = entireSeries ? group.stories : group.stories.slice(0, 1)
    const repairable = candidateStories.filter((story) => ['ready_for_review', 'approved_ready', 'published', 'unpublished_library'].includes(effectiveWorkflowState(story)))
    if (repairable.length === 0) return
    for (const story of repairable) {
      await setWorkflowState(story, 'repair_queue', { repairChecklist: checklist, repairNotes })
    }
    setOpenRepairSeriesKey(null)
    setRepairEntireSeries(false)
    await fetchStories()
  }

  async function publishAllApproved() {
    const approved = stories.filter((story) => effectiveWorkflowState(story) === 'approved_ready')
    if (approved.length === 0) return
    if (!window.confirm(`Publish ${approved.length} ready-to-publish item(s) to the app?`)) return
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

  const workflowCounts = groupsFromReadiness.reduce((counts, group) => {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    const lanes = new Set(groupStories.map(visualWorkflowLane))
    lanes.forEach((lane) => {
      counts[lane] = (counts[lane] || 0) + 1
    })
    return counts
  }, {} as Record<WorkflowLane, number>)

  function groupEpisodeCountForTab(group: StoryGroup, tab: WorkflowFilter) {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    if (tab === 'all') return group.type === 'series'
      ? group.presentEpisodeCount || group.stories[0]?.present_episode_count || groupStories.length
      : groupStories.length
    return storiesForWorkflowLane(groupStories, tab).length
  }

  const seriesGroups = groupsFromReadiness
    .filter((group) => {
      const groupStories = group.type === 'series' ? group.stories : [group.story]
      const title = group.type === 'series' ? group.title : group.story.title
      const matchesSearch = !seriesSearch.trim() || title.toLowerCase().includes(seriesSearch.trim().toLowerCase())
      const selectedWorkflow = seriesFilter === 'all' ? activePipelineTab : seriesFilter
      const matchesWorkflow = groupStories.some((story) => storyMatchesWorkflowLane(story, selectedWorkflow))
      return matchesSearch && matchesWorkflow
    })
    .sort((a, b) => {
      const aCount = groupEpisodeCountForTab(a, activePipelineTab)
      const bCount = groupEpisodeCountForTab(b, activePipelineTab)
      if (bCount !== aCount) return bCount - aCount
      const aTitle = a.type === 'series' ? a.title : a.story.title
      const bTitle = b.type === 'series' ? b.title : b.story.title
      return aTitle.localeCompare(bTitle)
    })

  const selectedGroup = seriesGroups.find((group) => group.key === selectedSeriesKey) || seriesGroups[0] || null
  useEffect(() => {
    if (selectedSeriesKey && seriesGroups.some((group) => group.key === selectedSeriesKey)) return
    setSelectedSeriesKey(seriesGroups[0]?.key || null)
  }, [selectedSeriesKey, seriesGroups.map((group) => group.key).join('|')])

  function setPipelineTab(tab: WorkflowLane) {
    setActivePipelineTab(tab)
    setSeriesFilter('all')
    setSelectedSeriesKey(null)
    setRepairOpenForStoryId(null)
    setOpenRepairSeriesKey(null)
    setSeriesActionsOpen(false)
    setTimeout(() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function workflowSubLabel(state: WorkflowTab) {
    if (state === 'repair_queue' || state === 'being_repaired') return repairSubstate({ workflow_state: state } as Story)
    return STREAMING_PIPELINE.find((item) => item.id === visualWorkflowLane({ workflow_state: state } as Story))?.sub || ''
  }

  function workflowDisplayLabel(state: WorkflowTab) {
    return WORKFLOW_LABELS[state]
  }

  function renderEpisodeActions(story: Story) {
    const state = effectiveWorkflowState(story)
    const lane = visualWorkflowLane(story)
    const canPlay = lane !== 'cold_storage' && Boolean(story.audio_url)
    const canShowRemasterCopy = isRemasterCandidateState(state) && productionStandardForStory(story).standard === 'remaster_candidate'
    const openRepair = () => setRepairOpenForStoryId(story.id)
    const moveToColdStorage = () => {
      if (window.confirm(`Move "${story.title}" to Cold Storage?`)) setWorkflowState(story, 'cold_storage')
    }
    const retrieveFromColdStorage = () => {
      if (window.confirm(`Retrieve "${story.title}" from Cold Storage and return it to review?`)) setWorkflowState(story, 'ready_for_review')
    }
    const returnToRepairQueue = () => {
      if (window.confirm(`Return "${story.title}" to Repair Shop?`)) setWorkflowState(story, 'repair_queue')
    }
    const markRepairComplete = () => {
      if (window.confirm(`Mark repair complete for "${story.title}" and return it to Ready for Review?`)) setWorkflowState(story, 'ready_for_review')
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))', alignItems: 'stretch', gap: '6px', width: '100%', minWidth: 0 }}>
        {canPlay && <PlayStoryButton storyId={story.id} title={story.title} />}
        {state === 'ready_for_review' && <button type="button" onClick={() => setWorkflowState(story, 'approved_ready')} style={actionButtonStyle('success')}>Approve for Later</button>}
        {state === 'ready_for_review' && <button type="button" onClick={() => publishStory(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
        {state === 'ready_for_review' && <button type="button" onClick={openRepair} style={actionButtonStyle('muted')}>Move to Repair Shop</button>}
        {state === 'ready_for_review' && <button type="button" onClick={moveToColdStorage} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}

        {state === 'approved_ready' && <button type="button" onClick={() => publishStory(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
        {state === 'approved_ready' && <button type="button" onClick={() => setWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('muted')}>Return to Ready for Review</button>}
        {state === 'approved_ready' && <button type="button" onClick={openRepair} style={actionButtonStyle('muted')}>Move to Repair Shop</button>}
        {state === 'approved_ready' && <button type="button" onClick={moveToColdStorage} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}

        {state === 'repair_queue' && <button type="button" onClick={openRepair} style={actionButtonStyle('muted')}>Edit Repair Notes</button>}
        {state === 'repair_queue' && <button type="button" onClick={() => setWorkflowState(story, 'being_repaired', { repairChecklist: normalizeRepairChecklist(story.repair_checklist) })} style={actionButtonStyle('primary')}>Send to Being Repaired</button>}
        {state === 'repair_queue' && <button type="button" onClick={() => setWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('success')}>Return to Ready for Review</button>}
        {state === 'repair_queue' && <button type="button" onClick={moveToColdStorage} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}

        {state === 'being_repaired' && <button type="button" onClick={openRepair} style={actionButtonStyle('muted')}>View Repair Status</button>}
        {state === 'being_repaired' && <button type="button" onClick={markRepairComplete} style={actionButtonStyle('success')}>Mark Repair Complete</button>}
        {state === 'being_repaired' && <button type="button" onClick={returnToRepairQueue} style={actionButtonStyle('muted')}>Return to Repair Shop</button>}

        {state === 'cold_storage' && <button type="button" onClick={retrieveFromColdStorage} style={actionButtonStyle('muted')}>Retrieve from Cold Storage</button>}

        {state === 'published' && <button type="button" onClick={() => window.open(`/player/${story.id}`, '_blank', 'noopener,noreferrer')} style={actionButtonStyle('muted')}>View in App / Play</button>}
        {canShowRemasterCopy && <RemasterCopyUnavailable />}
        {state === 'published' && <button type="button" onClick={() => unpublishStory(story)} style={actionButtonStyle('danger')}>Unpublish to Ready to Publish</button>}
        {state === 'unpublished_library' && <button type="button" onClick={() => setWorkflowState(story, 'ready_for_review')} style={actionButtonStyle('success')}>Return to Ready for Review</button>}
        {state === 'unpublished_library' && <button type="button" onClick={openRepair} style={actionButtonStyle('muted')}>Move to Repair Shop</button>}
        {state === 'unpublished_library' && <button type="button" onClick={moveToColdStorage} style={actionButtonStyle('danger')}>Move to Cold Storage</button>}
      </div>
    )
  }

  const totalStoryCount = stories.length

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )

  const activeWorkflow = STREAMING_PIPELINE.find((item) => item.id === activePipelineTab) || STREAMING_PIPELINE[0]
  const activeWorkflowCount = workflowCounts[activePipelineTab] || 0
  const activeEmptyMessage = activePipelineTab === 'repair_shop'
    ? 'No active repairs.'
    : activePipelineTab === 'published'
      ? 'No published stories in this view.'
      : `No ${activeWorkflow.label.toLowerCase()} items.`
  const selectedAllStories = selectedGroup ? (selectedGroup.type === 'series' ? selectedGroup.stories : [selectedGroup.story]) : []
  const selectedStories = storiesForWorkflowLane(selectedAllStories, activePipelineTab)
  const selectedFirst = selectedStories[0]
  const selectedIsSeries = selectedGroup ? isTrueSeriesGroup(selectedGroup) : false
  const selectedTitle = selectedIsSeries && selectedGroup?.type === 'series' ? selectedGroup.title : selectedFirst?.title || ''
  const selectedExpected = selectedGroup ? (selectedIsSeries ? groupExpectedCount(selectedGroup) : 1) : 0
  const selectedPresent = selectedGroup ? (selectedIsSeries ? groupPresentCount(selectedGroup) : 1) : 0
  const selectedTotalMinutes = selectedStories.reduce((sum, story) => sum + (story.duration_mins || 0), 0)
  const selectedMarkedForDeletion = selectedStories.some((story) => markedForDeletionIds[story.id])
  const selectedCanShowRemasterCopy = selectedStories.some((story) =>
    isRemasterCandidateState(effectiveWorkflowState(story)) &&
    productionStandardForStory(story).standard === 'remaster_candidate'
  )

  function markSelectedForDeletionReview() {
    if (selectedStories.length === 0) return
    setMarkedForDeletionIds((prev) => {
      const next = { ...prev }
      selectedStories.forEach((story) => {
        next[story.id] = true
      })
      return next
    })
  }

  function moveSelectedToColdStorage() {
    if (!selectedGroup || !selectedFirst) return
    if (selectedGroup.type === 'series') {
      moveSeriesToColdStorage(selectedGroup)
      return
    }
    if (window.confirm(`Move "${selectedFirst.title}" to Cold Storage?`)) {
      setWorkflowState(selectedFirst, 'cold_storage', { retire: effectiveWorkflowState(selectedFirst) === 'published' })
    }
  }

  function moveSelectedToRepairShop() {
    if (!selectedGroup || !selectedFirst) return
    if (selectedGroup.type === 'series' && selectedIsSeries) {
      openSeriesRepair(selectedGroup)
      return
    }
    openStoryRepair(selectedFirst)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '24px 28px', color: '#1F2937' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .approval-panels { flex-direction: column !important; }
          .approval-left-panel { flex-basis: auto !important; width: 100% !important; }
          .approval-pipeline-inner { overflow-x: auto !important; }
          .approval-pipeline-step { flex: 1 0 220px !important; }
        }
      ` }} />

      <div style={{ maxWidth: 'none', margin: 0 }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1F2937', letterSpacing: 0 }}>
              Content Approval & Workflow
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6B7280' }}>
              Manage the complete content lifecycle from review to publication
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9CA3AF', fontSize: '11px' }}>
            <span>Last updated: {lastUpdated || 'Never'}</span>
            <button type="button" onClick={fetchStories} title="Refresh" style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', color: '#6B7280', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>
              ↻
            </button>
          </div>
        </div>

        <div ref={pipelineRef} style={{ marginTop: '20px' }}>
          <div style={{ color: '#6B7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Workflow Pipeline</div>
          <div className="approval-pipeline-inner" style={{ borderRadius: '10px', padding: '16px', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'stretch', gap: '12px' }}>
            {STREAMING_PIPELINE.map((item, index) => {
              const active = activePipelineTab === item.id
              const count = workflowCounts[item.id] || 0
              return (
                <Fragment key={item.id}>
                  <button type="button" className="approval-pipeline-step" onClick={() => setPipelineTab(item.id)} style={{ flex: '1 1 0', minWidth: '190px', minHeight: '82px', border: `1px solid ${active ? item.color : '#E5E7EB'}`, borderRadius: '10px', padding: '14px 16px', backgroundColor: active ? `${item.color}12` : '#ffffff', boxShadow: active ? `0 0 0 2px ${item.color}18` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', cursor: 'pointer' }}>
                    <span style={{ textAlign: 'left', color: '#111827' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 900, lineHeight: 1.2 }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: item.color, flex: '0 0 auto' }} />
                        {item.label}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6B7280', lineHeight: 1.25, marginTop: '6px', paddingLeft: '18px' }}>{item.sub}</span>
                    </span>
                    <span style={{ minWidth: '34px', height: '34px', padding: '0 8px', borderRadius: '999px', backgroundColor: `${item.color}18`, color: item.color, fontSize: '14px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{count}</span>
                  </button>
                  {index < STREAMING_PIPELINE.length - 1 && <span style={{ color: '#D1D5DB', fontSize: '18px', alignSelf: 'center', flex: '0 0 auto' }}>›</span>}
                </Fragment>
              )
            })}
          </div>
        </div>

        <div className="approval-panels" style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <aside className="approval-left-panel" style={{ flex: '0 0 340px', backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ color: '#374151', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{activeWorkflow.label} ({activeWorkflowCount})</div>
              <button type="button" onClick={() => console.log('new series')} style={{ border: 'none', background: 'transparent', color: '#E8722A', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ New Series</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <input type="text" value={seriesSearch} onChange={(e) => setSeriesSearch(e.target.value)} placeholder="🔍 Search series..." style={{ flex: '1 1 60%', height: '32px', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0 9px', color: '#374151', fontSize: '12px' }} />
              <select value={seriesFilter} onChange={(e) => {
                const next = e.target.value as WorkflowFilter
                setSeriesFilter(next)
                if (next !== 'all') {
                  setActivePipelineTab(next)
                  setSelectedSeriesKey(null)
                  setRepairOpenForStoryId(null)
                  setOpenRepairSeriesKey(null)
                  setSeriesActionsOpen(false)
                }
              }} style={{ flex: '0 0 35%', height: '32px', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0 7px', color: '#374151', backgroundColor: '#ffffff', fontSize: '12px' }}>
                <option value="all">This Workflow</option>
                {STREAMING_PIPELINE.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
              {seriesGroups.map((group) => {
                const groupStories = group.type === 'series' ? group.stories : [group.story]
                const firstStory = groupStories[0]
                const groupTitle = group.type === 'series' ? group.title : group.story.title
                const trueSeries = isTrueSeriesGroup(group)
                const expected = trueSeries ? groupExpectedCount(group) : 1
                const present = trueSeries ? groupPresentCount(group) : 1
                const currentCount = groupEpisodeCountForTab(group, activePipelineTab)
                const selected = selectedSeriesKey === group.key
                return (
                  <button key={group.key} type="button" onClick={() => setSelectedSeriesKey(group.key)} style={{ minHeight: '64px', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 8px', borderRadius: '6px', border: 'none', borderLeft: selected ? '3px solid #E8722A' : '3px solid transparent', backgroundColor: selected ? '#FFF7ED' : '#ffffff', cursor: 'pointer', textAlign: 'left' }} onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#F9FAFB' }} onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#ffffff' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                      <img src={firstStory?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <div style={{ color: '#1F2937', fontSize: '13px', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupTitle}</div>
                      <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstStory?.genre || 'No genre'} • {firstStory?.author || 'Unknown'}</div>
                      <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '3px' }}>{trueSeries ? `Series • ${expected} episodes • ${present} present` : `Standalone • ${firstStory?.duration_mins || 0}m`}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: '0 0 auto' }}>
                      <span style={{ width: '24px', height: '24px', borderRadius: '999px', backgroundColor: currentCount > 0 ? '#E8722A' : '#E5E7EB', color: currentCount > 0 ? '#ffffff' : '#6B7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{currentCount}</span>
                      <span style={{ color: '#9CA3AF', fontSize: '14px' }}>›</span>
                    </div>
                  </button>
                )
              })}
              {seriesGroups.length === 0 && <div style={{ padding: '28px 8px', textAlign: 'center', color: '#9CA3AF', fontSize: '12px' }}>{activeEmptyMessage}</div>}
            </div>
            <div style={{ marginTop: '12px', color: '#9CA3AF', fontSize: '10px' }}>
              {seriesGroups.length > 0 ? `Showing 1 to ${seriesGroups.length} ${activeWorkflow.label.toLowerCase()} item(s)` : activeEmptyMessage}
            </div>
          </aside>

          <main style={{ flex: '1 1 0', minWidth: 0, backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px' }}>
            {!selectedGroup && (
              <div style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '30px', color: '#D1D5DB' }}>▦</div>
                <div>{activeEmptyMessage}</div>
              </div>
            )}
            {selectedGroup && selectedFirst && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{ width: '100px', height: '70px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                    <img src={selectedFirst.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <button type="button" onClick={() => { editingStoryRef.current = selectedFirst; setEditingStory(selectedFirst) }} title="Edit cover" style={{ border: 'none', background: 'transparent', color: '#9CA3AF', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '3px' }}>✎</button>
                    <div style={{ color: '#1F2937', fontSize: '20px', fontWeight: 800, lineHeight: 1.15 }}>{selectedTitle}</div>
                    <div style={{ marginTop: '5px', color: '#6B7280', fontSize: '12px' }}>{selectedFirst.genre || 'No genre'} • by {selectedFirst.author || 'Unknown'}</div>
                    <div style={{ marginTop: '4px', color: '#9CA3AF', fontSize: '11px' }}>{selectedIsSeries ? `${selectedExpected} total episodes • ${selectedPresent} present` : `Standalone • ${selectedFirst.duration_mins || 0}m`}</div>
                  </div>
                  <div ref={seriesActionsRef} style={{ position: 'relative', flex: '0 0 auto', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {selectedCanShowRemasterCopy && <RemasterCopyUnavailable compact />}
                    <button type="button" onClick={() => setSeriesActionsOpen((value) => !value)} style={{ height: '30px', padding: '0 10px', border: '1px solid #FED7AA', borderRadius: '6px', backgroundColor: '#ffffff', color: '#E8722A', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Series Actions ▾</button>
                    {seriesActionsOpen && (
                      <div style={{ position: 'absolute', right: 0, top: '36px', zIndex: 18, minWidth: '190px', padding: '6px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #E5E7EB', boxShadow: '0 10px 24px rgba(15,23,42,0.16)' }}>
                        <button type="button" onClick={() => { if (selectedGroup.type === 'series') approveAllReady(selectedGroup); setSeriesActionsOpen(false) }} style={{ width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', textAlign: 'left', color: '#374151', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Approve All for Later</button>
                        <button type="button" onClick={() => { if (selectedGroup.type === 'series') openSeriesRepair(selectedGroup); else openStoryRepair(selectedFirst); setSeriesActionsOpen(false) }} style={{ width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', textAlign: 'left', color: '#374151', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Open Repair Shop Intake</button>
                        <button type="button" onClick={() => { console.log('view series overview', selectedGroup.key); setSeriesActionsOpen(false) }} style={{ width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', textAlign: 'left', color: '#374151', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>📋 View Series Overview</button>
                        <button type="button" onClick={() => { if (selectedGroup.type === 'series') moveSeriesToColdStorage(selectedGroup); else if (window.confirm(`Move "${selectedFirst.title}" to Cold Storage?`)) setWorkflowState(selectedFirst, 'cold_storage'); setSeriesActionsOpen(false) }} style={{ width: '100%', border: 'none', background: 'transparent', padding: '8px 10px', textAlign: 'left', color: '#B91C1C', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Move to Cold Storage</button>
                      </div>
                    )}
                  </div>
                </div>

                <StoryIntelligenceStrip
                  stories={selectedStories}
                  deletionMarked={selectedMarkedForDeletion}
                  onMoveToColdStorage={moveSelectedToColdStorage}
                  onMoveToRepairShop={moveSelectedToRepairShop}
                  onMarkForDeletion={markSelectedForDeletionReview}
                />

                {selectedIsSeries && selectedGroup.type === 'series' && openRepairSeriesKey === selectedGroup.key && (
                  <RepairChecklistPanel
                    title={selectedTitle}
                    initialChecklist={emptyRepairChecklist()}
                    onCancel={() => setOpenRepairSeriesKey(null)}
                    onSendToRepair={(checklist, notes) => sendSeriesRepair(selectedGroup, checklist, notes, repairEntireSeries)}
                    onMarkComplete={() => setOpenRepairSeriesKey(null)}
                    onReturnToReview={() => setOpenRepairSeriesKey(null)}
                    onMoveToColdStorage={() => moveSeriesToColdStorage(selectedGroup)}
                    showSeriesScope
                    repairEntireSeries={repairEntireSeries}
                    onRepairEntireSeriesChange={setRepairEntireSeries}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#6B7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{selectedIsSeries ? 'Episodes in this series' : 'Story detail'}</span>
                    <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>≡ Total: {selectedStories.length}</span>
                    <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>⏱ {selectedIsSeries ? `${selectedTotalMinutes}m Total Audio` : `${selectedFirst.duration_mins || 0}m Audio`}</span>
                    {selectedIsSeries && <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>✓ {selectedPresent} Present</span>}
                  </div>
                  <button type="button" onClick={() => console.log('view series overview', selectedGroup.key)} style={{ border: 'none', background: 'transparent', color: '#E8722A', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>View Series Overview</button>
                </div>

                <div style={{ marginTop: '10px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '960px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '6%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '32%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ height: '36px', backgroundColor: '#F9FAFB' }}>
                        {['Episode', 'Title', 'Narrator', 'Duration', 'Workflow State', 'Standard', 'Actions'].map((head) => (
                          <th key={head} style={{ padding: '0 10px', color: '#6B7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', textAlign: head === 'Actions' ? 'right' : 'left' }}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStories.map((story) => {
                        const state = effectiveWorkflowState(story)
                        const lane = visualWorkflowLane(story)
                        const colors = WORKFLOW_COLORS[lane]
                        const narratorName = narratorLabel(story)
                        const storyType = (story as any).story_type || 'story'
                        const audioReady = Boolean(story.audio_url || story.story_audio_url || story.audio_ready || story.story_audio_ready)
                        const isAffectedRepairEpisode = visualWorkflowLane(story) === 'repair_shop'
                        const isNeutralInRepairView = activePipelineTab === 'repair_shop' && !isAffectedRepairEpisode
                        const lastRepairIssue = firstRepairIssueLabel(story.repair_checklist)
                        const markedForDeletion = markedForDeletionIds[story.id]
                        return (
                          <Fragment key={story.id}>
                            <tr style={{
                              height: '60px',
                              borderBottom: '1px solid #F3F4F6',
                              backgroundColor: markedForDeletion ? '#F3F4F6' : isAffectedRepairEpisode ? '#FFF7ED' : '#ffffff',
                              opacity: isNeutralInRepairView ? 0.55 : 1,
                              boxShadow: markedForDeletion ? 'inset 3px 0 0 #6B7280' : isAffectedRepairEpisode ? 'inset 3px 0 0 #F97316' : undefined,
                            }}>
                              <td style={{ padding: '10px', color: '#1F2937', fontSize: '18px', fontWeight: 800 }}>{story.episode_number || '-'}</td>
                              <td style={{ padding: '10px', minWidth: 0 }}>
                                <div style={{ color: '#1F2937', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.episode_title || story.title}</div>
                                <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '4px' }}>{selectedIsSeries ? `Episode ${story.episode_number || '-'}` : 'Standalone story'}</div>
                                {effectiveWorkflowState(story) === 'ready_for_review' && lastRepairIssue && (
                                  <div style={{ display: 'inline-flex', marginTop: '5px', padding: '3px 7px', borderRadius: '999px', backgroundColor: '#ffedd5', color: '#9a3412', fontSize: '10px', fontWeight: 800 }}>
                                    Returned from Repair • Last repair: {lastRepairIssue}
                                  </div>
                                )}
                                {markedForDeletion && (
                                  <div style={{ display: 'inline-flex', marginTop: '5px', padding: '3px 7px', borderRadius: '999px', backgroundColor: '#E5E7EB', color: '#374151', fontSize: '10px', fontWeight: 900 }}>
                                    Marked for deletion review
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '10px' }}>
                                <div style={{ color: '#1F2937', fontSize: '12px' }}>{narratorName}</div>
                                {audioReady && <div style={{ color: '#059669', fontSize: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '999px', backgroundColor: '#10B981' }} />Audio ready {storyType ? `(${storyType})` : ''}</div>}
                                {isAffectedRepairEpisode && <div style={{ color: '#9A3412', fontSize: '10px', fontWeight: 800, marginTop: '4px' }}>This episode is in Repair Shop</div>}
                              </td>
                              <td style={{ padding: '10px', color: '#374151', fontSize: '12px' }}>{story.duration_mins ? `${story.duration_mins}m` : '—'}</td>
                              <td style={{ padding: '10px' }}>
                                <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '4px 10px', backgroundColor: colors.bg, color: colors.text, fontSize: '11px', fontWeight: 800 }}>{workflowDisplayLabel(state)}</span>
                                <div style={{ marginTop: '4px', color: '#9CA3AF', fontSize: '9px' }}>{isAffectedRepairEpisode ? repairSubstate(story) : workflowSubLabel(state)}</div>
                              </td>
                              <td style={{ padding: '10px' }}>
                                <ProductionStandardBadge story={story} />
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'middle' }}>
                                {renderEpisodeActions(story)}
                              </td>
                            </tr>
                            {repairOpenForStoryId === story.id && (
                              <tr key={`${story.id}:repair`} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td colSpan={7} style={{ padding: '0 10px 12px 10px' }}>
                                  <RepairChecklistPanel
                                    title={story.title}
                                    initialChecklist={story.repair_checklist}
                                    initialNotes={story.repair_notes}
                                    onCancel={() => setRepairOpenForStoryId(null)}
                                    onSendToRepair={(repairChecklist, repairNotes) => {
                                      setWorkflowState(story, 'being_repaired', { repairChecklist, repairNotes })
                                      setRepairOpenForStoryId(null)
                                    }}
                                    onMarkComplete={(repairChecklist, repairNotes) => {
                                      setWorkflowState(story, 'ready_for_review', { repairChecklist, repairNotes })
                                      setRepairOpenForStoryId(null)
                                    }}
                                    onReturnToReview={() => {
                                      setWorkflowState(story, 'ready_for_review')
                                      setRepairOpenForStoryId(null)
                                    }}
                                    onMoveToColdStorage={() => {
                                      setWorkflowState(story, 'cold_storage')
                                      setRepairOpenForStoryId(null)
                                    }}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '12px', color: '#9CA3AF', fontSize: '10px' }}>Showing 1 to {selectedStories.length} of {selectedStories.length} episodes</div>
              </>
            )}
          </main>
        </div>
      </div>

      {activePipelineTab === 'approved_ready' && (
        <button type="button" onClick={publishAllApproved} style={{ position: 'fixed', right: '28px', bottom: '28px', padding: '9px 13px', borderRadius: '8px', border: 'none', backgroundColor: '#10B981', color: '#ffffff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 24px rgba(16,185,129,0.28)' }}>
          Publish All Ready to Publish
        </button>
      )}

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
