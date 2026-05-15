'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SortKey =
  | 'title'
  | 'type'
  | 'genre'
  | 'author'
  | 'duration_mins'
  | 'published_on'
  | 'downloads_total'
  | 'downloads_month'
  | 'pct_started'
  | 'pct_finished'
  | 'pct_skipped'
  | 'avg_rating'
  | 'review_count'
  | 'quality_score'

type SortDirection = 'asc' | 'desc'

type PublishedStory = {
  id: string
  title: string
  genre: string | null
  author: string | null
  duration_mins: number | null
  cover_url: string | null
  series_id: string | null
  series_name: string | null
  series_number: number | null
  series_total: number | null
  episode_title: string | null
  is_hidden: boolean | null
  created_at: string | null
  published_on: string | null
  downloads_total: number | null
  downloads_month: number | null
  pct_started: number | null
  pct_finished: number | null
  pct_skipped: number | null
  avg_rating: number | null
  review_count: number | null
  quality_score?: number | null
  episode_number?: number | null
}

type PublishedRow =
  | { type: 'standalone'; key: string; story: PublishedStory }
  | { type: 'series'; key: string; seriesId: string; title: string; stories: PublishedStory[]; aggregate: PublishedStory }

const bg = '#FAF9F6'
const cardBg = '#FFFFFF'
const textPrimary = '#1a1a1a'
const textSecondary = '#4a4a4a'
const border = '#e0e0e0'

const columns: Array<{ key: SortKey; label: string; align?: 'left' | 'right' }> = [
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'genre', label: 'Genre' },
  { key: 'author', label: 'Author' },
  { key: 'duration_mins', label: 'Duration', align: 'right' },
  { key: 'published_on', label: 'Published', align: 'right' },
  { key: 'downloads_total', label: 'Plays', align: 'right' },
  { key: 'downloads_month', label: 'Month', align: 'right' },
  { key: 'pct_started', label: 'Started', align: 'right' },
  { key: 'pct_finished', label: 'Finished', align: 'right' },
  { key: 'pct_skipped', label: 'Skipped', align: 'right' },
  { key: 'avg_rating', label: 'Rating', align: 'right' },
  { key: 'review_count', label: 'Reviews', align: 'right' },
  { key: 'quality_score', label: 'Score', align: 'right' },
]

function scoreFromScriptJson(scriptJson: any): number | null {
  const candidates = [
    scriptJson?.pre_audio_review?.total,
    scriptJson?.series_score_validate?.score_total,
    scriptJson?.series_score_validate?.total,
  ]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value)) return value
  }
  return null
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatNumber(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString()
}

function formatPercent(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value))}%`
}

function formatRating(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return '—'
  return Number(value).toFixed(1)
}

function formatScore(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(Number.isInteger(value) ? 0 : 1)}/25`
}

function hasSeriesRelationship(story: PublishedStory) {
  return Boolean(String(story.series_id || '').trim())
}

function displayTitle(story: PublishedStory) {
  if (story.episode_title && story.episode_title.trim()) return story.episode_title.trim()
  return story.title || 'Untitled Story'
}

function displaySeriesTitle(stories: PublishedStory[]) {
  const first = stories[0]
  const seriesName = String(first?.series_name || '').trim()
  if (seriesName && seriesName.toLowerCase() !== 'none') return seriesName
  return first?.title || 'Untitled Series'
}

function average(values: Array<number | null | undefined>) {
  const nums = values.map(Number).filter(Number.isFinite)
  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function sum(values: Array<number | null | undefined>) {
  return values.map(Number).filter(Number.isFinite).reduce((total, value) => total + value, 0)
}

function aggregateSeries(stories: PublishedStory[], title: string): PublishedStory {
  const first = stories[0]
  return {
    ...first,
    title,
    episode_title: null,
    duration_mins: sum(stories.map(story => story.duration_mins)),
    downloads_total: sum(stories.map(story => story.downloads_total)),
    downloads_month: sum(stories.map(story => story.downloads_month)),
    pct_started: average(stories.map(story => story.pct_started)),
    pct_finished: average(stories.map(story => story.pct_finished)),
    pct_skipped: average(stories.map(story => story.pct_skipped)),
    avg_rating: average(stories.map(story => story.avg_rating)),
    review_count: sum(stories.map(story => story.review_count)),
    quality_score: average(stories.map(story => story.quality_score)),
    published_on: stories
      .map(story => story.published_on)
      .filter(Boolean)
      .sort()[0] || first?.published_on || null,
  }
}

function buildRows(stories: PublishedStory[]): PublishedRow[] {
  const rows: PublishedRow[] = []
  const series = new Map<string, PublishedStory[]>()

  stories.forEach((story) => {
    if (hasSeriesRelationship(story)) {
      const key = String(story.series_id)
      const current = series.get(key) || []
      current.push(story)
      series.set(key, current)
    } else {
      rows.push({ type: 'standalone', key: `story:${story.id}`, story })
    }
  })

  series.forEach((items, seriesId) => {
    const sorted = [...items].sort((a, b) => Number(a.series_number || a.episode_number || 0) - Number(b.series_number || b.episode_number || 0))
    const title = displaySeriesTitle(sorted)
    rows.push({
      type: 'series',
      key: `series:${seriesId}`,
      seriesId,
      title,
      stories: sorted,
      aggregate: aggregateSeries(sorted, title),
    })
  })

  return rows
}

function rowValue(row: PublishedRow, key: SortKey): string | number {
  const story = row.type === 'series' ? row.aggregate : row.story
  if (key === 'type') return row.type === 'series' ? 'Series' : 'Standalone'
  if (key === 'title') return row.type === 'series' ? row.title : displayTitle(story)
  const value = (story as any)[key]
  if (value == null) return ''
  if (key === 'published_on') return new Date(value).getTime() || 0
  if (typeof value === 'number') return value
  return String(value).toLowerCase()
}

function compareRows(a: PublishedRow, b: PublishedRow, key: SortKey, direction: SortDirection) {
  const av = rowValue(a, key)
  const bv = rowValue(b, key)
  let result = 0
  if (typeof av === 'number' && typeof bv === 'number') result = av - bv
  else result = String(av).localeCompare(String(bv))
  return direction === 'asc' ? result : -result
}

function metricCell(story: PublishedStory, key: SortKey) {
  if (key === 'duration_mins') return story.duration_mins ? `${Math.round(story.duration_mins)} min` : '—'
  if (key === 'published_on') return formatDate(story.published_on)
  if (key === 'downloads_total') return formatNumber(story.downloads_total)
  if (key === 'downloads_month') return formatNumber(story.downloads_month)
  if (key === 'pct_started') return formatPercent(story.pct_started)
  if (key === 'pct_finished') return formatPercent(story.pct_finished)
  if (key === 'pct_skipped') return formatPercent(story.pct_skipped)
  if (key === 'avg_rating') return formatRating(story.avg_rating)
  if (key === 'review_count') return formatNumber(story.review_count)
  if (key === 'quality_score') return formatScore(story.quality_score)
  return '—'
}

function SortButton({ column, sortKey, sortDirection, onSort }: { column: typeof columns[number]; sortKey: SortKey; sortDirection: SortDirection; onSort: (key: SortKey) => void }) {
  const active = sortKey === column.key
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      style={{
        border: 'none',
        background: 'transparent',
        color: active ? '#f97316' : textSecondary,
        fontWeight: 800,
        fontSize: '11px',
        cursor: 'pointer',
        padding: 0,
        textAlign: column.align || 'left',
        width: '100%',
      }}
    >
      {column.label}{active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}

function PublishedRowView({ row, expanded, onToggle }: { row: PublishedRow; expanded: boolean; onToggle: () => void }) {
  const story = row.type === 'series' ? row.aggregate : row.story
  const isSeries = row.type === 'series'
  return (
    <>
      <tr style={{ borderBottom: `1px solid ${border}` }}>
        <td style={{ padding: '12px', minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isSeries ? (
              <button onClick={onToggle} style={{ border: `1px solid ${border}`, background: '#fff', borderRadius: '5px', width: '26px', height: '26px', cursor: 'pointer', color: textPrimary }}>
                {expanded ? '−' : '+'}
              </button>
            ) : <span style={{ width: '26px' }} />}
            <img src={story.cover_url || '/images/default-cover.png'} alt="" style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover', border: `1px solid ${border}` }} />
            <div>
              <div style={{ color: textPrimary, fontWeight: 800, fontSize: '13px' }}>{isSeries ? row.title : displayTitle(story)}</div>
              {isSeries && <div style={{ color: textSecondary, fontSize: '11px', marginTop: '2px' }}>{row.stories.length} episodes</div>}
              {!isSeries && story.title !== displayTitle(story) && <div style={{ color: textSecondary, fontSize: '11px', marginTop: '2px' }}>{story.title}</div>}
            </div>
          </div>
        </td>
        <td style={tdStyle}>{isSeries ? 'Series' : 'Standalone'}</td>
        <td style={tdStyle}>{story.genre || '—'}</td>
        <td style={tdStyle}>{story.author || '—'}</td>
        {columns.slice(4).map(column => <td key={column.key} style={{ ...tdStyle, textAlign: 'right' }}>{metricCell(story, column.key)}</td>)}
      </tr>
      {isSeries && expanded && row.stories.map((episode) => (
        <tr key={episode.id} style={{ backgroundColor: '#f8fafc', borderBottom: `1px solid ${border}` }}>
          <td style={{ padding: '10px 12px 10px 58px', color: textPrimary, fontSize: '12px', fontWeight: 700 }}>
            Episode {episode.series_number || episode.episode_number || '—'}: {displayTitle(episode)}
          </td>
          <td style={tdStyle}>Episode</td>
          <td style={tdStyle}>{episode.genre || '—'}</td>
          <td style={tdStyle}>{episode.author || '—'}</td>
          {columns.slice(4).map(column => <td key={column.key} style={{ ...tdStyle, textAlign: 'right' }}>{metricCell(episode, column.key)}</td>)}
        </tr>
      ))}
    </>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  color: textSecondary,
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

export default function PublishedStoriesPage() {
  const [stories, setStories] = useState<PublishedStory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('published_on')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchPublishedStories()
  }, [])

  async function fetchPublishedStories() {
    setLoading(true)
    setError('')
    try {
      const { data: publicRows, error: publicError } = await supabase
        .from('stories')
        .select('id,script_json,episode_number,status,is_hidden')
        .eq('status', 'published')
        .eq('is_hidden', false)

      if (publicError) throw new Error(`public stories lookup failed: ${publicError.message}`)
      const publicIds = (publicRows || []).map((row: any) => row.id).filter(Boolean)
      if (publicIds.length === 0) {
        setStories([])
        return
      }

      const scoreById = new Map(
        (publicRows || []).map((row: any) => [row.id, { score: scoreFromScriptJson(row.script_json), episode_number: row.episode_number ?? null }])
      )

      const { data: analyticsRows, error: analyticsError } = await supabase
        .from('story_analytics')
        .select('id,title,genre,author,duration_mins,cover_url,series_id,series_name,episode_title,is_hidden,series_number,series_total,created_at,published_on,downloads_total,downloads_month,pct_started,pct_finished,pct_skipped,avg_rating,review_count')
        .eq('is_hidden', false)
        .in('id', publicIds)
        .order('created_at', { ascending: false })

      if (analyticsError) throw new Error(`story_analytics failed: ${analyticsError.message}`)

      const rows = (analyticsRows || [])
        .filter((row: any) => Boolean(row.cover_url))
        .map((row: any) => ({
          ...row,
          quality_score: scoreById.get(row.id)?.score ?? null,
          episode_number: scoreById.get(row.id)?.episode_number ?? null,
        })) as PublishedStory[]

      setStories(rows)
    } catch (err) {
      console.error('[admin/stories] Published Stories load failed:', err)
      setError(err instanceof Error ? err.message : 'Published Stories failed to load')
      setStories([])
    } finally {
      setLoading(false)
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection(key === 'title' || key === 'type' || key === 'genre' || key === 'author' ? 'asc' : 'desc')
  }

  const rows = useMemo(() => buildRows(stories), [stories])
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter((row) => {
          const story = row.type === 'series' ? row.aggregate : row.story
          const title = row.type === 'series' ? row.title : displayTitle(story)
          return [title, story.author, story.genre, story.series_name]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(q))
        })
      : rows
    return filtered.slice().sort((a, b) => compareRows(a, b, sortKey, sortDirection))
  }, [rows, search, sortKey, sortDirection])

  const totals = useMemo(() => {
    const seriesCount = rows.filter(row => row.type === 'series').length
    const standaloneCount = rows.filter(row => row.type === 'standalone').length
    return {
      topLevel: rows.length,
      episodesAndStories: stories.length,
      seriesCount,
      standaloneCount,
      downloadsTotal: sum(stories.map(story => story.downloads_total)),
      downloadsMonth: sum(stories.map(story => story.downloads_month)),
      avgCompletion: average(stories.map(story => story.pct_finished)),
    }
  }, [rows, stories])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: textPrimary, margin: 0 }}>Published Stories</h1>
          <p style={{ color: textSecondary, fontSize: '13px', margin: '4px 0 0 0' }}>
            Public app library inventory and performance stats only.
          </p>
        </div>
        <button onClick={fetchPublishedStories} style={{ padding: '0.55rem 0.9rem', borderRadius: '6px', border: `1px solid ${border}`, backgroundColor: '#ffffff', color: textPrimary, fontWeight: 700, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <SummaryCard label="Library cards" value={formatNumber(totals.topLevel)} detail={`${totals.seriesCount} series · ${totals.standaloneCount} standalone`} />
        <SummaryCard label="Stories / episodes" value={formatNumber(totals.episodesAndStories)} detail="Rows visible in public library source" />
        <SummaryCard label="Total plays" value={formatNumber(totals.downloadsTotal)} detail={`${formatNumber(totals.downloadsMonth)} this month`} />
        <SummaryCard label="Avg completion" value={formatPercent(totals.avgCompletion)} detail="Across visible stories" />
      </div>

      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search published title, series, author, or genre..."
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: '6px', border: `1px solid ${border}`, color: '#000', backgroundColor: '#fff', fontSize: '14px' }}
        />
      </div>

      {error && (
        <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '0.9rem', marginBottom: '1rem', fontSize: '13px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${border}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1320px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: `1px solid ${border}` }}>
              {columns.map(column => (
                <th key={column.key} style={{ padding: '11px 12px', textAlign: column.align || 'left', whiteSpace: 'nowrap' }}>
                  <SortButton column={column} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => (
              <PublishedRowView
                key={row.key}
                row={row}
                expanded={Boolean(expandedSeries[row.key])}
                onToggle={() => setExpandedSeries(prev => ({ ...prev, [row.key]: !prev[row.key] }))}
              />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: '3rem', textAlign: 'center', color: textSecondary }}>
                  No public app stories match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.75rem', color: textSecondary, fontSize: '12px', lineHeight: 1.5 }}>
        Eligibility matches the public library: published stories, not hidden, present in story_analytics, analytics row not hidden, and cover present.
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '0.9rem' }}>
      <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ color: textPrimary, fontSize: '24px', fontWeight: 900, marginTop: '4px' }}>{value}</div>
      <div style={{ color: textSecondary, fontSize: '12px', marginTop: '3px' }}>{detail}</div>
    </div>
  )
}
