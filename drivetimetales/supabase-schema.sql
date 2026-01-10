-- Drive Time Tales Database Schema
-- Run this in Supabase SQL Editor (SQL Editor -> New Query -> Paste -> Run)

-- ============================================
-- STORIES TABLE
-- ============================================
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  genre TEXT NOT NULL,
  description TEXT,
  duration_mins INTEGER NOT NULL,
  duration_label TEXT NOT NULL, -- "15 min", "30 min", "1 hr", etc.
  credits INTEGER NOT NULL DEFAULT 2,
  color TEXT NOT NULL DEFAULT 'from-purple-600 to-purple-900',
  promo_text TEXT, -- "Editor's Pick!", "New Release!", etc.
  is_new BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  play_count INTEGER DEFAULT 0,
  
  -- Audio files (stored in R2)
  audio_url TEXT, -- Full story audio
  sample_url TEXT, -- 2-minute sample
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QR SOURCES TABLE (for tracking marketing)
-- ============================================
CREATE TABLE qr_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- "flyingj-dec2024", "loves-i40", etc.
  name TEXT NOT NULL, -- "Flying J - December 2024"
  location TEXT, -- "I-40 Exit 125, Amarillo TX"
  promo_message TEXT, -- Custom message for this source
  promo_audio_url TEXT, -- Custom promo audio (optional)
  discount_code TEXT, -- "FLYINGJ20" for 20% off
  discount_percent INTEGER, -- 20
  
  -- Stats
  scan_count INTEGER DEFAULT 0,
  signup_count INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  
  -- Subscription
  plan TEXT DEFAULT 'free', -- free, commuter, roadtripper, longhaul
  credits_remaining INTEGER DEFAULT 0,
  credits_total INTEGER DEFAULT 0,
  subscription_ends_at TIMESTAMPTZ,
  
  -- Tracking
  source_id UUID REFERENCES qr_sources(id), -- Which QR code brought them
  device_ids TEXT[] DEFAULT '{}', -- Recognized device IDs
  wishlist UUID[] DEFAULT '{}', -- Story IDs
  
  -- Free minutes (for visitors who convert)
  free_minutes_used INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLAY HISTORY TABLE
-- ============================================
CREATE TABLE play_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  story_id UUID REFERENCES stories(id) NOT NULL,
  device_id TEXT,
  source_id UUID REFERENCES qr_sources(id), -- Track which QR led to this play
  
  -- Progress tracking
  progress_percent NUMERIC(5,2) DEFAULT 0, -- 0.00 to 100.00
  current_time_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  
  -- Metadata
  play_type TEXT, -- 'free', 'credits', 'sample', 'subscription'
  credits_used INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_played_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS EVENTS TABLE
-- ============================================
CREATE TABLE analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'qr_scan', 'story_play', 'signup', 'purchase', 'sample_play'
  
  user_id UUID REFERENCES users(id),
  story_id UUID REFERENCES stories(id),
  source_id UUID REFERENCES qr_sources(id),
  device_id TEXT,
  
  -- Event data (flexible JSON)
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROMO MESSAGES TABLE
-- ============================================
CREATE TABLE promo_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  audio_url TEXT, -- Pre-recorded promo audio
  
  -- Targeting
  is_default BOOLEAN DEFAULT false, -- Use when no specific source
  source_ids UUID[] DEFAULT '{}', -- Specific sources to show this to
  
  -- Scheduling
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_stories_genre ON stories(genre);
CREATE INDEX idx_stories_featured ON stories(is_featured);
CREATE INDEX idx_stories_new ON stories(is_new);
CREATE INDEX idx_play_history_user ON play_history(user_id);
CREATE INDEX idx_play_history_story ON play_history(story_id);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_qr_sources_code ON qr_sources(code);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_messages ENABLE ROW LEVEL SECURITY;

-- Public read access to stories
CREATE POLICY "Stories are viewable by everyone" ON stories
  FOR SELECT USING (true);

-- Public read access to active QR sources
CREATE POLICY "Active QR sources are viewable" ON qr_sources
  FOR SELECT USING (is_active = true);

-- Public read access to active promo messages
CREATE POLICY "Active promos are viewable" ON promo_messages
  FOR SELECT USING (is_active = true);

-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (true);

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access stories" ON stories
  FOR ALL USING (true);

CREATE POLICY "Service role full access users" ON users
  FOR ALL USING (true);

CREATE POLICY "Service role full access play_history" ON play_history
  FOR ALL USING (true);

CREATE POLICY "Service role full access analytics" ON analytics_events
  FOR ALL USING (true);

-- ============================================
-- SEED DATA - Sample Stories
-- ============================================
INSERT INTO stories (title, author, genre, description, duration_mins, duration_label, credits, color, promo_text, is_new, is_featured, play_count) VALUES
('The Midnight Express', 'Davis Goldburg', 'Mystery', 'Detective Sarah Chen boards the overnight express, expecting nothing more than a quiet journey. But when she discovers a cryptic message, she realizes she''s not alone with secrets on this train.', 30, '30 min', 2, 'from-purple-600 to-purple-900', 'Editor''s Pick!', false, true, 1250),
('Stars Over Highway 61', 'Sam Huston', 'Drama', 'After fifteen years of silence, Marcus receives a call that changes everything: his estranged daughter needs a ride from Nashville to Seattle.', 45, '45 min', 3, 'from-orange-600 to-orange-900', NULL, false, true, 890),
('The Last Radio Signal', 'Elena Torres', 'Sci-Fi', 'It''s 3 AM on Interstate 40 when every radio station goes silent. But trucker Ray Vasquez hears something on his CB radio—a voice from beyond.', 60, '1 hr', 4, 'from-cyan-600 to-cyan-900', 'New Release!', true, true, 2100),
('Whispers at Mile 47', 'Marcus Chen', 'Horror', 'The stretch of Route 66 between Amarillo and Santa Rosa is supposed to be empty. But travelers report strange things at mile marker 47.', 15, '15 min', 2, 'from-red-600 to-red-900', NULL, true, false, 450),
('The Coffee Shop Mystery', 'Rachel Williams', 'Comedy', 'When barista Jenny finds a mysterious note in the tip jar, she becomes an unlikely detective in her own coffee shop.', 30, '30 min', 2, 'from-yellow-600 to-yellow-900', NULL, false, false, 670),
('Letters from the Coast', 'James Patterson', 'Romance', 'Two strangers exchange letters through a coastal bookshop''s message board, never knowing they pass each other every day.', 90, '90 min', 6, 'from-pink-600 to-pink-900', NULL, false, false, 1800),
('The Long Haul', 'Mike Richards', 'Drama', 'A cross-country journey becomes a meditation on life, loss, and second chances.', 120, '2 hr', 8, 'from-slate-600 to-slate-800', 'Fan Favorite!', false, true, 3200),
('Beyond the Checkpoint', 'Sarah Cole', 'Sci-Fi', 'In a world where borders are invisible but absolute, one driver discovers a route that shouldn''t exist.', 75, '75 min', 5, 'from-teal-600 to-teal-900', NULL, true, false, 320),
('Big Rig Blues', 'Tom Bradley', 'Trucker Stories', 'Veteran trucker Earl has driven every highway in America. But this haul through the desert will test everything he knows about the road.', 15, '15 min', 2, 'from-amber-700 to-amber-900', 'Trucker Approved!', false, true, 2800),
('Route 66 Memories', 'Mike Richards', 'Trucker Stories', 'A father-son trucking team makes one final run down Route 66, uncovering family secrets at every stop.', 30, '30 min', 3, 'from-emerald-700 to-emerald-900', NULL, true, false, 180),
('Night Shift at the Rest Stop', 'Dave Wilson', 'Trucker Stories', 'The graveyard shift at a highway rest stop reveals more than just tired travelers.', 15, '15 min', 2, 'from-indigo-700 to-indigo-900', NULL, false, false, 920),
('Convoy', 'Sarah Thompson', 'Trucker Stories', 'When a group of truckers band together to help a stranded family, they discover the true meaning of the open road.', 90, '90 min', 6, 'from-rose-700 to-rose-900', 'Epic Journey!', false, true, 1450);

-- ============================================
-- SEED DATA - Default QR Source
-- ============================================
INSERT INTO qr_sources (code, name, location, promo_message, is_active) VALUES
('website', 'Direct Website Visit', 'Online', 'Welcome to Drive Time Tales! Audio stories perfectly timed for your drive.', true),
('flyingj-demo', 'Flying J Demo', 'Flying J Truck Stop', 'Welcome Flying J drivers! Use code FLYINGJ for 20% off your first month.', true);

-- ============================================
-- SEED DATA - Default Promo Message
-- ============================================
INSERT INTO promo_messages (name, message, is_default, is_active) VALUES
('Default Promo', 'You''re listening to Drive Time Tales - audio stories for the road. Visit drivetimetales.com to hear the full story and discover more adventures for your journey.', true, true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_play_count(story_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE stories SET play_count = play_count + 1 WHERE id = story_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to increment QR scan count
CREATE OR REPLACE FUNCTION increment_scan_count(source_code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE qr_sources SET scan_count = scan_count + 1 WHERE code = source_code;
END;
$$ LANGUAGE plpgsql;
