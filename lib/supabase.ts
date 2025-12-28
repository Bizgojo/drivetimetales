import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database
export interface Story {
  id: string;
  title: string;
  author: string;
  genre: string;
  description?: string;
  duration_mins: number;
  credits: number;
  audio_url?: string;
  sample_url?: string;
  cover_url?: string;
  play_count: number;
  rating: number;
  is_new: boolean;
  is_featured: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  display_name?: string;
  credits: number;
  subscription_type: 'free' | 'test_driver' | 'commuter' | 'road_warrior';
  subscription_ends_at?: string;
  stripe_customer_id?: string;
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
  type: 'subscription' | 'credit_pack';
  product_id: string;
  amount_cents: number;
  credits_added: number;
  stripe_payment_id?: string;
  created_at: string;
}

// Helper functions
export async function getStories(options?: {
  category?: string;
  featured?: boolean;
  limit?: number;
  search?: string;
}) {
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

  const { data, error } = await query;
  if (error) throw error;
  return data as Story[];
}

export async function getStory(id: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as Story;
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data as User;
}

export async function getUserStories(userId: string) {
  const { data, error } = await supabase
    .from('user_stories')
    .select(`
      *,
      story:stories(*)
    `)
    .eq('user_id', userId)
    .order('last_played_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function updatePlayProgress(userId: string, storyId: string, progressSeconds: number) {
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
  
  if (error) throw error;
}

export async function purchaseStory(userId: string, storyId: string, credits: number) {
  // Start a transaction
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();
  
  if (userError) throw userError;
  if (user.credits < credits) {
    throw new Error('Insufficient credits');
  }

  // Deduct credits
  const { error: deductError } = await supabase
    .from('users')
    .update({ credits: user.credits - credits })
    .eq('id', userId);
  
  if (deductError) throw deductError;

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
  
  if (addError) throw addError;

  return { success: true, remainingCredits: user.credits - credits };
}

export async function addCredits(userId: string, credits: number) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();
  
  if (userError) throw userError;

  const { error } = await supabase
    .from('users')
    .update({ credits: user.credits + credits })
    .eq('id', userId);
  
  if (error) throw error;
  return { success: true, newBalance: user.credits + credits };
}
