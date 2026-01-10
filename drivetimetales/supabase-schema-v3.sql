-- DriveTimeTales Database Schema v3
-- Run this in your Supabase SQL Editor
-- Includes: Users, Stories, Series, Reviews, Wishlist, Purchases, Analytics

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  credits INTEGER DEFAULT 2,
  subscription_type TEXT DEFAULT 'free' CHECK (subscription_type IN ('free', 'test_driver', 'commuter', 'road_warrior')),
  subscription_ends_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- SERIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  genre TEXT NOT NULL,
  cover_url TEXT,
  total_episodes INTEGER DEFAULT 0,
  total_duration_mins INTEGER DEFAULT 0,
  is_complete BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view series" ON series FOR SELECT USING (true);

-- =============================================
-- STORIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  genre TEXT NOT NULL,
  description TEXT,
  duration_mins INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 1,
  audio_url TEXT,
  sample_url TEXT,
  cover_url TEXT,
  play_count INTEGER DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 0,
  is_new BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  is_free BOOLEAN DEFAULT false,
  -- Series support
  series_id UUID REFERENCES series(id) ON DELETE SET NULL,
  episode_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stories" ON stories FOR SELECT USING (true);

-- =============================================
-- USER STORIES (Collection/Purchases)
-- =============================================
CREATE TABLE IF NOT EXISTS user_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  progress_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_played_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, story_id)
);

ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own collection" ON user_stories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own collection" ON user_stories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can add to collection" ON user_stories FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- PURCHASES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'credit_pack', 'story')),
  product_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  credits_added INTEGER DEFAULT 0,
  stripe_payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases" ON purchases FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- WISHLIST TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wishlist" ON wishlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to wishlist" ON wishlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove from wishlist" ON wishlist FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- REVIEWS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON reviews FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- QR SOURCES (Marketing Tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS qr_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  promo_message TEXT,
  scan_count INTEGER DEFAULT 0,
  credits_given INTEGER DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE qr_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view qr_sources" ON qr_sources FOR SELECT USING (true);

-- =============================================
-- ANALYTICS EVENTS
-- =============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  story_id UUID REFERENCES stories(id),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service can insert analytics" ON analytics_events FOR INSERT WITH CHECK (true);

-- =============================================
-- SAMPLE SERIES DATA
-- =============================================
INSERT INTO series (id, title, description, author, genre, total_episodes, total_duration_mins, is_complete, is_featured) VALUES
  ('11111111-1111-1111-1111-111111111111', 'The Midnight Run', 'A trucker discovers a conspiracy that spans the entire highway system. Each delivery brings him closer to the truth.', 'Jack Morrison', 'Thriller', 5, 180, true, true),
  ('22222222-2222-2222-2222-222222222222', 'Route 66 Mysteries', 'Strange tales from America''s most haunted highway. Each episode features a different driver, a different town, and a different terror.', 'Sarah Chen', 'Horror', 8, 240, false, true),
  ('33333333-3333-3333-3333-333333333333', 'Starlight Express', 'In 2150, interstellar truckers haul cargo between planets. Follow Captain Maya Chen as she navigates space routes and alien encounters.', 'Dan Blake', 'Sci-Fi', 6, 210, true, false)
ON CONFLICT DO NOTHING;

-- =============================================
-- SAMPLE STORIES DATA
-- =============================================
INSERT INTO stories (title, author, genre, description, duration_mins, credits, is_new, is_featured, is_free, rating, series_id, episode_number) VALUES
  -- Standalone Stories
  ('The Last Mile', 'Jack Morrison', 'Trucker Stories', 'A veteran trucker faces his final haul across the desert, carrying cargo that will change everything.', 30, 2, true, true, false, 4.8, NULL, NULL),
  ('Midnight Diner', 'Sarah Chen', 'Drama', 'At a roadside diner that only appears after midnight, strangers share stories that blur memory and dream.', 25, 2, true, true, true, 4.9, NULL, NULL),
  ('Ghost Frequencies', 'Mike Torres', 'Horror', 'Late night radio signals lead a long-haul driver to discover transmissions from beyond the grave.', 45, 3, true, false, false, 4.6, NULL, NULL),
  ('Highway Hearts', 'Lisa Park', 'Drama', 'Two strangers meet at a truck stop and discover their paths have crossed before in unexpected ways.', 60, 4, false, true, false, 4.7, NULL, NULL),
  ('Desert Run', 'Sarah Chen', 'Adventure', 'A solo journey through the Mojave becomes a race against time when a mysterious package must arrive by sunrise.', 25, 2, true, true, true, 4.9, NULL, NULL),
  
  -- The Midnight Run Series
  ('The Package', 'Jack Morrison', 'Thriller', 'Episode 1: A routine delivery takes a dark turn when the cargo starts moving.', 35, 2, false, false, false, 4.7, '11111111-1111-1111-1111-111111111111', 1),
  ('The Tail', 'Jack Morrison', 'Thriller', 'Episode 2: Someone is following. The question is: friend or foe?', 38, 2, false, false, false, 4.8, '11111111-1111-1111-1111-111111111111', 2),
  ('The Roadblock', 'Jack Morrison', 'Thriller', 'Episode 3: Trapped between mysterious pursuers and an unexpected ally.', 40, 3, false, false, false, 4.9, '11111111-1111-1111-1111-111111111111', 3),
  ('The Truth', 'Jack Morrison', 'Thriller', 'Episode 4: The conspiracy runs deeper than anyone imagined.', 35, 2, false, false, false, 4.6, '11111111-1111-1111-1111-111111111111', 4),
  ('The Last Delivery', 'Jack Morrison', 'Thriller', 'Episode 5: Everything comes to a head in this explosive finale.', 42, 3, false, false, false, 4.9, '11111111-1111-1111-1111-111111111111', 5),
  
  -- Route 66 Mysteries Series
  ('The Vanishing Hitchhiker', 'Sarah Chen', 'Horror', 'Episode 1: A classic urban legend gets a terrifying new twist on Route 66.', 30, 2, true, false, false, 4.5, '22222222-2222-2222-2222-222222222222', 1),
  ('The Ghost Town', 'Sarah Chen', 'Horror', 'Episode 2: A detour leads to a town that doesn''t exist on any map.', 32, 2, true, false, false, 4.7, '22222222-2222-2222-2222-222222222222', 2),
  ('The Radio Signal', 'Sarah Chen', 'Horror', 'Episode 3: A mysterious broadcast reveals secrets better left buried.', 28, 2, true, false, false, 4.6, '22222222-2222-2222-2222-222222222222', 3)
ON CONFLICT DO NOTHING;

-- =============================================
-- FUNCTIONS
-- =============================================

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, credits)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    2
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update series episode count
CREATE OR REPLACE FUNCTION update_series_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.series_id IS NOT NULL THEN
    UPDATE series SET 
      total_episodes = (SELECT COUNT(*) FROM stories WHERE series_id = NEW.series_id),
      total_duration_mins = (SELECT COALESCE(SUM(duration_mins), 0) FROM stories WHERE series_id = NEW.series_id)
    WHERE id = NEW.series_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_story_change ON stories;
CREATE TRIGGER on_story_change
  AFTER INSERT OR UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION update_series_stats();

-- Increment play count
CREATE OR REPLACE FUNCTION increment_play_count(story_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE stories SET play_count = play_count + 1 WHERE id = story_uuid;
END;
$$ LANGUAGE plpgsql;

-- Update story rating when reviews change
CREATE OR REPLACE FUNCTION update_story_rating()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating DECIMAL(2,1);
  story_uuid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    story_uuid := OLD.story_id;
  ELSE
    story_uuid := NEW.story_id;
  END IF;
  
  SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) INTO avg_rating
  FROM reviews WHERE story_id = story_uuid;
  
  UPDATE stories SET rating = avg_rating WHERE id = story_uuid;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_review_change ON reviews;
CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_story_rating();
