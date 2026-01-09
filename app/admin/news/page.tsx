// Force rebuild
'use client';

import React, { useEffect, useState } from 'react';

// Types
interface RssFeed {
  name: string;
  url: string;
  enabled: boolean;
}

interface CategorySettings {
  enabled: boolean;
  feeds: RssFeed[];
  voice_id: string;
  voice_name: string;
}

interface NewsSettings {
  categories: Record<string, CategorySettings>;
  generation_times: string[]; // 3 times: morning, noon, evening
  generation_timezone: string;
  auto_generate: boolean;
  stories_per_category: number;
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
  { id: 'national', label: 'National News', icon: '🗞️' },
  { id: 'international', label: 'International News', icon: '🌍' },
  { id: 'business', label: 'Business & Finance', icon: '💼' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'science', label: 'Science & Technology', icon: '🔬' },
];

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)', style: 'Professional' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female)', style: 'Warm' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Female)', style: 'Energetic' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male)', style: 'Friendly' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Male)', style: 'Deep' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male)', style: 'Authoritative' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (Male)', style: 'Casual' },
];

const TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern (ET)' },
  { id: 'America/Chicago', label: 'Central (CT)' },
  { id: 'America/Denver', label: 'Mountain (MT)' },
  { id: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { id: 'America/Anchorage', label: 'Alaska (AKT)' },
  { id: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { id: 'Europe/London', label: 'UK (GMT/BST)' },
  { id: 'Europe/Paris', label: 'Central Europe (CET)' },
  { id: 'Asia/Tokyo', label: 'Japan (JST)' },
  { id: 'Australia/Sydney', label: 'Australia (AEST)' },
];

const DEFAULT_FEEDS: Record<string, RssFeed[]> = {
  national: [
    { name: 'AP News - US', url: 'https://rsshub.app/apnews/topics/apf-usnews', enabled: true },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', enabled: true },
    { name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', enabled: true },
  ],
  international: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', enabled: true },
    { name: 'AP News - World', url: 'https://rsshub.app/apnews/topics/apf-intlnews', enabled: true },
    { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/', enabled: true },
  ],
  business: [
    { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', enabled: true },
    { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', enabled: true },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', enabled: true },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', enabled: true },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', enabled: true },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/', enabled: true },
  ],
  science: [
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', enabled: true },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', enabled: true },
    { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml', enabled: true },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/science', enabled: true },
  ],
};

export default function NewsManagementPage() {
  const [settings, setSettings] = useState<NewsSettings>({
    categories: Object.fromEntries(
      CATEGORIES.map((cat, idx) => [cat.id, { 
        enabled: true, 
        feeds: DEFAULT_FEEDS[cat.id] || [],
        voice_id: VOICES[idx % VOICES.length].id,
        voice_name: VOICES[idx % VOICES.length].name,
      }])
    ),
    generation_times: ['06:00', '12:00', '18:00'], // 6am, noon, 6pm
    generation_timezone: 'America/New_York',
    auto_generate: true,
    stories_per_category: 5,
  });
  
  const [liveEpisodes, setLiveEpisodes] = useState<LiveEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');

  useEffect(() => {
    fetchSettings();
    fetchLiveEpisodes();
  }, []);

  async function fetchSettings() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const response = await fetch(`${url}/rest/v1/news_settings?select=*&limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      });

      if (response.ok) {
        const [data] = await response.json();
        if (data) {
          setSettings(prev => ({
            ...prev,
            ...data,
            categories: data.categories || prev.categories,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLiveEpisodes() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/news_episodes?is_live=eq.true&select=id,category,title,status,duration_mins,created_at`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setLiveEpisodes(data || []);
      }
    } catch (error) {
      console.error('Error fetching episodes:', error);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      const response = await fetch(`${url}/rest/v1/news_settings?id=eq.1`, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        alert('Settings saved!');
      } else {
        // Try insert if update fails (no existing record)
        const insertResponse = await fetch(`${url}/rest/v1/news_settings`, {
          method: 'POST',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: 1, ...settings }),
        });
        if (insertResponse.ok) {
          alert('Settings saved!');
        } else {
          alert('Failed to save settings');
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  }

  async function generateCategory(categoryId: string) {
    setGenerating(categoryId);
    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId, forceRegenerate: true }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`${categoryId} briefing generated successfully!`);
        fetchLiveEpisodes();
      } else {
        alert(`Failed: ${data.error || data.message}`);
      }
    } catch (error) {
      console.error('Error generating:', error);
      alert('Error generating briefing');
    } finally {
      setGenerating(null);
    }
  }

  async function generateAllCategories() {
    setGenerating('all');
    for (const cat of CATEGORIES) {
      if (settings.categories[cat.id]?.enabled) {
        await generateCategory(cat.id);
      }
    }
    setGenerating(null);
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

  function toggleFeedEnabled(categoryId: string, feedIndex: number) {
    setSettings(prev => {
      const newFeeds = [...(prev.categories[categoryId]?.feeds || [])];
      newFeeds[feedIndex] = { ...newFeeds[feedIndex], enabled: !newFeeds[feedIndex].enabled };
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [categoryId]: { ...prev.categories[categoryId], feeds: newFeeds },
        },
      };
    });
  }

  function removeFeed(categoryId: string, feedIndex: number) {
    setSettings(prev => {
      const newFeeds = [...(prev.categories[categoryId]?.feeds || [])];
      newFeeds.splice(feedIndex, 1);
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [categoryId]: { ...prev.categories[categoryId], feeds: newFeeds },
        },
      };
    });
  }

  function addFeed(categoryId: string) {
    if (!newFeedUrl || !newFeedName) {
      alert('Please enter feed name and URL');
      return;
    }
    setSettings(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: {
          ...prev.categories[categoryId],
          feeds: [
            ...(prev.categories[categoryId]?.feeds || []),
            { name: newFeedName, url: newFeedUrl, enabled: true },
          ],
        },
      },
    }));
    setNewFeedUrl('');
    setNewFeedName('');
  }

  function updateGenerationTime(index: number, value: string) {
    setSettings(prev => {
      const newTimes = [...prev.generation_times];
      newTimes[index] = value;
      return { ...prev, generation_times: newTimes };
    });
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading news settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">📰 News Management</h1>
          <p className="text-gray-400">Configure daily briefings, RSS feeds, and generation settings</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={generateAllCategories}
            disabled={generating !== null}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {generating === 'all' ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>🔄 Generate All</>
            )}
          </button>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Live Episodes Status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          Live Episodes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {CATEGORIES.map(cat => {
            const episode = liveEpisodes.find(ep => ep.category === cat.id);
            return (
              <div key={cat.id} className={`p-3 rounded-lg border ${episode ? 'bg-green-900/20 border-green-700' : 'bg-gray-800 border-gray-700'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{cat.icon}</span>
                  <span className="text-white font-medium text-sm">{cat.label}</span>
                </div>
                {episode ? (
                  <div className="text-xs text-gray-400">
                    <p>{episode.duration_mins} min</p>
                    <p>{formatDateTime(episode.created_at)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No live episode</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Generation Schedule */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">⏰ Generation Schedule</h2>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.auto_generate}
                onChange={(e) => setSettings(prev => ({ ...prev, auto_generate: e.target.checked }))}
                className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-white">Enable auto-generation</span>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Morning</label>
              <input
                type="time"
                value={settings.generation_times[0] || '06:00'}
                onChange={(e) => updateGenerationTime(0, e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Midday</label>
              <input
                type="time"
                value={settings.generation_times[1] || '12:00'}
                onChange={(e) => updateGenerationTime(1, e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Evening</label>
              <input
                type="time"
                value={settings.generation_times[2] || '18:00'}
                onChange={(e) => updateGenerationTime(2, e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
          <p className="text-gray-500 text-xs">Briefings generated 3x daily at these times</p>
        </div>

        {/* Timezone */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">🌍 Timezone</h2>
          <select
            value={settings.generation_timezone}
            onChange={(e) => setSettings(prev => ({ ...prev, generation_timezone: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white mb-4"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.id} value={tz.id}>{tz.label}</option>
            ))}
          </select>
          <p className="text-gray-500 text-xs">
            Generation times are based on this timezone. Subscribers receive briefings adjusted to their local time.
          </p>
        </div>
      </div>

      {/* Stories per category */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">📊 Stories per Category</h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="3"
            max="10"
            value={settings.stories_per_category}
            onChange={(e) => setSettings(prev => ({ ...prev, stories_per_category: parseInt(e.target.value) }))}
            className="flex-1"
          />
          <span className="text-2xl font-bold text-orange-400 w-12">{settings.stories_per_category}</span>
        </div>
        <p className="text-gray-500 text-sm mt-2">Top {settings.stories_per_category} stories will be included in each category briefing</p>
      </div>

      {/* Categories & Feeds */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">📂 Categories & RSS Feeds</h2>
        
        {CATEGORIES.map(cat => {
          const catSettings: CategorySettings = settings.categories[cat.id] || { 
            enabled: true, 
            feeds: [], 
            voice_id: VOICES[0].id, 
            voice_name: VOICES[0].name 
          };
          const isExpanded = expandedCategory === cat.id;
          
          return (
            <div key={cat.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Category Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/50"
                onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-white font-bold">{cat.label}</span>
                  <span className="text-gray-500 text-sm">({catSettings.feeds?.length || 0} feeds)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      generateCategory(cat.id);
                    }}
                    disabled={generating !== null || !catSettings.enabled}
                    className="px-3 py-1 bg-green-600/20 text-green-400 rounded-lg text-sm hover:bg-green-600/30 disabled:opacity-50"
                  >
                    {generating === cat.id ? '⏳' : '▶️'} Generate
                  </button>
                  <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={catSettings.enabled}
                      onChange={() => toggleCategoryEnabled(cat.id)}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-orange-500"
                    />
                    <span className="text-gray-400 text-sm">Enabled</span>
                  </label>
                  <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </div>

              {/* Expanded Feed List */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-800 pt-4">
                  {/* Voice Selection for this category */}
                  <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                    <label className="block text-gray-400 text-sm mb-2">🎙️ Narrator Voice for {cat.label}</label>
                    <select
                      value={catSettings.voice_id || VOICES[0].id}
                      onChange={(e) => {
                        const voice = VOICES.find(v => v.id === e.target.value);
                        setSettings(prev => ({
                          ...prev,
                          categories: {
                            ...prev.categories,
                            [cat.id]: {
                              ...prev.categories[cat.id],
                              voice_id: e.target.value,
                              voice_name: voice?.name || '',
                            },
                          },
                        }));
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      {VOICES.map(voice => (
                        <option key={voice.id} value={voice.id}>{voice.name} - {voice.style}</option>
                      ))}
                    </select>
                  </div>

                  {/* Existing Feeds */}
                  <p className="text-gray-400 text-sm mb-2">RSS Feeds:</p>
                  <div className="space-y-2 mb-4">
                    {(catSettings.feeds || []).map((feed, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                        <input
                          type="checkbox"
                          checked={feed.enabled}
                          onChange={() => toggleFeedEnabled(cat.id, idx)}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{feed.name}</p>
                          <p className="text-gray-500 text-xs truncate">{feed.url}</p>
                        </div>
                        <button
                          onClick={() => removeFeed(cat.id, idx)}
                          className="text-red-400 hover:text-red-300 px-2"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add New Feed */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Feed name"
                      value={newFeedName}
                      onChange={(e) => setNewFeedName(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500"
                    />
                    <input
                      type="url"
                      placeholder="RSS feed URL"
                      value={newFeedUrl}
                      onChange={(e) => setNewFeedUrl(e.target.value)}
                      className="flex-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500"
                    />
                    <button
                      onClick={() => addFeed(cat.id)}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg text-sm"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
