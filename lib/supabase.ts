import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for database
export interface Story {
  id: string
  title: string
  author: string | null
  description: string
  genre: string
  duration_mins: number
  cover_url: string | null
  audio_url: string
  preview_audio_url?: string
  preview_end_time?: number
  credit_cost: number
  created_at: string
}

export interface User {
  id: string
  email: string
  display_name: string | null
  credits: number
  subscription_type: string | null
}

export interface LibraryEntry {
  id: string
  user_id: string
  story_id: string
  progress: number
  last_played: string
  completed: boolean
}

export interface UserPreference {
  id: string
  user_id: string
  story_id: string
  wishlisted: boolean
  not_for_me: boolean
}

// Helper functions
export async function getStory(storyId: string): Promise<Story | null> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('id', storyId)
    .single()

  if (error) {
    console.error('Error fetching story:', error)
    return null
  }

  return data
}

export async function getStories(options?: {
  genre?: string
  limit?: number
  offset?: number
}): Promise<Story[]> {
  let query = supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: false })

  if (options?.genre) {
    query = query.eq('genre', options.genre)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching stories:', error)
    return []
  }

  return data || []
}

export async function getUserLibrary(userId: string): Promise<LibraryEntry[]> {
  const { data, error } = await supabase
    .from('user_library')
    .select('*')
    .eq('user_id', userId)
    .order('last_played', { ascending: false })

  if (error) {
    console.error('Error fetching user library:', error)
    return []
  }

  return data || []
}

export async function getUserPreferences(userId: string): Promise<UserPreference[]> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching user preferences:', error)
    return []
  }

  return data || []
}
