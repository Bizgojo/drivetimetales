'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  credits: number
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

interface SeriesGroup {
  name: string
  episodes: Story[]
  cover_url: string | null
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
  onSaved: () => void
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
  const [coverUrl, setCoverUrl] = useState(story.cover_url || '')
  const [isHidden, setIsHidden] = useState(story.is_hidden || false)
  const [groupName, setGroupName] = useState(story.group_name || '')
  const [groups, setGroups] = useState<Group[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('groups').select('*').order('display_order', { ascending: true }).then(({ data }) => {
      if (data) setGroups(data)
    })
  }, [])

  const wordCount = description.trim() === '' ? 0 : description.trim().split(/\s+/).length
  const overLimit = wordCount > 24

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
    } catch (err) {
      alert('Cover upload failed: ' + String(err))
    }
    setUploadingCover(false)
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
      })
      .eq('id', story.id)
      .select()
    console.log('Save result:', { data, error })
    if (error) {
      alert('Save failed: ' + error.message)
    } else {
      setSaved(true)
      onSaved()
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
                <img src={coverUrl || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingCover}
                  style={{ padding: '8px 14px', backgroundColor: '#f97316', color: '#000000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  {uploadingCover ? 'Uploading...' : '📁 Upload New Cover'}
                </button>
                <div style={{ fontSize: '10px', color: textSecondary }}>JPG or PNG recommended<br />Square or portrait ratio</div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
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
                  <img src={coverUrl || '/images/default-cover.png'} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
  )
}

// ── Story Row ─────────────────────────────────────────────────────────────────

function StoryRow({
  story,
  index,
  onEditClick,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
}: {
  story: Story
  index: number
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
}) {
  return (
    <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: index % 2 === 0 ? 'transparent' : '#fafafa' }}>
      {/* Cover — clickable to edit */}
      <td style={{ padding: '0.5rem' }}>
        <div
          onClick={() => onEditClick(story)}
          title="Click to edit"
          style={{ width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e5e5e5', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#f97316')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
        >
          <img src={story.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </td>
      {/* Title */}
      <td style={{ padding: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ color: textPrimary, fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>{story.title}</div>
          {story.is_hidden && <span style={{ backgroundColor: '#dc2626', color: '#000000', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>HIDDEN</span>}
        </div>
        {story.episode_title && <div style={{ color: textSecondary, fontSize: '11px', fontStyle: 'italic' }}>{story.episode_title}</div>}
        <div style={{ color: textSecondary, fontSize: '11px' }}>by {story.author}</div>
      </td>
      {/* Genres */}
      <td style={{ padding: '0.5rem' }}>
        <div style={{ color: textPrimary, fontSize: '12px', fontWeight: 500 }}>{story.genre || <span style={{ color: '#f97316', fontSize: '10px' }}>Not set</span>}</div>
        {(story.genre_secondary || story.genre_third) && (
          <div style={{ color: textSecondary, fontSize: '10px' }}>{[story.genre_secondary, story.genre_third].filter(Boolean).join(', ')}</div>
        )}
      </td>
      {/* Duration */}
      <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.duration_mins}m</td>
      {/* Credits */}
      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#f97316', fontWeight: 600 }}>{story.credits}</td>
      {/* Downloads */}
      <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_day || 0}</td>
      <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_week || 0}</td>
      <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_month || 0}</td>
      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{story.downloads_total || 0}</td>
      {/* Fin% */}
      <td style={{ padding: '0.5rem', textAlign: 'center', color: story.pct_finished > 50 ? '#16a34a' : story.pct_finished < 20 ? '#dc2626' : textPrimary, fontWeight: 600 }}>{story.pct_finished || 0}%</td>
      {/* Rating */}
      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
        <span style={{ color: '#eab308' }}>★</span>
        <span style={{ color: textPrimary, fontWeight: 600 }}>{story.rating || '-'}</span>
        <span style={{ color: textSecondary, fontSize: '10px' }}> ({story.review_count || 0})</span>
      </td>
      {/* Flag */}
      <td style={{ padding: '0.5rem' }}>
        {story.flag ? (
          <span style={{ backgroundColor: FLAG_OPTIONS.find(f => f.value === story.flag)?.color || '#e5e5e5', color: '#000000', borderRadius: '4px', padding: '3px 7px', fontSize: '10px', fontWeight: 600 }}>
            {FLAG_OPTIONS.find(f => f.value === story.flag)?.label}
          </span>
        ) : (
          <span style={{ color: textSecondary, fontSize: '10px' }}>—</span>
        )}
      </td>
      {/* Created */}
      <td style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px', whiteSpace: 'nowrap' }}>
        {story.created_at ? new Date(story.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
      </td>
    </tr>
  )
}

// ── Series Group Row ──────────────────────────────────────────────────────────

function SeriesGroupRow({
  group,
  index,
  onEditClick,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
}: {
  group: SeriesGroup
  index: number
  onEditClick: (s: Story) => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const totalDuration = group.episodes.reduce((sum, e) => sum + e.duration_mins, 0)
  const totalDownloads = group.episodes.reduce((sum, e) => sum + (e.downloads_total || 0), 0)
  const avgFinished = group.episodes.length > 0
    ? Math.round(group.episodes.reduce((sum, e) => sum + (e.pct_finished || 0), 0) / group.episodes.length)
    : 0

  return (
    <>
      {/* Series header row */}
      <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: index % 2 === 0 ? '#f0f7ff' : '#e8f0fc' }}>
        {/* Delete — not applicable at series level */}
        <td style={{ padding: '0.5rem' }}></td>

        {/* Series cover — click to expand/collapse */}
        <td style={{ padding: '0.5rem' }}>
          <div
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse episodes' : 'Expand episodes'}
            style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e5e5e5', cursor: 'pointer', border: '2px solid #2563eb', flexShrink: 0 }}
          >
            <img src={group.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              {expanded ? '▲' : '▼'}
            </div>
          </div>
        </td>

        {/* Series name & episode count */}
        <td style={{ padding: '0.5rem' }}>
          <div style={{ color: '#1d4ed8', fontWeight: 700, fontSize: '13px' }}>{group.name}</div>
          <div style={{ color: textSecondary, fontSize: '11px' }}>{group.episodes.length} episodes · {totalDuration}m total</div>
        </td>

        {/* Genres from first episode */}
        <td style={{ padding: '0.5rem' }}>
          <div style={{ color: textPrimary, fontSize: '12px' }}>{group.episodes[0]?.genre || '—'}</div>
          {group.episodes[0]?.genre_secondary && <div style={{ color: textSecondary, fontSize: '10px' }}>{group.episodes[0].genre_secondary}</div>}
        </td>

        {/* Duration total */}
        <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary, fontSize: '12px' }}>{totalDuration}m</td>

        {/* Credits — from first episode */}
        <td style={{ padding: '0.5rem', textAlign: 'center', color: '#f97316', fontWeight: 600 }}>{group.episodes[0]?.credits || '—'}</td>

        {/* Downloads — aggregated */}
        <td colSpan={3} style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px' }}>—</td>
        <td style={{ padding: '0.5rem', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{totalDownloads}</td>
        <td style={{ padding: '0.5rem', textAlign: 'center', color: avgFinished > 50 ? '#16a34a' : avgFinished < 20 ? '#dc2626' : textPrimary, fontWeight: 600 }}>{avgFinished}%</td>
        <td style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px' }}>—</td>
        <td style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px' }}>—</td>
        <td style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px' }}>—</td>
      </tr>

      {/* Episode rows when expanded */}
      {expanded && group.episodes
        .sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
        .map((ep, epIdx) => (
          <tr key={ep.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: epIdx % 2 === 0 ? '#f8faff' : '#f0f4ff' }}>
            <td></td>

            {/* Episode cover — clickable to edit */}
            <td style={{ padding: '0.5rem 0.5rem 0.5rem 0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#2563eb', fontSize: '10px', fontWeight: 700, width: '16px', textAlign: 'right', flexShrink: 0 }}>#{ep.series_number}</span>
                <div
                  onClick={() => onEditClick(ep)}
                  title="Click to edit"
                  style={{ width: '36px', height: '36px', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#e5e5e5', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#f97316')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  <img src={ep.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            </td>

            {/* Episode title */}
            <td style={{ padding: '0.5rem' }}>
              <div style={{ color: textPrimary, fontWeight: 500, fontSize: '12px' }}>{ep.episode_title || ep.title}</div>
              <div style={{ color: textSecondary, fontSize: '10px' }}>by {ep.author}</div>
            </td>

            {/* Genres */}
            <td style={{ padding: '0.5rem' }}>
              <div style={{ color: textPrimary, fontSize: '11px' }}>{ep.genre || '—'}</div>
            </td>

            <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary, fontSize: '12px' }}>{ep.duration_mins}m</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#f97316', fontWeight: 600, fontSize: '12px' }}>{ep.credits}</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary, fontSize: '12px' }}>{ep.downloads_day || 0}</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary, fontSize: '12px' }}>{ep.downloads_week || 0}</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary, fontSize: '12px' }}>{ep.downloads_month || 0}</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#2563eb', fontWeight: 600, fontSize: '12px' }}>{ep.downloads_total || 0}</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: ep.pct_finished > 50 ? '#16a34a' : ep.pct_finished < 20 ? '#dc2626' : textPrimary, fontWeight: 600, fontSize: '12px' }}>{ep.pct_finished || 0}%</td>
            <td style={{ padding: '0.5rem', textAlign: 'center', fontSize: '12px' }}>
              <span style={{ color: '#eab308' }}>★</span>
              <span style={{ color: textPrimary, fontWeight: 600 }}>{ep.rating || '-'}</span>
            </td>
            <td style={{ padding: '0.5rem' }}>
              {ep.flag ? (
                <span style={{ backgroundColor: FLAG_OPTIONS.find(f => f.value === ep.flag)?.color || '#e5e5e5', color: '#000000', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', fontWeight: 600 }}>
                  {FLAG_OPTIONS.find(f => f.value === ep.flag)?.label}
                </span>
              ) : <span style={{ color: textSecondary, fontSize: '10px' }}>—</span>}
            </td>
            <td style={{ padding: '0.5rem', textAlign: 'center', color: textSecondary, fontSize: '11px', whiteSpace: 'nowrap' }}>
              {ep.created_at ? new Date(ep.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
            </td>
          </tr>
        ))}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminStoriesPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'title' | 'genre' | 'duration_mins' | 'series_name' | 'downloads_total' | 'pct_finished' | 'rating' | 'created_at'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const editingStoryRef = useRef<Story | null>(null)

  useEffect(() => {
    fetchStories()
    fetchGenres()
  }, [])

  async function fetchStories() {
    setLoading(true)
    const { data, error } = await supabase.from('story_analytics').select('*')
    if (data) setStories(data)
    if (error) console.error('Error fetching stories:', error)
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
    setDeleteConfirm(null)
    fetchStories()
  }

  const genreNames = ['All', ...genres.map(g => g.name)]

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
      return matchesSearch && matchesGenre
    })

  // Split into series groups and standalone stories
  const seriesMap = new Map<string, Story[]>()
  const standaloneStories: Story[] = []

  filteredStories.forEach(s => {
    if (s.series_name) {
      if (!seriesMap.has(s.series_name)) seriesMap.set(s.series_name, [])
      seriesMap.get(s.series_name)!.push(s)
    } else {
      standaloneStories.push(s)
    }
  })

  const seriesGroups: SeriesGroup[] = Array.from(seriesMap.entries())
    .map(([name, episodes]) => {
      const sorted = [...episodes].sort((a, b) => (a.series_number || 0) - (b.series_number || 0))
      return {
        name,
        episodes: sorted,
        cover_url: sorted[0]?.cover_url || null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const sortedStandalones = standaloneStories.sort((a, b) => {
    let aVal = a[sortBy] as string | number | null
    let bVal = b[sortBy] as string | number | null
    if (aVal === null) aVal = ''
    if (bVal === null) bVal = ''
    if (typeof aVal === 'string') aVal = aVal.toLowerCase()
    if (typeof bVal === 'string') bVal = bVal.toLowerCase()
    if (sortDir === 'asc') return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  const totalStories = stories.length
  const totalDownloads = stories.reduce((sum, s) => sum + (s.downloads_total || 0), 0)
  const avgCompletion = stories.length > 0
    ? Math.round(stories.reduce((sum, s) => sum + (s.pct_finished || 0), 0) / stories.length)
    : 0

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'created_at' ? 'desc' : 'asc') }
  }

  function SortTh({ col, label, right, minW }: { col: typeof sortBy; label: string; right?: boolean; minW?: string }) {
    const active = sortBy === col
    return (
      <th
        onClick={() => handleSort(col)}
        style={{ padding: '0.75rem 0.5rem', textAlign: right ? 'center' : 'left', color: active ? '#f97316' : textSecondary, fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', minWidth: minW, background: active ? '#fff8f3' : undefined }}
      >
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
      </th>
    )
  }

  function fmtDate(iso?: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

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
            📚 Stories ({totalStories})
          </h1>
          <p style={{ color: textSecondary, fontSize: '13px', margin: '4px 0 0 0' }}>
            {seriesGroups.length} series · {standaloneStories.length} standalone · {totalDownloads} total downloads · {avgCompletion}% avg completion
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
        <div style={{ padding: '0.5rem 0.75rem', fontSize: '12px', color: textSecondary, background: '#fff', border: `1px solid ${border}`, borderRadius: '6px' }}>
          Click column headers to sort
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: `2px solid ${border}` }}>
                <th style={{ padding: '0.75rem 0.5rem', width: '56px' }}></th>
                <SortTh col="title" label="Title" minW="160px" />
                <SortTh col="genre" label="Genres" minW="110px" />
                <SortTh col="duration_mins" label="Dur" right />
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Cr</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Day</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Week</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Month</th>
                <SortTh col="downloads_total" label="Total" right />
                <SortTh col="pct_finished" label="Fin%" right />
                <SortTh col="rating" label="Rating" right />
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, minWidth: '80px' }}>Flag</th>
                <SortTh col="created_at" label="Created" right minW="80px" />
              </tr>
            </thead>
            <tbody>
              {/* Series groups first */}
              {seriesGroups.map((group, i) => (
                <SeriesGroupRow
                  key={group.name}
                  group={group}
                  index={i}
                  onEditClick={s => { editingStoryRef.current = s; setEditingStory(s) }}
                  onDelete={deleteStory}
                  deleteConfirm={deleteConfirm}
                  setDeleteConfirm={setDeleteConfirm}
                />
              ))}

              {/* Divider if both series and standalones exist */}
              {seriesGroups.length > 0 && sortedStandalones.length > 0 && (
                <tr>
                  <td colSpan={14} style={{ padding: '0.5rem 1rem', backgroundColor: '#f0f0f0', borderBottom: `1px solid ${border}`, fontSize: '11px', fontWeight: 700, color: textSecondary, letterSpacing: '0.05em' }}>
                    STANDALONE STORIES
                  </td>
                </tr>
              )}

              {/* Standalone stories */}
              {sortedStandalones.map((story, i) => (
                <StoryRow
                  key={story.id}
                  story={story}
                  index={i}
                  onEditClick={s => { editingStoryRef.current = s; setEditingStory(s) }}
                  onDelete={deleteStory}
                  deleteConfirm={deleteConfirm}
                  setDeleteConfirm={setDeleteConfirm}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filteredStories.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: textSecondary }}>
            No stories found matching your filters.
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
            setDeleteConfirm(null)
            fetchStories()
          }}
          onSaved={() => {
            // Refresh stories in background without resetting panel state
            supabase.from('story_analytics').select('*').then(({ data }) => {
              if (data) setStories(data)
            })
          }}
        />
      )}
    </div>
  )
}
