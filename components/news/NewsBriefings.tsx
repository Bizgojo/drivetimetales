'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface NewsEpisode {
  id: string;
  category: string;
  title: string;
  audio_url?: string;
  duration_mins?: number;
  is_live: boolean;
  created_at: string;
}

interface NewsBriefingsProps {
  userSubscription?: string;
}

const CATEGORIES = [
  { id: 'national', label: 'National News', icon: '🗞️', color: 'from-blue-600 to-blue-800', borderColor: 'border-blue-500' },
  { id: 'international', label: 'International', icon: '🌍', color: 'from-green-600 to-green-800', borderColor: 'border-green-500' },
  { id: 'business', label: 'Business', icon: '💼', color: 'from-yellow-600 to-yellow-800', borderColor: 'border-yellow-500' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: 'from-purple-600 to-purple-800', borderColor: 'border-purple-500' },
];

export default function NewsBriefings({ userSubscription }: NewsBriefingsProps) {
  const [episodes, setEpisodes] = useState<Record<string, NewsEpisode | null>>({});
  const [loading, setLoading] = useState(true);

  // Check if user has access to news (Commuter, Road Warrior, or new user)
  const hasAccess = !userSubscription || 
    userSubscription === 'commuter' || 
    userSubscription === 'road_warrior';

  useEffect(() => {
    async function fetchLiveEpisodes() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          setLoading(false);
          return;
        }

        const response = await fetch(
          `${url}/rest/v1/news_episodes?is_live=eq.true&select=id,category,title,audio_url,duration_mins,is_live,created_at`,
          {
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const episodesByCategory: Record<string, NewsEpisode> = {};
          data.forEach((ep: NewsEpisode) => {
            if (ep.category) {
              episodesByCategory[ep.category] = ep;
            }
          });
          setEpisodes(episodesByCategory);
        }
      } catch (error) {
        console.error('Error fetching news episodes:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveEpisodes();
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span>📰</span> Daily Briefings
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📰</span> Daily Briefings
        </h2>
        <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full">
          🔴 LIVE
        </span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {CATEGORIES.map(cat => {
          const episode = episodes[cat.id];
          const isAvailable = !!episode?.audio_url;
          
          return (
            <Link
              key={cat.id}
              href={isAvailable && hasAccess ? `/player/news/${cat.id}` : '#'}
              className={`relative overflow-hidden rounded-xl transition-all ${
                isAvailable && hasAccess
                  ? 'hover:scale-105 cursor-pointer'
                  : 'opacity-60 cursor-not-allowed'
              }`}
            >
              <div className={`bg-gradient-to-br ${cat.color} p-3 h-24 flex flex-col justify-between`}>
                {/* Live badge */}
                {isAvailable && (
                  <div className="absolute top-1 right-1">
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  </div>
                )}
                
                {/* Icon and label */}
                <div>
                  <span className="text-2xl">{cat.icon}</span>
                  <p className="text-white font-bold text-sm mt-1 leading-tight">{cat.label}</p>
                </div>
                
                {/* Status */}
                <div className="text-white/80 text-xs">
                  {isAvailable ? (
                    <>
                      <span>{episode.duration_mins || '~5'} min</span>
                      {episode.created_at && (
                        <span className="ml-1">• {formatTime(episode.created_at)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-white/50">Coming soon</span>
                  )}
                </div>
              </div>
              
              {/* Lock overlay for non-subscribers */}
              {!hasAccess && isAvailable && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-2xl">🔒</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      
      {/* Subscription prompt for non-subscribers */}
      {!hasAccess && (
        <p className="text-center text-gray-400 text-xs mt-2">
          Upgrade to <span className="text-orange-400">Commuter</span> or <span className="text-orange-400">Road Warrior</span> for unlimited news access
        </p>
      )}
    </div>
  );
}
