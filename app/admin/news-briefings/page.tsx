'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// US States for dropdown
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
]

const NEWS_CATEGORIES = [
  { id: 'national', name: 'National News', icon: '🇺🇸', color: 'orange', description: 'Top US news stories' },
  { id: 'international', name: 'International News', icon: '🌍', color: 'yellow', description: 'World news and global events' },
  { id: 'business', name: 'Business & Finance', icon: '💼', color: 'green', description: 'Markets, economy, business news' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'blue', description: 'Sports scores and highlights' },
  { id: 'science', name: 'Science & Technology', icon: '🔬', color: 'purple', description: 'Tech news and scientific discoveries' },
]

interface ElevenLabsVoice { voice_id: string; name: string; category?: string; labels?: Record<string, string> }
interface CategorySettings { enabled: boolean; voice_id: string; narrator_name: string; last_generated: string | null; episode_number: number; audio_url: string | null }
interface NewsSettings {
  categories: Record<string, CategorySettings>
  state_news: { voice_id: string; narrator_name: string; enabled: boolean; last_generated: string | null; audio_url: string | null }
  selected_state: string
  stories_per_category: number
}

export default function AdminNewsPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)
  
  const [settings, setSettings] = useState<NewsSettings>({
    categories: {},
    state_news: { voice_id: '', narrator_name: '', enabled: true, last_generated: null, audio_url: null },
    selected_state: 'South Carolina',
    stories_per_category: 5
  })

  useEffect(() => {
    Promise.all([loadSettings(), loadVoices()]).finally(() => setLoading(false))
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current) }
    }
  }, [])

  async function loadVoices() {
    try {
      setLoadingVoices(true)
      const response = await fetch('/api/admin/elevenlabs-voices')
      if (!response.ok) throw new Error('Failed to load voices')
      const data = await response.json()
      setVoices(data.voices || [])
    } catch (error) {
      console.error('Error loading voices:', error)
    } finally {
      setLoadingVoices(false)
    }
  }

  async function loadSettings() {
    try {
      const { data } = await supabase.from('news_settings').select('*').eq('id', '1').single()
      if (data?.settings) {
        const s = data.settings
        setSettings({
          categories: s.categories || initializeCategories(),
          state_news: s.state_news || { voice_id: '', narrator_name: '', enabled: true, last_generated: null, audio_url: null },
          selected_state: s.selected_state || 'South Carolina',
          stories_per_category: s.stories_per_category || 5
        })
      } else {
        setSettings(prev => ({ ...prev, categories: initializeCategories() }))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      setSettings(prev => ({ ...prev, categories: initializeCategories() }))
    }
  }

  function initializeCategories(): Record<string, CategorySettings> {
    const cats: Record<string, CategorySettings> = {}
    NEWS_CATEGORIES.forEach(cat => { cats[cat.id] = { enabled: true, voice_id: '', narrator_name: '', last_generated: null, episode_number: 1, audio_url: null } })
    return cats
  }

  async function saveToDb(newSettings: NewsSettings) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await supabase.from('news_settings').upsert({
          id: '1',
          settings: newSettings,
          updated_at: new Date().toISOString()
        })
      } catch (error) { console.error('Auto-save failed:', error) }
    }, 500)
  }

  function updateStateNews(field: string, value: string) {
    setSettings(prev => {
      const newSettings = { ...prev, state_news: { ...prev.state_news, [field]: value } }
      saveToDb(newSettings)
      return newSettings
    })
  }

  function updateSelectedState(state: string) {
    setSettings(prev => {
      const newSettings = { ...prev, selected_state: state }
      saveToDb(newSettings)
      return newSettings
    })
  }

  function updateCategory(catId: string, field: string, value: any) {
    setSettings(prev => {
      const newSettings = { ...prev, categories: { ...prev.categories, [catId]: { ...prev.categories[catId], [field]: value } } }
      saveToDb(newSettings)
      return newSettings
    })
  }

  async function previewVoice(voiceId: string) {
    if (!voiceId) return
    try {
      const response = await fetch('/api/admin/preview-voice', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ voiceId, text: 'Hello, this is a voice preview for Drive Time Tales news briefings.' }) 
      })
      if (!response.ok) throw new Error('Preview failed')
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      new Audio(audioUrl).play()
    } catch (error) { 
      setMessage({ type: 'error', text: 'Voice preview failed' }) 
    }
  }

  async function generateStateNews() {
    const state = settings.selected_state
    const genKey = `state-${state}`
    setGenerating(prev => new Set(prev).add(genKey))
    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: 'state', 
          voiceId: settings.state_news.voice_id, 
          narratorName: settings.state_news.narrator_name || 'Your Host', 
          state: state, 
          storiesCount: settings.stories_per_category 
        })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      
      setSettings(prev => {
        const newSettings = { 
          ...prev, 
          state_news: { 
            ...prev.state_news, 
            last_generated: new Date().toISOString(), 
            audio_url: result.episode?.audioUrl || null 
          } 
        }
        saveToDb(newSettings)
        return newSettings
      })
      setMessage({ type: 'success', text: `${state} news briefing generated!` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Generation failed' })
    } finally {
      setGenerating(prev => { const next = new Set(prev); next.delete(genKey); return next })
    }
  }

  async function generateCategoryNews(categoryId: string) {
    setGenerating(prev => new Set(prev).add(categoryId))
    try {
      const catSettings = settings.categories[categoryId]
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: categoryId, 
          voiceId: catSettings?.voice_id || '', 
          narratorName: catSettings?.narrator_name || 'Your Host', 
          state: null, 
          storiesCount: settings.stories_per_category 
        })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      
      setSettings(prev => {
        const newSettings = { 
          ...prev, 
          categories: { 
            ...prev.categories, 
            [categoryId]: { 
              ...prev.categories[categoryId], 
              last_generated: new Date().toISOString(), 
              audio_url: result.episode?.audioUrl || null 
            } 
          } 
        }
        saveToDb(newSettings)
        return newSettings
      })
      setMessage({ type: 'success', text: `${NEWS_CATEGORIES.find(c => c.id === categoryId)?.name} briefing generated!` })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Generation failed' })
    } finally {
      setGenerating(prev => { const next = new Set(prev); next.delete(categoryId); return next })
    }
  }

  async function generateAll() {
    setMessage({ type: 'success', text: 'Generating all briefings...' })
    const tasks: Promise<void>[] = []
    
    // State news (if voice selected)
    if (settings.state_news.voice_id && settings.state_news.enabled) {
      tasks.push(generateStateNews())
    }
    
    // All enabled categories with voices
    NEWS_CATEGORIES.forEach(cat => {
      if (settings.categories[cat.id]?.enabled && settings.categories[cat.id]?.voice_id) {
        tasks.push(generateCategoryNews(cat.id))
      }
    })
    
    await Promise.allSettled(tasks)
    setMessage({ type: 'success', text: 'All briefings generated!' })
  }

  function togglePlay(audioUrl: string | null, playKey: string) {
    if (!audioUrl) return
    if (playing === playKey) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlaying(null)
    } else {
      audioRef.current?.pause()
      const audio = new Audio(audioUrl + '?t=' + Date.now())
      audio.onended = () => setPlaying(null)
      audio.play()
      audioRef.current = audio
      setPlaying(playKey)
    }
  }

  function formatTimestamp(dateStr: string | null) {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return { 
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) 
    }
  }

  function getColorClasses(color: string) {
    const colors: Record<string, { bg: string; border: string }> = {
      red: { bg: 'from-red-500/20 to-red-600/10', border: 'border-red-500/30' },
      orange: { bg: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/30' },
      yellow: { bg: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/30' },
      green: { bg: 'from-green-500/20 to-green-600/10', border: 'border-green-500/30' },
      blue: { bg: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-500/30' },
      purple: { bg: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/30' },
    }
    return colors[color] || colors.blue
  }

  function TimestampDisplay({ dateStr }: { dateStr: string | null }) {
    const ts = formatTimestamp(dateStr)
    if (!ts) return <span className="text-white/60">Never generated</span>
    return (
      <div>
        <span className="text-green-400 font-medium">✓ Generated </span>
        <span className="text-white">{ts.date} {ts.time}</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Loading news settings...</p>
        </div>
      </div>
    )
  }

  const isAnyGenerating = generating.size > 0

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-8">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-white/60 hover:text-white">← Back</Link>
            <h1 className="text-xl font-bold text-white">📰 News Briefings</h1>
          </div>
          <button 
            onClick={generateAll} 
            disabled={isAnyGenerating} 
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50 rounded-lg font-bold text-white transition flex items-center gap-2"
          >
            {isAnyGenerating ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              '⚡ Generate All'
            )}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {message.text}
          </div>
        )}
        
        {loadingVoices && (
          <div className="mb-4 p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Loading voices...
          </div>
        )}

        {/* ============================================================ */}
        {/* STATE NEWS SECTION */}
        {/* ============================================================ */}
        <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-5 mb-6 border border-red-500/30 relative">
          {generating.has(`state-${settings.selected_state}`) && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
              <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-orange-400 font-bold text-lg">Generating...</span>
              <span className="text-white">{settings.selected_state} News</span>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏛️</span>
              <div>
                <h2 className="text-xl font-bold text-white">State News & Weather</h2>
                <p className="text-sm text-white/70">Local news for selected state</p>
              </div>
            </div>
            <button 
              onClick={() => updateStateNews('enabled', (!settings.state_news.enabled).toString())} 
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${settings.state_news.enabled ? 'bg-green-500 text-black' : 'bg-slate-700 text-white/60'}`}
            >
              {settings.state_news.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {settings.state_news.enabled && (
            <div className="space-y-4">
              {/* State Dropdown */}
              <div>
                <label className="text-sm font-medium text-white mb-1 block">Select State</label>
                <select 
                  value={settings.selected_state} 
                  onChange={(e) => updateSelectedState(e.target.value)} 
                  className="w-full bg-slate-800 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                >
                  {US_STATES.map(state => (
                    <option key={state.code} value={state.name}>{state.name}</option>
                  ))}
                </select>
              </div>

              {/* Voice & Narrator */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-white mb-1 block">Narrator's Voice</label>
                  <div className="flex gap-2">
                    <select 
                      value={settings.state_news.voice_id} 
                      onChange={(e) => updateStateNews('voice_id', e.target.value)} 
                      className="flex-1 bg-slate-800 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="">-- Select Voice --</option>
                      {voices.map(voice => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name} {voice.labels?.accent ? `(${voice.labels.accent})` : ''}
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={() => previewVoice(settings.state_news.voice_id)} 
                      disabled={!settings.state_news.voice_id} 
                      className={`px-4 py-2.5 rounded-lg font-medium transition ${settings.state_news.voice_id ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-slate-700 text-white/40 cursor-not-allowed'}`}
                    >
                      ▶ Test
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-white mb-1 block">Narrator's Name</label>
                  <input 
                    type="text" 
                    value={settings.state_news.narrator_name} 
                    onChange={(e) => updateStateNews('narrator_name', e.target.value)} 
                    placeholder="e.g., Sarah Mitchell" 
                    className="w-full bg-slate-800 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-orange-500" 
                  />
                </div>
              </div>

              {/* Timestamp & Buttons */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-white/10 gap-4">
                <TimestampDisplay dateStr={settings.state_news.last_generated || null} />
                <div className="flex gap-3">
                  <button 
                    onClick={generateStateNews} 
                    disabled={isAnyGenerating || !settings.state_news.voice_id} 
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition"
                  >
                    ⚡ Generate
                  </button>
                  <button 
                    onClick={() => togglePlay(settings.state_news.audio_url || null, 'state')} 
                    disabled={!settings.state_news.audio_url} 
                    className={`px-6 py-2.5 rounded-lg font-bold transition ${!settings.state_news.audio_url ? 'bg-slate-700 text-white/40 cursor-not-allowed' : playing === 'state' ? 'bg-red-500 text-white' : 'bg-green-500 hover:bg-green-400 text-white'}`}
                  >
                    {playing === 'state' ? '⏹ Stop' : '▶ Play'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* OTHER CATEGORIES */}
        {/* ============================================================ */}
        <h2 className="text-lg font-bold text-white mb-3">📻 News Categories</h2>
        <div className="grid gap-4">
          {NEWS_CATEGORIES.map(cat => {
            const colors = getColorClasses(cat.color)
            const catSettings = settings.categories[cat.id] || {}
            const isGeneratingThis = generating.has(cat.id)

            return (
              <div key={cat.id} className={`bg-gradient-to-br ${colors.bg} rounded-xl p-5 border ${colors.border} relative`}>
                {isGeneratingThis && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <span className="text-orange-400 font-bold text-lg">Generating...</span>
                    <span className="text-white">{cat.name}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <h3 className="font-bold text-lg text-white">{cat.name}</h3>
                      <p className="text-xs text-white/70">{cat.description}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => updateCategory(cat.id, 'enabled', !catSettings.enabled)} 
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${catSettings.enabled ? 'bg-green-500 text-black' : 'bg-slate-700 text-white/60'}`}
                  >
                    {catSettings.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {catSettings.enabled && (
                  <div className="space-y-4">
                    {/* Voice & Narrator */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-white mb-1 block">Narrator's Voice</label>
                        <div className="flex gap-2">
                          <select 
                            value={catSettings.voice_id || ''} 
                            onChange={(e) => updateCategory(cat.id, 'voice_id', e.target.value)} 
                            className="flex-1 bg-slate-800 border border-white/20 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-orange-500"
                          >
                            <option value="">-- Select Voice --</option>
                            {voices.map(voice => (
                              <option key={voice.voice_id} value={voice.voice_id}>
                                {voice.name} {voice.labels?.accent ? `(${voice.labels.accent})` : ''}
                              </option>
                            ))}
                          </select>
                          <button 
                            onClick={() => previewVoice(catSettings.voice_id || '')} 
                            disabled={!catSettings.voice_id} 
                            className={`px-4 py-2.5 rounded-lg font-medium transition ${catSettings.voice_id ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-slate-700 text-white/40 cursor-not-allowed'}`}
                          >
                            ▶ Test
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-white mb-1 block">Narrator's Name</label>
                        <input 
                          type="text" 
                          value={catSettings.narrator_name || ''} 
                          onChange={(e) => updateCategory(cat.id, 'narrator_name', e.target.value)} 
                          placeholder="e.g., John Smith" 
                          className="w-full bg-slate-800 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-orange-500" 
                        />
                      </div>
                    </div>

                    {/* Timestamp & Buttons */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-white/10 gap-4">
                      <TimestampDisplay dateStr={catSettings.last_generated || null} />
                      <div className="flex gap-3">
                        <button 
                          onClick={() => generateCategoryNews(cat.id)} 
                          disabled={isAnyGenerating || !catSettings.voice_id} 
                          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition"
                        >
                          ⚡ Generate
                        </button>
                        <button 
                          onClick={() => togglePlay(catSettings.audio_url || null, cat.id)} 
                          disabled={!catSettings.audio_url} 
                          className={`px-6 py-2.5 rounded-lg font-bold transition ${!catSettings.audio_url ? 'bg-slate-700 text-white/40 cursor-not-allowed' : playing === cat.id ? 'bg-red-500 text-white' : 'bg-green-500 hover:bg-green-400 text-white'}`}
                        >
                          {playing === cat.id ? '⏹ Stop' : '▶ Play'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <p className="text-white/50 text-sm text-center mt-8">Settings auto-save when changed</p>
      </div>
    </div>
  )
}
