'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
]

const STATE_ABBREV: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
}

const ABBREV_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREV).map(([k, v]) => [v, k])
)

const ALL_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️' },
  { id: 'national', name: 'National News', icon: '🇺🇸' },
  { id: 'international', name: 'International', icon: '🌍' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'science', name: 'Science & Tech', icon: '🔬' },
]

const COST_PER_BRIEFING = 1.20

interface Voice { voice_id: string; name: string; labels?: Record<string, string> }
interface CatSettings { voice_id: string; narrator_name: string; last_generated: string | null; audio_url: string | null; duration: string | null; target_duration: string }
interface ScheduleSettings { enabled: boolean; times: string[] }
interface PromptModalData { 
  category: string
  name: string
  prompt: string
  defaultPrompt: string
  isCustom: boolean
  isEditing: boolean
  editedPrompt: string
  isSaving: boolean
}

export default function AdminNewsPage() {
  const [loading, setLoading] = useState(true)
  const [voices, setVoices] = useState<Voice[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedState, setSelectedState] = useState('South Carolina')
  const [settings, setSettings] = useState<Record<string, CatSettings>>({})
  const [schedule, setSchedule] = useState<ScheduleSettings>({ enabled: false, times: ['06:00', '12:00', '18:00'] })
  const [subscriberStates, setSubscriberStates] = useState<string[]>([])
  const [promptModal, setPromptModal] = useState<PromptModalData | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    Promise.all([loadVoices(), loadSettings(), loadSubscriberStates()]).finally(() => setLoading(false))
    return () => { audioRef.current?.pause(); if (saveTimeout.current) clearTimeout(saveTimeout.current) }
  }, [])

  async function loadVoices() {
    try {
      const res = await fetch('/api/admin/elevenlabs-voices')
      const data = await res.json()
      setVoices(data.voices || [])
    } catch (e) { console.error(e) }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/news-settings')
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings.categories || {})
        setSelectedState(data.settings.selected_state || 'South Carolina')
        if (data.settings.schedule) {
          setSchedule(data.settings.schedule)
        }
      }
    } catch (e) { console.error(e) }
  }

  async function loadSubscriberStates() {
    try {
      const { data } = await supabase.from('users').select('state').not('state', 'is', null)
      if (data) {
        const stateSet = new Set<string>()
        data.forEach(u => {
          if (u.state) {
            const fullName = ABBREV_TO_STATE[u.state.toUpperCase()] || u.state
            if (US_STATES.includes(fullName)) {
              stateSet.add(fullName)
            }
          }
        })
        setSubscriberStates(Array.from(stateSet).sort())
      }
    } catch (e) { console.error(e) }
  }

  function saveToDb(newSettings: Record<string, CatSettings>, state?: string, newSchedule?: ScheduleSettings) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/news-settings')
        const data = await res.json()
        const existing = data.settings || {}
        await fetch('/api/admin/news-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: { ...existing, categories: { ...existing.categories, ...newSettings }, selected_state: state || selectedState, schedule: newSchedule || schedule }
          })
        })
      } catch (e) { console.error('Save error:', e) }
    }, 500)
  }

  function updateSetting(catId: string, field: string, value: string) {
    setSettings(prev => {
      const updated = { ...prev, [catId]: { ...prev[catId], [field]: value } }
      saveToDb(updated)
      return updated
    })
  }

  function updateState(state: string) {
    setSelectedState(state)
    saveToDb(settings, state)
  }

  function updateSchedule(newSchedule: ScheduleSettings) {
    setSchedule(newSchedule)
    saveToDb(settings, selectedState, newSchedule)
  }

  function updateScheduleTime(index: number, time: string) {
    const newTimes = [...schedule.times]
    newTimes[index] = time
    updateSchedule({ ...schedule, times: newTimes })
  }

  async function previewVoice(voiceId: string) {
    if (!voiceId) return
    try {
      const res = await fetch('/api/admin/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: 'Hello, this is a voice preview for Drive Time Tales.' })
      })
      if (res.ok) {
        const blob = await res.blob()
        new Audio(URL.createObjectURL(blob)).play()
      }
    } catch (e) { console.error(e) }
  }

  async function showPrompt(catId: string, catName: string) {
    try {
      const res = await fetch(`/api/admin/generate-news?category=${catId}`)
      const data = await res.json()
      setPromptModal({ 
        category: catId, 
        name: catName, 
        prompt: data.prompt || 'Prompt not found',
        defaultPrompt: data.defaultPrompt || data.prompt || '',
        isCustom: data.isCustom || false,
        isEditing: false,
        editedPrompt: data.prompt || '',
        isSaving: false
      })
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: 'Could not load prompt' })
    }
  }

  async function savePrompt() {
    if (!promptModal) return
    
    setPromptModal(prev => prev ? { ...prev, isSaving: true } : null)
    
    try {
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-prompt',
          category: promptModal.category,
          prompt: promptModal.editedPrompt
        })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      
      setPromptModal(prev => prev ? { 
        ...prev, 
        prompt: prev.editedPrompt,
        isCustom: true,
        isEditing: false,
        isSaving: false
      } : null)
      
      setMessage({ type: 'success', text: `${promptModal.name} prompt saved!` })
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save prompt' })
      setPromptModal(prev => prev ? { ...prev, isSaving: false } : null)
    }
  }

  async function resetPrompt() {
    if (!promptModal) return
    
    if (!confirm(`Reset ${promptModal.name} prompt to default? Your custom changes will be lost.`)) return
    
    setPromptModal(prev => prev ? { ...prev, isSaving: true } : null)
    
    try {
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-prompt',
          category: promptModal.category
        })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset')
      
      setPromptModal(prev => prev ? { 
        ...prev, 
        prompt: data.defaultPrompt || prev.defaultPrompt,
        editedPrompt: data.defaultPrompt || prev.defaultPrompt,
        isCustom: false,
        isEditing: false,
        isSaving: false
      } : null)
      
      setMessage({ type: 'success', text: `${promptModal.name} prompt reset to default` })
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to reset prompt' })
      setPromptModal(prev => prev ? { ...prev, isSaving: false } : null)
    }
  }

  async function generate(catId: string) {
    const catSettings = settings[catId] || { voice_id: '', narrator_name: '', last_generated: null, audio_url: null, duration: null, target_duration: '3-5 minutes' }
    if (!catSettings.voice_id) {
      setMessage({ type: 'error', text: 'Please select a voice first' })
      return
    }

    setGenerating(catId)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: catId === 'state' ? 'state' : catId,
          voiceId: catSettings.voice_id,
          narratorName: catSettings.narrator_name || 'Your Host',
          state: catId === 'state' ? selectedState : null,
          storiesCount: 5,
          listenerName: 'Marc',
          duration: catSettings.target_duration || '3-5 minutes'
        })
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Generation failed')

      setSettings(prev => {
        const updated = {
          ...prev,
          [catId]: { 
            ...prev[catId], 
            last_generated: new Date().toISOString(), 
            audio_url: result.episode?.audioUrl,
            duration: result.episode?.duration || null
          }
        }
        saveToDb(updated)
        return updated
      })

      setMessage({ type: 'success', text: `${ALL_CATEGORIES.find(c => c.id === catId)?.name} generated!` })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Generation failed' })
    } finally {
      setGenerating(null)
    }
  }

  async function generateAll() {
    for (const cat of ALL_CATEGORIES) {
      if (settings[cat.id]?.voice_id) {
        await generate(cat.id)
      }
    }
  }

  function togglePlay(catId: string) {
    const url = settings[catId]?.audio_url
    if (!url) return

    if (playing === catId) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlaying(null)
    } else {
      audioRef.current?.pause()
      const audio = new Audio(url + '?t=' + Date.now())
      audio.onended = () => setPlaying(null)
      audio.play()
      audioRef.current = audio
      setPlaying(catId)
    }
  }

  function formatDate(d: string | null): string {
    if (!d) return 'Never'
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    })
  }

  function formatTime12(time24: string): string {
    const [h, m] = time24.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  const numStates = Math.max(subscriberStates.length, 1)
  const numCategories = 5
  const costPerCycle = (numCategories + numStates) * COST_PER_BRIEFING
  const costDaily = costPerCycle * 3
  const costMonthly = costDaily * 30

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-white/60 hover:text-white text-sm">← Back</Link>
            <h1 className="text-2xl font-bold text-white">📰 News Briefings</h1>
          </div>
          <button
            onClick={generateAll}
            disabled={generating !== null}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 rounded-lg font-bold text-white flex items-center gap-2"
          >
            {generating ? (
              <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
            ) : (
              '⚡ Generate All'
            )}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ALL_CATEGORIES.map(cat => {
            const catSettings = settings[cat.id] || { voice_id: '', narrator_name: '', last_generated: null, audio_url: null, duration: null, target_duration: '3-5 minutes' }
            const isGenerating = generating === cat.id
            const isPlaying = playing === cat.id

            return (
              <div key={cat.id} className="bg-gray-100 rounded-xl p-5 relative overflow-hidden">
                {isGenerating && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
                    <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <span className="text-white font-bold">Generating...</span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{cat.icon}</span>
                    <h2 className="text-lg font-bold text-gray-900">{cat.name}</h2>
                  </div>
                  <button
                    onClick={() => showPrompt(cat.id, cat.name)}
                    className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition"
                    title="View/Edit prompt"
                  >
                    📝 Prompt
                  </button>
                </div>

                {cat.id === 'state' && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select State</label>
                    <select
                      value={selectedState}
                      onChange={(e) => updateState(e.target.value)}
                      className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Narrator Name</label>
                  <input
                    type="text"
                    value={catSettings.narrator_name || ''}
                    onChange={(e) => updateSetting(cat.id, 'narrator_name', e.target.value)}
                    placeholder="e.g., Sarah Mitchell"
                    className="w-full bg-gray-600 text-white placeholder-gray-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                  <div className="flex gap-2">
                    <select
                      value={catSettings.voice_id || ''}
                      onChange={(e) => updateSetting(cat.id, 'voice_id', e.target.value)}
                      className="flex-1 min-w-0 bg-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 truncate"
                    >
                      <option value="">Select voice...</option>
                      {voices.map(v => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => previewVoice(catSettings.voice_id || '')}
                      disabled={!catSettings.voice_id}
                      className={`px-3 py-2 rounded-lg font-medium transition flex-shrink-0 ${catSettings.voice_id ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                    >
                      Test
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Duration</label>
                  <select
                    value={catSettings.target_duration || '3-5 minutes'}
                    onChange={(e) => updateSetting(cat.id, 'target_duration', e.target.value)}
                    className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="1-2 minutes">1-2 minutes (Quick)</option>
                    <option value="2-3 minutes">2-3 minutes (Short)</option>
                    <option value="3-5 minutes">3-5 minutes (Standard)</option>
                    <option value="5-7 minutes">5-7 minutes (Extended)</option>
                    <option value="7-10 minutes">7-10 minutes (Long)</option>
                  </select>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  Last updated: <span className="font-medium text-gray-900">{formatDate(catSettings.last_generated)}</span>
                  {catSettings.duration && (
                    <span className="ml-4 text-gray-600">Duration: <span className="font-medium text-gray-900">{catSettings.duration} min</span></span>
                  )}
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => generate(cat.id)}
                    disabled={generating !== null || !catSettings.voice_id}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold text-white transition"
                  >
                    ⚡ Generate
                  </button>
                  <button
                    onClick={() => togglePlay(cat.id)}
                    disabled={!catSettings.audio_url}
                    className={`flex-1 py-2.5 rounded-lg font-bold transition ${
                      !catSettings.audio_url
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : isPlaying
                          ? 'bg-red-500 text-white'
                          : 'bg-green-500 hover:bg-green-400 text-white'
                    }`}
                  >
                    {isPlaying ? '⏹ Stop' : '▶ Play'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-gray-500 text-sm text-center mt-8">Settings auto-save when changed</p>

        <div className="mt-10 bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏰</span>
              <h2 className="text-xl font-bold text-white">Auto-Generate Schedule</h2>
            </div>
            <button
              onClick={() => updateSchedule({ ...schedule, enabled: !schedule.enabled })}
              className={`relative w-14 h-8 rounded-full transition-colors ${schedule.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${schedule.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-3">Generation Times (EST)</label>
            <div className="flex gap-4 flex-wrap">
              {schedule.times.map((time, i) => (
                <div key={i} className="flex flex-col items-center">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => updateScheduleTime(i, e.target.value)}
                    className="bg-slate-700 text-white rounded-lg px-4 py-3 text-center font-mono text-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="text-white/60 text-sm mt-1">{formatTime12(time)} EST</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-2">Subscriber States</label>
            <div className="flex flex-wrap gap-2">
              {subscriberStates.length > 0 ? (
                subscriberStates.map(s => (
                  <span key={s} className="bg-slate-700 text-white px-3 py-1 rounded-full text-sm">
                    {STATE_ABBREV[s] || s}
                  </span>
                ))
              ) : (
                <span className="text-white/60 text-sm">No subscribers with state data yet</span>
              )}
            </div>
            <p className="text-white/60 text-sm mt-2">
              {subscriberStates.length} state{subscriberStates.length !== 1 ? 's' : ''} with active subscribers
            </p>
          </div>

          <div className="bg-slate-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">💰</span>
              <h3 className="text-lg font-semibold text-white">Estimated ElevenLabs Cost</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/80">
                <span>5 standard categories × ${COST_PER_BRIEFING.toFixed(2)}</span>
                <span className="text-white font-medium">${(numCategories * COST_PER_BRIEFING).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>{numStates} state briefing{numStates !== 1 ? 's' : ''} × ${COST_PER_BRIEFING.toFixed(2)}</span>
                <span className="text-white font-medium">${(numStates * COST_PER_BRIEFING).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white/80 border-t border-slate-700 pt-2 mt-2">
                <span>Per generation cycle</span>
                <span className="text-orange-400 font-semibold">${costPerCycle.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Daily (3 cycles)</span>
                <span className="text-orange-400 font-semibold">${costDaily.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white/80 border-t border-slate-700 pt-2 mt-2">
                <span>Monthly estimate (30 days)</span>
                <span className="text-orange-400 font-bold text-lg">~${costMonthly.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            {schedule.enabled ? (
              <p className="text-green-400 font-medium">
                ✓ Auto-generation is ON — Briefings will generate at {schedule.times.map(t => formatTime12(t)).join(', ')} EST
              </p>
            ) : (
              <p className="text-white/60">
                Auto-generation is OFF — Turn on to automatically generate briefings
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Modal - View & Edit */}
      {promptModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => !promptModal.isSaving && setPromptModal(null)}>
          <div 
            className="rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl" 
            style={{ backgroundColor: '#f8f5f0' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b pb-4" style={{ borderColor: '#d4c4b0' }}>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>
                  📝 {promptModal.name} Prompt
                </h3>
                {promptModal.isCustom && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                    Customized
                  </span>
                )}
              </div>
              <button 
                onClick={() => !promptModal.isSaving && setPromptModal(null)} 
                className="text-2xl font-bold" 
                style={{ color: '#666' }}
                disabled={promptModal.isSaving}
              >
                &times;
              </button>
            </div>

            {/* Content */}
            {promptModal.isEditing ? (
              // Edit Mode
              <div>
                <textarea
                  value={promptModal.editedPrompt}
                  onChange={(e) => setPromptModal(prev => prev ? { ...prev, editedPrompt: e.target.value } : null)}
                  className="w-full h-96 p-4 rounded-lg border text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ 
                    backgroundColor: '#fff', 
                    borderColor: '#e8e0d5', 
                    color: '#1a1a1a' 
                  }}
                  disabled={promptModal.isSaving}
                />
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setPromptModal(prev => prev ? { ...prev, isEditing: false, editedPrompt: prev.prompt } : null)}
                    className="px-4 py-2 rounded-lg font-medium transition"
                    style={{ backgroundColor: '#e5e0d8', color: '#666' }}
                    disabled={promptModal.isSaving}
                  >
                    Cancel
                  </button>
                  <div className="flex gap-3">
                    {promptModal.isCustom && (
                      <button
                        onClick={resetPrompt}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition"
                        disabled={promptModal.isSaving}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      onClick={savePrompt}
                      className="px-6 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-400 transition flex items-center gap-2"
                      disabled={promptModal.isSaving}
                    >
                      {promptModal.isSaving ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Prompt'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // View Mode
              <div>
                <div className="rounded-lg p-5 border" style={{ backgroundColor: '#fff', borderColor: '#e8e0d5' }}>
                  <pre 
                    className="whitespace-pre-wrap leading-relaxed text-sm" 
                    style={{ 
                      color: '#1a1a1a', 
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' 
                    }}
                  >
                    {promptModal.prompt}
                  </pre>
                </div>
                
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm italic" style={{ color: '#666' }}>
                    This guidance is combined with today&apos;s headlines to generate briefings.
                  </p>
                  <button
                    onClick={() => setPromptModal(prev => prev ? { ...prev, isEditing: true } : null)}
                    className="px-6 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-400 transition"
                  >
                    ✏️ Edit Prompt
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
