// app/admin/news-briefings/page.tsx
// DTT News Briefings - Admin Page
// Version 2.1 - February 2026
//
// Features:
// - 6 category cards with narrator/voice settings
// - State Upsell generation button (on State card only)
// - Prompt Editor button for each category
// - Auto-generation toggle with time slots
// - No duration dropdown (moved to prompt editor)

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Category configuration (DO NOT CHANGE COLORS)
const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
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
  const [episodes, setEpisodes] = useState<Record<string, EpisodeInfo>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [stateUpsellExists, setStateUpsellExists] = useState(false);
  const [generatingUpsell, setGeneratingUpsell] = useState(false);
  
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

  // Load settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('news_settings').select('*');
        
        if (error) return;

        const loaded: Record<string, CategorySettings> = {};
        let loadedAutoGenerate = false;
        let loadedTimes = ['06:00', '12:00', '18:00'];

        for (const row of data || []) {
          loaded[row.category] = {
            narratorName: row.narrator_name || '',
            voiceId: row.voice_id || ''
          };
          if (row.auto_generate !== undefined) loadedAutoGenerate = row.auto_generate;
          if (row.schedule_times?.length === 3) loadedTimes = row.schedule_times;
        }

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
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    loadSettings();
  }, []);

  // Load episodes
  useEffect(() => {
    async function loadEpisodes() {
      try {
        const { data, error } = await supabase
          .from('news_episodes')
          .select('*')
          .eq('is_live', true);
        
        if (error) return;

        const loaded: Record<string, EpisodeInfo> = {};
        let upsellExists = false;

        for (const ep of data || []) {
          if (ep.category === 'state-upsell') {
            upsellExists = true;
            continue;
          }
          const key = ep.state ? `${ep.category}-${ep.state}` : ep.category;
          loaded[key] = {
            audioUrl: ep.audio_url,
            createdAt: ep.created_at
          };
        }

        setEpisodes(loaded);
        setStateUpsellExists(upsellExists);
      } catch (error) {
        console.error('Failed to load episodes:', error);
      }
    }
    loadEpisodes();
  }, []);

  // Save settings
  async function saveSettings(category: string, newSettings: CategorySettings) {
    try {
      await supabase.from('news_settings').upsert({
        category,
        narrator_name: newSettings.narratorName,
        voice_id: newSettings.voiceId,
        auto_generate: autoGenerate,
        schedule_times: [timeSlot1, timeSlot2, timeSlot3]
      }, { onConflict: 'category' });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // Save auto-generation settings
  async function saveAutoSettings() {
    for (const cat of CATEGORIES) {
      await supabase.from('news_settings').upsert({
        category: cat.id,
        narrator_name: settings[cat.id]?.narratorName || '',
        voice_id: settings[cat.id]?.voiceId || '',
        auto_generate: autoGenerate,
        schedule_times: [timeSlot1, timeSlot2, timeSlot3]
      }, { onConflict: 'category' });
    }
  }

  // Update setting
  function updateSetting(category: string, field: keyof CategorySettings, value: string) {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], [field]: value }
    };
    setSettings(newSettings);
    saveSettings(category, newSettings[category]);
  }

  // Test voice
  async function testVoice(voiceId: string, narratorName: string) {
    if (!voiceId) {
      alert('Please select a voice first');
      return;
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || ''
        },
        body: JSON.stringify({
          text: `Hello, I'm ${narratorName || 'your news broadcaster'}. This is a voice test for Drive Time Tales.`,
          model_id: 'eleven_multilingual_v2'
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      } else {
        alert('Voice test failed. Check API key.');
      }
    } catch (error) {
      alert('Voice test failed.');
    }
  }

  // Generate briefing
  async function handleGenerate(category: string) {
    const catSettings = settings[category];
    if (!catSettings?.narratorName || !catSettings?.voiceId) {
      alert('Please set narrator name and voice first.');
      return;
    }

    setGenerating(prev => ({ ...prev, [category]: true }));

    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEpisodes(prev => ({
          ...prev,
          [category]: {
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
      setGenerating(prev => ({ ...prev, [category]: false }));
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
  function handlePlay(category: string) {
    const episode = episodes[category];
    if (!episode?.audioUrl) return;

    if (playing && playing !== category) {
      const prevAudio = audioRefs.current[playing];
      if (prevAudio) {
        prevAudio.pause();
        prevAudio.currentTime = 0;
      }
    }

    let audio = audioRefs.current[category];
    
    if (!audio) {
      audio = new Audio(episode.audioUrl);
      audioRefs.current[category] = audio;
      audio.onended = () => setPlaying(null);
    }

    if (playing === category) {
      audio.pause();
      setPlaying(null);
    } else {
      audio.play();
      setPlaying(category);
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

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#020617', 
      color: 'white',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
          🎙️ News Briefings Admin
        </h1>
        <p style={{ opacity: 0.8 }}>
          Configure narrators, voices, and prompts for each news category
        </p>
      </div>

      {/* Auto-Generation Settings */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>⏰ Auto-Generation</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span>{autoGenerate ? 'ON' : 'OFF'}</span>
            <div
              onClick={() => {
                setAutoGenerate(!autoGenerate);
                setTimeout(saveAutoSettings, 100);
              }}
              style={{
                width: '48px',
                height: '24px',
                backgroundColor: autoGenerate ? '#16a34a' : '#475569',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                backgroundColor: 'white',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: autoGenerate ? '26px' : '2px',
                transition: 'left 0.2s'
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
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>{slot.label}</label>
              <input
                type="time"
                value={slot.value}
                onChange={(e) => { slot.set(e.target.value); setTimeout(saveAutoSettings, 100); }}
                disabled={!autoGenerate}
                style={{
                  backgroundColor: '#334155',
                  color: 'white',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  padding: '8px 12px'
                }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'flex-end', fontSize: '14px', opacity: 0.7 }}>
            (EST timezone)
          </div>
        </div>
      </div>

      {/* Category Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: '20px'
      }}>
        {CATEGORIES.map((cat) => {
          const catSettings = settings[cat.id] || { narratorName: '', voiceId: '' };
          const episode = episodes[cat.id];
          const isGenerating = generating[cat.id];
          const isPlaying = playing === cat.id;

          return (
            <div
              key={cat.id}
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                padding: '20px',
                borderLeft: `4px solid ${cat.color}`
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: cat.color }}>{cat.label}</h3>
              </div>

              {/* Narrator Name */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Narrator Name</label>
                <input
                  type="text"
                  value={catSettings.narratorName}
                  onChange={(e) => updateSetting(cat.id, 'narratorName', e.target.value)}
                  placeholder="e.g., Sarah Mitchell"
                  style={{
                    width: '100%',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '8px 12px'
                  }}
                />
              </div>

              {/* Voice + Test */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Voice</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={catSettings.voiceId}
                    onChange={(e) => updateSetting(cat.id, 'voiceId', e.target.value)}
                    disabled={loadingVoices}
                    style={{
                      flex: 1,
                      backgroundColor: '#334155',
                      color: 'white',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: '8px 12px'
                    }}
                  >
                    <option value="">{loadingVoices ? 'Loading...' : 'Select voice'}</option>
                    {voices.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => testVoice(catSettings.voiceId, catSettings.narratorName)}
                    disabled={!catSettings.voiceId}
                    style={{
                      backgroundColor: '#475569',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: catSettings.voiceId ? 'pointer' : 'not-allowed',
                      opacity: catSettings.voiceId ? 1 : 0.5
                    }}
                  >
                    🔊 Test
                  </button>
                </div>
              </div>

              {/* Action Buttons Row 1: Edit Prompt */}
              <div style={{ marginBottom: '12px' }}>
                <button
                  onClick={() => router.push(`/admin/news-briefings/prompts/${cat.id}`)}
                  style={{
                    width: '100%',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  📝 Edit Prompt
                </button>
              </div>

              {/* Action Buttons Row 2: Generate + Play */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <button
                  onClick={() => handleGenerate(cat.id)}
                  disabled={isGenerating || !catSettings.narratorName || !catSettings.voiceId}
                  style={{
                    flex: 1,
                    backgroundColor: isGenerating ? '#475569' : cat.color,
                    color: cat.id === 'world' ? 'black' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 16px',
                    fontWeight: 'bold',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    opacity: (!catSettings.narratorName || !catSettings.voiceId) ? 0.5 : 1
                  }}
                >
                  {isGenerating ? '⏳ Generating...' : '🎬 Generate'}
                </button>
                <button
                  onClick={() => handlePlay(cat.id)}
                  disabled={!episode?.audioUrl}
                  style={{
                    flex: 1,
                    backgroundColor: episode?.audioUrl ? (isPlaying ? '#dc2626' : '#475569') : '#1e293b',
                    color: 'white',
                    border: episode?.audioUrl ? 'none' : '1px solid #475569',
                    borderRadius: '6px',
                    padding: '10px 16px',
                    fontWeight: 'bold',
                    cursor: episode?.audioUrl ? 'pointer' : 'not-allowed',
                    opacity: episode?.audioUrl ? 1 : 0.5
                  }}
                >
                  {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                </button>
              </div>

              {/* State Upsell Button (State card only) */}
              {cat.id === 'state' && (
                <div style={{ marginBottom: '12px' }}>
                  <button
                    onClick={handleGenerateUpsell}
                    disabled={generatingUpsell || !catSettings.narratorName || !catSettings.voiceId}
                    style={{
                      width: '100%',
                      backgroundColor: stateUpsellExists ? '#334155' : '#dc2626',
                      color: 'white',
                      border: stateUpsellExists ? '1px solid #475569' : 'none',
                      borderRadius: '6px',
                      padding: '10px 16px',
                      cursor: generatingUpsell ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {generatingUpsell ? '⏳ Generating Upsell...' : 
                     stateUpsellExists ? '✅ Upsell Generated (Click to Regenerate)' : 
                     '⚠️ Generate State Upsell'}
                  </button>
                </div>
              )}

              {/* Status */}
              {episode && (
                <div style={{ fontSize: '12px', opacity: 0.7 }}>
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
