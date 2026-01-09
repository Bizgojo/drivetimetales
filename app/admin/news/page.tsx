'use client';

import React, { useEffect, useState } from 'react';

interface RssFeed {
  name: string;
  url: string;
  enabled: boolean;
}

interface CategoryConfig {
  enabled: boolean;
  feeds: RssFeed[];
  voiceId: string;
  voiceName: string;
}

interface NewsSettings {
  categories: Record<string, CategoryConfig>;
  generationTimes: string[];
  timezone: string;
  autoGenerate: boolean;
  storiesPerCategory: number;
}

interface LiveEpisode {
  id: string;
  category: string;
  title: string;
  status: string;
  duration_mins: number;
  created_at: string;
}

const CATEGORIES = [
  { id: 'national', label: 'National News', icon: '🗞️', color: 'from-blue-600 to-blue-800' },
  { id: 'international', label: 'International News', icon: '🌍', color: 'from-green-600 to-green-800' },
  { id: 'business', label: 'Business & Finance', icon: '💼', color: 'from-yellow-600 to-yellow-800' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: 'from-red-600 to-red-800' },
  { id: 'science', label: 'Science & Technology', icon: '🔬', color: 'from-purple-600 to-purple-800' },
];

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', style: 'Professional' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', style: 'Warm' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', style: 'Energetic' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', style: 'Friendly' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', style: 'Deep' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', style: 'Authoritative' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', style: 'Casual' },
];

const TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern (ET)' },
  { id: 'America/Chicago', label: 'Central (CT)' },
  { id: 'America/Denver', label: 'Mountain (MT)' },
  { id: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { id: 'Europe/London', label: 'UK (GMT)' },
  { id: 'Europe/Paris', label: 'Central Europe (CET)' },
];

const DEFAULT_FEEDS: Record<string, RssFeed[]> = {
  national: [
    { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-usnews', enabled: true },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', enabled: true },
  ],
  international: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', enabled: true },
  ],
  business: [
    { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', enabled: true },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', enabled: true },
  ],
  science: [
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', enabled: true },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', enabled: true },
  ],
};

function getDefaultCategoryConfig(categoryId: string, index: number): CategoryConfig {
  return {
    enabled: true,
    feeds: DEFAULT_FEEDS[categoryId] || [],
    voiceId: VOICES[index % VOICES.length].id,
    voiceName: VOICES[index % VOICES.length].name,
  };
}

export default function NewsManagementPage() {
  const [settings, setSettings] = useState<NewsSettings>(() => ({
    categories: Object.fromEntries(
      CATEGORIES.map((cat, idx) => [cat.id, getDefaultCategoryConfig(cat.id, idx)])
    ),
    generationTimes: ['06:00', '12:00', '18:00'],
    timezone: 'America/New_York',
    autoGenerate: true,
    storiesPerCategory: 5,
  }));

  const [liveEpisodes, setLiveEpisodes] = useState<LiveEpisode[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load settings and live episodes on mount
  useEffect(() => {
    loadLiveEpisodes();
  }, []);

  async function loadLiveEpisodes() {
    try {
      const res = await fetch('/api/news/live');
      if (res.ok) {
        const data = await res.json();
        setLiveEpisodes(data.episodes || []);
      }
    } catch (err) {
      console.error('Failed to load live episodes:', err);
    }
  }

  async function generateCategory(categoryId: string) {
    setGenerating(categoryId);
    try {
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId }),
      });
      if (res.ok) {
        await loadLiveEpisodes();
      }
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(null);
    }
  }

  async function generateAll() {
    setGenerating('all');
    for (const cat of CATEGORIES) {
      if (settings.categories[cat.id]?.enabled) {
        await generateCategory(cat.id);
      }
    }
    setGenerating(null);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function updateCategoryVoice(categoryId: string, voiceId: string) {
    const voice = VOICES.find(v => v.id === voiceId);
    setSettings(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: {
          ...prev.categories[categoryId],
          voiceId: voiceId,
          voiceName: voice?.name || '',
        },
      },
    }));
  }

  function toggleCategoryEnabled(categoryId: string) {
    setSettings(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: {
          ...prev.categories[categoryId],
          enabled: !prev.categories[categoryId]?.enabled,
        },
      },
    }));
  }

  function getLiveEpisode(categoryId: string): LiveEpisode | undefined {
    return liveEpisodes.find(ep => ep.category === categoryId);
  }

  function getCategoryConfig(categoryId: string, index: number): CategoryConfig {
    return settings.categories[categoryId] || getDefaultCategoryConfig(categoryId, index);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            📰 News Management
          </h1>
          <p className="text-gray-400 mt-1">Configure daily briefings, RSS feeds, and generation settings</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={generateAll}
            disabled={generating !== null}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-600 text-white font-semibold rounded-xl flex items-center gap-2"
          >
            {generating === 'all' ? '⏳ Generating...' : '🔄 Generate All'}
          </button>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white font-semibold rounded-xl flex items-center gap-2"
          >
            {saving ? '💾 Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Live Episodes Status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
          Live Episodes
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CATEGORIES.map(cat => {
            const episode = getLiveEpisode(cat.id);
            return (
              <div key={cat.id} className={`bg-gradient-to-br ${cat.color} rounded-xl p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-white font-medium text-sm">{cat.label}</span>
                </div>
                {episode ? (
                  <div className="text-white/80 text-xs">
                    <p className="truncate">{episode.title}</p>
                    <p>{episode.duration_mins} min</p>
                  </div>
                ) : (
                  <p className="text-white/60 text-xs">No live episode</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Generation Times */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">⏰ Generation Schedule</h2>
          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={settings.autoGenerate}
              onChange={(e) => setSettings(prev => ({ ...prev, autoGenerate: e.target.checked }))}
              className="w-5 h-5 rounded"
            />
            <span className="text-white">Enable auto-generation</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Morning</label>
              <input
                type="time"
                value={settings.generationTimes[0]}
                onChange={(e) => {
                  const times = [...settings.generationTimes];
                  times[0] = e.target.value;
                  setSettings(prev => ({ ...prev, generationTimes: times }));
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Midday</label>
              <input
                type="time"
                value={settings.generationTimes[1]}
                onChange={(e) => {
                  const times = [...settings.generationTimes];
                  times[1] = e.target.value;
                  setSettings(prev => ({ ...prev, generationTimes: times }));
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Evening</label>
              <input
                type="time"
                value={settings.generationTimes[2]}
                onChange={(e) => {
                  const times = [...settings.generationTimes];
                  times[2] = e.target.value;
                  setSettings(prev => ({ ...prev, generationTimes: times }));
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">🌍 Timezone</h2>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white mb-4"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.id} value={tz.id}>{tz.label}</option>
            ))}
          </select>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Stories per category</label>
            <input
              type="range"
              min="3"
              max="10"
              value={settings.storiesPerCategory}
              onChange={(e) => setSettings(prev => ({ ...prev, storiesPerCategory: parseInt(e.target.value) }))}
              className="w-full"
            />
            <p className="text-orange-400 text-right font-bold">{settings.storiesPerCategory}</p>
          </div>
        </div>
      </div>

      {/* Categories & Feeds */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">📂 Categories & Voices</h2>
        <div className="space-y-4">
          {CATEGORIES.map((cat, index) => {
            const config = getCategoryConfig(cat.id, index);
            const isExpanded = expandedCategory === cat.id;

            return (
              <div key={cat.id} className="bg-gray-800 rounded-xl overflow-hidden">
                {/* Category Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50"
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-white font-bold">{cat.label}</span>
                    <span className="text-gray-500 text-sm">
                      Voice: {config.voiceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateCategory(cat.id);
                      }}
                      disabled={generating !== null || !config.enabled}
                      className="px-4 py-1 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-600 text-white text-sm rounded-lg"
                    >
                      {generating === cat.id ? '⏳' : '▶️'} Generate
                    </button>
                    <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={() => toggleCategoryEnabled(cat.id)}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-gray-400 text-sm">Enabled</span>
                    </label>
                    <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Settings */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-4">
                    <div className="mb-4">
                      <label className="block text-gray-400 text-sm mb-2">🎙️ Narrator Voice</label>
                      <select
                        value={config.voiceId}
                        onChange={(e) => updateCategoryVoice(cat.id, e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      >
                        {VOICES.map(voice => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} - {voice.style}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm mb-2">RSS Feeds ({config.feeds.length})</p>
                      <div className="space-y-2">
                        {config.feeds.map((feed, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                            <span className="text-white text-sm">{feed.name}</span>
                            <span className={feed.enabled ? 'text-green-400' : 'text-gray-500'}>
                              {feed.enabled ? '✓' : '✗'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
