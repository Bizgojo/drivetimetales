'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { StoryCard, Story } from '@/components/ui/StoryCard';
import { StoryModal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';

export default function WishlistPage() {
  const { user } = useAuth();
  const { wishlist, removeFromWishlist, refetch } = useWishlist();
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wishlist.length > 0) {
      fetchStories();
    } else {
      setStories([]);
      setLoading(false);
    }
  }, [wishlist]);

  const fetchStories = async () => {
    try {
      const { data } = await supabase
        .from('stories')
        .select('*')
        .in('id', wishlist);
      setStories(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (storyId: string) => {
    await removeFromWishlist(storyId);
  };

  const handlePlay = (story: Story) => {
    window.location.href = `/player/${story.id}`;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-4">Please sign in to view wishlist</p>
          <Link href="/auth/login" className="px-6 py-3 bg-orange-500 text-white rounded-xl">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn showBack userCredits={user.credits} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-1">♡ Wishlist</h1>
        <p className="text-white text-sm mb-6">{stories.length} stories saved</p>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin text-4xl mb-4">⏳</div></div>
        ) : stories.length > 0 ? (
          <div className="space-y-4">
            {stories.map((story) => (
              <div key={story.id} className="relative">
                <StoryCard story={story} userCredits={user.credits} onClick={() => setSelectedStory(story)} />
                <button onClick={() => handleRemove(story.id)} className="absolute top-3 right-3 w-8 h-8 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center text-red-400 text-sm">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">♡</div>
            <h2 className="text-white text-lg font-bold mb-2">No Stories Saved</h2>
            <p className="text-white text-sm mb-6">Add stories to your wishlist to listen later.</p>
            <Link href="/library" className="inline-block px-6 py-3 bg-orange-500 text-white rounded-xl font-medium">Browse Stories</Link>
          </div>
        )}
      </div>

      <StoryModal story={selectedStory} userCredits={user.credits} onClose={() => setSelectedStory(null)} onPlay={handlePlay} />
    </div>
  );
}
