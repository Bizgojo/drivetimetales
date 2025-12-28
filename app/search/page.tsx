'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { StoryCard, Story } from '@/components/ui/StoryCard';
import { StoryModal } from '@/components/ui/Modal';

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

// Sample data
const allStories: Story[] = [
  { id: '1', title: 'The Midnight Haul', author: 'Jack Morrison', category: 'Trucker Stories', duration: 30, rating: 4.8, credits: 2, description: 'A veteran trucker faces his final haul across the desert.' },
  { id: '2', title: 'Desert Run', author: 'Sarah Chen', category: 'Adventure', duration: 25, rating: 4.9, credits: 2, description: 'A solo journey through the Mojave becomes a race against time.' },
  { id: '3', title: 'Ghost Frequencies', author: 'Mike Torres', category: 'Horror', duration: 45, rating: 4.6, credits: 3, description: 'Late night radio signals lead to transmissions from beyond the grave.' },
  { id: '4', title: 'Highway Hearts', author: 'Lisa Park', category: 'Drama', duration: 60, rating: 4.7, credits: 4, description: 'Two strangers meet at a truck stop and discover their paths have crossed before.' },
  { id: '5', title: 'The Long Haul', author: 'Tom Bradley', category: 'Mystery', duration: 35, rating: 4.5, credits: 2, description: 'A dispatcher receives a distress call from a truck that went missing 20 years ago.' },
  { id: '6', title: 'Neon Nights', author: 'Amy Walsh', category: 'Thriller', duration: 50, rating: 4.8, credits: 3, description: 'A cross-country chase through forgotten highways.' },
  { id: '7', title: 'Star Runner', author: 'Dan Blake', category: 'Sci-Fi', duration: 40, rating: 4.4, credits: 3, description: 'Interstellar truckers haul cargo between planets.' },
  { id: '8', title: 'Bedtime Journey', author: 'Mary Johnson', category: 'Children', duration: 15, rating: 4.9, credits: 1, description: 'A friendly truck driver delivers dreams to children.' },
  { id: '9', title: 'Midnight Diner', author: 'Sarah Chen', category: 'Drama', duration: 30, rating: 4.9, credits: 2, description: 'At a roadside diner that only appears after midnight.' },
  { id: '10', title: 'Route 66 Ghost', author: 'Mike Rivera', category: 'Horror', duration: 45, rating: 4.6, credits: 3, description: 'A hitchhiker discovers why some roads are better left untraveled.' },
];

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [recentSearches, setRecentSearches] = useState(['trucker', 'mystery', 'ghost stories', 'midnight']);

  const isLoggedIn = true;
  const userCredits = 3;

  const searchResults = searchQuery.length > 0 
    ? allStories.filter(story => 
        story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        story.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        story.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (story.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : [];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 0 && !recentSearches.includes(query.toLowerCase())) {
      setRecentSearches([query.toLowerCase(), ...recentSearches.slice(0, 4)]);
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
  };

  const handlePlay = (story: Story) => {
    window.location.href = `/player/${story.id}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header with Search */}
      <header className="sticky top-0 bg-gray-950 border-b border-gray-800 px-4 pt-2 pb-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2" style={{ transform: 'scaleX(-1)' }}>
            <span className="text-xl">🚗</span>
            <span className="text-2xl">🚛</span>
          </div>
          <button 
            onClick={() => window.history.back()}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs font-medium rounded-lg"
          >
            ← Back
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Search stories, authors, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 pl-10 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
            autoFocus
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-5">
        {/* No Search Yet - Show Recent & Suggestions */}
        {searchQuery.length === 0 && (
          <>
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-bold">Recent Searches</h2>
                  <button 
                    onClick={clearRecentSearches}
                    className="text-orange-400 text-sm"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search, index) => (
                    <button
                      key={index}
                      onClick={() => handleSearch(search)}
                      className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-full text-white text-sm"
                    >
                      🕐 {search}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Categories */}
            <div className="mb-6">
              <h2 className="text-white font-bold mb-3">Popular Categories</h2>
              <div className="grid grid-cols-2 gap-2">
                {['Trucker Stories', 'Horror', 'Mystery', 'Thriller'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => handleSearch(cat)}
                    className="py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm flex items-center justify-center gap-2"
                  >
                    {CATEGORY_ICONS[cat]} {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Trending Searches */}
            <div>
              <h2 className="text-white font-bold mb-3">Trending Now</h2>
              <div className="space-y-2">
                {['midnight', 'ghost', 'highway', 'desert'].map((term, index) => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="w-full py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm text-left px-4 flex items-center gap-3"
                  >
                    <span className="text-orange-400 font-bold">{index + 1}</span>
                    <span>{term}</span>
                    <span className="text-gray-500 ml-auto">🔥</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Search Results */}
        {searchQuery.length > 0 && (
          <>
            <p className="text-white text-sm mb-4">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>

            {searchResults.length > 0 ? (
              <div className="space-y-4">
                {searchResults.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    userCredits={userCredits}
                    showDescription={false}
                    onClick={() => setSelectedStory(story)}
                  />
                ))}
              </div>
            ) : (
              /* No Results */
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-white text-lg font-bold mb-2">No Results Found</h2>
                <p className="text-white text-sm mb-6">
                  Try searching for something else.
                </p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-3 bg-orange-500 text-white rounded-xl font-medium"
                >
                  Clear Search
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Story Modal */}
      <StoryModal
        story={selectedStory}
        userCredits={userCredits}
        onClose={() => setSelectedStory(null)}
        onPlay={handlePlay}
        onWishlist={(story) => console.log('Add to wishlist:', story.id)}
      />
    </div>
  );
}
