'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
}

const INITIAL_CATEGORIES: Category[] = [
  { id: 'local', label: 'Local News & Weather', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
  { id: 'national', label: 'National News', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
  { id: 'international', label: 'International News', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
  { id: 'business', label: 'Business & Finance', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
  { id: 'sports', label: 'Sports', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
  { id: 'science', label: 'Science & Technology', voiceId: '', narratorName: '', lastGenerated: null, episodeNumber: 0, audioUrl: null, isGenerating: false },
];

export default function NewsBriefingsPage() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [testZipCode, setTestZipCode] = useState('');
  const [automate, setAutomate] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadVoices();
    loadSettings();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
        setAutomate(data.settings.automate || false);
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
        settings: { categories, testZipCode, automate },
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

  async function generateAll() {
    setIsGeneratingAll(true);
    for (const cat of categories) {
      await generateBriefing(cat.id);
    }
    setIsGeneratingAll(false);
  }

  function previewVoice(voice: Voice) {
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
    }
  }

  function playBriefing(audioUrl: string | null) {
    if (!audioUrl) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();
  }

  function updateCategory(id: string, updates: Partial<Category>) {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  function formatTime(iso: string | null): string {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-white">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-5 mb-6">
          <h1 className="text-2xl font-bold text-white">News Briefing Dashboard</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-white">
              <span>Automate (6am, Noon, 6pm):</span>
              <input type="checkbox" checked={automate} onChange={e => setAutomate(e.target.checked)} className="w-5 h-5 rounded" />
            </label>
            <button onClick={generateAll} disabled={isGeneratingAll} className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white font-semibold rounded-lg">
              {isGeneratingAll ? 'Generating...' : '[Generate All]'}
            </button>
            <button onClick={saveSettings} disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black font-semibold rounded-lg">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* Category Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <div key={cat.id} className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-bold text-white">{cat.label}</h2>
                <span className="text-xs text-slate-400">Last: {formatTime(cat.lastGenerated)}</span>
              </div>

              {/* Zip Code - Only for Local */}
              {cat.id === 'local' && (
                <div>
                  <label className="text-sm text-slate-400">Test Zip Code (50mi radius):</label>
                  <input
                    type="text"
                    value={testZipCode}
                    onChange={e => setTestZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="e.g. 28801"
                    maxLength={5}
                    className="mt-1 w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              )}

              {/* Voice Selection */}
              <div>
                <label className="text-sm text-slate-400">Narrator Voice:</label>
                <div className="flex gap-2 mt-1">
                  <select
                    value={cat.voiceId}
                    onChange={e => {
                      const voice = voices.find(v => v.voice_id === e.target.value);
                      updateCategory(cat.id, { voiceId: e.target.value, narratorName: voice?.name || '' });
                    }}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="">Select voice...</option>
                    {voices.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const voice = voices.find(v => v.voice_id === cat.voiceId);
                      if (voice) previewVoice(voice);
                    }}
                    disabled={!cat.voiceId}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg"
                  >
                    {previewingVoice === cat.voiceId ? '⏹' : '▶'} Preview
                  </button>
                </div>
              </div>

              {/* Episode Info */}
              {cat.episodeNumber > 0 && (
                <p className="text-xs text-slate-500">Episode #{cat.episodeNumber}</p>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between mt-auto pt-3 border-t border-slate-700">
                <button
                  onClick={() => generateBriefing(cat.id)}
                  disabled={cat.isGenerating || isGeneratingAll || !cat.voiceId}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-black font-semibold rounded-lg"
                >
                  {cat.isGenerating ? '⏳ Generating...' : 'Generate'}
                </button>
                <button
                  onClick={() => playBriefing(cat.audioUrl)}
                  disabled={!cat.audioUrl}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg"
                >
                  🔊 Listen
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
