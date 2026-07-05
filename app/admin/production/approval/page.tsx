'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { evaluateStoryGate, evaluateQCChecklist, deriveOrionRecommendation } from '@/lib/story-gates'
import type { QCChecklistItem } from '@/lib/story-gates'

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
  prose_text?: string | null
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
  updated_at?: string | null
  status?: string | null
  audio_url?: string | null
  story_audio_url?: string | null
  intro_audio_url?: string | null
  intro_before_url?: string | null
  intro_after_url?: string | null
  outro_audio_url?: string | null
  background_music_url?: string | null
  narrator_voice_name?: string | null
  narratorVoiceName?: string | null
  series_id?: string | null
  episode_number?: number | null
  expected_episode_count?: number | null
  present_episode_count?: number | null
  approval_ready?: boolean
  approval_blocking_reasons?: string[]
  approval_entry_reason?: string | null
  source_job_id?: string | null
  completion_sort_date?: string | null
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
  production_standard?: 'current_standard' | 'remaster_candidate' | 'unknown' | null
  production_standard_updated_at?: string | null
  production_standard_updated_by?: string | null
  production_priority: number
  script_version?: number | null
  is_v2?: boolean | null
  script_json?: any
  brief_json?: any
  script?: string | null
  story_type?: string | null
  recommended_by?: string | null
  source?: string | null
  source_job?: {
    id: string
    status: string | null
    current_step: string | null
    updated_at: string | null
    locked_by?: string | null
    locked_at?: string | null
    error_json?: any
  } | null
  // ATL-CONS-001 Phase C: QC checklist data
  grading_result?: Record<string, unknown> | null
  author_id?: string | null
  narrator_voice_id?: string | null
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

type WorkflowTab = 'ready_for_review' | 'approved_ready' | 'repair_queue' | 'being_repaired' | 'unpublished_library' | 'cold_storage' | 'published' | 'stories_in_queue' | 'scripts_ready' | 'failed'
type WorkflowLane = 'ready_for_review' | 'repair_shop' | 'production_queue' | 'approved_ready' | 'published' | 'cold_storage'
type InternalWorkflowLane = WorkflowLane
type WorkflowFilter = WorkflowLane | 'all'
type RepairGroup = 'story_script' | 'audio_asc' | 'packaging'
type RepairChecklistValue = Record<RepairGroup, string[]>
type RepairIssueDetails = Record<string, { comment: string }>
type RepairCommentRow = { comment: string; remainingTime: string }
type ProductionQueueView = 'production_order' | 'by_episodes'
type ProductionJobSummary = {
  id: string
  story_id: string | null
  series_id: string | null
  status: string | null
  current_step: string | null
  updated_at: string | null
  locked_by?: string | null
  created_at?: string | null
  error_json?: any
}
type RunnerWorkerState = {
  id: string
  lease_holder: string | null
  last_heartbeat_at: string | null
  last_run_summary?: Record<string, unknown> | null
}
type ProductionQueueBannerMeta = {
  lastScriptedTitle: string | null
  lastScriptedCreatedAt: string | null
  lastCompletedJobTitle: string | null
  nextUpTitle: string | null
}
type EpisodeRepairMark = {
  needed: boolean
  checklist: RepairChecklistValue
  notes: string
  categoryComments: Record<string, string>
  activeCategoryId: string | null
  coverNote: string
  coverOpen: boolean
  candidateCoverUrl: string
  coverGenerating: boolean
  lastCoverInstruction: string
  coverAttempt: number
  listenState: 'unplayed' | 'in_progress' | 'listened'
  reviewState: 'unreviewed' | 'no_repair' | 'needs_repair' | 'finished'
}
type StoryGroup =
  | { type: 'standalone'; key: string; story: Story }
  | { type: 'series'; key: string; title: string; stories: Story[]; expectedEpisodeCount?: number; presentEpisodeCount?: number; missingEpisodes?: number[]; approvalReady?: boolean; approvalBlockingReasons?: string[]; sourceJobId?: string | null; completionSortDate?: string | null; completionSortSource?: string | null }

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
  source_job?: Story['source_job']
  completionSortDate?: string | null
  completionSortSource?: string | null
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
      completionSortDate?: string | null
      completionSortSource?: string | null
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
      completionSortDate?: string | null
      completionSortSource?: string | null
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
const HAL_RECENT_SCRIPT_WINDOW_HOURS = 4
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
  { id: 'approved_ready', label: 'Ready to Publish', description: 'Cleared by Marc.', color: '#22c55e', softColor: '#dcfce7', glowColor: 'rgba(34,197,94,0.28)' },
  { id: 'published', label: 'Published', description: 'Live in app.', color: '#2563eb', softColor: '#dbeafe', glowColor: 'rgba(37,99,235,0.34)' },
]

const WORKFLOW_LABELS: Record<WorkflowTab, string> = {
  ready_for_review: 'Ready for Review',
  approved_ready: 'Ready to Publish',
  published: 'Published',
  repair_queue: 'Repair Queue',
  being_repaired: 'Repair Queue',
  failed: 'Repair Queue',
  stories_in_queue: 'Production Queue',
  scripts_ready: 'Production Queue',
  cold_storage: 'Cold Storage / Training Archive',
  unpublished_library: 'Cold Storage / Training Archive',
}

const WORKFLOW_VISUALS: Record<InternalWorkflowLane, { id: InternalWorkflowLane; label: string; description: string; color: string; softColor: string; glowColor: string }> = {
  ready_for_review: { id: 'ready_for_review', label: 'Ready for Review', description: 'Ready for review.', color: '#f59e0b', softColor: '#fef3c7', glowColor: 'rgba(245,158,11,0.30)' },
  repair_shop: { id: 'repair_shop', label: 'Repair Queue', description: 'Pipeline failures and active repair work.', color: '#f97316', softColor: '#ffedd5', glowColor: 'rgba(249,115,22,0.30)' },
  production_queue: { id: 'production_queue', label: 'Production Queue', description: 'Scripts ready for audio production.', color: '#0ea5e9', softColor: '#e0f2fe', glowColor: 'rgba(14,165,233,0.28)' },
  approved_ready: { id: 'approved_ready', label: 'Ready to Publish', description: 'Cleared by Marc.', color: '#22c55e', softColor: '#dcfce7', glowColor: 'rgba(34,197,94,0.28)' },
  cold_storage: { id: 'cold_storage', label: 'Cold Storage / Training Archive', description: 'Preserved artifacts.', color: '#8b5cf6', softColor: '#ede9fe', glowColor: 'rgba(139,92,246,0.28)' },
  published: { id: 'published', label: 'Published', description: 'Live in app.', color: '#2563eb', softColor: '#dbeafe', glowColor: 'rgba(37,99,235,0.34)' },
}

const WORKFLOW_COLORS: Record<string, { bg: string; text: string; badge: string; dot: string }> = {
  ready_for_review: { bg: '#FEF3C7', text: '#92400E', badge: '#F59E0B', dot: '#F59E0B' },
  approved_ready: { bg: '#D1FAE5', text: '#065F46', badge: '#10B981', dot: '#10B981' },
  repair_shop: { bg: '#FEE2E2', text: '#991B1B', badge: '#EF4444', dot: '#EF4444' },
  repair_queue: { bg: '#FEE2E2', text: '#991B1B', badge: '#EF4444', dot: '#EF4444' },
  being_repaired: { bg: '#DBEAFE', text: '#1E40AF', badge: '#3B82F6', dot: '#3B82F6' },
  production_queue: { bg: '#E0F2FE', text: '#075985', badge: '#0EA5E9', dot: '#0EA5E9' },
  stories_in_queue: { bg: '#E0F2FE', text: '#075985', badge: '#0EA5E9', dot: '#0EA5E9' },
  scripts_ready: { bg: '#E0F2FE', text: '#075985', badge: '#0EA5E9', dot: '#0EA5E9' },
  failed: { bg: '#FEE2E2', text: '#991B1B', badge: '#EF4444', dot: '#EF4444' },
  cold_storage: { bg: '#EDE9FE', text: '#5B21B6', badge: '#8B5CF6', dot: '#8B5CF6' },
  published: { bg: '#D1FAE5', text: '#065F46', badge: '#059669', dot: '#059669' },
  unpublished_library: { bg: '#FEF9C3', text: '#713F12', badge: '#EAB308', dot: '#EAB308' },
}

const ACTIVE_PRODUCTION_JOB_STATUSES = ['queued', 'running', 'waiting_for_external', 'processing']

const STREAMING_PIPELINE: Array<{ id: WorkflowLane; label: string; sub: string; color: string }> = [
  { id: 'ready_for_review', label: 'Ready for Review', sub: 'Ready for review', color: '#F59E0B' },
  { id: 'repair_shop', label: 'Repair Queue', sub: 'Failures and active repairs', color: '#F97316' },
  { id: 'production_queue', label: 'Production Queue', sub: 'Scripts ready for audio', color: '#0EA5E9' },
  { id: 'approved_ready', label: 'Ready to Publish', sub: 'Cleared by Marc', color: '#10B981' },
  { id: 'published', label: 'Published', sub: 'Live in app', color: '#059669' },
  { id: 'cold_storage', label: 'Cold Storage', sub: 'Archived and recoverable', color: '#8B5CF6' },
]

function effectiveWorkflowState(story: Story): WorkflowTab {
  if (story.workflow_state === 'live') return 'published'
  if (story.workflow_state === 'cold_storage' || story.workflow_state === 'unpublished_library') return story.workflow_state
  if (story.workflow_state === 'stories_in_queue' || story.workflow_state === 'scripts_ready' || story.workflow_state === 'failed') return story.workflow_state
  if (!story.is_hidden && story.status === 'published') return 'published'
  if (story.is_hidden && story.status === 'published') return 'unpublished_library'
  if (story.workflow_state === 'repair_queue' || story.workflow_state === 'being_repaired') return story.workflow_state
  if (story.workflow_state && ['ready_for_review', 'approved_ready', 'repair_queue', 'being_repaired', 'unpublished_library', 'cold_storage', 'published', 'stories_in_queue', 'scripts_ready', 'failed'].includes(story.workflow_state)) return story.workflow_state as WorkflowTab
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
  return story.status === 'published' && story.is_hidden === false
}

function visualWorkflowLane(story: Story): InternalWorkflowLane {
  const state = effectiveWorkflowState(story)
  if (state === 'cold_storage' || state === 'unpublished_library') return 'cold_storage'
  if (isPublishedToApp(story)) return 'published'
  if (state === 'repair_queue' || state === 'being_repaired' || state === 'failed') return 'repair_shop'
  if (state === 'stories_in_queue' || state === 'scripts_ready') return 'production_queue'
  if (state === 'approved_ready') return 'approved_ready'
  return 'ready_for_review'
}

function storyMatchesWorkflowLane(story: Story, lane: InternalWorkflowLane) {
  return visualWorkflowLane(story) === lane
}

function storiesForWorkflowLane(stories: Story[], lane: InternalWorkflowLane) {
  return stories.filter((story) => storyMatchesWorkflowLane(story, lane))
}

function isApprovalWorkflowLane(lane: InternalWorkflowLane): lane is WorkflowLane {
  return lane === 'ready_for_review' || lane === 'repair_shop' || lane === 'production_queue' || lane === 'approved_ready' || lane === 'published' || lane === 'cold_storage'
}

function groupPrimaryWorkflowLane(group: StoryGroup, readyReviewKeys: Record<string, boolean>): InternalWorkflowLane | null {
  const groupStories = group.type === 'series' ? group.stories : [group.story]
  if (groupStories.some((story) => visualWorkflowLane(story) === 'cold_storage')) return 'cold_storage'
  if (groupStories.some((story) => visualWorkflowLane(story) === 'published')) return 'published'
  if (groupStories.some((story) => visualWorkflowLane(story) === 'repair_shop')) return 'repair_shop'
  if (groupStories.some((story) => visualWorkflowLane(story) === 'production_queue')) return 'production_queue'
  if (groupStories.some((story) => visualWorkflowLane(story) === 'approved_ready')) return 'approved_ready'
  if (groupStories.some((story) => visualWorkflowLane(story) === 'ready_for_review') && readyReviewKeys[groupApprovalKey(group)] === true) return 'ready_for_review'
  return null
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
  if (effectiveWorkflowState(story) === 'failed') return 'Failed'
  return 'Needs Repair Intake'
}

function productionQueueStates(story: Story) {
  return ['stories_in_queue', 'scripts_ready'].includes(effectiveWorkflowState(story))
}

function storyProductionPriority(story: Story) {
  const priority = Number(story.production_priority || 0)
  return Number.isFinite(priority) && priority > 0 ? priority : 0
}

function isActiveProductionJob(job?: Pick<ProductionJobSummary, 'status'> | Story['source_job'] | null) {
  return ACTIVE_PRODUCTION_JOB_STATUSES.includes(String(job?.status || '').trim())
}

function showsInProductionBadge(job?: Pick<ProductionJobSummary, 'status'> | Story['source_job'] | null) {
  return ['running', 'processing', 'waiting_for_external'].includes(String(job?.status || '').trim())
}

function readablePipelineValue(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return 'Unknown'
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function workflowStateLabel(story: Story) {
  const state = effectiveWorkflowState(story)
  if (state === 'scripts_ready') return 'Scripts Ready'
  if (state === 'stories_in_queue') return 'In Queue'
  return WORKFLOW_LABELS[state] || readablePipelineValue(state)
}

function submittedDateLabel(story: Story) {
  if (!story.created_at) return 'Submitted date unknown'
  return `Submitted ${new Date(story.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function shortStoryId(story?: Pick<Story, 'id'> | null) {
  return String(story?.id || '').slice(-8)
}

function normalizedDuplicateTitle(title?: string | null) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function queuePositionLabel(position: number) {
  if (position <= 2) return 'Next in production queue'
  return `Queue position #${position} — est. ${position - 1} stories ahead`
}

function repairQueueStates(story: Story) {
  return ['repair_queue', 'being_repaired', 'failed'].includes(effectiveWorkflowState(story))
}

function recommendedByLabel(story: Story) {
  return String(story.recommended_by || story.source || '').trim() || '—'
}

function storyDurationLabel(story: Story) {
  if (story.duration_mins) return `${story.duration_mins} min`
  const words = String(story.script || story.prose_text || '').split(/\s+/).filter(Boolean).length
  return words > 0 ? `~${Math.max(1, Math.round(words / 160))} min` : '—'
}

function productionQueuePosition(stories: Story[], story: Story) {
  const sorted = stories
    .filter(productionQueueStates)
    .sort((a, b) => {
      const aPriority = storyProductionPriority(a)
      const bPriority = storyProductionPriority(b)
      if (aPriority > 0 || bPriority > 0) {
        if (aPriority === 0) return 1
        if (bPriority === 0) return -1
        if (aPriority !== bPriority) return aPriority - bPriority
      }
      if ((a.duration_mins || 0) !== (b.duration_mins || 0)) return (a.duration_mins || 0) - (b.duration_mins || 0)
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    })
  const index = sorted.findIndex((item) => item.id === story.id)
  return index >= 0 ? index + 1 : null
}

function productionJobErrorLabel(story: Story) {
  const error = story.source_job?.error_json
  const candidates = [
    error?.message,
    error?.error,
    error?.kind,
    error?.detail?.message,
    error?.detail?.error,
    error?.recommendedAction,
    story.repair_notes,
    story.review_notes,
    story.source_job?.current_step,
  ]
  return candidates.map((value) => String(value || '').trim()).find(Boolean) || 'Repair reason not recorded'
}

function repairEnteredDate(story: Story) {
  return story.source_job?.updated_at || story.updated_at || story.reviewed_at || story.created_at || null
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
    source_job: story.source_job || episode.source_job || (episode as any).sourceJob || null,
    completion_sort_date: episode.completionSortDate || series?.completionSortDate || null,
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
    production_priority: story.production_priority || 0,
    script_version: story.script_version || null,
    is_v2: story.is_v2 ?? null,
    script_json: story.script_json || null,
    brief_json: story.brief_json || null,
    script: story.script || null,
    story_type: story.story_type || null,
    recommended_by: story.recommended_by || null,
    source: story.source || null,
  } as Story
}

function displaySeriesTitle(stories: Story[]) {
  const story = stories[0]
  const name = String(story?.series_name || '').trim()
  if (name && name.toLowerCase() !== 'none') return name
  return story?.title || 'Untitled Series'
}

function narratorLabel(story: Story) {
  const narrator = String(story.narrator_voice_name || story.narratorVoiceName || '').trim()
  return narrator || 'Narrator pending'
}

function firstNarratorLabel(stories: Story[]) {
  const narrator = stories.map((story) => String(story.narrator_voice_name || story.narratorVoiceName || '').trim()).find(Boolean)
  return narrator || 'Narrator pending'
}

function truncateWords(text: string, maxWords = 40) {
  const words = text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}...`
}

function seriesDescriptionForReview(group: StoryGroup | null, stories: Story[]) {
  const groupDescription = String((group as any)?.description || '').trim()
  if (groupDescription) return { text: truncateWords(groupDescription), source: 'selectedItem.description' }

  const firstEpisode = stories[0]
  const episodeDescription = String(firstEpisode?.description || '').trim()
  if (episodeDescription) return { text: truncateWords(episodeDescription), source: 'selectedItem.episodes[0].description' }

  const proseText = String(firstEpisode?.prose_text || '').trim()
  if (proseText) return { text: truncateWords(proseText), source: 'selectedItem.episodes[0].prose_text' }

  return { text: 'No series description available.', source: 'fallback text' }
}

function episodeCoverUrl(story: Story) {
  return story.cover_url || ''
}

function approvalBlockingSummary(reasons?: string[]) {
  if (!reasons?.length) return ''
  const text = reasons.join(' ').toLowerCase()
  if (text.includes('audio')) return 'Missing Audio'
  if (text.includes('cover') || text.includes('prose') || text.includes('author') || text.includes('narrator') || text.includes('packaging')) return 'Missing Packaging'
  if (text.includes('review_status') || text.includes('status')) return 'Needs Review'
  return 'Needs Review'
}

function approvalItemKey(item: ApprovalItem) {
  return item.type === 'series' ? `series:${item.seriesId}` : `story:${item.storyId}`
}

function groupApprovalKey(group: StoryGroup) {
  return group.type === 'series' ? group.key : `story:${group.story.id}`
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

function approvalReturnUrl(story: Pick<Story, 'id' | 'series_id'>) {
  const params = new URLSearchParams({ storyId: story.id })
  if (story.series_id) params.set('seriesId', story.series_id)
  return `/admin/production/approval?${params.toString()}`
}

// ATL-CONS-001 Phase C: Orion QC Panel component (hooks-safe)
function OrionQCPanel({ story }: { story: Story }) {
  const [qcOpen, setQcOpen] = useState(false)
  const gate = evaluateStoryGate(story as unknown as Record<string, unknown>)
  const { recommendation, reason } = deriveOrionRecommendation(gate)
  const recColor = recommendation === 'APPROVE' ? '#86efac' : recommendation === 'REVIEW REQUIRED' ? '#fcd34d' : '#fca5a5'
  const recBg = recommendation === 'APPROVE' ? 'rgba(16,185,129,0.12)' : recommendation === 'REVIEW REQUIRED' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  const totalEps = story.series_total ?? null
  const isStandalone = !story.series_id
  const qcItems = evaluateQCChecklist(story.grading_result ?? null, story.episode_number, totalEps, isStandalone)
  const qcIcon = (s: string) => s === 'pass' ? '✅' : s === 'fail' ? '❌' : '❓'
  const unverifiedCount = qcItems.filter(i => i.status === 'unverified').length

  return (
    <div style={{ marginTop: '10px' } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', backgroundColor: recBg, border: `1px solid ${recColor}40` } as React.CSSProperties}>
        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' } as React.CSSProperties}>🧭 Orion</div>
        <div style={{ color: recColor, fontSize: '12px', fontWeight: 900 } as React.CSSProperties}>{recommendation}</div>
        <div style={{ color: '#94a3b8', fontSize: '11px', flex: 1 } as React.CSSProperties}>{reason}</div>
        <button type="button" onClick={() => setQcOpen(o => !o)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' } as React.CSSProperties}>
          {qcOpen ? '▲ QC' : '▼ QC'} ({unverifiedCount}❓)
        </button>
      </div>
      {qcOpen && (
        <div style={{ marginTop: '6px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(148,163,184,0.15)' } as React.CSSProperties}>
          <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' } as React.CSSProperties}>12-Point QC Checklist</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' } as React.CSSProperties}>
            {qcItems.map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: item.status === 'pass' ? '#86efac' : item.status === 'fail' ? '#fca5a5' : '#94a3b8' } as React.CSSProperties}>
                <span>{qcIcon(item.status)}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          {unverifiedCount === qcItems.length && (
            <div style={{ marginTop: '8px', color: '#64748b', fontSize: '10px' } as React.CSSProperties}>❓ UNVERIFIED — no automated QC data for this story</div>
          )}
        </div>
      )}
    </div>
  )
}

function PlayStoryButton({ story, played = false, label, onPlayed }: { story: Story; played?: boolean; label?: string; onPlayed?: () => void }) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    onPlayed?.()
    const params = new URLSearchParams({
      approvalReview: '1',
      returnUrl: approvalReturnUrl(story),
    })
    window.open(`/player/${story.id}?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const buttonLabel = label || (played ? 'Continue' : 'Play')
  const started = buttonLabel === 'Continue'
  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Play ${story.title}`}
      style={{ padding: '4px 8px', borderRadius: '999px', border: 'none', backgroundColor: started ? '#FED7AA' : played ? '#FDBA74' : '#f97316', color: started ? '#9A3412' : '#ffffff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      ▶ {buttonLabel}
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
  const rawEpisodeTitle = String(story.episode_title || '').trim()
  const [episodeTitle, setEpisodeTitle] = useState(rawEpisodeTitle.toLowerCase() === 'none' ? '' : rawEpisodeTitle)
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
      <div className="approval-editor-panel" style={{
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
type ProductionStandardValue = 'current_standard' | 'remaster_candidate' | 'unknown'
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
  if (story.production_standard === 'current_standard') {
    return {
      standard: 'current',
      label: 'Current Standard',
      note: story.production_standard_updated_at ? 'Manually classified as current standard.' : 'Stored as current standard.',
    }
  }

  if (story.production_standard === 'remaster_candidate') {
    return {
      standard: 'remaster_candidate',
      label: 'Remaster Candidate',
      note: story.production_standard_updated_at ? 'Manually classified as legacy/remaster candidate.' : 'Stored as remaster candidate.',
    }
  }

  if (story.production_standard === 'unknown' && story.production_standard_updated_at) {
    return {
      standard: 'unknown',
      label: 'Unknown Standard',
      note: 'Manually kept as unknown standard.',
    }
  }

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
  const recommendationOrder: AIRecommendation[] = ['preserve', 'remaster_candidate', 'repair_candidate', 'needs_review', 'delete_candidate']
  const trainingOrder: TrainingValue[] = ['none', 'low', 'medium', 'high']
  const standardOrder: ProductionStandard[] = ['current', 'remaster_candidate', 'unknown']
  const selected = [...classifications].sort((a, b) =>
    recommendationOrder.indexOf(a.recommendation) - recommendationOrder.indexOf(b.recommendation)
  )[0] || preservationClassificationForStory(stories[0])
  const weakestTraining = classifications.map((item) => item.trainingValue).sort((a, b) =>
    trainingOrder.indexOf(a) - trainingOrder.indexOf(b)
  )[0] || 'none'
  const weakestStandard = classifications.map((item) => item.productionStandard.standard).sort((a, b) =>
    standardOrder.indexOf(a) - standardOrder.indexOf(b)
  )[0] || 'unknown'
  const representativeStandard =
    classifications.find((item) => item.productionStandard.standard === selected.productionStandard.standard)?.productionStandard ||
    classifications.find((item) => item.productionStandard.standard === weakestStandard)?.productionStandard ||
    selected.productionStandard

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
  onSetProductionStandard,
  onMoveToColdStorage,
  onMoveToRepairShop,
  onMarkForDeletion,
}: {
  stories: Story[]
  deletionMarked: boolean
  onSetProductionStandard: (standard: ProductionStandardValue) => Promise<void>
  onMoveToColdStorage: () => void
  onMoveToRepairShop: () => void
  onMarkForDeletion: () => void
}) {
  const [standardMenuOpen, setStandardMenuOpen] = useState(false)
  const [standardSaving, setStandardSaving] = useState(false)
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
  const standardOptions: Array<{ label: string; value: ProductionStandardValue }> = [
    { label: 'Mark Current Standard', value: 'current_standard' },
    { label: 'Mark Legacy / Remaster Candidate', value: 'remaster_candidate' },
    { label: 'Keep Unknown', value: 'unknown' },
  ]

  async function saveProductionStandard(value: ProductionStandardValue) {
    setStandardSaving(true)
    try {
      await onSetProductionStandard(value)
      setStandardMenuOpen(false)
    } finally {
      setStandardSaving(false)
    }
  }

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
        {production.standard === 'unknown' && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setStandardMenuOpen((open) => !open)}
              disabled={standardSaving}
              style={{ ...compactActionStyle, opacity: standardSaving ? 0.65 : 1, cursor: standardSaving ? 'default' : 'pointer' }}
              title="Set stored production standard."
            >
              {standardSaving ? 'Saving...' : 'Classify Standard'}
            </button>
            {standardMenuOpen && (
              <div style={{ position: 'absolute', right: 0, top: '28px', zIndex: 25, width: '210px', padding: '6px', borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', boxShadow: '0 10px 24px rgba(15,23,42,0.14)' }}>
                {standardOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => saveProductionStandard(option.value)}
                    disabled={standardSaving}
                    style={{ width: '100%', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#374151', cursor: standardSaving ? 'default' : 'pointer', padding: '7px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 800 }}
                  >
                    {option.label}
                  </button>
                ))}
                <div style={{ padding: '5px 8px 3px', color: '#9CA3AF', fontSize: '10px', lineHeight: 1.3 }}>
                  Saves production_standard only.
                </div>
              </div>
            )}
          </div>
        )}
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
  { id: 'intro_not_personalized_properly', label: 'Intro not personalized properly', group: 'story_script' },
  { id: 'weak_hook', label: 'Weak hook', group: 'story_script' },
  { id: 'weak_cliffhanger', label: 'Weak cliffhanger', group: 'story_script' },
  { id: 'intro_timing_problem', label: 'Intro timing problem', group: 'audio_asc' },
  { id: 'outro_timing_problem', label: 'Outro timing problem', group: 'audio_asc' },
  { id: 'outro_missing_title_original', label: 'Outro missing title / Endless Tales Original', group: 'audio_asc' },
  { id: 'outro_weak_cliffhanger', label: 'Outro weak cliffhanger', group: 'story_script' },
  { id: 'audio_cuts_off_fade_buries_voice', label: 'Audio cuts off / fade buries voice', group: 'audio_asc' },
  { id: 'abrupt_music_ending_fade_problem', label: 'Abrupt music ending / fade problem', group: 'audio_asc' },
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

const AUDIO_REPAIR_OPTIONS: Array<{ id: string; group: 'story_script' | 'audio_asc'; label: string }> = [
  { id: 'fix_intro', group: 'audio_asc', label: 'Fix Intro' },
  { id: 'fix_music', group: 'audio_asc', label: 'Fix Background Music' },
  { id: 'fix_hook', group: 'story_script', label: 'Fix Hook' },
  { id: 'fix_story', group: 'story_script', label: 'Fix Story' },
  { id: 'fix_cliffhanger', group: 'story_script', label: 'Fix Cliffhanger / Ending' },
  { id: 'fix_outro', group: 'audio_asc', label: 'Fix Outro' },
]

const EPISODE_REPAIR_OPTIONS = AUDIO_REPAIR_OPTIONS

function emptyRepairChecklist(): RepairChecklistValue {
  return { story_script: [], audio_asc: [], packaging: [] }
}

function episodeRepairMarkDefault(): EpisodeRepairMark {
  return {
    needed: false,
    checklist: emptyRepairChecklist(),
    notes: '',
    categoryComments: {},
    activeCategoryId: null,
    coverNote: '',
    coverOpen: false,
    candidateCoverUrl: '',
    coverGenerating: false,
    lastCoverInstruction: '',
    coverAttempt: 0,
    listenState: 'unplayed',
    reviewState: 'unreviewed',
  }
}

function normalizeRepairChecklist(value: unknown): RepairChecklistValue {
  const input = (value || {}) as Partial<RepairChecklistValue>
  return {
    story_script: Array.isArray(input.story_script) ? input.story_script : [],
    audio_asc: Array.isArray(input.audio_asc) ? input.audio_asc : [],
    packaging: Array.isArray(input.packaging) ? input.packaging : [],
  }
}

function hasRepairFlag(story: Story): boolean {
  const checklist = normalizeRepairChecklist(story.repair_checklist)
  return Object.values(checklist).some((items) => items.length > 0)
}

function repairChecklistCount(checklist: RepairChecklistValue) {
  return checklist.story_script.length + checklist.audio_asc.length + checklist.packaging.length
}

function persistedReviewComplete(story: Story) {
  return Boolean(story.reviewed_at) && (story.review_status === 'approved' || story.review_status === 'not_approved')
}

function persistedReviewNeedsRepair(story: Story) {
  return story.review_status === 'not_approved' && repairChecklistCount(normalizeRepairChecklist(story.repair_checklist)) > 0
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

function repairIssueLabel(id: string) {
  return REPAIR_ISSUE_OPTIONS.find((item) => item.id === id)?.label || id
}

function cleanRepairText(value: unknown) {
  return String(value ?? '').trim()
}

function hasRepairText(value: unknown) {
  return cleanRepairText(value).length > 0
}

function emptyRepairCommentRows(initialNotes = ''): RepairCommentRow[] {
  return [
    { comment: initialNotes, remainingTime: '' },
    { comment: '', remainingTime: '' },
    { comment: '', remainingTime: '' },
  ]
}

function buildRepairNotes(details: RepairIssueDetails, comments: RepairCommentRow[]) {
  const detailLines = Object.entries(details)
    .filter(([, value]) => hasRepairText(value.comment))
    .map(([id, value]) => {
      const parts = [repairIssueLabel(id)]
      if (hasRepairText(value.comment)) parts.push(`comment: ${cleanRepairText(value.comment)}`)
      return `- ${parts.join(' | ')}`
    })
  const commentLines = comments
    .map((row, index) => ({ ...row, index: index + 1 }))
    .filter((row) => hasRepairText(row.comment) || hasRepairText(row.remainingTime))
    .map((row) => {
      const parts = [`Comment ${row.index}`]
      if (hasRepairText(row.comment)) parts.push(`comment: ${cleanRepairText(row.comment)}`)
      if (hasRepairText(row.remainingTime)) parts.push(`remaining time: ${cleanRepairText(row.remainingTime)}`)
      return `- ${parts.join(' | ')}`
    })
  return [
    detailLines.length ? `Issue line notes:\n${detailLines.join('\n')}` : '',
    commentLines.length ? `Repair comments:\n${commentLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function RepairChecklistPanel({
  title,
  episodeNumber,
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
  episodeNumber?: number | null
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
  const [repairComments, setRepairComments] = useState<RepairCommentRow[]>(() => emptyRepairCommentRows(initialNotes || ''))
  const [tester, setTester] = useState('Marc')
  const [reviewedAt, setReviewedAt] = useState(() => new Date().toLocaleString())
  const [details, setDetails] = useState<RepairIssueDetails>({})
  const count = repairChecklistCount(checklist)
  const routeNote = repairRoutingNote(checklist)
  const preparedNotes = () => [
    `Repair intake metadata: tester=${cleanRepairText(tester) || 'unknown'}; time_date=${cleanRepairText(reviewedAt) || 'unknown'}; episode_number=${episodeNumber || 'n/a'}`,
    buildRepairNotes(details, repairComments),
  ].filter(Boolean).join('\n\n')

  function toggle(group: RepairGroup, id: string) {
    setChecklist((prev) => {
      const exists = prev[group].includes(id)
      return {
        ...prev,
        [group]: exists ? prev[group].filter((item) => item !== id) : [...prev[group], id],
      }
    })
  }

  function updateDetail(id: string, value: string) {
    setDetails((prev) => ({
      ...prev,
      [id]: { comment: value },
    }))
  }

  function updateRepairComment(index: number, key: keyof RepairCommentRow, value: string) {
    setRepairComments((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row))
  }

  return (
    <div className="approval-repair-panel" style={{ marginTop: '16px', padding: '26px 28px', borderRadius: '4px', border: '1px solid #c9c2b8', backgroundColor: '#fffdfa', color: '#111827', boxShadow: '0 8px 22px rgba(15,23,42,0.08)' }}>
      <div className="approval-repair-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start', marginBottom: '22px', borderBottom: '2px solid #111827', paddingBottom: '12px' }}>
        <div>
          <div style={{ color: textPrimary, fontSize: '21px', fontWeight: 900, letterSpacing: 0 }}>Endless Tales Repair Intake</div>
          <div style={{ color: '#4b5563', fontSize: '13px', marginTop: '5px', fontWeight: 700 }}>Professional QA review sheet</div>
        </div>
        {showSeriesScope && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#7c2d12', fontSize: '12px', fontWeight: 800 }}>
            <input type="checkbox" checked={repairEntireSeries} onChange={(event) => onRepairEntireSeriesChange?.(event.target.checked)} />
            Repair entire series
          </label>
        )}
      </div>
      <div className="approval-repair-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 2fr) minmax(120px, 0.7fr) minmax(160px, 1fr) minmax(190px, 1fr)', gap: '18px', marginBottom: '26px' }}>
        <label style={{ color: '#374151', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
          Story Name
          <input value={title} readOnly style={{ marginTop: '7px', width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '7px 2px 5px', fontSize: '15px' }} />
        </label>
        <label style={{ color: '#374151', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
          Episode Number
          <input value={episodeNumber || ''} readOnly style={{ marginTop: '7px', width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '7px 2px 5px', fontSize: '15px' }} />
        </label>
        <label style={{ color: '#374151', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
          Tester
          <input value={tester} onChange={(event) => setTester(event.target.value)} style={{ marginTop: '7px', width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '7px 2px 5px', fontSize: '15px' }} />
        </label>
        <label style={{ color: '#374151', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
          Time & Date
          <input value={reviewedAt} onChange={(event) => setReviewedAt(event.target.value)} style={{ marginTop: '7px', width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '7px 2px 5px', fontSize: '15px' }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        {REPAIR_OPTIONS.map((section) => (
          <div key={section.group} style={{ backgroundColor: 'transparent' }}>
            <div style={{ color: '#111827', fontSize: '16px', fontWeight: 950, letterSpacing: '0.02em', paddingBottom: '8px', borderBottom: '1.5px solid #111827' }}>{section.title}</div>
            <div className="approval-repair-issue-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.75fr) minmax(340px, 1fr)', columnGap: '18px', alignItems: 'center' }}>
              <div style={{ padding: '10px 0 6px', color: '#6b7280', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Issue</div>
              <div style={{ padding: '10px 0 6px', color: '#6b7280', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Comment</div>
              {section.items.map((item) => (
                <Fragment key={item.id}>
                  <label style={{ minHeight: '42px', display: 'flex', alignItems: 'center', gap: '11px', color: textPrimary, fontSize: '14px', fontWeight: 800, padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                    <input type="checkbox" checked={checklist[section.group].includes(item.id)} onChange={() => toggle(section.group, item.id)} style={{ width: '17px', height: '17px', flex: '0 0 auto' }} />
                    <span>{item.label}</span>
                  </label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                    <input value={details[item.id]?.comment || ''} onChange={(event) => updateDetail(item.id, event.target.value)} aria-label={`${item.label} comment`} style={{ width: '100%', minWidth: 0, border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '5px 2px 4px', fontSize: '14px', outline: 'none' }} />
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
      {routeNote && (
        <div style={{ display: 'inline-flex', marginTop: '18px', padding: '6px 10px', borderRadius: '999px', backgroundColor: '#ffedd5', color: '#9a3412', fontSize: '12px', fontWeight: 900 }}>
          {routeNote}
        </div>
      )}
      <div style={{ marginTop: '24px', color: '#111827', fontSize: '16px', fontWeight: 950, letterSpacing: '0.02em', paddingBottom: '8px', borderBottom: '1.5px solid #111827' }}>Repair Comments</div>
      <div className="approval-repair-comments-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 150px', columnGap: '18px', rowGap: '10px', marginTop: '12px', alignItems: 'center' }}>
        <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Comment</div>
        <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', textAlign: 'right' }}>Remaining Time</div>
        {repairComments.map((row, index) => (
          <Fragment key={`repair-comment-${index}`}>
            <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center' }}>
              <input value={row.comment} onChange={(event) => updateRepairComment(index, 'comment', event.target.value)} aria-label={`Repair comment ${index + 1}`} style={{ width: '100%', minWidth: 0, border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '5px 2px 4px', fontSize: '14px', outline: 'none' }} />
            </div>
            <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <input value={row.remainingTime} onChange={(event) => updateRepairComment(index, 'remainingTime', event.target.value)} aria-label={`Repair comment ${index + 1} remaining time`} style={{ width: '112px', minWidth: 0, border: 'none', borderBottom: '1.5px solid #111827', backgroundColor: 'transparent', color: '#111827', padding: '5px 2px 4px', fontSize: '14px', textAlign: 'center', outline: 'none' }} />
            </div>
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} style={actionButtonStyle('muted')}>Cancel</button>
        <button type="button" onClick={() => onSendToRepair(checklist, preparedNotes())} disabled={count === 0} style={{ ...actionButtonStyle('primary'), opacity: count === 0 ? 0.45 : 1, cursor: count === 0 ? 'default' : 'pointer' }}>Send to Being Repaired</button>
        <button type="button" onClick={() => onMarkComplete(checklist, preparedNotes())} style={actionButtonStyle('success')}>Mark Repair Complete</button>
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
          {/* ATL-CONS-001 Phase C: Orion Recommendation + QC Checklist */}
          {workflowState === 'ready_for_review' && (
            <OrionQCPanel story={story} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', minWidth: '170px', justifyContent: 'center' }}>
          {workflowState !== 'cold_storage' && story.audio_url && <PlayStoryButton story={story} />}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit Cover</button>}
          {workflowState === 'ready_for_review' && <button onClick={() => onSetWorkflowState(story, 'approved_ready')} style={actionButtonStyle('success')}>Approve for Publishing</button>}
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
          episodeNumber={story.episode_number || story.series_number}
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
}: {
  story: Story
  onEditClick: (s: Story) => void
  onSetWorkflowState: (story: Story, state: WorkflowTab, options?: { repairChecklist?: RepairChecklistValue; repairNotes?: string; retire?: boolean }) => void
  onPublish: (story: Story) => void
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
          {workflowState !== 'cold_storage' && story.audio_url && <PlayStoryButton story={story} />}
          {['ready_for_review', 'approved_ready', 'unpublished_library', 'published'].includes(workflowState) && <button onClick={() => onEditClick(story)} style={actionButtonStyle('muted')}>Edit Cover</button>}
          {workflowState === 'ready_for_review' && <button onClick={() => onSetWorkflowState(story, 'approved_ready')} style={actionButtonStyle('success')}>Approve for Publishing</button>}
          {workflowState === 'approved_ready' && <button onClick={() => onPublish(story)} style={actionButtonStyle('primary')}>Publish Now</button>}
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
  const dominantLane = (['repair_shop', 'ready_for_review', 'approved_ready', 'published', 'cold_storage'] as InternalWorkflowLane[])
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
            episodeNumber={null}
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
  const [returnTarget, setReturnTarget] = useState({ storyId: '', seriesId: '' })
  const [stories, setStories] = useState<Story[]>([])
  const [approvalItems, setApprovalItems] = useState<ApprovalItem[]>([])
  const [readyReviewKeys, setReadyReviewKeys] = useState<Record<string, boolean>>({})
  // ATL-CONS-001 Phase C: blocked series (hard-blocked from review — series incomplete)
  const [blockedSeriesItems, setBlockedSeriesItems] = useState<any[]>([])
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
  const [productionQueueView, setProductionQueueView] = useState<ProductionQueueView>('production_order')
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null)
  const [seriesSearch, setSeriesSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState<WorkflowFilter>('all')
  const [, setSeriesActionsOpen] = useState(false)
  const [repairEntireSeries, setRepairEntireSeries] = useState(false)
  const [seriesReadyConfirm, setSeriesReadyConfirm] = useState<{ seriesId: string; seriesName: string } | null>(null)
  const [repairQueueBannerDismissed, setRepairQueueBannerDismissed] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [productionQueueBannerMeta, setProductionQueueBannerMeta] = useState<ProductionQueueBannerMeta>({
    lastScriptedTitle: null,
    lastScriptedCreatedAt: null,
    lastCompletedJobTitle: null,
    nextUpTitle: null,
  })
  const [runnerWorkers, setRunnerWorkers] = useState<RunnerWorkerState[]>([])
  const [markedForDeletionIds, setMarkedForDeletionIds] = useState<Record<string, boolean>>({})
  const [playedStoryIds, setPlayedStoryIds] = useState<Record<string, boolean>>({})
  const [episodeRepairMarks, setEpisodeRepairMarks] = useState<Record<string, EpisodeRepairMark>>({})
  const [coverUrlOverrides, setCoverUrlOverrides] = useState<Record<string, string>>({})
  const [focusedReviewStoryId, setFocusedReviewStoryId] = useState<string | null>(null)
  const inlineAudioRef = useRef<HTMLAudioElement | null>(null)
  const [inlineAudioPaused, setInlineAudioPaused] = useState(false)
  const editingStoryRef = useRef<Story | null>(null)
  const reviewAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const pipelineRef = useRef<HTMLDivElement>(null)
  const seriesActionsRef = useRef<HTMLDivElement>(null)
  const returnSelectionAppliedRef = useRef(false)

  function episodeCoverUrl(story: Story): string {
    return coverUrlOverrides[story.id] || story.cover_url || ''
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setReturnTarget({
      storyId: params.get('storyId') || '',
      seriesId: params.get('seriesId') || '',
    })
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
    const bannerMetaPromise = fetchProductionQueueBannerMeta()
    const [readyRes, allRes] = await Promise.all([
      fetch('/api/admin/content-approval?tab=ready_for_review&includeBlocked=false', { cache: 'no-store' }),
      fetch('/api/admin/content-approval?tab=all&includeBlocked=true', { cache: 'no-store' }),
    ])
    const readyPayload = await readyRes.json()
    const allPayload = await allRes.json()
    if (!readyRes.ok || !readyPayload.success) {
      console.error('Error fetching Ready for Review readiness:', readyPayload.error || readyRes.status)
      setStories([])
      setApprovalItems([])
      setReadyReviewKeys({})
      setLoading(false)
      return
    }
    if (!allRes.ok || !allPayload.success) {
      console.error('Error fetching content approval readiness:', allPayload.error || allRes.status)
      setStories([])
      setApprovalItems([])
      setReadyReviewKeys({})
      setLoading(false)
      return
    }

    setProductionQueueBannerMeta(await bannerMetaPromise)

    const readyItems = (readyPayload.items || []) as ApprovalItem[]
    setReadyReviewKeys(Object.fromEntries(readyItems.map((item) => [approvalItemKey(item), true])))
    // ATL-CONS-001 Phase C: capture blocked series from API (hard-blocked — series incomplete)
    setBlockedSeriesItems((readyPayload.blockedSeriesItems || []) as any[])

    const items = (allPayload.items || []) as ApprovalItem[]
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
    const eligibleSeriesIds = Array.from(new Set(items.flatMap((item) =>
      item.type === 'series' && item.seriesId ? [item.seriesId] : []
    ).filter(Boolean)))

    if (eligibleIds.length === 0) {
      setStories([])
      setLoading(false)
      return
    }

    const detailColumns = 'id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,intro_audio_url,intro_before_url,intro_after_url,outro_audio_url,background_music_url,status,is_hidden,created_at,updated_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,narrator_voice_name,workflow_state,repair_checklist,repair_notes,production_standard,production_standard_updated_at,production_standard_updated_by,production_priority,script_version,is_v2,script_json,brief_json,script,story_type,recommended_by,production_cost'
    const detailColumnsWithoutRecommendedBy = detailColumns.replace(',recommended_by', '')
    const legacyDetailColumns = 'id,title,author,genre,primary_genre,genre_secondary,genre_third,description,duration_mins,cover_url,audio_url,story_audio_url,status,is_hidden,created_at,updated_at,series_id,episode_number,series_name,series_total,episode_title,flag,is_free,group_name,review_status,reviewed_at,review_notes,narrator_voice_name,production_cost'
    let storyRowsResult: any = await supabase
      .from('stories')
      .select(detailColumns)
      .in('id', eligibleIds)
      .order('created_at', { ascending: false })

    if (storyRowsResult.error && /recommended_by|schema cache|column/i.test(storyRowsResult.error.message || '')) {
      storyRowsResult = await supabase
        .from('stories')
        .select(detailColumnsWithoutRecommendedBy)
        .in('id', eligibleIds)
        .order('created_at', { ascending: false })
      if (storyRowsResult.data) {
        storyRowsResult.data = storyRowsResult.data.map((story: any) => ({ ...story, recommended_by: null }))
      }
    }

    if (storyRowsResult.error && /workflow_state|repair_checklist|repair_notes|production_standard|production_priority|script_version|is_v2|script_json|brief_json|script|story_type|intro_audio_url|intro_before_url|intro_after_url|outro_audio_url|background_music_url|schema cache|column/i.test(storyRowsResult.error.message || '')) {
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
          production_standard: null,
          production_standard_updated_at: null,
          production_standard_updated_by: null,
          production_priority: 0,
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
          recommended_by: null,
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

    const [analyticsResult, productionJobsByStoryResult, productionJobsBySeriesResult, runnerWorkersResult] = await Promise.all([
      supabase
        .from('story_analytics')
        .select('*')
        .in('id', eligibleIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('production_jobs')
        .select('id,story_id,series_id,status,current_step,updated_at,locked_by,locked_at,created_at,error_json')
        .in('story_id', eligibleIds)
        .in('status', ACTIVE_PRODUCTION_JOB_STATUSES)
        .order('updated_at', { ascending: false }),
      eligibleSeriesIds.length > 0
        ? supabase
          .from('production_jobs')
          .select('id,story_id,series_id,status,current_step,updated_at,locked_by,locked_at,created_at,error_json')
          .in('series_id', eligibleSeriesIds)
          .in('status', ACTIVE_PRODUCTION_JOB_STATUSES)
          .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('pipeline_runner_state')
        .select('id,lease_holder,last_heartbeat_at,last_run_summary')
        .like('id', 'production-runner:worker-%')
        .order('last_heartbeat_at', { ascending: false, nullsFirst: false }),
    ])

    const { data, error } = analyticsResult
    const activeJobByStoryId = new Map<string, ProductionJobSummary>()
    const activeJobBySeriesId = new Map<string, ProductionJobSummary>()
    ;((productionJobsByStoryResult.data || []) as ProductionJobSummary[]).forEach((job) => {
      if (!job.story_id || activeJobByStoryId.has(job.story_id)) return
      activeJobByStoryId.set(job.story_id, job)
    })
    ;((productionJobsBySeriesResult.data || []) as ProductionJobSummary[]).forEach((job) => {
      if (!job.series_id || activeJobBySeriesId.has(job.series_id)) return
      activeJobBySeriesId.set(job.series_id, job)
    })
    if (productionJobsByStoryResult.error) console.error('Error fetching active story production jobs:', productionJobsByStoryResult.error)
    if (productionJobsBySeriesResult.error) console.error('Error fetching active series production jobs:', productionJobsBySeriesResult.error)
    if (runnerWorkersResult.error) {
      console.error('Error fetching runner worker state:', runnerWorkersResult.error)
      setRunnerWorkers([])
    } else {
      setRunnerWorkers((runnerWorkersResult.data || []) as RunnerWorkerState[])
    }

    const analyticsById = new Map((data || []).map((story: any) => [story.id, story]))
    const storyById = new Map(((storyRows || []) as Partial<Story>[]).map((story) => [story.id, story]))
    const loadedStories = items.flatMap((item) => {
      if (item.type === 'series') {
        return item.episodes.map((episode) => mergeReadiness({
          ...((analyticsById.get(episode.storyId) || {}) as Partial<Story>),
          ...((storyById.get(episode.storyId) || {}) as Partial<Story>),
          source_job: activeJobByStoryId.get(episode.storyId) || activeJobBySeriesId.get(item.seriesId) || undefined,
        }, episode, item))
      }
      return [mergeReadiness({
        ...((analyticsById.get(item.episode.storyId) || {}) as Partial<Story>),
        ...((storyById.get(item.episode.storyId) || {}) as Partial<Story>),
        source_job: activeJobByStoryId.get(item.episode.storyId) || undefined,
      }, item.episode)]
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

  function storyRowTitle(row: any): string | null {
    if (!row) return null
    return String(row.series_name || row.title || '').trim() || null
  }

  function productionJobStoryTitle(row: any): string | null {
    const story = Array.isArray(row?.stories) ? row.stories[0] : row?.stories
    return storyRowTitle(story)
  }

  async function fetchProductionQueueBannerMeta(): Promise<ProductionQueueBannerMeta> {
    const emptyMeta: ProductionQueueBannerMeta = {
      lastScriptedTitle: null,
      lastScriptedCreatedAt: null,
      lastCompletedJobTitle: null,
      nextUpTitle: null,
    }

    try {
      const [lastScriptedResult, nextUpResult, lastCompletedJobResult] = await Promise.all([
        supabase
          .from('stories')
          .select('id,title,series_name,created_at')
          .eq('workflow_state', 'stories_in_queue')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('stories')
          .select('id,title,series_name,created_at')
          .eq('workflow_state', 'stories_in_queue')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('production_jobs')
          .select('id,story_id,series_id,updated_at,stories(title,series_name)')
          .eq('status', 'complete')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (lastScriptedResult.error) console.error('Error fetching last scripted story:', lastScriptedResult.error)
      if (nextUpResult.error) console.error('Error fetching next production story:', nextUpResult.error)
      if (lastCompletedJobResult.error) console.error('Error fetching last completed production job:', lastCompletedJobResult.error)

      return {
        lastScriptedTitle: storyRowTitle(lastScriptedResult.data),
        lastScriptedCreatedAt: lastScriptedResult.data?.created_at || null,
        lastCompletedJobTitle: productionJobStoryTitle(lastCompletedJobResult.data),
        nextUpTitle: storyRowTitle(nextUpResult.data),
      }
    } catch (err) {
      console.error('Error fetching production queue banner metadata:', err)
      return emptyMeta
    }
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

  async function setSeriesWorkflowState(group: Extract<StoryGroup, { type: 'series' }>, state: WorkflowTab) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return
    const label = WORKFLOW_LABELS[state] || state
    if (!window.confirm(`Move all ${group.stories.length} episode(s) in "${group.title}" to ${label}?`)) return
    try {
      const res = await fetch('/api/admin/content-approval?action=set_series_workflow_state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId,
          state,
          reason: `Series moved to ${label} from approval page`,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        const details = Array.isArray(result.blocked)
          ? '\n\n' + result.blocked.map((item: any) => `${item.title || item.storyId}: ${item.reason || (item.reasons || []).join(', ')}`).join('\n')
          : ''
        alert(`Series workflow update failed: ${result.error || `HTTP ${res.status}`}${details}`)
        return
      }
      await fetchStories()
    } catch (err) {
      alert('Series workflow update failed: ' + String(err))
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

  const publishSeries = async (group: Extract<StoryGroup, { type: 'series' }>) => {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return
    if (!window.confirm(`Publish all ${group.stories.length} episode(s) in "${group.title}" to the app?`)) return
    try {
      const res = await fetch('/api/admin/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId,
          reason: 'Published series to app from approval page',
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        const details = Array.isArray(result.blocked)
          ? '\n\n' + result.blocked.map((item: any) => `${item.title || item.storyId}: ${(item.reasons || []).join(', ')}`).join('\n')
          : ''
        alert(`Publish failed: ${result.error || `HTTP ${res.status}`}${details}`)
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

  async function recoverFromColdStorage(story: Story) {
    if (!window.confirm(`Return "${story.title}" to Production Queue?\n\nAudio, cover, review notes, and production history will be preserved.`)) return
    try {
      const res = await fetch('/api/admin/content-approval?action=recover_from_cold_storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) { alert(`Recovery failed: ${result.error || `HTTP ${res.status}`}`); return }
      await fetchStories()
      setActivePipelineTab('production_queue')
      setSeriesFilter('all')
    } catch (err) { alert('Recovery failed: ' + String(err)) }
  }

  async function recoverSeriesFromColdStorage(group: Extract<StoryGroup, { type: 'series' }>) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return
    if (!window.confirm(`Return the entire series "${group.title}" (${group.stories.length} episodes) to Production Queue?\n\nAudio, covers, review notes, and production history will be preserved.`)) return
    try {
      const res = await fetch('/api/admin/content-approval?action=recover_from_cold_storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) { alert(`Recovery failed: ${result.error || `HTTP ${res.status}`}`); return }
      await fetchStories()
      setActivePipelineTab('production_queue')
      setSeriesFilter('all')
    } catch (err) { alert('Recovery failed: ' + String(err)) }
  }

  async function tagIncubator(group: StoryGroup) {
    const isSeries = group.type === 'series'
    const title = isSeries && group.type === 'series' ? group.title : (group as Extract<StoryGroup, { type: 'standalone' }>).story.title
    const count = isSeries && group.type === 'series' ? group.stories.length : 1
    const msg = isSeries
      ? `Move the series "${title}" to the Incubator?\n\nAll ${count} episodes will be tagged. They remain in Cold Storage but appear in the Production Console Incubator queue.`
      : `Move "${title}" to the Incubator?\n\nIt remains in Cold Storage but appears in the Production Console Incubator queue.`
    if (!window.confirm(msg)) return
    const bodyPayload = isSeries && group.type === 'series'
      ? { seriesId: group.stories[0]?.series_id }
      : { storyId: (group as Extract<StoryGroup, { type: 'standalone' }>).story.id }
    try {
      const res = await fetch('/api/admin/content-approval?action=set_incubator_tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) { alert(`Incubator tag failed: ${result.error || `HTTP ${res.status}`}`); return }
      await fetchStories()
    } catch (err) { alert('Incubator tag failed: ' + String(err)) }
  }

  function requestMoveSeriesToReadyForReview(group: Extract<StoryGroup, { type: 'series' }>) {
    const seriesId = String(group.stories[0]?.series_id || '').trim()
    if (!seriesId) return
    setSeriesActionsOpen(false)
    setSeriesReadyConfirm({ seriesId, seriesName: group.title })
  }

  async function moveSeriesToReadyForReview() {
    if (!seriesReadyConfirm) return
    try {
      const res = await fetch('/api/admin/content-approval?action=set_series_ready_for_review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: seriesReadyConfirm.seriesId, targetState: 'ready_for_review' }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        alert(`Series workflow update failed: ${result.error || `HTTP ${res.status}`}`)
        return
      }
      setSeriesReadyConfirm(null)
      setActivePipelineTab('ready_for_review')
      setSeriesFilter('all')
      await fetchStories()
    } catch (err) {
      alert('Series workflow update failed: ' + String(err))
    }
  }

  async function approveAllReady(group: Extract<StoryGroup, { type: 'series' }>) {
    await setSeriesWorkflowState(group, 'approved_ready')
  }

  function openStoryRepair(story: Story, prefill?: RepairChecklistValue) {
    if (prefill) {
      setStories((prev) => prev.map((item) => item.id === story.id ? { ...item, repair_checklist: prefill } : item))
    }
    setOpenRepairStoryId(story.id)
  }

  function openSeriesRepair(group: Extract<StoryGroup, { type: 'series' }>) {
    setOpenRepairSeriesKey(group.key)
    setRepairEntireSeries(false)
    setExpandedSeries(prev => ({ ...prev, [group.key]: true }))
  }

  function episodeRepairMark(storyId: string): EpisodeRepairMark {
    return episodeRepairMarks[storyId] || episodeRepairMarkDefault()
  }

  function effectiveEpisodeRepairMark(story: Story): EpisodeRepairMark {
    const local = episodeRepairMarks[story.id]
    if (local) return local
    if (!persistedReviewComplete(story)) return episodeRepairMarkDefault()
    const checklist = normalizeRepairChecklist(story.repair_checklist)
    const needed = persistedReviewNeedsRepair(story)
    return {
      ...episodeRepairMarkDefault(),
      needed,
      checklist,
      notes: story.repair_notes || '',
      reviewState: needed ? 'finished' : 'no_repair',
      listenState: 'listened',
    }
  }

  function setEpisodeRepairNeeded(storyId: string, needed: boolean) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), needed },
    }))
  }

  function episodeHasRepairItems(mark: EpisodeRepairMark) {
    return Object.values(mark.checklist).some((items) => items.length > 0)
  }

  function pauseEpisodeAudio(storyId: string) {
    inlineAudioRef.current?.pause()
    const audio = reviewAudioRefs.current[storyId]
    if (audio) audio.pause()
  }

  function openEpisodeReview(story: Story) {
    setFocusedReviewStoryId(story.id)
    setEpisodeRepairMarks((prev) => {
      const current = prev[story.id] || episodeRepairMarkDefault()
      return {
        ...prev,
        [story.id]: { ...current, listenState: current.listenState === 'unplayed' ? 'in_progress' : current.listenState },
      }
    })
  }

  function setEpisodeCoverOpen(storyId: string, open: boolean) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), coverOpen: open },
    }))
  }

  function setEpisodeCoverNote(storyId: string, coverNote: string) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), coverNote, coverOpen: true },
    }))
  }

  async function generateCoverForEpisode(story: Story, options?: { isRetry?: boolean }) {
    const mark = episodeRepairMark(story.id)
    const nextAttempt = mark.coverAttempt + 1
    const baseInstruction = mark.coverNote.trim()
    const retry = Boolean(options?.isRetry || mark.candidateCoverUrl)
    const instructionChanged = baseInstruction !== mark.lastCoverInstruction
    const variationInstruction = retry
      ? instructionChanged
        ? 'Create a meaningfully different candidate using the revised instruction, with a different lighting balance, different crop, clearer focal subject, and stronger foreground/background separation.'
        : 'Create a visibly different version with brighter lighting, clearer subject, stronger contrast, less darkness, a different crop, clearer focal subject, and stronger foreground/background separation.'
      : ''
    const coverStandard = 'Endless Tales Cover Standard: thumbnail-safe at phone size; brighter lighting by default; clear subject or object; strong readable silhouette; strong contrast without crushing blacks; avoid murky low-light compositions; avoid faces or important objects disappearing into shadow; use cinematic lighting, but not underexposed lighting; important visual element must be clear at 100x100 px.'

    const effectiveFeedback = [
      baseInstruction,
      variationInstruction,
      coverStandard,
      retry ? `Candidate variation attempt ${nextAttempt}: do not repeat the previous composition.` : '',
    ].filter(Boolean).join(' ')

    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), coverGenerating: true, candidateCoverUrl: '', coverAttempt: nextAttempt },
    }))
    try {
      const res = await fetch('/api/asc3/regenerate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          coverFeedback: effectiveFeedback || undefined,
          candidateOnly: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success || !data?.candidateCoverUrl) {
        throw new Error(data?.error || 'Cover generation failed')
      }
      setEpisodeRepairMarks((prev) => ({
        ...prev,
        [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), coverGenerating: false, candidateCoverUrl: data.candidateCoverUrl, lastCoverInstruction: baseInstruction, coverAttempt: nextAttempt },
      }))
    } catch (err) {
      setEpisodeRepairMarks((prev) => ({
        ...prev,
        [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), coverGenerating: false },
      }))
      alert('Cover generation failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  async function acceptCoverForEpisode(story: Story, candidateUrl: string) {
    const { error } = await supabase
      .from('stories')
      .update({ cover_url: candidateUrl })
      .eq('id', story.id)
    if (error) {
      alert('Failed to save cover: ' + error.message)
      return
    }
    setCoverUrlOverrides((prev) => ({ ...prev, [story.id]: candidateUrl }))
    setStories((prev) => prev.map((item) => item.id === story.id ? { ...item, cover_url: candidateUrl } : item))
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), candidateCoverUrl: '', coverOpen: false, coverGenerating: false },
    }))
  }

  function toggleEpisodeRepairIssue(storyId: string, issue: { id: string; group: RepairGroup }) {
    inlineAudioRef.current?.pause()
    pauseEpisodeAudio(storyId)
    const story = stories.find((item) => item.id === storyId)
    const current = story ? effectiveEpisodeRepairMark(story) : episodeRepairMark(storyId)
    const selected = current.checklist[issue.group].includes(issue.id)
    const nextChecklist = {
      ...current.checklist,
      [issue.group]: selected
        ? current.checklist[issue.group].filter((id) => id !== issue.id)
        : [...current.checklist[issue.group], issue.id],
    }
    const nextHasRepair = Object.values(nextChecklist).some((items) => items.length > 0)
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: {
        ...current,
        needed: nextHasRepair,
        checklist: nextChecklist,
        reviewState: nextHasRepair ? 'needs_repair' : 'unreviewed',
      },
    }))
  }

  function setEpisodeListenState(storyId: string, listenState: EpisodeRepairMark['listenState']) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), listenState },
    }))
  }

  function setEpisodeReviewState(storyId: string, reviewState: EpisodeRepairMark['reviewState']) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), reviewState },
    }))
  }

  function setEpisodeCategoryComment(storyId: string, categoryId: string, comment: string) {
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: {
        ...(prev[storyId] || episodeRepairMarkDefault()),
        categoryComments: { ...(prev[storyId] || episodeRepairMarkDefault()).categoryComments, [categoryId]: comment },
      },
    }))
  }

  function setEpisodeActiveCategory(storyId: string, categoryId: string | null) {
    pauseEpisodeAudio(storyId)
    setEpisodeRepairMarks((prev) => ({
      ...prev,
      [storyId]: { ...(prev[storyId] || episodeRepairMarkDefault()), activeCategoryId: categoryId },
    }))
  }

  function finishEpisodeReview(storyId: string) {
    inlineAudioRef.current?.pause()
    setEpisodeRepairMarks((prev) => {
      const current = prev[storyId] || episodeRepairMarkDefault()
      const hasRepair = AUDIO_REPAIR_OPTIONS.some((option) => current.checklist[option.group].includes(option.id))
      const notes = AUDIO_REPAIR_OPTIONS
        .filter((option) => current.checklist[option.group].includes(option.id))
        .map((option) => {
          const comment = (current.categoryComments[option.id] || '').trim()
          return `${option.label}: ${comment}`
        })
        .join('\n')
      return {
        ...prev,
        [storyId]: {
          ...current,
          needed: hasRepair,
          notes,
          reviewState: hasRepair ? 'finished' : 'no_repair',
          activeCategoryId: null,
        },
      }
    })
    setFocusedReviewStoryId(null)
  }

  function buildStandaloneRepairNotes(currentMark: EpisodeRepairMark) {
    const notes: string[] = [
      'Repair requested by Marc.',
      '',
    ]
    AUDIO_REPAIR_OPTIONS
      .filter((option) => currentMark.checklist[option.group].includes(option.id))
      .forEach((option) => {
        const comment = (currentMark.categoryComments[option.id] || '').trim()
        notes.push(`* ${option.label}: ${comment || 'No additional note provided.'}`)
      })
    notes.push('')
    notes.push('Repair instructions:')
    notes.push('Fix only the listed issues. Preserve approved voices, episode order, intro/outro standards, and series continuity.')
    return notes.join('\n')
  }

  async function finishInlineEpisodeReview(story: Story) {
    const currentMark = episodeRepairMarks[story.id] || episodeRepairMarkDefault()
    const hasRepair = AUDIO_REPAIR_OPTIONS.some((option) => currentMark.checklist[option.group].includes(option.id))
    finishEpisodeReview(story.id)
    const repairNotes = hasRepair ? buildStandaloneRepairNotes(currentMark) : ''
    try {
      const res = await fetch('/api/admin/content-approval?action=record_review_outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          hasIssues: hasRepair,
          repairChecklist: hasRepair ? currentMark.checklist : null,
          repairNotes,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        alert(`Review save failed: ${result.error || `HTTP ${res.status}`}`)
        return
      }
      setStories((prev) => prev.map((item) => item.id === story.id ? { ...item, ...result.story } : item))
    } catch (err) {
      alert('Review save failed: ' + String(err))
    }
  }

  function buildSeriesRepairFromEpisodeMarks(storiesToRepair: Story[], seriesTitle = selectedTitle) {
    const checklist = emptyRepairChecklist()
    const notes: string[] = [
      `Series: ${seriesTitle}`,
      'Repair requested by Marc.',
      '',
    ]
    storiesToRepair.forEach((story) => {
      const mark = effectiveEpisodeRepairMark(story)
      if (mark.needed !== true) return
      AUDIO_REPAIR_OPTIONS.forEach((option) => {
        if (mark.checklist[option.group].includes(option.id) && !checklist[option.group].includes(option.id)) {
          checklist[option.group].push(option.id)
        }
      })
      const selectedOptions = AUDIO_REPAIR_OPTIONS
        .filter((option) => mark.checklist[option.group].includes(option.id))
      notes.push(`Episode ${story.episode_number || '?'} — ${story.episode_title || story.title}`)
      notes.push('')
      if (selectedOptions.length > 0) {
        selectedOptions.forEach((option) => {
          const comment = (mark.categoryComments[option.id] || '').trim()
            notes.push(`* ${option.label}: ${comment || 'No additional note provided.'}`)
        })
      } else {
        notes.push(`* General repair needed: ${mark.notes.trim() || 'No additional note provided.'}`)
      }
      notes.push('')
    })
    notes.push('Repair instructions:')
    notes.push('Fix only the listed issues. Preserve approved voices, episode order, intro/outro standards, and series continuity.')
    return { checklist, notes: notes.join('\n') }
  }

  function moveSeriesToRepairShop(group: Extract<StoryGroup, { type: 'series' }>) {
    const markedStories = group.stories.filter((story) => effectiveEpisodeRepairMark(story).needed === true)
    if (markedStories.length === 0) {
      alert('Check at least one repair item before sending the series for repair.')
      return
    }
    const { checklist, notes } = buildSeriesRepairFromEpisodeMarks(group.stories, group.title)
    if (!window.confirm(`Move the entire series "${group.title}" to Repair Shop with ${markedStories.length} marked episode(s)?`)) return
    sendSeriesRepair(group, checklist, notes, true)
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
    if (!window.confirm(`Publish all ${approved.length} Ready to Publish item(s) to the live app?`)) return
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
        title: displaySeriesTitle(seriesStories) || item.title,
        stories: seriesStories,
        expectedEpisodeCount: item.expectedEpisodeCount,
        presentEpisodeCount: item.presentEpisodeCount,
        missingEpisodes: item.missingEpisodes,
        approvalReady: item.approvalReady,
        approvalBlockingReasons: item.approvalBlockingReasons,
        sourceJobId: item.sourceJobId,
        completionSortDate: item.completionSortDate || null,
        completionSortSource: item.completionSortSource || null,
      }]
    }
    const story = storiesById.get(item.episode.storyId)
    return story ? [{ type: 'standalone', key: `story:${story.id}`, story }] : []
  })

  const workflowCounts = groupsFromReadiness.reduce((counts, group) => {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    STREAMING_PIPELINE.forEach((item) => {
      const rowCount = storiesForWorkflowLane(groupStories, item.id).length
      if (rowCount > 0) counts[item.id] = (counts[item.id] || 0) + rowCount
    })
    return counts
  }, {} as Record<WorkflowLane, number>)

  const repairQueueItemCount = groupsFromReadiness.reduce((count, group) => {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    return count + groupStories.filter(repairQueueStates).length
  }, 0)

  const activelyRepairedStory = stories
    .filter(repairQueueStates)
    .sort((a, b) => {
      const aActive = effectiveWorkflowState(a) === 'being_repaired' ? 1 : 0
      const bActive = effectiveWorkflowState(b) === 'being_repaired' ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      return new Date(repairEnteredDate(b) || 0).getTime() - new Date(repairEnteredDate(a) || 0).getTime()
    })[0] || null

  const nextProductionStory = stories
    .filter(productionQueueStates)
    .sort((a, b) => {
      const aPriority = storyProductionPriority(a)
      const bPriority = storyProductionPriority(b)
      if (aPriority > 0 || bPriority > 0) {
        if (aPriority === 0) return 1
        if (bPriority === 0) return -1
        if (aPriority !== bPriority) return aPriority - bPriority
      }
      if ((a.duration_mins || 0) !== (b.duration_mins || 0)) return (a.duration_mins || 0) - (b.duration_mins || 0)
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    })[0] || null

  useEffect(() => {
    if (returnSelectionAppliedRef.current || loading || (!returnTarget.storyId && !returnTarget.seriesId)) return
    const matchedGroup = groupsFromReadiness.find((group) => {
      const groupStories = group.type === 'series' ? group.stories : [group.story]
      return Boolean(
        (returnTarget.seriesId && groupStories.some((story) => story.series_id === returnTarget.seriesId)) ||
        (returnTarget.storyId && groupStories.some((story) => story.id === returnTarget.storyId))
      )
    })
    if (!matchedGroup) return
    const groupStories = matchedGroup.type === 'series' ? matchedGroup.stories : [matchedGroup.story]
    const targetStory = groupStories.find((story) => story.id === returnTarget.storyId) || groupStories[0]
    const targetLane = groupPrimaryWorkflowLane(matchedGroup, readyReviewKeys) || visualWorkflowLane(targetStory)
    setActivePipelineTab(isApprovalWorkflowLane(targetLane) ? targetLane : 'ready_for_review')
    setSeriesFilter('all')
    setSelectedSeriesKey(matchedGroup.key)
    if (matchedGroup.type === 'series') setExpandedSeries((prev) => ({ ...prev, [matchedGroup.key]: true }))
    returnSelectionAppliedRef.current = true
  }, [
    loading,
    returnTarget.storyId,
    returnTarget.seriesId,
    Object.keys(readyReviewKeys).join('|'),
    groupsFromReadiness.map((group) => group.key).join('|'),
  ])

  function groupEpisodeCountForTab(group: StoryGroup, tab: WorkflowFilter) {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    if (tab === 'all') return group.type === 'series'
      ? group.presentEpisodeCount || group.stories[0]?.present_episode_count || groupStories.length
      : groupStories.length
    return storiesForWorkflowLane(groupStories, tab).length
  }

  function productionQueueStoriesForGroup(group: StoryGroup) {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    return storiesForWorkflowLane(groupStories, 'production_queue')
  }

  function groupProductionPriority(group: StoryGroup) {
    const priorities = productionQueueStoriesForGroup(group)
      .map(storyProductionPriority)
      .filter((priority) => priority > 0)
    return priorities.length > 0 ? Math.min(...priorities) : 0
  }

  function groupProductionDuration(group: StoryGroup) {
    return productionQueueStoriesForGroup(group).reduce((sum, story) => sum + (story.duration_mins || 0), 0)
  }

  function compareProductionQueueGroups(a: StoryGroup, b: StoryGroup) {
    const aPriority = groupProductionPriority(a)
    const bPriority = groupProductionPriority(b)
    if (aPriority > 0 || bPriority > 0) {
      if (aPriority === 0) return 1
      if (bPriority === 0) return -1
      if (aPriority !== bPriority) return aPriority - bPriority
    }

    const aCount = groupEpisodeCountForTab(a, 'production_queue')
    const bCount = groupEpisodeCountForTab(b, 'production_queue')
    if (aCount !== bCount) return aCount - bCount

    const durationDelta = groupProductionDuration(a) - groupProductionDuration(b)
    if (durationDelta !== 0) return durationDelta

    const aTitle = a.type === 'series' ? a.title : a.story.title
    const bTitle = b.type === 'series' ? b.title : b.story.title
    return aTitle.localeCompare(bTitle)
  }

  function productionQueuePositionForGroup(group: StoryGroup) {
    const index = seriesGroups.findIndex((item) => item.key === group.key)
    return activePipelineTab === 'production_queue' && index >= 0 ? index + 1 : null
  }

  function productionQueueCardStories(group: StoryGroup) {
    const groupStories = group.type === 'series' ? group.stories : [group.story]
    const productionStories = productionQueueStoriesForGroup(group)
    return productionStories.length > 0 ? productionStories : groupStories
  }

  function productionQueueCardTitle(group: StoryGroup) {
    const cardStories = productionQueueCardStories(group)
    const firstStory = cardStories[0] || (group.type === 'series' ? group.stories[0] : group.story)
    return isTrueSeriesGroup(group)
      ? displaySeriesTitle(cardStories)
      : String(firstStory?.title || firstStory?.series_name || 'Untitled Story')
  }

  function activeProductionJobForStories(stories: Story[]) {
    return stories.map((story) => story.source_job).find(isActiveProductionJob) || null
  }

  const seriesGroups = groupsFromReadiness
    .filter((group) => {
      const groupStories = group.type === 'series' ? group.stories : [group.story]
      const title = group.type === 'series' ? group.title : group.story.title
      const matchesSearch = !seriesSearch.trim() || title.toLowerCase().includes(seriesSearch.trim().toLowerCase())
      const selectedWorkflow = seriesFilter === 'all' ? activePipelineTab : seriesFilter
      const validEpisodeCount = storiesForWorkflowLane(groupStories, selectedWorkflow).length
      const matchesWorkflow = validEpisodeCount > 0
      return matchesSearch && matchesWorkflow
    })
    .sort((a, b) => {
      if (activePipelineTab === 'production_queue') {
        if (productionQueueView === 'production_order') return compareProductionQueueGroups(a, b)
        const aCount = groupEpisodeCountForTab(a, 'production_queue')
        const bCount = groupEpisodeCountForTab(b, 'production_queue')
        if (aCount !== bCount) return aCount - bCount
        const durationDelta = groupProductionDuration(a) - groupProductionDuration(b)
        if (durationDelta !== 0) return durationDelta
        const aTitle = a.type === 'series' ? a.title : a.story.title
        const bTitle = b.type === 'series' ? b.title : b.story.title
        return aTitle.localeCompare(bTitle)
      }
      if (activePipelineTab === 'cold_storage') {
        const aDate = a.type === 'series'
          ? Math.max(...a.stories.map((s) => new Date(s.updated_at || 0).getTime()))
          : new Date(a.story.updated_at || 0).getTime()
        const bDate = b.type === 'series'
          ? Math.max(...b.stories.map((s) => new Date(s.updated_at || 0).getTime()))
          : new Date(b.story.updated_at || 0).getTime()
        if (bDate !== aDate) return bDate - aDate
      }
      if (activePipelineTab === 'ready_for_review') {
        const aDate = a.type === 'series' ? a.completionSortDate : a.story.completion_sort_date
        const bDate = b.type === 'series' ? b.completionSortDate : b.story.completion_sort_date
        const dateDelta = new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime()
        if (dateDelta !== 0) return dateDelta
      }
      const aCount = groupEpisodeCountForTab(a, activePipelineTab)
      const bCount = groupEpisodeCountForTab(b, activePipelineTab)
      if (bCount !== aCount) return bCount - aCount
      const aTitle = a.type === 'series' ? a.title : a.story.title
      const bTitle = b.type === 'series' ? b.title : b.story.title
      return aTitle.localeCompare(bTitle)
    })

  const productionQueueTitleCounts = seriesGroups.reduce<Record<string, number>>((counts, group) => {
    if (activePipelineTab !== 'production_queue') return counts
    const key = normalizedDuplicateTitle(productionQueueCardTitle(group))
    if (!key) return counts
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  // Only jobs the runner is ACTIVELY processing right now (not just waiting in queue)
  const RUNNER_ACTIVE_STATUSES = ['running', 'processing', 'waiting_for_external']
  const activeRunnerJobs = Array.from(new Map(stories
    .filter((story) => productionQueueStates(story) && RUNNER_ACTIVE_STATUSES.includes(String(story.source_job?.status || '').trim()))
    .map((story) => [story.source_job?.id || story.id, story])
  ).values())
    .sort((a, b) => new Date(b.source_job?.updated_at || 0).getTime() - new Date(a.source_job?.updated_at || 0).getTime())
  // Count distinct queued production_jobs (not stories) — avoids over-counting stories without jobs
  const queuedRunnerJobCount = Array.from(new Set(
    stories
      .filter((story) => productionQueueStates(story) && story.source_job?.status === 'queued' && story.source_job?.id)
      .map((story) => story.source_job!.id)
  )).length
  const lastScriptedAtMs = productionQueueBannerMeta.lastScriptedCreatedAt
    ? new Date(productionQueueBannerMeta.lastScriptedCreatedAt).getTime()
    : 0
  const halIsWorking = Boolean(
    productionQueueBannerMeta.lastScriptedTitle &&
    lastScriptedAtMs > 0 &&
    Date.now() - lastScriptedAtMs <= HAL_RECENT_SCRIPT_WINDOW_HOURS * 60 * 60 * 1000
  )
  const scriptQueueDepth = workflowCounts.production_queue || 0
  const halStatusText = halIsWorking
    ? `Writing: ${productionQueueBannerMeta.lastScriptedTitle}`
    : scriptQueueDepth > 0
      ? `Idle — ${scriptQueueDepth} scripts waiting for dispatch · last: ${productionQueueBannerMeta.lastScriptedTitle || 'None'}`
      : `Idle — no scripts in queue · last: ${productionQueueBannerMeta.lastScriptedTitle || 'None'}`
  const runnerQueueSuffix = queuedRunnerJobCount > 0 ? ` · ${queuedRunnerJobCount} queued` : ''
  const activeRunnerWorkers = runnerWorkers.filter((worker) => {
    if (!worker.lease_holder || !worker.last_heartbeat_at) return false
    return Date.now() - new Date(worker.last_heartbeat_at).getTime() <= 15 * 60 * 1000
  })
  const expectedRunnerWorkerCount: number = 3
  const runnerJobByWorkerId = new Map(
    activeRunnerJobs
      .filter((story) => story.source_job?.locked_by)
      .map((story) => [story.source_job!.locked_by!, story])
  )
  const activeRunnerWorkerRows = activeRunnerWorkers.map((worker) => ({
    worker,
    story: runnerJobByWorkerId.get(worker.id) || null,
  }))
  const unmatchedRunnerJobs = activeRunnerJobs.filter((story) => (
    !story.source_job?.locked_by || !activeRunnerWorkers.some((worker) => worker.id === story.source_job?.locked_by)
  ))
  const runnerIsActive = activeRunnerWorkers.length > 0 || activeRunnerJobs.length > 0
  const runnerStatusText = activeRunnerWorkerRows.length > 0 || unmatchedRunnerJobs.length > 0
    ? null
    : `${activeRunnerWorkers.length > 0 ? 'Active' : 'Idle'} — ${activeRunnerWorkers.length} of ${expectedRunnerWorkerCount} workers active · current job: None · last finished: ${productionQueueBannerMeta.lastCompletedJobTitle || 'None'} · next up: ${productionQueueBannerMeta.nextUpTitle || 'None'}`
  const runnerWorkerLabel = `${activeRunnerWorkers.length} of ${expectedRunnerWorkerCount} worker${expectedRunnerWorkerCount === 1 ? '' : 's'} active`

  const selectedGroup = seriesGroups.find((group) => group.key === selectedSeriesKey) || seriesGroups[0] || null
  useEffect(() => {
    if (selectedSeriesKey && seriesGroups.some((group) => group.key === selectedSeriesKey)) return
    setSelectedSeriesKey(seriesGroups[0]?.key || null)
  }, [selectedSeriesKey, seriesGroups.map((group) => group.key).join('|')])

  function setPipelineTab(tab: WorkflowLane) {
    setActivePipelineTab(tab)
    setSeriesFilter('all')
    setSelectedSeriesKey(null)
    setFocusedReviewStoryId(null)
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
    const lane = visualWorkflowLane(story)
    const canPlay = lane !== 'cold_storage' && Boolean(story.audio_url)

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%', minWidth: 0 }}>
        {canPlay && <PlayStoryButton story={story} />}
      </div>
    )
  }

  function renderEpisodeReviewActions(story: Story) {
    const mark = episodeRepairMark(story.id)
    const audioUrl = story.audio_url || story.story_audio_url
    const isFinishedClean = mark.reviewState === 'no_repair'
    const isFinishedRepair = mark.reviewState === 'finished'
    const label = isFinishedClean ? '✓ Finished' : isFinishedRepair ? '⚠ Repair Needed' : 'Review Audio'
    const isComplete = isFinishedClean || isFinishedRepair

    return (
      <button
        type="button"
        onClick={() => openEpisodeReview(story)}
        style={{
          padding: '5px 10px',
          borderRadius: '999px',
          border: isFinishedClean ? '1px solid #A7F3D0' : isFinishedRepair ? '1px solid #FED7AA' : 'none',
          backgroundColor: isFinishedClean ? '#ECFDF5' : isFinishedRepair ? '#FFF7ED' : '#f97316',
          color: isFinishedClean ? '#047857' : isFinishedRepair ? '#C2410C' : '#ffffff',
          fontSize: '11px',
          fontWeight: 900,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          opacity: audioUrl ? 1 : 0.95,
          boxShadow: !isComplete ? '0 1px 2px rgba(249,115,22,0.22)' : undefined,
        }}
      >
        {label}
      </button>
    )
  }

  function renderInlineEpisodeReviewPanel(story: Story) {
    const audioUrl = story.audio_url || story.story_audio_url

    return (
      <div data-paused={inlineAudioPaused} style={{ display: 'grid', gap: '10px', padding: '12px', borderRadius: '8px', border: '1px solid #FED7AA', backgroundColor: '#FFF7ED' }}>
        {audioUrl ? (
          <audio
            ref={(node) => { if (node && !inlineAudioRef.current) inlineAudioRef.current = node }}
            src={audioUrl}
            controls
            style={{ width: '100%', marginBottom: '8px' }}
            onPlay={(event) => { inlineAudioRef.current = event.currentTarget; setInlineAudioPaused(false) }}
            onPause={() => setInlineAudioPaused(true)}
          />
        ) : (
          <div style={{ color: '#9A3412', fontSize: '12px', fontWeight: 800 }}>No audio available</div>
        )}
        {renderEpisodeRepairDetails(story)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={async () => { await finishInlineEpisodeReview(story) }} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#16A34A', color: '#ffffff', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>
            Finish Review
          </button>
          <button type="button" onClick={() => { inlineAudioRef.current?.pause(); setFocusedReviewStoryId(null) }} style={{ ...actionButtonStyle('muted'), padding: '6px 14px', borderRadius: '6px', minHeight: 'auto', fontSize: '12px' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  function renderEpisodeRepairDetails(story: Story) {
    const mark = effectiveEpisodeRepairMark(story)

    const activeOption = AUDIO_REPAIR_OPTIONS.find((option) => option.id === mark.activeCategoryId)
    const activeCategoryChecked = Boolean(activeOption && mark.checklist[activeOption.group].includes(activeOption.id))

    return (
      <div style={{ width: '100%', display: 'grid', gap: '10px', paddingTop: '4px' }}>
        <div style={{ color: '#374151', fontSize: '12px', fontWeight: 900 }}>Mark any issues below:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', justifyContent: 'flex-start' }}>
          {AUDIO_REPAIR_OPTIONS.map((option) => {
            const checked = mark.checklist[option.group].includes(option.id)
            const hasComment = Boolean((mark.categoryComments[option.id] || '').trim())
            const isActive = mark.activeCategoryId === option.id

            return (
              <label
                key={option.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: checked ? '#1F2937' : '#6B7280', fontSize: '12px', fontWeight: checked ? 800 : 600, lineHeight: 1.2 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    inlineAudioRef.current?.pause()
                    toggleEpisodeRepairIssue(story.id, option)
                    if (!checked) setEpisodeActiveCategory(story.id, option.id)
                    if (checked && isActive) setEpisodeActiveCategory(story.id, null)
                  }}
                />
                {option.label}
                {checked && hasComment && <span style={{ marginLeft: '2px', color: '#059669', fontSize: '10px', fontWeight: 900 }}>✓</span>}
              </label>
            )
          })}
        </div>

        {mark.activeCategoryId && activeCategoryChecked && activeOption && (
          <div style={{ display: 'grid', gap: '4px' }}>
            <label style={{ color: '#374151', fontSize: '11px', fontWeight: 800 }}>
              {activeOption.label}: describe the problem...
            </label>
            <textarea
              value={mark.categoryComments[mark.activeCategoryId] || ''}
              onChange={(e) => setEpisodeCategoryComment(story.id, mark.activeCategoryId!, e.target.value)}
              placeholder="Describe the problem..."
              rows={2}
              style={{ width: '100%', resize: 'vertical', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '6px 8px', color: '#111827', backgroundColor: '#ffffff', fontSize: '11px', lineHeight: 1.4, boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>
    )
  }

  function renderCoverReviewDetails(story: Story) {
    const mark = episodeRepairMark(story.id)
    if (!mark.coverOpen) return null
    const currentCover = episodeCoverUrl(story)
    const { coverNote, candidateCoverUrl, coverGenerating } = mark
    const mutedButtonStyle = actionButtonStyle('muted')
    const orangeButtonStyle = { ...actionButtonStyle('primary'), backgroundColor: '#F97316' }
    const coverFrameStyle = {
      width: '80px',
      height: '80px',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: '#E5E7EB',
      border: '1px solid #E5E7EB',
      flex: '0 0 auto',
    }

    return (
      <div style={{ display: 'grid', gap: '12px', padding: '14px', borderRadius: '10px', border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}>
        {coverGenerating ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B7280', fontSize: '12px', fontWeight: 700 }}>
            <span aria-hidden="true">⏳</span>
            <span>Generating cover...</span>
          </div>
        ) : candidateCoverUrl ? (
          <>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Current</div>
                <div style={coverFrameStyle}>
                  {currentCover ? (
                    <img src={currentCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>New</div>
                <div style={{ ...coverFrameStyle, border: '2px solid #F97316' }}>
                  <img src={candidateCoverUrl} alt="Generated cover candidate" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            </div>
            <label style={{ color: '#374151', fontSize: '11px', fontWeight: 900 }}>
              Cover instructions
              <textarea
                value={coverNote}
                onChange={(event) => setEpisodeCoverNote(story.id, event.target.value)}
                placeholder="Describe the cover change you want..."
                rows={2}
                style={{ marginTop: '5px', width: '100%', resize: 'vertical', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '7px 8px', color: '#111827', backgroundColor: '#ffffff', fontSize: '12px', lineHeight: 1.4 }}
              />
            </label>
            <div style={{ color: '#9CA3AF', fontSize: '11px', marginTop: '4px' }}>
              Revise the instruction, then click Try Again.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => acceptCoverForEpisode(story, candidateCoverUrl)} style={actionButtonStyle('success')}>Accept New Cover</button>
              <button type="button" onClick={() => generateCoverForEpisode(story, { isRetry: true })} style={mutedButtonStyle}>Try Again</button>
              <button
                type="button"
                onClick={() => setEpisodeRepairMarks((prev) => ({
                  ...prev,
                  [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), candidateCoverUrl: '', coverOpen: false, coverGenerating: false },
                }))}
                style={mutedButtonStyle}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {currentCover && (
              <div style={coverFrameStyle}>
                <img src={currentCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <label style={{ color: '#374151', fontSize: '11px', fontWeight: 900 }}>
              Cover instructions
              <textarea
                value={coverNote}
                onChange={(event) => setEpisodeCoverNote(story.id, event.target.value)}
                placeholder="Describe the cover change you want..."
                rows={3}
                style={{ marginTop: '5px', width: '100%', resize: 'vertical', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '7px 8px', color: '#111827', backgroundColor: '#ffffff', fontSize: '12px', lineHeight: 1.4 }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => generateCoverForEpisode(story)} style={orangeButtonStyle}>Generate New Cover</button>
              <button type="button" disabled title="Upload coming later" style={{ ...mutedButtonStyle, cursor: 'not-allowed', opacity: 0.5 }}>Upload (coming later)</button>
              <button type="button" onClick={() => setEpisodeCoverOpen(story.id, false)} style={mutedButtonStyle}>Close</button>
            </div>
          </>
        )}
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
  const activeEmptyMessage = activePipelineTab === 'published'
      ? 'No published stories in this view.'
      : `No ${activeWorkflow.label.toLowerCase()} items.`
  const selectedAllStories = selectedGroup ? (selectedGroup.type === 'series' ? selectedGroup.stories : [selectedGroup.story]) : []
  const selectedStories = storiesForWorkflowLane(selectedAllStories, activePipelineTab)
  const selectedFirst = selectedStories[0]
  const selectedIsSeries = selectedGroup ? isTrueSeriesGroup(selectedGroup) : false
  const selectedTitle = selectedIsSeries && selectedGroup?.type === 'series' ? selectedGroup.title : selectedFirst?.title || ''
  const selectedExpected = selectedGroup ? (selectedIsSeries ? groupExpectedCount(selectedGroup) : 1) : 0
  const selectedPresent = selectedGroup ? (selectedIsSeries ? groupPresentCount(selectedGroup) : 1) : 0
  const selectedApprovalReady = selectedGroup
    ? readyReviewKeys[groupApprovalKey(selectedGroup)] === true
    : false
  const selectedApprovalBlockingReasons = selectedGroup
    ? selectedGroup.type === 'series'
      ? selectedGroup.approvalBlockingReasons || []
      : selectedGroup.story.approval_blocking_reasons || []
    : []
  const selectedCompletionSortDate = selectedGroup
    ? selectedGroup.type === 'series'
      ? selectedGroup.completionSortDate
      : selectedGroup.story.completion_sort_date
    : null
  const selectedCompletionSortSource = selectedGroup
    ? selectedGroup.type === 'series'
      ? selectedGroup.completionSortSource
      : selectedGroup.story.approval_entry_reason || null
    : null
  const selectedTotalMinutes = selectedStories.reduce((sum, story) => sum + (story.duration_mins || 0), 0)
  const selectedAverageMinutes = selectedIsSeries && selectedStories.length > 0 ? Math.round(selectedTotalMinutes / selectedStories.length) : 0
  const selectedPanelIsSimplified = activePipelineTab === 'approved_ready' || activePipelineTab === 'published' || activePipelineTab === 'production_queue' || activePipelineTab === 'repair_shop' || activePipelineTab === 'cold_storage'
  const selectedMarkedForDeletion = selectedStories.some((story) => markedForDeletionIds[story.id])
  const selectedCanShowRemasterCopy = selectedStories.some((story) =>
    isRemasterCandidateState(effectiveWorkflowState(story)) &&
    productionStandardForStory(story).standard === 'remaster_candidate'
  )
  const selectedSeriesDescription = selectedIsSeries ? seriesDescriptionForReview(selectedGroup, selectedAllStories) : null
  const selectedShortDescription = selectedIsSeries ? selectedSeriesDescription?.text || '' : selectedFirst?.description || ''
  const selectedNarrator = selectedIsSeries ? firstNarratorLabel(selectedAllStories) : selectedFirst ? narratorLabel(selectedFirst) : 'Narrator pending'
  const selectedReviewCompleteCount = selectedAllStories.filter(
    (story) => ['no_repair', 'finished'].includes(effectiveEpisodeRepairMark(story).reviewState)
  ).length
  const selectedAllReviewed = selectedAllStories.length > 0 && selectedReviewCompleteCount === selectedAllStories.length
  const selectedHasRepair = selectedAllStories.some((story) => {
    const mark = effectiveEpisodeRepairMark(story)
    return mark.needed === true && ['needs_repair', 'finished'].includes(mark.reviewState)
  })
  const selectedCanApprove = selectedAllReviewed && !selectedHasRepair
  const selectedCanRepair = selectedAllReviewed && selectedHasRepair
  const selectedReviewGateMessage = !selectedAllReviewed
    ? `Review all ${selectedAllStories.length || 1} episode${(selectedAllStories.length || 1) === 1 ? '' : 's'} to enable`
    : selectedHasRepair
      ? 'Issues found: send to repair or move to cold storage.'
      : 'Reviewed clean: ready to publish or move to cold storage.'
  const thisEpisodeIsActive = (story: Story) => !focusedReviewStoryId || focusedReviewStoryId === story.id
  const focusedStoryVisible = focusedReviewStoryId ? selectedStories.some((story) => story.id === focusedReviewStoryId) : false
  const visibleSelectedStories = focusedReviewStoryId && focusedStoryVisible
    ? selectedStories.filter((story) => story.id === focusedReviewStoryId)
    : selectedStories

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
    const message = activePipelineTab === 'repair_shop'
      ? `Move ${selectedFirst.title} to Cold Storage? This will stop all repair attempts.`
      : `Move "${selectedFirst.title}" to Cold Storage?`
    if (window.confirm(message)) {
      setWorkflowState(selectedFirst, 'cold_storage', { retire: effectiveWorkflowState(selectedFirst) === 'published' })
    }
  }

  async function removeStoryFromProductionQueue(story: Story) {
    if (!window.confirm(`Move ${story.title} to Cold Storage? It will be removed from the production queue.`)) return
    await setWorkflowState(story, 'cold_storage')
    setActivePipelineTab('production_queue')
    setSeriesFilter('all')
  }

  async function promoteStoryToNext(story: Story) {
    try {
      const res = await fetch('/api/admin/content-approval?action=set_production_priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, priority: 1 }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        alert(`Promote failed: ${result.error || `HTTP ${res.status}`}`)
        return
      }
      await fetchStories()
      setActivePipelineTab('production_queue')
      setSeriesFilter('all')
    } catch (err) {
      alert('Promote failed: ' + String(err))
    }
  }

  async function moveSelectedToRepairShop() {
    if (!selectedGroup || !selectedFirst) return
    if (selectedGroup.type === 'series' && selectedIsSeries) {
      moveSeriesToRepairShop(selectedGroup)
      return
    }
    // ATL-PIPE-007: Standalone repair path must call API, not just set UI state
    // Make the repair queue state change persistent via setWorkflowState, matching series behavior
    const repairChecklist = emptyRepairChecklist()
    const repairNotes = 'Story moved to repair queue via approval panel "Move to Repair Shop" action without specific items marked.\n\nReview and add repair items via repair intake workflow.'
    
    if (!window.confirm(`Move "${selectedFirst.title}" to Repair Shop?`)) return
    
    try {
      await setWorkflowState(selectedFirst, 'repair_queue', { repairChecklist, repairNotes })
      await fetchStories()
    } catch (err) {
      alert(`Failed to move story to repair shop: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function setSelectedProductionStandard(productionStandard: ProductionStandardValue) {
    if (selectedStories.length === 0) return
    const storyIds = selectedStories.map((story) => story.id)
    try {
      const updates = await Promise.all(storyIds.map(async (storyId) => {
        const res = await fetch('/api/admin/content-approval?action=set_production_standard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            story_id: storyId,
            production_standard: productionStandard,
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || !result.success) {
          throw new Error(result.error || `HTTP ${res.status}`)
        }
        return result.story as Pick<Story, 'id' | 'production_standard' | 'production_standard_updated_at' | 'production_standard_updated_by'>
      }))
      const updatesById = new Map(updates.map((story) => [story.id, story]))
      setStories((prev) => prev.map((story) => updatesById.has(story.id) ? { ...story, ...updatesById.get(story.id) } : story))
    } catch (err) {
      alert('Production standard update failed: ' + (err instanceof Error ? err.message : String(err)))
      throw err
    }
  }

  return (
    <div className="approval-page" style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '24px 28px', color: '#1F2937' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .approval-mobile-selector,
        .approval-mobile-episodes {
          display: none;
        }
        @keyframes approvalPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.52; transform: scale(0.78); }
        }
        @keyframes approvalSpin {
          to { transform: rotate(360deg); }
        }
        .approval-pulse-dot {
          animation: approvalPulse 1.15s ease-in-out infinite;
        }
        .approval-spin-dot {
          animation: approvalSpin 0.9s linear infinite;
        }
        @media (max-width: 768px) {
          .approval-page {
            padding: 14px 12px 96px !important;
            overflow-x: hidden !important;
          }
          .approval-page * {
            max-width: 100%;
            box-sizing: border-box;
          }
          .approval-header {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .approval-header-actions {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .approval-title {
            font-size: 22px !important;
            line-height: 1.15 !important;
          }
          .approval-subtitle {
            font-size: 12px !important;
            line-height: 1.35 !important;
          }
          .approval-pipeline-inner {
            flex-wrap: wrap !important;
            overflow-x: visible !important;
            padding: 10px !important;
            gap: 8px !important;
          }
          .approval-pipeline-step {
            flex: 1 1 calc(50% - 8px) !important;
            min-width: 0 !important;
            min-height: 64px !important;
            padding: 10px !important;
          }
          .approval-pipeline-arrow {
            display: none !important;
          }
          .approval-panels { flex-direction: column !important; }
          .approval-left-panel {
            display: none !important;
          }
          .approval-mobile-selector {
            display: block !important;
            margin-top: 14px !important;
            padding: 12px !important;
            border-radius: 10px !important;
            background-color: #ffffff !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important;
          }
          .approval-detail-main {
            width: 100% !important;
            padding: 14px !important;
          }
          .approval-detail-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .approval-detail-cover {
            width: 100% !important;
            height: auto !important;
            aspect-ratio: 16 / 9 !important;
          }
          .approval-detail-title {
            font-size: 20px !important;
            line-height: 1.18 !important;
            overflow-wrap: anywhere !important;
          }
          .approval-series-actions {
            width: 100% !important;
            justify-content: stretch !important;
          }
          .approval-series-actions > button,
          .approval-series-actions > div {
            width: 100% !important;
          }
          .approval-desktop-episodes {
            display: none !important;
          }
          .approval-mobile-episodes {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            margin-top: 12px !important;
          }
          .approval-mobile-episode-card {
            border: 1px solid #E5E7EB !important;
            border-radius: 10px !important;
            background: #ffffff !important;
            padding: 12px !important;
          }
          .approval-mobile-episode-title {
            color: #111827 !important;
            font-size: 15px !important;
            font-weight: 900 !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
          }
          .approval-mobile-meta-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            margin-top: 10px !important;
          }
          .approval-mobile-meta-box {
            min-width: 0 !important;
            border-radius: 8px !important;
            background: #F9FAFB !important;
            padding: 8px !important;
          }
          .approval-mobile-actions {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 12 !important;
            margin: 12px -12px -12px !important;
            padding: 10px 12px max(10px, env(safe-area-inset-bottom)) !important;
            border-top: 1px solid #E5E7EB !important;
            background: rgba(255,255,255,0.98) !important;
          }
          .approval-mobile-actions > div {
            grid-template-columns: 1fr !important;
          }
          .approval-mobile-actions button {
            width: 100% !important;
            min-height: 44px !important;
            font-size: 13px !important;
          }
          .approval-editor-panel {
            width: 100vw !important;
          }
          .approval-repair-panel {
            padding: 16px 12px !important;
            overflow-x: hidden !important;
          }
          .approval-repair-header {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .approval-repair-meta-grid,
          .approval-repair-issue-grid,
          .approval-repair-comments-grid {
            grid-template-columns: 1fr !important;
          }
          .approval-repair-issue-grid > div:nth-child(1),
          .approval-repair-issue-grid > div:nth-child(2),
          .approval-repair-comments-grid > div:nth-child(1),
          .approval-repair-comments-grid > div:nth-child(2) {
            display: none !important;
          }
        }
      ` }} />

      <div style={{ maxWidth: 'none', margin: 0 }}>
        <div className="approval-header" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <h1 className="approval-title" style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1F2937', letterSpacing: 0 }}>
              Content Approval & Workflow
            </h1>
            <p className="approval-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6B7280' }}>
              Manage the complete content lifecycle from review to publication
            </p>
          </div>
          <div className="approval-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9CA3AF', fontSize: '11px' }}>
            <span>Last updated: {lastUpdated || 'Never'}</span>
            <button type="button" onClick={fetchStories} title="Refresh" style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', color: '#6B7280', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>
              ↻
            </button>
          </div>
        </div>

        {repairQueueItemCount > 0 && !repairQueueBannerDismissed && (
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #FED7AA', backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: '12px', fontWeight: 900 }}>
            <span>Repair Queue: {repairQueueItemCount} item(s) need attention — view in Production Console</span>
            <button
              type="button"
              onClick={() => setRepairQueueBannerDismissed(true)}
              aria-label="Dismiss repair queue notice"
              style={{ width: '24px', height: '24px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#9A3412', cursor: 'pointer', fontSize: '14px', fontWeight: 900, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}

        <div ref={pipelineRef} style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
            <div style={{ color: '#6B7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workflow Pipeline</div>
            {activePipelineTab === 'approved_ready' && (
              <button
                type="button"
                onClick={publishAllApproved}
                disabled={activeWorkflowCount === 0}
                style={{
                  padding: '7px 11px',
                  borderRadius: '8px',
                  border: '1px solid #10B981',
                  backgroundColor: activeWorkflowCount === 0 ? '#F3F4F6' : '#ECFDF5',
                  color: activeWorkflowCount === 0 ? '#9CA3AF' : '#047857',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: activeWorkflowCount === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: activeWorkflowCount === 0 ? 'none' : '0 8px 18px rgba(16,185,129,0.12)',
                }}
              >
                [ Publish All ]
              </button>
            )}
          </div>
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
                  {index < STREAMING_PIPELINE.length - 1 && <span className="approval-pipeline-arrow" style={{ color: '#D1D5DB', fontSize: '18px', alignSelf: 'center', flex: '0 0 auto' }}>›</span>}
                </Fragment>
              )
            })}
          </div>
        </div>

        {activePipelineTab !== 'production_queue' && <div className="approval-mobile-selector">
          <label style={{ display: 'block', color: '#374151', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '7px' }}>
            {activeWorkflow.label} ({activeWorkflowCount})
          </label>
          <select
            value={selectedGroup?.key || ''}
            onChange={(event) => {
              setSelectedSeriesKey(event.target.value || null)
              setOpenRepairSeriesKey(null)
              setSeriesActionsOpen(false)
            }}
            style={{ width: '100%', minHeight: '44px', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '0 10px', color: '#111827', backgroundColor: '#ffffff', fontSize: '15px', fontWeight: 800 }}
          >
            {seriesGroups.length === 0 && <option value="">{activeEmptyMessage}</option>}
            {seriesGroups.map((group) => {
              const trueSeries = isTrueSeriesGroup(group)
              const label = group.type === 'series' ? group.title : group.story.title
              return (
                <option key={group.key} value={group.key}>
                  {trueSeries ? 'Series' : 'Standalone'}: {label} ({groupEpisodeCountForTab(group, activePipelineTab)})
                </option>
              )
            })}
          </select>
          {selectedGroup && selectedFirst && (
            <div style={{ marginTop: '8px', color: '#6B7280', fontSize: '12px', lineHeight: 1.35 }}>
              {selectedIsSeries ? `${selectedExpected} total episodes • ${selectedPresent} present` : `Standalone • ${selectedFirst.duration_mins || 0}m`} • {selectedFirst.genre || 'No genre'}
            </div>
          )}
        </div>}

        {activePipelineTab === 'repair_shop' && (
          <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
            <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #FED7AA', backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: '12px', fontWeight: 900 }}>
              Repair Queue is processed before new Production Queue stories begin.
            </div>
            {activelyRepairedStory && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#1E40AF', fontSize: '13px', fontWeight: 900 }}>
                Hal is currently repairing: {activelyRepairedStory.title}
              </div>
            )}
          </div>
        )}

        {activePipelineTab === 'production_queue' && (
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${repairQueueItemCount > 0 ? '#FED7AA' : '#A7F3D0'}`, backgroundColor: repairQueueItemCount > 0 ? '#FFF7ED' : '#ECFDF5', color: repairQueueItemCount > 0 ? '#9A3412' : '#047857', fontSize: '12px', fontWeight: 900 }}>
              {repairQueueItemCount > 0
                ? `Production paused - ${repairQueueItemCount} stories in Repair Queue`
                : `Production active - next up: ${nextProductionStory?.title || 'nothing queued'}`}
            </div>
            <div style={{ display: 'inline-flex', border: '1px solid #D1D5DB', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
              {[
                ['production_order', 'Production Order'],
                ['by_episodes', 'By Episodes'],
              ].map(([value, label]) => {
                const active = productionQueueView === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setProductionQueueView(value as ProductionQueueView)
                      setSelectedSeriesKey(null)
                    }}
                    style={{
                      minHeight: '36px',
                      padding: '0 12px',
                      border: 'none',
                      borderRight: value === 'production_order' ? '1px solid #D1D5DB' : 'none',
                      backgroundColor: active ? '#0F172A' : '#ffffff',
                      color: active ? '#ffffff' : '#374151',
                      fontSize: '12px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ATL-CONS-001 Phase C: Incomplete Series Hard Block Panel */}
        {activePipelineTab === 'ready_for_review' && blockedSeriesItems.length > 0 && (
          <div style={{ marginBottom: '16px', border: '1px solid #FCA5A5', borderRadius: '10px', backgroundColor: '#FFF5F5', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span style={{ color: '#991B1B', fontSize: '13px', fontWeight: 700 }}>
                Incomplete Series — Blocked from Review ({blockedSeriesItems.length})
              </span>
            </div>
            <div style={{ color: '#7F1D1D', fontSize: '12px', marginBottom: '10px' }}>
              These series cannot be reviewed until all episodes are in Ready for Review. Series approval requires a complete set.
            </div>
            {blockedSeriesItems.map((item: any, idx: number) => (
              <div key={item.seriesId || idx} style={{ backgroundColor: '#FEE2E2', borderRadius: '6px', padding: '10px 12px', marginBottom: '6px' }}>
                <div style={{ color: '#7F1D1D', fontSize: '13px', fontWeight: 700 }}>{item.title || item.seriesName || 'Unknown Series'}</div>
                <div style={{ color: '#991B1B', fontSize: '12px', marginTop: '3px' }}>
                  {item._blockReason || 'Series incomplete'}
                </div>
                {item._seriesGate && (
                  <div style={{ color: '#B91C1C', fontSize: '11px', marginTop: '2px' }}>
                    {item._seriesGate.totalPresent} of {item._seriesGate.totalExpected} episodes in queue
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activePipelineTab === 'production_queue' && (
          <section style={{ marginTop: '16px', backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ color: '#374151', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
                Production Queue ({activeWorkflowCount})
              </div>
              <input
                type="text"
                value={seriesSearch}
                onChange={(e) => setSeriesSearch(e.target.value)}
                placeholder="Search queue..."
                style={{ flex: '1 1 280px', maxWidth: '420px', height: '34px', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0 10px', color: '#374151', fontSize: '12px' }}
              />
            </div>

            <div style={{ marginTop: '14px', padding: '11px 13px', borderRadius: '8px', border: '1px solid #BAE6FD', backgroundColor: '#F0F9FF', color: '#075985', display: 'grid', gap: '9px', fontSize: '12px', lineHeight: 1.35 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                <span
                  className={halIsWorking ? 'approval-spin-dot' : undefined}
                  style={{
                    width: '14px',
                    height: '14px',
                    marginTop: '1px',
                    borderRadius: '999px',
                    border: halIsWorking ? '2px solid #38BDF8' : 'none',
                    borderTopColor: halIsWorking ? 'transparent' : undefined,
                    backgroundColor: halIsWorking ? 'transparent' : '#94A3B8',
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ minWidth: 0, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 950 }}>Hal is working on:</span>
                  <span style={{ color: halIsWorking ? '#0F172A' : '#475569', fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {halStatusText}
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #BAE6FD', paddingTop: '9px', display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                <span
                  className={runnerIsActive ? 'approval-spin-dot' : undefined}
                  style={{
                    width: '14px',
                    height: '14px',
                    marginTop: '1px',
                    borderRadius: '999px',
                    border: runnerIsActive ? '2px solid #38BDF8' : 'none',
                    borderTopColor: runnerIsActive ? 'transparent' : undefined,
                    backgroundColor: runnerIsActive ? 'transparent' : '#94A3B8',
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ minWidth: 0, display: 'grid', gap: '2px' }}>
                  <span style={{ fontWeight: 950 }}>Runners: ({runnerWorkerLabel}) · {queuedRunnerJobCount} queued</span>
                  {(() => {
                    const WORKER_NAMES: Record<string, string> = {
                      'worker-1': 'Larry',
                      'worker-2': 'Curly',
                      'worker-3': 'Moe',
                      'worker-4': 'Groucho',
                    }
                    // Always show all known workers, active or idle
                    const RUNNER_BUDGET_S = 800
                    const allWorkerKeys = ['worker-1', 'worker-2', 'worker-3', 'worker-4']
                    const workerById = Object.fromEntries(runnerWorkers.map(w => [w.id, w]))
                    const fmtRemaining = (lockedAt: string | null | undefined) => {
                      if (!lockedAt) return ''
                      const elapsedS = Math.floor((Date.now() - new Date(lockedAt).getTime()) / 1000)
                      const remainS = Math.max(0, RUNNER_BUDGET_S - elapsedS)
                      if (remainS === 0) return ' · finishing up'
                      const m = Math.floor(remainS / 60)
                      const s = remainS % 60
                      return m > 0 ? ` · ${m}m ${s}s remaining` : ` · ${s}s remaining`
                    }
                    return allWorkerKeys.map(key => {
                      const workerId = `production-runner:${key}`
                      const worker = workerById[workerId]
                      const name = WORKER_NAMES[key] || key
                      const isActive = worker && worker.lease_holder && worker.last_heartbeat_at &&
                        Date.now() - new Date(worker.last_heartbeat_at).getTime() <= 15 * 60 * 1000
                      const activeJob = isActive
                        ? activeRunnerJobs.find(s => s.source_job?.locked_by === workerId) || null
                        : null
                      const timeStr = activeJob ? fmtRemaining(activeJob.source_job?.locked_at) : ''
                      return (
                        <span key={key} style={{ color: isActive ? '#0F172A' : '#94A3B8', fontWeight: 800, overflowWrap: 'anywhere' }}>
                          {name}: {isActive
                            ? (activeJob
                                ? `${activeJob.title} — ${activeJob.source_job?.current_step || 'processing'}${timeStr}`
                                : 'Active — picking up next job')
                            : (worker ? 'Idle' : 'Not yet started')}
                        </span>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
              {seriesGroups.map((group, index) => {
                const groupStories = group.type === 'series' ? group.stories : [group.story]
                const productionStories = productionQueueStoriesForGroup(group)
                const cardStories = productionQueueCardStories(group)
                const firstStory = cardStories[0] || groupStories[0]
                const trueSeries = isTrueSeriesGroup(group)
                const expected = trueSeries ? groupExpectedCount(group) : 1
                const queueEpisodeCount = cardStories.length
                const queueDuration = cardStories.reduce((sum, story) => sum + (story.duration_mins || 0), 0)
                const groupTitle = productionQueueCardTitle(group)
                const queueGenre = firstStory?.genre || groupStories.find((story) => story.genre)?.genre || 'No genre'
                const productionPriority = groupProductionPriority(group)
                const primaryProductionStory = productionStories[0]
                const activeJob = activeProductionJobForStories(cardStories)
                const duplicateTitle = (productionQueueTitleCounts[normalizedDuplicateTitle(groupTitle)] || 0) > 1
                const metadata = `${queueEpisodeCount} episode${queueEpisodeCount === 1 ? '' : 's'}${trueSeries && expected !== queueEpisodeCount ? ` of ${expected}` : ''} · ${queueDuration || '—'}m · ${queueGenre}`

                return (
                  <article
                    key={group.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      minHeight: '72px',
                      padding: '11px 12px',
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      backgroundColor: productionPriority > 0 ? '#FFFBEB' : '#ffffff',
                    }}
                  >
                    <span style={{ width: '38px', height: '38px', borderRadius: '999px', backgroundColor: productionPriority > 0 ? '#F59E0B' : '#E5E7EB', color: productionPriority > 0 ? '#7C2D12' : '#4B5563', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 950, flex: '0 0 auto' }}>
                      #{index + 1}
                    </span>
                    <div style={{ width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                      <img src={firstStory?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <div style={{ color: '#111827', fontSize: '15px', fontWeight: 900, lineHeight: 1.25, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                        {groupTitle}
                      </div>
                      {duplicateTitle && firstStory && (
                        <div style={{ color: '#6B7280', fontSize: '10px', marginTop: '2px', fontWeight: 800 }}>
                          ID: {shortStoryId(firstStory)}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '5px', color: '#4B5563', fontSize: '12px', lineHeight: 1.35, fontWeight: 750 }}>
                        <span>{metadata}</span>
                        <span>{firstStory ? submittedDateLabel(firstStory) : 'Submitted date unknown'}</span>
                        {showsInProductionBadge(activeJob) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minHeight: '22px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', fontSize: '11px', fontWeight: 900 }}>
                            <span className="approval-pulse-dot" style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: '#22C55E', flex: '0 0 auto' }} />
                            In Production
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: '22px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#E0F2FE', color: '#075985', border: '1px solid #BAE6FD', fontSize: '11px', fontWeight: 900 }}>
                            {firstStory ? workflowStateLabel(firstStory) : 'Queued'}
                          </span>
                        )}
                        {duplicateTitle && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: '22px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', fontSize: '11px', fontWeight: 900 }}>
                            ⚠ Duplicate
                          </span>
                        )}
                        {productionPriority > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: '22px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', fontSize: '11px', fontWeight: 900 }}>
                            Next Up
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px', fontWeight: 800 }}>
                        {queuePositionLabel(index + 1)}
                      </div>
                    </div>
                    <div style={{ flex: '1 1 28px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flex: '0 0 auto', flexWrap: 'wrap' }}>
                      {primaryProductionStory && (
                        <button
                          type="button"
                          onClick={() => promoteStoryToNext(primaryProductionStory)}
                          style={{ ...actionButtonStyle('primary'), minHeight: '30px', padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                        >
                          Promote
                        </button>
                      )}
                      {primaryProductionStory && (
                        <button
                          type="button"
                          onClick={() => removeStoryFromProductionQueue(primaryProductionStory)}
                          style={{ ...actionButtonStyle('danger'), minHeight: '30px', padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
              {seriesGroups.length === 0 && (
                <div style={{ padding: '36px 8px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>{activeEmptyMessage}</div>
              )}
            </div>
            <div style={{ marginTop: '12px', color: '#9CA3AF', fontSize: '10px' }}>
              {seriesGroups.length > 0 ? `Showing 1 to ${seriesGroups.length} production queue item(s)` : activeEmptyMessage}
            </div>
          </section>
        )}

        {(activePipelineTab as WorkflowLane) !== 'production_queue' && <div className="approval-panels" style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <aside className="approval-left-panel" style={{ flex: '0 0 30%', minWidth: '280px', maxWidth: '380px', backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ color: '#374151', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{activeWorkflow.label} ({activeWorkflowCount})</div>
              <button type="button" onClick={() => console.log('new series')} style={{ border: 'none', background: 'transparent', color: '#E8722A', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>+ New Series</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <input type="text" value={seriesSearch} onChange={(e) => setSeriesSearch(e.target.value)} placeholder="🔍 Search series..." style={{ flex: activePipelineTab === 'production_queue' ? '1 1 100%' : '1 1 60%', height: '32px', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0 9px', color: '#374151', fontSize: '12px' }} />
              {activePipelineTab !== 'production_queue' && (
                <select value={seriesFilter} onChange={(e) => {
                  const next = e.target.value as WorkflowFilter
                  setSeriesFilter(next)
                  if (next !== 'all') {
                    setActivePipelineTab(next)
                    setSelectedSeriesKey(null)
                    setOpenRepairSeriesKey(null)
                    setSeriesActionsOpen(false)
                  }
                }} style={{ flex: '0 0 35%', height: '32px', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0 7px', color: '#374151', backgroundColor: '#ffffff', fontSize: '12px' }}>
                  <option value="all">This Workflow</option>
                  {STREAMING_PIPELINE.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
              {seriesGroups.map((group, index) => {
                const groupStories = group.type === 'series' ? group.stories : [group.story]
                const productionStories = activePipelineTab === 'production_queue' ? productionQueueStoriesForGroup(group) : []
                const cardStories = productionStories.length > 0 ? productionStories : groupStories
                const firstStory = cardStories[0] || groupStories[0]
                const trueSeries = isTrueSeriesGroup(group)
                const expected = trueSeries ? groupExpectedCount(group) : 1
                const present = trueSeries ? groupPresentCount(group) : 1
                const queueEpisodeCount = activePipelineTab === 'production_queue' ? cardStories.length : present
                const queueDuration = activePipelineTab === 'production_queue'
                  ? cardStories.reduce((sum, story) => sum + (story.duration_mins || 0), 0)
                  : firstStory?.duration_mins || 0
                const groupTitle = activePipelineTab === 'production_queue'
                  ? trueSeries
                    ? displaySeriesTitle(cardStories)
                    : String(firstStory?.title || firstStory?.series_name || 'Untitled Story')
                  : group.type === 'series' ? group.title : group.story.title
                const queueGenre = firstStory?.genre || groupStories.find((story) => story.genre)?.genre || 'No genre'
                const currentCount = groupEpisodeCountForTab(group, activePipelineTab)
                const productionPosition = activePipelineTab === 'production_queue' ? index + 1 : null
                const productionPriority = activePipelineTab === 'production_queue' ? groupProductionPriority(group) : 0
                const primaryProductionStory = activePipelineTab === 'production_queue' ? productionStories[0] : null
                const selected = selectedSeriesKey === group.key
                return (
                  <button key={group.key} type="button" onClick={() => setSelectedSeriesKey(group.key)} style={{ minHeight: activePipelineTab === 'cold_storage' ? '90px' : '64px', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 8px', borderRadius: '6px', border: 'none', borderLeft: selected ? '3px solid #E8722A' : '3px solid transparent', backgroundColor: selected ? '#FFF7ED' : '#ffffff', cursor: 'pointer', textAlign: 'left' }} onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#F9FAFB' }} onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = '#ffffff' }}>
                    {productionPosition && (
                      <span style={{ width: '34px', height: '34px', borderRadius: '999px', backgroundColor: productionPriority > 0 ? '#F59E0B' : '#E5E7EB', color: productionPriority > 0 ? '#7C2D12' : '#4B5563', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 950, flex: '0 0 auto' }}>
                        #{productionPosition}
                      </span>
                    )}
                    <div style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                      <img src={firstStory?.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <div style={{ color: '#1F2937', fontSize: '13px', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupTitle}</div>
                      {activePipelineTab === 'production_queue' ? (
                        <>
                          <div style={{ color: '#4B5563', fontSize: '10px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>
                            Episodes: {queueEpisodeCount}{trueSeries && expected !== queueEpisodeCount ? ` of ${expected}` : ''} • Duration: {queueDuration || '—'}m • Genre: {queueGenre}
                          </div>
                          {productionPriority > 0 && (
                            <div style={{ color: '#B45309', fontSize: '10px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>Priority: explicit #{productionPriority}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstStory?.genre || 'No genre'} • {firstStory?.author || 'Unknown'}{(() => { const d = group.type === 'series' ? group.completionSortDate : (group as any).story?.completion_sort_date; return d ? ` • ${new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '' })()}</div>
                          <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '3px' }}>{trueSeries ? `Series • ${expected} episodes • ${present} present` : `Standalone • ${firstStory?.duration_mins || 0}m`}</div>
                        </>
                      )}
                      {activePipelineTab === 'cold_storage' && (
                        <>
                          {firstStory?.updated_at && (
                            <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {'Archived '}
                              {new Date(firstStory.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          )}
                          {firstStory?.description && (
                            <div style={{ color: '#9CA3AF', fontSize: '10px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {firstStory.description.split(' ').slice(0, 10).join(' ')}
                              {firstStory.description.split(' ').length > 10 ? '\u2026' : ''}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: '0 0 auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {activePipelineTab === 'production_queue' && primaryProductionStory && (
                        <>
                          {productionQueueView === 'production_order' && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation()
                                promoteStoryToNext(primaryProductionStory)
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                event.stopPropagation()
                                promoteStoryToNext(primaryProductionStory)
                              }}
                              style={{ ...actionButtonStyle('primary'), minHeight: '24px', padding: '4px 7px', fontSize: '10px', lineHeight: 1.1 }}
                            >
                              Promote
                            </span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              removeStoryFromProductionQueue(primaryProductionStory)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              event.stopPropagation()
                              removeStoryFromProductionQueue(primaryProductionStory)
                            }}
                            style={{ ...actionButtonStyle('danger'), minHeight: '24px', padding: '4px 7px', fontSize: '10px', lineHeight: 1.1 }}
                          >
                            Remove
                          </span>
                        </>
                      )}
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

          <main className="approval-detail-main" style={{ flex: '1 1 70%', minWidth: 0, backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px' }}>
            {!selectedGroup && (
              <div style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '30px', color: '#D1D5DB' }}>▦</div>
                <div>{activeEmptyMessage}</div>
              </div>
            )}
            {selectedGroup && selectedFirst && (
              <>
                <div className="approval-detail-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div className="approval-detail-cover" style={{ width: '100px', height: '70px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                    <img src={selectedFirst.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    {!selectedPanelIsSimplified && (
                      <button type="button" onClick={() => setEpisodeCoverOpen(selectedFirst.id, true)} title="Change cover" style={{ border: 'none', background: 'transparent', color: '#9CA3AF', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '3px' }}>✎</button>
                    )}
                    <div className="approval-detail-title" style={{ color: '#1F2937', fontSize: activePipelineTab === 'production_queue' ? '24px' : '20px', fontWeight: 800, lineHeight: 1.15 }}>{selectedTitle}</div>
                    <div style={{ marginTop: '5px', color: '#6B7280', fontSize: '12px' }}>Author: {selectedFirst.author || 'Unknown'}</div>
                    <div style={{ marginTop: '4px', color: '#9CA3AF', fontSize: '11px' }}>
                      Narrator: {selectedNarrator}
                    </div>
                    {activePipelineTab === 'cold_storage' && selectedFirst.updated_at && (
                      <div style={{ marginTop: '4px', color: '#9CA3AF', fontSize: '11px' }}>
                        {'Archived: '}
                        {new Date(selectedFirst.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                    <div style={{ marginTop: '4px', color: '#9CA3AF', fontSize: '11px' }}>
                      {selectedIsSeries
                        ? `${selectedExpected} episode${selectedExpected === 1 ? '' : 's'} • ${selectedTotalMinutes}m total • ${selectedAverageMinutes}m average`
                        : `${selectedFirst.duration_mins || 0}m total`}
                    </div>
                    {activePipelineTab === 'published' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#166534', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: '#22C55E' }} />
                        Live
                      </div>
                    )}
                    {selectedShortDescription && (
                      <div style={{ marginTop: activePipelineTab === 'production_queue' ? '12px' : '8px', color: '#374151', fontSize: activePipelineTab === 'production_queue' ? '15px' : '12px', lineHeight: 1.5, maxWidth: activePipelineTab === 'production_queue' ? '940px' : '760px', fontWeight: activePipelineTab === 'production_queue' ? 600 : 400 }}>
                        {selectedShortDescription}
                      </div>
                    )}
                    {activePipelineTab === 'production_queue' && (
                      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', maxWidth: '820px' }}>
                        {[
                          ['Queue #', selectedGroup && productionQueueView === 'production_order' && productionQueuePositionForGroup(selectedGroup) ? `#${productionQueuePositionForGroup(selectedGroup)}` : productionQueuePosition(stories, selectedFirst) ? `#${productionQueuePosition(stories, selectedFirst)}` : '—'],
                          ['Priority', selectedGroup && groupProductionPriority(selectedGroup) > 0 ? `Explicit #${groupProductionPriority(selectedGroup)}` : 'Default order'],
                          ['Series / Episodes', selectedIsSeries ? `${selectedTitle} • ${selectedPresent || selectedStories.length} ep` : 'Standalone • 1 ep'],
                          ['Duration', selectedIsSeries ? `${selectedTotalMinutes || '—'} min total` : storyDurationLabel(selectedFirst)],
                          ['Genre', selectedFirst.genre || '—'],
                          ['Recommended by', recommendedByLabel(selectedFirst)],
                        ].map(([label, value]) => (
                          <div key={label} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#F9FAFB', padding: '8px 10px', minWidth: 0 }}>
                            <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                            <div style={{ marginTop: '4px', color: '#111827', fontSize: '16px', fontWeight: 850, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activePipelineTab === 'repair_shop' && (
                      <div style={{ marginTop: '12px', display: 'grid', gap: '8px', maxWidth: '820px' }}>
                        <div style={{ border: '1px solid #FED7AA', borderRadius: '8px', backgroundColor: '#FFF7ED', padding: '10px 12px' }}>
                          <div style={{ color: '#9A3412', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Repair status</div>
                          <div style={{ marginTop: '4px', color: '#7C2D12', fontSize: '13px', fontWeight: 900 }}>{repairSubstate(selectedFirst)}</div>
                        </div>
                        <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#F9FAFB', padding: '10px 12px' }}>
                          <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Failure reason / repair target</div>
                          <div style={{ marginTop: '4px', color: '#111827', fontSize: '12px', fontWeight: 700, lineHeight: 1.4 }}>{productionJobErrorLabel(selectedFirst)}</div>
                          <div style={{ marginTop: '6px', color: '#6B7280', fontSize: '11px' }}>
                            Entered repair: {repairEnteredDate(selectedFirst) ? new Date(repairEnteredDate(selectedFirst)!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </div>
                        </div>
                      </div>
                    )}
                    {activePipelineTab === 'cold_storage' && (
                      <div style={{ marginTop: '12px', border: '1px solid #E5E7EB', borderRadius: '8px', backgroundColor: '#F9FAFB', padding: '10px 12px', maxWidth: '820px' }}>
                        <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Cold storage reason</div>
                        <div style={{ marginTop: '4px', color: '#111827', fontSize: '12px', fontWeight: 700, lineHeight: 1.4 }}>{selectedFirst.review_notes || selectedFirst.repair_notes || 'Reason not recorded'}</div>
                      </div>
                    )}
                    {!selectedPanelIsSimplified && selectedApprovalBlockingReasons.length > 0 && (
                      <div style={{ marginTop: '7px', color: '#B45309', fontSize: '11px', fontWeight: 800, lineHeight: 1.35 }}>
                        Review blocked: {selectedApprovalBlockingReasons.slice(0, 3).join('; ')}
                      </div>
                    )}
                    {!selectedPanelIsSimplified && (
                      <details open={selectedApprovalBlockingReasons.length > 0} style={{ marginTop: '8px' }}>
                        <summary style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}>Review Details</summary>
                        <div style={{ marginTop: '7px', display: 'grid', gap: '6px' }}>
                          <StoryIntelligenceStrip
                            stories={selectedStories}
                            deletionMarked={selectedMarkedForDeletion}
                            onSetProductionStandard={setSelectedProductionStandard}
                            onMoveToColdStorage={moveSelectedToColdStorage}
                            onMoveToRepairShop={moveSelectedToRepairShop}
                            onMarkForDeletion={markSelectedForDeletionReview}
                          />
                          <div style={{ color: '#6B7280', fontSize: '10px', lineHeight: 1.35 }}>
                            Approval ready: {selectedApprovalReady ? 'yes' : 'no'} • Completion: {selectedCompletionSortDate || 'not recorded'} • Source: {selectedCompletionSortSource || 'API readiness'}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                  <div ref={seriesActionsRef} className="approval-series-actions" style={{ position: 'relative', flex: '0 0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', maxWidth: '390px' }}>
                    {activePipelineTab === 'cold_storage' ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedIsSeries && selectedGroup?.type === 'series' ? (
                          <button
                            type="button"
                            onClick={() => recoverSeriesFromColdStorage(selectedGroup as Extract<StoryGroup, { type: 'series' }>)}
                            style={actionButtonStyle('success')}
                          >
                            Move to Production Queue
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => recoverFromColdStorage(selectedFirst)}
                            style={actionButtonStyle('success')}
                          >
                            Move to Production Queue
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => selectedGroup && tagIncubator(selectedGroup)}
                          style={actionButtonStyle('muted')}
                        >
                          Move to Incubator
                        </button>
                      </div>
                    ) : activePipelineTab === 'repair_shop' ? (
                      <button type="button" onClick={moveSelectedToColdStorage} style={{ ...actionButtonStyle('danger'), minHeight: '38px', padding: '9px 13px', fontSize: '13px' }}>Move to Cold Storage</button>
                    ) : selectedPanelIsSimplified ? (
                      <>
                        {activePipelineTab === 'production_queue' && (
                          <>
                            {productionQueueView === 'production_order' && (
                              <button
                                type="button"
                                onClick={() => promoteStoryToNext(selectedFirst)}
                                style={{ ...actionButtonStyle('primary'), minHeight: '30px', padding: '6px 10px', fontSize: '11px' }}
                              >
                                Promote
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeStoryFromProductionQueue(selectedFirst)}
                              style={{ ...actionButtonStyle('danger'), minHeight: '30px', padding: '6px 10px', fontSize: '11px' }}
                            >
                              Remove
                            </button>
                          </>
                        )}
                        {activePipelineTab === 'approved_ready' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedIsSeries && selectedGroup.type === 'series') publishSeries(selectedGroup)
                              else publishStory(selectedFirst)
                            }}
                            style={actionButtonStyle('primary')}
                          >
                            Publish to App
                          </button>
                        )}
                        {activePipelineTab === 'published' && selectedIsSeries && selectedGroup.type === 'series' && (
                          <button type="button" onClick={() => requestMoveSeriesToReadyForReview(selectedGroup)} style={actionButtonStyle('danger')}>Unpublish Series</button>
                        )}
                        {activePipelineTab === 'published' && !selectedIsSeries && (
                          <button type="button" onClick={() => unpublishStory(selectedFirst)} style={actionButtonStyle('danger')}>Unpublish Story</button>
                        )}
                      </>
                    ) : (
                    <>
                    {selectedCanShowRemasterCopy && <RemasterCopyUnavailable compact />}
                    <button
                      type="button"
                      disabled={!selectedCanApprove}
                      title={!selectedCanApprove ? selectedReviewGateMessage : undefined}
                      onClick={() => {
                        if (!selectedCanApprove) return
                        if (selectedIsSeries && selectedGroup.type === 'series') setSeriesWorkflowState(selectedGroup, 'approved_ready')
                        else setWorkflowState(selectedFirst, 'approved_ready')
                      }}
                      style={{ ...actionButtonStyle(selectedCanApprove ? 'success' : 'muted'), minHeight: '38px', padding: '9px 13px', fontSize: '13px', opacity: selectedCanApprove ? 1 : 0.55, cursor: selectedCanApprove ? 'pointer' : 'not-allowed' }}
                    >
                      Ready to Publish
                    </button>
                    <button
                      type="button"
                      disabled={!selectedCanRepair}
                      title={!selectedCanRepair ? selectedReviewGateMessage : undefined}
                      onClick={() => {
                        if (!selectedCanRepair) return
                        if (selectedIsSeries && selectedGroup.type === 'series') moveSeriesToRepairShop(selectedGroup)
                        else {
                          const mark = effectiveEpisodeRepairMark(selectedFirst)
                          const repairNotes = mark.notes || selectedFirst.repair_notes || buildStandaloneRepairNotes(mark)
                          setWorkflowState(selectedFirst, 'repair_queue', { repairChecklist: mark.checklist, repairNotes })
                        }
                      }}
                      style={selectedCanRepair
                        ? { ...actionButtonStyle('muted'), minHeight: '38px', padding: '9px 13px', fontSize: '13px', border: '1.5px solid #F97316', backgroundColor: '#FFF7ED', color: '#C2410C', fontWeight: 900 }
                        : { ...actionButtonStyle('muted'), minHeight: '38px', padding: '9px 13px', fontSize: '13px', opacity: 0.55, cursor: 'not-allowed' }}
                    >
                      Send to Repair
                    </button>
                    <button type="button" onClick={moveSelectedToColdStorage} style={{ ...actionButtonStyle('danger'), minHeight: '38px', padding: '9px 13px', fontSize: '13px' }}>Move to Cold Storage</button>
                    {(!selectedCanApprove || !selectedCanRepair) && (
                      <div style={{ flexBasis: '100%', color: '#6B7280', fontSize: '10px', fontWeight: 800, lineHeight: 1.3, textAlign: 'right' }}>
                        {selectedReviewGateMessage}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                </div>

                {!selectedPanelIsSimplified && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#6B7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{selectedIsSeries ? 'Episodes in this series' : 'Story detail'}</span>
                    <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>≡ Total: {selectedStories.length}</span>
                    <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>⏱ {selectedIsSeries ? `${selectedTotalMinutes}m Total Audio` : `${selectedFirst.duration_mins || 0}m Audio`}</span>
                    {selectedIsSeries && <span style={{ color: '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: '#F3F4F6' }}>✓ {selectedPresent} Present</span>}
                    {selectedIsSeries && <span style={{ color: selectedAllReviewed ? '#047857' : '#6B7280', fontSize: '10px', borderRadius: '999px', padding: '4px 8px', backgroundColor: selectedAllReviewed ? '#ECFDF5' : '#F3F4F6' }}>Finished: {selectedReviewCompleteCount}/{selectedAllStories.length}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {focusedReviewStoryId && focusedStoryVisible && (
                      <button type="button" onClick={() => setFocusedReviewStoryId(null)} style={{ border: '1px solid #FED7AA', borderRadius: '999px', backgroundColor: '#FFF7ED', color: '#C2410C', fontSize: '11px', fontWeight: 900, cursor: 'pointer', padding: '5px 9px' }}>Show all episodes</button>
                    )}
                    <button type="button" onClick={() => console.log('view series overview', selectedGroup.key)} style={{ border: 'none', background: 'transparent', color: '#E8722A', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>View Series Overview</button>
                  </div>
                </div>}

                {!selectedPanelIsSimplified && <div className="approval-desktop-episodes" style={{ marginTop: '10px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '27%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ height: '36px', backgroundColor: '#F9FAFB' }}>
                        {['Episode #', 'Duration', 'Cover + Title', 'Change Cover', 'Review Audio'].map((head) => (
                          <th key={head} style={{ padding: '0 10px', color: '#6B7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', textAlign: head === 'Change Cover' || head === 'Review Audio' ? 'right' : 'left' }}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSelectedStories.map((story) => {
                        const storyType = (story as any).story_type || 'story'
                        const audioReady = Boolean(story.audio_url || story.story_audio_url || story.audio_ready || story.story_audio_ready)
                        const isAffectedRepairEpisode = visualWorkflowLane(story) === 'repair_shop'
                        const isNeutralInRepairView = false
                        const lastRepairIssue = firstRepairIssueLabel(story.repair_checklist)
                        const markedForDeletion = markedForDeletionIds[story.id]
                        const coverUrl = episodeCoverUrl(story)
                        const reviewMark = effectiveEpisodeRepairMark(story)
                        const reviewed = reviewMark.reviewState === 'no_repair' || reviewMark.reviewState === 'finished'
                        const needsRepair = reviewMark.needed === true && reviewMark.reviewState === 'finished'
                        const episodeActive = thisEpisodeIsActive(story)
                        return (
                          <Fragment key={story.id}>
                            <tr style={{
                              height: '60px',
                              borderBottom: '1px solid #F3F4F6',
                              backgroundColor: markedForDeletion ? '#F3F4F6' : reviewed ? '#F0FDF4' : isAffectedRepairEpisode ? '#FFF7ED' : '#ffffff',
                              opacity: episodeActive ? (isNeutralInRepairView ? 0.55 : 1) : 0.35,
                              pointerEvents: episodeActive ? undefined : 'none' as React.CSSProperties['pointerEvents'],
                              boxShadow: markedForDeletion ? 'inset 3px 0 0 #6B7280' : reviewed ? 'inset 3px 0 0 #22C55E' : isAffectedRepairEpisode ? 'inset 3px 0 0 #F97316' : undefined,
                            }}>
                              <td style={{ padding: '10px', color: '#1F2937', fontSize: '18px', fontWeight: 800 }}>{story.episode_number || '-'}</td>
                              <td style={{ padding: '10px', color: '#374151', fontSize: '12px' }}>{story.duration_mins ? `${story.duration_mins}m` : '—'}</td>
                              <td style={{ padding: '10px', minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                  <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                                    {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                      <div style={{ color: '#1F2937', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.episode_title || story.title}</div>
                                      {reviewed && <span style={{ flex: '0 0 auto', color: needsRepair ? '#C2410C' : '#047857', backgroundColor: needsRepair ? '#FFF7ED' : '#ECFDF5', border: `1px solid ${needsRepair ? '#FED7AA' : '#A7F3D0'}`, borderRadius: '999px', padding: '2px 6px', fontSize: '10px', fontWeight: 900 }}>{needsRepair ? 'Repair Needed' : 'Reviewed'}</span>}
                                    </div>
                                    {audioReady && <div style={{ color: '#059669', fontSize: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '999px', backgroundColor: '#10B981' }} />Audio ready {storyType ? `(${storyType})` : ''}</div>}
                                    {isAffectedRepairEpisode && <div style={{ color: '#9A3412', fontSize: '10px', fontWeight: 800, marginTop: '4px' }}>This episode is in Repair Shop</div>}
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
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'middle' }}>
                                <button
                                  type="button"
                                  onClick={() => setEpisodeRepairMarks((prev) => ({ ...prev, [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), coverOpen: true } }))}
                                  style={{ padding: '5px 10px', borderRadius: '999px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', color: '#374151', fontSize: '11px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  Change Cover
                                </button>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'middle' }}>
                                {renderEpisodeReviewActions(story)}
                              </td>
                            </tr>
                            {focusedReviewStoryId === story.id && (
                              <tr key={`${story.id}:review`}>
                                <td colSpan={5} style={{ padding: '0 10px 12px 10px', borderBottom: '1px solid #F3F4F6', backgroundColor: '#ffffff' }}>
                                  {renderInlineEpisodeReviewPanel(story)}
                                </td>
                              </tr>
                            )}
                            {reviewMark.coverOpen && (
                              <tr key={`${story.id}:cover`}>
                                <td colSpan={5} style={{ padding: '0 10px 12px 10px', borderBottom: '1px solid #F3F4F6', backgroundColor: '#ffffff' }}>
                                  {renderCoverReviewDetails(story)}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>}
                {!selectedPanelIsSimplified && <div className="approval-mobile-episodes">
                  {visibleSelectedStories.map((story) => {
                    const state = effectiveWorkflowState(story)
                    const lane = visualWorkflowLane(story)
                    const colors = WORKFLOW_COLORS[lane]
                    const storyType = (story as any).story_type || 'story'
                    const audioReady = Boolean(story.audio_url || story.story_audio_url || story.audio_ready || story.story_audio_ready)
                        const isAffectedRepairEpisode = visualWorkflowLane(story) === 'repair_shop'
                        const lastRepairIssue = firstRepairIssueLabel(story.repair_checklist)
                        const markedForDeletion = markedForDeletionIds[story.id]
                        const coverUrl = episodeCoverUrl(story)
                        const reviewMark = effectiveEpisodeRepairMark(story)
                        const reviewed = reviewMark.reviewState === 'no_repair' || reviewMark.reviewState === 'finished'
                        const needsRepair = reviewMark.needed === true && reviewMark.reviewState === 'finished'
                        const episodeActive = thisEpisodeIsActive(story)
                        return (
                          <div key={`mobile:${story.id}`} className="approval-mobile-episode-card" style={{
                        boxShadow: markedForDeletion ? 'inset 3px 0 0 #6B7280' : reviewed ? 'inset 3px 0 0 #22C55E' : isAffectedRepairEpisode ? 'inset 3px 0 0 #F97316' : undefined,
                        backgroundColor: markedForDeletion ? '#F3F4F6' : reviewed ? '#F0FDF4' : '#ffffff',
                        opacity: episodeActive ? 1 : 0.35,
                        pointerEvents: episodeActive ? undefined : 'none' as React.CSSProperties['pointerEvents'],
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#E5E7EB', flex: '0 0 auto' }}>
                              {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>
                              {selectedIsSeries ? `Episode ${story.episode_number || '-'}` : 'Standalone story'}
                            </div>
                            <div className="approval-mobile-episode-title" style={{ marginTop: '4px' }}>{story.episode_title || story.title}</div>
                            {reviewed && <div style={{ display: 'inline-flex', marginTop: '5px', color: needsRepair ? '#C2410C' : '#047857', backgroundColor: needsRepair ? '#FFF7ED' : '#ECFDF5', border: `1px solid ${needsRepair ? '#FED7AA' : '#A7F3D0'}`, borderRadius: '999px', padding: '2px 6px', fontSize: '10px', fontWeight: 900 }}>{needsRepair ? 'Repair Needed' : 'Finished'}</div>}
                            </div>
                          </div>
                          <span style={{ flex: '0 0 auto', display: 'inline-flex', borderRadius: '999px', padding: '5px 9px', backgroundColor: colors.bg, color: colors.text, fontSize: '11px', fontWeight: 900 }}>
                            {workflowDisplayLabel(state)}
                          </span>
                        </div>
                        {effectiveWorkflowState(story) === 'ready_for_review' && lastRepairIssue && (
                          <div style={{ display: 'inline-flex', marginTop: '8px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#ffedd5', color: '#9a3412', fontSize: '11px', fontWeight: 800 }}>
                            Returned from Repair: {lastRepairIssue}
                          </div>
                        )}
                        {markedForDeletion && (
                          <div style={{ display: 'inline-flex', marginTop: '8px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#E5E7EB', color: '#374151', fontSize: '11px', fontWeight: 900 }}>
                            Marked for deletion review
                          </div>
                        )}
                        <div className="approval-mobile-meta-grid">
                          <div className="approval-mobile-meta-box">
                            <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Duration</div>
                            <div style={{ marginTop: '4px', color: '#111827', fontSize: '13px', fontWeight: 800 }}>{story.duration_mins ? `${story.duration_mins}m` : '-'}</div>
                          </div>
                          <div className="approval-mobile-meta-box">
                            <div style={{ color: '#6B7280', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Audio</div>
                            <div style={{ marginTop: '4px', color: audioReady ? '#047857' : '#B45309', fontSize: '13px', fontWeight: 800 }}>
                              {audioReady ? `Ready${storyType ? ` (${storyType})` : ''}` : 'Missing'}
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', color: '#9CA3AF', fontSize: '11px' }}>
                          {isAffectedRepairEpisode ? repairSubstate(story) : workflowSubLabel(state)}
                        </div>
                        <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setEpisodeRepairMarks((prev) => ({ ...prev, [story.id]: { ...(prev[story.id] || episodeRepairMarkDefault()), coverOpen: true } }))}
                            style={{ padding: '7px 10px', borderRadius: '999px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', color: '#374151', fontSize: '11px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', width: '100%' }}
                          >
                            Change Cover
                          </button>
                          {renderEpisodeReviewActions(story)}
                        </div>
                        {reviewMark.coverOpen && <div style={{ marginTop: '10px' }}>{renderCoverReviewDetails(story)}</div>}
                        {focusedReviewStoryId === story.id && <div style={{ marginTop: '10px', width: '100%', minWidth: 0 }}>{renderInlineEpisodeReviewPanel(story)}</div>}
                      </div>
                    )
                  })}
                </div>}
                {!selectedPanelIsSimplified && <div style={{ marginTop: '12px', color: '#9CA3AF', fontSize: '10px' }}>Showing {visibleSelectedStories.length} of {selectedStories.length} episodes</div>}
              </>
            )}
          </main>
        </div>}
      </div>
      {seriesReadyConfirm && (
        <div role="dialog" aria-modal="true" aria-label="Move series to Ready for Review" style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15,23,42,0.46)' }}>
          <div style={{ width: '100%', maxWidth: '460px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1px solid #E5E7EB', boxShadow: '0 24px 80px rgba(15,23,42,0.28)', padding: '18px' }}>
            <div style={{ color: '#111827', fontSize: '16px', fontWeight: 900 }}>Move Series to Ready for Review</div>
            <div style={{ marginTop: '10px', color: '#374151', fontSize: '13px', lineHeight: 1.45 }}>
              This will remove all episodes in {seriesReadyConfirm.seriesName} from the live app and move the series back to Ready for Review. Audio and covers will be preserved.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button type="button" onClick={() => setSeriesReadyConfirm(null)} style={actionButtonStyle('muted')}>Cancel</button>
              <button type="button" onClick={moveSeriesToReadyForReview} style={{ ...actionButtonStyle('danger'), backgroundColor: '#B45309' }}>Confirm</button>
            </div>
          </div>
        </div>
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
