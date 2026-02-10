'use client'

import { useState, useEffect } from 'react'
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
  flag: string | null
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
}

interface Genre {
  id: string
  name: string
  display_order: number
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

export default function AdminStoriesPage() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'title' | 'genre' | 'duration_mins' | 'series_name' | 'downloads_total' | 'pct_finished' | 'rating'>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [flagDropdown, setFlagDropdown] = useState<string | null>(null)
  const [genreEditor, setGenreEditor] = useState<string | null>(null)
  const [editGenres, setEditGenres] = useState<{ primary: string, secondary: string, third: string }>({ primary: '', secondary: '', third: '' })
  const [savingGenre, setSavingGenre] = useState(false)

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'

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

  async function updateFlag(storyId: string, flag: string | null) {
    await supabase.from('stories').update({ flag, is_free: flag === 'free' }).eq('id', storyId)
    setFlagDropdown(null)
    fetchStories()
  }

  async function deleteStory(storyId: string) {
    try {
      const res = await fetch('/api/admin/delete-story', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const result = await res.json()
      if (!result.success) {
        alert('Delete failed: ' + (result.error || 'Unknown error'))
      }
    } catch (err) {
      alert('Delete failed: ' + String(err))
    }
    setDeleteConfirm(null)
    fetchStories()
  }

  function openGenreEditor(story: Story) {
    if (genreEditor === story.id) {
      setGenreEditor(null)
      return
    }
    setGenreEditor(story.id)
    setEditGenres({
      primary: story.genre || '',
      secondary: story.genre_secondary || '',
      third: story.genre_third || '',
    })
  }

  async function saveGenres(storyId: string) {
    setSavingGenre(true)
    const { error } = await supabase
      .from('stories')
      .update({
        genre: editGenres.primary || null,
        genre_secondary: editGenres.secondary || null,
        genre_third: editGenres.third || null,
      })
      .eq('id', storyId)

    if (error) {
      console.error('Error saving genres:', error)
    } else {
      setGenreEditor(null)
      await fetchStories()
    }
    setSavingGenre(false)
  }

  function handleSort(column: typeof sortBy) {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  const genreNames = ['All', ...genres.map(g => g.name)]

  const filteredStories = stories
    .filter(s => {
      const matchesSearch = search === '' || 
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.author.toLowerCase().includes(search.toLowerCase())
      const matchesGenre = genreFilter === 'All' || 
        s.genre === genreFilter || 
        s.genre_secondary === genreFilter || 
        s.genre_third === genreFilter
      return matchesSearch && matchesGenre
    })
    .sort((a, b) => {
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
  const avgCompletion = stories.length > 0 ? Math.round(stories.reduce((sum, s) => sum + (s.pct_finished || 0), 0) / stories.length) : 0

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: textPrimary, margin: 0 }}>📚 Stories ({totalStories})</h1>
          <p style={{ color: textSecondary, fontSize: '13px', margin: '4px 0 0 0' }}>
            {totalDownloads} total downloads · {avgCompletion}% avg completion
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search title or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, flex: 1, minWidth: '200px', color: textPrimary, fontSize: '14px' }}
        />
        <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px' }}>
          {genreNames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={`${sortBy}-${sortDir}`} onChange={(e) => { const [col, dir] = e.target.value.split('-'); setSortBy(col as typeof sortBy); setSortDir(dir as 'asc' | 'desc') }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px' }}>
          <option value="title-asc">Title A-Z</option>
          <option value="title-desc">Title Z-A</option>
          <option value="genre-asc">Genre A-Z</option>
          <option value="series_name-asc">Series A-Z</option>
          <option value="duration_mins-asc">Duration ↑</option>
          <option value="duration_mins-desc">Duration ↓</option>
          <option value="downloads_total-desc">Most Downloads</option>
          <option value="pct_finished-desc">Best Completion</option>
          <option value="rating-desc">Highest Rated</option>
        </select>
      </div>

      {/* Stories Table */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: `2px solid ${border}` }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, width: '40px' }}></th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '50px' }}>Cover</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '150px', cursor: 'pointer' }} onClick={() => handleSort('title')}>Title {sortBy === 'title' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '120px', cursor: 'pointer' }} onClick={() => handleSort('genre')}>Genres {sortBy === 'genre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Dur</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Cr</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '80px', cursor: 'pointer' }} onClick={() => handleSort('series_name')}>Series {sortBy === 'series_name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Day</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Week</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Month</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>YTD</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('downloads_total')}>Total {sortBy === 'downloads_total' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('pct_finished')}>Fin% {sortBy === 'pct_finished' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Skip%</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('rating')}>Rating {sortBy === 'rating' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, minWidth: '100px' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.map((story, i) => (
                <>
                <tr key={story.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                  {/* Delete */}
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <button onClick={() => setDeleteConfirm(deleteConfirm === story.id ? null : story.id)} style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}>🗑</button>
                    {deleteConfirm === story.id && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.5rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '120px' }}>
                        <div style={{ color: '#dc2626', fontSize: '11px', fontWeight: 600, marginBottom: '0.25rem' }}>Delete permanently?</div>
                        <div style={{ color: textSecondary, fontSize: '10px', marginBottom: '0.5rem' }}>Removes story, user data, reviews &amp; files</div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => deleteStory(story.id)} style={{ flex: 1, backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontSize: '10px' }}>Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, backgroundColor: '#e5e5e5', color: textPrimary, border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontSize: '10px' }}>No</button>
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Cover */}
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e5e5e5' }}>
                      <img src={story.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </td>
                  {/* Title & Author */}
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ color: textPrimary, fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>{story.title}</div>
                    <div style={{ color: textSecondary, fontSize: '11px' }}>by {story.author}</div>
                  </td>
                  {/* Genres - clickable */}
                  <td style={{ padding: '0.5rem' }}>
                    <button
                      onClick={() => openGenreEditor(story)}
                      style={{
                        background: 'none',
                        border: genreEditor === story.id ? '1px solid #f97316' : '1px solid transparent',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <div style={{ color: textPrimary, fontSize: '12px', fontWeight: 500 }}>{story.genre || '—'}</div>
                      {(story.genre_secondary || story.genre_third) && (
                        <div style={{ color: textSecondary, fontSize: '10px' }}>
                          {[story.genre_secondary, story.genre_third].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {!story.genre && !story.genre_secondary && !story.genre_third && (
                        <div style={{ color: '#f97316', fontSize: '10px' }}>Click to set</div>
                      )}
                    </button>
                  </td>
                  {/* Duration */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.duration_mins}m</td>
                  {/* Credits */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: '#f97316', fontWeight: 600 }}>{story.credits}</td>
                  {/* Series */}
                  <td style={{ padding: '0.5rem', color: textSecondary, fontSize: '11px' }}>
                    {story.series_name ? `${story.series_name} #${story.series_number}` : '-'}
                  </td>
                  {/* Downloads */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_day || 0}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_week || 0}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_month || 0}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.downloads_ytd || 0}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{story.downloads_total || 0}</td>
                  {/* Percentages */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: story.pct_finished > 50 ? '#16a34a' : story.pct_finished < 20 ? '#dc2626' : textPrimary, fontWeight: 600 }}>{story.pct_finished || 0}%</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: story.pct_skipped > 30 ? '#dc2626' : textPrimary }}>{story.pct_skipped || 0}%</td>
                  {/* Rating */}
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <span style={{ color: '#eab308' }}>★</span>
                    <span style={{ color: textPrimary, fontWeight: 600 }}>{story.rating || '-'}</span>
                    <span style={{ color: textSecondary, fontSize: '10px' }}> ({story.review_count || 0})</span>
                  </td>
                  {/* Flag */}
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <button onClick={() => setFlagDropdown(flagDropdown === story.id ? null : story.id)} style={{ backgroundColor: FLAG_OPTIONS.find(f => f.value === story.flag)?.color || '#e5e5e5', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 600, minWidth: '80px' }}>
                      {FLAG_OPTIONS.find(f => f.value === story.flag)?.label || 'Set Flag'}
                    </button>
                    {flagDropdown === story.id && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.25rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '120px' }}>
                        {FLAG_OPTIONS.map(flag => (
                          <button key={flag.value || 'none'} onClick={() => updateFlag(story.id, flag.value)} style={{ display: 'block', width: '100%', textAlign: 'left', backgroundColor: story.flag === flag.value ? '#f5f5f5' : 'transparent', color: textPrimary, border: 'none', padding: '6px 8px', cursor: 'pointer', fontSize: '11px', borderRadius: '4px' }}>
                            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: flag.color, marginRight: '6px' }}></span>
                            {flag.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
                {/* Genre Editor Row */}
                {genreEditor === story.id && (
                  <tr key={`${story.id}-genres`} style={{ backgroundColor: '#fffbeb' }}>
                    <td colSpan={17} style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: textPrimary }}>Edit Genres:</span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <label style={{ fontSize: '11px', color: textSecondary, width: '55px' }}>Primary*</label>
                          <select
                            value={editGenres.primary}
                            onChange={(e) => setEditGenres({ ...editGenres, primary: e.target.value })}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #f97316', fontSize: '12px', color: '#000000', backgroundColor: '#ffffff', minWidth: '120px' }}
                          >
                            <option value="">— Select —</option>
                            {genres.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <label style={{ fontSize: '11px', color: textSecondary, width: '55px' }}>2nd</label>
                          <select
                            value={editGenres.secondary}
                            onChange={(e) => setEditGenres({ ...editGenres, secondary: e.target.value })}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${border}`, fontSize: '12px', color: '#000000', backgroundColor: '#ffffff', minWidth: '120px' }}
                          >
                            <option value="">— None —</option>
                            {genres.filter(g => g.name !== editGenres.primary).map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <label style={{ fontSize: '11px', color: textSecondary, width: '55px' }}>3rd</label>
                          <select
                            value={editGenres.third}
                            onChange={(e) => setEditGenres({ ...editGenres, third: e.target.value })}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${border}`, fontSize: '12px', color: '#000000', backgroundColor: '#ffffff', minWidth: '120px' }}
                          >
                            <option value="">— None —</option>
                            {genres.filter(g => g.name !== editGenres.primary && g.name !== editGenres.secondary).map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                          </select>
                        </div>

                        <button
                          onClick={() => saveGenres(story.id)}
                          disabled={savingGenre || !editGenres.primary}
                          style={{
                            padding: '4px 12px', borderRadius: '4px',
                            backgroundColor: savingGenre || !editGenres.primary ? '#9ca3af' : '#22c55e',
                            color: 'white', border: 'none', cursor: savingGenre || !editGenres.primary ? 'default' : 'pointer',
                            fontSize: '12px', fontWeight: 600,
                          }}
                        >
                          {savingGenre ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setGenreEditor(null)}
                          style={{
                            padding: '4px 12px', borderRadius: '4px',
                            backgroundColor: '#e5e5e5', color: textPrimary,
                            border: 'none', cursor: 'pointer', fontSize: '12px',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </>
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
    </div>
  )
}
