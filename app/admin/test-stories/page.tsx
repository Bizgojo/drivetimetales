'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface TestStory {
  id: string;
  story_type: string;
  title: string;
  brief_data: string;
  outline_text: string;
  word_count: number;
  duration_seconds: number;
  openai_mp3_url: string;
  status: 'test_ready' | 'pending_review' | 'approved' | 'published' | 'discarded';
  revision_notes?: string;
  created_at: string;
  updated_at: string;
}

export default function TestStoriesPage() {
  const [stories, setStories] = useState<TestStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const response = await fetch('/api/admin/test-stories');
      if (!response.ok) throw new Error('Failed to fetch stories');
      const data = await response.json();
      setStories(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading stories');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/admin/test-stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      });
      if (!response.ok) throw new Error('Failed to approve story');
      fetchStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error approving story');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDiscard = async (id: string) => {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/admin/test-stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'discarded' })
      });
      if (!response.ok) throw new Error('Failed to discard story');
      fetchStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error discarding story');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const groupedStories = {
    test_ready: stories.filter(s => s.status === 'test_ready'),
    approved: stories.filter(s => s.status === 'approved'),
    discarded: stories.filter(s => s.status === 'discarded')
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Test Stories</h1>
        <p className="text-gray-400 mb-8">Review test audio and approve stories for final ElevenLabs production</p>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading stories...</p>
        ) : (
          <>
            {/* TEST READY SECTION */}
            {groupedStories.test_ready.length > 0 && (
              <section className="mb-12">
                <h2 className="text-2xl font-bold text-orange-500 mb-4">
                  Ready for Review ({groupedStories.test_ready.length})
                </h2>
                <div className="grid gap-6">
                  {groupedStories.test_ready.map(story => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onApprove={handleApprove}
                      onDiscard={handleDiscard}
                      isUpdating={updatingId === story.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* APPROVED SECTION */}
            {groupedStories.approved.length > 0 && (
              <section className="mb-12">
                <h2 className="text-2xl font-bold text-green-500 mb-4">
                  Approved - Ready for ElevenLabs ({groupedStories.approved.length})
                </h2>
                <div className="grid gap-6">
                  {groupedStories.approved.map(story => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onApprove={handleApprove}
                      onDiscard={handleDiscard}
                      isUpdating={updatingId === story.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* DISCARDED SECTION */}
            {groupedStories.discarded.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-600 mb-4">
                  Discarded ({groupedStories.discarded.length})
                </h2>
                <div className="grid gap-6">
                  {groupedStories.discarded.map(story => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onApprove={handleApprove}
                      onDiscard={handleDiscard}
                      isUpdating={updatingId === story.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {stories.length === 0 && (
              <p className="text-gray-400 text-center py-12">No test stories yet</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface StoryCardProps {
  story: TestStory;
  onApprove: (id: string) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
  isUpdating: boolean;
}

function StoryCard({ story, onApprove, onDiscard, isUpdating }: StoryCardProps) {
  const statusColors = {
    test_ready: 'border-orange-500 bg-orange-500/10',
    approved: 'border-green-500 bg-green-500/10',
    discarded: 'border-gray-600 bg-gray-900/50',
    pending_review: 'border-blue-500 bg-blue-500/10',
    published: 'border-purple-500 bg-purple-500/10'
  };

  const statusBadges = {
    test_ready: 'bg-orange-500/20 text-orange-300',
    approved: 'bg-green-500/20 text-green-300',
    discarded: 'bg-gray-700 text-gray-300',
    pending_review: 'bg-blue-500/20 text-blue-300',
    published: 'bg-purple-500/20 text-purple-300'
  };

  return (
    <div className={`border-2 rounded-lg p-6 ${statusColors[story.status]}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-2">{story.title}</h3>
          <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${statusBadges[story.status]}`}>
            {story.status.replace('_', ' ').toUpperCase()}
          </span>
          <div className="text-gray-400 text-sm mt-2 space-y-1">
            <p><strong>Type:</strong> {story.story_type}</p>
            <p><strong>Duration:</strong> {formatDuration(story.duration_seconds)} ({story.word_count} words)</p>
          </div>
        </div>
      </div>

      <p className="text-gray-300 mb-6 line-clamp-2">{story.brief_data}</p>

      {/* Audio Player */}
      {story.openai_mp3_url && (
        <div className="bg-slate-900 rounded p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">Test Audio (OpenAI TTS):</p>
          <audio controls className="w-full">
            <source src={story.openai_mp3_url} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Action Buttons */}
      {story.status !== 'discarded' && (
        <div className="flex gap-3">
          {story.status === 'test_ready' && (
            <button
              onClick={() => onApprove(story.id)}
              disabled={isUpdating}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition"
            >
              {isUpdating ? 'Approving...' : '✓ Approve for ElevenLabs'}
            </button>
          )}
          {story.status === 'approved' && (
            <div className="flex-1 bg-green-600/30 text-green-300 font-bold py-2 px-4 rounded text-center">
              ✓ Approved
            </div>
          )}
          <button
            onClick={() => onDiscard(story.id)}
            disabled={isUpdating}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition"
          >
            ✕ Discard
          </button>
        </div>
      )}

      {story.status === 'discarded' && (
        <p className="text-gray-400 text-sm italic">This story has been discarded.</p>
      )}
    </div>
  );
}
