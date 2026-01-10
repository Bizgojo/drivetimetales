'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { StoryModal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Story } from '@/lib/supabase';

interface Series {
  id: string;
  title: string;
  description: string;
  author: string;
  genre: string;
  cover_url?: string;
  total_episodes: number;
  total_duration_mins: number;
  is_complete: boolean;
}

interface Episode extends Story {
  episode_number: number;
  series_id: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params.id as string;
  const { user } = useAuth();
  
  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProgress, setUserProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (seriesId) fetchSeriesData();
  }, [seriesId]);

  const fetchSeriesData = async () => {
    try {
      const { data: seriesData } = await supabase.from('series').select('*').eq('id', seriesId).single();
      setSeries(seriesData);

      const { data: episodesData } = await supabase.from('stories').select('*').eq('series_id', seriesId).order('episode_number', { ascending: true });
      setEpisodes(episodesData || []);

      if (user?.id && episodesData) {
        const { data: progressData } = await supabase.from('user_stories').select('story_id, progress_seconds, completed').eq('user_id', user.id).in('story_id', episodesData.map(e => e.id));
        if (progressData) {
          const progress: Record<string, number> = {};
          progressData.forEach(p => { progress[p.story_id] = p.completed ? 100 : Math.round((p.progress_seconds / ((episodesData.find(e => e.id === p.story_id)?.duration_mins || 30) * 60)) * 100); });
          setUserProgress(progress);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (story: Story) => { window.location.href = `/player/${story.id}`; };
  const completedEpisodes = Object.values(userProgress).filter(p => p === 100).length;

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center"><div className="animate-spin text-4xl">🚛</div></div>;
  if (!series) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center"><div className="text-center"><div className="text-5xl mb-4">😢</div><h2 className="text-white text-xl mb-2">Series Not Found</h2><Link href="/browse" className="text-orange-400">← Back</Link></div></div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={!!user} showBack userCredits={user?.credits} />
      <div className="px-4 py-5">
        <div className="flex gap-4 mb-6">
          <div className="w-24 h-24 rounded-xl flex items-center justify-center text-4xl" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}>📺</div>
          <div className="flex-1">
            <span className="inline-block px-2 py-0.5 bg-violet-500 text-white text-xs rounded mb-1">SERIES</span>
            <h1 className="text-xl font-bold text-white">{series.title}</h1>
            <p className="text-white text-sm">{series.author}</p>
            <p className="text-white text-xs">{series.total_episodes} episodes • {series.total_duration_mins} min{series.is_complete && ' • Complete'}</p>
          </div>
        </div>

        {series.description && <p className="text-white text-sm mb-6">{series.description}</p>}

        {user && completedEpisodes > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-sm">Progress</span>
              <span className="text-orange-400 text-sm font-bold">{completedEpisodes}/{episodes.length}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${(completedEpisodes / episodes.length) * 100}%` }}/></div>
          </div>
        )}

        <h2 className="text-white font-bold mb-3">Episodes</h2>
        <div className="space-y-3">
          {episodes.map((ep) => {
            const progress = userProgress[ep.id] || 0;
            const done = progress === 100;
            return (
              <div key={ep.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-700" onClick={() => setSelectedStory(ep)}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-600' : progress > 0 ? 'bg-orange-500' : 'bg-gray-800'} text-white`}>{done ? '✓' : ep.episode_number}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{ep.title}</h3>
                    <p className="text-white text-xs">{ep.duration_mins} min • 💎 {ep.credits}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handlePlay(ep); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${done ? 'bg-gray-800' : 'bg-green-600'} text-white`}>{done ? '🔄' : '▶'}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <StoryModal story={selectedStory} userCredits={user?.credits || 0} onClose={() => setSelectedStory(null)} onPlay={handlePlay} />
    </div>
  );
}
