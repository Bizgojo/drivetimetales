BEGIN;

CREATE TABLE IF NOT EXISTS campaigns (
 id UUID PRIMARY KEY,
 name TEXT NOT NULL,
 platform TEXT NOT NULL,
 genre TEXT NOT NULL,
 status TEXT NOT NULL,
 start_date TIMESTAMP,
 end_date TIMESTAMP,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_forecasts (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 trials INTEGER,
 subs INTEGER,
 cac NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_metrics_daily (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 date DATE NOT NULL,
 trials INTEGER,
 subs INTEGER,
 cac NUMERIC,
 spend NUMERIC,
 ctr NUMERIC,
 cpi NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_daily_campaign_date
ON campaign_metrics_daily (campaign_id, date);

CREATE TABLE IF NOT EXISTS campaign_variance (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 summary JSONB,
 diagnostics JSONB,
 charts JSONB,
 root_cause JSONB,
 actions JSONB,
 agent_instructions JSONB,
 timeline JSONB,
 updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_variance_campaign
ON campaign_variance (campaign_id);

CREATE TABLE IF NOT EXISTS agent_logs (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 agent TEXT NOT NULL,
 event_type TEXT NOT NULL,
 event TEXT NOT NULL,
 details JSONB,
 importance INTEGER DEFAULT 1,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_campaign_timestamp
ON agent_logs (campaign_id, created_at);

CREATE TABLE IF NOT EXISTS creative_performance (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 creative_id TEXT,
 finding TEXT,
 delta NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audience_performance (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 audience_id TEXT,
 finding TEXT,
 delta NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_performance (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 stage TEXT,
 finding TEXT,
 delta NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_signals (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 signal TEXT,
 finding TEXT,
 delta NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_signals (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 signal TEXT,
 finding TEXT,
 delta NUMERIC,
 created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timeline_events (
 id UUID PRIMARY KEY,
 campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 timestamp TIMESTAMP NOT NULL,
 created_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
