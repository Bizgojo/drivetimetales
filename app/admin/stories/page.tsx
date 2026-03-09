"""
ASC3 Stories To Test
List of all generated stories pending review and publishing
"""

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, Edit2, Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TestStory {
  id: string;
  title: string;
  series?: string;
  episode?: number;
  genre: string;
  duration: string;
  wordCount: number;
  status: 'pending' | 'in_review' | 'ready_to_publish' | 'published';
  createdAt: string;
  cover_image_url?: string;
  audio_url?: string;
  introPath?: string;
  storyPath?: string;
  outroPath?: string;
}

// ============================================================================
// STATUS BADGE
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_review: 'bg-blue-100 text-blue-800',
    ready_to_publish: 'bg-green-100 text-green-800',
    published: 'bg-purple-100 text-purple-800',
  };

  const labels = {
    pending: '⏳ Pending',
    in_review: '🔄 In Review',
    ready_to_publish: '✅ Ready',
    published: '🎉 Published',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status as keyof typeof colors]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  );
};

// ============================================================================
// STORY CARD
// ============================================================================

const StoryCard: React.FC<{ story: TestStory }> = ({ story }) => {
  return (
    <Link href={`/admin/stories/${story.id}`}>
      <div className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden cursor-pointer">
        {/* Cover Image */}
        <div className="relative w-full h-40 bg-gradient-to-br from-gray-200 to-gray-300">
          {story.cover_image_url ? (
            <img
              src={story.cover_image_url}
              alt={story.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <span className="text-4xl">📖</span>
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2 right-2">
            <StatusBadge status={story.status} />
          </div>

          {/* Duration Badge */}
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs font-medium">
            {story.duration}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Series/Episode */}
          {story.series && (
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {story.series} {story.episode && `• Episode ${story.episode}`}
            </p>
          )}

          {/* Title */}
          <h3 className="font-semibold text-lg line-clamp-2">{story.title}</h3>

          {/* Genre */}
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-100 px-2 py-1 rounded">{story.genre}</span>
          </div>

          {/* Word Count */}
          <p className="text-xs text-gray-600">
            {story.wordCount} words
          </p>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <button
              onClick={(e) => {
                e.preventDefault();
                // Play audio
              }}
              className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center justify-center gap-1 text-sm font-medium transition"
            >
              <Play size={16} />
              Play
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                // Edit story
              }}
              className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded flex items-center justify-center gap-1 text-sm font-medium transition"
            >
              <Edit2 size={16} />
              Edit
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
};

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function StoriesToTestPage() {
  const [stories, setStories] = useState<TestStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_review' | 'ready_to_publish' | 'published'>('all');

  useEffect(() => {
    const fetchStories = async () => {
      try {
        const res = await fetch('/api/asc3/stories-to-test');
        const data = await res.json();
        setStories(data.stories || []);
      } catch (error) {
        console.error('Failed to fetch stories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStories();
  }, []);

  const filteredStories =
    filter === 'all' ? stories : stories.filter((s) => s.status === filter);

  const counts = {
    all: stories.length,
    pending: stories.filter((s) => s.status === 'pending').length,
    in_review: stories.filter((s) => s.status === 'in_review').length,
    ready_to_publish: stories.filter((s) => s.status === 'ready_to_publish').length,
    published: stories.filter((s) => s.status === 'published').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Stories To Test</h1>
        <p className="text-gray-600 mt-2">Review, edit, and publish your generated stories</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-gray-600 text-sm">Total</p>
          <p className="text-2xl font-bold text-gray-900">{counts.all}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4 shadow-sm border border-yellow-200">
          <p className="text-yellow-700 text-sm font-medium">Pending</p>
          <p className="text-2xl font-bold text-yellow-900">{counts.pending}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 shadow-sm border border-blue-200">
          <p className="text-blue-700 text-sm font-medium">In Review</p>
          <p className="text-2xl font-bold text-blue-900">{counts.in_review}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-200">
          <p className="text-green-700 text-sm font-medium">Ready</p>
          <p className="text-2xl font-bold text-green-900">{counts.ready_to_publish}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 shadow-sm border border-purple-200">
          <p className="text-purple-700 text-sm font-medium">Published</p>
          <p className="text-2xl font-bold text-purple-900">{counts.published}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'in_review', 'ready_to_publish', 'published'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300'
            }`}
          >
            {f === 'all'
              ? 'All'
              : f === 'pending'
              ? 'Pending'
              : f === 'in_review'
              ? 'In Review'
              : f === 'ready_to_publish'
              ? 'Ready'
              : 'Published'}
          </button>
        ))}
      </div>

      {/* Stories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">Loading stories...</p>
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-12 text-center">
          <BookOpen className="mx-auto mb-4 text-blue-400" size={48} />
          <h3 className="text-lg font-semibold text-blue-900 mb-2">No stories yet</h3>
          <p className="text-blue-800 mb-4">
            {filter === 'all'
              ? 'Create your first story to get started'
              : `No stories in this category yet`}
          </p>
          <Link
            href="/admin/create-story"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Create Story
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}
