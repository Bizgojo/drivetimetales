'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

interface HistoryItem {
  id: string;
  storyId: string;
  title: string;
  author: string;
  genre: string;
  duration: number;
  progress: number;
  playedAt: string;
  completed: boolean;
}

const sampleHistory: HistoryItem[] = [
  { id: '1', storyId: '1', title: 'The Last Mile', author: 'Jack Morrison', genre: 'Trucker Stories', duration: 30, progress: 100, playedAt: 'Today, 2:30 PM', completed: true },
  { id: '2', storyId: '2', title: 'Midnight Diner', author: 'Sarah Chen', genre: 'Drama', duration: 25, progress: 65, playedAt: 'Today, 10:15 AM', completed: false },
  { id: '3', storyId: '3', title: 'Ghost Frequencies', author: 'Mike Torres', genre: 'Horror', duration: 45, progress: 100, playedAt: 'Yesterday, 8:45 PM', completed: true },
  { id: '4', storyId: '4', title: 'Highway Hearts', author: 'Lisa Park', genre: 'Drama', duration: 60, progress: 30, playedAt: 'Yesterday, 3:20 PM', completed: false },
  { id: '5', storyId: '5', title: 'Neon Nights', author: 'Amy Walsh', genre: 'Thriller', duration: 50, progress: 100, playedAt: '2 days ago', completed: true },
  { id: '6', storyId: '6', title: 'Desert Run', author: 'Sarah Chen', genre: 'Adventure', duration: 25, progress: 100, playedAt: '3 days ago', completed: true },
];

const CATEGORY_ICONS: Record<string, string> = {
  'Trucker Stories': '🚛',
  'Drama': '🎭',
  'Horror': '👻',
  'Thriller': '⚡',
  'Adventure': '🏜️',
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState(sampleHistory);
  const [filter, setFilter] = useState<'all' | 'completed' | 'in_progress'>('all');

  const filteredHistory = history.filter(item => {
    if (filter === 'completed') return item.completed;
    if (filter === 'in_progress') return !item.completed;
    return true;
  });

  const handleClearHistory = () => {
    if (confirm('Clear your listening history? This cannot be undone.')) {
      setHistory([]);
    }
  };

  const handleRemoveItem = (id: string) => {
    setHistory(history.filter(h => h.id !== id));
  };

  // Calculate stats
  const totalListened = history.filter(h => h.completed).length;
  const totalMinutes = history.reduce((sum, h) => sum + (h.duration * h.progress / 100), 0);
  const totalHours = Math.floor(totalMinutes / 60);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={!!user} showBack userCredits={user?.credits} />
      
      <div className="px-4 py-5">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">📊 Listening History</h1>
            <p className="text-white text-sm">{history.length} stories played</p>
          </div>
          {history.length > 0 && (
            <button 
              onClick={handleClearHistory}
              className="text-red-400 text-sm"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{totalListened}</p>
            <p className="text-white text-xs">Stories Completed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{totalHours}h {Math.round(totalMinutes % 60)}m</p>
            <p className="text-white text-xs">Total Listened</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'all', label: 'All' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'completed', label: 'Completed' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-sm ${
                filter === tab.id ? 'bg-orange-500 text-white' : 'bg-gray-800 text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* History List */}
        {filteredHistory.length > 0 ? (
          <div className="space-y-3">
            {filteredHistory.map((item) => (
              <div 
                key={item.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4"
              >
                <div className="flex gap-4">
                  {/* Icon */}
                  <div 
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                      item.completed ? 'bg-green-600' : ''
                    }`}
                    style={!item.completed ? { background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' } : {}}
                  >
                    {item.completed ? '✓' : (CATEGORY_ICONS[item.genre] || '📚')}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate">{item.title}</h3>
                    <p className="text-white text-sm">{item.author}</p>
                    <p className="text-white text-xs">{item.playedAt}</p>
                    
                    {!item.completed && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-orange-400">{item.progress}%</span>
                          <span className="text-white">{Math.round(item.duration * (1 - item.progress / 100))} min left</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${item.progress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link 
                      href={`/player/${item.storyId}`}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-lg text-center"
                    >
                      {item.completed ? '↻' : '▶'}
                    </Link>
                    <button 
                      onClick={() => handleRemoveItem(item.id)}
                      className="px-3 py-1 bg-gray-800 text-gray-400 text-xs rounded-lg"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-white text-lg font-bold mb-2">No History Yet</h2>
            <p className="text-white text-sm mb-6">
              Start listening to build your history.
            </p>
            <Link 
              href="/library"
              className="inline-block px-6 py-3 bg-orange-500 text-white rounded-xl font-medium"
            >
              Browse Stories
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
