'use client'

import { useState, useEffect, useMemo } from 'react'
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
  published_at: string
  downloads_day: number
  downloads_week: number
  downloads_month: number
  downloads_ytd: number
  downloads_total: number
  finished_count: number
  skipped_count: number
  total_plays: number
  pct_finished: number
  pct_skipped: number
  description?: string
}

interface EditForm {
  title: string
  author: string
  genre: string
  duration_mins: number
  description: string
  series_name: string
  series_number: number | null
  series_total: number | null
  cover_url: string
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

const GENRES = ['Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Thriller', 'Non-Fiction', 'Children', 'Comedy', 'Romance', 'Trucker Stories']

const DURATION_RANGES = [
  { label: 'All Durations', min: 0, max: 9999 },
  { label: '0-15 min', min: 0, max: 15 },
  { label: '16-30 min', min: 16, max: 30 },
  { label: '31-60 min', min: 31, max: 60 },
  { label: '60+ min', min: 61, max: 9999 },
]

type SortField = 'title' | 'published_at' | 'genre' | 'duration_mins' | 'series_name' | 'downloads_day' | 'downloads_week' | 'downloads_month' | 'downloads_ytd' | 'downloads_total' | 'pct_finished' | 'pct_skipped' | 'rating'

export default function AdminStoriesPage() {
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'genre' | 'series' | 'duration'>('all')
  const [genreFilter, setGenreFilter] = useState('All')
  const [seriesFilter, setSeriesFilter] = useState('All')
  const [durationFilter, setDurationFilter] = useState(0)
  const [sortBy, setSortBy] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [flagDropdown, setFlagDropdown] = useState<string | null>(null)
  const [showComparisonGrid, setShowComparisonGrid] = useState(false)
  const [editingStory, setEditingStory] = useState<Story | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

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

  // Get unique genres and series
  const genres = useMemo(() => ['All', ...Array.from(new Set(stories.map(s => s.genre).filter(Boolean))).sort()], [stories])
  const seriesList = useMemo(() => ['All', ...Array.from(new Set(stories.map(s => s.series_name).filter(Boolean))).sort()], [stories])

  // Filter stories
  const filteredStories = useMemo(() => {
    return stories.filter(s => {
      const matchesSearch = search === '' || 
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.author.toLowerCase().includes(search.toLowerCase())
      
      let matchesTabFilter = true
      if (filterTab === 'genre' && genreFilter !== 'All') {
        matchesTabFilter = s.genre === genreFilter
      } else if (filterTab === 'series' && seriesFilter !== 'All') {
        matchesTabFilter = s.series_name === seriesFilter
      } else if (filterTab === 'duration') {
        const range = DURATION_RANGES[durationFilter]
        matchesTabFilter = s.duration_mins >= range.min && s.duration_mins <= range.max
      }
      
      return matchesSearch && matchesTabFilter
    }).sort((a, b) => {
      let aVal: any = a[sortBy]
      let bVal: any = b[sortBy]
      if (aVal === null || aVal === undefined) aVal = sortBy === 'title' ? 'zzz' : -1
      if (bVal === null || bVal === undefined) bVal = sortBy === 'title' ? 'zzz' : -1
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1
      return aVal < bVal ? 1 : -1
    })
  }, [stories, search, filterTab, genreFilter, seriesFilter, durationFilter, sortBy, sortDir])

  // Stats based on filtered stories
  const stats = useMemo(() => ({
    totalStories: filteredStories.length,
    totalDownloads: filteredStories.reduce((sum, s) => sum + (s.downloads_total || 0), 0),
    avgCompletion: filteredStories.length > 0 ? Math.round(filteredStories.reduce((sum, s) => sum + (s.pct_finished || 0), 0) / filteredStories.length) : 0,
    withFlags: filteredStories.filter(s => s.flag).length
  }), [filteredStories])

  // Comparison grid data
  const comparisonData = useMemo(() => {
    const genreStats: Record<string, { downloads: number, completion: number, count: number }> = {}
    const durationStats: Record<string, { downloads: number, completion: number, count: number }> = {}
    
    stories.forEach(s => {
      if (!genreStats[s.genre]) genreStats[s.genre] = { downloads: 0, completion: 0, count: 0 }
      genreStats[s.genre].downloads += s.downloads_total || 0
      genreStats[s.genre].completion += s.pct_finished || 0
      genreStats[s.genre].count++
      
      let durLabel = '60+ min'
      if (s.duration_mins <= 15) durLabel = '0-15 min'
      else if (s.duration_mins <= 30) durLabel = '16-30 min'
      else if (s.duration_mins <= 60) durLabel = '31-60 min'
      
      if (!durationStats[durLabel]) durationStats[durLabel] = { downloads: 0, completion: 0, count: 0 }
      durationStats[durLabel].downloads += s.downloads_total || 0
      durationStats[durLabel].completion += s.pct_finished || 0
      durationStats[durLabel].count++
    })
    
    return { genreStats, durationStats }
  }, [stories])

  async function openEditModal(story: Story) {
    // Fetch full story data including description
    const { data } = await supabase.from('stories').select('*').eq('id', story.id).single()
    if (data) {
      setEditingStory({ ...story, description: data.description })
      setEditForm({
        title: data.title || '',
        author: data.author || '',
        genre: data.genre || '',
        duration_mins: data.duration_mins || 0,
        description: data.description || '',
        series_name: data.series_name || '',
        series_number: data.series_number,
        series_total: data.series_total,
        cover_url: data.cover_url || ''
      })
    }
  }

  async function saveEdit() {
    if (!editingStory || !editForm) return
    setSaving(true)
    
    const { error } = await supabase.from('stories').update({
      title: editForm.title,
      author: editForm.author,
      genre: editForm.genre,
      duration_mins: editForm.duration_mins,
      description: editForm.description,
      series_name: editForm.series_name || null,
      series_number: editForm.series_number,
      series_total: editForm.series_total,
      cover_url: editForm.cover_url || null
    }).eq('id', editingStory.id)
    
    if (!error) {
      setEditingStory(null)
      setEditForm(null)
      fetchStories()
    } else {
      alert('Error saving: ' + error.message)
    }
    setSaving(false)
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

  function handleSort(column: SortField) {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir('desc')
    }
  }

  const SortArrow = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <span style={{ color: '#ccc', marginLeft: '2px' }}>↕</span>
    return <span style={{ color: '#f97316', marginLeft: '2px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      {/* Edit Modal */}
      {editingStory && editForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setEditingStory(null); setEditForm(null) }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '1.5rem', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>Edit Story</h2>
              <button onClick={() => { setEditingStory(null); setEditForm(null) }} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: textSecondary }}>×</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Cover Preview */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#e5e5e5', flexShrink: 0 }}>
                  <img src={editForm.cover_url || '/images/default-cover.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Cover URL</label>
                  <input type="text" value={editForm.cover_url} onChange={e => setEditForm({ ...editForm, cover_url: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '13px' }} placeholder="https://..." />
                </div>
              </div>
              
              {/* Title */}
              <div>
                <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Title *</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
              </div>
              
              {/* Author */}
              <div>
                <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Author *</label>
                <input type="text" value={editForm.author} onChange={e => setEditForm({ ...editForm, author: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
              </div>
              
              {/* Genre & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Genre</label>
                  <select value={editForm.genre} onChange={e => setEditForm({ ...editForm, genre: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }}>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Duration (mins)</label>
                  <input type="number" value={editForm.duration_mins} onChange={e => setEditForm({ ...editForm, duration_mins: Number(e.target.value) })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
                </div>
              </div>
              
              {/* Credits (calculated) */}
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '6px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textSecondary, fontSize: '13px' }}>Credits (auto-calculated)</span>
                <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '14px' }}>{Math.max(1, Math.floor(editForm.duration_mins / 15))}</span>
              </div>
              
              {/* Series */}
              <div>
                <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Series Name (optional)</label>
                <input type="text" value={editForm.series_name} onChange={e => setEditForm({ ...editForm, series_name: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} placeholder="e.g., The Dark Woods Trilogy" />
              </div>
              
              {editForm.series_name && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Part # in Series</label>
                    <input type="number" value={editForm.series_number || ''} onChange={e => setEditForm({ ...editForm, series_number: Number(e.target.value) || null })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Total in Series</label>
                    <input type="number" value={editForm.series_total || ''} onChange={e => setEditForm({ ...editForm, series_total: Number(e.target.value) || null })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
                  </div>
                </div>
              )}
              
              {/* Description */}
              <div>
                <label style={{ display: 'block', color: textSecondary, fontSize: '12px', marginBottom: '4px' }}>Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={4} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px', resize: 'vertical' }} placeholder="Story description..." />
              </div>
              
              {/* Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button onClick={() => { setEditingStory(null); setEditForm(null) }} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: 'transparent', color: textPrimary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button onClick={saveEdit} disabled={saving || !editForm.title || !editForm.author} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: saving ? '#ccc' : '#f97316', color: 'white', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
          <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 'bold' }}>Stories Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowComparisonGrid(!showComparisonGrid)} style={{ backgroundColor: showComparisonGrid ? '#3b82f6' : '#e5e5e5', color: showComparisonGrid ? 'white' : textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>📊 Compare</button>
          <button onClick={() => router.push('/admin/stories/new')} style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Story</button>
        </div>
      </div>

      {/* Comparison Grid */}
      {showComparisonGrid && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem', border: `1px solid ${border}` }}>
            <h3 style={{ color: textPrimary, fontSize: '14px', fontWeight: 'bold', marginBottom: '0.75rem' }}>📚 By Genre</h3>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: textSecondary }}>Genre</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Stories</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Downloads</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Avg Fin%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparisonData.genreStats).sort((a, b) => b[1].downloads - a[1].downloads).map(([genre, data]) => (
                  <tr key={genre} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '0.4rem', color: textPrimary, fontWeight: 500 }}>{genre}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: textPrimary }}>{data.count}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{data.downloads}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: Math.round(data.completion / data.count) > 50 ? '#16a34a' : textPrimary }}>{Math.round(data.completion / data.count)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem', border: `1px solid ${border}` }}>
            <h3 style={{ color: textPrimary, fontSize: '14px', fontWeight: 'bold', marginBottom: '0.75rem' }}>⏱️ By Duration</h3>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: textSecondary }}>Duration</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Stories</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Downloads</th>
                  <th style={{ textAlign: 'center', padding: '0.4rem', color: textSecondary }}>Avg Fin%</th>
                </tr>
              </thead>
              <tbody>
                {['0-15 min', '16-30 min', '31-60 min', '60+ min'].map(dur => {
                  const data = comparisonData.durationStats[dur] || { count: 0, downloads: 0, completion: 0 }
                  return (
                    <tr key={dur} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: '0.4rem', color: textPrimary, fontWeight: 500 }}>{dur}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: textPrimary }}>{data.count}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{data.downloads}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: data.count > 0 && Math.round(data.completion / data.count) > 50 ? '#16a34a' : textPrimary }}>{data.count > 0 ? Math.round(data.completion / data.count) : 0}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Total Stories</div>
          <div style={{ color: textPrimary, fontSize: '28px', fontWeight: 'bold' }}>{stats.totalStories}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Total Downloads</div>
          <div style={{ color: '#2563eb', fontSize: '28px', fontWeight: 'bold' }}>{stats.totalDownloads}</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>Avg Completion</div>
          <div style={{ color: '#16a34a', fontSize: '28px', fontWeight: 'bold' }}>{stats.avgCompletion}%</div>
        </div>
        <div style={{ backgroundColor: cardBg, borderRadius: '8px', padding: '1rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <div style={{ color: textSecondary, fontSize: '12px' }}>With Flags</div>
          <div style={{ color: '#a855f7', fontSize: '28px', fontWeight: 'bold' }}>{stats.withFlags}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setFilterTab('all')} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: filterTab === 'all' ? '#f97316' : '#e5e5e5', color: filterTab === 'all' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>All</button>
          <button onClick={() => setFilterTab('genre')} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: filterTab === 'genre' ? '#f97316' : '#e5e5e5', color: filterTab === 'genre' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>By Genre</button>
          <button onClick={() => setFilterTab('series')} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: filterTab === 'series' ? '#f97316' : '#e5e5e5', color: filterTab === 'series' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>By Series</button>
          <button onClick={() => setFilterTab('duration')} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: filterTab === 'duration' ? '#f97316' : '#e5e5e5', color: filterTab === 'duration' ? 'white' : textPrimary, cursor: 'pointer', fontWeight: 600 }}>By Duration</button>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search by title or author..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px' }} />
          
          {filterTab === 'genre' && (
            <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px', minWidth: '150px' }}>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          
          {filterTab === 'series' && (
            <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px', minWidth: '150px' }}>
              {seriesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          
          {filterTab === 'duration' && (
            <select value={durationFilter} onChange={(e) => setDurationFilter(Number(e.target.value))} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: 'white', color: textPrimary, fontSize: '14px', minWidth: '150px' }}>
              {DURATION_RANGES.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Stories Table */}
      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: `2px solid ${border}` }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, width: '60px' }}>Actions</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, width: '50px' }}>Cover</th>
                <th onClick={() => handleSort('title')} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, cursor: 'pointer', minWidth: '140px' }}>Title<SortArrow field="title" /></th>
                <th onClick={() => handleSort('published_at')} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Published<SortArrow field="published_at" /></th>
                <th onClick={() => handleSort('genre')} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Genre<SortArrow field="genre" /></th>
                <th onClick={() => handleSort('duration_mins')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Dur<SortArrow field="duration_mins" /></th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600 }}>Cr</th>
                <th onClick={() => handleSort('series_name')} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Series<SortArrow field="series_name" /></th>
                <th onClick={() => handleSort('downloads_day')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Day<SortArrow field="downloads_day" /></th>
                <th onClick={() => handleSort('downloads_week')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Week<SortArrow field="downloads_week" /></th>
                <th onClick={() => handleSort('downloads_month')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Month<SortArrow field="downloads_month" /></th>
                <th onClick={() => handleSort('downloads_ytd')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>YTD<SortArrow field="downloads_ytd" /></th>
                <th onClick={() => handleSort('downloads_total')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Total<SortArrow field="downloads_total" /></th>
                <th onClick={() => handleSort('pct_finished')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Fin%<SortArrow field="pct_finished" /></th>
                <th onClick={() => handleSort('pct_skipped')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Skip%<SortArrow field="pct_skipped" /></th>
                <th onClick={() => handleSort('rating')} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, cursor: 'pointer' }}>Rating<SortArrow field="rating" /></th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: textSecondary, fontWeight: 600, minWidth: '90px' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.map((story, i) => (
                <tr key={story.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                  {/* Actions */}
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openEditModal(story)} style={{ backgroundColor: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }} title="Edit">✏️</button>
                      <button onClick={() => setDeleteConfirm(deleteConfirm === story.id ? null : story.id)} style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }} title="Delete">🗑</button>
                    </div>
                    {deleteConfirm === story.id && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.5rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '100px' }}>
                        <div style={{ color: textPrimary, fontSize: '10px', marginBottom: '0.4rem' }}>Delete?</div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => deleteStory(story.id)} style={{ flex: 1, backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px', cursor: 'pointer', fontSize: '10px' }}>Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, backgroundColor: '#e5e5e5', color: textPrimary, border: 'none', borderRadius: '4px', padding: '3px', cursor: 'pointer', fontSize: '10px' }}>No</button>
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
                    <div style={{ color: textPrimary, fontWeight: 600, fontSize: '12px', lineHeight: 1.2 }}>{story.title}</div>
                    <div style={{ color: textSecondary, fontSize: '10px' }}>by {story.author}</div>
                  </td>
                  {/* Published */}
                  <td style={{ padding: '0.5rem', color: textSecondary, fontSize: '11px' }}>{formatDate(story.published_at)}</td>
                  {/* Genre */}
                  <td style={{ padding: '0.5rem', color: textSecondary, fontSize: '11px' }}>{story.genre}</td>
                  {/* Duration */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: textPrimary }}>{story.duration_mins}m</td>
                  {/* Credits */}
                  <td style={{ padding: '0.5rem', textAlign: 'center', color: '#f97316', fontWeight: 600 }}>{story.credits}</td>
                  {/* Series */}
                  <td style={{ padding: '0.5rem', color: textSecondary, fontSize: '10px' }}>
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
                    <span style={{ color: textSecondary, fontSize: '9px' }}> ({story.review_count || 0})</span>
                  </td>
                  {/* Flag */}
                  <td style={{ padding: '0.5rem', position: 'relative' }}>
                    <button onClick={() => setFlagDropdown(flagDropdown === story.id ? null : story.id)} style={{ backgroundColor: FLAG_OPTIONS.find(f => f.value === story.flag)?.color || '#e5e5e5', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '9px', fontWeight: 600, minWidth: '70px' }}>
                      {FLAG_OPTIONS.find(f => f.value === story.flag)?.label || 'Set Flag'}
                    </button>
                    {flagDropdown === story.id && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '6px', padding: '0.25rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '110px' }}>
                        {FLAG_OPTIONS.map(flag => (
                          <button key={flag.value || 'none'} onClick={() => updateFlag(story.id, flag.value)} style={{ display: 'block', width: '100%', textAlign: 'left', backgroundColor: story.flag === flag.value ? '#f5f5f5' : 'transparent', color: textPrimary, border: 'none', padding: '5px 7px', cursor: 'pointer', fontSize: '10px', borderRadius: '4px' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: flag.color, marginRight: '5px' }}></span>
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
