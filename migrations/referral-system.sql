-- DTT Referral System Database Migration
-- Run this in Supabase SQL Editor
-- "Share the Road" Referral Program

-- ============================================
-- ADD REFERRAL COLUMNS TO USERS TABLE
-- ============================================

-- Add referral columns to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_tier VARCHAR(20) DEFAULT 'starter';
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_credits_earned INTEGER DEFAULT 0;

-- Create index for fast referral code lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- ============================================
-- REFERRALS TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, credited
  referrer_credited BOOLEAN DEFAULT false,
  referred_credited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(referred_id) -- Each user can only be referred once
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ============================================
-- REFERRAL REWARDS TABLE (for tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  reward_type VARCHAR(50) NOT NULL, -- 'referrer_credits', 'referred_credits', 'tier_bonus', 'milestone_bonus'
  credits_awarded INTEGER NOT NULL,
  tier_at_time VARCHAR(20),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(user_id);

-- ============================================
-- REFERRAL TIERS CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS referral_tiers (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(20) UNIQUE NOT NULL,
  min_referrals INTEGER NOT NULL,
  badge_emoji VARCHAR(10),
  badge_name VARCHAR(50),
  bonus_credits INTEGER DEFAULT 0,
  description TEXT
);

-- Insert tier definitions
INSERT INTO referral_tiers (tier_name, min_referrals, badge_emoji, badge_name, bonus_credits, description) VALUES
  ('starter', 0, '🚗', 'Road Starter', 0, 'Just getting started'),
  ('captain', 3, '🚙', 'Road Captain', 2, 'Earned at 3 referrals'),
  ('warrior', 5, '🚐', 'Road Warrior', 5, 'Earned at 5 referrals - Free month of Road Warrior plan'),
  ('legend', 10, '🚛', 'Road Legend', 10, 'Earned at 10 referrals - Founding Member status')
ON CONFLICT (tier_name) DO NOTHING;

-- ============================================
-- FUNCTION: Generate unique referral code
-- ============================================

CREATE OR REPLACE FUNCTION generate_referral_code(user_name TEXT)
RETURNS VARCHAR(20) AS $$
DECLARE
  base_code VARCHAR(20);
  final_code VARCHAR(20);
  counter INTEGER := 0;
BEGIN
  -- Create base code from name (first 6 chars, uppercase, alphanumeric only)
  base_code := UPPER(REGEXP_REPLACE(LEFT(user_name, 6), '[^A-Z0-9]', '', 'g'));
  
  -- If name is too short, pad with random chars
  IF LENGTH(base_code) < 4 THEN
    base_code := base_code || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4 - LENGTH(base_code)));
  END IF;
  
  -- Add random suffix
  final_code := base_code || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4));
  
  -- Check for uniqueness and add counter if needed
  WHILE EXISTS (SELECT 1 FROM users WHERE referral_code = final_code) LOOP
    counter := counter + 1;
    final_code := base_code || counter::TEXT || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 2));
  END LOOP;
  
  RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Process referral (RECORD ONLY — no payout)
-- ============================================
-- REFERRAL-SIGNUP-001 (2026-09-19): the app no longer uses credits. This
-- function only RECORDS a completed referral. The reward (free days for BOTH
-- sides, amounts from referral_offers) is paid by the app in
-- app/api/referral/claim/route.ts, which flips referrer_credited /
-- referred_credited as it grants each side. Offer choice: the referrer's own
-- default_offer_id if it is an active free_days offer, else the default
-- active free_days offer (matches what /signup's invite banner shows).

CREATE OR REPLACE FUNCTION process_referral(
  p_referrer_code VARCHAR(20),
  p_referred_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_offer_id UUID;
  v_offer_id UUID;
  v_referral_id UUID;
BEGIN
  -- Find referrer by code, case-insensitively: legacy codes from the old
  -- /refer fallback were mixed case (e.g. 'Marc7QX'). Oldest account wins
  -- if two codes differ only by case.
  SELECT id, default_offer_id INTO v_referrer_id, v_referrer_offer_id
  FROM users WHERE UPPER(referral_code) = UPPER(p_referrer_code)
  ORDER BY created_at
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Can't refer yourself
  IF v_referrer_id = p_referred_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot refer yourself');
  END IF;

  -- Check if user already referred
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = p_referred_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred by someone');
  END IF;

  -- Offer: referrer's own active free_days offer, else the default one
  IF v_referrer_offer_id IS NOT NULL THEN
    SELECT id INTO v_offer_id FROM referral_offers
    WHERE id = v_referrer_offer_id AND is_active AND offer_type = 'free_days';
  END IF;
  IF v_offer_id IS NULL THEN
    SELECT id INTO v_offer_id FROM referral_offers
    WHERE is_default AND is_active AND offer_type = 'free_days'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Record the referral (UNIQUE(referred_id) guards concurrent calls)
  INSERT INTO referrals (referrer_id, referred_id, offer_id, status, completed_at)
  VALUES (v_referrer_id, p_referred_user_id, v_offer_id, 'completed', NOW())
  RETURNING id INTO v_referral_id;

  UPDATE users SET referred_by = v_referrer_id WHERE id = p_referred_user_id;
  UPDATE users SET referral_count = COALESCE(referral_count, 0) + 1 WHERE id = v_referrer_id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', v_referral_id,
    'referrer_id', v_referrer_id,
    'offer_id', v_offer_id
  );
END;
$$ LANGUAGE plpgsql;

-- Only the app's service role may call this (it writes referred_by for an
-- arbitrary user id). PostgreSQL grants EXECUTE to PUBLIC by default.
REVOKE EXECUTE ON FUNCTION process_referral(VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_referral(VARCHAR, UUID) TO service_role;

-- ============================================
-- TRIGGER: Auto-generate referral code for new users
-- ============================================

CREATE OR REPLACE FUNCTION auto_generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code(COALESCE(NEW.display_name, NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_referral_code ON users;
CREATE TRIGGER trigger_auto_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_referral_code();

-- ============================================
-- Generate referral codes for existing users
-- ============================================

UPDATE users 
SET referral_code = generate_referral_code(COALESCE(display_name, email))
WHERE referral_code IS NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_tiers ENABLE ROW LEVEL SECURITY;

-- Users can see their own referrals
CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Service role has full access
CREATE POLICY "Service role full access referrals" ON referrals
  FOR ALL USING (auth.role() = 'service_role');

-- Users can see their own rewards
CREATE POLICY "Users can view own rewards" ON referral_rewards
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access to rewards
CREATE POLICY "Service role full access rewards" ON referral_rewards
  FOR ALL USING (auth.role() = 'service_role');

-- Anyone can read tier definitions
CREATE POLICY "Anyone can read tiers" ON referral_tiers
  FOR SELECT USING (true);
