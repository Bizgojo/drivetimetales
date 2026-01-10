'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

interface DownloadedStory {
  id: string;
  title: string;
  author: string;
  genre: string;
  duration_mins: number;
  size_mb: number;
  downloaded_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Trucker Stories': '🚛',
  'Drama': '🎭',
  'Horror': '👻',
  'Mystery': '🔍',
  'Thriller': '⚡',
  'Adventure': '🏜️',
  'Sci-Fi': '🚀',
  'Children': '🧒',
};

export default function DownloadsPage() {
  const { user } = useAuth();
  const [downloads, setDownloads] = useState<DownloadedStory[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = () => {
    const stored = localStorage.getItem('dtt_downloads');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DownloadedStory[];
        setDownloads(parsed);
        setTotalSize(parsed.reduce((sum, d) => sum + d.size_mb, 0));
      } catch (e) {
        console.error('Failed to parse downloads');
      }
    }
    setLoading(false);
  };

  const removeDownload = (storyId: string) => {
    if (!confirm('Remove this download?')) return;
    const updated = downloads.filter(d => d.id !== storyId);
    setDownloads(updated);
    localStorage.setItem('dtt_downloads', JSON.stringify(updated));
    setTotalSize(updated.reduce((sum, d) => sum + d.size_mb, 0));
  };

  const clearAllDownloads = () => {
    if (!confirm('Remove all downloads?')) return;
    setDownloads([]);
    localStorage.setItem('dtt_downloads', JSON.stringify([]));
    setTotalSize(0);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-4">Please sign in to view downloads</p>
          <Link href="/auth/login" className="px-6 py-3 bg-orange-500 text-white rounded-xl">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn showBack userCredits={user.credits} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-2">📥 Downloads</h1>
        <p className="text-white text-sm mb-6">Listen offline without internet</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white">Storage Used</span>
            <span className="text-orange-400 font-bold">{totalSize.toFixed(1)} MB</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min((totalSize / 500) * 100, 100)}%` }}/>
          </div>
          <p className="text-white text-xs mt-2">{downloads.length} stories downloaded</p>
        </div>

        <div className="flex gap-3 mb-6">
          <Link href="/collection" className="flex-1 py-3 bg-orange-500 text-white text-center rounded-xl font-medium">📚 Download More</Link>
          {downloads.length > 0 && (
            <button onClick={clearAllDownloads} className="py-3 px-4 bg-gray-900 border border-gray-800 text-white rounded-xl">🗑️</button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-white">Loading...</p>
          </div>
        ) : downloads.length > 0 ? (
          <div className="space-y-3">
            {downloads.map((story) => (
              <div key={story.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}>
                    {CATEGORY_ICONS[story.genre] || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate">{story.title}</h3>
                    <p className="text-white text-sm">{story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.size_mb.toFixed(1)} MB</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link href={`/player/${story.id}`} className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg text-center">▶ Play</Link>
                    <button onClick={() => removeDownload(story.id)} className="px-3 py-2 bg-gray-800 text-white text-xs rounded-lg">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📥</div>
            <h2 className="text-white text-lg font-bold mb-2">No Downloads Yet</h2>
            <p className="text-white text-sm mb-6">Download stories to listen offline</p>
            <Link href="/collection" className="inline-block px-6 py-3 bg-orange-500 text-white rounded-xl font-medium">Go to Collection</Link>
          </div>
        )}
      </div>
    </div>
  );
}
