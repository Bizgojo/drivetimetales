'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// ElevenLabs voice options
const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', desc: 'Warm, professional' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', desc: 'Clear, articulate' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'Female', desc: 'Strong, confident' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Male', desc: 'Warm, friendly' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'Male', desc: 'Deep, authoritative' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Male', desc: 'Clear, professional' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Male', desc: 'Casual, engaging' },
];

// Category configuration with icons
const CATEGORIES = [
  { id: 'national', name: 'National News', icon: '🇺🇸', color: 'from-red-500 to-red-600' },
  { id: 'international', name: 'International News', icon: '🌍', color: 'from-blue-500 to-blue-600' },
  { id: 'business', name: 'Business & Finance', icon: '💼', color: 'from-green-500 to-green-600' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-500 to-orange-600' },
  { id: 'science', name: 'Science & Technology', icon: '🔬', color: 'from-purple-500 to-purple-600' },
];

// Default RSS feeds per category
const DEFAULT_FEEDS: Record<string, string[]> = {
  national: [
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
  ],
  international: [
    'https://feeds.npr.org/1004/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  ],
  business: [
    'https://feeds.npr.org/1006/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://feeds.marketwatch.com/marketwatch/topstories/',
  ],
  sports: [
    'https://www.espn.com/espn/rss/news',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
  ],
  science: [
    'https://feeds.npr.org/1007/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    'https://www.sciencedaily.com/rss/all.xml',
  ],
};

interface CategorySettings {
  enabled: boolean;
  feeds: string[];
  voiceId: string;
  lastGenerated: string | null;
}

interface NewsSettings {
  categories: Record<string, CategorySettings>;
  schedule: {
    enabled: boolean;
    times: string[]; // ['06:00', '12:00', '18:00']
  };
  storiesPerCategory: number;
  personalizedIntros: boolean;
}

export default function AdminNewsPage() {
  const supabase = createClientComponentClient();
  const [settings, setSettings] = useState<NewsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize default settings
  const getDefaultSettings = (): NewsSettings => ({
    categories: Object.fromEntries(
      CATEGORIES.map(cat => [
        cat.id,
        {
          enabled: true,
          feeds: DEFAULT_FEEDS[cat.id] || [],
          voiceId: VOICE_OPTIONS[0].id, // Default to Sarah
          lastGenerated: null,
        },
      ])
    ),
    schedule: {
      enabled: true,
      times: ['06:00', '12:00', '18:00'], // Morning, Noon, Evening
    },
    storiesPerCategory: 5,
    personalizedIntros: false,
  });

  // Load settings from database
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('news_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
      }

      if (data?.settings) {
        // Merge with defaults to ensure all fields exist
        const merged = {
          ...getDefaultSettings(),
          ...data.settings,
          categories: {
            ...getDefaultSettings().categories,
            ...data.settings.categories,
          },
        };
        setSettings(merged);
      } else {
        setSettings(getDefaultSettings());
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSettings(getDefaultSettings());
    } finally {
      setLoading(false);
    }
  };

  // Save settings to database
  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('news_settings')
        .upsert({
          id: 1,
          settings: settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      console.error('Save error:', err);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Generate news for a category
  const generateNews = async (categoryId: string) => {
    setGenerating(categoryId);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: categoryId,
          voiceId: settings?.categories[categoryId]?.voiceId,
          personalizedIntros: settings?.personalizedIntros,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      // Update last generated timestamp
      if (settings) {
        setSettings({
          ...settings,
          categories: {
            ...settings.categories,
            [categoryId]: {
              ...settings.categories[categoryId],
              lastGenerated: new Date().toISOString(),
            },
          },
        });
      }

      setMessage({ type: 'success', text: `${getCategoryName(categoryId)} briefing generated!` });
    } catch (err: any) {
      console.error('Generation error:', err);
      setMessage({ type: 'error', text: err.message || 'Generation failed' });
    } finally {
      setGenerating(null);
    }
  };

  // Generate all categories
  const generateAll = async () => {
    for (const cat of CATEGORIES) {
      if (settings?.categories[cat.id]?.enabled) {
        await generateNews(cat.id);
      }
    }
  };

  // Helper functions
  const getCategoryName = (id: string) => CATEGORIES.find(c => c.id === id)?.name || id;
  
  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const updateCategorySetting = (categoryId: string, key: keyof CategorySettings, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      categories: {
        ...settings.categories,
        [categoryId]: {
          ...settings.categories[categoryId],
          [key]: value,
        },
      },
    });
  };

  const updateScheduleTime = (index: number, value: string) => {
    if (!settings) return;
    const newTimes = [...settings.schedule.times];
    newTimes[index] = value;
    setSettings({
      ...settings,
      schedule: {
        ...settings.schedule,
        times: newTimes,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">📰 News Briefings Admin</h1>
          <a href="/admin" className="text-slate-400 hover:text-white text-sm">
            ← Back to Admin
          </a>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Categories Section - Now with per-category narrator */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            📁 Categories
          </h2>

          <div className="space-y-6">
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="border-b border-slate-800 pb-6 last:border-0 last:pb-0">
                {/* Category Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <h3 className="font-semibold">{cat.name}</h3>
                      <p className="text-xs text-slate-500">
                        Last generated: {formatTimestamp(settings.categories[cat.id]?.lastGenerated)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Enable Toggle */}
                  <button
                    onClick={() => updateCategorySetting(cat.id, 'enabled', !settings.categories[cat.id]?.enabled)}
                    className={`w-14 h-7 rounded-full transition-colors ${
                      settings.categories[cat.id]?.enabled ? 'bg-orange-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform mx-1 ${
                      settings.categories[cat.id]?.enabled ? 'translate-x-7' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {settings.categories[cat.id]?.enabled && (
                  <div className="space-y-3 pl-11">
                    {/* Narrator Voice Selection - PER CATEGORY */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Narrator Voice</label>
                      <select
                        value={settings.categories[cat.id]?.voiceId || VOICE_OPTIONS[0].id}
                        onChange={(e) => updateCategorySetting(cat.id, 'voiceId', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                      >
                        {VOICE_OPTIONS.map(voice => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} ({voice.gender}) - {voice.desc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* RSS Feeds */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">RSS Feeds (one per line)</label>
                      <textarea
                        value={settings.categories[cat.id]?.feeds?.join('\n') || ''}
                        onChange={(e) => updateCategorySetting(cat.id, 'feeds', e.target.value.split('\n').filter(f => f.trim()))}
                        placeholder="Enter RSS feed URLs..."
                        rows={3}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Generation Schedule */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              ⏰ Auto-Generation Schedule
            </h2>
            <button
              onClick={() => setSettings({
                ...settings,
                schedule: { ...settings.schedule, enabled: !settings.schedule.enabled }
              })}
              className={`w-14 h-7 rounded-full transition-colors ${
                settings.schedule.enabled ? 'bg-orange-500' : 'bg-slate-700'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform mx-1 ${
                settings.schedule.enabled ? 'translate-x-7' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {settings.schedule.enabled && (
            <div className="space-y-4">
              {/* Three time slots: Morning, Noon, Evening */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Morning</label>
                  <input
                    type="time"
                    value={settings.schedule.times[0] || '06:00'}
                    onChange={(e) => updateScheduleTime(0, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Noon</label>
                  <input
                    type="time"
                    value={settings.schedule.times[1] || '12:00'}
                    onChange={(e) => updateScheduleTime(1, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Evening</label>
                  <input
                    type="time"
                    value={settings.schedule.times[2] || '18:00'}
                    onChange={(e) => updateScheduleTime(2, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Stories per category */}
              <div className="flex items-center gap-4">
                <label className="text-sm text-slate-400">Stories per category:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettings({
                      ...settings,
                      storiesPerCategory: Math.max(1, settings.storiesPerCategory - 1)
                    })}
                    className="w-8 h-8 bg-slate-800 rounded-lg hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-semibold">{settings.storiesPerCategory}</span>
                  <button
                    onClick={() => setSettings({
                      ...settings,
                      storiesPerCategory: Math.min(10, settings.storiesPerCategory + 1)
                    })}
                    className="w-8 h-8 bg-slate-800 rounded-lg hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Personalization Options */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            👤 Personalization
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Personalized Intros</p>
              <p className="text-sm text-slate-400">
                Use listener's first name and randomize intro scripts
              </p>
            </div>
            <button
              onClick={() => setSettings({
                ...settings,
                personalizedIntros: !settings.personalizedIntros
              })}
              className={`w-14 h-7 rounded-full transition-colors ${
                settings.personalizedIntros ? 'bg-orange-500' : 'bg-slate-700'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform mx-1 ${
                settings.personalizedIntros ? 'translate-x-7' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {settings.personalizedIntros && (
            <div className="mt-4 p-4 bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-300">
                Example intro: "Good morning, <span className="text-orange-400">Marc</span>! Here's your National News briefing for January 11th..."
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 rounded-xl font-semibold text-lg hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="animate-spin">⚙️</span>
              Saving...
            </>
          ) : (
            <>
              💾 Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
