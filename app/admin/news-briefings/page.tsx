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

// Spinning wheel component
function Spinner({ color = '#ffffff' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '18px',
      height: '18px',
      border: `3px solid ${color}`,
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginRight: '8px',
      verticalAlign: 'middle'
    }} />
  );
}

const spinnerStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

interface Voice { voice_id: string; name: string; }
interface Settings { narratorName: string; voiceId: string; }
interface Episode { audioUrl: string; createdAt: string; duration?: string; }

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, Episode>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [testingVoice, setTestingVoice] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [subscriberStates, setSubscriberStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [stateUpsell, setStateUpsell] = useState<{ exists: boolean; audioUrl?: string }>({ exists: false });
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  const [playingUpsell, setPlayingUpsell] = useState(false);
  
  // Auto-generation state (master toggle for all categories)
  const [autoGenerateEnabled, setAutoGenerateEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['06:00', '12:00', '18:00']);
  const [savingAutoGen, setSavingAutoGen] = useState(false);
  
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
        let foundAutoGen = false;
        let foundTimes: string[] = [];
        
        for (const row of data.settings || []) {
          loaded[row.category] = { narratorName: row.narrator_name || '', voiceId: row.voice_id || '' };
          // Check first category for auto_generate setting (master toggle stored on 'national')
          if (row.category === 'national') {
            if (row.auto_generate) {
              foundAutoGen = row.auto_generate;
            }
            if (row.schedule_times && row.schedule_times.length > 0) {
              foundTimes = row.schedule_times;
            }
          }
        }
        for (const cat of CATEGORIES) {
          if (!loaded[cat.id]) loaded[cat.id] = { narratorName: '', voiceId: '' };
        }
        setSettings(loaded);
        setAutoGenerateEnabled(foundAutoGen);
        if (foundTimes.length > 0) setScheduleTimes(foundTimes);
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

  // Save settings for a category
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

  // Save auto-generation settings (stored on 'national' category as master)
  async function saveAutoGenSettings() {
    setSavingAutoGen(true);
    try {
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: 'national', 
          auto_generate: autoGenerateEnabled,
          schedule_times: scheduleTimes 
        })
      });
    } catch (e) {
      console.error('Save auto-gen failed:', e);
    } finally {
      setSavingAutoGen(false);
    }
  }

  // Test voice
  async function handleTestVoice(category: string, voiceId: string, narratorName: string) {
    if (!voiceId) { alert('Please select a voice first'); return; }
    setTestingVoice(p => ({ ...p, [category]: true }));
    try {
      const r = await fetch('/api/elevenlabs/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: `Hello, I'm ${narratorName || 'your narrator'}. This is a voice test for Drive Time Tales news briefings.` })
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
    } finally {
      setTestingVoice(p => ({ ...p, [category]: false }));
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
        alert(`Generated successfully! Duration: ${d.episode.duration || 'N/A'} min`);
      } else {
        alert(`Generation failed: ${d.error || 'Unknown error'}`);
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
        alert('State Upsell generated successfully!');
      } else {
        alert(`Generation failed: ${d.error || 'Unknown error'}`);
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

  // Add schedule time
  function addScheduleTime() {
    if (scheduleTimes.length < 6) {
      setScheduleTimes([...scheduleTimes, '12:00']);
    }
  }

  // Remove schedule time
  function removeScheduleTime(index: number) {
    if (scheduleTimes.length > 1) {
      setScheduleTimes(scheduleTimes.filter((_, i) => i !== index));
    }
  }

  // Update schedule time
  function updateScheduleTime(index: number, value: string) {
    const newTimes = [...scheduleTimes];
    newTimes[index] = value;
    setScheduleTimes(newTimes);
  }

  if (!settingsLoaded) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{spinnerStyles}</style>
        <div style={{ textAlign: 'center' }}>
          <Spinner color="#000000" />
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', marginTop: '16px' }}>Loading settings...</p>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' };
  const btnStyle: React.CSSProperties = { padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <style>{spinnerStyles}</style>
      
      <Link href="/admin" style={{ display: 'inline-block', marginBottom: '16px', color: '#3b82f6', fontSize: '16px', textDecoration: 'none' }}>← Back to Admin</Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px', color: '#000000' }}>🎙️ News Briefings Admin</h1>
      <p style={{ marginBottom: '24px', fontSize: '16px', color: '#000000' }}>Configure narrators, voices, and prompts. Settings save automatically.</p>

      {/* Auto-Generation Master Controls */}
      <div style={{ backgroundColor: '#f8fafc', border: '2px solid #000000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px', color: '#000000' }}>⏰ Auto-Generation Schedule</h2>
            <p style={{ fontSize: '14px', color: '#666666', margin: 0 }}>When enabled, news briefings generate automatically for all categories at scheduled times.</p>
          </div>
          
          {/* Toggle Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 'bold', color: autoGenerateEnabled ? '#16a34a' : '#666666' }}>
              {autoGenerateEnabled ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={() => setAutoGenerateEnabled(!autoGenerateEnabled)}
              style={{
                width: '60px',
                height: '32px',
                borderRadius: '16px',
                border: '2px solid #000000',
                backgroundColor: autoGenerateEnabled ? '#16a34a' : '#cccccc',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background-color 0.2s'
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: autoGenerateEnabled ? '30px' : '3px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '1px solid #000000',
                transition: 'left 0.2s'
              }} />
            </button>
          </div>
        </div>

        {/* Schedule Times */}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #cccccc' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Generation Times (24-hour format)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            {scheduleTimes.map((time, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => updateScheduleTime(index, e.target.value)}
                  style={{ padding: '8px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff' }}
                />
                {scheduleTimes.length > 1 && (
                  <button
                    onClick={() => removeScheduleTime(index)}
                    style={{ padding: '8px 12px', fontSize: '14px', border: '2px solid #dc2626', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {scheduleTimes.length < 6 && (
              <button
                onClick={addScheduleTime}
                style={{ padding: '8px 16px', fontSize: '14px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: 'bold' }}
              >
                + Add Time
              </button>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={saveAutoGenSettings}
            disabled={savingAutoGen}
            style={{ ...btnStyle, backgroundColor: '#3b82f6', color: '#ffffff', minWidth: '150px' }}
          >
            {savingAutoGen ? <><Spinner /> Saving...</> : '💾 Save Schedule'}
          </button>
        </div>
      </div>

      {/* Category Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {CATEGORIES.map(cat => {
          const s = settings[cat.id] || { narratorName: '', voiceId: '' };
          const episodeKey = cat.id === 'state' ? `state-${selectedState}` : cat.id;
          const ep = episodes[episodeKey];
          const isGenerating = generating[episodeKey];
          const isTestingVoice = testingVoice[cat.id];
          const isPlaying = playing === episodeKey;

          return (
            <div key={cat.id} style={{ backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', borderTop: `6px solid ${cat.color}` }}>
              <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>{cat.icon} {cat.label}</h2>

              {/* Narrator Name */}
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Narrator Name</label>
              <input
                type="text"
                value={s.narratorName}
                onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))}
                onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)}
                placeholder="e.g., Sarah Mitchell"
                style={{ ...inputStyle, marginBottom: '16px' }}
              />

              {/* Voice + Test Button - FIXED: explicit widths */}
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Voice</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'stretch' }}>
                <select
                  value={s.voiceId}
                  onChange={e => { const v = e.target.value; setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: v } })); saveSettings(cat.id, s.narratorName, v); }}
                  style={{ 
                    padding: '12px', 
                    fontSize: '16px', 
                    border: '2px solid #000000', 
                    borderRadius: '6px', 
                    backgroundColor: '#ffffff', 
                    color: '#000000',
                    width: 'calc(100% - 110px)',
                    minWidth: '150px'
                  }}
                >
                  <option value="">{loadingVoices ? 'Loading voices...' : 'Select a voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button 
                  onClick={() => handleTestVoice(cat.id, s.voiceId, s.narratorName)} 
                  disabled={!s.voiceId || isTestingVoice} 
                  style={{ 
                    ...btnStyle, 
                    backgroundColor: (!s.voiceId || isTestingVoice) ? '#cccccc' : '#3b82f6', 
                    color: '#ffffff',
                    width: '100px',
                    flexShrink: 0,
                    padding: '12px 8px'
                  }}
                >
                  {isTestingVoice ? <><Spinner /> </> : '🔊 Test'}
                </button>
              </div>

              {/* Edit Prompt Button */}
              <button 
                onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)} 
                style={{ ...btnStyle, width: '100%', backgroundColor: '#f5f5f5', marginBottom: '16px', color: '#000000' }}
              >
                📝 Edit Prompt
              </button>

              {cat.id === 'state' ? (
                <>
                  {/* State Dropdown */}
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Select State (Subscribers Only)</label>
                  <select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }}>
                    {subscriberStates.length === 0 ? <option value="">No subscriber states yet</option> : subscriberStates.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>

                  {/* Generate + Play for selected state */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button 
                      onClick={() => handleGenerate('state', selectedState)} 
                      disabled={isGenerating || !s.narratorName || !s.voiceId || !selectedState} 
                      style={{ 
                        ...btnStyle, 
                        flex: 1, 
                        backgroundColor: (isGenerating || !s.narratorName || !s.voiceId || !selectedState) ? '#cccccc' : cat.color, 
                        color: '#ffffff' 
                      }}
                    >
                      {isGenerating ? <><Spinner /> Generating...</> : `🎬 Generate ${selectedState || 'State'}`}
                    </button>
                    <button 
                      onClick={() => handlePlay(episodeKey)} 
                      disabled={!ep?.audioUrl} 
                      style={{ 
                        ...btnStyle, 
                        flex: 1, 
                        backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', 
                        color: '#ffffff' 
                      }}
                    >
                      {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {ep && <div style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', marginBottom: '16px', color: '#000000' }}>{selectedState}: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}</div>}

                  {/* Upsell Section */}
                  <div style={{ backgroundColor: '#fffbeb', border: '2px solid #000000', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#000000' }}>Welcome Page Upsell (uses State News voice)</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={handleGenerateUpsell} 
                        disabled={generatingUpsell || !s.narratorName || !s.voiceId} 
                        style={{ 
                          ...btnStyle, 
                          flex: 1, 
                          backgroundColor: (generatingUpsell || !s.narratorName || !s.voiceId) ? '#cccccc' : (stateUpsell.exists ? '#10b981' : '#dc2626'), 
                          color: '#ffffff' 
                        }}
                      >
                        {generatingUpsell ? <><Spinner /> Generating...</> : stateUpsell.exists ? '✅ Regenerate' : '⚠️ Generate Upsell'}
                      </button>
                      <button 
                        onClick={() => { 
                          if (playingUpsell) { 
                            if (audioRef.current) audioRef.current.pause(); 
                            setPlayingUpsell(false); 
                            setPlaying(null); 
                          } else if (stateUpsell.audioUrl) { 
                            handlePlay('upsell', stateUpsell.audioUrl); 
                            setPlayingUpsell(true); 
                          } 
                        }} 
                        disabled={!stateUpsell.audioUrl} 
                        style={{ 
                          ...btnStyle, 
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
                <>
                  {/* Generate + Play for other categories */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button 
                      onClick={() => handleGenerate(cat.id)} 
                      disabled={isGenerating || !s.narratorName || !s.voiceId} 
                      style={{ 
                        ...btnStyle, 
                        flex: 1, 
                        backgroundColor: (isGenerating || !s.narratorName || !s.voiceId) ? '#cccccc' : cat.color, 
                        color: cat.id === 'world' ? '#000000' : '#ffffff' 
                      }}
                    >
                      {isGenerating ? <><Spinner /> Generating...</> : '🎬 Generate'}
                    </button>
                    <button 
                      onClick={() => handlePlay(cat.id)} 
                      disabled={!ep?.audioUrl} 
                      style={{ 
                        ...btnStyle, 
                        flex: 1, 
                        backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', 
                        color: '#ffffff' 
                      }}
                    >
                      {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                    </button>
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
