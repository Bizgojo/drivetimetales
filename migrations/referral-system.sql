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
-- FUNCTION: Process referral and award credits
-- ============================================

CREATE OR REPLACE FUNCTION process_referral(
  p_referrer_code VARCHAR(20),
  p_referred_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_referrer_id UUID;
  v_referral_id UUID;
  v_new_referral_count INTEGER;
  v_new_tier VARCHAR(20);
  v_tier_bonus INTEGER;
BEGIN
  -- Find referrer by code
  SELECT id INTO v_referrer_id FROM users WHERE referral_code = UPPER(p_referrer_code);
  
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
  
  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, status)
  VALUES (v_referrer_id, p_referred_user_id, 'pending')
  RETURNING id INTO v_referral_id;
  
  -- Update referred user's referred_by
  UPDATE users SET referred_by = v_referrer_id WHERE id = p_referred_user_id;
  
  -- Award credits to referred user (3 credits)
  UPDATE users SET credits = credits + 3 WHERE id = p_referred_user_id;
  
  -- Log the reward
  INSERT INTO referral_rewards (user_id, referral_id, reward_type, credits_awarded, description)
  VALUES (p_referred_user_id, v_referral_id, 'referred_credits', 3, 'Welcome bonus from referral');
  
  -- Update referral status
  UPDATE referrals SET referred_credited = true WHERE id = v_referral_id;
  
  -- Award credits to referrer (3 credits)
  UPDATE users SET 
    credits = credits + 3,
    referral_count = referral_count + 1,
    referral_credits_earned = referral_credits_earned + 3
  WHERE id = v_referrer_id
  RETURNING referral_count INTO v_new_referral_count;
  
  -- Log the reward
  INSERT INTO referral_rewards (user_id, referral_id, reward_type, credits_awarded, description)
  VALUES (v_referrer_id, v_referral_id, 'referrer_credits', 3, 'Referral reward for new signup');
  
  -- Update referral status
  UPDATE referrals SET 
    referrer_credited = true, 
    status = 'completed',
    completed_at = NOW()
  WHERE id = v_referral_id;
  
  -- Check for tier upgrades
  SELECT tier_name, bonus_credits INTO v_new_tier, v_tier_bonus
  FROM referral_tiers 
  WHERE min_referrals <= v_new_referral_count
  ORDER BY min_referrals DESC
  LIMIT 1;
  
  -- Update tier if changed
  IF v_new_tier IS NOT NULL THEN
    UPDATE users SET referral_tier = v_new_tier WHERE id = v_referrer_id;
    
    -- Award tier bonus if this is a tier milestone (3, 5, 10)
    IF v_new_referral_count IN (3, 5, 10) AND v_tier_bonus > 0 THEN
      UPDATE users SET credits = credits + v_tier_bonus WHERE id = v_referrer_id;
      
      INSERT INTO referral_rewards (user_id, referral_id, reward_type, credits_awarded, tier_at_time, description)
      VALUES (v_referrer_id, v_referral_id, 'tier_bonus', v_tier_bonus, v_new_tier, 'Tier milestone bonus');
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'referral_id', v_referral_id,
    'referrer_credits', 3,
    'referred_credits', 3,
    'new_tier', v_new_tier,
    'tier_bonus', COALESCE(v_tier_bonus, 0)
  );
END;
$$ LANGUAGE plpgsql;

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
