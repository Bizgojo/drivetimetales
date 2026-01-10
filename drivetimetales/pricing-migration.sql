-- Drive Time Tales - Pricing Migration v2
-- Run this in Supabase SQL Editor to update your database

-- ============================================
-- UPDATE STORIES TABLE
-- ============================================

-- Add cover image field
ALTER TABLE stories ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Add price field (in cents)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS price_cents INTEGER;

-- ============================================
-- UPDATE USERS TABLE
-- ============================================

-- Add new subscription fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'test_driver';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_interval TEXT; -- 'monthly' or 'annual'
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT; -- 'active', 'cancelled', 'past_due'
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add credit balance (1 credit = 15 min)
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10,2) DEFAULT 0;

-- Add free tier tracking (2 hours = 7200 seconds)
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_seconds_remaining INTEGER DEFAULT 7200;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_seconds_reset_at TIMESTAMPTZ;

-- Add referral fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_free_months INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_credit_cents INTEGER DEFAULT 0;

-- Migrate old plan names to new tier names
UPDATE users SET subscription_tier = 'test_driver' WHERE plan = 'free' OR plan IS NULL;
UPDATE users SET subscription_tier = 'commuter' WHERE plan IN ('commuter', 'roadtripper');
UPDATE users SET subscription_tier = 'road_warrior' WHERE plan = 'longhaul';

-- Drop old columns (optional - keep for backup)
-- ALTER TABLE users DROP COLUMN IF EXISTS plan;
-- ALTER TABLE users DROP COLUMN IF EXISTS credits_remaining;
-- ALTER TABLE users DROP COLUMN IF EXISTS credits_total;

-- ============================================
-- ADD STORY PRICING FIELDS
-- ============================================
ALTER TABLE stories ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_early_access BOOLEAN DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS release_date TIMESTAMPTZ DEFAULT NOW();

-- Set default prices based on duration
UPDATE stories SET price_cents = 69 WHERE duration_mins <= 15 AND price_cents IS NULL;
UPDATE stories SET price_cents = 129 WHERE duration_mins > 15 AND duration_mins <= 30 AND price_cents IS NULL;
UPDATE stories SET price_cents = 249 WHERE duration_mins > 30 AND duration_mins <= 60 AND price_cents IS NULL;
UPDATE stories SET price_cents = 699 WHERE duration_mins > 60 AND price_cents IS NULL;

-- ============================================
-- CREATE PURCHASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  story_id UUID REFERENCES stories(id),
  purchase_type TEXT NOT NULL, -- 'individual', 'credit_pack', 'subscription'
  price_cents INTEGER NOT NULL,
  credits_added DECIMAL(10,2), -- For credit pack purchases
  stripe_payment_id TEXT,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_purchases_user ON user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_story ON user_purchases(story_id);
CREATE INDEX IF NOT EXISTS idx_purchases_type ON user_purchases(purchase_type);

-- RLS for purchases
ALTER TABLE user_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON user_purchases
  FOR SELECT USING (true);

CREATE POLICY "Service role full access purchases" ON user_purchases
  FOR ALL USING (true);

-- ============================================
-- CREATE CREDIT PACKS REFERENCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS credit_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credits DECIMAL(10,2) NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed credit packs
INSERT INTO credit_packs (name, credits, price_cents, stripe_price_id) VALUES
('Small Pack', 10, 399, 'credits_small'),
('Medium Pack', 25, 899, 'credits_medium'),
('Large Pack', 50, 1499, 'credits_large')
ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to check if user owns a story
CREATE OR REPLACE FUNCTION user_owns_story(user_uuid UUID, story_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_purchases 
    WHERE user_id = user_uuid 
    AND story_id = story_uuid 
    AND purchase_type = 'individual'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to deduct credits during playback
CREATE OR REPLACE FUNCTION deduct_credits(user_uuid UUID, credits_amount DECIMAL)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance DECIMAL;
BEGIN
  SELECT credit_balance INTO current_balance FROM users WHERE id = user_uuid;
  
  IF current_balance >= credits_amount THEN
    UPDATE users SET credit_balance = credit_balance - credits_amount WHERE id = user_uuid;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to deduct free seconds
CREATE OR REPLACE FUNCTION deduct_free_seconds(user_uuid UUID, seconds_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_seconds INTEGER;
BEGIN
  SELECT free_seconds_remaining INTO current_seconds FROM users WHERE id = user_uuid;
  
  IF current_seconds >= seconds_amount THEN
    UPDATE users SET free_seconds_remaining = free_seconds_remaining - seconds_amount WHERE id = user_uuid;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits (for purchases)
CREATE OR REPLACE FUNCTION add_credits(user_uuid UUID, credits_amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE users SET credit_balance = credit_balance + credits_amount WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to reset free seconds (run monthly)
CREATE OR REPLACE FUNCTION reset_monthly_free_seconds()
RETURNS void AS $$
BEGIN
  UPDATE users 
  SET free_seconds_remaining = 7200,
      free_seconds_reset_at = NOW()
  WHERE subscription_tier = 'test_driver';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SUMMARY
-- ============================================
-- New subscription_tier values: 'test_driver', 'commuter', 'road_warrior'
-- 1 credit = 15 minutes of streaming
-- Test Driver: 2 hrs/month free (7200 seconds)
-- Commuter: Unlimited streaming, ad-free
-- Road Warrior: + downloads + early access + exclusive content
