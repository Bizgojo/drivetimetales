// app/admin/news-briefings/page.tsx
// DTT News Briefings - Admin Page
// FRESH BUILD - February 2026
// FIXED: Use standard Supabase client

'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Category configuration with colors (DO NOT CHANGE COLORS)
const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
];

const DURATION_OPTIONS = [
  { value: '1-2', label: '1-2 min' },
  { value: '2-3', label: '2-3 min' },
  { value: '3-5', label: '3-5 min' },
  { value: '5-7', label: '5-7 min' },
  { value: '7-10', label: '7-10 min' }
];

interface CategorySettings {
  narratorName: string;
  voiceId: string;
  targetDuration: string;
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
  // State for each category's settings
  const [settings, setSettings] = useState<Record<string, CategorySettings>>({});
  const [episodes, setEpisodes] = useState<Record<string, EpisodeInfo>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  
  // ElevenLabs voices
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  
  // Auto-generation settings
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [timeSlot1, setTimeSlot1] = useState('06:00');
  const [timeSlot2, setTimeSlot2] = useState('12:00');
  const [timeSlot3, setTimeSlot3] = useState('18:00');
  
  // Audio refs
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Load voices from ElevenLabs
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

  // Load settings from database
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from('news_settings')
          .select('*');
        
        if (error) {
          console.error('Failed to load settings:', error);
          return;
        }

        const loadedSettings: Record<string, CategorySettings> = {};
        let loadedAutoGenerate = false;
        let loadedTimes = ['06:00', '12:00', '18:00'];

        for (const row of data || []) {
          loadedSettings[row.category] = {
            narratorName: row.narrator_name || '',
            voiceId: row.voice_id || '',
            targetDuration: row.target_duration || '3-5'
          };
          
          // Load auto-generate settings from any row (they should be the same)
          if (row.auto_generate !== undefined) {
            loadedAutoGenerate = row.auto_generate;
          }
          if (row.schedule_times && row.schedule_times.length === 3) {
            loadedTimes = row.schedule_times;
          }
        }

        // Initialize missing categories with defaults
        for (const cat of CATEGORIES) {
          if (!loadedSettings[cat.id]) {
            loadedSettings[cat.id] = {
              narratorName: '',
              voiceId: '',
              targetDuration: '3-5'
            };
          }
        }

        setSettings(loadedSettings);
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

  // Load latest episodes for each category
  useEffect(() => {
    async function loadEpisodes() {
      try {
        const { data, error } = await supabase
          .from('news_episodes')
          .select('*')
          .eq('is_live', true);
        
        if (error) {
          console.error('Failed to load episodes:', error);
          return;
        }

        const loadedEpisodes: Record<string, EpisodeInfo> = {};
        for (const ep of data || []) {
          const key = ep.state ? `${ep.category}-${ep.state}` : ep.category;
          loadedEpisodes[key] = {
            audioUrl: ep.audio_url,
            createdAt: ep.created_at
          };
        }
        setEpisodes(loadedEpisodes);
      } catch (error) {
        console.error('Failed to load episodes:', error);
      }
    }
    loadEpisodes();
  }, []);

  // Save settings to database
  async function saveSettings(category: string, newSettings: CategorySettings) {
    try {
      const { error } = await supabase
        .from('news_settings')
        .upsert({
          category,
          narrator_name: newSettings.narratorName,
          voice_id: newSettings.voiceId,
          target_duration: newSettings.targetDuration,
          auto_generate: autoGenerate,
          schedule_times: [timeSlot1, timeSlot2, timeSlot3]
        }, {
          onConflict: 'category'
        });

      if (error) {
        console.error('Failed to save settings:', error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // Save auto-generation settings
  async function saveAutoGenerateSettings() {
    try {
      // Update all categories with the auto-generate settings
      for (const cat of CATEGORIES) {
        await supabase
          .from('news_settings')
          .upsert({
            category: cat.id,
            narrator_name: settings[cat.id]?.narratorName || '',
            voice_id: settings[cat.id]?.voiceId || '',
            target_duration: settings[cat.id]?.targetDuration || '3-5',
            auto_generate: autoGenerate,
            schedule_times: [timeSlot1, timeSlot2, timeSlot3]
          }, {
            onConflict: 'category'
          });
      }
    } catch (error) {
      console.error('Failed to save auto-generate settings:', error);
    }
  }

  // Update setting for a category
  function updateSetting(category: string, field: keyof CategorySettings, value: string) {
    const newSettings = {
      ...settings,
      [category]: {
        ...settings[category],
        [field]: value
      }
    };
    setSettings(newSettings);
    saveSettings(category, newSettings[category]);
  }

  // Generate briefing for a category
  async function handleGenerate(category: string) {
    const catSettings = settings[category];
    if (!catSettings?.narratorName || !catSettings?.voiceId) {
      alert('Please set narrator name and voice before generating.');
      return;
    }

    setGenerating(prev => ({ ...prev, [category]: true }));

    try {
      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          narratorName: catSettings.narratorName,
          voiceId: catSettings.voiceId,
          targetDuration: catSettings.targetDuration,
          isPersonalized: false // Admin preview uses generic greeting
        })
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
        alert(`Generated successfully! Duration: ${data.episode.duration} minutes`);
      } else {
        alert(`Generation failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('Generation failed. Check console for details.');
    } finally {
      setGenerating(prev => ({ ...prev, [category]: false }));
    }
  }

  // Play/pause audio
  function handlePlay(category: string) {
    const episode = episodes[category];
    if (!episode?.audioUrl) return;

    // Stop any currently playing audio
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
      audio.onerror = () => {
        alert('Failed to play audio');
        setPlaying(null);
      };
    }

    if (playing === category) {
      audio.pause();
      setPlaying(null);
    } else {
      audio.play();
      setPlaying(category);
    }
  }

  // Format timestamp
  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
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
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 'bold', 
          marginBottom: '8px',
          color: 'white'
        }}>
          🎙️ News Briefings Admin
        </h1>
        <p style={{ color: 'white', opacity: 0.8 }}>
          Manage news generation settings and preview briefings
        </p>
      </div>

      {/* Auto-Generation Settings */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
            ⏰ Auto-Generation
          </h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span style={{ color: 'white' }}>{autoGenerate ? 'ON' : 'OFF'}</span>
            <div
              onClick={() => {
                setAutoGenerate(!autoGenerate);
                setTimeout(saveAutoGenerateSettings, 100);
              }}
              style={{
                width: '48px',
                height: '24px',
                backgroundColor: autoGenerate ? '#16a34a' : '#475569',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
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

        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          flexWrap: 'wrap',
          opacity: autoGenerate ? 1 : 0.5
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'white' }}>
              Time Slot 1
            </label>
            <input
              type="time"
              value={timeSlot1}
              onChange={(e) => {
                setTimeSlot1(e.target.value);
                setTimeout(saveAutoGenerateSettings, 100);
              }}
              disabled={!autoGenerate}
              style={{
                backgroundColor: '#334155',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'white' }}>
              Time Slot 2
            </label>
            <input
              type="time"
              value={timeSlot2}
              onChange={(e) => {
                setTimeSlot2(e.target.value);
                setTimeout(saveAutoGenerateSettings, 100);
              }}
              disabled={!autoGenerate}
              style={{
                backgroundColor: '#334155',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'white' }}>
              Time Slot 3
            </label>
            <input
              type="time"
              value={timeSlot3}
              onChange={(e) => {
                setTimeSlot3(e.target.value);
                setTimeout(saveAutoGenerateSettings, 100);
              }}
              disabled={!autoGenerate}
              style={{
                backgroundColor: '#334155',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-end',
            fontSize: '14px',
            color: 'white',
            opacity: 0.7
          }}>
            (EST timezone)
          </div>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
        gap: '20px'
      }}>
        {CATEGORIES.map((cat) => {
          const catSettings = settings[cat.id] || { narratorName: '', voiceId: '', targetDuration: '3-5' };
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
              {/* Category Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                marginBottom: '16px'
              }}>
                <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: 'bold',
                  color: cat.color
                }}>
                  {cat.label}
                </h3>
              </div>

              {/* Narrator Name */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '4px', 
                  fontSize: '14px',
                  color: 'white'
                }}>
                  Narrator Name
                </label>
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
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                />
              </div>

              {/* Voice Selection */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '4px', 
                  fontSize: '14px',
                  color: 'white'
                }}>
                  Voice
                </label>
                <select
                  value={catSettings.voiceId}
                  onChange={(e) => updateSetting(cat.id, 'voiceId', e.target.value)}
                  disabled={loadingVoices}
                  style={{
                    width: '100%',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">
                    {loadingVoices ? 'Loading voices...' : 'Select a voice'}
                  </option>
                  {voices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duration Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '4px', 
                  fontSize: '14px',
                  color: 'white'
                }}>
                  Duration
                </label>
                <select
                  value={catSettings.targetDuration}
                  onChange={(e) => updateSetting(cat.id, 'targetDuration', e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#334155',
                    color: 'white',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ 
                display: 'flex', 
                gap: '10px',
                marginBottom: '12px'
              }}>
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
                    fontSize: '14px',
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
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: episode?.audioUrl ? 'pointer' : 'not-allowed',
                    opacity: episode?.audioUrl ? 1 : 0.5
                  }}
                >
                  {isPlaying ? '⏹️ Stop' : '▶️ Play'}
                </button>
              </div>

              {/* Status */}
              {episode && (
                <div style={{ 
                  fontSize: '12px', 
                  color: 'white',
                  opacity: 0.7
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
