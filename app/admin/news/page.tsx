'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

// Available ElevenLabs voices for narrator selection
const AVAILABLE_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)', description: 'Warm, professional' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female)', description: 'Clear, articulate' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Female)', description: 'Strong, confident' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male)', description: 'Warm, friendly' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Male)', description: 'Deep, authoritative' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male)', description: 'Clear, professional' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (Male)', description: 'Casual, engaging' },
]

// News categories - State News first, then others in order
const NEWS_CATEGORIES = [
  {
    id: 'state',
    name: 'State News',
    icon: '🏛️',
    color: 'red',
    description: 'Weather, Political, Crime, Sports, Business news for your state'
  },
  {
    id: 'national',
    name: 'National News',
    icon: '🇺🇸',
    color: 'orange',
    description: 'Top US news stories'
  },
  {
    id: 'international',
    name: 'International News',
    icon: '🌍',
    color: 'yellow',
    description: 'World news and global events'
  },
  {
    id: 'business',
    name: 'Business & Finance',
    icon: '💼',
    color: 'green',
    description: 'Markets, economy, business news'
  },
  {
    id: 'sports',
    name: 'Sports',
    icon: '⚽',
    color: 'blue',
    description: 'Sports scores and highlights'
  },
  {
    id: 'science',
    name: 'Science & Technology',
    icon: '🔬',
    color: 'purple',
    description: 'Tech news and scientific discoveries'
  },
]

interface CategorySettings {
  enabled: boolean
  voice_id: string
  narrator_name: string
  last_generated: string | null
  episode_number: number
  audio_url: string | null
}

interface NewsSettings {
  categories: Record<string, CategorySettings>
  test_state: string
  generation_times: string[]
  auto_generate: boolean
  stories_per_category: number
  timezone: string
}

export default function AdminNewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const [settings, setSettings] = useState<NewsSettings>({
    categories: {},
    test_state: 'TN',
    generation_times: ['06:00', '12:00', '18:00'],
    auto_generate: true,
    stories_per_category: 5,
    timezone: 'America/New_York'
  })

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSettings(prev => ({
        ...prev,
        categories: initializeCategories()
      }))
      setLoading(false)
    }, 5000)

    loadSettings().finally(() => clearTimeout(timeout))
    
    return () => clearTimeout(timeout)
  }, [])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('news_settings')
        .select('*')
        .eq('id', 1)
        .single()

      if (data) {
        const defaultCats = initializeCategories()
        const mergedCategories: Record<string, CategorySettings> = {}
        
        Object.keys(defaultCats).forEach(catId => {
          const dbCat = data.categories?.[catId] || {}
          mergedCategories[catId] = {
            enabled: dbCat.enabled ?? defaultCats[catId].enabled,
            voice_id: dbCat.voice_id || 'EXAVITQu4vr4xnSDxMaL',
            narrator_name: dbCat.narrator_name || '',
            last_generated: dbCat.last_generated || null,
            episode_number: dbCat.episode_number || 1,
            audio_url: dbCat.audio_url || null
          }
        })
        
        setSettings({
          categories: mergedCategories,
          test_state: data.test_state || 'TN',
          generation_times: data.generation_times || ['06:00', '12:00', '18:00'],
          auto_generate: data.auto_generate ?? true,
          stories_per_category: data.stories_per_category || 5,
          timezone: data.timezone || 'America/New_York'
        })
      } else {
        setSettings(prev => ({
          ...prev,
          categories: initializeCategories()
        }))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      setSettings(prev => ({
        ...prev,
        categories: initializeCategories()
      }))
    } finally {
      setLoading(false)
    }
  }

  function initializeCategories(): Record<string, CategorySettings> {
    const cats: Record<string, CategorySettings> = {}
    NEWS_CATEGORIES.forEach(cat => {
      cats[cat.id] = {
        enabled: true,
        voice_id: 'EXAVITQu4vr4xnSDxMaL',
        narrator_name: '',
        last_generated: null,
        episode_number: 1,
        audio_url: null
      }
    })
    return cats
  }

  async function saveSettings() {
    setSaving(true)
    setMessage(null)
    
    try {
      const { error } = await supabase
        .from('news_settings')
        .upsert({
          id: 1,
          categories: settings.categories,
          test_state: settings.test_state,
          generation_times: settings.generation_times,
          auto_generate: settings.auto_generate,
          stories_per_category: settings.stories_per_category,
          timezone: settings.timezone,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  async function generateBriefing(categoryId: string) {
    setGenerating(categoryId)
    setMessage(null)
    
    try {
      const catSettings = settings.categories[categoryId]
      const stateName = categoryId === 'state' 
        ? US_STATES.find(s => s.code === settings.test_state)?.name || settings.test_state
        : null

      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryId,
          voiceId: catSettings?.voice_id || 'EXAVITQu4vr4xnSDxMaL',
          narratorName: catSettings?.narrator_name || '',
          state: stateName,
          storiesCount: settings.stories_per_category
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Generation failed')
      }

      // Update local state with new episode info
      setSettings(prev => ({
        ...prev,
        categories: {
          ...prev.categories,
          [categoryId]: {
            ...prev.categories[categoryId],
            last_generated: new Date().toISOString(),
            episode_number: (prev.categories[categoryId]?.episode_number || 0) + 1,
            audio_url: result.episode?.audioUrl || null
          }
        }
      }))

      setMessage({ type: 'success', text: `${NEWS_CATEGORIES.find(c => c.id === categoryId)?.name} briefing generated!` })
    } catch (error) {
      console.error('Generation error:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Generation failed' })
    } finally {
      setGenerating(null)
    }
  }

  function togglePlay(categoryId: string) {
    const audioUrl = settings.categories[categoryId]?.audio_url
    
    if (!audioUrl) {
      setMessage({ type: 'error', text: 'No audio available. Generate a briefing first.' })
      return
    }

    if (playing === categoryId) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlaying(null)
    } else {
      // Stop any current audio
      if (audioRef.current) {
        audioRef.current.pause()
      }
      
      // Start playing new audio
      const audio = new Audio(audioUrl + '?t=' + Date.now()) // Cache bust
      audio.onended = () => setPlaying(null)
      audio.onerror = () => {
        setMessage({ type: 'error', text: 'Failed to play audio' })
        setPlaying(null)
      }
      audio.play()
      audioRef.current = audio
      setPlaying(categoryId)
    }
  }

  async function previewVoice(voiceId: string) {
    try {
      const response = await fetch('/api/admin/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: 'Hello, this is a voice preview for Drive Time Tales news briefings.' })
      })
      
      if (!response.ok) throw new Error('Preview failed')
      
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.play()
    } catch (error) {
      setMessage({ type: 'error', text: 'Voice preview failed' })
    }
  }

  function formatLastGenerated(dateStr: string | null) {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  function getCategoryColor(color: string) {
    const colors: Record<string, string> = {
      red: 'from-red-600 to-red-800 border-red-500',
      orange: 'from-orange-600 to-orange-800 border-orange-500',
      yellow: 'from-yellow-600 to-yellow-800 border-yellow-500',
      green: 'from-green-600 to-green-800 border-green-500',
      blue: 'from-blue-600 to-blue-800 border-blue-500',
      purple: 'from-purple-600 to-purple-800 border-purple-500'
    }
    return colors[color] || colors.blue
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">📰 News Briefings Admin</h1>
            <p className="text-slate-400 text-sm">Configure and generate news briefings for each category</p>
          </div>
          <Link href="/admin" className="text-orange-400 hover:text-orange-300">
            ← Back to Admin
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Test State Selector (for State News) */}
        <div className="bg-slate-900 rounded-xl p-4 mb-6 border border-slate-800">
          <h2 className="text-lg font-bold mb-3">🏛️ State News Configuration</h2>
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-400">Test State:</label>
            <select
              value={settings.test_state}
              onChange={(e) => setSettings(prev => ({ ...prev, test_state: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              {US_STATES.map(state => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
            <span className="text-slate-500 text-sm">
              State news will cover Weather, Political, Crime, Sports & Business for this state
            </span>
          </div>
        </div>

        {/* News Categories Grid - 3x2 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {NEWS_CATEGORIES.map(cat => (
            <div 
              key={cat.id}
              className={`bg-gradient-to-br ${getCategoryColor(cat.color)} rounded-xl p-4 border-2`}
            >
              {/* Category Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <h3 className="font-bold">
                      {cat.id === 'state' 
                        ? `${US_STATES.find(s => s.code === settings.test_state)?.name || 'State'} News`
                        : cat.name
                      }
                    </h3>
                    <p className="text-xs text-white/70">{cat.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    categories: {
                      ...prev.categories,
                      [cat.id]: {
                        ...prev.categories[cat.id],
                        enabled: !prev.categories[cat.id]?.enabled
                      }
                    }
                  }))}
                  className={`w-12 h-6 rounded-full transition relative ${
                    settings.categories[cat.id]?.enabled ? 'bg-green-500' : 'bg-slate-600'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    settings.categories[cat.id]?.enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              {settings.categories[cat.id]?.enabled && (
                <div className="space-y-3">
                  {/* Narrator Voice */}
                  <div>
                    <label className="text-xs text-white/80 block mb-1">Narrator Voice</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.categories[cat.id]?.voice_id || 'EXAVITQu4vr4xnSDxMaL'}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          categories: {
                            ...prev.categories,
                            [cat.id]: { ...prev.categories[cat.id], voice_id: e.target.value }
                          }
                        }))}
                        className="flex-1 bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white"
                      >
                        {AVAILABLE_VOICES.map(voice => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => previewVoice(settings.categories[cat.id]?.voice_id || 'EXAVITQu4vr4xnSDxMaL')}
                        className="px-2 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm"
                        title="Preview Voice"
                      >
                        🔊
                      </button>
                    </div>
                  </div>

                  {/* Narrator Name */}
                  <div>
                    <label className="text-xs text-white/80 block mb-1">Narrator's Name (optional)</label>
                    <input
                      type="text"
                      value={settings.categories[cat.id]?.narrator_name || ''}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        categories: {
                          ...prev.categories,
                          [cat.id]: { ...prev.categories[cat.id], narrator_name: e.target.value }
                        }
                      }))}
                      placeholder="e.g., Sarah"
                      className="w-full bg-black/30 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white placeholder-white/40"
                    />
                  </div>

                  {/* Episode Info */}
                  <div className="bg-black/20 rounded-lg p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/60">Episode:</span>
                      <span className="font-bold">#{settings.categories[cat.id]?.episode_number || 1}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-white/60">Last Updated:</span>
                      <span>{formatLastGenerated(settings.categories[cat.id]?.last_generated)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => generateBriefing(cat.id)}
                      disabled={generating !== null}
                      className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${
                        generating === cat.id
                          ? 'bg-white/20 text-white cursor-wait'
                          : 'bg-white text-black hover:bg-white/90'
                      }`}
                    >
                      {generating === cat.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </span>
                      ) : (
                        '⚡ Generate'
                      )}
                    </button>
                    <button
                      onClick={() => togglePlay(cat.id)}
                      disabled={!settings.categories[cat.id]?.audio_url}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition ${
                        playing === cat.id
                          ? 'bg-red-500 text-white'
                          : settings.categories[cat.id]?.audio_url
                            ? 'bg-green-500 text-black hover:bg-green-400'
                            : 'bg-white/20 text-white/50 cursor-not-allowed'
                      }`}
                    >
                      {playing === cat.id ? '⏹ Stop' : '▶ Listen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Schedule Section */}
        <div className="bg-slate-900 rounded-xl p-4 mb-6 border border-slate-800">
          <h2 className="text-lg font-bold mb-3">⏰ Auto-Generation Schedule</h2>
          
          <div className="flex items-center justify-between mb-4">
            <span>Enable Auto-Generation</span>
            <button
              onClick={() => setSettings(prev => ({ ...prev, auto_generate: !prev.auto_generate }))}
              className={`w-12 h-6 rounded-full transition relative ${
                settings.auto_generate ? 'bg-green-500' : 'bg-slate-600'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                settings.auto_generate ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>

          {settings.auto_generate && (
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-slate-400 block mb-1">Morning</label>
                <input
                  type="time"
                  value={settings.generation_times[0] || '06:00'}
                  onChange={(e) => {
                    const times = [...settings.generation_times]
                    times[0] = e.target.value
                    setSettings(prev => ({ ...prev, generation_times: times }))
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Noon</label>
                <input
                  type="time"
                  value={settings.generation_times[1] || '12:00'}
                  onChange={(e) => {
                    const times = [...settings.generation_times]
                    times[1] = e.target.value
                    setSettings(prev => ({ ...prev, generation_times: times }))
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Evening</label>
                <input
                  type="time"
                  value={settings.generation_times[2] || '18:00'}
                  onChange={(e) => {
                    const times = [...settings.generation_times]
                    times[2] = e.target.value
                    setSettings(prev => ({ ...prev, generation_times: times }))
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Timezone</label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Anchorage">Alaska (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii (HT)</option>
                </select>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Stories per briefing:</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSettings(prev => ({ 
                    ...prev, 
                    stories_per_category: Math.max(2, prev.stories_per_category - 1) 
                  }))}
                  className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold"
                >
                  -
                </button>
                <span className="w-8 text-center font-bold">{settings.stories_per_category}</span>
                <button
                  onClick={() => setSettings(prev => ({ 
                    ...prev, 
                    stories_per_category: Math.min(6, prev.stories_per_category + 1) 
                  }))}
                  className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold"
                >
                  +
                </button>
              </div>
              <span className="text-slate-500 text-sm">(2-6 stories per briefing)</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className={`w-full py-4 rounded-xl font-bold transition ${
            saving
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-400 text-black'
          }`}
        >
          {saving ? 'Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  )
}
