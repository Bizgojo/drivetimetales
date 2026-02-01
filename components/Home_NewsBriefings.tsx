// components/Home_NewsBriefings.tsx
// DTT News Briefings - Home Page Component
// FRESH BUILD - February 2026
// FIXED: Named export to match existing imports

'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Category configuration with colors (DO NOT CHANGE)
const CATEGORIES = [
  { id: 'state', label: 'State', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Sci/Tech', icon: '🔬', color: '#9333ea' }
];

interface UserInfo {
  firstName: string;
  state: string | null;
  credits: number;
}

export function Home_NewsBriefings() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          console.log('[Home] No session');
          return;
        }

        const { data: userData, error } = await supabase
          .from('users')
          .select('first_name, state, credits')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('[Home] Failed to load user:', error);
          return;
        }

        setUser({
          firstName: userData.first_name || 'there',
          state: userData.state,
          credits: userData.credits || 0
        });
      } catch (error) {
        console.error('[Home] Error loading user:', error);
      }
    }
    loadUser();
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
      console.error('[Home] Audio playback error');
      setPlaying(null);
    };
    audio.play();
    setPlaying(category);
  }

  async function playNoCreditsMessage(category: string) {
    setLoading(category);
    try {
      const response = await fetch('/api/news/no-credits-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          userName: user?.firstName || 'there'
        })
      });
      const data = await response.json();
      if (data.audioUrl) {
        playAudio(data.audioUrl, category);
      } else {
        alert('You have no credits. Please purchase more to listen to news briefings.');
      }
    } catch (error) {
      console.error('[Home] Failed to generate no-credits message:', error);
      alert('You have no credits. Please purchase more to listen to news briefings.');
    } finally {
      setLoading(null);
    }
  }

  async function handleCategoryClick(category: string) {
    if (playing === category) {
      stopAudio();
      return;
    }
    stopAudio();

    // CREDIT CHECK - only interaction with main DTT app
    if (!user || user.credits < 1) {
      await playNoCreditsMessage(category);
      return;
    }

    if (category === 'state') {
      if (!user.state) {
        alert('Please set your state in your profile to receive state news.');
        return;
      }
      setLoading(category);
      try {
        const response = await fetch(`/api/news/briefing?category=state&state=${encodeURIComponent(user.state)}`);
        const data = await response.json();
        if (response.ok && data.episode?.audioUrl) {
          playAudio(data.episode.audioUrl, category);
        } else if (data.notFound) {
          alert(`State news for ${user.state} is not available yet. Please check back later.`);
        } else {
          alert(data.error || 'Failed to load state news.');
        }
      } catch (error) {
        console.error('[Home] Failed to fetch state briefing:', error);
        alert('Failed to load state news. Please try again.');
      } finally {
        setLoading(null);
      }
      return;
    }

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
      console.error('[Home] Failed to fetch briefing:', error);
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

      {user?.state && (
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: 'white',
          opacity: 0.7,
          textAlign: 'center'
        }}>
          State News: {user.state}
        </div>
      )}
    </div>
  );
}

export default Home_NewsBriefings;
