-- DTT News System Database Migration
-- Run this in Supabase SQL Editor
-- Supports 5 news categories with per-category settings

-- ============================================
-- NEWS EPISODES TABLE (with category support)
-- ============================================
CREATE TABLE IF NOT EXISTS news_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'national',  -- national, international, business, sports, science
  edition TEXT DEFAULT 'AM',                   -- AM or PM
  script_text TEXT,                            -- Full script for display/transcript
  audio_url TEXT,                              -- Supabase storage URL
  duration_mins INTEGER DEFAULT 5,
  is_live BOOLEAN DEFAULT false,               -- Currently active episode for this category
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_news_episodes_category ON news_episodes(category);
CREATE INDEX IF NOT EXISTS idx_news_episodes_is_live ON news_episodes(is_live);
CREATE INDEX IF NOT EXISTS idx_news_episodes_category_live ON news_episodes(category, is_live);

-- ============================================
-- NEWS SETTINGS TABLE (singleton for admin config)
-- ============================================
CREATE TABLE IF NOT EXISTS news_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  
  -- Per-category configuration (JSON)
  categories JSONB DEFAULT '{
    "national": {"enabled": true, "feeds": ["https://feeds.npr.org/1001/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/US.xml"]},
    "international": {"enabled": true, "feeds": ["https://feeds.npr.org/1004/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"]},
    "business": {"enabled": true, "feeds": ["https://feeds.npr.org/1006/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"]},
    "sports": {"enabled": true, "feeds": ["https://www.espn.com/espn/rss/news", "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml"]},
    "science": {"enabled": true, "feeds": ["https://feeds.npr.org/1007/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"]}
  }'::jsonb,
  
  -- Global narrator settings
  narrator_voice_id TEXT DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  narrator_voice_name TEXT DEFAULT 'Sarah (Female)',
  
  -- Schedule settings
  generation_times TEXT[] DEFAULT ARRAY['06:00', '18:00'],
  auto_generate BOOLEAN DEFAULT true,
  
  -- Content settings  
  stories_per_category INTEGER DEFAULT 5,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO news_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================
-- NEWS ACCESS TRACKING
-- Tracks which users have accessed news episodes
-- ============================================
CREATE TABLE IF NOT EXISTS news_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES news_episodes(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  acquired_via TEXT DEFAULT 'free',  -- free, subscription
  UNIQUE(user_id, episode_id)
);

-- ============================================
-- HELPER FUNCTION: Set episode as live for category
-- ============================================
CREATE OR REPLACE FUNCTION set_news_episode_live(episode_uuid UUID)
RETURNS void AS $$
DECLARE
  episode_category TEXT;
BEGIN
  -- Get the category of the episode
  SELECT category INTO episode_category FROM news_episodes WHERE id = episode_uuid;
  
  -- Set all episodes in this category to not live
  UPDATE news_episodes SET is_live = false WHERE category = episode_category AND id != episode_uuid;
  
  -- Set the specified episode to live
  UPDATE news_episodes SET is_live = true, published_at = NOW() WHERE id = episode_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE news_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_access ENABLE ROW LEVEL SECURITY;

-- news_episodes: Anyone can read live episodes
CREATE POLICY "Anyone can read live news episodes" ON news_episodes
  FOR SELECT USING (is_live = true);

-- news_episodes: Service role can do everything
CREATE POLICY "Service role full access to news_episodes" ON news_episodes
  FOR ALL USING (auth.role() = 'service_role');

-- news_settings: Service role only
CREATE POLICY "Service role full access to news_settings" ON news_settings
  FOR ALL USING (auth.role() = 'service_role');

-- news_access: Users can see their own access
CREATE POLICY "Users can see own news access" ON news_access
  FOR SELECT USING (auth.uid() = user_id);

-- news_access: Service role can manage
CREATE POLICY "Service role full access to news_access" ON news_access
  FOR ALL USING (auth.role() = 'service_role');
