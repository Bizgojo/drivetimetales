// components/news/LiveNewsBanner.tsx
// Displays the current live news episode with LIVE badge

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface LiveEpisode {
  id: string;
  title: string;
  edition: string;
  date: string;
  durationMins: number;
  coverUrl: string;
  audioUrl?: string;
  publishedAt: string;
}

interface NewsAccess {
  canAccess: boolean;
  reason: string;
  eligibleTiers: string[];
}

export function LiveNewsBanner() {
  const { user } = useAuth();
  const router = useRouter();
  const [episode, setEpisode] = useState<LiveEpisode | null>(null);
  const [access, setAccess] = useState<NewsAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchLiveNews();
  }, [user]);

  async function fetchLiveNews() {
    try {
      const headers: Record<string, string> = {};
      
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch('/api/news/live', { headers });
      const data = await response.json();

      if (data.hasLiveEpisode) {
        setEpisode(data.episode);
        setAccess(data.access);
      }
    } catch (error) {
      console.error('Failed to fetch live news:', error);
    } finally {
      setLoading(false);
    }
  }

  function handlePlay() {
    if (!access?.canAccess || !episode?.audioUrl) {
      router.push('/pricing');
      return;
    }

    if (audio) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play();
        setIsPlaying(true);
      }
    } else {
      const newAudio = new Audio(episode.audioUrl);
      newAudio.onended = () => setIsPlaying(false);
      newAudio.play();
      setAudio(newAudio);
      setIsPlaying(true);
    }
  }

  function handleFullPlayer() {
    if (!access?.canAccess) {
      router.push('/pricing');
      return;
    }
    router.push(`/news/${episode?.id}`);
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-24 bg-slate-700 rounded-lg"></div>
      </div>
    );
  }

  if (!episode) {
    return null;
  }

  const timeSincePublish = getTimeSince(episode.publishedAt);

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-orange-500/30 shadow-lg shadow-orange-500/10">
      {/* Live indicator pulse */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-pulse" />
      
      <div className="p-6">
        <div className="flex items-start gap-4">
          {/* Cover image */}
          <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-slate-700">
            {episode.coverUrl ? (
              <img 
                src={episode.coverUrl} 
                alt={episode.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-10 h-10 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
                </svg>
              </div>
            )}
            {/* Live badge */}
            <div className="absolute top-1 left-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-orange-400 text-sm font-medium">Daily Briefing</span>
              <span className="text-slate-500 text-sm">•</span>
              <span className="text-slate-400 text-sm">{episode.edition === 'morning' ? 'AM' : 'PM'} Edition</span>
            </div>
            
            <h3 className="text-white font-semibold text-lg truncate">
              {episode.title}
            </h3>
            
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
              <span>{episode.durationMins} min</span>
              <span>•</span>
              <span>Updated {timeSincePublish}</span>
            </div>

            {/* Access message */}
            {!access?.canAccess && (
              <p className="text-orange-400 text-sm mt-2">
                Free with Commuter or Road Warrior subscription
              </p>
            )}
          </div>

          {/* Play button */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePlay}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                access?.canAccess 
                  ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/30' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            
            {access?.canAccess && (
              <button
                onClick={handleFullPlayer}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Full Player →
              </button>
            )}
          </div>
        </div>

        {/* Topics preview */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700/50">
          <span className="text-slate-500 text-sm">Topics:</span>
          <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded">News</span>
          <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded">Science</span>
          <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded">Sports</span>
        </div>
      </div>
    </div>
  );
}

function getTimeSince(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
}
