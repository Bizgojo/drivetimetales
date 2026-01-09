'use client';

import React, { useState } from 'react';

const CATEGORIES = [
  { id: 'national', label: 'National News', icon: '🗞️' },
  { id: 'international', label: 'International News', icon: '🌍' },
  { id: 'business', label: 'Business & Finance', icon: '💼' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'science', label: 'Science & Technology', icon: '🔬' },
];

const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
];

export default function NewsManagementPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [categoryVoices, setCategoryVoices] = useState<Record<string, string>>({
    national: 'EXAVITQu4vr4xnSDxMaL',
    international: '21m00Tcm4TlvDq8ikWAM',
    business: 'ErXwobaYiN019PkySvjV',
    sports: 'VR6AewLTigWG4xSOukaG',
    science: 'pNInz6obpgDQGcFmaJgB',
  });
  const [times, setTimes] = useState(['06:00', '12:00', '18:00']);
  const [timezone, setTimezone] = useState('America/New_York');

  const handleGenerate = async (categoryId: string) => {
    setGenerating(categoryId);
    try {
      await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId }),
      });
    } catch (err) {
      console.error('Generation failed:', err);
    }
    setGenerating(null);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">📰 News Management</h1>
      
      {/* Schedule */}
      <div className="bg-gray-900 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">⏰ Generation Schedule</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-sm">Morning</label>
            <input
              type="time"
              value={times[0]}
              onChange={(e) => setTimes([e.target.value, times[1], times[2]])}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Midday</label>
            <input
              type="time"
              value={times[1]}
              onChange={(e) => setTimes([times[0], e.target.value, times[2]])}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Evening</label>
            <input
              type="time"
              value={times[2]}
              onChange={(e) => setTimes([times[0], times[1], e.target.value])}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div>
          <label className="text-gray-400 text-sm">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
          </select>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">📂 Categories & Voices</h2>
        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-white font-medium">{cat.label}</span>
              </div>
              <div className="flex items-center gap-4">
                <select
                  value={categoryVoices[cat.id]}
                  onChange={(e) => setCategoryVoices({ ...categoryVoices, [cat.id]: e.target.value })}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleGenerate(cat.id)}
                  disabled={generating !== null}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-600 text-white rounded-lg"
                >
                  {generating === cat.id ? '⏳' : '▶️'} Generate
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
