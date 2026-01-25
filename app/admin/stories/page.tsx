'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  title: string
  author: string
  genre: string
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

const FLAG_OPTIONS = [
  { value: null, label: 'No Flag', color: '#6b7280' },
  { value: 'free', label: 'Free Today', color: '#22c55e' },
  { value: 'editors-pick', label: "Editor's Pick", color: '#a855f7' },
  { value: 'readers-choice', label: "Reader's Choice", color: '#3b82f6' },
  { value: 'trending', label: 'Trending', color: '#ec4899' },
  { value: 'new', label: 'New', color: '#f97316' },
  { value: 'staff-favorite', label: 'Staff Favorite', color: '#eab308' },
]

const GENRES = ['All', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Thriller', 'Non-Fiction', 'Children', 'Comedy', 'Romance', 'Trucker Stories']

export default function AdminStoriesPage() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'title' | 'genre' | 'duration_mins' | 'series_name' | 'downloads_total' | 'pct_finished' | 'rating'>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [flagDropdown, setFlagDropdown] = useState<string | null>(null)

  const bg = '#FAF9F6'
  const cardBg = '#FFFFFF'
  const textPrimary = '#1a1a1a'
  const textSecondary = '#4a4a4a'
  const border = '#e0e0e0'

  useEffect(() => { fetchStories() }, [])

  async function fetchStories() {
    setLoading(true)
    const { data, error } = await supabase.from('story_analytics').select('*')
    if (data) setStories(data)
    if (error) console.error('Error fetching stories:', error)
    setLoading(false)
  }

  async function updateFlag(storyId: string, flag: string | null) {
    await supabase.from('stories').update({ flag, is_free: flag === 'free' }).eq('id', storyId)
    setFlagDropdown(null)
    fetchStories()
  }

  async function deleteStory(storyId: string) {
    await supabase.from('stories').delete().eq('id', storyId)
    setDeleteConfirm(null)
    fetchStories()
  }

  function handleSort(column: typeof sortBy) {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  const filteredStories = stories
    .filter(s => {
      const matchesSearch = search === '' || 
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.author.toLowerCase().includes(search.toLowerCase())
      const matchesGenre = genreFilter === 'All' || s.genre === genreFilter
      return matchesSearch && matchesGenre
    })
    .sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Stories Management</h1>
        </div>
        <button onClick={() => router.push('/admin/stories/new')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Story</button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Total Stories</div>
          <div style={{ color: textPrimary, fontSize: '28px', fontWeight: 'bold' }}>{totalStories}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Total Downloads</div>
          <div style={{ color: '#2563eb', fontSize: '28px', fontWeight: 'bold' }}>{totalDownloads}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Avg Completion</div>
          <div style={{ color: '#16a34a', fontSize: '28px', fontWeight: 'bold' }}>{avgCompletion}%</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>With Flags</div>
          <div style={{ color: '#a855f7', fontSize: '28px', fontWeight: 'bold' }}>{stories.filter(s => s.flag).length}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: `1px solid ${border}`, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Search by title or author..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px' }}
        />
        <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, color: textPrimary, fontSize: '14px' }}>
          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
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
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '80px', cursor: 'pointer' }} onClick={() => handleSort('genre')}>Genre {sortBy === 'genre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Dur</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Cr</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, minWidth: '80px', cursor: 'pointer' }} onClick={() => handleSort('series_name')}>Series {sortBy === 'series_name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Day</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Week</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Month</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>YTD</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('downloads_total')}>Total {sortBy === 'downloads_total' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Start%</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('pct_finished')}>Fin% {sortBy === 'pct_finished' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Skip%</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('rating')}>Rating {sortBy === 'rating' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, minWidth: '100px' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.map((story, i) => (
                <tr key={story.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                  {/* Delete */}
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <button onClick={() => setDeleteConfirm(deleteConfirm === story.id ? null : story.id)} style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}>🗑</button>
                    {deleteConfirm === story.id && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.5rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '120px' }}>
                        <div style={{ color: textPrimary, fontSize: '11px', marginBottom: '0.5rem' }}>Delete this story?</div>
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
                  {/* Genre */}
                  <td style={{ padding: '0.5rem', color: textSecondary }}>{story.genre}</td>
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
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: story.pct_started > 70 ? '#16a34a' : textPrimary }}>{story.pct_started || 0}%</td>
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
