'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { StoryCard } from '@/components/ui/StoryCard';
import { Story } from '@/lib/supabase';
import { StoryModal } from '@/components/ui/Modal';
import { CreditStatus } from '@/components/ui/CreditStatus';
import { DurationFilter, filterByDuration, getDurationCounts, DurationFilterValue } from '@/components/ui/DurationFilter';
// Sample data - replace with actual data fetching
const sampleStories: Story[] = [
  { id: '1', title: 'The Midnight Haul', author: 'Jack Morrison', category: 'Trucker Stories', duration: 30, rating: 4.8, credits: 2, banner: 'New Release', description: 'A veteran trucker faces his final haul across the desert, carrying cargo that will change everything he believes about loyalty and redemption.' },
  { id: '2', title: 'Desert Run', author: 'Sarah Chen', category: 'Adventure', duration: 25, rating: 4.9, credits: 2, banner: "Reader's Choice", description: 'A solo journey through the Mojave becomes a race against time when a mysterious package must be delivered before sunrise.' },
  { id: '3', title: 'Ghost Frequencies', author: 'Mike Torres', category: 'Horror', duration: 45, rating: 4.6, credits: 3, description: 'Late night radio signals lead a long-haul driver to discover transmissions from beyond the grave.' },
  { id: '4', title: 'Highway Hearts', author: 'Lisa Park', category: 'Drama', duration: 60, rating: 4.7, credits: 4, banner: 'Staff Pick', description: 'Two strangers meet at a truck stop and discover their paths have crossed before in ways neither expected.' },
  { id: '5', title: 'The Long Haul', author: 'Tom Bradley', category: 'Mystery', duration: 35, rating: 4.5, credits: 2, description: 'When a dispatcher receives a distress call from a truck that went missing 20 years ago, she must solve a decades-old mystery.' },
  { id: '6', title: 'Neon Nights', author: 'Amy Walsh', category: 'Thriller', duration: 50, rating: 4.8, credits: 3, banner: 'Most Popular', description: 'A cross-country chase through America\'s forgotten highways leads to a showdown under the neon lights of a desert motel.' },
  { id: '7', title: 'Star Runner', author: 'Dan Blake', category: 'Sci-Fi', duration: 40, rating: 4.4, credits: 3, description: 'In 2150, interstellar truckers haul cargo between planets, but one shipment contains something that could change humanity.' },
  { id: '8', title: 'Bedtime Journey', author: 'Mary Johnson', category: 'Children', duration: 15, rating: 4.9, credits: 1, banner: 'Family Favorite', description: 'A magical bedtime story about a friendly truck driver who delivers dreams to children around the world.' },
];

interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
  color: string;
}

const categories: Category[] = [
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

export default function LibraryPage() {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [durationFilter, setDurationFilter] = useState<DurationFilterValue>('all');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showCategoryPage, setShowCategoryPage] = useState(false);
  
  // TODO: Get from auth context
  const userCredits = 3;
  const isLoggedIn = true;

  // Filter stories
  const categoryFilteredStories = selectedCategory 
    ? sampleStories.filter(s => s.category === selectedCategory.name)
    : sampleStories;
  
  const filteredStories = filterByDuration(categoryFilteredStories, durationFilter);
  const counts = getDurationCounts(categoryFilteredStories);

  const handlePlay = (story: Story) => {
    window.location.href = `/player/${story.id}`;
  };

  const handleCategorySelect = (category: Category | null) => {
    setSelectedCategory(category);
    setShowCategoryPage(false);
    setDurationFilter('all');
  };

  // Category Selection Page
  if (showCategoryPage) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header isLoggedIn={isLoggedIn} userCredits={userCredits} showBack />
        
        <div className="px-5 py-6">
          <h1 className="text-2xl font-bold text-white mb-6">Select Category</h1>
          
          {/* All Categories Button */}
          <button
            onClick={() => handleCategorySelect(null)}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 mb-4 flex items-center justify-center gap-2"
          >
            <span className="text-xl">📂</span>
            <span className="text-white font-bold text-lg">All Categories</span>
            <span className="text-white/70 text-sm">({sampleStories.length} stories)</span>
          </button>
          
          {/* Category Grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat)}
                className={`bg-gradient-to-br ${cat.color} rounded-xl p-3 text-left flex items-center gap-2 h-14`}
              >
                <div className="text-xl">{cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm leading-tight">{cat.name}</div>
                  <div className="text-white/70 text-xs">{cat.count}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Series Button */}
          <Link
            href="/browse"
            className="w-full bg-gradient-to-r from-violet-600 to-violet-800 rounded-xl p-4 flex items-center justify-center gap-2"
          >
            <span className="text-xl">📺</span>
            <span className="text-white font-bold text-lg">Series</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={isLoggedIn} userCredits={userCredits} />
      
      <div className="px-4 py-5">
        {/* Title */}
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-white mb-1">📖 Story Library</h1>
          <CreditStatus credits={userCredits} />
        </div>

        {/* Category Buttons */}
        <div className="flex gap-2 mb-4">
          {selectedCategory ? (
            <button
              className={`flex-1 py-3 bg-gradient-to-r ${selectedCategory.color} text-white rounded-xl font-medium`}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{selectedCategory.icon}</span>
                <span>{selectedCategory.name}</span>
              </div>
              <div className="text-white/70 text-xs">{selectedCategory.count} stories</div>
            </button>
          ) : (
            <button
              className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium"
            >
              <div className="flex items-center justify-center gap-2">
                <span>📂</span>
                <span>All Categories</span>
              </div>
              <div className="text-white/70 text-xs">{sampleStories.length} stories</div>
            </button>
          )}
          <button
            onClick={() => setShowCategoryPage(true)}
            className="flex-1 py-3 bg-gray-800 border border-gray-700 text-white rounded-xl font-medium flex items-center justify-center gap-2"
          >
            🏷️ Select Category
          </button>
        </div>

        {/* Duration Filter */}
        <div className="mb-5">
          <DurationFilter 
            value={durationFilter} 
            onChange={setDurationFilter}
            counts={counts}
          />
        </div>

        {/* Results */}
        <p className="text-white text-sm mb-3">{filteredStories.length} stories found</p>

        {/* Story List */}
        <div className="space-y-4">
          {filteredStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              userCredits={userCredits}
              onClick={() => setSelectedStory(story)}
            />
          ))}
        </div>

        {/* Empty State */}
        {filteredStories.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📖</div>
            <h2 className="text-white text-lg font-bold mb-2">No Stories Found</h2>
            <p className="text-white text-sm mb-6">Try adjusting your filters.</p>
            <button 
              onClick={() => { setDurationFilter('all'); setSelectedCategory(null); }}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl font-medium"
            >
              Clear Filters
            </button>
          </div>
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
