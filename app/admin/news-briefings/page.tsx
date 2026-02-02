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

  useEffect(() => {
    fetch('/api/elevenlabs/voices').then(r => r.ok ? r.json() : { voices: [] }).then(d => setVoices(d.voices || [])).catch(() => setVoices([])).finally(() => setLoadingVoices(false));
  }, []);

  useEffect(() => {
    fetch('/api/admin/news-settings').then(r => r.ok ? r.json() : { settings: [] }).then(data => {
      const loaded: Record<string, Settings> = {};
      for (const row of data.settings || []) { loaded[row.category] = { narratorName: row.narrator_name || '', voiceId: row.voice_id || '' }; }
      for (const cat of CATEGORIES) { if (!loaded[cat.id]) loaded[cat.id] = { narratorName: '', voiceId: '' }; }
      setSettings(loaded);
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    fetch('/api/admin/subscriber-states').then(r => r.ok ? r.json() : { states: [] }).then(data => {
      if (data.states?.length > 0) { setSubscriberStates(data.states); setSelectedState(data.states[0]); }
    }).catch(() => {});
  }, []);

  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    await fetch('/api/admin/news-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, narrator_name: narratorName, voice_id: voiceId }) });
  }

  async function handleTestVoice(voiceId: string, narratorName: string) {
    if (!voiceId) { alert('Please select a voice first'); return; }
    const r = await fetch('/api/elevenlabs/test-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId, text: `Hello, I'm ${narratorName || 'your narrator'}. This is a voice test.` }) });
    if (r.ok) { const blob = await r.blob(); new Audio(URL.createObjectURL(blob)).play(); }
  }

  async function handleGenerate(category: string, state?: string) {
    const s = settings[category];
    if (!s?.narratorName || !s?.voiceId) { alert('Please set narrator name and voice first.'); return; }
    const key = state ? `${category}-${state}` : category;
    setGenerating(p => ({ ...p, [key]: true }));
    try {
      const r = await fetch('/api/admin/generate-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, state }) });
      const d = await r.json();
      if (r.ok && d.success) { setEpisodes(p => ({ ...p, [key]: { audioUrl: d.episode.audioUrl, createdAt: d.episode.createdAt, duration: d.episode.duration } })); alert('Generated! Duration: ' + (d.episode.duration || 'N/A') + ' min'); }
      else { alert('Failed: ' + (d.error || 'Unknown error')); }
    } catch { alert('Generation failed.'); }
    finally { setGenerating(p => ({ ...p, [key]: false })); }
  }

  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s?.narratorName || !s?.voiceId) { alert('Please set State News narrator and voice first.'); return; }
    setGeneratingUpsell(true);
    try {
      const r = await fetch('/api/news/state-upsell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ narratorName: s.narratorName, voiceId: s.voiceId }) });
      const d = await r.json();
      if (r.ok && d.audioUrl) { setStateUpsell({ exists: true, audioUrl: d.audioUrl }); alert('Upsell generated!'); }
      else { alert('Failed: ' + (d.error || 'Unknown')); }
    } catch { alert('Generation failed.'); }
    finally { setGeneratingUpsell(false); }
  }

  function handlePlay(key: string, url?: string) {
    if (audioRef.current) { audioRef.current.pause(); }
    if (playing === key) { setPlaying(null); return; }
    const audioUrl = url || episodes[key]?.audioUrl;
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play();
    setPlaying(key);
  }

  if (!settingsLoaded) return <div style={{ minHeight: '100vh', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 20, color: '#000' }}>Loading...</p></div>;

  const inputStyle = { width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000', borderRadius: '6px', backgroundColor: '#fff', color: '#000', boxSizing: 'border-box' as const };
  const selectStyle = { padding: '12px', fontSize: '16px', border: '2px solid #000', borderRadius: '6px', backgroundColor: '#fff', color: '#000', flex: 1 };
  const btnStyle = { padding: '12px 20px', fontSize: '16px', fontWeight: 'bold' as const, border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: '#000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>🎙️ News Briefings Admin</h1>
      <p style={{ marginBottom: '24px', fontSize: '16px' }}>Configure narrators, voices, and prompts. Settings persist permanently.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const key = cat.id === 'state' ? `state-${selectedState}` : cat.id;
          const ep = episodes[key];
          const isGen = generating[key];
          const isPlay = playing === key;
          return (
            <div key={cat.id} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', borderTop: `6px solid ${cat.color}` }}>
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>{cat.icon} {cat.label}</h2>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold' }}>Narrator Name</label>
              <input type="text" value={s.narratorName} onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))} onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)} placeholder="e.g., Sarah Mitchell" style={{ ...inputStyle, marginBottom: '16px' }} />
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold' }}>Voice</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select value={s.voiceId} onChange={e => { setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: e.target.value } })); saveSettings(cat.id, s.narratorName, e.target.value); }} style={selectStyle}>
                  <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button onClick={() => handleTestVoice(s.voiceId, s.narratorName)} disabled={!s.voiceId} style={{ ...btnStyle, backgroundColor: s.voiceId ? '#3b82f6' : '#ccc', color: '#fff' }}>🔊 Test</button>
              </div>
              <button onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)} style={{ ...btnStyle, width: '100%', backgroundColor: '#fff', marginBottom: '16px' }}>📝 Edit Prompt</button>
              {cat.id === 'state' ? (
                <>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold' }}>Select State (Subscribers Only)</label>
                  <select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ ...selectStyle, width: '100%', marginBottom: '16px' }}>
                    {subscriberStates.length === 0 ? <option value="">No subscriber states</option> : subscriberStates.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate('state', selectedState)} disabled={isGen || !s.narratorName || !s.voiceId || !selectedState} style={{ ...btnStyle, flex: 1, backgroundColor: isGen ? '#ccc' : cat.color, color: '#fff' }}>{isGen ? '⏳...' : `🎬 Generate ${selectedState || ''}`}</button>
                    <button onClick={() => handlePlay(key)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlay ? '#dc2626' : '#10b981') : '#ccc', color: '#fff' }}>{isPlay ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>
                  {ep && <div style={{ fontSize: '14px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', marginBottom: '16px' }}>{selectedState}: {new Date(ep.createdAt).toLocaleString()} {ep.duration ? `• ${ep.duration} min` : ''}</div>}
                  <div style={{ backgroundColor: '#fffbeb', border: '2px solid #000', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Welcome Page Upsell (uses State News voice)</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={handleGenerateUpsell} disabled={generatingUpsell || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: generatingUpsell ? '#ccc' : (stateUpsell.exists ? '#10b981' : '#dc2626'), color: '#fff' }}>{generatingUpsell ? '⏳...' : stateUpsell.exists ? '✅ Regenerate' : '⚠️ Generate Upsell'}</button>
                      <button onClick={() => { if (playingUpsell) { audioRef.current?.pause(); setPlayingUpsell(false); } else if (stateUpsell.audioUrl) { handlePlay('upsell', stateUpsell.audioUrl); setPlayingUpsell(true); } }} disabled={!stateUpsell.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: stateUpsell.audioUrl ? (playingUpsell ? '#dc2626' : '#10b981') : '#ccc', color: '#fff' }}>{playingUpsell ? '⏹️ Stop' : '▶️ Play Upsell'}</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate(cat.id)} disabled={isGen || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: isGen ? '#ccc' : cat.color, color: cat.id === 'world' ? '#000' : '#fff' }}>{isGen ? '⏳...' : '🎬 Generate'}</button>
                    <button onClick={() => handlePlay(cat.id)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlay ? '#dc2626' : '#10b981') : '#ccc', color: '#fff' }}>{isPlay ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>
                  {ep && <div style={{ fontSize: '14px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px' }}>Last: {new Date(ep.createdAt).toLocaleString()} {ep.duration ? `• ${ep.duration} min` : ''}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
