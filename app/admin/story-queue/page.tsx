'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type QueueStatus = 'queued' | 'in_v2' | 'ready_for_asc' | 'published'
type MessageType = '' | 'success' | 'error'

type QueueItem = {
  id: string
  title: string
  premise: string
  setting: string
  primaryGenre: string
  secondaryGenre: string
  tertiaryGenre: string
  duration: string
  authorTarget: string
  notes: string
  storyType?: 'standalone' | 'series'
  letClaudeCreateTitles?: boolean
  seriesTitle?: string
  totalEpisodes?: string
  status: QueueStatus
  createdAt: string
  updatedAt: string
}

type QueueGroup =
  | { type: 'standalone'; item: QueueItem }
  | { type: 'series'; key: string; seriesTitle: string; items: QueueItem[] }

const GENRES = [
  'Thriller',
  'Mystery',
  'Horror',
  'Western',
  'Comedy',
  'Drama',
  'Romance',
  'Sci-Fi',
  'Adventure',
  'Historical Drama',
  'Supernatural',
  'Family/Heartwarming',
]

const DURATIONS = ['10 min', '15 min', '20 min', '25 min', '30 min', '45 min', '60 min']

const STATUS_LABELS: Record<QueueStatus, string> = {
  queued: 'Queued',
  in_v2: 'In V2',
  ready_for_asc: 'Ready for ASC',
  published: 'Published',
}

function readSeriesPlanValue(notes: string, label: string) {
  const match = notes.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() || ''
}

function normalizeQueueItem(item: QueueItem): QueueItem {
  const notes = item.notes || ''
  const noteType = readSeriesPlanValue(notes, 'Type')
  const storyType = item.storyType || (noteType.toLowerCase() === 'series' ? 'series' : 'standalone')
  const parsedClaudeTitles = readSeriesPlanValue(notes, 'Let Claude create titles')
  const letClaudeCreateTitles = item.letClaudeCreateTitles ?? parsedClaudeTitles.toLowerCase() !== 'false'

  if (storyType !== 'series') {
    return { ...item, storyType: 'standalone', letClaudeCreateTitles }
  }

  return {
    ...item,
    storyType: 'series',
    letClaudeCreateTitles,
    seriesTitle: item.seriesTitle || readSeriesPlanValue(notes, 'Series title'),
    totalEpisodes: item.totalEpisodes || readSeriesPlanValue(notes, 'Total episodes'),
  }
}

function durationMinutes(duration: string) {
  const match = String(duration || '').match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

function formatAverageRuntime(items: QueueItem[]) {
  const values = items.map((item) => durationMinutes(item.duration)).filter((value) => value > 0)
  if (!values.length) return '—'
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return `${Math.round(average)} min`
}

function statusSummary(items: QueueItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const label = STATUS_LABELS[item.status] || item.status
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})

  return Object.entries(counts).map(([label, count]) => `${count} ${label}`).join(' · ')
}

export default function StoryQueuePage() {
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<MessageType>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [adminGenres, setAdminGenres] = useState<string[]>(GENRES)

  const [form, setForm] = useState({
    storyType: 'standalone' as 'standalone' | 'series',
    storyTitle: '',
    letClaudeCreateTitles: true,
    totalEpisodes: '1',
    primaryGenre: 'Thriller',
    secondaryGenre: '',
    tertiaryGenre: '',
    duration: '15 min',
    settingSeed: '',
    notes: '',
    authorTarget: '',
  })

  async function loadItems() {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/story-queue', { cache: 'no-store' })
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items.map(normalizeQueueItem) : [])
    } catch (err: any) {
      showMessage(`Failed to load queue: ${err?.message || err}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadAdminGenres() {
      try {
        const res = await fetch('/api/admin/genres?active=true', { cache: 'no-store' })
        const data = await res.json()
        const genreNames = Array.isArray(data?.genres)
          ? data.genres.map((genre: any) => String(genre?.name || '').trim()).filter(Boolean)
          : []

        if (!ignore && res.ok && data?.success && genreNames.length > 0) {
          setAdminGenres(genreNames)
        }
      } catch (err) {
        console.warn('Failed to load admin genres; using fallback genres', err)
      }
    }

    loadAdminGenres()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!message) return
    if (messageType === 'error') return
    const t = window.setTimeout(() => {
      setMessage('')
      setMessageType('')
    }, 2200)
    return () => window.clearTimeout(t)
  }, [message, messageType])

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])
  const queueGroups = useMemo<QueueGroup[]>(() => {
    const groups: QueueGroup[] = []
    const seriesGroups = new Map<string, QueueItem[]>()

    for (const item of items) {
      const itemEpisodeCount = Math.max(1, Number(item.totalEpisodes || 1))
      const isSeries = item.storyType === 'series' || itemEpisodeCount > 1
      if (!isSeries) {
        groups.push({ type: 'standalone', item })
        continue
      }

      const seriesTitle = String(item.seriesTitle || '').trim()
      const title = item.letClaudeCreateTitles === false ? String(item.title || '').trim() : ''
      const keySource = seriesTitle || title || item.id
      const key = keySource.toLowerCase()
      const current = seriesGroups.get(key) || []
      current.push(item)
      seriesGroups.set(key, current)
    }

    for (const [key, groupItems] of seriesGroups) {
      groups.push({
        type: 'series',
        key,
        seriesTitle: groupItems[0]?.seriesTitle || groupItems[0]?.title || 'Claude will create title',
        items: groupItems,
      })
    }

    return groups
  }, [items])
  const genreOptions = useMemo(() => {
    const options = [...adminGenres]
    if (form.primaryGenre && !options.some((genre) => genre.toLowerCase() === form.primaryGenre.toLowerCase())) {
      options.unshift(form.primaryGenre)
    }
    return options
  }, [adminGenres, form.primaryGenre])
  const plannedEpisodeCount = Math.max(1, Number(form.totalEpisodes || 1))
  const plannedStoryType: 'standalone' | 'series' = plannedEpisodeCount > 1 ? 'series' : 'standalone'

  function showMessage(text: string, type: MessageType = 'success') {
    setMessage(text)
    setMessageType(type)
  }

  function notesWithEpisodePlan() {
    const plan = [
      'Series Plan:',
      `Type: ${plannedStoryType}`,
      `Let Claude create titles: ${form.letClaudeCreateTitles ? 'true' : 'false'}`,
      `Story title: ${form.letClaudeCreateTitles ? '' : form.storyTitle.trim()}`,
      `Series title: ${plannedStoryType === 'series' && !form.letClaudeCreateTitles ? form.storyTitle.trim() : ''}`,
      `Total episodes: ${form.totalEpisodes}`,
    ].join('\n')

    return [form.notes.trim(), plan].filter(Boolean).join('\n\n')
  }

  async function responseError(step: 'idea generation' | 'queue save', res: Response) {
    const status = `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
    const txt = await res.text()
    let detail = txt.trim()

    if (detail) {
      try {
        const parsed = JSON.parse(detail)
        detail = String(parsed.error || parsed.message || parsed.status || detail)
      } catch {
        // Plain-text responses are still useful diagnostics.
      }
    }

    return `${step} failed (${status})${detail ? `: ${detail}` : ''}`
  }

  async function generateIdea() {
    if (!form.letClaudeCreateTitles && !form.storyTitle.trim()) {
      showMessage('Story title is required when Claude title creation is disabled.', 'error')
      return
    }

    setIsGenerating(true)
    showMessage('', '')
    try {
      const res = await fetch('/api/admin/generate-story-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          storyType: plannedStoryType,
          title: form.letClaudeCreateTitles ? '' : form.storyTitle.trim(),
          letClaudeCreateTitles: form.letClaudeCreateTitles,
        }),
      })

      if (!res.ok) {
        throw new Error(await responseError('idea generation', res))
      }

      const data = await res.json()

      const createRes = await fetch('/api/admin/story-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.letClaudeCreateTitles ? '' : form.storyTitle.trim(),
          premise: data.premise || '',
          setting: data.setting || form.settingSeed || '',
          primaryGenre: form.primaryGenre,
          secondaryGenre: form.secondaryGenre,
          tertiaryGenre: form.tertiaryGenre,
          duration: form.duration,
          authorTarget: data.authorTarget || form.authorTarget || '',
          notes: notesWithEpisodePlan(),
          storyType: plannedStoryType,
          letClaudeCreateTitles: form.letClaudeCreateTitles,
          seriesTitle: plannedStoryType === 'series' && !form.letClaudeCreateTitles ? form.storyTitle.trim() : '',
          totalEpisodes: plannedStoryType === 'series' ? form.totalEpisodes : '1',
          status: 'queued',
        }),
      })

      if (!createRes.ok) {
        throw new Error(await responseError('queue save', createRes))
      }

      const created = await createRes.json()
      setSelectedId(created?.item?.id || null)
      await loadItems()
      showMessage('Story idea generated and queued.')
    } catch (err: any) {
      showMessage(`Generation failed: ${err?.message || err}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function updateStatus(id: string, status: QueueStatus) {
    try {
      const res = await fetch('/api/admin/story-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error(await res.text())
      await loadItems()
      showMessage(`Marked ${STATUS_LABELS[status]}.`)
    } catch (err: any) {
      showMessage(`Status update failed: ${err?.message || err}`, 'error')
    }
  }

  function productionUrlFor(item: QueueItem) {
    const params = new URLSearchParams({ queueId: item.id })
    params.set('letClaudeCreateTitles', item.letClaudeCreateTitles === false ? 'false' : 'true')
    if (item.letClaudeCreateTitles === false && item.title) params.set('title', item.title)
    if (item.storyType === 'series') {
      params.set('storyType', 'series')
      if (item.seriesTitle) params.set('seriesTitle', item.seriesTitle)
      if (item.totalEpisodes) params.set('totalEpisodes', item.totalEpisodes)
    }
    return `/admin/story-production-v2?${params.toString()}`
  }

  async function markInV2(item: QueueItem) {
    await fetch('/api/admin/story-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        status: 'in_v2',
        storyType: item.storyType || 'standalone',
        letClaudeCreateTitles: item.letClaudeCreateTitles ?? true,
        title: item.letClaudeCreateTitles === false ? item.title : '',
        seriesTitle: item.seriesTitle || '',
        totalEpisodes: item.totalEpisodes || '',
      }),
    })
  }

  async function sendToProduction(item: QueueItem) {
    await markInV2(item)
    await loadItems()
    router.push(productionUrlFor(item))
  }

  async function sendSeriesToProduction(series: Extract<QueueGroup, { type: 'series' }>) {
    const firstEpisode = series.items[0]
    if (!firstEpisode) return

    try {
      for (const item of series.items) {
        await markInV2(item)
      }
      await loadItems()
      router.push(productionUrlFor(firstEpisode))
    } catch (err: any) {
      showMessage(`Series handoff failed: ${err?.message || err}`, 'error')
    }
  }

  async function removeItem(id: string) {
    if (!confirm('Delete this story idea?')) return
    try {
      const res = await fetch(`/api/admin/story-queue?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      if (selectedId === id) setSelectedId(null)
      await loadItems()
      showMessage('Deleted.')
    } catch (err: any) {
      showMessage(`Delete failed: ${err?.message || err}`, 'error')
    }
  }

  function regenerate(item: QueueItem) {
    setForm((prev) => ({
      ...prev,
      primaryGenre: item.primaryGenre || prev.primaryGenre,
      secondaryGenre: item.secondaryGenre || '',
      tertiaryGenre: item.tertiaryGenre || '',
      duration: item.duration || prev.duration,
      settingSeed: item.setting || '',
      notes: item.notes || '',
      authorTarget: item.authorTarget || '',
      storyType: item.storyType || 'standalone',
      storyTitle: item.letClaudeCreateTitles === false ? item.title || '' : '',
      letClaudeCreateTitles: item.letClaudeCreateTitles ?? true,
      totalEpisodes: item.storyType === 'series' ? item.totalEpisodes || '3' : '1',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showMessage('Loaded story settings into generator.')
  }

  function regenerateSeriesSetup(series: Extract<QueueGroup, { type: 'series' }>) {
    const firstEpisode = series.items[0]
    if (!firstEpisode) return
    regenerate(firstEpisode)
  }

  async function removeSeries(series: Extract<QueueGroup, { type: 'series' }>) {
    if (!confirm(`Delete all ${series.items.length} queued episodes for ${series.seriesTitle}?`)) return

    try {
      for (const item of series.items) {
        const res = await fetch(`/api/admin/story-queue?id=${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error(await res.text())
      }
      if (series.items.some((item) => item.id === selectedId)) setSelectedId(null)
      await loadItems()
      showMessage('Deleted series queue.')
    } catch (err: any) {
      showMessage(`Delete failed: ${err?.message || err}`, 'error')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Story Queue</h1>
        <p className="text-sm text-gray-500 mt-2">
          Pick a genre and duration, generate an idea, then send it straight to Story Production V2.
        </p>
        {message ? (
          <div className="mt-3 inline-block rounded bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div className="font-semibold text-lg">Generate Story Idea</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm font-semibold">
              Number of Episodes
              <input
                className="mt-1 border rounded p-2 w-full"
                type="number"
                min="1"
                value={form.totalEpisodes}
                onChange={(e) => setForm({
                  ...form,
                  totalEpisodes: e.target.value,
                  storyType: Number(e.target.value || 1) > 1 ? 'series' : 'standalone',
                })}
              />
            </label>
            <label className="flex items-center gap-2 rounded border bg-gray-50 px-3 py-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.letClaudeCreateTitles}
                onChange={(e) => setForm({ ...form, letClaudeCreateTitles: e.target.checked })}
              />
              Let Claude create titles
            </label>
          </div>

          {!form.letClaudeCreateTitles ? (
            <input
              className="border rounded p-2 w-full"
              placeholder="Story title"
              value={form.storyTitle}
              onChange={(e) => setForm({ ...form, storyTitle: e.target.value })}
            />
          ) : (
            <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-2 text-sm font-semibold text-gray-700">
              Story title: Claude will create title
            </div>
          )}

          <select className="border rounded p-2 w-full" value={form.primaryGenre} onChange={(e) => setForm({ ...form, primaryGenre: e.target.value })}>
            {genreOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <input className="border rounded p-2 w-full" placeholder="Secondary genre (optional)" value={form.secondaryGenre} onChange={(e) => setForm({ ...form, secondaryGenre: e.target.value })} />
          <input className="border rounded p-2 w-full" placeholder="Tertiary genre (optional)" value={form.tertiaryGenre} onChange={(e) => setForm({ ...form, tertiaryGenre: e.target.value })} />

          <select className="border rounded p-2 w-full" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <input className="border rounded p-2 w-full" placeholder="Setting seed (optional)" value={form.settingSeed} onChange={(e) => setForm({ ...form, settingSeed: e.target.value })} />
          <input className="border rounded p-2 w-full" placeholder="Author target (optional)" value={form.authorTarget} onChange={(e) => setForm({ ...form, authorTarget: e.target.value })} />

          <textarea className="border rounded p-2 w-full h-28" placeholder="Notes or constraints (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <button onClick={generateIdea} disabled={isGenerating} className="bg-black text-white px-4 py-2 rounded disabled:opacity-50">
            {isGenerating ? 'Generating…' : 'Generate Story Idea'}
          </button>
        </section>

        <section className="bg-white border border-black rounded-lg p-4 space-y-4">
          <div className="font-semibold text-lg">Queued Ideas ({queueGroups.length})</div>

          {isLoading ? (
            <div className="text-sm text-gray-500">Loading queue…</div>
          ) : !items.length ? (
            <div className="text-sm text-gray-500">No story ideas queued yet.</div>
          ) : (
            <div className="space-y-3">
              {queueGroups.map((group) => {
                if (group.type === 'series') {
                  const firstEpisode = group.items[0]
                  const totalEpisodes = firstEpisode?.totalEpisodes || String(group.items.length)
                  const genres = Array.from(new Set(group.items.map((item) => item.primaryGenre).filter(Boolean))).join(' · ') || '—'
                  const selectedInSeries = group.items.some((item) => item.id === selectedId)
                  const title = firstEpisode?.letClaudeCreateTitles === false ? group.seriesTitle : 'Claude will create title'

                  return (
                    <div
                      key={`series-${group.key}`}
                      className={`border rounded p-3 ${selectedInSeries ? 'border-black bg-blue-50' : 'border-blue-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => firstEpisode ? setSelectedId(firstEpisode.id) : null}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Series</div>
                          <div className="font-semibold text-lg">{title}</div>
                          <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-gray-700 sm:grid-cols-2">
                            <div><strong>Genre:</strong> {genres}</div>
                            <div><strong>Number of episodes:</strong> {totalEpisodes}</div>
                            <div><strong>Duration:</strong> {formatAverageRuntime(group.items)}</div>
                            <div><strong>Status:</strong> {statusSummary(group.items)}</div>
                          </div>
                        </button>
                        <div className="shrink-0 text-xs font-semibold text-gray-600">
                          Generate this entire series sequentially
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => regenerateSeriesSetup(group)} className="px-3 py-1 rounded border">
                          Regenerate Series Setup
                        </button>
                        <button onClick={() => sendSeriesToProduction(group)} className="px-3 py-1 rounded border bg-black text-white">
                          Send Series to Production
                        </button>
                        <button onClick={() => removeSeries(group)} className="px-3 py-1 rounded border text-red-700">
                          Delete Series
                        </button>
                      </div>
                    </div>
                  )
                }

                const item = group.item

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`border rounded p-3 cursor-pointer ${selectedId === item.id ? 'border-black bg-gray-50' : 'border-gray-300 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          {item.letClaudeCreateTitles === false ? item.title : 'Claude will create title'}
                        </div>
                        <div className="text-sm text-gray-700 mt-1">{item.premise}</div>
                        <div className="text-xs text-gray-500 mt-2">{item.setting || 'No setting'}</div>
                        <div className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          Standalone · 1 episode
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-xs font-semibold text-gray-700">
                          {[item.primaryGenre, item.duration].filter(Boolean).join(' · ')}
                        </div>
                        <div className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded">
                          {STATUS_LABELS[item.status]}
                        </div>
                      </div>
                    </div>

                    {selectedId === item.id ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={(e) => { e.stopPropagation(); regenerate(item) }} className="px-3 py-1 rounded border">
                          Regenerate Setup
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); sendToProduction(item) }} className="px-3 py-1 rounded border bg-black text-white">
                          Send to Production
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeItem(item.id) }} className="px-3 py-1 rounded border text-red-700">
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {selected ? (
            <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
              <div><strong>Title:</strong> {selected.letClaudeCreateTitles === false ? selected.title : 'Claude will create title'}</div>
              <div><strong>Let Claude Create Titles:</strong> {selected.letClaudeCreateTitles === false ? 'no' : 'yes'}</div>
              <div><strong>Type:</strong> {selected.storyType === 'series' ? 'Series' : 'Standalone'}</div>
              {selected.storyType === 'series' ? (
                <>
                  <div><strong>Number of Episodes:</strong> {selected.totalEpisodes || '—'}</div>
                </>
              ) : null}
              <div><strong>Premise:</strong> {selected.premise}</div>
              <div><strong>Setting:</strong> {selected.setting || '—'}</div>
              <div><strong>Genre · Duration:</strong> {[
                [selected.primaryGenre, selected.secondaryGenre, selected.tertiaryGenre].filter(Boolean).join(' · ') || '—',
                selected.duration || '—'
              ].join(' · ')}</div>
              <div><strong>Author Target:</strong> {selected.authorTarget || '—'}</div>
              <div><strong>Notes:</strong> {selected.notes || '—'}</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
