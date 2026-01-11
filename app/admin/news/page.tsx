'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { StoryCard } from '@/components/ui/StoryCard';
import { Story } from '@/lib/supabase';
import { StoryModal } from '@/components/ui/Modal';
import { CreditStatus } from '@/components/ui/CreditStatus';
import { DurationFilter, filterByDuration, getDurationCounts, DurationFilterValue } from '@/components/ui/DurationFilter';

// Sample stories - replace with actual data fetching
const sampleStories: Story[] = [
  { id: '1', title: 'The Last Mile', author: 'Jack Morrison', genre: 'Trucker Stories', duration_mins: 15, rating: 4.8, credits: 0, is_new: true, is_featured: false, play_count: 0, created_at: '', description: 'A veteran trucker faces his final haul across the desert, carrying cargo that will change everything he believes about loyalty and redemption.' },
  { id: '2', title: 'Midnight Diner', author: 'Sarah Chen', genre: 'Drama', duration_mins: 30, rating: 4.9, credits: 0, is_new: false, is_featured: true, play_count: 0, created_at: '', description: 'At a roadside diner that only appears after midnight, strangers share stories that blur the line between memory and dream.' },
  { id: '3', title: 'Route 66 Ghost', author: 'Mike Rivera', genre: 'Horror', duration_mins: 45, rating: 4.6, credits: 3, is_new: false, is_featured: false, play_count: 0, created_at: '', description: 'A hitchhiker on Route 66 discovers why some roads are better left untraveled after dark.' },
  { id: '4', title: 'The Long Haul', author: 'Lisa Park', genre: 'Mystery', duration_mins: 15, rating: 4.7, credits: 0, is_new: false, is_featured: true, play_count: 0, created_at: '', description: 'When a dispatcher receives a distress call from a truck that went missing 20 years ago, she must solve a decades-old mystery.' },
  { id: '5', title: 'Coffee & Confessions', author: 'Tom Bradley', genre: 'Drama', duration_mins: 30, rating: 4.5, credits: 0, is_new: false, is_featured: false, play_count: 0, created_at: '', description: 'Two strangers at a truck stop share secrets they\'ve never told anyone, finding unexpected connection on a rainy night.' },
  { id: '6', title: 'Neon Nights', author: 'Amy Walsh', genre: 'Thriller', duration_mins: 60, rating: 4.8, credits: 4, is_new: false, is_featured: true, play_count: 0, created_at: '', description: 'A cross-country chase through America\'s forgotten highways leads to a showdown under the neon lights of a desert motel.' },
];

export default function WelcomePage() {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [durationFilter, setDurationFilter] = useState<DurationFilterValue>('all');

  const filteredStories = filterByDuration(sampleStories, durationFilter);
  const counts = getDurationCounts(sampleStories);

  const handlePlay = (story: Story) => {
    // Navigate to player or show login prompt
    window.location.href = `/player/${story.id}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={false} />
      
      <div className="px-4 py-5">
        {/* Hero */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-2 text-white">
            Listen to Your Free Story Now!
          </h1>
          <p className="text-orange-500 font-semibold mb-1">
            No Sign Up Required
          </p>
          <p className="text-white text-sm">
            Click on a story you like and listen for free
          </p>
        </div>

        {/* Duration Filter */}
        <div className="mb-5">
          <DurationFilter 
            value={durationFilter} 
            onChange={setDurationFilter}
            counts={counts}
          />
        </div>

        {/* Story List */}
        <div className="space-y-4">
          {filteredStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={() => setSelectedStory(story)}
            />
          ))}
        </div>

        {/* Credits Info */}
        <div className="mt-6 p-4 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <p className="text-white text-sm">
            You have <span className="text-green-400 font-bold">2 free credits</span>. 
            Stories 30 min or less are free!
          </p>
        </div>
      </div>

      {/* Story Modal */}
      <StoryModal
        story={selectedStory}
        onClose={() => setSelectedStory(null)}
        onPlay={handlePlay}
      />
    </div>
  );
}
