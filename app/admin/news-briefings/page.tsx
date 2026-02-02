// app/admin/news-briefings/page.tsx
// DTT News Briefings - Admin Page
// Version 2.5 - February 2026
//
// Features:
// - White background, ALL BLACK text
// - Settings persist via API route (service role)
// - Test Voice button on each card
// - State dropdown to select/generate specific state news
// - Edit Prompt button for each category

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Category configuration (DO NOT CHANGE COLORS)
const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
];

// All US States
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

interface CategorySettings {
  narratorName: string;
  voiceId: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
}

interface EpisodeInfo {
  audioUrl: string;
  createdAt: string;
  duration?: string;
}

export default function NewsBriefingsAdmin() {
  const router = useRouter();
  
  const [settings, setSettings] = useState<Record<string, CategorySettings>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, EpisodeInfo>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [stateUpsellExists, setStateUpsellExists] = useState(false);
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  const [selectedState, setSelectedState] = useState('South Carolina');
  const [subscriberStates, setSubscriberStates] = useState<string[]>([]);
  
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [timeSlot1, setTimeSlot1] = useState('06:00');
  const [timeSlot2, setTimeSlot2] = useState('12:00');
  const [timeSlot3, setTimeSlot3] = useState('18:00');
  
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Load voices
  useEffect(() => {
    async function loadVoices() {
      try {
        const response = await fetch('/api/elevenlabs/voices');
        if (response.ok) {
          const data = await response.json();
          setVoices(data.voices || []);
        }
      } catch (error) {
        console.error('Failed to load voices:', error);
      } finally {
        setLoadingVoices(false);
      }
    }
    loadVoices();
  }, []);

  // Load settings from API
  useEffect(() => {
    async function loadSettings() {
      try {
        console.log('[Admin] Loading settings from API...');
        const response = await fetch('/api/admin/news-settings');
        
        if (!response.ok) {
          console.error('Failed to load settings');
          setSettingsLoaded(true);
          return;
        }

        const data = await response.json();
        const loaded: Record<string, CategorySettings> = {};
        let loadedAutoGenerate = false;
        let loadedTimes = ['06:00', '12:00', '18:00'];

        for (const row of data.settings || []) {
          console.log(`[Admin] Loaded ${row.category}: narrator="${row.narrator_name}", voice="${row.voice_id}"`);
          loaded[row.category] = {
            narratorName: row.narrator_name || '',
            voiceId: row.voice_id || ''
          };
          if (row.auto_generate !== undefined) loadedAutoGenerate = row.auto_generate;
          if (row.schedule_times?.length === 3) loadedTimes = row.schedule_times;
        }

        // Initialize empty settings for categories not in DB
        for (const cat of CATEGORIES) {
          if (!loaded[cat.id]) {
            loaded[cat.id] = { narratorName: '', voiceId: '' };
          }
        }

        setSettings(loaded);
        setAutoGenerate(loadedAutoGenerate);
        setTimeSlot1(loadedTimes[0]);
        setTimeSlot2(loadedTimes[1]);
        setTimeSlot3(loadedTimes[2]);
        setSettingsLoaded(true);
        console.log('[Admin] Settings loaded successfully');
      } catch (error) {
        console.error('Failed to load settings:', error);
        setSettingsLoaded(true);
      }
    }
    loadSettings();
  }, []);

  // Load episodes and subscriber states
  useEffect(() => {
    async function loadEpisodes() {
      try {
        const response = await fetch('/api/news/briefing?listAll=true');
        if (response.ok) {
          const data = await response.json();
          const loaded: Record<string, EpisodeInfo> = {};
          let upsellExists = false;
          const states: string[] = [];

          for (const ep of data.episodes || []) {
            if (ep.category === 'state-upsell') {
              upsellExists = true;
              continue;
            }
            if (ep.category === 'state' && ep.state) {
              if (!states.includes(ep.state)) {
                states.push(ep.state);
              }
            }
            const key = ep.state ? `${ep.category}-${ep.state}` : ep.category;
            loaded[key] = {
              audioUrl: ep.audio_url,
              createdAt: ep.created_at
            };
          }

          setEpisodes(loaded);
          setStateUpsellExists(upsellExists);
          setSubscriberStates(states);
        }
      } catch (error) {
        console.error('Failed to load episodes:', error);
      }
    }
    loadEpisodes();
  }, []);

  // Save settings via API
  const saveSettingsToDb = useCallback(async (category: string, narratorName: string, voiceId: string) => {
    try {
      console.log(`[Admin] Saving ${category}: narrator="${narratorName}", voice="${voiceId}"`);
      
      const response = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          narrator_name: narratorName,
          voice_id: voiceId,
          auto_generate: autoGenerate,
          schedule_times: [timeSlot1, timeSlot2, timeSlot3]
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        console.error('Failed to save settings:', data.error);
        alert('Failed to save settings: ' + data.error);
      } else {
        console.log(`[Admin] Saved ${category} successfully`);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  }, [autoGenerate, timeSlot1, timeSlot2, timeSlot3]);

  // Save auto-generation settings
  async function saveAutoSettings() {
    for (const cat of CATEGORIES) {
      const catSettings = settings[cat.id] || { narratorName: '', voiceId: '' };
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat.id,
          narrator_name: catSettings.narratorName,
          voice_id: catSettings.voiceId,
          auto_generate: autoGenerate,
          schedule_times: [timeSlot1, timeSlot2, timeSlot3]
        })
      });
    }
  }

  // Update narrator name
  function handleNarratorChange(category: string, value: string) {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], narratorName: value }
    };
    setSettings(newSettings);
  }

  // Save narrator on blur
  function handleNarratorBlur(category: string) {
    const catSettings = settings[category];
    if (catSettings) {
      saveSettingsToDb(category, catSettings.narratorName, catSettings.voiceId);
    }
  }

  // Update voice (save immediately)
  function handleVoiceChange(category: string, value: string) {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], voiceId: value }
    };
    setSettings(newSettings);
    saveSettingsToDb(category, newSettings[category].narratorName, value);
  }

  // Test voice
  async function testVoice(voiceId: string, narratorName: string) {
    if (!voiceId) {
      alert('Please select a voice first');
      return;
    }

    try {
      // Use the API to generate test audio
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
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      } else {
        alert('Voice test failed. Please try again.');
      }
    } catch (error) {
      alert('Voice test failed.');
    }
  }

  // Generate briefing
  async function handleGenerate(category: string, state?: string) {
    const catSettings = settings[category];
    if (!catSettings?.narratorName || !catSettings?.voiceId) {
      alert('Please set narrator name and voice first.');
      return;
    }

    const key = state ? `${category}-generating` : category;
    setGenerating(prev => ({ ...prev, [key]: true }));

    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, state })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const episodeKey = state ? `${category}-${state}` : category;
        setEpisodes(prev => ({
          ...prev,
          [episodeKey]: {
            audioUrl: data.episode.audioUrl,
            createdAt: data.episode.createdAt,
            duration: data.episode.duration
          }
        }));
        alert(`✅ Generated! Duration: ${data.episode.duration} min`);
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      alert('Generation failed. Check console.');
    } finally {
      setGenerating(prev => ({ ...prev, [key]: false }));
    }
  }

  // Generate State Upsell
  async function handleGenerateUpsell() {
    const stateSettings = settings['state'];
    if (!stateSettings?.narratorName || !stateSettings?.voiceId) {
      alert('Please set State News narrator and voice first.');
      return;
    }

    setGeneratingUpsell(true);

    try {
      const response = await fetch('/api/news/state-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narratorName: stateSettings.narratorName,
          voiceId: stateSettings.voiceId
        })
      });

      const data = await response.json();

      if (response.ok && data.audioUrl) {
        setStateUpsellExists(true);
        alert('✅ State Upsell generated successfully!');
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      alert('Generation failed.');
    } finally {
      setGeneratingUpsell(false);
    }
  }

  // Play/stop audio
  function handlePlay(category: string, state?: string) {
    const key = state ? `${category}-${state}` : category;
    const episode = episodes[key];
    if (!episode?.audioUrl) return;

    if (playing && playing !== key) {
      const prevAudio = audioRefs.current[playing];
      if (prevAudio) {
        prevAudio.pause();
        prevAudio.currentTime = 0;
      }
    }

    let audio = audioRefs.current[key];
    
    if (!audio) {
      audio = new Audio(episode.audioUrl);
      audioRefs.current[key] = audio;
      audio.onended = () => setPlaying(null);
    }

    if (playing === key) {
      audio.pause();
      setPlaying(null);
    } else {
      audio.play();
      setPlaying(key);
    }
  }

  // Format time
  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' EST';
  }

  // Show loading while settings load
  if (!settingsLoaded) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#ffffff', 
        color: '#000000',
        padding: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#ffffff', 
      color: '#000000',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', borderBottom: '3px solid #000000', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px', color: '#000000' }}>
          🎙️ News Briefings Admin
        </h1>
        <p style={{ color: '#000000', fontSize: '16px' }}>
          Configure narrators, voices, and prompts for each news category. Settings are saved automatically and persist permanently.
        </p>
      </div>

      {/* Auto-Generation Settings */}
      <div style={{
        backgroundColor: '#f5f5f5',
        border: '2px solid #000000',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>⏰ Auto-Generation</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span style={{ color: '#000000', fontWeight: 'bold', fontSize: '16px' }}>{autoGenerate ? 'ON' : 'OFF'}</span>
            <div
              onClick={() => {
                const newValue = !autoGenerate;
                setAutoGenerate(newValue);
                setTimeout(saveAutoSettings, 100);
              }}
              style={{
                width: '50px',
                height: '26px',
                backgroundColor: autoGenerate ? '#16a34a' : '#666666',
                borderRadius: '13px',
                position: 'relative',
                cursor: 'pointer',
                border: '2px solid #000000'
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                backgroundColor: 'white',
                borderRadius: '50%',
                position: 'absolute',
                top: '1px',
                left: autoGenerate ? '26px' : '1px',
                transition: 'left 0.2s',
                border: '1px solid #000000'
              }} />
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', opacity: autoGenerate ? 1 : 0.5 }}>
          {[
            { label: 'Slot 1', value: timeSlot1, set: setTimeSlot1 },
            { label: 'Slot 2', value: timeSlot2, set: setTimeSlot2 },
            { label: 'Slot 3', value: timeSlot3, set: setTimeSlot3 }
          ].map(slot => (
            <div key={slot.label}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '16px', color: '#000000', fontWeight: 'bold' }}>{slot.label}</label>
              <input
                type="time"
                value={slot.value}
                onChange={(e) => { slot.set(e.target.value); setTimeout(saveAutoSettings, 100); }}
                disabled={!autoGenerate}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: '2px solid #000000',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '16px'
                }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'flex-end', fontSize: '16px', color: '#000000', fontWeight: 'bold' }}>
            (EST timezone)
          </div>
        </div>
      </div>

      {/* Category Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
        gap: '20px'
      }}>
        {CATEGORIES.map((cat) => {
          const catSettings = settings[cat.id] || { narratorName: '', voiceId: '' };
          const episode = episodes[cat.id];
          const isGenerating = generating[cat.id];
          const isPlaying = playing === cat.id;
          
          // For state, check selected state episode
          const stateEpisode = cat.id === 'state' ? episodes[`state-${selectedState}`] : null;
          const isStateGenerating = cat.id === 'state' ? generating['state-generating'] : false;
          const isStatePlaying = cat.id === 'state' ? playing === `state-${selectedState}` : false;

          return (
            <div
              key={cat.id}
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #000000',
                borderRadius: '12px',
                padding: '20px',
                borderTop: `6px solid ${cat.color}`
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '28px' }}>{cat.icon}</span>
                <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: '#000000' }}>{cat.label}</h3>
              </div>

              {/* Narrator Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>
                  Narrator Name
                </label>
                <input
                  type="text"
                  value={catSettings.narratorName}
                  onChange={(e) => handleNarratorChange(cat.id, e.target.value)}
                  onBlur={() => handleNarratorBlur(cat.id)}
                  placeholder="e.g., Sarah Mitchell"
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    border: '2px solid #000000',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '16px'
                  }}
                />
              </div>

              {/* Voice + Test */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>
                  Voice
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={catSettings.voiceId}
                    onChange={(e) => handleVoiceChange(cat.id, e.target.value)}
                    disabled={loadingVoices}
                    style={{
                      flex: 1,
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      border: '2px solid #000000',
                      borderRadius: '6px',
                      padding: '12px',
                      fontSize: '16px'
                    }}
                  >
                    <option value="">{loadingVoices ? 'Loading voices...' : 'Select voice'}</option>
                    {voices.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => testVoice(catSettings.voiceId, catSettings.narratorName)}
                    disabled={!catSettings.voiceId}
                    style={{
                      backgroundColor: catSettings.voiceId ? '#3b82f6' : '#cccccc',
                      color: '#ffffff',
                      border: '2px solid #000000',
                      borderRadius: '6px',
                      padding: '12px 20px',
                      cursor: catSettings.voiceId ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold',
                      fontSize: '16px'
                    }}
                  >
                    🔊 Test Voice
                  </button>
                </div>
              </div>

              {/* Edit Prompt Button */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    border: '2px solid #000000',
                    borderRadius: '6px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}
                >
                  📝 Edit Prompt
                </button>
              </div>

              {/* State-specific controls */}
              {cat.id === 'state' && (
                <>
                  {/* State Dropdown */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>
                      Select State to Generate/Preview
                    </label>
                    <select
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        border: '2px solid #000000',
                        borderRadius: '6px',
                        padding: '12px',
                        fontSize: '16px'
                      }}
                    >
                      {US_STATES.map(state => (
                        <option key={state} value={state}>
                          {state} {subscriberStates.includes(state) ? '(has subscribers)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Generate/Play for selected state */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button
                      onClick={() => handleGenerate('state', selectedState)}
                      disabled={isStateGenerating || !catSettings.narratorName || !catSettings.voiceId}
                      style={{
                        flex: 1,
                        backgroundColor: (isStateGenerating || !catSettings.narratorName || !catSettings.voiceId) ? '#cccccc' : cat.color,
                        color: '#ffffff',
                        border: '2px solid #000000',
                        borderRadius: '6px',
                        padding: '14px 16px',
                        fontWeight: 'bold',
                        cursor: (isStateGenerating || !catSettings.narratorName || !catSettings.voiceId) ? 'not-allowed' : 'pointer',
                        fontSize: '16px'
                      }}
                    >
                      {isStateGenerating ? '⏳ Generating...' : `🎬 Generate ${selectedState}`}
                    </button>
                    <button
                      onClick={() => handlePlay('state', selectedState)}
                      disabled={!stateEpisode?.audioUrl}
                      style={{
                        flex: 1,
                        backgroundColor: stateEpisode?.audioUrl ? (isStatePlaying ? '#dc2626' : '#10b981') : '#cccccc',
                        color: '#ffffff',
                        border: '2px solid #000000',
                        borderRadius: '6px',
                        padding: '14px 16px',
                        fontWeight: 'bold',
                        cursor: stateEpisode?.audioUrl ? 'pointer' : 'not-allowed',
                        fontSize: '16px'
                      }}
                    >
                      {isStatePlaying ? '⏹️ Stop' : '▶️ Play'}
                    </button>
                  </div>

                  {/* State episode status */}
                  {stateEpisode && (
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#000000',
                      fontWeight: 'bold',
                      backgroundColor: '#f5f5f5',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #000000',
                      marginBottom: '16px'
                    }}>
                      {selectedState} last generated: {formatTime(stateEpisode.createdAt)}
                    </div>
                  )}

                  {/* Upsell Section */}
                  <div style={{ 
                    backgroundColor: '#fffbeb', 
                    border: '2px solid #000000',
                    borderRadius: '8px', 
                    padding: '12px',
                    marginBottom: '16px'
                  }}>
                    <p style={{ fontSize: '14px', color: '#000000', marginBottom: '10px', fontWeight: 'bold' }}>
                      Welcome Page Upsell: This message plays when non-subscribers click State News.
                    </p>
                    <button
                      onClick={handleGenerateUpsell}
                      disabled={generatingUpsell || !catSettings.narratorName || !catSettings.voiceId}
                      style={{
                        width: '100%',
                        backgroundColor: (generatingUpsell || !catSettings.narratorName || !catSettings.voiceId) ? '#cccccc' : (stateUpsellExists ? '#10b981' : '#dc2626'),
                        color: '#ffffff',
                        border: '2px solid #000000',
                        borderRadius: '6px',
                        padding: '14px 16px',
                        cursor: (generatingUpsell || !catSettings.narratorName || !catSettings.voiceId) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}
                    >
                      {generatingUpsell ? '⏳ Generating Upsell...' : 
                       stateUpsellExists ? '✅ Upsell Ready (Click to Regenerate)' : 
                       '⚠️ Generate State Upsell'}
                    </button>
                  </div>
                </>
              )}

              {/* Generate + Play Buttons (NOT for State - state has its own above) */}
              {cat.id !== 'state' && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <button
                    onClick={() => handleGenerate(cat.id)}
                    disabled={isGenerating || !catSettings.narratorName || !catSettings.voiceId}
                    style={{
                      flex: 1,
                      backgroundColor: (isGenerating || !catSettings.narratorName || !catSettings.voiceId) ? '#cccccc' : cat.color,
                      color: (cat.id === 'world') ? '#000000' : '#ffffff',
                      border: '2px solid #000000',
                      borderRadius: '6px',
                      padding: '14px 16px',
                      fontWeight: 'bold',
                      cursor: (isGenerating || !catSettings.narratorName || !catSettings.voiceId) ? 'not-allowed' : 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    {isGenerating ? '⏳ Generating...' : '🎬 Generate'}
                  </button>
                  <button
                    onClick={() => handlePlay(cat.id)}
                    disabled={!episode?.audioUrl}
                    style={{
                      flex: 1,
                      backgroundColor: episode?.audioUrl ? (isPlaying ? '#dc2626' : '#10b981') : '#cccccc',
                      color: '#ffffff',
                      border: '2px solid #000000',
                      borderRadius: '6px',
                      padding: '14px 16px',
                      fontWeight: 'bold',
                      cursor: episode?.audioUrl ? 'pointer' : 'not-allowed',
                      fontSize: '16px'
                    }}
                  >
                    {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                  </button>
                </div>
              )}

              {/* Status (for non-state categories) */}
              {cat.id !== 'state' && episode && (
                <div style={{ 
                  fontSize: '14px', 
                  color: '#000000',
                  fontWeight: 'bold',
                  backgroundColor: '#f5f5f5',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #000000'
                }}>
                  Last generated: {formatTime(episode.createdAt)}
                  {episode.duration && ` • ${episode.duration} min`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
