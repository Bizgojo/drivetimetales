'use client';

import React from 'react';

export type DurationFilterValue = 'all' | '15' | '30' | '1hr';

interface DurationFilterProps {
  value: DurationFilterValue;
  onChange: (value: DurationFilterValue) => void;
  counts: {
    all: number;
    short: number;  // ~15 min
    medium: number; // ~30 min
    long: number;   // ~1 hr
  };
}

export const DurationFilter = ({ value, onChange, counts }: DurationFilterProps) => {
  const DurationButton = ({ 
    id, 
    label, 
    count 
  }: { 
    id: DurationFilterValue; 
    label: string; 
    count: number; 
  }) => (
    <button 
      onClick={() => onChange(id)}
      className={`flex-1 py-2 rounded-lg text-center ${
        value === id 
          ? 'bg-orange-500 text-white' 
          : 'bg-gray-800 text-white'
      }`}
    >
      <div className="text-xs font-medium">{label}</div>
      <div className={`text-[10px] ${value === id ? 'text-orange-100' : 'text-white'}`}>
        {count} stories
      </div>
    </button>
  );

  return (
    <div className="flex gap-2">
      <DurationButton id="all" label="All Lengths" count={counts.all} />
      <DurationButton id="15" label="~15 min" count={counts.short} />
      <DurationButton id="30" label="~30 min" count={counts.medium} />
      <DurationButton id="1hr" label="~1 hr" count={counts.long} />
    </div>
  );
};

// Helper to filter stories by duration
export const filterByDuration = <T extends { duration: number }>(
  stories: T[], 
  filter: DurationFilterValue
): T[] => {
  switch (filter) {
    case '15':
      return stories.filter(s => s.duration <= 20);
    case '30':
      return stories.filter(s => s.duration > 20 && s.duration <= 40);
    case '1hr':
      return stories.filter(s => s.duration > 40);
    default:
      return stories;
  }
};

// Helper to get counts for duration filters
export const getDurationCounts = <T extends { duration: number }>(stories: T[]) => ({
  all: stories.length,
  short: stories.filter(s => s.duration <= 20).length,
  medium: stories.filter(s => s.duration > 20 && s.duration <= 40).length,
  long: stories.filter(s => s.duration > 40).length,
});

export default DurationFilter;
