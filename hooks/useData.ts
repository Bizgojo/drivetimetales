'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Story, UserStory } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Hook to fetch stories with optional filters
export function useStories(options?: {
  category?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
}) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false });

      if (options?.category) {
        query = query.eq('genre', options.category);
      }
      if (options?.featured) {
        query = query.eq('is_featured', true);
      }
      if (options?.search) {
        query = query.or(
          `title.ilike.%${options.search}%,author.ilike.%${options.search}%,description.ilike.%${options.search}%`
        );
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      setStories(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [options?.category, options?.featured, options?.search, options?.limit]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return { stories, loading, error, refetch: fetchStories };
}

// Hook to fetch a single story
export function useStory(id: string) {
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchStory() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setStory(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchStory();
    }
  }, [id]);

  return { story, loading, error };
}

// Hook to fetch user's story collection
export function useUserCollection() {
  const { user, session } = useAuth();
  const [collection, setCollection] = useState<(UserStory & { story: Story })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCollection = useCallback(async () => {
    if (!user?.id) {
      setCollection([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_stories')
        .select(`
          *,
          story:stories(*)
        `)
        .eq('user_id', user.id)
        .order('last_played_at', { ascending: false });

      if (error) throw error;
      setCollection(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  return { collection, loading, error, refetch: fetchCollection };
}

// Hook to check if user owns a story
export function useOwnsStory(storyId: string) {
  const { user } = useAuth();
  const [owns, setOwns] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkOwnership() {
      if (!user?.id || !storyId) {
        setOwns(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_stories')
          .select('id')
          .eq('user_id', user.id)
          .eq('story_id', storyId)
          .single();

        setOwns(!!data && !error);
      } catch {
        setOwns(false);
      } finally {
        setLoading(false);
      }
    }

    checkOwnership();
  }, [user?.id, storyId]);

  return { owns, loading };
}

// Hook to purchase a story
export function usePurchaseStory() {
  const { session, refreshCredits } = useAuth();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchase = async (storyId: string) => {
    if (!session?.access_token) {
      setError('Please sign in to purchase');
      return { success: false };
    }

    try {
      setPurchasing(true);
      setError(null);

      const response = await fetch('/api/user/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ storyId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to purchase');
        return { success: false, error: data.error };
      }

      // Refresh user credits
      await refreshCredits();

      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to purchase';
      setError(message);
      return { success: false, error: message };
    } finally {
      setPurchasing(false);
    }
  };

  return { purchase, purchasing, error };
}

// Hook to update play progress
export function usePlayProgress(storyId: string) {
  const { user } = useAuth();

  const updateProgress = useCallback(async (progressSeconds: number, completed: boolean = false) => {
    if (!user?.id || !storyId) return;

    try {
      await supabase
        .from('user_stories')
        .update({
          progress_seconds: progressSeconds,
          completed,
          last_played_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('story_id', storyId);
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  }, [user?.id, storyId]);

  return { updateProgress };
}

// Hook for Stripe checkout
export function useCheckout() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (productType: 'subscription' | 'credit_pack', productId: string) => {
    if (!user?.id) {
      setError('Please sign in first');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productType,
          productId,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create checkout session');
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to checkout');
    } finally {
      setLoading(false);
    }
  };

  return { checkout, loading, error };
}

// Hook for wishlist management
export function useWishlist() {
  const { user, session } = useAuth();
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = useCallback(async () => {
    if (!session?.access_token) {
      setWishlist([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/wishlist', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setWishlist(data.map((item: any) => item.story_id));
      }
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const addToWishlist = async (storyId: string) => {
    if (!session?.access_token) return { success: false };

    try {
      const response = await fetch('/api/wishlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ storyId }),
      });

      if (response.ok) {
        setWishlist(prev => [...prev, storyId]);
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  const removeFromWishlist = async (storyId: string) => {
    if (!session?.access_token) return { success: false };

    try {
      const response = await fetch(`/api/wishlist?storyId=${storyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        setWishlist(prev => prev.filter(id => id !== storyId));
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  const isInWishlist = (storyId: string) => wishlist.includes(storyId);

  return { wishlist, loading, addToWishlist, removeFromWishlist, isInWishlist, refetch: fetchWishlist };
}

// Hook for series data
export function useSeries(seriesId?: string) {
  const [series, setSeries] = useState<any>(null);
  const [episodes, setEpisodes] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seriesId) {
      setLoading(false);
      return;
    }

    async function fetchSeries() {
      try {
        const { data: seriesData } = await supabase
          .from('series')
          .select('*')
          .eq('id', seriesId)
          .single();

        setSeries(seriesData);

        const { data: episodesData } = await supabase
          .from('stories')
          .select('*')
          .eq('series_id', seriesId)
          .order('episode_number', { ascending: true });

        setEpisodes(episodesData || []);
      } catch (error) {
        console.error('Error fetching series:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSeries();
  }, [seriesId]);

  return { series, episodes, loading };
}

// Hook for all series
export function useAllSeries() {
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAllSeries() {
      try {
        const { data } = await supabase
          .from('series')
          .select('*')
          .order('created_at', { ascending: false });

        setSeriesList(data || []);
      } catch (error) {
        console.error('Error fetching series:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAllSeries();
  }, []);

  return { seriesList, loading };
}

// Hook for downloading stories
export function useDownloads() {
  const [downloads, setDownloads] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('dtt_downloads');
    if (stored) {
      try {
        setDownloads(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const addDownload = async (story: Story) => {
    // In a real app, this would download the actual audio file
    const download = {
      id: story.id,
      title: story.title,
      author: story.author,
      genre: story.genre,
      duration_mins: story.duration_mins,
      size_mb: story.duration_mins * 1.5, // Estimate ~1.5MB per minute
      downloaded_at: new Date().toISOString(),
    };

    const updated = [...downloads, download];
    setDownloads(updated);
    localStorage.setItem('dtt_downloads', JSON.stringify(updated));
    return { success: true };
  };

  const removeDownload = (storyId: string) => {
    const updated = downloads.filter(d => d.id !== storyId);
    setDownloads(updated);
    localStorage.setItem('dtt_downloads', JSON.stringify(updated));
  };

  const isDownloaded = (storyId: string) => downloads.some(d => d.id === storyId);

  return { downloads, addDownload, removeDownload, isDownloaded };
}
