'use client';

import React from 'react';
import { Story } from '@/lib/supabase';

interface StoryModalProps {
  story: Story | null;
  userCredits?: number;
  onClose: () => void;
  onPlay: (story: Story) => void;
  onWishlist?: (story: Story) => void;
}

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
  'Self Help': '🧠',
  'Educational': '📚',
  'Children': '🧒',
};

const BANNER_COLORS: Record<string, string> = {
  'New Release': 'bg-blue-500',
  "Reader's Choice": 'bg-yellow-500 text-black',
  'Staff Pick': 'bg-purple-500',
  'Most Popular': 'bg-red-500',
  'Trending': 'bg-pink-500',
  'Family Favorite': 'bg-green-500',
};

export const StoryModal = ({ 
  story, 
  userCredits = 999, 
  onClose, 
  onPlay,
  onWishlist 
}: StoryModalProps) => {
  if (!story) return null;

  const categoryIcon = CATEGORY_ICONS[story.genre] || '📚';
  const isFree = story.credits === 0;
  const canAfford = isFree || userCredits >= story.credits;
  const banner = story.is_new ? 'New Release' : story.is_featured ? 'Staff Pick' : null;
  const bannerColor = banner ? BANNER_COLORS[banner] || 'bg-gray-500' : '';

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-end justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 border-t border-gray-700 rounded-t-2xl w-full max-w-lg p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mb-4"></div>
        
        <div className="flex gap-4 mb-3">
          {story.cover_url ? (
            <img 
              src={story.cover_url}
              alt={story.title}
              className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div 
              className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}
            >
              {categoryIcon}
            </div>
          )}
          <div className="flex-1">
            {banner && (
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-1 ${bannerColor}`}>
                {banner}
              </span>
            )}
            <h2 className="text-xl font-bold text-white">{story.title}</h2>
            <p className="text-white text-sm">{story.author}</p>
            <p className="text-orange-400 text-sm">
              {categoryIcon} {story.genre} • {story.duration_mins} min
            </p>
          </div>
        </div>
        
        {story.description && (
          <p className="text-white text-sm mb-4">{story.description}</p>
        )}
        
        {canAfford ? (
          <>
            <div className="flex gap-3">
              <button 
                onClick={() => onPlay(story)}
                className="flex-1 py-4 bg-green-600 text-white text-lg font-bold rounded-xl"
              >
                ▶ Play Now
              </button>
              {onWishlist && (
                <button 
                  onClick={() => onWishlist(story)}
                  className="py-4 px-6 bg-gray-800 border border-gray-700 text-white rounded-xl"
                >
                  ♡
                </button>
              )}
            </div>
            {!isFree && (
              <p className="text-center text-white text-sm mt-3">
                Uses <span className="text-orange-400 font-bold">{story.credits} credits</span>
                {' '}• {userCredits - story.credits} remaining after
              </p>
            )}
          </>
        ) : (
          <>
            <button className="w-full py-4 bg-red-600 text-white text-lg font-bold rounded-xl">
              Buy Credits to Play
            </button>
            <p className="text-center text-red-400 text-sm mt-3">
              Requires {story.credits} credits • You have {userCredits}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default StoryModal;
