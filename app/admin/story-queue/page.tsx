'use client'

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type QueueStatus =
  | 'queued'
  | 'dispatched'
  | 'producing'
  | 'in_v2'
  | 'ready_for_asc'
  | 'failed'
  | 'complete'
  | 'published'
  | 'archived'
type MessageType = '' | 'success' | 'error'
type QueueTab = 'active' | 'production' | 'failed' | 'completed' | 'archived'
type BibleImportSummary = {
  imported: number
  total: number
  skipped: Array<{ index: number; reason: string }>
}

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
  bible?: string | null
  authorized: boolean
  releasedToHal: boolean
  releasedToHalAt?: string | null
  storyType?: 'standalone' | 'series'
  letClaudeCreateTitles?: boolean
  seriesTitle?: string
  totalEpisodes?: string | number | null
  status: QueueStatus
  createdAt: string
  updatedAt: string
}

type QueueTypeFilter = 'all' | 'standalone' | 'series'
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
  dispatched: 'Dispatched',
  producing: 'Producing',
  in_v2: 'In V2',
  ready_for_asc: 'Ready for ASC',
  failed: 'Failed',
  complete: 'Complete',
  published: 'Published',
  archived: 'Archived',
}

const QUEUE_TABS: Array<{ id: QueueTab; label: string; statuses: QueueStatus[] }> = [
  { id: 'active', label: 'Active Queue', statuses: ['queued'] },
  { id: 'production', label: 'In Production', statuses: ['dispatched', 'producing', 'in_v2', 'ready_for_asc'] },
  { id: 'failed', label: 'Failed', statuses: ['failed'] },
  { id: 'completed', label: 'Completed', statuses: ['complete', 'published'] },
  { id: 'archived', label: 'Archived', statuses: ['archived'] },
]

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
    return {
      ...item,
      authorized: item.authorized === true,
      releasedToHal: item.releasedToHal === true,
      releasedToHalAt: item.releasedToHalAt || null,
      storyType: 'standalone',
      letClaudeCreateTitles,
    }
  }

  return {
    ...item,
    authorized: item.authorized === true,
    releasedToHal: item.releasedToHal === true,
    releasedToHalAt: item.releasedToHalAt || null,
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

function queueTitle(item: QueueItem) {
  if (item.letClaudeCreateTitles === false && item.title) return item.title
  return item.seriesTitle || item.title || 'Claude will create title'
}

function itemEpisodeCount(item: QueueItem) {
  const count = Number(item.totalEpisodes || 1)
  return Number.isFinite(count) && count > 0 ? count : 1
}

function itemQueueType(item: QueueItem): 'standalone' | 'series' {
  return item.storyType === 'series' || itemEpisodeCount(item) > 1 ? 'series' : 'standalone'
}

function parseBibleDetail(item: QueueItem): { bible: any | null; error: string | null } {
  if (!item.bible) return { bible: null, error: 'Bible detail unavailable.' }

  try {
    return { bible: JSON.parse(item.bible), error: null }
  } catch {
    return { bible: null, error: 'Bible detail unavailable.' }
  }
}

function readableValue(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean).join(', ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map((entry) => String(entry || '').trim()).filter(Boolean).join(', ')
  return String(value || '').trim()
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  const clean = readableValue(value)
  if (!clean) return null

  return (
    <div>
      <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 15, lineHeight: 1.45, marginTop: 2 }}>{clean}</div>
    </div>
  )
}

function BibleReadingPanel({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const { bible, error } = parseBibleDetail(item)
  const episodes = Array.isArray(bible?.episodes) ? bible.episodes : []
  const displayedEpisodeCount = readableValue(bible?.type).toLowerCase() === 'standalone'
    ? 1
    : bible?.total_episodes || itemEpisodeCount(item)

  return (
    <div
      style={{
        background: 'rgba(17, 24, 39, 0.24)',
        bottom: 0,
        left: 0,
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderLeft: '2px solid #111827',
          boxShadow: '-12px 0 30px rgba(17, 24, 39, 0.18)',
          color: '#111827',
          height: '100%',
          marginLeft: 'auto',
          maxWidth: 760,
          overflowY: 'auto',
          padding: 24,
          width: 'min(760px, 94vw)',
        }}
      >
        <div style={{ alignItems: 'flex-start', display: 'flex', gap: 16, justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Bible</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, margin: '4px 0 0' }}>
              {readableValue(bible?.title) || queueTitle(item)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '2px solid #111827',
              borderRadius: 8,
              color: '#111827',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 900,
              padding: '8px 12px',
            }}
          >
            Close
          </button>
        </div>

        {error ? (
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: 8,
              color: '#92400e',
              fontSize: 15,
              fontWeight: 800,
              marginTop: 18,
              padding: 12,
            }}
          >
            {error} Showing queue row fallback details instead.
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <DetailField label="Genre" value={bible?.genre || item.primaryGenre} />
            <DetailField label="Type" value={bible?.type || itemQueueType(item)} />
            <DetailField label="Episode count" value={displayedEpisodeCount} />
            <DetailField label="Tone" value={bible?.tone} />
          </div>
          <DetailField label="Logline" value={bible?.logline} />
          <DetailField label="Premise" value={bible?.premise || item.premise} />
          <DetailField label="Themes" value={bible?.themes} />
          <DetailField label="Do not break" value={bible?.do_not_break} />
        </div>

        {episodes.length ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
            {episodes.map((episode: any, index: number) => {
              const protagonist = episode?.protagonist || {}
              const whyWeInvest = readableValue(protagonist?.why_we_invest)

              return (
                <section
                  key={`${episode?.number || index}-${episode?.title || 'episode'}`}
                  style={{
                    background: '#f9fafb',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ color: '#4b5563', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    Episode {episode?.number || index + 1}
                  </div>
                  <h3 style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.2, margin: '4px 0 10px' }}>
                    {episode?.title || `Episode ${index + 1}`}
                  </h3>

                  {whyWeInvest ? (
                    <div
                      style={{
                        background: '#ecfdf5',
                        border: '2px solid #047857',
                        borderRadius: 8,
                        color: '#064e3b',
                        fontSize: 16,
                        fontWeight: 900,
                        lineHeight: 1.45,
                        marginBottom: 14,
                        padding: 12,
                      }}
                    >
                      Why we invest: {whyWeInvest}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gap: 12 }}>
                    <DetailField label="Protagonist who" value={protagonist?.who} />
                    <DetailField label="Protagonist want" value={protagonist?.want} />
                    <DetailField label="Flaw or wound" value={protagonist?.flaw_or_wound} />
                    <DetailField label="Hook" value={episode?.hook} />
                    <DetailField label="Setup" value={episode?.setup} />
                    <DetailField label="Rising action" value={episode?.rising_action} />
                    <DetailField label="Mid turn" value={episode?.mid_turn} />
                    <DetailField label="Escalation" value={episode?.escalation} />
                    <DetailField label="Resolution" value={episode?.resolution} />
                    <DetailField label="Key emotional beat" value={episode?.key_emotional_beat} />
                    <DetailField label="Audio notes" value={episode?.audio_notes} />
                  </div>
                </section>
              )
            })}
          </div>
        ) : error ? null : (
          <div style={{ color: '#6b7280', fontSize: 15, fontWeight: 700, marginTop: 24 }}>
            No episode details were included in this bible.
          </div>
        )}
      </aside>
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<QueueTab>('active')
  const [biblePasteText, setBiblePasteText] = useState('')
  const [isImportingBibles, setIsImportingBibles] = useState(false)
  const [isBibleDragActive, setIsBibleDragActive] = useState(false)
  const [queueSearch, setQueueSearch] = useState('')
  const [queueGenreFilter, setQueueGenreFilter] = useState('all')
  const [queueTypeFilter, setQueueTypeFilter] = useState<QueueTypeFilter>('all')
  const [readingBibleId, setReadingBibleId] = useState<string | null>(null)

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
  const activeTabConfig = QUEUE_TABS.find((tab) => tab.id === activeTab) || QUEUE_TABS[0]
  const tabCounts = useMemo(() => {
    const counts = Object.fromEntries(QUEUE_TABS.map((tab) => [tab.id, 0])) as Record<QueueTab, number>
    for (const item of items) {
      const tab = QUEUE_TABS.find((candidate) => candidate.statuses.includes(item.status))
      if (tab) counts[tab.id] += 1
    }
    return counts
  }, [items])
  const filteredItems = useMemo(() => {
    return items.filter((item) => activeTabConfig.statuses.includes(item.status))
  }, [items, activeTabConfig])
  const queueGenreOptions = useMemo(() => {
    return Array.from(new Set(filteredItems.map((item) => item.primaryGenre).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [filteredItems])
  const visibleItems = useMemo(() => {
    const search = queueSearch.trim().toLowerCase()

    return filteredItems.filter((item) => {
      const matchesSearch = !search || `${queueTitle(item)} ${item.premise || ''}`.toLowerCase().includes(search)
      const matchesGenre = queueGenreFilter === 'all' || item.primaryGenre === queueGenreFilter
      const type = itemQueueType(item)
      const matchesType = queueTypeFilter === 'all' || type === queueTypeFilter
      return matchesSearch && matchesGenre && matchesType
    })
  }, [filteredItems, queueGenreFilter, queueSearch, queueTypeFilter])
  const authorizedCount = useMemo(() => {
    return visibleItems.filter((item) => item.authorized).length
  }, [visibleItems])
  const releasedCount = useMemo(() => {
    return visibleItems.filter((item) => item.releasedToHal).length
  }, [visibleItems])
  const releasableItems = useMemo(() => {
    return visibleItems.filter((item) => item.authorized && !item.releasedToHal)
  }, [visibleItems])
  const allFilteredAuthorized = visibleItems.length > 0 && authorizedCount === visibleItems.length
  const readingItem = useMemo(() => items.find((item) => item.id === readingBibleId) || null, [items, readingBibleId])
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

  function parseBibleJson(rawText: string): any[] {
    const parsed = JSON.parse(rawText)
    const bibles = Array.isArray(parsed) ? parsed : parsed?.bibles
    if (!Array.isArray(bibles)) {
      throw new Error('JSON must contain a bibles array or be a bare array.')
    }
    return bibles
  }

  function bibleImportMessage(result: BibleImportSummary) {
    const skippedCount = result.skipped?.length || 0
    const skippedText = skippedCount
      ? ` (${skippedCount} skipped: ${result.skipped.map((entry) => `#${entry.index} ${entry.reason}`).join('; ')})`
      : ''
    return `Imported ${result.imported} of ${result.total}${skippedText}.`
  }

  async function importBiblesFromText(rawText: string) {
    const clean = rawText.trim()
    if (!clean) {
      showMessage('Paste or drop a JSON bible file first.', 'error')
      return
    }

    let bibles: any[]
    try {
      bibles = parseBibleJson(clean)
    } catch (err: any) {
      showMessage(`Invalid JSON: ${err?.message || err}`, 'error')
      return
    }

    setIsImportingBibles(true)
    try {
      const res = await fetch('/api/admin/story-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importBibles', bibles }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Import failed (${res.status})`)
      }

      await loadItems()
      setBiblePasteText('')
      const result = data?.result as BibleImportSummary | undefined
      showMessage(result ? bibleImportMessage(result) : 'Bible import complete.', result?.imported ? 'success' : 'error')
    } catch (err: any) {
      showMessage(`Bible import failed: ${err?.message || err}`, 'error')
    } finally {
      setIsImportingBibles(false)
    }
  }

  async function importBibleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      showMessage('Drop one .json file from the bible-request prompt.', 'error')
      return
    }

    try {
      await importBiblesFromText(await file.text())
    } catch (err: any) {
      showMessage(`Could not read file: ${err?.message || err}`, 'error')
    }
  }

  function handleBibleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsBibleDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) {
      showMessage('Drop one .json file from the bible-request prompt.', 'error')
      return
    }
    importBibleFile(file)
  }

  function handleBibleBrowse(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) importBibleFile(file)
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

  async function updateAuthorization(id: string, authorized: boolean) {
    const previousItems = items
    setItems((current) => current.map((item) => item.id === id ? { ...item, authorized } : item))

    try {
      const res = await fetch('/api/admin/story-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, authorized }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data?.item) {
        const normalized = normalizeQueueItem(data.item)
        setItems((current) => current.map((item) => item.id === id ? normalized : item))
      }
    } catch (err: any) {
      setItems(previousItems)
      showMessage(`Authorization update failed: ${err?.message || err}`, 'error')
    }
  }

  async function toggleAllAuthorizations() {
    if (!visibleItems.length) return

    const nextAuthorized = !allFilteredAuthorized
    const ids = visibleItems.map((item) => item.id)
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, authorized: nextAuthorized } : item))

    try {
      await Promise.all(ids.map(async (id) => {
        const res = await fetch('/api/admin/story-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, authorized: nextAuthorized }),
        })
        if (!res.ok) throw new Error(await res.text())
      }))
      await loadItems()
      showMessage(nextAuthorized ? 'Authorized all listed queue items.' : 'Deselected all listed queue items.')
    } catch (err: any) {
      await loadItems()
      showMessage(`Bulk authorization failed: ${err?.message || err}`, 'error')
    }
  }

  async function sendAuthorizedToHal() {
    if (!releasableItems.length) return

    const releasedAt = new Date().toISOString()
    const releasedIds: string[] = []
    const failures: string[] = []

    for (const item of releasableItems) {
      const mode = item.storyType === 'series' || Number(item.totalEpisodes || 1) > 1 ? 'series' : 'single'
      const title = item.letClaudeCreateTitles === false && item.title ? item.title : item.seriesTitle || item.id

      try {
        const jobRes = await fetch('/api/admin/production-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueItemId: item.id,
            mode,
          }),
        })
        const jobText = await jobRes.text()
        let jobData: any = {}
        try {
          jobData = jobText ? JSON.parse(jobText) : {}
        } catch {
          jobData = { error: jobText || 'Non-JSON production job response' }
        }

        if (!jobRes.ok || jobData?.success === false) {
          failures.push(`${title}: ${jobData?.error || `production job failed (${jobRes.status})`}`)
          continue
        }

        const releaseRes = await fetch('/api/admin/story-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            releasedToHal: true,
            releasedToHalAt: releasedAt,
          }),
        })
        if (!releaseRes.ok) {
          failures.push(`${title}: production job created, but release marker failed (${await releaseRes.text()})`)
          continue
        }

        releasedIds.push(item.id)
        setItems((current) => current.map((currentItem) => currentItem.id === item.id
          ? { ...currentItem, status: 'dispatched', releasedToHal: true, releasedToHalAt: releasedAt }
          : currentItem
        ))
      } catch (err: any) {
        failures.push(`${title}: ${err?.message || err}`)
      }
    }

    await loadItems()

    if (failures.length) {
      showMessage(
        `Sent ${releasedIds.length} ${releasedIds.length === 1 ? 'item' : 'items'} to Hal. Failed: ${failures.join(' | ')}`,
        'error'
      )
      return
    }

    showMessage(`Sent ${releasedIds.length} ${releasedIds.length === 1 ? 'item' : 'items'} to Hal.`)
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
    if (item.status !== 'queued') {
      showMessage('Only queued items can be sent to production.', 'error')
      return
    }
    await markInV2(item)
    await loadItems()
    router.push(productionUrlFor(item))
  }

  async function sendSeriesToProduction(series: Extract<QueueGroup, { type: 'series' }>) {
    const firstEpisode = series.items[0]
    if (!firstEpisode) return
    if (series.items.some((item) => item.status !== 'queued')) {
      showMessage('Only queued series can be sent to production.', 'error')
      return
    }

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
          <div>
            <div className="font-semibold text-lg">Story Queue</div>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsBibleDragActive(true)
              }}
              onDragLeave={() => setIsBibleDragActive(false)}
              onDrop={handleBibleDrop}
              style={{
                background: isBibleDragActive ? '#eff6ff' : '#f9fafb',
                border: `2px dashed ${isBibleDragActive ? '#2563eb' : '#9ca3af'}`,
                borderRadius: 8,
                color: '#111827',
                marginTop: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>Drag a bible file here (.json)</div>
                  <div style={{ color: '#4b5563', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                    Imports each bible as a queue row. Imported rows start unauthorized.
                  </div>
                </div>
                <label
                  style={{
                    alignItems: 'center',
                    background: '#111827',
                    borderRadius: 8,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    fontSize: 15,
                    fontWeight: 900,
                    minHeight: 44,
                    padding: '10px 14px',
                  }}
                >
                  Browse JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleBibleBrowse}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <textarea
                value={biblePasteText}
                onChange={(e) => setBiblePasteText(e.target.value)}
                placeholder="Paste bible JSON here as a fallback"
                style={{
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  color: '#111827',
                  fontSize: 14,
                  marginTop: 12,
                  minHeight: 96,
                  padding: 10,
                  width: '100%',
                }}
              />
              <button
                type="button"
                onClick={() => importBiblesFromText(biblePasteText)}
                disabled={isImportingBibles || !biblePasteText.trim()}
                style={{
                  background: biblePasteText.trim() && !isImportingBibles ? '#ffffff' : '#e5e7eb',
                  border: '2px solid #111827',
                  borderRadius: 8,
                  color: biblePasteText.trim() && !isImportingBibles ? '#111827' : '#6b7280',
                  cursor: biblePasteText.trim() && !isImportingBibles ? 'pointer' : 'not-allowed',
                  fontSize: 15,
                  fontWeight: 900,
                  marginTop: 10,
                  padding: '8px 14px',
                }}
              >
                {isImportingBibles ? 'Importing...' : 'Import Pasted JSON'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUEUE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded border px-3 py-1 text-sm font-semibold ${
                    activeTab === tab.id
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label} ({tabCounts[tab.id]})
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              display: 'grid',
              gap: 12,
              padding: 12,
            }}
          >
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(180px, 1fr) minmax(150px, 220px) auto' }}>
              <input
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Search title or premise"
                style={{
                  border: '1px solid #9ca3af',
                  borderRadius: 8,
                  color: '#111827',
                  fontSize: 15,
                  minHeight: 42,
                  padding: '8px 10px',
                }}
              />
              <select
                value={queueGenreFilter}
                onChange={(e) => setQueueGenreFilter(e.target.value)}
                style={{
                  border: '1px solid #9ca3af',
                  borderRadius: 8,
                  color: '#111827',
                  fontSize: 15,
                  minHeight: 42,
                  padding: '8px 10px',
                }}
              >
                <option value="all">All genres</option>
                {queueGenreOptions.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'standalone', 'series'] as QueueTypeFilter[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setQueueTypeFilter(type)}
                    style={{
                      background: queueTypeFilter === type ? '#111827' : '#ffffff',
                      border: '2px solid #111827',
                      borderRadius: 8,
                      color: queueTypeFilter === type ? '#ffffff' : '#111827',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 900,
                      minHeight: 42,
                      padding: '8px 10px',
                      textTransform: 'capitalize',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-700">
                Showing {visibleItems.length} of {filteredItems.length} · {authorizedCount} authorized · {releasedCount} sent to Hal
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendAuthorizedToHal}
                  disabled={!releasableItems.length}
                  style={{
                    background: releasableItems.length ? '#111827' : '#e5e7eb',
                    border: '2px solid #111827',
                    borderRadius: 8,
                    color: releasableItems.length ? '#ffffff' : '#6b7280',
                    cursor: releasableItems.length ? 'pointer' : 'not-allowed',
                    fontSize: 15,
                    fontWeight: 800,
                    opacity: releasableItems.length ? 1 : 0.55,
                    padding: '8px 14px',
                  }}
                >
                  Send to Hal ({releasableItems.length})
                </button>
                <button
                  type="button"
                  onClick={toggleAllAuthorizations}
                  disabled={!visibleItems.length}
                  style={{
                    background: '#ffffff',
                    border: '2px solid #111827',
                    borderRadius: 8,
                    color: '#111827',
                    cursor: visibleItems.length ? 'pointer' : 'not-allowed',
                    fontSize: 15,
                    fontWeight: 800,
                    opacity: visibleItems.length ? 1 : 0.45,
                    padding: '8px 14px',
                  }}
                >
                  {allFilteredAuthorized ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-gray-500">Loading queue...</div>
          ) : !visibleItems.length ? (
            <div className="text-sm text-gray-500">No matching items in {activeTabConfig.label}.</div>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => {
                const type = itemQueueType(item)
                const episodeCount = itemEpisodeCount(item)
                const canSend = item.status === 'queued'

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`border rounded p-3 cursor-pointer ${selectedId === item.id ? 'border-black bg-gray-50' : 'border-gray-300 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-lg">{queueTitle(item)}</div>
                        <div className="text-sm text-gray-700 mt-1">{item.premise}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {type === 'series' ? 'Series' : 'Standalone'} · {episodeCount} {episodeCount === 1 ? 'episode' : 'episodes'}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {[item.primaryGenre, item.duration].filter(Boolean).join(' · ')}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            {STATUS_LABELS[item.status]}
                          </span>
                          {item.releasedToHal ? (
                            <span
                              style={{
                                background: '#dbeafe',
                                borderRadius: 999,
                                color: '#1d4ed8',
                                fontSize: 12,
                                fontWeight: 900,
                                padding: '4px 8px',
                              }}
                            >
                              Sent to Hal
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <label
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            alignItems: 'center',
                            background: item.authorized ? '#ecfdf5' : '#f9fafb',
                            border: `2px solid ${item.authorized ? '#047857' : '#d1d5db'}`,
                            borderRadius: 8,
                            color: '#111827',
                            cursor: 'pointer',
                            display: 'flex',
                            gap: 10,
                            padding: '8px 10px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.authorized}
                            onChange={(e) => updateAuthorization(item.id, e.target.checked)}
                            style={{ height: 24, width: 24 }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 800 }}>Authorized for Hal</span>
                        </label>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setReadingBibleId(item.id)
                          }}
                          style={{
                            background: '#ffffff',
                            border: '2px solid #111827',
                            borderRadius: 8,
                            color: '#111827',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 900,
                            padding: '7px 10px',
                          }}
                        >
                          Read bible
                        </button>
                      </div>
                    </div>

                    {selectedId === item.id ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={(e) => { e.stopPropagation(); regenerate(item) }} className="px-3 py-1 rounded border">
                          Regenerate Setup
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendToProduction(item) }}
                          disabled={!canSend}
                          className="px-3 py-1 rounded border bg-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
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

          {readingItem ? (
            <BibleReadingPanel item={readingItem} onClose={() => setReadingBibleId(null)} />
          ) : null}
        </section>
      </div>
    </div>
  )
}
