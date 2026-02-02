// app/admin/news-briefings/page.tsx
// DTT News Briefings Admin - Version 2.6
// February 2026

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, { narratorName: string; voiceId: string }>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, { audioUrl: string; createdAt: string }>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [stateUpsellExists, setStateUpsellExists] = useState(false);
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  const [selectedState, setSelectedState] = useState('South Carolina');
  const [voices, setVoices] = useState<{ voice_id: string; name: string }[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voices
  useEffect(() => {
    fetch('/api/elevenlabs/voices')
      .then(r => r.json())
      .then(d => setVoices(d.voices || []))
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, []);

  // Load settings
  useEffect(() => {
    fetch('/api/admin/news-settings')
      .then(r => r.json())
      .then(data => {
        const loaded: Record<string, { narratorName: string; voiceId: string }> = {};
        for (const row of data.settings || []) {
          loaded[row.category] = { narratorName: row.narrator_name || '', voiceId: row.voice_id || '' };
        }
        for (const cat of CATEGORIES) {
          if (!loaded[cat.id]) loaded[cat.id] = { narratorName: '', voiceId: '' };
        }
        setSettings(loaded);
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  // Load episodes
  useEffect(() => {
    fetch('/api/news/briefing?listAll=true')
      .then(r => r.json())
      .then(data => {
        const loaded: Record<string, { audioUrl: string; createdAt: string }> = {};
        let upsellExists = false;
        for (const ep of data.episodes || []) {
          if (ep.category === 'state-upsell') { upsellExists = true; continue; }
          const key = ep.state ? `${ep.category}-${ep.state}` : ep.category;
          loaded[key] = { audioUrl: ep.audio_url, createdAt: ep.created_at };
        }
        setEpisodes(loaded);
        setStateUpsellExists(upsellExists);
      })
      .catch(() => {});
  }, []);

  // Save settings
  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    await fetch('/api/admin/news-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, narrator_name: narratorName, voice_id: voiceId })
    });
  }

  // Test voice
  async function handleTestVoice(voiceId: string, narratorName: string) {
    if (!voiceId) { alert('Please select a voice first'); return; }
    try {
      const r = await fetch('/api/elevenlabs/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: `Hello, I'm ${narratorName || 'your broadcaster'}. This is a voice test.` })
      });
      if (r.ok) {
        const blob = await r.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      } else {
        alert('Voice test failed');
      }
    } catch { alert('Voice test failed'); }
  }

  // Generate briefing
  async function handleGenerate(category: string, state?: string) {
    const s = settings[category];
    if (!s?.narratorName || !s?.voiceId) { alert('Set narrator and voice first'); return; }
    const key = state ? `${category}-${state}` : category;
    setGenerating(p => ({ ...p, [key]: true }));
    try {
      const r = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, state })
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setEpisodes(p => ({ ...p, [key]: { audioUrl: d.episode.audioUrl, createdAt: d.episode.createdAt } }));
        alert(`Generated! Duration: ${d.episode.duration || 'N/A'} min`);
      } else {
        alert(`Failed: ${d.error}`);
      }
    } catch { alert('Generation failed'); }
    finally { setGenerating(p => ({ ...p, [key]: false })); }
  }

  // Generate upsell
  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s?.narratorName || !s?.voiceId) { alert('Set State narrator and voice first'); return; }
    setGeneratingUpsell(true);
    try {
      const r = await fetch('/api/news/state-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narratorName: s.narratorName, voiceId: s.voiceId })
      });
      const d = await r.json();
      if (r.ok && d.audioUrl) {
        setStateUpsellExists(true);
        alert('State Upsell generated!');
      } else {
        alert(`Failed: ${d.error}`);
      }
    } catch { alert('Generation failed'); }
    finally { setGeneratingUpsell(false); }
  }

  // Play audio
  function handlePlay(key: string) {
    const ep = episodes[key];
    if (!ep?.audioUrl) return;
    if (audioRef.current) { audioRef.current.pause(); }
    if (playing === key) { setPlaying(null); return; }
    const audio = new Audio(ep.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play();
    setPlaying(key);
  }

  if (!settingsLoaded) {
    return <div style={{ padding: 40, background: '#fff', color: '#000', fontSize: 18 }}>Loading...</div>;
  }

  // Styles
  const cardStyle = { background: '#fff', border: '2px solid #000', borderRadius: 12, padding: 20, marginBottom: 20 };
  const labelStyle = { display: 'block', marginBottom: 6, fontSize: 16, fontWeight: 'bold' as const, color: '#000' };
  const inputStyle = { width: '100%', padding: 12, fontSize: 16, border: '2px solid #000', borderRadius: 6, marginBottom: 16, boxSizing: 'border-box' as const };
  const btnStyle = { padding: '12px 20px', fontSize: 16, fontWeight: 'bold' as const, border: '2px solid #000', borderRadius: 6, cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#000', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 8 }}>🎙️ News Briefings Admin</h1>
      <p style={{ marginBottom: 24, fontSize: 16 }}>Settings are saved when you click out of a field or change the voice.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const ep = episodes[cat.id];
          const stateEp = episodes[`state-${selectedState}`];
          const isGen = generating[cat.id] || generating[`state-${selectedState}`];

          return (
            <div key={cat.id} style={{ ...cardStyle, borderTop: `6px solid ${cat.color}` }}>
              <h2 style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 16 }}>{cat.icon} {cat.label}</h2>

              {/* Narrator */}
              <label style={labelStyle}>Narrator Name</label>
              <input
                type="text"
                value={s.narratorName}
                onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))}
                onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)}
                placeholder="e.g., Sarah Mitchell"
                style={inputStyle}
              />

              {/* Voice */}
              <label style={labelStyle}>Voice</label>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <select
                  value={s.voiceId}
                  onChange={e => {
                    const v = e.target.value;
                    setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: v } }));
                    saveSettings(cat.id, s.narratorName, v);
                  }}
                  style={{ flex: 1, padding: 12, fontSize: 16, border: '2px solid #000', borderRadius: 6 }}
                >
                  <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button
                  onClick={() => handleTestVoice(s.voiceId, s.narratorName)}
                  disabled={!s.voiceId}
                  style={{ ...btnStyle, background: s.voiceId ? '#3b82f6' : '#ccc', color: '#fff' }}
                >
                  🔊 Test
                </button>
              </div>

              {/* Edit Prompt */}
              <button
                onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)}
                style={{ ...btnStyle, width: '100%', background: '#fff', marginBottom: 16 }}
              >
                📝 Edit Prompt
              </button>

              {/* State-specific */}
              {cat.id === 'state' ? (
                <>
                  <label style={labelStyle}>Select State</label>
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 16 }}
                  >
                    {US_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <button
                      onClick={() => handleGenerate('state', selectedState)}
                      disabled={isGen || !s.narratorName || !s.voiceId}
                      style={{ ...btnStyle, flex: 1, background: isGen ? '#ccc' : cat.color, color: '#fff' }}
                    >
                      {isGen ? '⏳ Generating...' : `🎬 Generate ${selectedState}`}
                    </button>
                    <button
                      onClick={() => handlePlay(`state-${selectedState}`)}
                      disabled={!stateEp?.audioUrl}
                      style={{ ...btnStyle, flex: 1, background: stateEp?.audioUrl ? '#10b981' : '#ccc', color: '#fff' }}
                    >
                      {playing === `state-${selectedState}` ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  <div style={{ background: '#fffbeb', border: '2px solid #000', borderRadius: 8, padding: 12 }}>
                    <p style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
                      Welcome Page Upsell (for non-subscribers)
                    </p>
                    <button
                      onClick={handleGenerateUpsell}
                      disabled={generatingUpsell || !s.narratorName || !s.voiceId}
                      style={{ ...btnStyle, width: '100%', background: stateUpsellExists ? '#10b981' : '#dc2626', color: '#fff' }}
                    >
                      {generatingUpsell ? '⏳ Generating...' : stateUpsellExists ? '✅ Upsell Ready' : '⚠️ Generate Upsell'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <button
                      onClick={() => handleGenerate(cat.id)}
                      disabled={isGen || !s.narratorName || !s.voiceId}
                      style={{ ...btnStyle, flex: 1, background: isGen ? '#ccc' : cat.color, color: cat.id === 'world' ? '#000' : '#fff' }}
                    >
                      {isGen ? '⏳ Generating...' : '🎬 Generate'}
                    </button>
                    <button
                      onClick={() => handlePlay(cat.id)}
                      disabled={!ep?.audioUrl}
                      style={{ ...btnStyle, flex: 1, background: ep?.audioUrl ? '#10b981' : '#ccc', color: '#fff' }}
                    >
                      {playing === cat.id ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>
                  {ep && (
                    <p style={{ fontSize: 14, fontWeight: 'bold', background: '#f5f5f5', padding: 10, borderRadius: 6 }}>
                      Last: {new Date(ep.createdAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
