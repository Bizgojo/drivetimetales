import { createClient } from '@supabase/supabase-js'

// Hardcoded for reliability - env files can be tricky
const supabaseUrl = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODk2MTIsImV4cCI6MjA4MTY2NTYxMn0.7asAd8ctLKJLdv2AojbF8WEo-N6dVheVA3mWxjkFwkk'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'

// Client for browser use
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client with service role (for API routes)
export function createServerClient() {
  return createClient(supabaseUrl, serviceRoleKey)
}

// Types
export interface Story {
  id: string
  title: string
  author: string
  genre: string
  description: string | null
  duration_mins: number
  duration_label: string
  credits: number
  color: string
  promo_text: string | null
  is_new: boolean
  is_featured: boolean
  play_count: number
  audio_url: string | null
  sample_url: string | null
  created_at: string
  updated_at: string
}

export interface QRSource {
  id: string
  code: string
  name: string
  location: string | null
  promo_message: string | null
  promo_audio_url: string | null
  discount_code: string | null
  discount_percent: number | null
  scan_count: number
  signup_count: number
  is_active: boolean
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string
  plan: string
  credits_remaining: number
  credits_total: number
  subscription_ends_at: string | null
  source_id: string | null
  device_ids: string[]
  wishlist: string[]
  free_minutes_used: number
  created_at: string
  updated_at: string
}

export interface PlayHistory {
  id: string
  user_id: string | null
  story_id: string
  device_id: string | null
  source_id: string | null
  progress_percent: number
  current_time_seconds: number
  completed: boolean
  play_type: string | null
  credits_used: number
  started_at: string
  last_played_at: string
}

export interface PromoMessage {
  id: string
  name: string
  message: string
  audio_url: string | null
  is_default: boolean
  source_ids: string[]
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  created_at: string
}
