'use client';

import React, { useState, useEffect, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface Voice {
  voice_id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
}

interface CategoryConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  voiceId: string;
  lastGenerated: string | null;
  episodeNumber: number;
  isGenerating: boolean;
  audioUrl: string | null;
}

interface ScheduleTime {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
}

interface NewsBriefingsSettings {
  categories: CategoryConfig[];
  schedule: ScheduleTime[];
  automate: boolean;
  personalizeIntros: boolean;
  timezone: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AVAILABLE_VOICES: Voice[] = [
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', description: 'Warm, professional' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', description: 'Clear, articulate' },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', description: 'Strong, confident' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', description: 'Warm, friendly' },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', description: 'Deep, authoritative' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', description: 'Clear, professional' },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', description: 'Casual, engaging' },
];

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'local', label: 'Local News & Weather', icon: '🏠', description: 'Weather first, then local news within 50mi radius', voiceId: 'EXAVITQu4vr4xnSDxMaL', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'national', label: 'National News', icon: '🇺🇸', description: 'Top 5 US news stories', voiceId: '21m00Tcm4TlvDq8ikWAM', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'international', label: 'International News', icon: '🌍', description: 'Top 5 world news stories', voiceId: 'VR6AewLTigWG4xSOukaG', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'business', label: 'Business & Finance', icon: '📈', description: 'Markets, economy, corporate news', voiceId: 'pNInz6obpgDQGcFmaJgB', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'sports', label: 'Sports', icon: '⚽', description: 'Top 5 sports stories', voiceId: 'ErXwobaYiN019PkySvjV', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'science', label: 'Science & Technology', icon: '🔬', description: 'Tech, science, innovation news', voiceId: 'yoZ06aMxZJJ28mfd3POQ', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
];

const DEFAULT_SCHEDULE: ScheduleTime[] = [
  { id: 'morning', label: 'Morning', time: '06:00', enabled: true },
  { id: 'noon', label: 'Noon', time: '12:00', enabled: true },
  { id: 'evening', label: 'Evening', time: '18:00', enabled: true },
];

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function NewsBriefingsAdmin() {
  // State
  const [settings, setSettings] = useState<NewsBriefingsSettings>({
    categories: DEFAULT_CATEGORIES,
    schedule: DEFAULT_SCHEDULE,
    automate: false,
    personalizeIntros: true,
    timezone: 'America/New_York',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Auto-dismiss status messages
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/news-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(prev => ({
            ...prev,
            ...data.settings,
            categories: data.settings.categories || DEFAULT_CATEGORIES,
            schedule: data.settings.schedule || DEFAULT_SCHEDULE,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setStatusMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  }

  async function generateBriefing(categoryId: string) {
    // Update generating state
    setSettings(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId ? { ...cat, isGenerating: true } : cat
      ),
    }));

    try {
      const category = settings.categories.find(c => c.id === categoryId);
      if (!category) throw new Error('Category not found');

      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          voiceId: category.voiceId,
          personalizeIntros: settings.personalizeIntros,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSettings(prev => ({
          ...prev,
          categories: prev.categories.map(cat =>
            cat.id === categoryId
              ? {
                  ...cat,
                  isGenerating: false,
                  lastGenerated: new Date().toISOString(),
                  episodeNumber: data.episodeNumber || cat.episodeNumber + 1,
                  audioUrl: data.audioUrl,
                }
              : cat
          ),
        }));
        setStatusMessage({ type: 'success', text: `${category.label} briefing generated!` });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: `Failed to generate briefing: ${error}` });
      setSettings(prev => ({
        ...prev,
        categories: prev.categories.map(cat =>
          cat.id === categoryId ? { ...cat, isGenerating: false } : cat
        ),
      }));
    }
  }

  async function generateAllBriefings() {
    setIsGeneratingAll(true);
    setStatusMessage({ type: 'success', text: 'Generating all briefings... This may take a few minutes.' });

    for (const category of settings.categories) {
      await generateBriefing(category.id);
      // Small delay between generations to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    setIsGeneratingAll(false);
    setStatusMessage({ type: 'success', text: 'All briefings generated!' });
  }

  async function previewVoice(voiceId: string) {
    if (previewingVoice === voiceId) {
      // Stop current preview
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPreviewingVoice(null);
      return;
    }

    setPreviewingVoice(voiceId);
    try {
      const res = await fetch('/api/admin/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: 'Hello, this is your news briefing preview.' }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => setPreviewingVoice(null);
        audioRef.current.play();
      }
    } catch (error) {
      console.error('Preview failed:', error);
      setPreviewingVoice(null);
    }
  }

  function playBriefing(audioUrl: string | null) {
    if (!audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(audioUrl);
    audioRef.current.play();
  }

  // ============================================================================
  // UPDATE FUNCTIONS
  // ============================================================================

  function updateCategoryVoice(categoryId: string, voiceId: string) {
    setSettings(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId ? { ...cat, voiceId } : cat
      ),
    }));
  }

  function updateScheduleTime(scheduleId: string, time: string) {
    setSettings(prev => ({
      ...prev,
      schedule: prev.schedule.map(s =>
        s.id === scheduleId ? { ...s, time } : s
      ),
    }));
  }

  function toggleScheduleEnabled(scheduleId: string) {
    setSettings(prev => ({
      ...prev,
      schedule: prev.schedule.map(s =>
        s.id === scheduleId ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  function formatTimestamp(isoString: string | null): string {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function getVoiceName(voiceId: string): string {
    return AVAILABLE_VOICES.find(v => v.voice_id === voiceId)?.name || 'Unknown';
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading News Briefings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">📰 News Briefings</h1>
            <p className="text-gray-400">Manage automated news briefings for Drive Time Tales</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={generateAllBriefings}
              disabled={isGeneratingAll}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-black font-bold rounded-xl transition-all flex items-center gap-2"
            >
              {isGeneratingAll ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Generating...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  Generate All
                </>
              )}
            </button>
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 text-white font-semibold rounded-xl transition-all"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mb-6 p-4 rounded-xl ${
              statusMessage.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Automation Toggle */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">⚡ Automation</h2>
              <p className="text-gray-400 text-sm">
                When enabled, briefings are automatically generated at scheduled times
              </p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, automate: !prev.automate }))}
              className={`relative w-16 h-8 rounded-full transition-colors ${
                settings.automate ? 'bg-orange-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
                  settings.automate ? 'left-9' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Schedule Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">🕐 Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {settings.schedule.map(slot => (
              <div
                key={slot.id}
                className={`p-4 rounded-xl border transition-all ${
                  slot.enabled
                    ? 'bg-gray-800 border-orange-500/50'
                    : 'bg-gray-800/50 border-gray-700 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold">{slot.label}</span>
                  <button
                    onClick={() => toggleScheduleEnabled(slot.id)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      slot.enabled ? 'bg-orange-500' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full transition-all ${
                        slot.enabled ? 'ml-5' : 'ml-0.5'
                      }`}
                    />
                  </button>
                </div>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateScheduleTime(slot.id, e.target.value)}
                  disabled={!slot.enabled}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-center disabled:opacity-50"
                />
              </div>
            ))}

            {/* Timezone Selector */}
            <div className="p-4 rounded-xl bg-gray-800 border border-gray-700">
              <span className="text-white font-semibold block mb-3">Timezone</span>
              <select
                value={settings.timezone}
                onChange={e => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              >
                {US_TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Personalization Toggle */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">👤 Personalization</h2>
              <p className="text-gray-400 text-sm">
                Personalize intros with subscriber's first name (e.g., "Hello Marc, here's your briefing...")
              </p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, personalizeIntros: !prev.personalizeIntros }))}
              className={`relative w-16 h-8 rounded-full transition-colors ${
                settings.personalizeIntros ? 'bg-orange-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
                  settings.personalizeIntros ? 'left-9' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Categories Grid */}
        <h2 className="text-xl font-bold text-white mb-4">📂 Categories</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {settings.categories.map(category => (
            <div
              key={category.id}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all"
            >
              {/* Category Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{category.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{category.label}</h3>
                    <p className="text-gray-500 text-sm">{category.description}</p>
                  </div>
                </div>
                {category.episodeNumber > 0 && (
                  <span className="px-3 py-1 bg-gray-800 rounded-full text-gray-400 text-xs">
                    Episode {category.episodeNumber}
                  </span>
                )}
              </div>

              {/* Voice Selection */}
              <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">Narrator Voice</label>
                <div className="flex items-center gap-2">
                  <select
                    value={category.voiceId}
                    onChange={e => updateCategoryVoice(category.id, e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
                  >
                    {AVAILABLE_VOICES.map(voice => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name} ({voice.gender}) - {voice.description}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => previewVoice(category.voiceId)}
                    className={`px-4 py-2.5 rounded-xl transition-all ${
                      previewingVoice === category.voiceId
                        ? 'bg-orange-500 text-black'
                        : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                    title="Preview voice"
                  >
                    {previewingVoice === category.voiceId ? '⏹️' : '▶️'}
                  </button>
                </div>
              </div>

              {/* Last Generated & Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="text-sm">
                  <span className="text-gray-500">Last generated: </span>
                  <span className="text-gray-300">{formatTimestamp(category.lastGenerated)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {category.audioUrl && (
                    <button
                      onClick={() => playBriefing(category.audioUrl)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-all flex items-center gap-2"
                    >
                      <span>🔊</span>
                      Listen
                    </button>
                  )}
                  <button
                    onClick={() => generateBriefing(category.id)}
                    disabled={category.isGenerating || isGeneratingAll}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-black font-semibold rounded-xl transition-all flex items-center gap-2"
                  >
                    {category.isGenerating ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Generating...
                      </>
                    ) : (
                      <>
                        <span>🎙️</span>
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Instructions Footer */}
        <div className="mt-8 p-6 bg-gray-900/50 border border-gray-800 rounded-2xl">
          <h3 className="text-white font-bold mb-3">📋 How It Works</h3>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>• Each category searches for the <strong className="text-white">top 5 real news stories</strong> from verified sources</li>
            <li>• <strong className="text-white">Local News & Weather</strong> uses subscriber's address/zip code for 50-mile radius coverage</li>
            <li>• Briefings are automatically <strong className="text-white">deleted when new ones are generated</strong></li>
            <li>• Episode numbers <strong className="text-white">reset to 1 on January 1st</strong> each year</li>
            <li>• When automation is ON, briefings generate at scheduled times for <strong className="text-white">all US timezones</strong></li>
            <li>• Clicking a category on the home page <strong className="text-white">plays immediately</strong> without extra clicks</li>
          </ul>
        </div>

        {/* Version Footer */}
        <div className="mt-8 text-center text-gray-600 text-xs">
          News Briefings Admin v1.1.0 • Drive Time Tales
        </div>
      </div>
    </div>
  );
}
