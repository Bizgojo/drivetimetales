// app/admin/news-briefings/page.tsx
// DTT News Briefings Admin - Complete Implementation
// February 2026

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Category configuration
const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
];

// Styles - White background, black text, no gray anywhere
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#ffffff',
  color: '#000000',
  padding: '24px',
  fontFamily: 'Arial, sans-serif'
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '2px solid #000000',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#000000'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '16px',
  border: '2px solid #000000',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#000000',
  boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: '16px',
  border: '2px solid #000000',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#000000'
};

const buttonStyle: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: '16px',
  fontWeight: 'bold',
  border: '2px solid #000000',
  borderRadius: '6px',
  cursor: 'pointer'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginBottom: '16px'
};

const statusStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  backgroundColor: '#f5f5f5',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #000000',
  color: '#000000'
};

interface Voice {
  voice_id: string;
  name: string;
}

interface Settings {
  narratorName: string;
  voiceId: string;
}

interface Episode {
  audioUrl: string;
  createdAt: string;
  duration?: string;
}

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  
  // State
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
  const upsellAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load voices from ElevenLabs
  useEffect(() => {
    fetch('/api/elevenlabs/voices')
      .then(r => r.ok ? r.json() : { voices: [] })
      .then(d => setVoices(d.voices || []))
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));
  }, []);

  // Load settings from database
  useEffect(() => {
    fetch('/api/admin/news-settings')
      .then(r => r.ok ? r.json() : { settings: [] })
      .then(data => {
        const loaded: Record<string, Settings> = {};
        for (const row of data.settings || []) {
          loaded[row.category] = {
            narratorName: row.narrator_name || '',
            voiceId: row.voice_id || ''
          };
        }
        // Initialize empty settings for categories not in DB
        for (const cat of CATEGORIES) {
          if (!loaded[cat.id]) {
            loaded[cat.id] = { narratorName: '', voiceId: '' };
          }
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
        const loaded: Record<string, Episode> = {};
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
          loaded[key] = {
            audioUrl: ep.audio_url,
            createdAt: ep.created_at,
            duration: ep.duration
          };
        }
        setEpisodes(loaded);
        if (states.length > 0) {
          const sortedStates = states.sort();
          setSubscriberStates(sortedStates);
          if (!selectedState) setSelectedState(sortedStates[0]);
        }
      })
      .catch(() => {});

    // Get subscriber states from users table
    fetch('/api/admin/subscriber-states')
      .then(r => r.ok ? r.json() : { states: [] })
      .then(data => {
        if (data.states && data.states.length > 0) {
          setSubscriberStates(prev => {
            const combined = Array.from(new Set([...prev, ...data.states])).sort();
            if (!selectedState && combined.length > 0) setSelectedState(combined[0]);
            return combined;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Save settings to database
  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    try {
      const response = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, narrator_name: narratorName, voice_id: voiceId })
      });
      if (!response.ok) {
        console.error('Failed to save settings');
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // Test voice with ElevenLabs
  async function handleTestVoice(voiceId: string, narratorName: string) {
    if (!voiceId) {
      alert('Please select a voice first');
      return;
    }
    try {
      const response = await fetch('/api/elevenlabs/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId,
          text: `Hello, I'm ${narratorName || 'your news broadcaster'}. This is a voice test for Drive Time Tales.`
        })
      });
      if (response.ok) {
        const blob = await response.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      } else {
        alert('Voice test failed. Please try again.');
      }
    } catch (error) {
      console.error('Voice test error:', error);
      alert('Voice test failed.');
    }
  }

  // Generate news briefing
  async function handleGenerate(category: string, state?: string) {
    const s = settings[category];
    if (!s || !s.narratorName || !s.voiceId) {
      alert('Please set narrator name and voice first.');
      return;
    }
    
    const key = state ? `${category}-${state}` : category;
    setGenerating(prev => ({ ...prev, [key]: true }));
    
    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, state })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        setEpisodes(prev => ({
          ...prev,
          [key]: {
            audioUrl: data.episode.audioUrl,
            createdAt: data.episode.createdAt,
            duration: data.episode.duration
          }
        }));
        alert(`✅ Generated! Duration: ${data.episode.duration || 'N/A'} min`);
      } else {
        alert(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Generation failed. Please try again.');
    } finally {
      setGenerating(prev => ({ ...prev, [key]: false }));
    }
  }

  // Generate state upsell
  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s || !s.narratorName || !s.voiceId) {
      alert('Please set State News narrator and voice first.');
      return;
    }
    
    setGeneratingUpsell(true);
    try {
      const response = await fetch('/api/news/state-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narratorName: s.narratorName, voiceId: s.voiceId })
      });
      const data = await response.json();
      
      if (response.ok && data.audioUrl) {
        setStateUpsell({ exists: true, audioUrl: data.audioUrl });
        alert('✅ State Upsell generated!');
      } else {
        alert(`❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upsell error:', error);
      alert('Generation failed.');
    } finally {
      setGeneratingUpsell(false);
    }
  }

  // Play audio
  function handlePlay(key: string) {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (upsellAudioRef.current) {
      upsellAudioRef.current.pause();
      setPlayingUpsell(false);
    }
    
    // If already playing this one, just stop
    if (playing === key) {
      setPlaying(null);
      return;
    }
    
    const ep = episodes[key];
    if (!ep || !ep.audioUrl) return;
    
    const audio = new Audio(ep.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.play();
    setPlaying(key);
  }

  // Play upsell
  function handlePlayUpsell() {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
    }
    if (upsellAudioRef.current) {
      upsellAudioRef.current.pause();
    }
    
    // If already playing, just stop
    if (playingUpsell) {
      setPlayingUpsell(false);
      return;
    }
    
    if (!stateUpsell.audioUrl) return;
    
    const audio = new Audio(stateUpsell.audioUrl);
    upsellAudioRef.current = audio;
    audio.onended = () => setPlayingUpsell(false);
    audio.play();
    setPlayingUpsell(true);
  }

  // Format timestamp
  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // Loading state
  if (!settingsLoaded) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px', color: '#000000' }}>
        🎙️ News Briefings Admin
      </h1>
      <p style={{ marginBottom: '24px', fontSize: '16px', color: '#000000' }}>
        Configure narrators, voices, and prompts. Settings save automatically and persist permanently.
      </p>

      {/* Category Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const episodeKey = cat.id === 'state' ? `state-${selectedState}` : cat.id;
          const ep = episodes[episodeKey];
          const isGenerating = generating[episodeKey];
          const isPlaying = playing === episodeKey;

          return (
            <div key={cat.id} style={{ ...cardStyle, borderTop: `6px solid ${cat.color}` }}>
              {/* Category Header */}
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
                {cat.icon} {cat.label}
              </h2>

              {/* Narrator Name */}
              <label style={labelStyle}>Narrator Name</label>
              <input
                type="text"
                value={s.narratorName}
                onChange={e => setSettings(prev => ({
                  ...prev,
                  [cat.id]: { ...prev[cat.id], narratorName: e.target.value }
                }))}
                onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)}
                placeholder="e.g., Sarah Mitchell"
                style={{ ...inputStyle, marginBottom: '16px' }}
              />

              {/* Voice + Test Button */}
              <label style={labelStyle}>Voice</label>
              <div style={rowStyle}>
                <select
                  value={s.voiceId}
                  onChange={e => {
                    const newVoiceId = e.target.value;
                    setSettings(prev => ({
                      ...prev,
                      [cat.id]: { ...prev[cat.id], voiceId: newVoiceId }
                    }));
                    saveSettings(cat.id, s.narratorName, newVoiceId);
                  }}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                  {voices.map(v => (
                    <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleTestVoice(s.voiceId, s.narratorName)}
                  disabled={!s.voiceId}
                  style={{
                    ...buttonStyle,
                    backgroundColor: s.voiceId ? '#3b82f6' : '#cccccc',
                    color: '#ffffff'
                  }}
                >
                  🔊 Test
                </button>
              </div>

              {/* Edit Prompt Button */}
              <button
                onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)}
                style={{ ...buttonStyle, width: '100%', backgroundColor: '#ffffff', marginBottom: '16px' }}
              >
                📝 Edit Prompt
              </button>

              {/* STATE NEWS - Special Controls */}
              {cat.id === 'state' ? (
                <>
                  {/* State Dropdown - Only subscriber states */}
                  <label style={labelStyle}>Select State (Subscribers Only)</label>
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    style={{ ...selectStyle, width: '100%', marginBottom: '16px' }}
                  >
                    {subscriberStates.length === 0 ? (
                      <option value="">No subscriber states yet</option>
                    ) : (
                      subscriberStates.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))
                    )}
                  </select>

                  {/* Generate + Play for selected state */}
                  <div style={rowStyle}>
                    <button
                      onClick={() => handleGenerate('state', selectedState)}
                      disabled={isGenerating || !s.narratorName || !s.voiceId || !selectedState}
                      style={{
                        ...buttonStyle,
                        flex: 1,
                        backgroundColor: (isGenerating || !s.narratorName || !s.voiceId || !selectedState) ? '#cccccc' : cat.color,
                        color: '#ffffff'
                      }}
                    >
                      {isGenerating ? '⏳ Generating...' : `🎬 Generate ${selectedState || 'State'}`}
                    </button>
                    <button
                      onClick={() => handlePlay(episodeKey)}
                      disabled={!ep?.audioUrl}
                      style={{
                        ...buttonStyle,
                        flex: 1,
                        backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc',
                        color: '#ffffff'
                      }}
                    >
                      {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {/* Status for state */}
                  {ep && (
                    <div style={{ ...statusStyle, marginBottom: '16px' }}>
                      {selectedState}: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}
                    </div>
                  )}

                  {/* Upsell Section */}
                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '2px solid #000000',
                    borderRadius: '8px',
                    padding: '12px'
                  }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#000000' }}>
                      Welcome Page Upsell (uses State News voice)
                    </p>
                    <div style={rowStyle}>
                      <button
                        onClick={handleGenerateUpsell}
                        disabled={generatingUpsell || !s.narratorName || !s.voiceId}
                        style={{
                          ...buttonStyle,
                          flex: 1,
                          backgroundColor: (generatingUpsell || !s.narratorName || !s.voiceId)
                            ? '#cccccc'
                            : (stateUpsell.exists ? '#10b981' : '#dc2626'),
                          color: '#ffffff'
                        }}
                      >
                        {generatingUpsell ? '⏳...' : stateUpsell.exists ? '✅ Regenerate' : '⚠️ Generate Upsell'}
                      </button>
                      <button
                        onClick={handlePlayUpsell}
                        disabled={!stateUpsell.audioUrl}
                        style={{
                          ...buttonStyle,
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
                /* OTHER CATEGORIES - Generate + Play + Status */
                <>
                  <div style={rowStyle}>
                    <button
                      onClick={() => handleGenerate(cat.id)}
                      disabled={isGenerating || !s.narratorName || !s.voiceId}
                      style={{
                        ...buttonStyle,
                        flex: 1,
                        backgroundColor: (isGenerating || !s.narratorName || !s.voiceId) ? '#cccccc' : cat.color,
                        color: cat.id === 'world' ? '#000000' : '#ffffff'
                      }}
                    >
                      {isGenerating ? '⏳ Generating...' : '🎬 Generate'}
                    </button>
                    <button
                      onClick={() => handlePlay(cat.id)}
                      disabled={!ep?.audioUrl}
                      style={{
                        ...buttonStyle,
                        flex: 1,
                        backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc',
                        color: '#ffffff'
                      }}
                    >
                      {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {/* Status */}
                  {ep && (
                    <div style={statusStyle}>
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
