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
interface StateNewsInfo { state_name: string; member_count: number; last_generated: string | null; episode_number: number; audio_url: string | null }
interface NewsSettings {
  categories: Record<string, CategorySettings>
  state_news: { voice_id: string; narrator_name: string; enabled: boolean }
  test_state: string
  generation_times: string[]
  auto_generate: boolean
  stories_per_category: number
  timezone: string
}

export default function AdminNewsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)
  const [memberStates, setMemberStates] = useState<StateNewsInfo[]>([])
  
  const [settings, setSettings] = useState<NewsSettings>({
    categories: {},
    state_news: { voice_id: '', narrator_name: '', enabled: true },
    test_state: 'South Carolina',
    generation_times: ['06:00', '12:00', '18:00'],
    auto_generate: true,
    stories_per_category: 5,
    timezone: 'America/New_York'
  })

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSettings(prev => ({ ...prev, categories: initializeCategories() }))
      setLoading(false)
    }, 5000)
    Promise.all([loadSettings(), loadMemberStates(), loadVoices()]).finally(() => clearTimeout(timeout))
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
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
      setMessage({ type: 'error', text: 'Failed to load ElevenLabs voices' })
    } finally {
      setLoadingVoices(false)
    }
  }

  async function loadMemberStates() {
    try {
      const { data, error } = await supabase.from('users').select('state').not('state', 'is', null)
      if (error) throw error
      const stateCounts: Record<string, number> = {}
      data?.forEach(user => { if (user.state) stateCounts[user.state] = (stateCounts[user.state] || 0) + 1 })
      const { data: episodesData } = await supabase.from('news_episodes').select('state, episode_number, audio_url, created_at').not('state', 'is', null).order('created_at', { ascending: false })
      const stateInfos: StateNewsInfo[] = Object.entries(stateCounts).map(([stateName, count]) => {
        const latestEpisode = episodesData?.find(ep => ep.state === stateName)
        return { state_name: stateName, member_count: count, last_generated: latestEpisode?.created_at || null, episode_number: latestEpisode?.episode_number || 0, audio_url: latestEpisode?.audio_url || null }
      }).sort((a, b) => b.member_count - a.member_count)
      setMemberStates(stateInfos)
    } catch (error) { console.error('Error loading member states:', error) }
  }

  async function loadSettings() {
    try {
      const { data } = await supabase.from('news_settings').select('*').eq('id', '1').single()
      if (data) {
        const dbSettings = data.settings || {}
        const defaultCats = initializeCategories()
        const mergedCategories: Record<string, CategorySettings> = {}
        Object.keys(defaultCats).forEach(catId => {
          const dbCat = dbSettings.categories?.[catId] || {}
          mergedCategories[catId] = {
            enabled: dbCat.enabled ?? defaultCats[catId].enabled,
            voice_id: dbCat.voice_id || '',
            narrator_name: dbCat.narrator_name || '',
            last_generated: dbCat.last_generated || null,
            episode_number: dbCat.episode_number || 1,
            audio_url: dbCat.audio_url || null
          }
        })
        setSettings({
          categories: mergedCategories,
          state_news: dbSettings.state_news || { voice_id: '', narrator_name: '', enabled: true },
          test_state: data.test_state || 'South Carolina',
          generation_times: dbSettings.generation_times || ['06:00', '12:00', '18:00'],
          auto_generate: dbSettings.auto_generate ?? true,
          stories_per_category: dbSettings.stories_per_category || 5,
          timezone: data.timezone || 'America/New_York'
        })
      } else {
        setSettings(prev => ({ ...prev, categories: initializeCategories() }))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      setSettings(prev => ({ ...prev, categories: initializeCategories() }))
    } finally { setLoading(false) }
  }

  function initializeCategories(): Record<string, CategorySettings> {
    const cats: Record<string, CategorySettings> = {}
    NEWS_CATEGORIES.forEach(cat => { cats[cat.id] = { enabled: true, voice_id: '', narrator_name: '', last_generated: null, episode_number: 1, audio_url: null } })
    return cats
  }

  function updateStateNewsSetting(field: 'voice_id' | 'narrator_name', value: string) {
    setSettings(prev => ({ ...prev, state_news: { ...prev.state_news, [field]: value } }))
    debouncedAutoSave()
  }

  function updateCategorySetting(categoryId: string, field: 'voice_id' | 'narrator_name', value: string) {
    setSettings(prev => ({ ...prev, categories: { ...prev.categories, [categoryId]: { ...prev.categories[categoryId], [field]: value } } }))
    debouncedAutoSave()
  }

  function debouncedAutoSave() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => { autoSaveSettings() }, 1000)
  }

  async function autoSaveSettings() {
    try {
      await supabase.from('news_settings').upsert({
        id: '1',
        settings: { categories: settings.categories, state_news: settings.state_news, generation_times: settings.generation_times, auto_generate: settings.auto_generate, stories_per_category: settings.stories_per_category },
        test_state: settings.test_state,
        timezone: settings.timezone,
        updated_at: new Date().toISOString()
      })
      console.log('Settings auto-saved')
    } catch (error) { console.error('Auto-save failed:', error) }
  }

  async function saveSettings() {
    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase.from('news_settings').upsert({
        id: '1',
        settings: { categories: settings.categories, state_news: settings.state_news, generation_times: settings.generation_times, auto_generate: settings.auto_generate, stories_per_category: settings.stories_per_category },
        test_state: settings.test_state,
        timezone: settings.timezone,
        updated_at: new Date().toISOString()
      })
      if (error) throw error
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally { setSaving(false) }
  }

  async function generateStateNews(stateName: string) {
    const genKey = `state-${stateName}`
    setGenerating(prev => new Set(prev).add(genKey))
    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'state', voiceId: settings.state_news.voice_id, narratorName: settings.state_news.narrator_name, state: stateName, storiesCount: settings.stories_per_category })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setMemberStates(prev => prev.map(s => s.state_name === stateName ? { ...s, last_generated: new Date().toISOString(), audio_url: result.episode?.audioUrl || null } : s))
      setMessage({ type: 'success', text: `${stateName} news briefing generated!` })
    } catch (error) {
      console.error('Generation error:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Generation failed' })
    } finally {
      setGenerating(prev => { const next = new Set(prev); next.delete(genKey); return next })
    }
  }

  async function generateAllStateNews() {
    if (memberStates.length === 0) { setMessage({ type: 'error', text: 'No member states found' }); return }
    setMessage({ type: 'success', text: `Generating news for ${memberStates.length} states...` })
    await Promise.allSettled(memberStates.map(state => generateStateNews(state.state_name)))
    setMessage({ type: 'success', text: `All ${memberStates.length} state briefings generated!` })
  }

  async function generateCategoryBriefing(categoryId: string) {
    setGenerating(prev => new Set(prev).add(categoryId))
    try {
      const catSettings = settings.categories[categoryId]
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId, voiceId: catSettings?.voice_id || '', narratorName: catSettings?.narrator_name || '', state: null, storiesCount: settings.stories_per_category })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setSettings(prev => ({
        ...prev,
        categories: { ...prev.categories, [categoryId]: { ...prev.categories[categoryId], last_generated: new Date().toISOString(), episode_number: (prev.categories[categoryId]?.episode_number || 0) + 1, audio_url: result.episode?.audioUrl || null } }
      }))
      setMessage({ type: 'success', text: `${NEWS_CATEGORIES.find(c => c.id === categoryId)?.name} briefing generated!` })
    } catch (error) {
      console.error('Generation error:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Generation failed' })
    } finally {
      setGenerating(prev => { const next = new Set(prev); next.delete(categoryId); return next })
    }
  }

  async function generateAllBriefings() {
    const enabledCategories = NEWS_CATEGORIES.filter(cat => settings.categories[cat.id]?.enabled)
    const totalCount = memberStates.length + enabledCategories.length
    if (totalCount === 0) { setMessage({ type: 'error', text: 'Nothing to generate' }); return }
    setMessage({ type: 'success', text: `Generating ${totalCount} briefings...` })
    await Promise.allSettled([...memberStates.map(state => generateStateNews(state.state_name)), ...enabledCategories.map(cat => generateCategoryBriefing(cat.id))])
    setMessage({ type: 'success', text: `All ${totalCount} briefings generated!` })
  }

  function togglePlay(audioUrl: string | null, playKey: string) {
    if (!audioUrl) { setMessage({ type: 'error', text: 'No audio available. Generate a briefing first.' }); return }
    if (playing === playKey) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setPlaying(null)
    } else {
      if (audioRef.current) audioRef.current.pause()
      const audio = new Audio(audioUrl + '?t=' + Date.now())
      audio.onended = () => setPlaying(null)
      audio.onerror = () => { setMessage({ type: 'error', text: 'Failed to play audio' }); setPlaying(null) }
      audio.play()
      audioRef.current = audio
      setPlaying(playKey)
    }
  }

  async function previewVoice(voiceId: string) {
    if (!voiceId) { setMessage({ type: 'error', text: 'Please select a voice first' }); return }
    try {
      const response = await fetch('/api/admin/preview-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId, text: 'Hello, this is a voice preview for Drive Time Tales news briefings.' }) })
      if (!response.ok) throw new Error('Preview failed')
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.play()
    } catch (error) { setMessage({ type: 'error', text: 'Voice preview failed' }) }
  }

  function formatTimestamp(dateStr: string | null) {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return { date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) }
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

  function GeneratingSpinner({ label }: { label: string }) {
    return (
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
        <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-orange-400 font-bold text-lg animate-pulse">Generating...</span>
        <span className="text-white/60 text-sm">{label}</span>
      </div>
    )
  }

  function TimestampDisplay({ dateStr }: { dateStr: string | null }) {
    const ts = formatTimestamp(dateStr)
    if (!ts) return <span className="text-white/40">Never generated</span>
    return (
      <div className="text-center">
        <div className="text-green-400 font-bold text-sm">✓ Generated</div>
        <div className="text-white text-xs">{ts.date}</div>
        <div className="text-white/60 text-xs">{ts.time}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading news settings...</p>
        </div>
      </div>
    )
  }

  const isAnyGenerating = generating.size > 0
  const enabledCategoryCount = NEWS_CATEGORIES.filter(cat => settings.categories[cat.id]?.enabled).length
  const totalGenerateCount = memberStates.length + enabledCategoryCount

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-8">
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-400 hover:text-white">← Back</Link>
            <h1 className="text-xl font-bold">📰 News Briefings</h1>
          </div>
          <button onClick={generateAllBriefings} disabled={isAnyGenerating || totalGenerateCount === 0} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${isAnyGenerating ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 text-black'}`}>
            {isAnyGenerating ? <span className="flex items-center gap-2"><span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />Generating {generating.size}...</span> : `⚡ Generate All (${totalGenerateCount})`}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {message && <div className={`mb-4 p-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{message.text}</div>}
        {loadingVoices && <div className="mb-4 p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm flex items-center gap-2"><span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Loading ElevenLabs voices...</div>}

        {/* STATE NEWS SECTION */}
        <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-4 mb-6 border border-red-500/30 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏛️</span>
              <div>
                <h2 className="text-xl font-bold">State News & Weather</h2>
                <p className="text-sm text-white/60">Generated for each state where members have accounts</p>
              </div>
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, state_news: { ...prev.state_news, enabled: !prev.state_news.enabled } }))} className={`px-3 py-1 rounded-full text-xs font-bold transition ${settings.state_news.enabled ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-400'}`}>{settings.state_news.enabled ? 'ON' : 'OFF'}</button>
          </div>

          {settings.state_news.enabled && (
            <>
              <div className="bg-black/20 rounded-lg p-3 mb-4">
                <h3 className="text-sm font-semibold mb-2 text-white/80">Voice Settings (applies to all states)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/60 block mb-1">Narrator Voice</label>
                    <div className="flex gap-2">
                      <select value={settings.state_news.voice_id} onChange={(e) => updateStateNewsSetting('voice_id', e.target.value)} className="flex-1 bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white">
                        <option value="">-- Select Voice --</option>
                        {voices.map(voice => <option key={voice.voice_id} value={voice.voice_id}>{voice.name} {voice.labels?.accent ? `(${voice.labels.accent})` : ''}</option>)}
                      </select>
                      <button onClick={() => previewVoice(settings.state_news.voice_id)} disabled={!settings.state_news.voice_id} className={`px-3 py-1.5 rounded-lg text-sm ${settings.state_news.voice_id ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>🔊</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 block mb-1">Narrator Name</label>
                    <input type="text" value={settings.state_news.narrator_name} onChange={(e) => updateStateNewsSetting('narrator_name', e.target.value)} placeholder="e.g., Sarah" className="w-full bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white placeholder-white/40" />
                  </div>
                </div>
                <p className="text-xs text-white/40 mt-2">✓ Auto-saves when changed</p>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white/80">Member States ({memberStates.length})</h3>
                  <button onClick={generateAllStateNews} disabled={isAnyGenerating || memberStates.length === 0} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${isAnyGenerating ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-400 text-white'}`}>⚡ Generate All States</button>
                </div>
                {memberStates.length === 0 ? <p className="text-white/40 text-sm">No members have set their state yet.</p> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {memberStates.map(state => {
                      const genKey = `state-${state.state_name}`
                      const isGeneratingThis = generating.has(genKey)
                      return (
                        <div key={state.state_name} className="bg-black/30 rounded-lg p-3 border border-white/10 relative overflow-hidden">
                          {isGeneratingThis && <GeneratingSpinner label={state.state_name} />}
                          <div className="flex items-start justify-between mb-2">
                            <div><span className="font-bold text-lg">{state.state_name}</span><span className="text-xs text-white/50 ml-2">{state.member_count} member{state.member_count !== 1 ? 's' : ''}</span></div>
                            <TimestampDisplay dateStr={state.last_generated} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => generateStateNews(state.state_name)} disabled={isGeneratingThis} className="flex-1 py-2 rounded-lg text-sm font-bold bg-white text-black hover:bg-white/90 transition">⚡ Generate</button>
                            <button onClick={() => togglePlay(state.audio_url, genKey)} disabled={!state.audio_url} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${playing === genKey ? 'bg-red-500 text-white' : state.audio_url ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>{playing === genKey ? '⏹ Stop' : '▶ Play'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-black/20 rounded-lg p-3 border-t border-white/10">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-xs text-white/60">Test/Preview State:</label>
                  <select value={settings.test_state} onChange={(e) => setSettings(prev => ({ ...prev, test_state: e.target.value }))} className="bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white">
                    {US_STATES.map(state => <option key={state.code} value={state.name}>{state.name}</option>)}
                  </select>
                  <button onClick={() => generateStateNews(settings.test_state)} disabled={generating.has(`state-${settings.test_state}`)} className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 text-black rounded-lg text-sm font-bold">Generate Test</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* OTHER CATEGORIES */}
        <h2 className="text-lg font-bold mb-3">📻 Other News Categories</h2>
        <div className="grid gap-4 mb-6">
          {NEWS_CATEGORIES.map(cat => {
            const colors = getColorClasses(cat.color)
            const isGeneratingThis = generating.has(cat.id)
            return (
              <div key={cat.id} className={`bg-gradient-to-br ${colors.bg} rounded-xl p-4 border ${colors.border} relative overflow-hidden`}>
                {isGeneratingThis && <GeneratingSpinner label={cat.name} />}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div><h3 className="font-bold text-lg">{cat.name}</h3><p className="text-xs text-white/60">{cat.description}</p></div>
                  </div>
                  <button onClick={() => setSettings(prev => ({ ...prev, categories: { ...prev.categories, [cat.id]: { ...prev.categories[cat.id], enabled: !prev.categories[cat.id]?.enabled } } }))} className={`px-3 py-1 rounded-full text-xs font-bold transition ${settings.categories[cat.id]?.enabled ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-400'}`}>{settings.categories[cat.id]?.enabled ? 'ON' : 'OFF'}</button>
                </div>
                {settings.categories[cat.id]?.enabled && (
                  <div className="space-y-3 pt-3 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-white/80 block mb-1">Voice</label>
                        <div className="flex gap-2">
                          <select value={settings.categories[cat.id]?.voice_id || ''} onChange={(e) => updateCategorySetting(cat.id, 'voice_id', e.target.value)} className="flex-1 bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white">
                            <option value="">-- Select Voice --</option>
                            {voices.map(voice => <option key={voice.voice_id} value={voice.voice_id}>{voice.name} {voice.labels?.accent ? `(${voice.labels.accent})` : ''}</option>)}
                          </select>
                          <button onClick={() => previewVoice(settings.categories[cat.id]?.voice_id || '')} disabled={!settings.categories[cat.id]?.voice_id} className={`px-3 py-1.5 rounded-lg text-sm ${settings.categories[cat.id]?.voice_id ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>🔊</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/80 block mb-1">Narrator Name</label>
                        <input type="text" value={settings.categories[cat.id]?.narrator_name || ''} onChange={(e) => updateCategorySetting(cat.id, 'narrator_name', e.target.value)} placeholder="e.g., Sarah" className="w-full bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white placeholder-white/40" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-black/20 rounded-lg p-3">
                      <span className="text-white/60 text-sm">Episode #{settings.categories[cat.id]?.episode_number || 1}</span>
                      <TimestampDisplay dateStr={settings.categories[cat.id]?.last_generated || null} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => generateCategoryBriefing(cat.id)} disabled={isGeneratingThis} className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-white text-black hover:bg-white/90 transition">⚡ Generate</button>
                      <button onClick={() => togglePlay(settings.categories[cat.id]?.audio_url || null, cat.id)} disabled={!settings.categories[cat.id]?.audio_url} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition ${playing === cat.id ? 'bg-red-500 text-white' : settings.categories[cat.id]?.audio_url ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-white/20 text-white/50 cursor-not-allowed'}`}>{playing === cat.id ? '⏹ Stop' : '▶ Play'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* SCHEDULE SECTION */}
        <div className="bg-slate-900 rounded-xl p-4 mb-6 border border-slate-800">
          <h2 className="text-lg font-bold mb-3">⏰ Auto-Generation Schedule</h2>
          <div className="flex items-center justify-between mb-4">
            <span>Enable Auto-Generation</span>
            <button onClick={() => setSettings(prev => ({ ...prev, auto_generate: !prev.auto_generate }))} className={`w-12 h-6 rounded-full transition relative ${settings.auto_generate ? 'bg-green-500' : 'bg-slate-600'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.auto_generate ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          {settings.auto_generate && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-sm text-slate-400 block mb-1">Morning</label><input type="time" value={settings.generation_times[0] || '06:00'} onChange={(e) => { const times = [...settings.generation_times]; times[0] = e.target.value; setSettings(prev => ({ ...prev, generation_times: times })) }} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
              <div><label className="text-sm text-slate-400 block mb-1">Noon</label><input type="time" value={settings.generation_times[1] || '12:00'} onChange={(e) => { const times = [...settings.generation_times]; times[1] = e.target.value; setSettings(prev => ({ ...prev, generation_times: times })) }} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
              <div><label className="text-sm text-slate-400 block mb-1">Evening</label><input type="time" value={settings.generation_times[2] || '18:00'} onChange={(e) => { const times = [...settings.generation_times]; times[2] = e.target.value; setSettings(prev => ({ ...prev, generation_times: times })) }} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" /></div>
              <div><label className="text-sm text-slate-400 block mb-1">Timezone</label><select value={settings.timezone} onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"><option value="America/New_York">Eastern (ET)</option><option value="America/Chicago">Central (CT)</option><option value="America/Denver">Mountain (MT)</option><option value="America/Los_Angeles">Pacific (PT)</option><option value="America/Anchorage">Alaska (AKT)</option><option value="Pacific/Honolulu">Hawaii (HT)</option></select></div>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Stories per briefing:</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setSettings(prev => ({ ...prev, stories_per_category: Math.max(2, prev.stories_per_category - 1) }))} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold">-</button>
                <span className="w-8 text-center font-bold">{settings.stories_per_category}</span>
                <button onClick={() => setSettings(prev => ({ ...prev, stories_per_category: Math.min(6, prev.stories_per_category + 1) }))} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold">+</button>
              </div>
              <span className="text-slate-500 text-sm">(2-6 stories)</span>
            </div>
          </div>
        </div>

        <button onClick={saveSettings} disabled={saving} className={`w-full py-4 rounded-xl font-bold transition ${saving ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-400 text-black'}`}>{saving ? 'Saving...' : '💾 Save All Settings'}</button>
      </div>
    </div>
  )
}
