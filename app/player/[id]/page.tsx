'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAudioPlayer, PLAYBACK_RATES } from '@/hooks/useAudioPlayer';
import { useStory, useOwnsStory, usePlayProgress, usePurchaseStory } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORY_ICONS: Record<string, string> = {
  'Trucker Stories': '🚛',
  'Drama': '🎭',
  'Horror': '👻',
  'Mystery': '🔍',
  'Thriller': '⚡',
  'Adventure': '🏜️',
  'Romance': '💕',
  'Comedy': '😂',
  'Sci-Fi': '🚀',
};

export default function PlayerPage() {
  const params = useParams();
  const storyId = params.id as string;
  
  const { user } = useAuth();
  const { story, loading: storyLoading, error: storyError } = useStory(storyId);
  const { owns, loading: ownsLoading } = useOwnsStory(storyId);
  const { updateProgress } = usePlayProgress(storyId);
  const { purchase, purchasing } = usePurchaseStory();
  
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(0);

  // Determine which audio URL to use
  const audioUrl = owns ? story?.audio_url : story?.sample_url;
  
  const {
    isPlaying,
    currentTime,
    duration,
    progress,
    bufferedProgress,
    loading: audioLoading,
    playbackRate,
    togglePlay,
    skipForward,
    skipBackward,
    seek,
    changePlaybackRate,
    formattedCurrentTime,
    formattedDuration,
    formattedRemaining,
  } = useAudioPlayer(audioUrl || null, {
    onEnded: () => {
      if (owns) {
        updateProgress(duration, true);
      }
    },
  });

  // Save progress periodically (every 10 seconds)
  useEffect(() => {
    if (owns && isPlaying && currentTime - lastSavedTime >= 10) {
      updateProgress(currentTime, false);
      setLastSavedTime(currentTime);
    }
  }, [owns, isPlaying, currentTime, lastSavedTime, updateProgress]);

  // Handle seeking via progress bar
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  // Handle purchase
  const handlePurchase = async () => {
    if (!user) {
      window.location.href = '/auth/login';
      return;
    }
    
    const result = await purchase(storyId);
    if (result.success) {
      window.location.reload();
    }
  };

  if (storyLoading || ownsLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🚛</div>
          <p className="text-white">Loading story...</p>
        </div>
      </div>
    );
  }

  if (storyError || !story) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">😢</div>
          <h2 className="text-white text-xl font-bold mb-2">Story Not Found</h2>
          <Link href="/library" className="text-orange-400">← Back to Library</Link>
        </div>
      </div>
    );
  }

  const categoryIcon = CATEGORY_ICONS[story.genre] || '📚';
  const isSampleMode = !owns;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-gray-950 border-b border-gray-800 px-4 py-3 z-10">
        <div className="flex items-center justify-between">
          <button onClick={() => window.history.back()} className="text-white px-3 py-1 bg-gray-800 rounded-lg text-sm">← Back</button>
          <span className="text-white font-medium">{isSampleMode ? '🎧 Sample' : '▶ Now Playing'}</span>
          <button className="text-white text-xl">⋮</button>
        </div>
      </header>

      {isSampleMode && (
        <div className="bg-orange-500/20 border-b border-orange-500/30 px-4 py-3">
          <p className="text-orange-400 text-sm text-center">🎧 Sample preview. Purchase to unlock full story!</p>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div 
          className="w-64 h-64 rounded-2xl flex items-center justify-center text-8xl shadow-2xl mb-8 relative"
          style={{ background: story.cover_url ? undefined : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}
        >
          {story.cover_url ? <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover rounded-2xl"/> : categoryIcon}
          {audioLoading && <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center"><div className="animate-spin text-4xl">⏳</div></div>}
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">{story.title}</h1>
          <p className="text-white">{story.author}</p>
          <p className="text-orange-400 text-sm">{categoryIcon} {story.genre} • {story.duration_mins} min</p>
        </div>

        <div className="w-full max-w-md mb-4">
          <div className="h-2 bg-gray-800 rounded-full cursor-pointer relative" onClick={handleProgressClick}>
            <div className="absolute h-full bg-gray-700 rounded-full" style={{ width: `${bufferedProgress}%` }}/>
            <div className="absolute h-full bg-orange-500 rounded-full transition-all" style={{ width: `${progress}%` }}/>
            <div className="absolute w-4 h-4 bg-white rounded-full -top-1 shadow-lg" style={{ left: `calc(${progress}% - 8px)` }}/>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-white">{formattedCurrentTime}</span>
            <span className="text-white">-{formattedRemaining}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8">
          <button onClick={() => skipBackward(15)} className="w-16 h-16 bg-gray-800 rounded-full flex flex-col items-center justify-center active:bg-gray-700">
            <span className="text-white text-xl">⏪</span><span className="text-white text-xs">15s</span>
          </button>
          <button onClick={togglePlay} disabled={audioLoading} className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center active:bg-orange-600 disabled:opacity-50">
            <span className="text-white text-4xl">{audioLoading ? '⏳' : isPlaying ? '⏸' : '▶'}</span>
          </button>
          <button onClick={() => skipForward(30)} className="w-16 h-16 bg-gray-800 rounded-full flex flex-col items-center justify-center active:bg-gray-700">
            <span className="text-white text-xl">⏩</span><span className="text-white text-xs">30s</span>
          </button>
        </div>

        <div className="relative mt-8">
          <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="px-4 py-2 bg-gray-800 rounded-lg text-white text-sm">Speed: {playbackRate}x</button>
          {showSpeedMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 border border-gray-700 rounded-xl p-2 flex gap-1">
              {PLAYBACK_RATES.map(rate => (
                <button key={rate} onClick={() => { changePlaybackRate(rate); setShowSpeedMenu(false); }} className={`px-3 py-1 rounded-lg text-sm ${playbackRate === rate ? 'bg-orange-500 text-white' : 'bg-gray-800 text-white'}`}>{rate}x</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isSampleMode && (
        <div className="px-4 py-4 border-t border-gray-800 bg-gray-900">
          <p className="text-center text-white text-sm mb-2">💎 {story.credits} credits</p>
          <button onClick={handlePurchase} disabled={purchasing} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50">
            {purchasing ? 'Purchasing...' : `▶ Unlock Full Story`}
          </button>
        </div>
      )}

      {owns && (
        <div className="px-4 py-4 border-t border-gray-800">
          <div className="flex gap-4">
            <button className="flex-1 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm">📥 Download</button>
            <button className="flex-1 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm">📤 Share</button>
          </div>
        </div>
      )}
    </div>
  );
}
