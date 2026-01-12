'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  description?: string;
  preview_url?: string;
}

interface CategoryConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  voiceId: string;
  narratorName: string;
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
  testZipCode: string;
}

const FALLBACK_VOICES: Voice[] = [
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Warm, professional' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Clear, articulate' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Clear, professional' },
];

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'local', label: 'Local News & Weather', icon: '🏠', description: 'Weather first, then local news within 50mi radius', voiceId: 'EXAVITQu4vr4xnSDxMaL', narratorName: 'Sarah', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'national', label: 'National News', icon: '🇺🇸', description: 'Top 5 US news stories', voiceId: '21m00Tcm4TlvDq8ikWAM', narratorName: 'Rachel', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'international', label: 'International News', icon: '🌍', description: 'Top 5 world news stories', voiceId: 'VR6AewLTigWG4xSOukaG', narratorName: 'Arnold', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'business', label: 'Business & Finance', icon: '📈', description: 'Markets, economy, corporate news', voiceId: 'pNInz6obpgDQGcFmaJgB', narratorName: 'Adam', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'sports', label: 'Sports', icon: '⚽', description: 'Top 5 sports stories', voiceId: 'ErXwobaYiN019PkySvjV', narratorName: 'Antoni', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
  { id: 'science', label: 'Science & Technology', icon: '🔬', description: 'Tech, science, innovation news', voiceId: 'yoZ06aMxZJJ28mfd3POQ', narratorName: 'Sam', lastGenerated: null, episodeNumber: 0, isGenerating: false, audioUrl: null },
];

const DEFAULT_SCHEDULE: ScheduleTime[] = [
  { id: 'morning', label: 'Morning', time: '06:00', enabled: true },
  { id: 'noon', label: 'Noon', time: '12:00', enabled: true },
  { id: 'evening', label: 'Evening', time: '18:00', enabled: true },
];

  async function generateBriefing(categoryId: string) {
    setSettings(prev => ({ ...prev, categories: prev.categories.map(cat => cat.id === categoryId ? { ...cat, isGenerating: true } : cat) }));
    try {
      const category = settings.categories.find(c => c.id === categoryId);
      if (!category) throw new Error('Category not found');
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, voiceId: category.voiceId, personalizeIntros: settings.personalizeIntros, narratorName: category.narratorName, zipCode: categoryId === 'local' ? settings.testZipCode : undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(prev => ({ ...prev, categories: prev.categories.map(cat => cat.id === categoryId ? { ...cat, isGenerating: false, lastGenerated: new Date().toISOString(), episodeNumber: data.episodeNumber || cat.episodeNumber + 1, audioUrl: data.audioUrl } : cat) }));
        setStatusMessage({ type: 'success', text: `${category.label} briefing generated!` });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: `Failed to generate briefing: ${error}` });
      setSettings(prev => ({ ...prev, categories: prev.categories.map(cat => cat.id === categoryId ? { ...cat, isGenerating: false } : cat) }));
    }
  }

  async function generateAllBriefings() {
    setIsGeneratingAll(true);
    for (const category of settings.categories) {
      await generateBriefing(category.id);
    }
    setIsGeneratingAll(false);
    setStatusMessage({ type: 'success', text: 'All briefings generated!' });
  }

  async function previewVoice(voice: Voice) {
    if (previewingVoice === voice.voice_id) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voice.voice_id);
    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      audio.play();
      return;
    }
    try {
      const res = await fetch('/api/admin/preview-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId: voice.voice_id }) });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPreviewingVoice(null);
        audio.play();
      }
    } catch (error) {
      console.error('Preview failed:', error);
      setPreviewingVoice(null);
    }
  }

  function playBriefing(audioUrl: string | null) {
    if (!audioUrl) return;
    if (audioRef.current) { audioRef.current.pause(); }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();
  }

  function updateCategoryVoice(categoryId: string, voiceId: string) {
    setSettings(prev => ({ ...prev, categories: prev.categories.map(cat => cat.id === categoryId ? { ...cat, voiceId } : cat) }));
  }

  function updateCategoryNarratorName(categoryId: string, narratorName: string) {
    setSettings(prev => ({ ...prev, categories: prev.categories.map(cat => cat.id === categoryId ? { ...cat, narratorName } : cat) }));
  }

  function toggleScheduleEnabled(scheduleId: string) {
    setSettings(prev => ({ ...prev, schedule: prev.schedule.map(s => s.id === scheduleId ? { ...s, enabled: !s.enabled } : s) }));
  }

  function updateScheduleTime(scheduleId: string, time: string) {
    setSettings(prev => ({ ...prev, schedule: prev.schedule.map(s => s.id === scheduleId ? { ...s, time } : s) }));
  }

  function formatTimestamp(isoString: string | null): string {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">📰 News Briefings</h1>
            <p className="text-gray-400 mt-1">Generate AI-powered news briefings for your subscribers</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={generateAllBriefings} disabled={isGeneratingAll} className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-black font-bold rounded-xl transition-all">
              {isGeneratingAll ? '⏳ Generating All...' : '🎙️ Generate All'}
            </button>
            <button onClick={saveSettings} disabled={isSaving} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-all">
              {isSaving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={`mb-6 p-4 rounded-xl ${statusMessage.type === 'success' ? 'bg-green-500/20 border border-green-500/50 text-green-400' : 'bg-red-500/20 border border-red-500/50 text-red-400'}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">📍 Test Location (Local News)</h2>
              <p className="text-gray-400 text-sm">Enter a zip code for testing local news. In production, subscriber's zip code will be used.</p>
            </div>
            <input type="text" value={settings.testZipCode} onChange={e => setSettings(prev => ({ ...prev, testZipCode: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="e.g., 28801" maxLength={5} className="w-32 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-center focus:border-orange-500 focus:outline-none" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">⚡ Automation</h2>
              <p className="text-gray-400 text-sm">Automatically generate briefings at scheduled times</p>
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, automate: !prev.automate }))} className={`relative w-16 h-8 rounded-full transition-colors ${settings.automate ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${settings.automate ? 'left-9' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-2">🕐 Schedule</h2>
          <p className="text-gray-400 text-sm mb-4">Times are generated for each US time zone (ET, CT, MT, PT, AKT, HT)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {settings.schedule.map(slot => (
              <div key={slot.id} className={`p-4 rounded-xl border transition-all ${slot.enabled ? 'bg-gray-800 border-orange-500/50' : 'bg-gray-800/50 border-gray-700 opacity-60'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold">{slot.label}</span>
                  <button onClick={() => toggleScheduleEnabled(slot.id)} className={`w-10 h-5 rounded-full transition-colors ${slot.enabled ? 'bg-orange-500' : 'bg-gray-600'}`}>
                    <span className={`block w-4 h-4 bg-white rounded-full transition-all ${slot.enabled ? 'ml-5' : 'ml-0.5'}`} />
                  </button>
                </div>
                <input type="time" value={slot.time} onChange={e => updateScheduleTime(slot.id, e.target.value)} disabled={!slot.enabled} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-center disabled:opacity-50" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">👤 Personalization</h2>
              <p className="text-gray-400 text-sm">Personalize intros with subscriber's first name</p>
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, personalizeIntros: !prev.personalizeIntros }))} className={`relative w-16 h-8 rounded-full transition-colors ${settings.personalizeIntros ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${settings.personalizeIntros ? 'left-9' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-4">📂 Categories</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {settings.categories.map(category => (
            <div key={category.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{category.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{category.label}</h3>
                    <p className="text-gray-500 text-sm">{category.description}</p>
                  </div>
                </div>
                {category.episodeNumber > 0 && (
                  <span className="px-3 py-1 bg-gray-800 rounded-full text-gray-400 text-xs">Episode {category.episodeNumber}</span>
                )}
              </div>

              <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">Narrator Voice {isLoadingVoices && <span className="text-orange-500">(loading...)</span>}</label>
                <input type="text" placeholder="Search voices..." value={voiceSearch[category.id] || ''} onChange={e => setVoiceSearch(prev => ({ ...prev, [category.id]: e.target.value }))} className="w-full px-3 py-2 mb-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none" />
                <div className="h-40 overflow-y-scroll bg-gray-800 border border-gray-700 rounded-xl">
                  {voices.filter(voice => { const search = (voiceSearch[category.id] || '').toLowerCase(); return !search || voice.name.toLowerCase().includes(search); }).map(voice => (
                    <div key={voice.voice_id} onClick={() => { updateCategoryVoice(category.id, voice.voice_id); if (!category.narratorName) { updateCategoryNarratorName(category.id, voice.name); } }} className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${category.voiceId === voice.voice_id ? 'bg-orange-500/20 border-l-2 border-orange-500' : 'hover:bg-gray-700/50'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{voice.name}</div>
                        {voice.labels?.accent && <div className="text-gray-500 text-xs truncate">{voice.labels.accent}</div>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(voice); }} className={`ml-2 px-2 py-1 rounded-lg transition-all flex-shrink-0 text-xs ${previewingVoice === voice.voice_id ? 'bg-orange-500 text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                        {previewingVoice === voice.voice_id ? '⏹ Stop' : '▶ Play'}
                      </button>
                    </div>
                  ))}
                  {voices.filter(voice => { const search = (voiceSearch[category.id] || '').toLowerCase(); return !search || voice.name.toLowerCase().includes(search); }).length === 0 && (
                    <div className="px-3 py-4 text-gray-500 text-sm text-center">No voices found</div>
                  )}
                </div>
                <div className="mt-1 text-gray-500 text-xs">Selected: <span className="text-orange-400">{voices.find(v => v.voice_id === category.voiceId)?.name || 'None'}</span></div>
              </div>

              <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">Narrator Name (for intro)</label>
                <input type="text" value={category.narratorName} onChange={e => updateCategoryNarratorName(category.id, e.target.value)} placeholder="e.g., Sarah, John, etc." className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none" />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="text-sm">
                  <span className="text-gray-500">Last generated: </span>
                  <span className="text-gray-300">{formatTimestamp(category.lastGenerated)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {category.audioUrl && (
                    <button onClick={() => playBriefing(category.audioUrl)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all flex items-center gap-2">
                      <span>🔊</span> Listen
                    </button>
                  )}
                  <button onClick={() => generateBriefing(category.id)} disabled={category.isGenerating || isGeneratingAll} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-black font-semibold rounded-xl transition-all flex items-center gap-2">
                    {category.isGenerating ? (<><span className="animate-spin">⏳</span> Generating...</>) : (<><span>🎙️</span> Generate</>)}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-gray-900/50 border border-gray-800 rounded-2xl">
          <h3 className="text-white font-bold mb-3">📋 How It Works</h3>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>• Each category searches for the <strong className="text-white">top 5 real news stories</strong> from verified sources</li>
            <li>• <strong className="text-white">Local News & Weather</strong> uses the test zip code above (or subscriber's zip in production)</li>
            <li>• Briefings are automatically <strong className="text-white">deleted when new ones are generated</strong></li>
            <li>• Episode numbers <strong className="text-white">reset to 1 on January 1st</strong> each year (3 episodes/day)</li>
            <li>• Uses <strong className="text-white">Fahrenheit, dollars, miles</strong> for US audience</li>
            <li>• Schedule times run for <strong className="text-white">all US time zones</strong> automatically</li>
          </ul>
        </div>

        <div className="mt-8 text-center text-gray-600 text-xs">
          News Briefings Admin v1.3.0 • Drive Time Tales
        </div>
      </div>
    </div>
  );
}
