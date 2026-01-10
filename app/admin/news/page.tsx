'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

// News categories with default RSS feeds
const NEWS_CATEGORIES = [
  {
    id: 'national',
    name: 'National News',
    icon: '🇺🇸',
    color: 'blue',
    defaultFeeds: [
      'https://feeds.npr.org/1001/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    ]
  },
  {
    id: 'international',
    name: 'International News',
    icon: '🌍',
    color: 'green',
    defaultFeeds: [
      'https://feeds.npr.org/1004/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    ]
  },
  {
    id: 'business',
    name: 'Business & Finance',
    icon: '💼',
    color: 'yellow',
    defaultFeeds: [
      'https://feeds.npr.org/1006/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    ]
  },
  {
    id: 'sports',
    name: 'Sports',
    icon: '⚽',
    color: 'red',
    defaultFeeds: [
      'https://www.espn.com/espn/rss/news',
      'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
    ]
  },
  {
    id: 'science',
    name: 'Science & Technology',
    icon: '🔬',
    color: 'purple',
    defaultFeeds: [
      'https://feeds.npr.org/1007/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    ]
  },
]

interface CategorySettings {
  enabled: boolean
  feeds: string[]
}

interface NewsSettings {
  categories: Record<string, CategorySettings>
  narrator_voice_id: string
  narrator_voice_name: string
  generation_times: string[]
  auto_generate: boolean
  stories_per_category: number
}

interface NewsEpisode {
  id: string
  title: string
  category: string
  edition: string
  is_live: boolean
  audio_url: string | null
  created_at: string
  published_at: string | null
}

export default function AdminNewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const [settings, setSettings] = useState<NewsSettings>({
    categories: {},
    narrator_voice_id: 'EXAVITQu4vr4xnSDxMaL',
    narrator_voice_name: 'Sarah (Female)',
    generation_times: ['06:00', '18:00'],
    auto_generate: true,
    stories_per_category: 5,
  })

  const [episodes, setEpisodes] = useState<NewsEpisode[]>([])
  const [activeTab, setActiveTab] = useState<'settings' | 'episodes'>('settings')

  useEffect(() => {
    // Set a max timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('[News] Loading timeout - showing page with defaults')
      setSettings(prev => ({
        ...prev,
        categories: initializeCategories()
      }))
      setLoading(false)
    }, 5000)

    loadSettings().finally(() => clearTimeout(timeout))
    loadEpisodes()
    
    return () => clearTimeout(timeout)
  }, [])

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('news_settings')
        .select('*')
        .eq('id', 1)
        .single()

      if (data) {
        setSettings({
          categories: data.categories || initializeCategories(),
          narrator_voice_id: data.narrator_voice_id || 'EXAVITQu4vr4xnSDxMaL',
          narrator_voice_name: data.narrator_voice_name || 'Sarah (Female)',
          generation_times: data.generation_times || ['06:00', '18:00'],
          auto_generate: data.auto_generate ?? true,
          stories_per_category: data.stories_per_category || 5,
        })
      } else {
        // Initialize with defaults
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
        feeds: cat.defaultFeeds
      }
    })
    return cats
  }

  async function loadEpisodes() {
    try {
      const { data } = await supabase
        .from('news_episodes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setEpisodes(data)
      }
    } catch (error) {
      console.error('Error loading episodes:', error)
    }
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
          narrator_voice_id: settings.narrator_voice_id,
          narrator_voice_name: settings.narrator_voice_name,
          generation_times: settings.generation_times,
          auto_generate: settings.auto_generate,
          stories_per_category: settings.stories_per_category,
          updated_at: new Date().toISOString(),
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

  async function generateCategory(categoryId: string) {
    setGenerating(categoryId)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId })
      })

      const result = await response.json()

      if (result.success) {
        setMessage({ type: 'success', text: `${getCategoryName(categoryId)} briefing generated!` })
        loadEpisodes()
      } else {
        throw new Error(result.error || 'Generation failed')
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to generate briefing' })
    } finally {
      setGenerating(null)
    }
  }

  async function generateAllCategories() {
    setGenerating('all')
    setMessage(null)

    const enabledCategories = NEWS_CATEGORIES.filter(cat => 
      settings.categories[cat.id]?.enabled
    )

    let successCount = 0
    let failCount = 0

    for (const cat of enabledCategories) {
      try {
        const response = await fetch('/api/admin/generate-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat.id })
        })

        const result = await response.json()
        if (result.success) successCount++
        else failCount++
      } catch {
        failCount++
      }
    }

    setMessage({
      type: failCount === 0 ? 'success' : 'error',
      text: `Generated ${successCount}/${enabledCategories.length} briefings${failCount > 0 ? ` (${failCount} failed)` : ''}`
    })
    
    loadEpisodes()
    setGenerating(null)
  }

  function getCategoryName(id: string): string {
    return NEWS_CATEGORIES.find(c => c.id === id)?.name || id
  }

  function getCategoryIcon(id: string): string {
    return NEWS_CATEGORIES.find(c => c.id === id)?.icon || '📰'
  }

  function toggleCategory(categoryId: string) {
    setSettings(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: {
          ...prev.categories[categoryId],
          enabled: !prev.categories[categoryId]?.enabled
        }
      }
    }))
  }

  function updateCategoryFeeds(categoryId: string, feeds: string[]) {
    setSettings(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: {
          ...prev.categories[categoryId],
          feeds
        }
      }
    }))
  }

  function selectVoice(voiceId: string) {
    const voice = AVAILABLE_VOICES.find(v => v.id === voiceId)
    if (voice) {
      setSettings(prev => ({
        ...prev,
        narrator_voice_id: voice.id,
        narrator_voice_name: voice.name
      }))
    }
  }

  function updateGenerationTime(index: number, time: string) {
    setSettings(prev => {
      const newTimes = [...prev.generation_times]
      newTimes[index] = time
      return { ...prev, generation_times: newTimes }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-sm">Loading news settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-400 hover:text-white transition">
              ← Back
            </Link>
            <h1 className="text-xl font-bold">📰 News Briefings</h1>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="flex">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-medium transition ${
              activeTab === 'settings'
                ? 'text-orange-400 border-b-2 border-orange-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => setActiveTab('episodes')}
            className={`px-6 py-3 font-medium transition ${
              activeTab === 'episodes'
                ? 'text-orange-400 border-b-2 border-orange-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🎙️ Episodes ({episodes.length})
          </button>
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto">
        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Quick Generate */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h2 className="text-lg font-bold mb-3">🚀 Quick Generate</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                {NEWS_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => generateCategory(cat.id)}
                    disabled={generating !== null || !settings.categories[cat.id]?.enabled}
                    className={`p-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                      !settings.categories[cat.id]?.enabled
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        : generating === cat.id
                        ? 'bg-orange-500/50 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {generating === cat.id ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>{cat.icon}</span>
                    )}
                    <span className="text-sm">{cat.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={generateAllCategories}
                disabled={generating !== null}
                className={`w-full py-3 rounded-xl font-bold transition ${
                  generating
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-400 text-black'
                }`}
              >
                {generating === 'all' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Generating All...
                  </span>
                ) : (
                  '⚡ Generate All Categories'
                )}
              </button>
            </div>

            {/* Categories */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h2 className="text-lg font-bold mb-3">📁 Categories</h2>
              <div className="space-y-3">
                {NEWS_CATEGORIES.map(cat => (
                  <div key={cat.id} className="bg-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{cat.icon}</span>
                        <span className="font-medium">{cat.name}</span>
                      </div>
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className={`w-12 h-6 rounded-full transition relative ${
                          settings.categories[cat.id]?.enabled
                            ? 'bg-green-500'
                            : 'bg-slate-600'
                        }`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                          settings.categories[cat.id]?.enabled ? 'left-7' : 'left-1'
                        }`} />
                      </button>
                    </div>
                    {settings.categories[cat.id]?.enabled && (
                      <div className="mt-2">
                        <label className="text-xs text-slate-400 block mb-1">RSS Feeds (one per line)</label>
                        <textarea
                          value={settings.categories[cat.id]?.feeds?.join('\n') || ''}
                          onChange={(e) => updateCategoryFeeds(cat.id, e.target.value.split('\n').filter(f => f.trim()))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
                          rows={2}
                          placeholder="Enter RSS feed URLs..."
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Narrator Voice */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h2 className="text-lg font-bold mb-3">🎙️ Narrator Voice</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {AVAILABLE_VOICES.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => selectVoice(voice.id)}
                    className={`p-3 rounded-lg text-left transition ${
                      settings.narrator_voice_id === voice.id
                        ? 'bg-orange-500/20 border-2 border-orange-500'
                        : 'bg-slate-800 border-2 border-transparent hover:border-slate-600'
                    }`}
                  >
                    <p className="font-medium">{voice.name}</p>
                    <p className="text-sm text-slate-400">{voice.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
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
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-400 w-24">Morning:</label>
                    <input
                      type="time"
                      value={settings.generation_times[0] || '06:00'}
                      onChange={(e) => updateGenerationTime(0, e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-400 w-24">Evening:</label>
                    <input
                      type="time"
                      value={settings.generation_times[1] || '18:00'}
                      onChange={(e) => updateGenerationTime(1, e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-400">Stories per category:</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, stories_per_category: Math.max(3, prev.stories_per_category - 1) }))}
                      className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold">{settings.stories_per_category}</span>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, stories_per_category: Math.min(10, prev.stories_per_category + 1) }))}
                      className="w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={saveSettings}
              disabled={saving}
              className={`w-full py-4 rounded-xl font-bold transition ${
                saving
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-400 text-black'
              }`}
            >
              {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        )}

        {activeTab === 'episodes' && (
          <div className="space-y-3">
            {episodes.length === 0 ? (
              <div className="bg-slate-900 rounded-xl p-8 text-center border border-slate-800">
                <p className="text-slate-400">No episodes generated yet</p>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="mt-3 text-orange-400 hover:text-orange-300"
                >
                  Go to Settings to generate →
                </button>
              </div>
            ) : (
              episodes.map(ep => (
                <div
                  key={ep.id}
                  className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex items-center gap-4"
                >
                  <div className="text-3xl">
                    {getCategoryIcon(ep.category)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{ep.title}</p>
                      {ep.is_live && (
                        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      {getCategoryName(ep.category)} • {new Date(ep.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ep.audio_url ? (
                      <a
                        href={ep.audio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition"
                      >
                        🎧 Play
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">No audio</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
