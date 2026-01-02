import { createClient } from '@supabase/supabase-js';

// ============================================
// DEBUG: Log environment variables (safely)
// ============================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('[DTT Debug] Supabase initialization:');
console.log('[DTT Debug] - URL exists:', !!supabaseUrl);
console.log('[DTT Debug] - URL value:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING!');
console.log('[DTT Debug] - Anon key exists:', !!supabaseAnonKey);
console.log('[DTT Debug] - Anon key length:', supabaseAnonKey?.length || 0);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[DTT Debug] CRITICAL: Missing Supabase environment variables!');
  console.error('[DTT Debug] Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in Vercel');
}

// Client-side Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// ============================================
// Types for our database - MATCHES ACTUAL DB SCHEMA EXACTLY
// Database: supabase-schema-v3.sql
// ============================================

export interface Story {
  id: string;
  title: string;
  author: string;
  genre: string;
  description?: string;
  duration_mins: number;
  duration_label?: string;
  credits: number;
  color?: string;
  promo_text?: string;
  audio_url?: string;
  sample_url?: string;
  cover_url?: string;
  play_count: number;
  rating?: number;
  is_new: boolean;
  is_featured: boolean;
  is_free?: boolean;
  series_id?: string;
  episode_number?: number;
  created_at: string;
}

// User interface - MATCHES users table in supabase-schema-v3.sql exactly
export interface User {
  id: string;
  email: string;
  display_name?: string;
  credits: number;  // DB column is 'credits', NOT 'credits_remaining'
  subscription_type?: 'free' | 'test_driver' | 'commuter' | 'road_warrior';
  subscription_ends_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
}

export interface UserStory {
  id: string;
  user_id: string;
  story_id: string;
  progress_seconds: number;
  completed: boolean;
  purchased_at: string;
  last_played_at?: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  type: 'subscription' | 'credit_pack' | 'story';
  product_id: string;
  amount_cents: number;
  credits_added: number;
  stripe_payment_id?: string;
  created_at: string;
}

export interface Series {
  id: string;
  title: string;
  description?: string;
  author: string;
  genre: string;
  cover_url?: string;
  total_episodes: number;
  total_duration_mins: number;
  is_complete: boolean;
  is_featured: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  story_id: string;
  rating: number;
  title?: string;
  content?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Helper functions with DEBUG logging
// ============================================

export async function getStories(options?: {
  category?: string;
  featured?: boolean;
  limit?: number;
  search?: string;
}) {
  console.log('[DTT Debug] getStories() called with options:', options);
  
  try {
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
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.search) {
      query = query.or(`title.ilike.%${options.search}%,author.ilike.%${options.search}%,description.ilike.%${options.search}%`);
    }

    console.log('[DTT Debug] Executing Supabase query...');
    const { data, error } = await query;
    
    if (error) {
      console.error('[DTT Debug] getStories() ERROR:', error);
      console.error('[DTT Debug] Error code:', error.code);
      console.error('[DTT Debug] Error message:', error.message);
      console.error('[DTT Debug] Error details:', error.details);
      throw error;
    }
    
    console.log('[DTT Debug] getStories() SUCCESS:');
    console.log('[DTT Debug] - Stories returned:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('[DTT Debug] - First story title:', data[0].title);
      console.log('[DTT Debug] - First story keys:', Object.keys(data[0]));
    }
    
    return (data || []) as Story[];
  } catch (err) {
    console.error('[DTT Debug] getStories() EXCEPTION:', err);
    throw err;
  }
}

export async function getStory(id: string) {
  console.log('[DTT Debug] getStory() called with id:', id);
  
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('[DTT Debug] getStory() ERROR:', error);
      throw error;
    }
    
    console.log('[DTT Debug] getStory() SUCCESS:', data?.title);
    return data as Story;
  } catch (err) {
    console.error('[DTT Debug] getStory() EXCEPTION:', err);
    throw err;
  }
}

export async function getUserProfile(userId: string) {
  console.log('[DTT Debug] getUserProfile() called with userId:', userId);
  
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('[DTT Debug] getUserProfile() ERROR:', error);
      throw error;
    }
    
    console.log('[DTT Debug] getUserProfile() SUCCESS:');
    console.log('[DTT Debug] - User email:', data?.email);
    console.log('[DTT Debug] - User credits:', data?.credits);
    console.log('[DTT Debug] - User keys:', Object.keys(data || {}));
    
    return data as User;
  } catch (err) {
    console.error('[DTT Debug] getUserProfile() EXCEPTION:', err);
    throw err;
  }
}

export async function getUserStories(userId: string) {
  console.log('[DTT Debug] getUserStories() called');
  
  const { data, error } = await supabase
    .from('user_stories')
    .select(`
      *,
      story:stories(*)
    `)
    .eq('user_id', userId)
    .order('last_played_at', { ascending: false });
  
  if (error) {
    console.error('[DTT Debug] getUserStories() ERROR:', error);
    throw error;
  }
  
  console.log('[DTT Debug] getUserStories() returned:', data?.length || 0, 'items');
  return data;
}

export async function updatePlayProgress(userId: string, storyId: string, progressSeconds: number) {
  console.log('[DTT Debug] updatePlayProgress() called');
  
  const { error } = await supabase
    .from('user_stories')
    .upsert({
      user_id: userId,
      story_id: storyId,
      progress_seconds: progressSeconds,
      last_played_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,story_id'
    });
  
  if (error) {
    console.error('[DTT Debug] updatePlayProgress() ERROR:', error);
    throw error;
  }
  
  console.log('[DTT Debug] updatePlayProgress() SUCCESS');
}

export async function purchaseStory(userId: string, storyId: string, creditsToDeduct: number) {
  console.log('[DTT Debug] purchaseStory() called');
  
  // Get current user credits
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();
  
  if (userError) {
    console.error('[DTT Debug] purchaseStory() user fetch ERROR:', userError);
    throw userError;
  }
  
  if (user.credits < creditsToDeduct) {
    console.error('[DTT Debug] purchaseStory() insufficient credits:', user.credits, '<', creditsToDeduct);
    throw new Error('Insufficient credits');
  }

  // Deduct credits
  const { error: deductError } = await supabase
    .from('users')
    .update({ credits: user.credits - creditsToDeduct })
    .eq('id', userId);
  
  if (deductError) {
    console.error('[DTT Debug] purchaseStory() deduct ERROR:', deductError);
    throw deductError;
  }

  // Add to user's collection
  const { error: addError } = await supabase
    .from('user_stories')
    .insert({
      user_id: userId,
      story_id: storyId,
      progress_seconds: 0,
      completed: false,
      purchased_at: new Date().toISOString(),
    });
  
  if (addError) {
    console.error('[DTT Debug] purchaseStory() add story ERROR:', addError);
    throw addError;
  }

  console.log('[DTT Debug] purchaseStory() SUCCESS');
  return { success: true, remainingCredits: user.credits - creditsToDeduct };
}

export async function addCredits(userId: string, creditsToAdd: number) {
  console.log('[DTT Debug] addCredits() called');
  
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();
  
  if (userError) {
    console.error('[DTT Debug] addCredits() ERROR:', userError);
    throw userError;
  }

  const { error } = await supabase
    .from('users')
    .update({ credits: user.credits + creditsToAdd })
    .eq('id', userId);
  
  if (error) {
    console.error('[DTT Debug] addCredits() update ERROR:', error);
    throw error;
  }
  
  console.log('[DTT Debug] addCredits() SUCCESS, new balance:', user.credits + creditsToAdd);
  return { success: true, newBalance: user.credits + creditsToAdd };
}
