// components/Welcome_NewsBriefings.tsx
// DTT News Briefings - Welcome Page Component
// Version 2.1 - February 2026
//
// Features:
// - Generic greetings (no personalization)
// - State button plays upsell message
// - "State News" label (not abbreviation)

'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Category configuration (DO NOT CHANGE COLORS)
const CATEGORIES = [
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Sci/Tech', icon: '🔬', color: '#9333ea' }
];

interface NewsEpisode {
  audio_url?: string;
  audioUrl?: string;
}

interface Welcome_NewsBriefingsProps {
  newsEpisodes?: Record<string, NewsEpisode>;
  credits?: number;
}

export function Welcome_NewsBriefings({ 
  newsEpisodes = {}, 
  credits = 0 
}: Welcome_NewsBriefingsProps) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [stateUpsellUrl, setStateUpsellUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load state upsell audio URL on mount
  useEffect(() => {
    async function loadStateUpsell() {
      try {
        const response = await fetch('/api/news/state-upsell');
        const data = await response.json();
        
        if (data.exists && data.audioUrl) {
          setStateUpsellUrl(data.audioUrl);
        }
      } catch (error) {
        console.log('[Welcome] State upsell not available');
      }
    }
    loadStateUpsell();
  }, []);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(null);
  }

  function playAudio(url: string, category: string) {
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => {
      console.error('[Welcome] Audio playback error');
      setPlaying(null);
    };
    audio.play();
    setPlaying(category);
  }

  async function handleCategoryClick(category: string) {
    if (playing === category) {
      stopAudio();
      return;
    }
    stopAudio();

    // State News - play upsell message
    if (category === 'state') {
      if (stateUpsellUrl) {
        playAudio(stateUpsellUrl, category);
      } else {
        // Try to fetch it
        setLoading(category);
        try {
          const response = await fetch('/api/news/state-upsell');
          const data = await response.json();
          
          if (data.exists && data.audioUrl) {
            setStateUpsellUrl(data.audioUrl);
            playAudio(data.audioUrl, category);
          } else {
            alert('State news is available for subscribers only!');
          }
        } catch (error) {
          alert('State news is available for subscribers only!');
        } finally {
          setLoading(null);
        }
      }
      return;
    }

    // Check if we have pre-loaded episode
    const episode = newsEpisodes[category];
    const episodeUrl = episode?.audio_url || episode?.audioUrl;
    
    if (episodeUrl) {
      playAudio(episodeUrl, category);
      return;
    }

    // Fetch from API
    setLoading(category);
    try {
      const response = await fetch(`/api/news/briefing?category=${category}`);
      const data = await response.json();
      if (response.ok && data.episode?.audioUrl) {
        playAudio(data.episode.audioUrl, category);
      } else {
        alert(data.error || 'Briefing not available yet. Please try again later.');
      }
    } catch (error) {
      console.error('[Welcome] Failed to fetch briefing:', error);
      alert('Failed to load briefing. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <h2 style={{
        fontSize: '18px',
        fontWeight: 'bold',
        color: 'white',
        marginBottom: '12px'
      }}>
        📻 News Briefings
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px'
      }}>
        {CATEGORIES.map((cat) => {
          const isPlaying = playing === cat.id;
          const isLoading = loading === cat.id;
          
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              disabled={isLoading}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 8px',
                backgroundColor: isPlaying ? cat.color : '#1e293b',
                border: `2px solid ${cat.color}`,
                borderRadius: '10px',
                cursor: isLoading ? 'wait' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              <span style={{ fontSize: '24px', marginBottom: '4px' }}>
                {isLoading ? '⏳' : isPlaying ? '⏹️' : cat.icon}
              </span>
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                color: isPlaying ? (cat.id === 'world' ? 'black' : 'white') : 'white'
              }}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {playing && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            display: 'inline-block',
            width: '8px',
            height: '8px',
            backgroundColor: '#22c55e',
            borderRadius: '50%'
          }} />
          <span style={{ fontSize: '14px', color: 'white' }}>
            Now Playing: {CATEGORIES.find(c => c.id === playing)?.label}
          </span>
          <button
            onClick={stopAudio}
            style={{
              marginLeft: '8px',
              padding: '4px 8px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

export default Welcome_NewsBriefings;
