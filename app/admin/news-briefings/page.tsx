'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
];

interface Voice { voice_id: string; name: string; }
interface Settings { narratorName: string; voiceId: string; }
interface Episode { audioUrl: string; createdAt: string; duration?: string; }

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, Episode>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [subscriberStates, setSubscriberStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [stateUpsell, setStateUpsell] = useState<{ exists: boolean; audioUrl?: string }>({ exists: false });
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  const [playingUpsell, setPlayingUpsell] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voices
  useEffect(() => {
    fetch('/api/elevenlabs/voices')
      .then(r => r.ok ? r.json() : { voices: [] })
      .then(d => setVoices(d.voices || []))
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));
  }, []);

  // Load settings
  useEffect(() => {
    fetch('/api/admin/news-settings')
      .then(r => r.ok ? r.json() : { settings: [] })
      .then(data => {
        const loaded: Record<string, Settings> = {};
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

  // Load subscriber states
  useEffect(() => {
    fetch('/api/admin/subscriber-states')
      .then(r => r.ok ? r.json() : { states: [] })
      .then(data => {
        if (data.states && data.states.length > 0) {
          setSubscriberStates(data.states);
          setSelectedState(data.states[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Load upsell status
  useEffect(() => {
    fetch('/api/news/state-upsell')
      .then(r => r.ok ? r.json() : { exists: false })
      .then(data => {
        if (data.exists && data.audioUrl) {
          setStateUpsell({ exists: true, audioUrl: data.audioUrl });
        }
      })
      .catch(() => {});
  }, []);

  // Save settings
  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    try {
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, narrator_name: narratorName, voice_id: voiceId })
      });
    } catch (e) {
      console.error('Save failed:', e);
    }
  }

  // Test voice
  async function handleTestVoice(voiceId: string, narratorName: string) {
    if (!voiceId) { alert('Please select a voice first'); return; }
    try {
      const r = await fetch('/api/elevenlabs/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: `Hello, I am ${narratorName || 'your narrator'}. This is a voice test for Drive Time Tales.` })
      });
      if (r.ok) {
        const blob = await r.blob();
        new Audio(URL.createObjectURL(blob)).play();
      } else {
        alert('Voice test failed');
      }
    } catch (error) {
      console.error('Test voice error:', error);
      alert('Voice test failed');
    }
  }

  // Generate news
  async function handleGenerate(category: string, state?: string) {
    const s = settings[category];
    if (!s || !s.narratorName || !s.voiceId) {
      alert('Please set narrator name and voice first.');
      return;
    }
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
        setEpisodes(p => ({ ...p, [key]: { audioUrl: d.episode.audioUrl, createdAt: d.episode.createdAt, duration: d.episode.duration } }));
        alert(`Generated! Duration: ${d.episode.duration || 'N/A'} min`);
      } else {
        alert(`Failed: ${d.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Generation failed.');
    } finally {
      setGenerating(p => ({ ...p, [key]: false }));
    }
  }

  // Generate upsell
  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s || !s.narratorName || !s.voiceId) {
      alert('Please set State News narrator and voice first.');
      return;
    }
    setGeneratingUpsell(true);
    try {
      const r = await fetch('/api/news/state-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narratorName: s.narratorName, voiceId: s.voiceId })
      });
      const d = await r.json();
      if (r.ok && d.audioUrl) {
        setStateUpsell({ exists: true, audioUrl: d.audioUrl });
        alert('State Upsell generated!');
      } else {
        alert(`Failed: ${d.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upsell error:', error);
      alert('Generation failed.');
    } finally {
      setGeneratingUpsell(false);
    }
  }

  // Play audio
  function handlePlay(key: string, url?: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playing === key) { setPlaying(null); setPlayingUpsell(false); return; }
    const audioUrl = url || episodes[key]?.audioUrl;
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => { setPlaying(null); setPlayingUpsell(false); };
    audio.play();
    setPlaying(key);
  }

  // Format time
  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (!settingsLoaded) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>Loading settings...</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' };
  const selectStyle: React.CSSProperties = { padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000' };
  const btnStyle: React.CSSProperties = { padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <Link href="/admin" style={{ display: 'inline-block', marginBottom: '16px', color: '#3b82f6', fontSize: '16px', textDecoration: 'none' }}>← Back to Admin</Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px', color: '#000000' }}>🎙️ News Briefings Admin</h1>
      <p style={{ marginBottom: '24px', fontSize: '16px', color: '#000000' }}>Configure narrators, voices, and prompts. Settings save automatically.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const episodeKey = cat.id === 'state' ? `state-${selectedState}` : cat.id;
          const ep = episodes[episodeKey];
          const isGenerating = generating[episodeKey];
          const isPlaying = playing === episodeKey;

          return (
            <div key={cat.id} style={{ backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', borderTop: `6px solid ${cat.color}` }}>
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>{cat.icon} {cat.label}</h2>

              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Narrator Name</label>
              <input
                type="text"
                value={s.narratorName}
                onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))}
                onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)}
                placeholder="e.g., Sarah Mitchell"
                style={{ ...inputStyle, marginBottom: '16px' }}
              />

              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Voice</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select
                  value={s.voiceId}
                  onChange={e => { const v = e.target.value; setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: v } })); saveSettings(cat.id, s.narratorName, v); }}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button onClick={() => handleTestVoice(s.voiceId, s.narratorName)} disabled={!s.voiceId} style={{ ...btnStyle, backgroundColor: s.voiceId ? '#3b82f6' : '#cccccc', color: '#ffffff' }}>🔊 Test</button>
              </div>

              <button onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)} style={{ ...btnStyle, width: '100%', backgroundColor: '#ffffff', marginBottom: '16px' }}>📝 Edit Prompt</button>

              {cat.id === 'state' ? (
                <>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Select State (Subscribers Only)</label>
                  <select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ ...selectStyle, width: '100%', marginBottom: '16px' }}>
                    {subscriberStates.length === 0 ? <option value="">No subscriber states yet</option> : subscriberStates.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate('state', selectedState)} disabled={isGenerating || !s.narratorName || !s.voiceId || !selectedState} style={{ ...btnStyle, flex: 1, backgroundColor: (isGenerating || !s.narratorName || !s.voiceId || !selectedState) ? '#cccccc' : cat.color, color: '#ffffff' }}>{isGenerating ? '⏳ Generating...' : `🎬 Generate ${selectedState || 'State'}`}</button>
                    <button onClick={() => handlePlay(episodeKey)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff' }}>{isPlaying ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>

                  {ep && <div style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', marginBottom: '16px', color: '#000000' }}>{selectedState}: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}</div>}

                  <div style={{ backgroundColor: '#fffbeb', border: '2px solid #000000', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#000000' }}>Welcome Page Upsell (uses State News voice)</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={handleGenerateUpsell} disabled={generatingUpsell || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: (generatingUpsell || !s.narratorName || !s.voiceId) ? '#cccccc' : (stateUpsell.exists ? '#10b981' : '#dc2626'), color: '#ffffff' }}>{generatingUpsell ? '⏳...' : stateUpsell.exists ? '✅ Regenerate' : '⚠️ Generate Upsell'}</button>
                      <button onClick={() => { if (playingUpsell) { if (audioRef.current) audioRef.current.pause(); setPlayingUpsell(false); setPlaying(null); } else if (stateUpsell.audioUrl) { handlePlay('upsell', stateUpsell.audioUrl); setPlayingUpsell(true); } }} disabled={!stateUpsell.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: stateUpsell.audioUrl ? (playingUpsell ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff' }}>{playingUpsell ? '⏹️ Stop' : '▶️ Play Upsell'}</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate(cat.id)} disabled={isGenerating || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: (isGenerating || !s.narratorName || !s.voiceId) ? '#cccccc' : cat.color, color: cat.id === 'world' ? '#000000' : '#ffffff' }}>{isGenerating ? '⏳ Generating...' : '🎬 Generate'}</button>
                    <button onClick={() => handlePlay(cat.id)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff' }}>{isPlaying ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>
                  {ep && <div style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', color: '#000000' }}>Last: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
