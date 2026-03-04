'use client';

import React, { useState } from 'react';

interface Post {
  id: string;
  platform: string;
  content: string;
  respondingTo?: string;
  status: 'draft' | 'posted';
}

interface PlatformData {
  name: string;
  username: string;
  postsNeeded: number;
  posts: Post[];
}

const SocialPostingAdmin = () => {
  const [platforms, setPlatforms] = useState<PlatformData[]>([
    {
      name: 'Reddit',
      username: 'EndlessTalesAudio',
      postsNeeded: 12,
      posts: [
        {
          id: '1',
          platform: 'Reddit',
          content: 'Check out this heartwarming dog story from our collection. Perfect for a quick listen during your morning routine!',
          respondingTo: 'r/Mommit - Wholesome stories thread',
          status: 'draft',
        },
        {
          id: '2',
          platform: 'Reddit',
          content: 'New audio drama series launching April 1st! 15-minute episodes perfect for your workout.',
          respondingTo: 'r/audiodrama - New releases thread',
          status: 'draft',
        },
      ],
    },
    {
      name: 'X (Twitter)',
      username: '@EndlessTalesApp',
      postsNeeded: 10,
      posts: [
        {
          id: '3',
          platform: 'X',
          content: '🎧 New story dropping soon: "The Girl Who Read to Strays" - A heartwarming tale about connection. Coming April 1st.',
          respondingTo: 'Main feed',
          status: 'draft',
        },
      ],
    },
    {
      name: 'TikTok',
      username: '@EndlessTalesApp',
      postsNeeded: 8,
      posts: [
        {
          id: '4',
          platform: 'TikTok',
          content: '[30-second clip] Dog lovers, this one\'s for you. Full story launching April 1st.',
          respondingTo: '#DogLover #AudioStories',
          status: 'draft',
        },
      ],
    },
    {
      name: 'Instagram',
      username: '@endlessaudiotales',
      postsNeeded: 6,
      posts: [
        {
          id: '5',
          platform: 'Instagram',
          content: 'Stories for every moment. 🎧 Launching April 1st. Commutes, workouts, chores—we\'ve got the perfect story for you.',
          respondingTo: 'Main feed + Stories',
          status: 'draft',
        },
      ],
    },
    {
      name: 'Facebook',
      username: 'Endless Tales',
      postsNeeded: 7,
      posts: [
        {
          id: '6',
          platform: 'Facebook',
          content: 'Meet Endless Tales - audio storytelling for housewives, fitness enthusiasts, and everyone in between. Join our community!',
          respondingTo: 'Main page feed',
          status: 'draft',
        },
      ],
    },
    {
      name: 'Pinterest',
      username: 'yourendlesstales',
      postsNeeded: 5,
      posts: [
        {
          id: '7',
          platform: 'Pinterest',
          content: 'Cozy stories for your me-time. 13 heartwarming dog tales launching April 1st.',
          respondingTo: 'Board: Audio Stories & Recommendations',
          status: 'draft',
        },
      ],
    },
  ]);

  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  const handleDeletePost = (platformName: string, postId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.name === platformName) {
          return {
            ...p,
            posts: p.posts.filter((post) => post.id !== postId),
            postsNeeded: p.postsNeeded - 1,
          };
        }
        return p;
      })
    );
    setEditingPost(null);
  };

  const handlePostSubmit = (platformName: string) => {
    if (!editingPost) return;

    setPlatforms(
      platforms.map((p) => {
        if (p.name === platformName) {
          return {
            ...p,
            posts: p.posts.map((post) =>
              post.id === editingPost.id ? { ...editingPost, status: 'posted' as const } : post
            ),
          };
        }
        return p;
      })
    );
    setEditingPost(null);
  };

  const handleEditChange = (field: keyof Post, value: string) => {
    if (editingPost) {
      setEditingPost({ ...editingPost, [field]: value });
    }
  };

  const totalPostsNeeded = platforms.reduce((sum, p) => sum + p.postsNeeded, 0);
  const totalPostsDrafted = platforms.reduce((sum, p) => sum + p.posts.length, 0);

  return (
    <div className="min-h-screen bg-white text-black p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-black">Social Media Posting Hub</h1>
        <p className="text-gray-700">Manage all your posts across 6 platforms from one place</p>
        <div className="mt-4 flex gap-8">
          <div className="bg-orange-100 border border-orange-300 rounded-lg p-4">
            <p className="text-sm text-gray-700">Posts Drafted</p>
            <p className="text-3xl font-bold text-orange-600">{totalPostsDrafted}</p>
          </div>
          <div className="bg-orange-100 border border-orange-300 rounded-lg p-4">
            <p className="text-sm text-gray-700">Total Posts Needed</p>
            <p className="text-3xl font-bold text-orange-600">{totalPostsNeeded}</p>
          </div>
        </div>
      </div>

      {/* Platforms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {platforms.map((platform) => (
          <div key={platform.name} className="bg-white border-2 border-gray-300 rounded-lg overflow-hidden shadow-sm">
            {/* Platform Header */}
            <button
              onClick={() => setExpandedPlatform(expandedPlatform === platform.name ? null : platform.name)}
              className="w-full bg-gray-100 hover:bg-gray-200 transition p-4 flex items-center justify-between border-b border-gray-300"
            >
              <div className="text-left">
                <h2 className="text-xl font-bold text-black">{platform.name}</h2>
                <p className="text-sm text-gray-700">{platform.username}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-orange-600 text-white rounded-full px-3 py-1 text-sm font-bold">
                  {platform.postsNeeded} needed
                </div>
                <span className={`text-2xl transition-transform text-black ${expandedPlatform === platform.name ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </button>

            {/* Expanded Posts */}
            {expandedPlatform === platform.name && (
              <div className="p-6 space-y-4 border-t border-gray-300">
                {platform.posts.length === 0 ? (
                  <p className="text-gray-700 text-center py-4">No posts drafted yet</p>
                ) : (
                  platform.posts.map((post) => (
                    <div
                      key={post.id}
                      className={`p-4 rounded-lg border-2 ${
                        post.status === 'posted'
                          ? 'border-green-400 bg-green-50'
                          : 'border-orange-300 bg-orange-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            post.status === 'posted'
                              ? 'bg-green-200 text-green-900'
                              : 'bg-orange-200 text-orange-900'
                          }`}
                        >
                          {post.status === 'posted' ? '✓ POSTED' : 'DRAFT'}
                        </span>
                      </div>

                      {editingPost?.id === post.id ? (
                        <div className="space-y-3">
                          <textarea
                            value={editingPost.content}
                            onChange={(e) => handleEditChange('content', e.target.value)}
                            className="w-full bg-white border border-gray-400 rounded p-3 text-black text-sm focus:outline-none focus:border-orange-600"
                            rows={4}
                          />
                          <input
                            type="text"
                            value={editingPost.respondingTo || ''}
                            onChange={(e) => handleEditChange('respondingTo', e.target.value)}
                            placeholder="What is this responding to?"
                            className="w-full bg-white border border-gray-400 rounded p-3 text-black text-sm focus:outline-none focus:border-orange-600"
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePostSubmit(platform.name)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2 transition"
                            >
                              ✈️ Post Now
                            </button>
                            <button
                              onClick={() => setEditingPost(null)}
                              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeletePost(platform.name, post.id)}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-black mb-2">{post.content}</p>
                          <p className="text-xs text-gray-700 mb-3">
                            <strong>Responding to:</strong> {post.respondingTo}
                          </p>

                          {post.status === 'draft' && (
                            <button
                              onClick={() => setEditingPost(post)}
                              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition"
                            >
                              Edit & Post
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SocialPostingAdmin;
