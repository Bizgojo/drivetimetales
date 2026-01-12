'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: {
    accent?: string;
    gender?: string;
    age?: string;
    description?: string;
  };
}

interface CategorySettings {
  enabled: boolean;
  voice_id: string;
  voice_name: string;
  narrator_name: string;
  schedule: string[];
  last_generated?: string;
  episode_number: number;
}

interface NewsSettings {
  id?: string;
  user_id?: string;
  categories: {
    local: CategorySettings;
    national: CategorySettings;
    international: CategorySettings;
    business: CategorySettings;
    sports: CategorySettings;
    science: CategorySettings;
  };
  test_zip_code: string;
  personalization_enabled: boolean;
  automation_enabled: boolean;
  updated_at?: string;
}

const DEFAULT_SETTINGS: NewsSettings = {
  categories: {
    local: { enabled: true, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
    national: { enabled: true, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
    international: { enabled: false, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
    business: { enabled: true, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
    sports: { enabled: false, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
    science: { enabled: false, voice_id: '', voice_name: '', narrator_name: '', schedule: ['06:00', '12:00', '18:00'], episode_number: 1 },
  },
  test_zip_code: '',
  personalization_enabled: true,
  automation_enabled: false,
};

const CATEGORY_INFO = {
  local: { label: 'Local News & Weather', description: 'Hyperlocal coverage based on zip code' },
  national: { label: 'National News', description: 'US headlines and major stories' },
  international: { label: 'International', description: 'Global news and world events' },
  business: { label: 'Business & Finance', description: 'Markets, economy, and business news' },
  sports: { label: 'Sports', description: 'Scores, highlights, and sports news' },
  science: { label: 'Science & Technology', description: 'Tech news and scientific discoveries' },
};

export default function NewsBriefingsPage() {
  const [settings, setSettings] = useState<NewsSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [voiceSearch, setVoiceSearch] = useState<{ [key: string]: string }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadSettings();
    loadVoices();
    return () => { if (audioRef.current) audioRef.current.pause(); };
  }, []);

  const loadSettings = async () => {
    try {
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('news_settings').select('*').eq('user_id', user.id).single();
      if (data && !error) setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVoices = async () => {
    try {
      const response = await fetch('/api/admin/elevenlabs-voices');
      if (response.ok) {
        const data = await response.json();
        setVoices(data.voices || []);
      }
    } catch (error) {
      console.error('Error loading voices:', error);
    } finally {
      setVoicesLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('news_settings').upsert({ ...settings, user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const generateNow = async (category: string) => {
    setGenerating(category);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, test_zip_code: settings.test_zip_code, settings: settings.categories[category as keyof typeof settings.categories] }),
      });
      if (!response.ok) throw new Error('Generation failed');
      setMessage({ type: 'success', text: `Generated ${CATEGORY_INFO[category as keyof typeof CATEGORY_INFO].label} briefing!` });
      setSettings(prev => ({
        ...prev,
        categories: { ...prev.categories, [category]: { ...prev.categories[category as keyof typeof prev.categories], episode_number: prev.categories[category as keyof typeof prev.categories].episode_number + 1, last_generated: new Date().toISOString() } }
      }));
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to generate briefing' });
    } finally {
      setGenerating(null);
    }
  };

  const playVoicePreview = (voice: Voice) => {
    if (playingPreview === voice.voice_id) { audioRef.current?.pause(); setPlayingPreview(null); return; }
    if (audioRef.current) audioRef.current.pause();
    if (voice.preview_url) {
      audioRef.current = new Audio(voice.preview_url);
      audioRef.current.play();
      setPlayingPreview(voice.voice_id);
      audioRef.current.onended = () => setPlayingPreview(null);
    }
  };

  const updateCategory = (category: string, updates: Partial<CategorySettings>) => {
    setSettings(prev => ({ ...prev, categories: { ...prev.categories, [category]: { ...prev.categories[category as keyof typeof prev.categories], ...updates } } }));
  };

  const selectVoice = (category: string, voice: Voice) => {
    updateCategory(category, { voice_id: voice.voice_id, voice_name: voice.name, narrator_name: settings.categories[category as keyof typeof settings.categories].narrator_name || voice.name });
  };

  const getFilteredVoices = (category: string) => {
    const search = voiceSearch[category]?.toLowerCase() || '';
    if (!search) return voices;
    return voices.filter(v => v.name.toLowerCase().includes(search) || v.labels?.accent?.toLowerCase().includes(search) || v.labels?.gender?.toLowerCase().includes(search));
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">News Briefings</h1><p className="text-slate-400 text-sm">Configure automated news audio generation</p></div>
          <button onClick={saveSettings} disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white rounded-lg font-medium">{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
        {message && <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{message.text}</div>}
        <div className="bg-slate-900 rounded-xl p-4 mb-6 border border-slate-800">
          <h2 className="text-lg font-semibold text-white mb-3">Global Settings</h2>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={settings.personalization_enabled} onChange={(e) => setSettings(prev => ({ ...prev, personalization_enabled: e.target.checked }))} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-orange-500" /><span className="text-white">Personalization</span></label>
            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={settings.automation_enabled} onChange={(e) => setSettings(prev => ({ ...prev, automation_enabled: e.target.checked }))} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-orange-500" /><span className="text-white">Auto-Generate</span></label>
          </div>
        </div>
        <div className="space-y-4">
          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const cat = settings.categories[key as keyof typeof settings.categories];
            const filteredVoices = getFilteredVoices(key);
            const isLocal = key === 'local';
            return (
              <div key={key} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={cat.enabled} onChange={(e) => updateCategory(key, { enabled: e.target.checked })} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-orange-500" />
                    <div><h3 className="text-white font-medium">{info.label}</h3><p className="text-xs text-slate-500">{info.description}</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">Ep #{cat.episode_number}</span>
                    <button onClick={() => generateNow(key)} disabled={!cat.enabled || !cat.voice_id || generating === key} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-lg flex items-center gap-2">
                      {generating === key ? 'Generating...' : 'Listen'}
                    </button>
                  </div>
                </div>
                {cat.enabled && (
                  <div className="p-4">
                    {isLocal && (
                      <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <label className="block text-sm text-slate-400 mb-2">Test Zip Code (Local News Only)</label>
                        <input type="text" value={settings.test_zip_code} onChange={(e) => setSettings(prev => ({ ...prev, test_zip_code: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="Enter 5-digit zip code" maxLength={5} className="w-48 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500" />
                        <p className="text-xs text-slate-500 mt-1">Used for testing local news searches</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-2"><label className="text-sm text-slate-400">Narrator Voice</label><input type="text" placeholder="Search..." value={voiceSearch[key] || ''} onChange={(e) => setVoiceSearch(prev => ({ ...prev, [key]: e.target.value }))} className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white w-24" /></div>
                        <div className="h-40 overflow-y-auto bg-slate-800/50 rounded-lg border border-slate-700">
                          {voicesLoading ? <div className="flex items-center justify-center h-full text-slate-500">Loading...</div> : filteredVoices.map((voice) => (
                            <div key={voice.voice_id} onClick={() => selectVoice(key, voice)} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/50 ${cat.voice_id === voice.voice_id ? 'bg-orange-500/20 border-l-2 border-orange-500' : ''}`}>
                              <div><div className="text-white text-sm">{voice.name}</div><div className="text-xs text-slate-500">{[voice.labels?.gender, voice.labels?.accent].filter(Boolean).join(' • ')}</div></div>
                              <button onClick={(e) => { e.stopPropagation(); playVoicePreview(voice); }} className="p-1.5 rounded-full hover:bg-slate-600">{playingPreview === voice.voice_id ? <span className="text-orange-500">■</span> : <span className="text-slate-400">▶</span>}</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div><label className="block text-sm text-slate-400 mb-1">Narrator Name</label><input type="text" value={cat.narrator_name} onChange={(e) => updateCategory(key, { narrator_name: e.target.value })} placeholder="How narrator introduces themselves" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" /></div>
                        <div><label className="block text-sm text-slate-400 mb-1">Schedule</label><div className="flex gap-2">{['06:00', '12:00', '18:00'].map((time) => (<label key={time} className="flex items-center gap-1.5"><input type="checkbox" checked={cat.schedule.includes(time)} onChange={(e) => updateCategory(key, { schedule: e.target.checked ? [...cat.schedule, time].sort() : cat.schedule.filter(t => t !== time) })} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-orange-500" /><span className="text-white text-sm">{time === '06:00' ? '6 AM' : time === '12:00' ? '12 PM' : '6 PM'}</span></label>))}</div></div>
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
