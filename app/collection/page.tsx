'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';

interface CollectionStory {
  id: string;
  title: string;
  author: string;
  category: string;
  duration: number;
  rating: number;
  progress: number;
  lastPlayed: string;
  completed: boolean;
}

const collectionStories: CollectionStory[] = [
  { id: '1', title: 'The Last Mile', author: 'Jack Morrison', category: 'Trucker Stories', duration: 30, rating: 4.8, progress: 65, lastPlayed: '2 hours ago', completed: false },
  { id: '2', title: 'Midnight Diner', author: 'Sarah Chen', category: 'Drama', duration: 45, rating: 4.9, progress: 100, lastPlayed: 'Yesterday', completed: true },
  { id: '5', title: 'The Long Haul', author: 'Tom Bradley', category: 'Mystery', duration: 35, rating: 4.5, progress: 30, lastPlayed: '3 days ago', completed: false },
];

const CATEGORY_ICONS: Record<string, string> = {
  'Trucker Stories': '🚛',
  'Drama': '🎭',
  'Mystery': '🔍',
};

export default function CollectionPage() {
  const [filter, setFilter] = useState<'all' | 'progress' | 'completed'>('all');
  
  const userCredits = 3;
  
  const inProgress = collectionStories.filter(s => !s.completed);
  const completed = collectionStories.filter(s => s.completed);
  
  const filteredStories = filter === 'all' 
    ? collectionStories 
    : filter === 'progress' 
      ? inProgress 
      : completed;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn showBack userCredits={userCredits} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-4">📚 My Collection</h1>

        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-orange-500/20 border border-orange-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{inProgress.length}</p>
            <p className="text-white text-xs">In Progress</p>
          </div>
          <div className="flex-1 bg-green-500/20 border border-green-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{completed.length}</p>
            <p className="text-white text-xs">Completed</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: `All (${collectionStories.length})` },
            { id: 'progress', label: `In Progress (${inProgress.length})` },
            { id: 'completed', label: `Completed (${completed.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as 'all' | 'progress' | 'completed')}
              className={`px-4 py-2 rounded-lg text-sm ${
                filter === tab.id 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-800 text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredStories.length > 0 ? (
          <div className="space-y-4">
            {filteredStories.map((story) => (
              <div 
                key={story.id}
                className="p-4 bg-gray-900 border border-gray-800 rounded-xl"
              >
                <div className="flex gap-4">
                  <div 
                    className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl ${
                      story.completed ? 'bg-green-600' : ''
                    }`}
                    style={!story.completed ? { background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' } : {}}
                  >
                    {story.completed ? '✓' : (CATEGORY_ICONS[story.category] || '📚')}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-white font-bold">{story.title}</h3>
                    <p className="text-white text-sm">{story.author}</p>
                    <p className="text-white text-xs mt-1">Last played: {story.lastPlayed}</p>
                    
                    {!story.completed && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-orange-400">{story.progress}% complete</span>
                          <span className="text-white">{Math.round(story.duration * (1 - story.progress / 100))} min left</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full">
                          <div 
                            className="h-full bg-orange-500 rounded-full"
                            style={{ width: `${story.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <Link 
                  href={`/player/${story.id}`}
                  className={`block w-full mt-3 py-2 rounded-lg text-center font-medium ${
                    story.completed 
                      ? 'bg-gray-800 text-white' 
                      : 'bg-green-600 text-white'
                  }`}
                >
                  {story.completed ? '🔄 Listen Again' : '▶ Continue'}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <h2 className="text-white text-lg font-bold mb-2">No Stories Yet</h2>
            <p className="text-white text-sm mb-6">
              Start listening to build your collection.
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
