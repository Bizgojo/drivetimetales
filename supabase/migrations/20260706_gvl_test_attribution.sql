-- ATL-GVL-001: Greenville attribution instrumentation.

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  description TEXT,
  campaign TEXT,
  label TEXT,
  subscription_days INTEGER NOT NULL DEFAULT 14,
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  redeemed_by_email TEXT,
  sent_to_email TEXT,
  sent_to_name TEXT,
  sent_at TIMESTAMPTZ,
  subscription_type TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS subscription_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_redeemed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS redeemed_by_email TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS sent_to_name TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'active';
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_key ON promo_codes (code);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_granted INTEGER NOT NULL DEFAULT 14,
  campaign TEXT,
  label TEXT
);

CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_redemptions (code);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_id_idx ON promo_redemptions (user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_captured_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_promo_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS heard_about_us TEXT;

INSERT INTO promo_codes (
  code,
  description,
  campaign,
  label,
  subscription_days,
  max_uses,
  uses_count,
  is_active,
  is_redeemed,
  subscription_type,
  notes
) VALUES
  ('GVLMETA', 'GVL-TEST-001 Cell A: Meta trial extension', 'gvl-test-001', 'Cell A (Meta)', 14, NULL, 0, true, false, 'active', 'utm_source=meta; utm_medium=paid_social; utm_campaign=gvl-test-001'),
  ('GVLTOK', 'GVL-TEST-001 Cell B: TikTok trial extension', 'gvl-test-001', 'Cell B (TikTok)', 14, NULL, 0, true, false, 'active', 'utm_source=tiktok; utm_medium=paid_social; utm_campaign=gvl-test-001'),
  ('GVLREDDIT', 'GVL-TEST-001 Cell C: Reddit trial extension', 'gvl-test-001', 'Cell C (Reddit)', 14, NULL, 0, true, false, 'active', 'utm_source=reddit; utm_medium=paid_social; utm_campaign=gvl-test-001'),
  ('GVLFB', 'GVL-TEST-001 Cell D: Facebook groups trial extension', 'gvl-test-001', 'Cell D (Facebook groups)', 14, NULL, 0, true, false, 'active', 'utm_source=facebook_groups; utm_medium=social_group; utm_campaign=gvl-test-001')
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  campaign = EXCLUDED.campaign,
  label = EXCLUDED.label,
  subscription_days = 14,
  max_uses = NULL,
  is_active = true,
  subscription_type = 'active',
  notes = EXCLUDED.notes;
