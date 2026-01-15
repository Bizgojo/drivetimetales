import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'dtt-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }
})

// Type exports that other files expect
export interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  duration_label: string
  cover_url: string
  audio_url: string
  rating: number
  price: number
  price_cents: number
  credits: number
  is_free: boolean
  created_at: string
  average_rating: number
  author: string
  is_new: boolean
}

export interface User {
  id: string
  email: string
  display_name: string
  first_name?: string
  credits: number
  state?: string
  subscription_type?: string
}

export interface UserStory {
  id: string
  user_id: string
  story_id: string
  progress: number
  completed: boolean
  last_played?: string
}

// Function exports that other files expect
export async function getStory(id: string): Promise<Story | null> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Error fetching story:', error)
    return null
  }
  return data
}

export async function getStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching stories:', error)
    return []
  }
  return data || []
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
  return data
}

export async function getUserStories(userId: string): Promise<UserStory[]> {
  const { data, error } = await supabase
    .from('user_library')
    .select('*')
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error fetching user stories:', error)
    return []
  }
  return data || []
}
