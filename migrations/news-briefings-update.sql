-- Migration: News Briefings System Update
-- Date: January 13, 2026
-- Description: Add state field to users, update news_episodes for state news

-- Add state column to users table if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;

-- Update news_settings table to support state configuration
ALTER TABLE news_settings ADD COLUMN IF NOT EXISTS test_state TEXT DEFAULT 'TN';
ALTER TABLE news_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Update news_episodes table for state news support
ALTER TABLE news_episodes ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE news_episodes ADD COLUMN IF NOT EXISTS episode_number INTEGER DEFAULT 1;
ALTER TABLE news_episodes ADD COLUMN IF NOT EXISTS voice_id TEXT;
ALTER TABLE news_episodes ADD COLUMN IF NOT EXISTS narrator_name TEXT;

-- Create index for faster state-based queries
CREATE INDEX IF NOT EXISTS idx_news_episodes_state ON news_episodes(state);
CREATE INDEX IF NOT EXISTS idx_news_episodes_category_live ON news_episodes(category, is_live);
CREATE INDEX IF NOT EXISTS idx_users_state ON users(state);

-- Update news_settings categories JSON schema comment
COMMENT ON COLUMN news_settings.categories IS 'JSON object with category settings: {categoryId: {enabled, voice_id, narrator_name, last_generated, episode_number, audio_url}}';

-- Pre-generate no-credits audio storage bucket (if not exists)
-- Run this in Supabase dashboard if needed:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('system-audio', 'system-audio', true)
-- ON CONFLICT (id) DO NOTHING;
