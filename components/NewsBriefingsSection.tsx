'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Briefing {
  id: string;
  category: string;
  episode_number: number;
  audio_url: string;
  created_at: string;
}

interface CategoryInfo {
  id: string;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryInfo[] = [
  { id: 'local', label: 'Local', icon: '🏠' },
  { id: 'national', label: 'National', icon: '🇺🇸' },
  { id: 'international', label: 'World', icon: '🌍' },
  { id: 'business', label: 'Business', icon: '📈' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'science', label: 'Sci/Tech', icon: '🔬' },
];

export default function NewsBriefingsSection() {
  const [briefings, setBriefings] = useState<Record<string, Briefing>>({});
  const [playingCategory, setPlayingCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadBriefings();
  }, []);

  async function loadBriefings() {
    try {
      const res = await fetch('/api/news/live');
      if (res.ok) {
        const data = await res.json();
        setBriefings(data.briefings || {});
      }
    } catch (error) {
      console.error('Failed to load briefings:', error);
    } finally {
      setLoading(false);
    }
  }

  function playBriefing(categoryId: string) {
    const briefing = briefings[categoryId];
    
    // If already playing this category, stop it
    if (playingCategory === categoryId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingCategory(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // If no briefing available, show message briefly
    if (!briefing?.audio_url) {
      setPlayingCategory(categoryId);
      setTimeout(() => setPlayingCategory(null), 2000);
      return;
    }

    // Play the briefing immediately
    setPlayingCategory(categoryId);
    audioRef.current = new Audio(briefing.audio_url + "?t=" + Date.now());
    audioRef.current.onended = () => {
      setPlayingCategory(null);
      audioRef.current = null;
    };
    audioRef.current.onerror = () => {
      setPlayingCategory(null);
      audioRef.current = null;
    };
    audioRef.current.play().catch(() => {
      setPlayingCategory(null);
    });
  }

  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-700 rounded-full" />
          <div className="h-6 bg-gray-700 rounded w-48" />
        </div>
      </div>
    );
  }

  // Check if any briefings are available
  const hasBriefings = Object.keys(briefings).length > 0;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📰</span>
          <h2 className="text-xl font-bold text-white">News Briefings</h2>
        </div>
        {hasBriefings && (
          <span className="text-gray-500 text-sm">
            Tap to listen
          </span>
        )}
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {CATEGORIES.map(category => {
          const briefing = briefings[category.id];
          const isPlaying = playingCategory === category.id;
          const isAvailable = !!briefing?.audio_url;

          return (
            <button
              key={category.id}
              onClick={() => playBriefing(category.id)}
              className={`relative flex flex-col items-center justify-center p-4 rounded-xl transition-all ${
                isPlaying
                  ? 'bg-orange-500 text-black scale-105'
                  : isAvailable
                  ? 'bg-gray-800 hover:bg-gray-700 text-white'
                  : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="text-3xl mb-2">{category.icon}</span>
              <span className="text-xs font-medium">{category.label}</span>
              
              {/* Playing indicator */}
              {isPlaying && isAvailable && (
                <div className="absolute top-2 right-2">
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 h-3 bg-black rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-4 bg-black rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-2 bg-black rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Not available indicator */}
              {isPlaying && !isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 rounded-xl">
                  <span className="text-gray-400 text-xs">No briefing</span>
                </div>
              )}

              {/* Episode info */}
              {isAvailable && !isPlaying && (
                <span className="text-[10px] text-gray-500 mt-1">
                  {formatTime(briefing.created_at)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* No briefings message */}
      {!hasBriefings && (
        <p className="text-gray-500 text-center text-sm mt-4">
          No briefings available yet. Check back soon!
        </p>
      )}
    </div>
  );
}
