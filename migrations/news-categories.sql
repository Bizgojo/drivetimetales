-- DTT News System Database Migration
-- Run this in Supabase SQL Editor

-- Update news_episodes table to support categories
ALTER TABLE news_episodes 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Create index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_news_episodes_category ON news_episodes(category);
CREATE INDEX IF NOT EXISTS idx_news_episodes_is_live ON news_episodes(is_live);
CREATE INDEX IF NOT EXISTS idx_news_episodes_category_live ON news_episodes(category, is_live);

-- Update news_settings to support per-category configuration
ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '{
  "national": {"enabled": true, "feeds": []},
  "international": {"enabled": true, "feeds": []},
  "business": {"enabled": true, "feeds": []},
  "sports": {"enabled": true, "feeds": []},
  "science": {"enabled": true, "feeds": []}
}'::jsonb;

ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS narrator_voice_id TEXT DEFAULT 'EXAVITQu4vr4xnSDxMaL';

ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS narrator_voice_name TEXT DEFAULT 'Sarah (Female)';

ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS generation_times TEXT[] DEFAULT ARRAY['06:00', '18:00'];

ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT true;

ALTER TABLE news_settings
ADD COLUMN IF NOT EXISTS stories_per_category INTEGER DEFAULT 5;

-- Update the set_news_episode_live function to handle categories
CREATE OR REPLACE FUNCTION set_news_episode_live(episode_uuid UUID)
RETURNS void AS $$
DECLARE
  episode_category TEXT;
BEGIN
  -- Get the category of the episode we're setting live
  SELECT category INTO episode_category FROM news_episodes WHERE id = episode_uuid;
  
  -- Set all other episodes in the same category to not live
  UPDATE news_episodes 
  SET is_live = false 
  WHERE category = episode_category AND id != episode_uuid;
  
  -- Set the specified episode to live
  UPDATE news_episodes 
  SET is_live = true 
  WHERE id = episode_uuid;
END;
$$ LANGUAGE plpgsql;

-- Insert default settings if not exists
INSERT INTO news_settings (id, categories, narrator_voice_id, narrator_voice_name, generation_times, auto_generate, stories_per_category)
VALUES (
  1,
  '{
    "national": {"enabled": true, "feeds": [
      {"name": "AP News - US", "url": "https://rsshub.app/apnews/topics/apf-usnews", "enabled": true},
      {"name": "NPR News", "url": "https://feeds.npr.org/1001/rss.xml", "enabled": true},
      {"name": "CBS News", "url": "https://www.cbsnews.com/latest/rss/main", "enabled": true}
    ]},
    "international": {"enabled": true, "feeds": [
      {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "enabled": true},
      {"name": "AP News - World", "url": "https://rsshub.app/apnews/topics/apf-intlnews", "enabled": true}
    ]},
    "business": {"enabled": true, "feeds": [
      {"name": "CNBC", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "enabled": true},
      {"name": "MarketWatch", "url": "https://feeds.marketwatch.com/marketwatch/topstories/", "enabled": true}
    ]},
    "sports": {"enabled": true, "feeds": [
      {"name": "ESPN", "url": "https://www.espn.com/espn/rss/news", "enabled": true},
      {"name": "CBS Sports", "url": "https://www.cbssports.com/rss/headlines/", "enabled": true}
    ]},
    "science": {"enabled": true, "feeds": [
      {"name": "Science Daily", "url": "https://www.sciencedaily.com/rss/all.xml", "enabled": true},
      {"name": "NASA", "url": "https://www.nasa.gov/rss/dyn/breaking_news.rss", "enabled": true},
      {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/science", "enabled": true}
    ]}
  }'::jsonb,
  'EXAVITQu4vr4xnSDxMaL',
  'Sarah (Female)',
  ARRAY['06:00', '18:00'],
  true,
  5
)
ON CONFLICT (id) DO UPDATE SET
  categories = EXCLUDED.categories,
  narrator_voice_id = COALESCE(news_settings.narrator_voice_id, EXCLUDED.narrator_voice_id),
  narrator_voice_name = COALESCE(news_settings.narrator_voice_name, EXCLUDED.narrator_voice_name),
  generation_times = COALESCE(news_settings.generation_times, EXCLUDED.generation_times),
  auto_generate = COALESCE(news_settings.auto_generate, EXCLUDED.auto_generate),
  stories_per_category = COALESCE(news_settings.stories_per_category, EXCLUDED.stories_per_category);

-- Ensure RLS policies allow reading news_episodes
DROP POLICY IF EXISTS "Anyone can read live news episodes" ON news_episodes;
CREATE POLICY "Anyone can read live news episodes" ON news_episodes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can read news settings" ON news_settings;
CREATE POLICY "Anyone can read news settings" ON news_settings
  FOR SELECT USING (true);
