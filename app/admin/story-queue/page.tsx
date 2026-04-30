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
  status: QueueStatus
  createdAt: string
  updatedAt: string
}

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

export default function StoryQueuePage() {
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<MessageType>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [form, setForm] = useState({
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
      setItems(Array.isArray(data.items) ? data.items : [])
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
    if (!message) return
    if (messageType === 'error') return
    const t = window.setTimeout(() => {
      setMessage('')
      setMessageType('')
    }, 2200)
    return () => window.clearTimeout(t)
  }, [message, messageType])

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])

  function showMessage(text: string, type: MessageType = 'success') {
    setMessage(text)
    setMessageType(type)
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
    setIsGenerating(true)
    showMessage('', '')
    try {
      const res = await fetch('/api/admin/generate-story-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        throw new Error(await responseError('idea generation', res))
      }

      const data = await res.json()

      const createRes = await fetch('/api/admin/story-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title || 'Untitled Story Idea',
          premise: data.premise || '',
          setting: data.setting || form.settingSeed || '',
          primaryGenre: form.primaryGenre,
          secondaryGenre: form.secondaryGenre,
          tertiaryGenre: form.tertiaryGenre,
          duration: form.duration,
          authorTarget: data.authorTarget || form.authorTarget || '',
          notes: form.notes,
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

  async function sendToProduction(item: QueueItem) {
    await updateStatus(item.id, 'in_v2')
    router.push(`/admin/story-production-v2?queueId=${encodeURIComponent(item.id)}`)
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
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showMessage('Loaded story settings into generator.')
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

          <select className="border rounded p-2 w-full" value={form.primaryGenre} onChange={(e) => setForm({ ...form, primaryGenre: e.target.value })}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
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
          <div className="font-semibold text-lg">Queued Ideas ({items.length})</div>

          {isLoading ? (
            <div className="text-sm text-gray-500">Loading queue…</div>
          ) : !items.length ? (
            <div className="text-sm text-gray-500">No story ideas queued yet.</div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`border rounded p-3 cursor-pointer ${selectedId === item.id ? 'border-black bg-gray-50' : 'border-gray-300 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-sm text-gray-700 mt-1">{item.premise}</div>
                      <div className="text-xs text-gray-500 mt-2">{item.setting || 'No setting'}</div>
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
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'ready_for_asc') }} className="px-3 py-1 rounded border">
                        Ready for ASC
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'published') }} className="px-3 py-1 rounded border">
                        Published
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeItem(item.id) }} className="px-3 py-1 rounded border text-red-700">
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {selected ? (
            <div className="border rounded p-3 bg-gray-50 text-sm space-y-1">
              <div><strong>Title:</strong> {selected.title}</div>
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
