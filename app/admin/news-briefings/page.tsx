'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: { accent?: string; gender?: string };
}

interface Category {
  id: string;
  label: string;
  voiceId: string;
  narratorName: string;
  lastGenerated: string | null;
  episodeNumber: number;
  audioUrl: string | null;
  isGenerating: boolean;
  narratorLocked: boolean;
}

interface ScheduleSlot {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INITIAL_CATEGORIES: Category[] = [
  { id: 'local', label: 'Local News & Weather', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
  { id: 'national', label: 'National News', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
  { id: 'international', label: 'International News', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
  { id: 'business', label: 'Business & Finance', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
  { id: 'sports', label: 'Sports', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
  { id: 'science', label: 'Science & Technology', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false, narratorLocked: false },
];

const INITIAL_SCHEDULE: ScheduleSlot[] = [
  { id: 'morning', label: 'Morning', time: '06:00', enabled: true },
  { id: 'noon', label: 'Noon', time: '12:00', enabled: true },
  { id: 'evening', label: 'Evening', time: '18:00', enabled: true },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function NewsBriefingsPage() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [testZipCode, setTestZipCode] = useState('');
  const [testCity, setTestCity] = useState('');
  const [testSubscriberName, setTestSubscriberName] = useState('Marc');
  const [automate, setAutomate] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>(INITIAL_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load data on mount
  useEffect(() => {
    loadVoices();
    loadSettings();
  }, []);

  // Auto-dismiss messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function loadVoices() {
    try {
      const res = await fetch('/api/admin/elevenlabs-voices');
      if (res.ok) {
        const data = await res.json();
        if (data.voices?.length > 0) setVoices(data.voices);
      }
    } catch (e) {
      console.error('Failed to load voices:', e);
    }
  }

  async function loadSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('news_settings').select('*').eq('user_id', user.id).single();
      if (data?.settings) {
        setCategories(data.settings.categories || INITIAL_CATEGORIES);
        setTestZipCode(data.settings.testZipCode || '');
        setTestCity(data.settings.testCity || '');
        setTestSubscriberName(data.settings.testSubscriberName || 'Marc');
        setAutomate(data.settings.automate || false);
        setSchedule(data.settings.schedule || INITIAL_SCHEDULE);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('news_settings').upsert({
        user_id: user.id,
        settings: { categories, testZipCode, testCity, testSubscriberName, automate, schedule },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      setMessage({ type: 'success', text: 'Settings saved!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function generateBriefing(categoryId: string) {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, isGenerating: true } : c));
    try {
      const cat = categories.find(c => c.id === categoryId);
      if (!cat) throw new Error('Category not found');
      const res = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          voiceId: cat.voiceId,
          narratorName: cat.narratorName,
          zipCode: categoryId === 'local' ? testZipCode : undefined,
          testCity: categoryId === 'local' ? testCity : undefined,
          subscriberName: testSubscriberName,
          personalizeIntros: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCategories(prev => prev.map(c => c.id === categoryId ? {
          ...c,
          isGenerating: false,
          lastGenerated: new Date().toISOString(),
          episodeNumber: data.episodeNumber || c.episodeNumber + 1,
          audioUrl: data.audioUrl,
        } : c));
        setMessage({ type: 'success', text: `${cat.label} generated!` });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Failed: ${e}` });
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, isGenerating: false } : c));
    }
  }

  // ============================================================================
  // AUDIO FUNCTIONS
  // ============================================================================

  function previewVoice(voice: Voice) {
    if (previewingVoice === voice.voice_id) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voice.voice_id);
    setPlayingAudio(null);
    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      audio.play();
    }
  }

  function togglePlayBriefing(categoryId: string, audioUrl: string | null) {
    if (!audioUrl) return;
    
    // If already playing this one, stop it
    if (playingAudio === categoryId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingAudio(null);
      return;
    }
    
    // Stop any current audio
    if (audioRef.current) { audioRef.current.pause(); }
    setPreviewingVoice(null);
    
    // Play new audio
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudio(null);
    audio.play();
    setPlayingAudio(categoryId);
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  function updateCategory(id: string, updates: Partial<Category>) {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  function updateSchedule(id: string, updates: Partial<ScheduleSlot>) {
    setSchedule(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function formatTime(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-white text-xl">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">News Briefing Dashboard</h1>
          <button onClick={saveSettings} disabled={saving} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-black font-semibold rounded-lg">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {message.text}
          </div>
        )}

        {/* Category Grid - 2 wide x 3 deep */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {categories.map(cat => (
            <div key={cat.id} className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              {/* a. Category Label */}
              <h2 className="text-lg font-bold text-white mb-1">{cat.label}</h2>
              
              {/* b. Last Updated */}
              <p className="text-sm text-slate-400 mb-4">Last Updated: {formatTime(cat.lastGenerated)}</p>

              {/* Zip Code - Only for Local News */}
              {cat.id === 'local' && (
                <div className="mb-4">
                  <label className="block text-sm text-slate-400 mb-1">Test Zip Code (50mi radius)</label>
                  <input
                    type="text"
                    value={testZipCode}
                    onChange={e => setTestZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="e.g. 28801"
                    maxLength={5}
                    className="w-32 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white mb-3"
                  />
                  <label className="block text-sm text-slate-400 mb-1">Test City, State</label>
                  <input
                    type="text"
                    value={testCity}
                    onChange={e => setTestCity(e.target.value)}
                    placeholder="e.g. Asheville, NC"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              )}

              {/* c. Narrator's Name */}
              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-1">Narrator's Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cat.narratorName}
                    onChange={e => updateCategory(cat.id, { narratorName: e.target.value })}
                    placeholder="How narrator introduces themselves"
                    disabled={cat.narratorLocked}
                    className={"flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white " + (cat.narratorLocked ? "opacity-60 cursor-not-allowed" : "")}
                  />
                  <button
                    onClick={() => updateCategory(cat.id, { narratorLocked: !cat.narratorLocked })}
                    className={"px-3 py-2 rounded-lg " + (cat.narratorLocked ? "bg-orange-500 text-black" : "bg-slate-700 text-white hover:bg-slate-600")}
                    title={cat.narratorLocked ? "Unlock narrator settings" : "Lock narrator settings"}
                  >
                    {cat.narratorLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              {/* d. Narrator's Voice + Preview */}
              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-1">Narrator's Voice</label>
                <div className="flex gap-2">
                  <select
                    value={cat.voiceId}
                    onChange={e => updateCategory(cat.id, { voiceId: e.target.value })}
                    disabled={cat.narratorLocked}
                    className={"flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white max-h-40 overflow-y-auto " + (cat.narratorLocked ? "opacity-60 cursor-not-allowed" : "")}
                  >
                    <option value="">Select voice...</option>
                    {voices.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>{v.name} {v.labels?.accent ? `(${v.labels.accent})` : ''}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const voice = voices.find(v => v.voice_id === cat.voiceId);
                      if (voice) previewVoice(voice);
                    }}
                    disabled={!cat.voiceId}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-sm"
                  >
                    {previewingVoice === cat.voiceId ? '⏹ Stop' : '▶ Preview'}
                  </button>
                  <label className="block text-sm text-slate-400 mb-1">Test City, State</label>
                  <input
                    type="text"
                    value={testCity}
                    onChange={e => setTestCity(e.target.value)}
                    placeholder="e.g. Asheville, NC"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Episode Number */}
              {cat.episodeNumber > 0 && (
                <p className="text-xs text-slate-500 mb-3">Episode #{cat.episodeNumber}</p>
              )}

              {/* e. Generate Button & f. Listen Button */}
              <div className="flex gap-3 pt-3 border-t border-slate-700">
                <button
                  onClick={() => generateBriefing(cat.id)}
                  disabled={cat.isGenerating || !cat.voiceId}
                  className={`flex-1 px-4 py-2 font-semibold rounded-lg ${cat.isGenerating ? "bg-orange-400 animate-pulse text-black" : "bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-black"}`}
                >
                  {cat.isGenerating ? 'Generating...' : 'Generate'}
                </button>
                <button
                  onClick={() => togglePlayBriefing(cat.id, cat.audioUrl)}
                  disabled={!cat.audioUrl}
                  className={`flex-1 px-4 py-2 font-semibold rounded-lg ${
                    playingAudio === cat.id 
                      ? 'bg-red-600 hover:bg-red-500 text-white' 
                      : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white'
                  }`}
                >
                  {playingAudio === cat.id ? '⏹ Stop' : '🔊 Listen'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Section - Automation */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Automation</h2>
              <p className="text-sm text-slate-400">Auto-generate briefings at scheduled times (all US time zones)</p>
            </div>
            <button
              onClick={() => setAutomate(!automate)}
              className={`relative w-14 h-7 rounded-full transition-colors ${automate ? 'bg-orange-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${automate ? 'left-8' : 'left-1'}`} />
            </button>
          </div>

          {/* Time Slots */}
          <div className="grid grid-cols-3 gap-4">
            {schedule.map(slot => (
              <div key={slot.id} className={`p-4 rounded-lg border ${slot.enabled ? 'bg-slate-800 border-orange-500/50' : 'bg-slate-800/50 border-slate-700 opacity-60'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{slot.label}</span>
                  <button
                    onClick={() => updateSchedule(slot.id, { enabled: !slot.enabled })}
                    className={`w-10 h-5 rounded-full transition-colors ${slot.enabled ? 'bg-orange-500' : 'bg-slate-600'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-all ${slot.enabled ? 'ml-5' : 'ml-0.5'}`} />
                  </button>
                  <label className="block text-sm text-slate-400 mb-1">Test City, State</label>
                  <input
                    type="text"
                    value={testCity}
                    onChange={e => setTestCity(e.target.value)}
                    placeholder="e.g. Asheville, NC"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateSchedule(slot.id, { time: e.target.value })}
                  disabled={!slot.enabled}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-center disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-slate-600 text-xs">
          News Briefings Admin v2.0 • Drive Time Tales
        </div>
      </div>
    </div>
  );
}
