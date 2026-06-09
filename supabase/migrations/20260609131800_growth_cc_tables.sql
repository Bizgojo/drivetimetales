-- Table 1: marketing_assets
CREATE TABLE IF NOT EXISTS marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('copy', 'image', 'video', 'audio_clip', 'email', 'landing_page_variant')),
  platform TEXT CHECK (platform IN ('meta', 'tiktok', 'reddit', 'email', 'landing_page', 'organic_x', 'other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'live', 'retired')),
  campaign_id TEXT,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  storage_url TEXT,
  content_text TEXT,
  notes TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: landing_pages
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'live', 'retired')),
  campaign_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  headline TEXT,
  hero_copy TEXT,
  cta_text TEXT,
  visits INTEGER DEFAULT 0,
  free_story_starts INTEGER DEFAULT 0,
  trial_signups INTEGER DEFAULT 0,
  paid_conversions INTEGER DEFAULT 0,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  live_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 3: fm_waitlist
CREATE TABLE IF NOT EXISTS fm_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  source_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_assets_status ON marketing_assets(status);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_campaign ON marketing_assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status);
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_fm_waitlist_email ON fm_waitlist(email);
