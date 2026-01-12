'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

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
    local: { enabled:
cat > ~/Projects/drivetimetales/app/admin/news-briefings/page.tsx << 'ENDOFFILE'
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

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
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      const supabase = createClient();
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
      const supabase = createClient();
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
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">News Briefings</h1><p className="text-slate-400 text-sm">Configure automated news audio generation</p></div>
          <button onClick={saveSettings} disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white rounded-lg font-medium transition-colors">{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
        {message && <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{message.text}</div>}
        <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-800">
          <h2 className="text-lg font-semibold text-white mb-3">Global Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm text-slate-400 mb-1">Test Zip Code</label><input type="text" value={settings.test_zip_code} onChange={(e) => setSettings(prev => ({ ...prev, test_zip_code: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="e.g., 90210" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500" maxLength={5} /><p className="text-xs text-slate-500 mt-1">For testing local news</p></div>
            <div className="flex items-center gap-3"><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={settings.personalization_enabled} onChange={(e) => setSettings(prev => ({ ...prev, personalization_enabled: e.target.checked }))} className="sr-only peer" /><div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div></label><div><span className="text-white text-sm">Personalization</span><p className="text-xs text-slate-500">Use listener preferences</p></div></div>
            <div className="flex items-center gap-3"><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={settings.automation_enabled} onChange={(e) => setSettings(prev => ({ ...prev, automation_enabled: e.target.checked }))} className="sr-only peer" /><div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div></label><div><span className="text-white text-sm">Auto-Generate</span><p className="text-xs text-slate-500">Run on schedule</p></div></div>
          </div>
        </div>
        <div className="space-y-3">
          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const cat = settings.categories[key as keyof typeof settings.categories];
            const filteredVoices = getFilteredVoices(key);
            return (
              <div key={key} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={cat.enabled} onChange={(e) => updateCategory(key, { enabled: e.target.checked })} className="sr-only peer" /><div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div></label>
                    <div><h3 className="text-white font-medium">{info.label}</h3><p className="text-xs text-slate-500">{info.description}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Ep #{cat.episode_number}</span>
                    <button onClick={() => generateNow(key)} disabled={!cat.enabled || !cat.voice_id || generating === key} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-lg transition-colors flex items-center gap-1">
                      {generating === key ? (<><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><span>Generating...</span></>) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>Listen</span></>)}
                    </button>
                  </div>
                </div>
                {cat.enabled && (
                  <div className="p-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2"><label className="text-sm text-slate-400">Narrator Voice</label><input type="text" placeholder="Search voices..." value={voiceSearch[key] || ''} onChange={(e) => setVoiceSearch(prev => ({ ...prev, [key]: e.target.value }))} className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 w-32" /></div>
                        <div className="h-[150px] overflow-y-auto bg-slate-800/50 rounded-lg border border-slate-700">
                          {voicesLoading ? <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading voices...</div> : filteredVoices.length === 0 ? <div className="flex items-center justify-center h-full text-slate-500 text-sm">No voices found</div> : filteredVoices.map((voice) => (
                            <div key={voice.voice_id} onClick={() => selectVoice(key, voice)} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/50 transition-colors ${cat.voice_id === voice.voice_id ? 'bg-orange-500/20 border-l-2 border-orange-500' : ''}`}>
                              <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{voice.name}</div><div className="text-xs text-slate-500 truncate">{[voice.labels?.gender, voice.labels?.accent, voice.labels?.age].filter(Boolean).join(' * ')}</div></div>
                              <button onClick={(e) => { e.stopPropagation(); playVoicePreview(voice); }} className="ml-2 p-1.5 rounded-full hover:bg-slate-600 transition-colors flex-shrink-0" title={playingPreview === voice.voice_id ? 'Stop' : 'Preview'}>{playingPreview === voice.voice_id ? <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg> : <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div><label className="block text-sm text-slate-400 mb-1">Narrator Name</label><input type="text" value={cat.narrator_name} onChange={(e) => updateCategory(key, { narrator_name: e.target.value })} placeholder="How narrator introduces themselves" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm" /><p className="text-xs text-slate-500 mt-1">e.g., "I'm Sarah, your news briefer"</p></div>
                        <div><label className="block text-sm text-slate-400 mb-1">Schedule (24h)</label><div className="flex flex-wrap gap-2">{['06:00', '12:00', '18:00'].map((time) => (<label key={time} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={cat.schedule.includes(time)} onChange={(e) => { const newSchedule = e.target.checked ? [...cat.schedule, time].sort() : cat.schedule.filter(t => t !== time); updateCategory(key, { schedule: newSchedule }); }} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500" /><span className="text-white text-sm">{time === '06:00' ? '6 AM' : time === '12:00' ? '12 PM' : '6 PM'}</span></label>))}</div></div>
                        {cat.last_generated && <p className="text-xs text-slate-500">Last generated: {new Date(cat.last_generated).toLocaleString()}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-800"><p className="text-xs text-slate-500 text-center">News briefings use US measurements (Fahrenheit, dollars, miles). Episodes auto-increment on generation.</p></div>
      </div>
    </div>
  );
}
