'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Story {
  id: string;
  title: string;
  author: string;
  genre: string;
  description?: string;
  duration_mins: number;
  credits: number;
  play_count: number;
  is_new: boolean;
  is_featured: boolean;
  is_free?: boolean;
  audio_url?: string;
  cover_url?: string;
  created_at: string;
}

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);

  const genres = ['all', 'Mystery', 'Drama', 'Sci-Fi', 'Horror', 'Comedy', 'Romance', 'Trucker Stories', 'Thriller'];

  useEffect(() => {
    fetchStories();
  }, []);

  async function fetchStories() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${url}/rest/v1/stories?select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStories(data || []);
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFeatured(story: Story) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/stories?id=eq.${story.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_featured: !story.is_featured }),
        }
      );

      if (response.ok) {
        setStories(stories.map(s => 
          s.id === story.id ? { ...s, is_featured: !s.is_featured } : s
        ));
      }
    } catch (error) {
      console.error('Error updating story:', error);
    }
  }

  async function deleteStory(storyId: string) {
    if (!confirm('Are you sure you want to delete this story? This cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/stories?id=eq.${storyId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      if (response.ok) {
        setStories(stories.filter(s => s.id !== storyId));
        setSelectedStory(null);
        alert('Story deleted successfully');
      } else {
        alert('Failed to delete story');
      }
    } catch (error) {
      console.error('Error deleting story:', error);
      alert('Error deleting story');
    } finally {
      setDeleting(false);
    }
  }

  const filteredStories = stories.filter(story => {
    const matchesSearch = 
      story.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      story.author.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesGenre = genreFilter === 'all' || story.genre === genreFilter;

    return matchesSearch && matchesGenre;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading stories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">📚 Stories</h1>
          <p className="text-gray-400">Manage your audio drama library</p>
        </div>
        <Link
          href="/admin/stories/new"
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl transition-colors flex items-center gap-2"
        >
          <span>➕</span> Add Story
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Total Stories</span>
          <p className="text-2xl font-bold text-white">{stories.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Featured</span>
          <p className="text-2xl font-bold text-orange-400">
            {stories.filter(s => s.is_featured).length}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Total Plays</span>
          <p className="text-2xl font-bold text-white">
            {stories.reduce((sum, s) => sum + (s.play_count || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Avg Duration</span>
          <p className="text-2xl font-bold text-white">
            {Math.round(stories.reduce((sum, s) => sum + (s.duration_mins || 0), 0) / (stories.length || 1))} min
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by title or author..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
        >
          {genres.map(genre => (
            <option key={genre} value={genre}>
              {genre === 'all' ? 'All Genres' : genre}
            </option>
          ))}
        </select>
      </div>

      {/* Stories Grid */}
      {filteredStories.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <span className="text-4xl mb-4 block">📭</span>
          <p className="text-gray-400">No stories found</p>
          <Link href="/admin/stories/new" className="text-orange-400 hover:underline mt-2 inline-block">
            Add your first story →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStories.map((story) => (
            <div
              key={story.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors"
            >
              {/* Cover */}
              <div className="h-40 bg-gray-800 relative">
                {story.cover_url ? (
                  <img
                    src={story.cover_url}
                    alt={story.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl opacity-30">🎧</span>
                  </div>
                )}
                
                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-2">
                  {story.is_featured && (
                    <span className="px-2 py-1 bg-orange-500 text-black text-xs font-bold rounded">
                      Featured
                    </span>
                  )}
                  {story.is_new && (
                    <span className="px-2 py-1 bg-green-500 text-black text-xs font-bold rounded">
                      New
                    </span>
                  )}
                </div>

                {/* Play count */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                  ▶ {story.play_count?.toLocaleString() || 0}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-white font-bold truncate">{story.title}</h3>
                <p className="text-gray-400 text-sm">{story.author}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <span>{story.genre}</span>
                  <span>•</span>
                  <span>{story.duration_mins} min</span>
                  <span>•</span>
                  <span>{story.credits} credit{story.credits !== 1 ? 's' : ''}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => toggleFeatured(story)}
                    className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                      story.is_featured
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {story.is_featured ? '⭐ Featured' : '☆ Feature'}
                  </button>
                  <button
                    onClick={() => setSelectedStory(story)}
                    className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Story Detail Modal */}
      {selectedStory && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Cover */}
            <div className="h-48 bg-gray-800 relative">
              {selectedStory.cover_url ? (
                <img
                  src={selectedStory.cover_url}
                  alt={selectedStory.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-6xl opacity-30">🎧</span>
                </div>
              )}
              <button
                onClick={() => setSelectedStory(null)}
                className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-1">{selectedStory.title}</h2>
              <p className="text-gray-400 mb-4">by {selectedStory.author}</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-sm">Genre</span>
                  <p className="text-white font-medium">{selectedStory.genre}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-sm">Duration</span>
                  <p className="text-white font-medium">{selectedStory.duration_mins} minutes</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-sm">Credits</span>
                  <p className="text-white font-medium">{selectedStory.credits}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-400 text-sm">Play Count</span>
                  <p className="text-white font-medium">{selectedStory.play_count?.toLocaleString() || 0}</p>
                </div>
              </div>

              {selectedStory.description && (
                <div className="mb-4">
                  <span className="text-gray-400 text-sm">Description</span>
                  <p className="text-white mt-1">{selectedStory.description}</p>
                </div>
              )}

              <div className="mb-4">
                <span className="text-gray-400 text-sm">Created</span>
                <p className="text-white">{formatDate(selectedStory.created_at)}</p>
              </div>

              {selectedStory.audio_url && (
                <div className="mb-4">
                  <span className="text-gray-400 text-sm">Audio</span>
                  <audio controls className="w-full mt-2">
                    <source src={selectedStory.audio_url} type="audio/mpeg" />
                  </audio>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
                <button
                  onClick={() => toggleFeatured(selectedStory)}
                  className={`flex-1 py-2 rounded-xl transition-colors ${
                    selectedStory.is_featured
                      ? 'bg-orange-500 text-black font-bold'
                      : 'bg-gray-800 text-white'
                  }`}
                >
                  {selectedStory.is_featured ? '⭐ Featured' : '☆ Add to Featured'}
                </button>
                <button
                  onClick={() => deleteStory(selectedStory.id)}
                  disabled={deleting}
                  className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
