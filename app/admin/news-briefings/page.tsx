// app/admin/news-briefings/page.tsx
// DTT News Briefings Admin - Version 7.0
// February 2026 - Full Requirements Implementation

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

// Styles - White background, black text, no gray
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: 24, fontFamily: 'Arial, sans-serif' },
  card: { backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: 12, padding: 20, marginBottom: 20 },
  label: { display: 'block', marginBottom: 6, fontSize: 16, fontWeight: 'bold', color: '#000000' },
  input: { width: '100%', padding: 12, fontSize: 16, border: '2px solid #000000', borderRadius: 6, backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' as const },
  select: { padding: 12, fontSize: 16, border: '2px solid #000000', borderRadius: 6, backgroundColor: '#ffffff', color: '#000000' },
  btn: { padding: '12px 20px', fontSize: 16, fontWeight: 'bold' as const, border: '2px solid #000000', borderRadius: 6, cursor: 'pointer' },
  btnDisabled: { backgroundColor: '#cccccc', color: '#666666', cursor: 'not-allowed' },
  row: { display: 'flex', gap: 10, marginBottom: 16 },
  status: { fontSize: 14, fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: 10, borderRadius: 6, border: '1px solid #000000', color: '#000000' }
};

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  
  // State
  const [settings, setSettings] = useState<Record<string, { narratorName: string; voiceId: string }>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, { audioUrl: string; createdAt: string; duration?: string }>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [voices, setVoices] = useState<{ voice_id: string; name: string }[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [subscriberStates, setSubscriberStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [stateUpsell, setStateUpsell] = useState<{ exists: boolean; audioUrl?: string }>({ exists: false });
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  const [playingUpsell, setPlayingUpsell] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const upsellAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Load episodes and subscriber states
  useEffect(() => {
    // Get episodes
    fetch('/api/news/briefing?listAll=true')
      .then(r => r.ok ? r.json() : { episodes: [] })
      .then(data => {
        const loaded: Record<string, { audioUrl: string; createdAt: string; duration?: string }> = {};
        const states: string[] = [];
        
        for (const ep of data.episodes || []) {
          if (ep.category === 'state-upsell') {
            setStateUpsell({ exists: true, audioUrl: ep.audio_url });
            continue;
          }
          if (ep.category === 'state' && ep.state && !states.includes(ep.state)) {
            states.push(ep.state);
          }
          const key = ep.state ? `${ep.category}-${ep.state}` : ep.category;
          loaded[key] = { audioUrl: ep.audio_url, createdAt: ep.created_at, duration: ep.duration };
        }
        setEpisodes(loaded);
        if (states.length > 0) {
          setSubscriberStates(states.sort());
          if (!selectedState) setSelectedState(states[0]);
        }
      })
      .catch(() => {});

    // Get subscriber states from users table
    fetch('/api/admin/subscriber-states')
      .then(r => r.ok ? r.json() : { states: [] })
      .then(data => {
        if (data.states?.length > 0) {
          setSubscriberStates(prev => {
            const combined = Array.from(new Set([...prev, ...data.states])).sort();
            if (!selectedState && combined.length > 0) setSelectedState(combined[0]);
            return combined;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Save settings via API
  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    try {
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, narrator_name: narratorName, voice_id: voiceId })
      });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // Test voice
  async function handleTestVoice(voiceId: string, narratorName: string) {
    if (!voiceId) { alert('Please select a voice first'); return; }
    try {
      const r = await fetch('/api/elevenlabs/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: `Hello, I'm ${narratorName || 'your news broadcaster'}. This is a voice test for Drive Time Tales.` })
      });
      if (r.ok) {
        const blob = await r.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      } else {
        alert('Voice test failed. Please try again.');
      }
    } catch {
      alert('Voice test failed.');
    }
  }

  // Generate briefing
  async function handleGenerate(category: string, state?: string) {
    const s = settings[category];
    if (!s?.narratorName || !s?.voiceId) { 
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
        setEpisodes(p => ({ 
          ...p, 
          [key]: { 
            audioUrl: d.episode.audioUrl, 
            createdAt: d.episode.createdAt,
            duration: d.episode.duration 
          } 
        }));
        alert(`✅ Generated! Duration: ${d.episode.duration || 'N/A'} min`);
      } else {
        alert(`❌ Failed: ${d.error}`);
      }
    } catch {
      alert('Generation failed. Please try again.');
    } finally {
      setGenerating(p => ({ ...p, [key]: false }));
    }
  }

  // Generate upsell
  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s?.narratorName || !s?.voiceId) { 
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
        alert('✅ State Upsell generated successfully!');
      } else {
        alert(`❌ Failed: ${d.error}`);
      }
    } catch {
      alert('Generation failed.');
    } finally {
      setGeneratingUpsell(false);
    }
  }

  // Play audio
  function handlePlay(key: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (upsellAudioRef.current) { upsellAudioRef.current.pause(); setPlayingUpsell(false); }
    
    if (playing === key) { setPlaying(null); return; }
    
    const ep = episodes[key];
    if (!ep?.audioUrl) return;
    
    const audio = new Audio(ep.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play();
    setPlaying(key);
  }

  // Play upsell
  function handlePlayUpsell() {
    if (audioRef.current) { audioRef.current.pause(); setPlaying(null); }
    if (upsellAudioRef.current) { upsellAudioRef.current.pause(); }
    
    if (playingUpsell) { setPlayingUpsell(false); return; }
    
    if (!stateUpsell.audioUrl) return;
    
    const audio = new Audio(stateUpsell.audioUrl);
    upsellAudioRef.current = audio;
    audio.onended = () => setPlayingUpsell(false);
    audio.play();
    setPlayingUpsell(true);
  }

  // Format time
  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  if (!settingsLoaded) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 20, fontWeight: 'bold' }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <h1 style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: '#000000' }}>
        🎙️ News Briefings Admin
      </h1>
      <p style={{ marginBottom: 24, fontSize: 16, color: '#000000' }}>
        Configure narrators, voices, and prompts. Settings save automatically and persist permanently.
      </p>

      {/* Category Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const ep = cat.id === 'state' ? episodes[`state-${selectedState}`] : episodes[cat.id];
          const key = cat.id === 'state' ? `state-${selectedState}` : cat.id;
          const isGen = generating[key];
          const isPlay = playing === key;

          return (
            <div key={cat.id} style={{ ...styles.card, borderTop: `6px solid ${cat.color}` }}>
              {/* Category Header */}
              <h2 style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>
                {cat.icon} {cat.label}
              </h2>

              {/* Narrator Name */}
              <label style={styles.label}>Narrator Name</label>
              <input
                type="text"
                value={s.narratorName}
                onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))}
                onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)}
                placeholder="e.g., Sarah Mitchell"
                style={{ ...styles.input, marginBottom: 16 }}
              />

              {/* Voice + Test Button */}
              <label style={styles.label}>Voice</label>
              <div style={styles.row}>
                <select
                  value={s.voiceId}
                  onChange={e => {
                    const v = e.target.value;
                    setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: v } }));
                    saveSettings(cat.id, s.narratorName, v);
                  }}
                  style={{ ...styles.select, flex: 1 }}
                >
                  <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button
                  onClick={() => handleTestVoice(s.voiceId, s.narratorName)}
                  disabled={!s.voiceId}
                  style={{ 
                    ...styles.btn, 
                    backgroundColor: s.voiceId ? '#3b82f6' : '#cccccc', 
                    color: '#ffffff',
                    ...(s.voiceId ? {} : styles.btnDisabled)
                  }}
                >
                  🔊 Test
                </button>
              </div>

              {/* Edit Prompt Button */}
              <button
                onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)}
                style={{ ...styles.btn, width: '100%', backgroundColor: '#ffffff', marginBottom: 16 }}
              >
                📝 Edit Prompt
              </button>

              {/* STATE NEWS - Special Controls */}
              {cat.id === 'state' ? (
                <>
                  {/* State Dropdown - Only subscriber states */}
                  <label style={styles.label}>Select State (Subscribers Only)</label>
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    style={{ ...styles.select, width: '100%', marginBottom: 16 }}
                  >
                    {subscriberStates.length === 0 ? (
                      <option value="">No subscriber states yet</option>
                    ) : (
                      subscriberStates.map(st => <option key={st} value={st}>{st}</option>)
                    )}
                  </select>

                  {/* Generate + Play for selected state */}
                  <div style={styles.row}>
                    <button
                      onClick={() => handleGenerate('state', selectedState)}
                      disabled={isGen || !s.narratorName || !s.voiceId || !selectedState}
                      style={{ 
                        ...styles.btn, 
                        flex: 1, 
                        backgroundColor: (isGen || !s.narratorName || !s.voiceId || !selectedState) ? '#cccccc' : cat.color, 
                        color: '#ffffff' 
                      }}
                    >
                      {isGen ? '⏳ Generating...' : `🎬 Generate ${selectedState || 'State'}`}
                    </button>
                    <button
                      onClick={() => handlePlay(key)}
                      disabled={!ep?.audioUrl}
                      style={{ 
                        ...styles.btn, 
                        flex: 1, 
                        backgroundColor: ep?.audioUrl ? (isPlay ? '#dc2626' : '#10b981') : '#cccccc', 
                        color: '#ffffff' 
                      }}
                    >
                      {isPlay ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {/* Status for state */}
                  {ep && (
                    <div style={{ ...styles.status, marginBottom: 16 }}>
                      {selectedState}: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}
                    </div>
                  )}

                  {/* Upsell Section */}
                  <div style={{ backgroundColor: '#fffbeb', border: '2px solid #000000', borderRadius: 8, padding: 12 }}>
                    <p style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10, color: '#000000' }}>
                      Welcome Page Upsell (uses State News voice)
                    </p>
                    <div style={styles.row}>
                      <button
                        onClick={handleGenerateUpsell}
                        disabled={generatingUpsell || !s.narratorName || !s.voiceId}
                        style={{ 
                          ...styles.btn, 
                          flex: 1, 
                          backgroundColor: (generatingUpsell || !s.narratorName || !s.voiceId) ? '#cccccc' : (stateUpsell.exists ? '#10b981' : '#dc2626'), 
                          color: '#ffffff' 
                        }}
                      >
                        {generatingUpsell ? '⏳...' : stateUpsell.exists ? '✅ Regenerate Upsell' : '⚠️ Generate Upsell'}
                      </button>
                      <button
                        onClick={handlePlayUpsell}
                        disabled={!stateUpsell.audioUrl}
                        style={{ 
                          ...styles.btn, 
                          flex: 1, 
                          backgroundColor: stateUpsell.audioUrl ? (playingUpsell ? '#dc2626' : '#10b981') : '#cccccc', 
                          color: '#ffffff' 
                        }}
                      >
                        {playingUpsell ? '⏹️ Stop' : '▶️ Play Upsell'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* OTHER CATEGORIES */
                <>
                  <div style={styles.row}>
                    <button
                      onClick={() => handleGenerate(cat.id)}
                      disabled={isGen || !s.narratorName || !s.voiceId}
                      style={{ 
                        ...styles.btn, 
                        flex: 1, 
                        backgroundColor: (isGen || !s.narratorName || !s.voiceId) ? '#cccccc' : cat.color, 
                        color: cat.id === 'world' ? '#000000' : '#ffffff' 
                      }}
                    >
                      {isGen ? '⏳ Generating...' : '🎬 Generate'}
                    </button>
                    <button
                      onClick={() => handlePlay(cat.id)}
                      disabled={!ep?.audioUrl}
                      style={{ 
                        ...styles.btn, 
                        flex: 1, 
                        backgroundColor: ep?.audioUrl ? (isPlay ? '#dc2626' : '#10b981') : '#cccccc', 
                        color: '#ffffff' 
                      }}
                    >
                      {isPlay ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {/* Status */}
                  {ep && (
                    <div style={styles.status}>
                      Last: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}
                    </div>
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
