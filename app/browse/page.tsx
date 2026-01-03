'use client';

import React from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

const categories = [
  { id: 'trucker', name: 'Trucker Stories', icon: '🚛', count: 24, color: 'from-orange-600 to-orange-800' },
  { id: 'drama', name: 'Drama', icon: '🎭', count: 18, color: 'from-purple-600 to-purple-800' },
  { id: 'horror', name: 'Horror', icon: '👻', count: 15, color: 'from-gray-600 to-gray-800' },
  { id: 'mystery', name: 'Mystery', icon: '🔍', count: 21, color: 'from-blue-600 to-blue-800' },
  { id: 'thriller', name: 'Thriller', icon: '⚡', count: 19, color: 'from-red-600 to-red-800' },
  { id: 'adventure', name: 'Adventure', icon: '🏜️', count: 12, color: 'from-yellow-600 to-yellow-800' },
  { id: 'romance', name: 'Romance', icon: '💕', count: 9, color: 'from-pink-600 to-pink-800' },
  { id: 'comedy', name: 'Comedy', icon: '😂', count: 8, color: 'from-green-600 to-green-800' },
  { id: 'scifi', name: 'Sci-Fi', icon: '🚀', count: 14, color: 'from-cyan-600 to-cyan-800' },
  { id: 'selfhelp', name: 'Self Help', icon: '🧠', count: 11, color: 'from-teal-600 to-teal-800' },
  { id: 'educational', name: 'Educational', icon: '📚', count: 16, color: 'from-indigo-600 to-indigo-800' },
  { id: 'children', name: 'Children', icon: '🧒', count: 20, color: 'from-amber-500 to-amber-700' },
];

const series = [
  { id: 'midnight-trucker', name: 'Midnight Trucker', episodes: 12, icon: '🌙' },
  { id: 'highway-haunts', name: 'Highway Haunts', episodes: 8, icon: '👻' },
  { id: 'road-warriors', name: 'Road Warriors', episodes: 15, icon: '⚔️' },
  { id: 'diesel-dreams', name: 'Diesel Dreams', episodes: 6, icon: '💭' },
];

export default function BrowsePage() {
  const { user } = useAuth();
  const totalStories = categories.reduce((sum, cat) => sum + cat.count, 0);
  const displayName = user?.display_name || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={!!user} showBack userName={displayName} userCredits={user?.credits} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-1">📂 Browse</h1>
        <p className="text-white text-sm mb-6">{totalStories} stories across {categories.length} categories</p>

        {/* All Categories Button */}
        <Link
          href="/library"
          className="block w-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 mb-4 text-center"
        >
          <span className="text-xl mr-2">📂</span>
          <span className="text-white font-bold text-lg">All Categories</span>
          <span className="text-white/70 text-sm ml-2">({totalStories} stories)</span>
        </Link>

        {/* Category Grid */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {categories.map(cat => (
            <Link
              key={cat.id}
              href={`/library?category=${cat.id}`}
              className={`bg-gradient-to-br ${cat.color} rounded-xl p-3 flex items-center gap-2 h-14`}
            >
              <div className="text-xl">{cat.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm leading-tight">{cat.name}</div>
                <div className="text-white/70 text-xs">{cat.count}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Series Section */}
        <h2 className="text-xl font-bold text-white mb-4">📺 Series</h2>
        <div className="space-y-3">
          {series.map(s => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-violet-800 rounded-xl flex items-center justify-center text-2xl">
                {s.icon}
              </div>
              <div className="flex-1">
                <p className="text-white font-bold">{s.name}</p>
                <p className="text-white text-sm">{s.episodes} episodes</p>
              </div>
              <span className="text-gray-500">›</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
