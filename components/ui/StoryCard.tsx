'use client';

import React from 'react';

export interface Story {
  id: string;
  title: string;
  author: string;
  category: string;
  duration: number;
  rating: number;
  reviews?: number;
  credits: number;
  description?: string;
  banner?: string | null;
  coverUrl?: string;
  isFree?: boolean;
}

interface StoryCardProps {
  story: Story;
  userCredits?: number;
  showDescription?: boolean;
  onClick?: () => void;
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

export const StoryCard = ({ 
  story, 
  userCredits = 999, 
  showDescription = true,
  onClick 
}: StoryCardProps) => {
  const categoryIcon = CATEGORY_ICONS[story.category] || '📚';
  const bannerColor = story.banner ? BANNER_COLORS[story.banner] || 'bg-gray-500' : '';
  const canAfford = userCredits >= story.credits;

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    return (
      <span className="text-yellow-400">
        {'★'.repeat(fullStars)}{hasHalf ? '½' : ''}{'☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0))}
      </span>
    );
  };

  return (
    <div 
      className="p-3 bg-gray-900 border border-gray-800 rounded-xl cursor-pointer hover:border-gray-700 transition-colors"
      onClick={onClick}
    >
      <div className="flex gap-4">
        {/* Album Cover */}
        <div className="flex-shrink-0">
          {story.coverUrl ? (
            <img 
              src={story.coverUrl} 
              alt={story.title}
              className="w-24 h-24 rounded-xl object-cover shadow-lg"
            />
          ) : (
            <div 
              className="w-24 h-24 rounded-xl flex items-center justify-center text-4xl shadow-lg"
              style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}
            >
              {categoryIcon}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Banner */}
          {story.banner && (
            <span className={`self-start px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide mb-1 ${bannerColor}`}>
              {story.banner}
            </span>
          )}
          
          {/* Title */}
          <h3 className="text-lg font-bold text-white leading-tight mb-0.5 truncate">
            {story.title}
          </h3>
          
          {/* Author */}
          <p className="text-white text-sm mb-1">{story.author}</p>
          
          {/* Category • Duration */}
          <p className="text-orange-400 text-sm mb-1">
            {categoryIcon} {story.category} • {story.duration} min
          </p>
          
          {/* Stars + Credits Badge */}
          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-1">
              <span className="text-sm">{renderStars(story.rating)}</span>
              <span className="text-white text-xs">{story.rating}</span>
            </div>
            
            {story.isFree ? (
              <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                ▶ FREE
              </span>
            ) : (
              <span className={`px-3 py-1 text-white text-xs font-bold rounded-full ${
                canAfford ? 'bg-orange-500' : 'bg-red-500'
              }`}>
                💎 {story.credits} credits
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {showDescription && story.description && (
        <p className="text-sm text-white leading-relaxed mt-3 line-clamp-2">
          {story.description}
        </p>
      )}
    </div>
  );
};

export default StoryCard;
