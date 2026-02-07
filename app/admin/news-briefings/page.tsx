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

const DEFAULT_UPSELL_SCRIPT = `Hi and welcome to Drive Time Tales! I'm [narrator name], and I'll be bringing you personalized news for your state, delivered fresh every day. State news is a subscriber benefit, so sign up for a free trial to get your local headlines. In the meantime, enjoy our national, world, business, sports, and science and technology briefings — they're all free to listen to right now. I look forward to welcoming you back once you've joined us on Drive Time Tales!`;

function Spinner({ color = '#ffffff' }: { color?: string }) {
  return (<span style={{ display: 'inline-block', width: '18px', height: '18px', border: `3px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '8px', verticalAlign: 'middle' }} />);
}

const spinnerStyles = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

interface Voice { voice_id: string; name: string; }
interface Settings { narratorName: string; voiceId: string; upsellScript?: string; }
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
  const [upsellScript, setUpsellScript] = useState(DEFAULT_UPSELL_SCRIPT);
  const [upsellScriptDirty, setUpsellScriptDirty] = useState(false);
  const [savingUpsellScript, setSavingUpsellScript] = useState(false);
  const [upsellNeedsRegenerate, setUpsellNeedsRegenerate] = useState(false);
  const [lastGeneratedWith, setLastGeneratedWith] = useState<{ narratorName: string; voiceId: string; script: string } | null>(null);
  const [autoGenerateEnabled, setAutoGenerateEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['06:00', '12:00', '18:00']);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { fetch('/api/elevenlabs/voices').then(r => r.ok ? r.json() : { voices: [] }).then(d => setVoices(d.voices || [])).catch(() => setVoices([])).finally(() => setLoadingVoices(false)); }, []);

  useEffect(() => {
    fetch('/api/admin/news-settings').then(r => r.ok ? r.json() : { settings: [] }).then(data => {
      const loaded: Record<string, Settings> = {};
      for (const row of data.settings || []) {
        loaded[row.category] = { narratorName: row.narrator_name || '', voiceId: row.voice_id || '', upsellScript: row.upsell_script || '' };
        if (row.category === 'state') {
          if (row.upsell_script) setUpsellScript(row.upsell_script);
          if (row.upsell_audio_url) {
            setStateUpsell({ exists: true, audioUrl: row.upsell_audio_url });
            setLastGeneratedWith({ narratorName: row.narrator_name || '', voiceId: row.voice_id || '', script: row.upsell_script || DEFAULT_UPSELL_SCRIPT });
          }
        }
      }
      // Load global auto-generate settings
      const globalRow = (data.settings || []).find((r: any) => r.category === 'global');
      if (globalRow) {
        if (globalRow.auto_generate !== undefined) setAutoGenerateEnabled(globalRow.auto_generate);
        if (globalRow.schedule_times) setScheduleTimes(globalRow.schedule_times);
      }
      for (const cat of CATEGORIES) { if (!loaded[cat.id]) loaded[cat.id] = { narratorName: '', voiceId: '' }; }
      setSettings(loaded);
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (lastGeneratedWith && settings['state']) {
      const s = settings['state'];
      setUpsellNeedsRegenerate(s.narratorName !== lastGeneratedWith.narratorName || s.voiceId !== lastGeneratedWith.voiceId || upsellScript !== lastGeneratedWith.script);
    }
  }, [settings, upsellScript, lastGeneratedWith]);

  useEffect(() => { fetch('/api/admin/subscriber-states').then(r => r.ok ? r.json() : { states: [] }).then(d => { setSubscriberStates(d.states || []); if (d.states?.length > 0 && !selectedState) setSelectedState(d.states[0]); }).catch(() => {}); }, []);

  useEffect(() => {
    fetch('/api/admin/news-episodes').then(r => r.ok ? r.json() : { episodes: [] }).then(data => {
      const loaded: Record<string, Episode> = {};
      for (const ep of data.episodes || []) {
        const key = ep.category === 'state' ? `state-${ep.state}` : ep.category;
        if (!loaded[key] || new Date(ep.created_at) > new Date(loaded[key].createdAt)) { loaded[key] = { audioUrl: ep.audio_url, createdAt: ep.created_at, duration: ep.duration }; }
      }
      setEpisodes(loaded);
    }).catch(() => {});
  }, []);

  async function saveSettings(category: string, narratorName: string, voiceId: string) {
    try { await fetch('/api/admin/news-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, narratorName, voiceId }) }); } catch (error) { console.error('Save settings error:', error); }
  }

  async function saveUpsellScript() {
    setSavingUpsellScript(true);
    try { await fetch('/api/admin/news-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'state', upsellScript: upsellScript }) }); setUpsellScriptDirty(false); } catch (error) { console.error('Save upsell script error:', error); } finally { setSavingUpsellScript(false); }
  }

  async function saveAutoGenerateSettings(enabled: boolean, times: string[]) {
    try { 
      await fetch('/api/admin/news-settings', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ category: 'global', auto_generate: enabled, schedule_times: times }) 
      }); 
    } catch (error) { 
      console.error('Save auto-generate settings error:', error); 
    }
  }

  async function handleTestVoice(category: string, voiceId: string, narratorName: string) {
    if (!voiceId) return;
    setTestingVoice(p => ({ ...p, [category]: true }));
    try { const r = await fetch('/api/elevenlabs/test-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId, text: `Hi, I'm ${narratorName || 'your host'}. Welcome to Drive Time Tales!` }) }); const d = await r.json(); if (d.audioUrl) { const audio = new Audio(d.audioUrl); audio.play(); } } catch (error) { console.error('Test voice error:', error); } finally { setTestingVoice(p => ({ ...p, [category]: false })); }
  }

  async function handleGenerate(category: string) {
    const s = settings[category];
    if (!s || !s.narratorName) { alert('Please set a narrator name first.'); return; }
    const state = category === 'state' ? selectedState : null;
    const key = state ? `state-${state}` : category;
    setGenerating(p => ({ ...p, [key]: true }));
    try { 
      const r = await fetch('/api/admin/generate-news', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          category, 
          state,
          narratorName: s.narratorName,
          isPersonalized: true,
          firstName: 'Marc',
          toneStyle: 'warm, expressive, conversational - like a trusted friend giving you the news',
          durationMinutes: 2
        }) 
      }); 
      const d = await r.json(); 
      if (r.ok && d.success) { 
        // Script generated - now create audio
        const audioR = await fetch('/api/admin/generate-news-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            state,
            voiceId: s.voiceId,
            intro: d.script.intro,
            body: d.script.body,
            outro: d.script.outro
          })
        });
        const audioD = await audioR.json();
        if (audioR.ok && audioD.success) {
          setEpisodes(p => ({ ...p, [key]: { audioUrl: audioD.episode.audioUrl, createdAt: audioD.episode.createdAt, duration: audioD.episode.duration } }));
          
        } else {
          alert(`Audio generation failed: ${audioD.error || 'Unknown error'}`);
        }
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

  async function handleGenerateAll() {
    const categoriesToGenerate = CATEGORIES.filter(cat => {
      const s = settings[cat.id];
      return s && s.narratorName && s.voiceId;
    });
    
    if (categoriesToGenerate.length === 0) {
      alert('Please set narrator names and voices for at least one category first.');
      return;
    }

    setGeneratingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const cat of categoriesToGenerate) {
      const s = settings[cat.id];
      const state = cat.id === 'state' ? selectedState : null;
      if (cat.id === 'state' && !state) continue;
      
      try {
        const r = await fetch('/api/admin/generate-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: cat.id,
            state,
            narratorName: s.narratorName,
            isPersonalized: false,
            toneStyle: 'warm, expressive, conversational - like a trusted friend giving you the news',
            durationMinutes: 2
          })
        });
        const d = await r.json();
        if (r.ok && d.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setGeneratingAll(false);
    alert(`Generated ${successCount} briefings. ${failCount > 0 ? `${failCount} failed.` : ''}`);
  }

  async function handleGenerateUpsell() {
    const s = settings['state'];
    if (!s || !s.narratorName || !s.voiceId) { alert('Please set State News narrator and voice first.'); return; }
    const scriptWithName = upsellScript.replace(/\[narrator name\]/gi, s.narratorName);
    setGeneratingUpsell(true);
    try {
      const r = await fetch('/api/news/state-upsell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ narratorName: s.narratorName, voiceId: s.voiceId, scriptText: scriptWithName }) });
      const d = await r.json();
      if (r.ok && d.audioUrl) {
        setStateUpsell({ exists: true, audioUrl: d.audioUrl });
        setLastGeneratedWith({ narratorName: s.narratorName, voiceId: s.voiceId, script: upsellScript });
        setUpsellNeedsRegenerate(false);
        await fetch('/api/admin/news-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'state', upsellAudioUrl: d.audioUrl }) });
        alert('State Upsell generated successfully!');
      } else { alert(`Generation failed: ${d.error || 'Unknown error'}`); }
    } catch (error) { console.error('Upsell error:', error); alert('Generation failed.'); } finally { setGeneratingUpsell(false); }
  }

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

  function formatTime(iso: string): string { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }

  if (!settingsLoaded) { return (<div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><style>{spinnerStyles}</style><div style={{ textAlign: 'center' }}><Spinner color="#000000" /><p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', marginTop: '16px' }}>Loading settings...</p></div></div>); }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' };
  const selectStyle: React.CSSProperties = { padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', flex: 1, maxWidth: 'calc(100% - 120px)' };
  const btnStyle: React.CSSProperties = { padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <style>{spinnerStyles}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Link href="/admin" style={{ color: '#3b82f6', fontSize: '16px', textDecoration: 'none' }}>← Back to Admin</Link>
        <Link href="/admin/news-briefings/test-sources" style={{ padding: '10px 16px', backgroundColor: '#8b5cf6', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>🧪 Test Sources</Link>
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px', color: '#000000' }}>🎙️ News Briefings Admin</h1>
      <p style={{ marginBottom: '16px', fontSize: '16px', color: '#000000' }}>Configure narrators, voices, and prompts.</p>

      {/* Generate All & Auto-Generate Controls */}
      <div style={{ backgroundColor: '#f5f5f5', border: '2px solid #000000', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              onClick={handleGenerateAll} 
              disabled={true}
              style={{ ...btnStyle, backgroundColor: generatingAll ? '#cccccc' : '#10b981', color: '#ffffff', padding: '14px 24px' }}
            >
              {generatingAll ? <><Spinner /> Generating All...</> : '🚀 Generate All (Coming Soon)'}
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoGenerateEnabled}
                onChange={e => { 
                  const newEnabled = e.target.checked;
                  setAutoGenerateEnabled(newEnabled);
                  saveAutoGenerateSettings(newEnabled, scheduleTimes);
                }}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Auto-Generate</span>
            </label>
            
            {autoGenerateEnabled && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>Times (ET):</span>
                {scheduleTimes.map((time, i) => (
                  <input 
                    key={i}
                    type="time" 
                    value={time}
                    onChange={e => {
                      const newTimes = [...scheduleTimes];
                      newTimes[i] = e.target.value;
                      setScheduleTimes(newTimes);
                    }}
                    onBlur={() => saveAutoGenerateSettings(autoGenerateEnabled, scheduleTimes)}
                    style={{ padding: '6px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#ffffff', color: '#000000' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#000000', margin: 0 }}>{cat.icon} {cat.label}</h2><a href={`/admin/news-briefings/prompts/${cat.id}`} style={{ fontSize: '14px', color: '#3b82f6' }}>📝 Edit Prompt</a></div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Narrator Name</label>
              <input type="text" value={s.narratorName} onChange={e => setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], narratorName: e.target.value } }))} onBlur={() => saveSettings(cat.id, s.narratorName, s.voiceId)} placeholder="e.g., Sarah Mitchell" style={{ ...inputStyle, marginBottom: '16px' }} />
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Voice</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select value={s.voiceId} onChange={e => { const v = e.target.value; setSettings(p => ({ ...p, [cat.id]: { ...p[cat.id], voiceId: v } })); saveSettings(cat.id, s.narratorName, v); }} style={selectStyle}>
                  <option value="">{loadingVoices ? 'Loading voices...' : 'Select a voice'}</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
                <button onClick={() => handleTestVoice(cat.id, s.voiceId, s.narratorName)} disabled={!s.voiceId || isTestingVoice} style={{ ...btnStyle, backgroundColor: (!s.voiceId || isTestingVoice) ? '#cccccc' : '#3b82f6', color: '#ffffff', minWidth: '100px' }}>{isTestingVoice ? <><Spinner /> Testing</> : '🔊 Test'}</button>
              </div>

              {cat.id === 'state' ? (
                <>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>Subscriber States</label>
                  {subscriberStates.length > 0 ? (<select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ ...selectStyle, width: '100%', marginBottom: '16px' }}>{subscriberStates.map(st => <option key={st} value={st}>{st}</option>)}</select>) : (<p style={{ fontSize: '14px', color: '#666666', marginBottom: '16px' }}>No subscribers yet</p>)}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate(cat.id)} disabled={isGenerating || !s.narratorName || !s.voiceId || !selectedState} style={{ ...btnStyle, flex: 1, backgroundColor: (isGenerating || !s.narratorName || !s.voiceId || !selectedState) ? '#cccccc' : cat.color, color: '#ffffff' }}>{isGenerating ? <><Spinner /> Generating...</> : '🎬 Generate'}</button>
                    <button onClick={() => handlePlay(episodeKey)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff' }}>{isPlaying ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>
                  {ep && <div style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', marginBottom: '16px', color: '#000000' }}>{selectedState}: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}</div>}
                  <div style={{ backgroundColor: '#fffbeb', border: '2px solid #000000', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#000000' }}>Welcome Page Upsell Script</p>
                    <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Use [narrator name] - replaced with narrator name above.</p>
                    <textarea value={upsellScript} onChange={e => { setUpsellScript(e.target.value); setUpsellScriptDirty(true); }} onBlur={saveUpsellScript} style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', marginBottom: '10px', fontSize: '14px' }} />
                    {upsellScriptDirty && <p style={{ fontSize: '12px', color: '#f97316', marginBottom: '8px' }}>{savingUpsellScript ? 'Saving...' : 'Script changed - saves on blur'}</p>}
                    {upsellNeedsRegenerate && stateUpsell.exists && (<div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '8px', marginBottom: '10px' }}><p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>⚠️ Settings changed. Click Regenerate to update audio.</p></div>)}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={handleGenerateUpsell} disabled={generatingUpsell || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: (generatingUpsell || !s.narratorName || !s.voiceId) ? '#cccccc' : (upsellNeedsRegenerate ? '#f59e0b' : stateUpsell.exists ? '#10b981' : '#dc2626'), color: '#ffffff', fontSize: '14px', padding: '10px 16px' }}>{generatingUpsell ? <><Spinner /> Generating...</> : upsellNeedsRegenerate ? '🔄 Regenerate' : stateUpsell.exists ? '✅ Regenerate' : '⚠️ Generate Upsell'}</button>
                      <button onClick={() => { if (playingUpsell) { if (audioRef.current) audioRef.current.pause(); setPlayingUpsell(false); setPlaying(null); } else if (stateUpsell.audioUrl) { handlePlay('upsell', stateUpsell.audioUrl); setPlayingUpsell(true); } }} disabled={!stateUpsell.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: stateUpsell.audioUrl ? (playingUpsell ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff', fontSize: '14px', padding: '10px 16px' }}>{playingUpsell ? '⏹️ Stop' : '▶️ Play Upsell'}</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => handleGenerate(cat.id)} disabled={isGenerating || !s.narratorName || !s.voiceId} style={{ ...btnStyle, flex: 1, backgroundColor: (isGenerating || !s.narratorName || !s.voiceId) ? '#cccccc' : cat.color, color: cat.id === 'world' ? '#000000' : '#ffffff' }}>{isGenerating ? <><Spinner /> Generating...</> : '🎬 Generate'}</button>
                    <button onClick={() => handlePlay(cat.id)} disabled={!ep?.audioUrl} style={{ ...btnStyle, flex: 1, backgroundColor: ep?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc', color: '#ffffff' }}>{isPlaying ? '⏹️ Stop' : '▶️ Play'}</button>
                  </div>
                  {ep && <div style={{ fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '6px', color: '#000000', marginBottom: '16px' }}>Last: {formatTime(ep.createdAt)} {ep.duration ? `• ${ep.duration} min` : ''}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

