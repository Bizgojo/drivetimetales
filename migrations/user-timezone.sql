-- Add timezone to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Create index for timezone-based queries
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);

-- Update news_settings to store per-category voice settings
ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS generation_timezone TEXT DEFAULT 'America/New_York';

-- Create news_delivery_queue table for timezone-aware delivery
CREATE TABLE IF NOT EXISTS news_delivery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  edition TEXT NOT NULL, -- 'morning', 'midday', 'evening'
  timezone TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  episode_id UUID REFERENCES news_episodes(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_news_delivery_queue_status ON news_delivery_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_news_delivery_queue_timezone ON news_delivery_queue(timezone, edition);

-- Enable RLS on delivery queue
ALTER TABLE news_delivery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage delivery queue" ON news_delivery_queue
  FOR ALL USING (true);
